#!/usr/bin/env node
/**
 * Vista do backlog — {{PROJECT_NAME}}
 *
 * Gera `.agent/backlog-board.html`: uma vista LOCAL e so de leitura do `backlog.md` e do `backlog-archive.md` (#446).
 * Abre-se no browser (um ficheiro, sem servidor e sem rede). A fonte continua a ser o `backlog.md`: mudar um estado e
 * pedi-lo ao agente (o botao "copiar pedido" de cada cartao), que segue o `backlog-method.md`.
 *
 * USO
 *   node .agent/scripts/backlog-board.mjs             gera uma vez
 *   node .agent/scripts/backlog-board.mjs --vigiar    volta a gerar a cada gravacao do backlog, e a pagina recarrega-se
 *        [--espera=<ms>]  o intervalo depois do ultimo evento (300)
 *        [--batida=<ms>]  volta a gerar sem eventos, para a hora (30000; 0 desliga)
 *
 * NUNCA SE PUBLICA: o backlog tem detalhes do projeto. Num repo git em que a vista NAO esta no `.gitignore`, recusa —
 * um `git add -A` publicava-a.
 */
import { readFileSync, writeFileSync, renameSync, watch, existsSync } from "fs";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { leBacklog } from "./lib/backlog-itens.mjs";
import { calcula } from "./lib/backlog-calculo.mjs";
import { geraVista, faixaDeErro, FAIXA_RE } from "./lib/backlog-vista.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTEXTO = join(ROOT, ".agent/context");
const ACTIVE = join(CONTEXTO, "backlog.md");
const ARCHIVE = join(CONTEXTO, "backlog-archive.md");
const SAIDA = join(ROOT, ".agent/backlog-board.html");
const SAIDA_REL = ".agent/backlog-board.html";
const FICHEIROS = new Set(["backlog.md", "backlog-archive.md"]);
// O que a pagina guarda no browser e por projeto: um hash curto da pasta (nao o nome, que fica no disco de quem a abre).
const CHAVE = `vista-${createHash("sha256").update(ROOT).digest("hex").slice(0, 8)}`;

function fatal(msg) {
  console.error(`backlog-board: ${msg}`);
  process.exit(2);
}

// Os argumentos: o que nao se conhece recusa (um `--vigar` mal escrito gerava uma vez e parecia vigiar).
const args = process.argv.slice(2);
const MAX_MS = 2147483647;
const opcao = (nome, omissao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  if (a === undefined) return omissao;
  const v = a.slice(nome.length + 3);
  // So digitos, e no maximo o que um temporizador do Node aceita: `Number("")` e 0 (um `--batida=` desligava-a em
  // silencio), e acima de 2^31-1 ms o Node poe o intervalo a 1 ms (e o vigia escrevia o HTML sem parar).
  if (!/^\d+$/.test(v) || Number(v) > MAX_MS) fatal(`--${nome} quer um inteiro em ms, de 0 a ${MAX_MS}, e nao ${JSON.stringify(v)}`);
  return Number(v);
};
const desconhecidos = args.filter((a) => a !== "--vigiar" && !/^--(espera|batida)=/.test(a));
if (desconhecidos.length) fatal(`argumento desconhecido: ${desconhecidos.join(" ")} (uso: [--vigiar] [--espera=<ms>] [--batida=<ms>])`);
const VIGIAR = args.includes("--vigiar");
const ESPERA = opcao("espera", 300);
const BATIDA = opcao("batida", 30000);
if (!VIGIAR && args.some((a) => /^--(espera|batida)=/.test(a))) fatal("o --espera e o --batida so fazem sentido com o --vigiar");

// Nunca se publica: a vista E o temporario da escrita atomica (um processo morto a meio deixava-o, com o backlog).
// `git check-ignore -q`: 0 ignorado; 1 nao ignorado; 128 um erro (so gera se estiver mesmo fora de um repo). Sem git, gera.
const LINHAS = [SAIDA_REL, `${SAIDA_REL}.tmp`];
const dentroDeRepo = () => spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() === "true";
for (const rel of LINHAS) {
  const ig = spawnSync("git", ["check-ignore", "-q", rel], { cwd: ROOT, encoding: "utf8" });
  if (ig.error) {
    console.error("backlog-board: sem git, nao confirmei que a vista fica fora do repo");
    break;
  }
  if (ig.status === 0) continue;
  if (ig.status === 128 && !dentroDeRepo()) break;
  if (ig.status !== 1) {
    // Um estado que o git nao documenta para o check-ignore: avisa, e nao recusa (nao ha como o provocar num teste).
    console.error(`backlog-board: o \`git check-ignore\` saiu ${ig.status}; nao confirmei que a vista fica fora do repo`);
    break;
  }
  const seguido = spawnSync("git", ["ls-files", "--error-unmatch", rel], { cwd: ROOT }).status === 0;
  fatal(
    seguido
      ? `${rel} esta COMMITADO: tira-o do repo (\`git rm --cached ${rel}\`) — o backlog tem detalhes do projeto`
      : `${rel} nao esta no .gitignore: acrescenta as linhas \`${LINHAS.join("` e `")}\` — sem elas, um \`git add -A\` publicava o backlog`
  );
}

