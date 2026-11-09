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
 * um `git add -A` publicava-a. O `--vigiar` volta a confirma-lo antes de cada escrita, e sai 2 sem escrever (#477).
 *
 * SAIDA: 0 gerada; 1 o backlog nao se leu (ou esta vazio): o motivo no stderr, e a vista anterior com a faixa de erro;
 * 1 tambem quando a vista nao se escreveu (o motivo no stderr, e a vista fica como estava); 2 um argumento, o
 * `.gitignore`, ou a lista de areas (`config/areas-do-backlog.mjs`, #465) partida — esta le-se so ao arrancar (mudada a
 * lista, reiniciar o `--vigiar`). Com o `--vigiar` o processo vive com o backlog estragado (diz o motivo no stderr) e,
 * ao sair por um sinal, sai 0 — salvo a recusa do `.gitignore`, que sai 2 (nao escreve a pagina final).
 */
import { readFileSync, writeFileSync, renameSync, watch, existsSync } from "fs";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { leBacklog } from "./lib/backlog-itens.mjs";
import { calcula, ehBacklogVazio } from "./lib/backlog-calculo.mjs";
import { carregaAreas } from "./lib/backlog-areas.mjs";
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
/** `{ erro }` quando a vista se publicava; `{ aviso }` quando nao deu para confirmar; `{}` quando esta fora do repo. */
function foraDoRepo() {
  for (const rel of LINHAS) {
    const ig = spawnSync("git", ["check-ignore", "-q", rel], { cwd: ROOT, encoding: "utf8" });
    if (ig.error) return { aviso: "sem git, nao confirmei que a vista fica fora do repo" };
    if (ig.status === 0) continue;
    if (ig.status === 128 && !dentroDeRepo()) return {};
    // Um estado que o git nao documenta para o check-ignore: avisa, e nao recusa (nao ha como o provocar num teste).
    if (ig.status !== 1) return { aviso: `o \`git check-ignore\` saiu ${ig.status}; nao confirmei que a vista fica fora do repo` };
    const seguido = spawnSync("git", ["ls-files", "--error-unmatch", rel], { cwd: ROOT }).status === 0;
    return {
      erro: seguido
        ? `${rel} esta COMMITADO: tira-o do repo (\`git rm --cached ${rel}\`) — o backlog tem detalhes do projeto`
        : `${rel} nao esta no .gitignore: acrescenta as linhas \`${LINHAS.join("` e `")}\` — sem elas, um \`git add -A\` publicava o backlog`,
    };
  }
  return {};
}
// A lista de areas (#465), no arranque e antes da primeira escrita: partida, sai 2 com o nome do ficheiro (o mesmo
// codigo do `check-backlog`). O `--vigiar` nao a volta a ler.
let AREAS;
try {
  AREAS = await carregaAreas();
} catch (err) {
  fatal(err instanceof Error ? err.message : String(err));
}

// Uma so verificacao, antes de CADA escrita (a primeira e a do arranque): o aviso diz-se uma vez, a recusa sai 2.
let avisado = false;
function confirmaForaDoRepo() {
  const r = foraDoRepo();
  if (r.erro) fatal(`${r.erro} (parei sem escrever)`);
  if (r.aviso && !avisado) console.error(`backlog-board: ${r.aviso}`);
  avisado ||= Boolean(r.aviso);
}

/** Escreve a vista de forma atomica (um temporario e um rename): a pagina a recarregar nunca le um ficheiro a meio. */
function escreve(html) {
  const tmp = `${SAIDA}.tmp`;
  writeFileSync(tmp, html);
  renameSync(tmp, SAIDA);
}

let ultimaBoa = existsSync(SAIDA) ? readFileSync(SAIDA, "utf8") : null;
let geradas = 0;

/** A ultima vista boa com a faixa de erro (substituida, nunca acumulada); sem vista anterior, um esqueleto. */
function vistaDeErro(motivo, vigiar) {
  const msg = `nao consegui ler o backlog (${motivo}) — esta e a ultima vista boa`;
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
  return base.replace(/<body>\n?/, (b) => `${b}${faixa}`);
}

/**
 * Gera a vista; com um backlog que nao se le (ou vazio), a anterior fica, com uma faixa de erro. Devolve o motivo de uma
 * falha (ler ou escrever), ou `null`: sem o `--vigiar`, quem chama sai 1 com ele (#477; antes saia 0, e um script ou um
 * hook nao sabia que a vista era a de ontem).
 */
function gera(vigiar) {
  // A vista so se escreve fora do repo, e o `--vigiar` vive horas: a linha do `.gitignore` pode sair entretanto (#477).
  confirmaForaDoRepo();
  let html;
  let motivo = null;
  try {
    const active = readFileSync(ACTIVE, "utf8");
    // Vazio: o `check-backlog` da um so aviso ("nao encontrado ou vazio") e para; a vista dizia "N avisos" (os
    // cabecalhos, o Resumo...), um numero que ele nunca imprime (#471). E um erro de leitura como os outros, e o
    // predicado e o do verificador (`ehBacklogVazio`, #477).
    if (ehBacklogVazio(active)) {
      motivo = ".agent/context/backlog.md esta vazio — impossivel validar o backlog";
      html = vistaDeErro(motivo, vigiar);
    } else {
      const archive = existsSync(ARCHIVE) ? readFileSync(ARCHIVE, "utf8") : null;
      const nomes = { ACTIVE: ".agent/context/backlog.md", ARCHIVE: ".agent/context/backlog-archive.md" };
      html = geraVista(leBacklog(active, archive), calcula(active, archive, nomes, { areas: AREAS }), { agora: new Date(), vigiar, batida: BATIDA, chave: CHAVE });
      ultimaBoa = html;
    }
  } catch (err) {
    motivo = err instanceof Error ? err.message : String(err);
    html = vistaDeErro(motivo, vigiar);
  }
  if (motivo) console.error(`backlog-board: nao consegui ler o backlog (${motivo}); a vista ficou com a faixa de erro`);
  try {
    escreve(html);
  } catch (err) {
    // Uma escrita falhada (EACCES, disco cheio) nao mata o vigia: diz-se, e a proxima gravacao tenta de novo.
    const msg = `nao consegui escrever a vista (${err instanceof Error ? err.message : String(err)})`;
    console.error(`backlog-board: ${msg}`);
    return msg;
  }
  geradas++;
  console.log(`gerada ${geradas}`);
  return motivo;
}

const falhou = gera(VIGIAR);
if (!VIGIAR) {
  // O motivo ja saiu no stderr; o codigo diz-o a quem corre o CLI de um script.
  if (falhou) process.exit(1);
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
