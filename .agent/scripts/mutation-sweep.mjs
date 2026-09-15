#!/usr/bin/env node
/**
 * Mutation Sweep — {{PROJECT_NAME}}
 *
 * Cobertura de mutacao dos verificadores deste repo.
 *
 * PORQUE EXISTE: uma suite verde nao prova que os testes afirmam algo. Prova-se ao
 * contrario — desligando cada sitio de aviso do verificador, um a um, e exigindo que a
 * suite fique VERMELHA em cada um. Um sitio que pode ser desligado com a suite ainda verde
 * e um aviso que ninguem testa: o gate esta la, mas nao esta ligado a nada.
 *
 * PORQUE E UM SCRIPT e nao uma instrucao em prosa: a versao em prosa trazia o numero de
 * sitios escrito a mao ("47 sitios"). O numero envelheceu na primeira alteracao ao
 * verificador, e a receita ao lado nunca chegava a esse numero — contava `warn(` + `skip(`.
 * Um numero derivado nao envelhece.
 *
 * PORQUE COPIA O REPO: a primeira versao mutava os ficheiros no sitio e restaurava-os no
 * `finally`, com handlers de SIGINT/SIGTERM por seguranca. Nao chega — foi morta por um
 * timeout e DEIXOU um `warn()` desligado no disco. Um handler nao apanha `SIGKILL` nem a
 * morte do grupo de processos, e um verificador mutado na arvore de trabalho e um gate
 * silenciosamente desligado a espera de ser commitado. Agora toda a mutacao acontece numa
 * copia em `os.tmpdir()`: qualquer morte, por brutal que seja, nao pode sujar o repo.
 * (Naquele episodio o que apanhou o defeito foi o `test-guards.mjs` ficar vermelho.)
 *
 * Sem dependencias e sem package.json, como os outros scripts de `.agent/scripts/`.
 *
 *   node .agent/scripts/mutation-sweep.mjs                    # todos os alvos
 *   node .agent/scripts/mutation-sweep.mjs --only=backlog     # so um (ao mexer nele)
 *   node .agent/scripts/mutation-sweep.mjs --list             # so contar, sem correr
 *
 * CUSTO: recorre a suite inteira por sitio. dezenas de sitios = minutos. Correr apos mexer num
 * verificador, nao a cada commit. Opt-in no CI (ver `.github/workflows/ci.yml`).
 *
 * O QUE ESTA VARREDURA **NAO** COBRE, e vale saber antes de confiar nela: ela muta **sitios
 * de aviso** (as chamadas a `warn`/`fatal`/`negar`). As **entradas de tabelas de padroes** —
 * `MARCAS`, `CONTAGENS`, `TEST_GLOBS`, `CONFIG_GLOBS`, `CONFIG_CONTAVEIS` no
 * `check-test-surface.mjs` — nao sao sitios: um padrao que nunca casa nada passa aqui com a
 * suite verde, porque o `warn()` continua a ser disparado por outro padrao da mesma tabela.
 *
 * Isto nao e teorico. Uma excecao escrita numa dessas entradas esteve **morta desde que foi
 * escrita** (duas falhas empilhadas: um `\s*` a recuar a largura zero, e o `semStrings` a
 * apagar o literal citado), com esta varredura verde do principio ao fim. So apareceu quando
 * alguem correu o `/upgrade` num projeto real e levou um aviso onde a excecao prometia
 * silencio.
 *
 * **Consequencia, e e uma obrigacao:** cada entrada de tabela de padroes precisa do **seu
 * caso na suite** — um que exija que ela case, e, se tiver excecao, um que exija que ela
 * exclua. A varredura nao substitui isso.
 *
 * Medido no `check-test-surface.mjs`: das 39 entradas de padrao, **15 podem ser desligadas
 * com a suite verde** (metade sao globs de stacks que este repo nao usa — Python, mocha — e
 * que um projeto derivado usa). Alargar a varredura as entradas e possivel e mecanicamente
 * identico ao que ela ja faz; custa ~7 min por corrida e exige escrever esses 15 casos
 * primeiro, senao ela passa a reprovar de origem.
 */