/** Escreve a vista de forma atomica (um temporario e um rename): a pagina a recarregar nunca le um ficheiro a meio. */
function escreve(html) {
  const tmp = `${SAIDA}.tmp`;
  writeFileSync(tmp, html);
  renameSync(tmp, SAIDA);
}

let ultimaBoa = existsSync(SAIDA) ? readFileSync(SAIDA, "utf8") : null;
let geradas = 0;

/** Gera a vista; com um backlog que nao se le, a anterior fica, com uma faixa de erro (substituida, nunca acumulada). */
function gera(vigiar) {
  let html;
  try {
    const active = readFileSync(ACTIVE, "utf8");
    const archive = existsSync(ARCHIVE) ? readFileSync(ARCHIVE, "utf8") : null;
    const nomes = { ACTIVE: ".agent/context/backlog.md", ARCHIVE: ".agent/context/backlog-archive.md" };
    html = geraVista(leBacklog(active, archive), calcula(active, archive, nomes), { agora: new Date(), vigiar, batida: BATIDA, chave: CHAVE });
    ultimaBoa = html;
  } catch (err) {
    const msg = `nao consegui ler o backlog (${err instanceof Error ? err.message : String(err)}) — esta e a ultima vista boa`;
    // A mesma faixa do gerador (o escape dela tem par na varredura, e um caso hostil no `test-backlog-board`).
    const faixa = faixaDeErro(msg);
    // O JSON da vista anterior passa a dizer o erro (sem o "parou", que seria falso) e o modo de AGORA (ao sair, o
    // `--vigiar` deixa de recarregar a pagina mesmo com o backlog ilegivel).
    // Sem vista anterior (a 1.a geracao falhou): um esqueleto com o charset (a mensagem pode ter acentos) e, com o
    // --vigiar, um refresh (nao ha o script da vista para recarregar quando o backlog for corrigido).
    const esqueleto = `<!doctype html><html lang="pt"><head><meta charset="utf-8">${vigiar ? '<meta http-equiv="refresh" content="5">' : ""}<title>Backlog</title></head><body></body></html>`;
    const base = (ultimaBoa ?? esqueleto)
      .replace(FAIXA_RE, "")
      .replace(/"vigiar":(?:true|false)/, `"vigiar":${vigiar}`)
      .replace(/"erro":(?:true|false)/, '"erro":true');
    html = base.replace(/<body>\n?/, (b) => `${b}${faixa}`);
  }
  try {
    escreve(html);
  } catch (err) {
    // Uma escrita falhada (EACCES, disco cheio) nao mata o vigia: diz-se, e a proxima gravacao tenta de novo.
    console.error(`backlog-board: nao consegui escrever a vista (${err instanceof Error ? err.message : String(err)})`);
    return;
  }
  geradas++;
  console.log(`gerada ${geradas}`);
}

gera(VIGIAR);
if (!VIGIAR) {
  console.log(`vista: ${SAIDA_REL} (abrir no browser)`);
} else {
  // Vigia a PASTA, e nao os ficheiros: um editor que grava por copia e rename deixava o watch no inode antigo, e um
  // arquivo que ainda nao existe dava ENOENT. Um evento sem nome (algumas plataformas) volta a gerar.
  let pendente = null;
  const agenda = () => {
    clearTimeout(pendente);
    pendente = setTimeout(() => gera(true), ESPERA);
  };
  const arma = () => {
    let w;
    try {
      w = watch(CONTEXTO, (_ev, nome) => {
        if (!nome || FICHEIROS.has(String(nome))) agenda();
      });
    } catch (err) {
      // A pasta pode ter desaparecido (um checkout a meio): tenta de novo, em vez de morrer.
      console.error(`backlog-board: nao consegui vigiar ${CONTEXTO} (${err instanceof Error ? err.message : String(err)}); a tentar de novo`);
      setTimeout(arma, Math.max(ESPERA, 1000));
      return;
    }
    w.on("error", (err) => {
      console.error(`backlog-board: o watch falhou (${err.message}); a voltar a armar`);
      w.close();
      setTimeout(arma, ESPERA);
    });
  };
  arma();
  if (BATIDA > 0) setInterval(() => gera(true), BATIDA);
  const sai = () => {
    gera(false);
    process.exit(0);
  };
  process.on("SIGINT", sai);
  process.on("SIGTERM", sai);
  console.log("a vigiar");
}