import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Lista os ficheiros de uma pasta do repo; `[]` se nao existir. */
function listarDir(rel) {
  try {
    return readdirSync(join(ROOT, rel), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

import { PARES } from "./lib/pares.mjs";


const listarSo = process.argv.includes("--list");
// `--only=<parte-do-nome>`: varrer so um verificador. Ao mexer num `check-*.mjs` nao ha
// razao para recorrer as suites dos outros — e a varredura custa minutos por alvo.
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length) : null;

// `--skips`: varrer os sitios `skip()`/`note()` em vez dos `warn()`/`fatal()`.
//
// A varredura normal exclui-os de propósito — um SKIP nao e um achado, e exigir um teste por
// cada um seria estreito de mais para o valor. Mas a regra que este repo repete em dezenas de
// comentarios e **"todo o skip e visivel"**: um guard que deixa de ANUNCIAR que nao correu
// e o `AP2` em forma pura, e nada media se isso era possivel. Este modo mede.
//
// Fica fora do CI e fora da varredura normal: corre-se a mao, ao mexer nos guards. O que
// devolve nao e um veredicto de "esta mal" — e a lista dos sitios que ninguem observa.
const modoSkips = process.argv.includes("--skips");
const SINAL_SKIPS = /(?<![\w.$])(?:skip|note)\(/;

let falhou = false;
// Quantos sitios foram DE FACTO desligados e medidos. Sem esta conta, uma varredura que nao
// mediu nada — `--skips` quando nenhum alvo tem `skip()`, ou um `--only=` que casa um alvo
// sem trabalho — imprimia "Cobertura de mutacao completa" e saia 0. Zero resultados lidos
// como zero problemas e o `AP2`, e ve-lo no proprio script escrito para o combater era o
// defeito mais caro possivel: a frase que toda a gente cita como prova.
let sitiosMedidos = 0;

// DESCOBERTA: `PARES` e mantido a mao, logo um verificador novo entrava no repo sem rede
// nenhuma — e a documentacao afirmava, em quatro sitios, que a varredura o detetava. Nao
// detetava: o ramo `SEM SUITE` so dispara para uma entrada de `PARES` com `suite` nula, o que
// exige que alguem a tenha acrescentado. Isto varre o disco e reprova o que nao esta na lista.
// E o mesmo raciocinio do `ALVO AUSENTE`, na direcao inversa.
if (!only) {
  const noDisco = [
    // A convencao do repo: verificadores sao `check-*.mjs` e os seus modulos vivem em
    // `guards/`. Este ficheiro nao entra na descoberta — ja esta em `PARES`, e incluir-se
    // fazia a sua propria fixture de teste (que substitui `PARES`) reprovar.
    ...listarDir(".agent/scripts").filter((f) => /^check-.*\.mjs$/.test(f)).map((f) => `.agent/scripts/${f}`),
    ...listarDir(".agent/scripts/guards").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/guards/${f}`),
    // `lib/`: modulos partilhados com sitios de recusa proprios (hoje, o registo de suites
    // por descoberta). Sem esta linha um modulo novo ali entrava sem par e sem suite.
    ...listarDir(".agent/scripts/lib").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/lib/${f}`),
    // Os harnesses: decidem o veredicto de todas as suites e estavam fora da descoberta.
    ...listarDir(".agent/scripts").filter((f) => /^test-.*harness\.mjs$/.test(f)).map((f) => `.agent/scripts/${f}`),
    // O `simulate-derived.mjs` nao e um `check-*` nem um harness, mas TEM sitios de recusa
    // (8 `fatal()`) — e escapava a descoberta pelo NOME. A convencao e util mas nao e a
    // verdade: o que faz de um ficheiro um verificador e ter sitios de recusa, nao o prefixo.
    ...listarDir(".agent/scripts").filter((f) => /^simulate-.*\.mjs$/.test(f)).map((f) => `.agent/scripts/${f}`),
    // Os hooks tambem: sao codigo de enforcement com sitios de decisao, e estavam fora da
    // regra que o template impoe a todos os verificadores ("cada um com a sua suite"). Um
    // hook novo sem testes passava sem ninguem notar — e um hook errado e pior que um guard
    // errado, porque corre ANTES de cada ferramenta.
    ...listarDir(".claude/hooks").filter((f) => f.endsWith(".mjs")).map((f) => `.claude/hooks/${f}`),
    // E o `.githooks/`, pela mesma razao: codigo de enforcement que corre antes de um commit
    // ficar escrito. Sem esta linha, um hook novo ali entrava sem par e sem suite — que e o
    // buraco que esta descoberta existe para nao ter. Os ficheiros nao tem extensao (o git
    // exige o nome exacto do evento), logo nao ha filtro por sufixo.
    ...listarDir(".githooks").map((f) => `.githooks/${f}`),
  ];
  const registados = new Set(PARES.map((p) => p.alvo));
  // Um modulo so de DADOS (uma tabela exportada, sem uma unica chamada de recusa) nao tem
  // nada que se desligue: exigir-lhe um par seria pedir um teste de mutacao para um literal.
  // A descoberta existe para apanhar um VERIFICADOR a entrar sem rede — e um ficheiro sem
  // sitio de recusa nao verifica nada. Medido no proprio repo: extrair a tabela `PARES` para
  // `lib/pares.mjs` fazia a descoberta reprova-la, e o unico remedio era registar uma tabela
  // como se fosse um verificador.
  //
  // A isencao vale SO para `.agent/scripts/lib/`. Inferi-la do conteudo em todo o lado era
  // muito pior do que o problema que resolvia: os hooks nao usam `warn(`/`fatal(` nenhum (sao
  // falha-aberta por desenho, e o sitio que decide e um `console.log`), logo os CINCO de
  // `.claude/hooks/` e o `.githooks/commit-msg` passavam todos por "so dados". Hoje escapam
  // por ja estarem em `PARES`, mas um hook NOVO entrava sem par e sem suite — exatamente o
  // buraco que o bloco acima diz existir para fechar, e um hook errado e pior que um guard
  // errado porque corre ANTES de cada ferramenta.
  const RECUSAS = /(?<![\w.$])(?:warn|fatal|flag|deny|problems?\.push|problemas\.push)\(/;
  const semRecusas = (f) => {
    if (!f.startsWith(".agent/scripts/lib/")) return false;
    try {
      const src = readFileSync(join(ROOT, f), "utf8");
      return !src.split("\n").some((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && RECUSAS.test(l));
    } catch {
      return false; // ilegivel: nao e razao para o dispensar
    }
  };
  for (const f of noDisco) {
    if (!registados.has(f) && semRecusas(f)) continue;
    if (!registados.has(f)) {
      console.log(`  SEM PAR  ${f} nao esta em PARES — verificador novo entra sem rede nenhuma`);
      falhou = true;
    }
  }
}

const selecionados = only ? PARES.filter((p) => p.alvo.includes(only)) : PARES;
if (only && selecionados.length === 0) {
  console.log(`  --only=${only} nao casa nenhum alvo. Conhecidos:`);
  for (const p of PARES) console.log(`    ${p.alvo}`);
  // `falhou`, e nao um `process.exit(1)` proprio: um unico mecanismo de reprovacao faz com
  // que a varredura DESTE ficheiro cubra todos os caminhos de reprovacao. Com dois
  // mecanismos ela reportava 4/4 e omitia este em silencio.
  falhou = true;
}

/**
 * Copia do repo onde toda a mutacao acontece. Exclui `.git` (grande e irrelevante),
 * `node_modules` e `.next` (idem). Devolve o caminho, ou null se nao for preciso copiar.
 */
function criarCopia() {
  const dir = mkdtempSync(join(tmpdir(), "mutation-sweep-"));
  const excluir = new Set([".git", "node_modules", ".next", ".DS_Store"]);
  for (const entrada of readdirSync(ROOT)) {
    if (excluir.has(entrada)) continue;
    cpSync(join(ROOT, entrada), join(dir, entrada), { recursive: true });
  }
  return dir;
}

let copia = null;

try {
  if (!listarSo) copia = criarCopia();
  // Se o pre-voo do --only ja reprovou, nao ha alvos para varrer.
  if (selecionados.length === 0) throw { __preflight: true };

  for (const { alvo, suite, sinal: sinalDoPar, neutro, opcional } of selecionados) {
    const sinal = modoSkips ? SINAL_SKIPS : sinalDoPar;
    let src;
    try {
      // Ler SEMPRE do repo real: e o estado que se quer avaliar.
      src = readFileSync(join(ROOT, alvo), "utf8");
    } catch {
      // Assimetria que existia: um `sinal` desatualizado reprovava, um `alvo` desatualizado
      // passava. Renomear um verificador sem tocar em `PARES` deixava o gate verde a
      // afirmar "cobertura completa" — o cenario que a matriz de propagacao quer prevenir.
      // Ausencia so e aceitavel quando o par a declara (verificador que um projeto derivado
      // pode legitimamente nao ter).
      if (opcional) {
        console.log(`  AUSENTE  ${alvo} — declarado opcional, nao existe neste projeto`);
      } else {
        console.log(`  ALVO AUSENTE  ${alvo} nao existe — renomeado ou removido sem atualizar PARES?`);
        falhou = true;
      }
      continue;
    }

    const linhas = src.split("\n");
    // Linhas de COMENTARIO nao sao sitios de aviso. Sem isto, um comentario que MENCIONE o
    // sinal (`... reportados pelo fatal() daqui`) contava como sitio, a mutacao nao mudava
    // comportamento nenhum, a suite ficava verde e a varredura dizia INCOMPLETA — mandava
    // escrever um teste para um sitio que nao existe. Aconteceu de facto neste repo, uma
    // linha depois de eu ter escrito o comentario.
    const comentario = (l) => /^\s*(?:\/\/|\*|\/\*)/.test(l);
    // O conteudo das STRINGS tambem nao e um sitio. Pela mesma razao que um comentario nao
    // e: `skip()` dentro de uma mensagem e texto, nao uma chamada. Medido no modo `--skips`,
    // nesta mesma linha do proprio varredor:
    //   console.log(`  SEM SKIPS  ${alvo}: nao tem sitios skip()/note() — ...`)
    // que era contada como DOIS sitios e reportada como `LINHA AMBIGUA` — um verificador a
    // mandar reescrever a sua propria mensagem de erro.
    //
    // Substitui por espacos em vez de remover: o comprimento fica igual, logo o indice de
    // cada correspondencia serve para mutar a linha ORIGINAL. Sem isso, o `replace` sobre o
    // original podia acertar na ocorrencia dentro da string em vez de na chamada a serio.
    const semStrings = (l) =>
      l.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\\n]|\\.)*`/g, (m) => m[0] + " ".repeat(m.length - 2) + m[m.length - 1]);
    const visiveis = linhas.map((l) => (comentario(l) ? " ".repeat(l.length) : semStrings(l)));
    const sitios = visiveis.map((l, i) => (sinal.test(l) ? i : -1)).filter((i) => i !== -1);

    // `sitios` e indexado por LINHA e o `replace` nao e global, logo duas chamadas de aviso
    // na mesma linha contam como uma: a segunda nunca e desligada isoladamente e herda a
    // cobertura da primeira. Nao ha linhas assim hoje; se aparecerem, o silencio seria pior.
    const global = new RegExp(sinal.source, sinal.flags.includes("g") ? sinal.flags : sinal.flags + "g");
    for (const i of sitios) {
      const n = [...visiveis[i].matchAll(global)].length;
      if (n > 1) {
        console.log(`  LINHA AMBIGUA  ${alvo}:${i + 1} tem ${n} avisos na mesma linha — separa-los para cada um ser medido`);
        falhou = true;
      }
    }

    if (sitios.length === 0) {
      // Nao e um "nada a fazer": o verificador existe e reprova de alguma forma. Zero
      // correspondencias significa que o `sinal` deste par esta desatualizado, e varrer
      // zero sitios reportando sucesso seria o mesmo erro que o script combate.
      if (modoSkips) {
        console.log(`  SEM SKIPS  ${alvo}: nao tem sitios skip()/note() — nada a medir neste modo`);
        continue;
      }
      console.log(`  SINAL ERRADO  ${alvo}: o padrao ${sinal} nao casa nada — atualizar PARES`);
      falhou = true;
      continue;
    }

    if (!suite) {
      console.log(`  SEM SUITE  ${alvo}: ${sitios.length} sitios de aviso e NENHUM teste.`);
      console.log(`             Um verificador nao verificado nao da confianca — da a aparencia dela.`);
      falhou = true;
      continue;
    }

    if (listarSo) {
      console.log(`  ${alvo}: ${sitios.length} sitios (suite: ${suite})`);
      continue;
    }

    const alvoCopia = join(copia, alvo);
    const suiteCopia = join(copia, suite);

    // Baseline: a suite tem de estar VERDE antes de comecar, senao todo o resultado e ruido
    // (cada mutacao "ficaria vermelha" por uma razao que nao tem nada a ver com ela).
    writeFileSync(alvoCopia, src);
    try {
      execFileSync("node", [suiteCopia], { cwd: copia, stdio: "pipe" });
    } catch {
      console.log(`  BASELINE VERMELHA  ${suite} ja falha sem mutacao — corrigir antes de varrer`);
      falhou = true;
      continue;
    }

    const naoCobertos = [];
    for (const i of sitios) {
      const mut = [...linhas];
      // Mutar pelo INDICE achado na linha sem strings, e nao por `replace` sobre a original:
      // assim a substituicao acerta sempre na chamada e nunca num literal de texto.
      const m = visiveis[i].match(sinal);
      mut[i] = linhas[i].slice(0, m.index) + neutro + linhas[i].slice(m.index + m[0].length);
      writeFileSync(alvoCopia, mut.join("\n"));
      let vermelha = false;
      try {
        execFileSync("node", [suiteCopia], { cwd: copia, stdio: "pipe" });
      } catch {
        vermelha = true;
      }
      if (!vermelha) naoCobertos.push({ ln: i + 1, txt: linhas[i].trim().slice(0, 90) });
    }
    writeFileSync(alvoCopia, src); // deixar a copia limpa para o alvo seguinte

    if (naoCobertos.length) {
      console.log(`  INCOMPLETA  ${alvo}: ${sitios.length - naoCobertos.length}/${sitios.length} sitios cobertos`);
      for (const { ln, txt } of naoCobertos) console.log(`              L${ln}: ${txt}`);
      falhou = true;
    } else {
      console.log(`  OK  ${alvo}: ${sitios.length}/${sitios.length} sitios — cada aviso fica vermelho`);
    }
    sitiosMedidos += sitios.length;
  }
} catch (err) {
  // Sentinela do pre-voo: sai pelo caminho normal (o `process.exit(falhou...)` no fim).
  if (!err || err.__preflight !== true) throw err;
} finally {
  // Um temp dir esquecido e inofensivo (ao contrario de um verificador mutado no repo),
  // por isso a limpeza e best-effort e nunca mascara o resultado.
  if (copia) {
    try {
      rmSync(copia, { recursive: true, force: true });
    } catch {}
  }
}

// M1: `--list` NAO descarta o veredicto. Descartava, e `--list --only=nao-existe` (ou
// --list com um SINAL ERRADO, ou com um alvo sem suite) saia 0 a reportar um problema. Os
// testes existentes cobriam cada flag isolada, nunca a combinacao.
if (listarSo) process.exit(falhou ? 1 : 0);
// A causa nao se afirma aqui: pode ser um aviso sem teste, um alvo ausente, um `sinal`
// desatualizado, uma baseline vermelha ou uma linha ambigua. As linhas acima dizem qual.
if (!falhou && sitiosMedidos === 0) {
  // Nada correu mal E nada foi medido. Dizer "completa" seria afirmar o que nao se mediu.
  console.log(
    `\n  NADA MEDIDO — nenhum sitio foi desligado${modoSkips ? " (modo --skips)" : ""}${only ? ` (--only=${only})` : ""}.` +
      `\n  Isto NAO e cobertura completa: e uma varredura sem trabalho. Verificar o filtro,` +
      `\n  ou o \`sinal\` do par, antes de ler este resultado como sucesso.\n`
  );
  // `falhou = true` e nao um `process.exit(1)` proprio: assim este sitio de recusa e do mesmo
  // tipo que os outros deste ficheiro, e a varredura (que varre este ficheiro com o sinal
  // `falhou = true;`) exige-lhe um teste como a qualquer outro.
  falhou = true;
}
console.log(
  falhou
    ? "\n  VARREDURA NAO CONCLUSIVA — ver as linhas acima.\n"
    : `\n  Cobertura de mutacao completa — ${sitiosMedidos} sitios medidos.\n`
);
process.exit(falhou ? 1 : 0);
