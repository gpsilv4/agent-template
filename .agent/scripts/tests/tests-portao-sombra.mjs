/**
 * A SOMBRA do plano no portao `Guard Tests` (#347, C1), corrida como o runner a corre.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * Num PR com a varredura verde, o portao calcula o plano da varredura a partir do commit BASE (`lib/plano-ci.mjs`,
 * copiado sozinho) e exige que CONCORDE com o que os shards decidiram. Le-se o passo REAL do `ci.yml` (o
 * extractor do `tests-portao-ci.mjs`) e corre-se com `bash -e` (e um caso SEM o `-e`, #372) num repo git de fixture com DOIS commits: a base ja
 * tem o `varredura-shards.mjs` e o `plano-ci.mjs` reais (os da arvore de trabalho), e o HEAD muda so o que cada
 * caso diz — por isso um caso "so docs" chega a `false`, e o plano que corre e o da base.
 *
 * As linhas `sombra: concorda` e `sombra: desligada` afirmam-se nos DOIS sentidos: a medicao do C2 le-as, e um
 * "desligada" contado como "concorda" provava o que nao aconteceu.
 */
import { pathToFileURL } from "url";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { passoDoPortao } from "./tests-portao-ci.mjs";
import { correCorpo, gitEm } from "./harness/repo-descartavel.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-portao-sombra.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const PLANO = ".agent/scripts/lib/plano-ci.mjs";
const SHARDS = ".agent/scripts/lib/varredura-shards.mjs";
/** O que o `varredura-shards` importa (#373): a fixture copia-o com ele, senao cada caso rebentava no import. */
const EH_MAIN = ".agent/scripts/lib/eh-main.mjs";
/** Um plano que responde sempre `false` (o PR a tentar mudar a regra), e um que responde outra coisa. */
const PLANO_NUNCA = 'console.log("false");\n';
const PLANO_QUE_MENTE = 'console.log("talvez");\n';

/** Os relatorios dos 3 shards: todos aplicaveis, com as contas certas, ou todos "nao aplicavel". */
function relatorios(aplicavel) {
  const r = (modo, k, n, total, medidos) => (aplicavel ? { modo, k, n, total, medidos, aplicavel } : { modo, k, n, aplicavel });
  return [r("completa", 1, 2, 10, 6), r("completa", 2, 2, 10, 4), r("skips", 1, 1, 3, 3)];
}

/**
 * Corre o `corpo` num repo de fixture. `o.head`: o que o HEAD muda — "maquinaria", "docs", "renomeia" (com o
 * conteudo identico, para a deteccao de renomeacoes do git disparar), ou nada (`semPai`: so um commit).
 * `o.basePlano`: o conteudo do plano na base (`null` = a base nao o tem); `o.headPlano`: o do HEAD, se mudar.
 * @returns {{code: number, out: string}}
 */
function corre(corpo, env, o, { semE = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "portao-sombra-test-"));
  try {
    const repo = join(dir, "repo");
    const escreve = (rel, txt) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), txt); };
    mkdirSync(repo);
    cpSync(join(ROOT, SHARDS), join(repo, SHARDS), { recursive: true });
    cpSync(join(ROOT, EH_MAIN), join(repo, EH_MAIN));
    if (o.basePlano !== null) escreve(PLANO, o.basePlano);
    escreve(".agent/scripts/x.mjs", "export const x = 1;\n");
    escreve("src/docs/a.md", "# a\n");
    const git = gitEm(repo);
    git(["init", "-q"]);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "base"]);
    if (!o.semPai) {
      if (o.head === "maquinaria") escreve(".agent/scripts/x.mjs", "export const x = 2;\n");
      if (o.head === "docs") escreve("src/docs/a.md", "# a, mudado\n");
      if (o.head === "renomeia") git(["mv", ".agent/scripts/x.mjs", "x-fora.mjs"]);
      if (o.headPlano !== undefined) escreve(PLANO, o.headPlano);
      git(["add", "-A"]);
      git(["commit", "-q", "-m", "head"]);
    }
    const pasta = join(dir, "varredura");
    mkdirSync(pasta);
    relatorios(o.aplicavel).forEach((r, i) => writeFileSync(join(pasta, `r${i}.json`), JSON.stringify(r)));
    // Um `VARREDURA_PLANO` de quem corre os testes nao entra: e o caso que o `unset` do portao cobre, e o
    // `herdado` abaixo testa-o de proposito.
    return correCorpo(corpo, { cwd: repo, env, runnerTemp: dir, semE, semVars: ["VARREDURA_PLANO"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PR = { SUITES: "success", VARREDURA: "success", EVENTO: "pull_request", PRIVADO: "false", COMMITTER: "" };
/** O texto do job `id` do `ci.yml`, ate ao job SEGUINTE, qualquer que seja (#372 A8, `TP15`): ate ao `simulators:`
 *  assumia a ordem do template, e num derivado (sem esse job) ia ate ao fim do ficheiro. Sem o job: `""`. */
export function fatiaDoJob(ci, id) {
  const ini = ci.indexOf(`\n  ${id}:\n`);
  if (ini < 0) return "";
  const prox = ci.slice(ini + 1).search(/\n  [\w-]+:[ \t]*(?:#.*)?\n/);
  return prox < 0 ? ci.slice(ini) : ci.slice(ini, ini + 1 + prox);
}

/** A recusa do `varredura-shards` quando o plano e os shards discordam. Cada vermelho afirma-se pela SUA mensagem
 *  (#372 A4): so o exit deixava passar um vermelho por outra razao — apagado o `case` do portao, o "talvez" ainda
 *  reprovava, no `planoDe`. */
const DISCORDA = "decidiu o contrario";
const CONCORDA = "sombra: concorda";
const DESLIGADA = "sombra: desligada";

export function registar() {
  const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
  const ci = lerRaiz(".github/workflows/ci.yml");
  const passo = ci === null ? null : passoDoPortao(ci);
  const temSombra = passo !== null && /VARREDURA_PLANO/.test(passo.corpo);
  // Um derivado que trouxe os scripts sem o portao novo (adotar e opcional): nada a testar aqui.
  if (!temSombra && ehDerivado(lerRaiz)) {
    console.log("  SKIP  portao: o ci.yml deste projeto nao tem a sombra do plano no portao `Guard Tests` (#347, opcional)");
    registarResultado("portao: sem a sombra num derivado, nada a medir (#347)", []);
    return;
  }
  registarResultado("portao: o shell do portao tem a sombra do plano (#347)", temSombra ? [] : ["o corpo do portao nao tem o `VARREDURA_PLANO`"]);
  if (!temSombra) return;
  const plano = lerRaiz(PLANO);
  const casos = [
    { nome: "maquinaria tocada e os shards mediram: verde, e concorda", env: PR, o: { head: "maquinaria", aplicavel: true, basePlano: plano }, verde: true, tem: `${CONCORDA} (plano=true)`, sem: DESLIGADA },
    { nome: "maquinaria tocada e os shards disseram \"nao aplicavel\": vermelho", env: PR, o: { head: "maquinaria", aplicavel: false, basePlano: plano }, verde: false, diz: DISCORDA },
    { nome: "so docs e os shards disseram \"nao aplicavel\": verde, e concorda", env: PR, o: { head: "docs", aplicavel: false, basePlano: plano }, verde: true, tem: `${CONCORDA} (plano=false)`, sem: DESLIGADA },
    { nome: "so docs e os shards mediram: vermelho", env: PR, o: { head: "docs", aplicavel: true, basePlano: plano }, verde: false, diz: DISCORDA },
    // O MESMO diff do `sweep` (com renomeacoes): o destino fora da maquinaria e o unico caminho listado.
    { nome: "um ficheiro renomeado para fora da maquinaria, \"nao aplicavel\": verde (o diff do `sweep`)", env: PR, o: { head: "renomeia", aplicavel: false, basePlano: plano }, verde: true, tem: `${CONCORDA} (plano=false)` },
    // O PR muda o seu proprio plano para "nunca": o portao le o da BASE, e a maquinaria tocada discorda.
    { nome: "o plano do PR mudado para \"nunca\" nao conta: le-se o da base (vermelho)", env: PR, o: { head: "maquinaria", aplicavel: false, basePlano: plano, headPlano: PLANO_NUNCA }, verde: false, diz: DISCORDA },
    { nome: "um plano que responde outra coisa que true/false: vermelho", env: PR, o: { head: "maquinaria", aplicavel: true, basePlano: PLANO_QUE_MENTE }, verde: false, diz: "o plano da base respondeu" },
    { nome: "um HEAD sem pai: vermelho", env: PR, o: { semPai: true, aplicavel: true, basePlano: plano }, verde: false, diz: "Needed a single revision" },
    { nome: "a base sem o plano: a sombra desliga-se, e di-lo", env: PR, o: { head: "docs", aplicavel: false, basePlano: null }, verde: true, tem: DESLIGADA, sem: CONCORDA },
    // Um `push` com a varredura verde (um derivado que tirou o `if:` do `sweep`): se o plano corresse, discordava.
    { nome: "um push com a varredura verde: sem plano, como antes", env: { ...PR, EVENTO: "push" }, o: { head: "maquinaria", aplicavel: false, basePlano: plano }, verde: true, sem: "sombra:" },
    // Um `VARREDURA_PLANO` herdado de cima (as duas leituras do C1): sem o `unset`, este push dizia "concorda".
    { nome: "um VARREDURA_PLANO herdado nao conta: o push continua sem sombra", env: { ...PR, EVENTO: "push", VARREDURA_PLANO: "false" }, o: { head: "maquinaria", aplicavel: false, basePlano: plano }, verde: true, sem: "sombra:" },
  ];
  // O `fetch-depth: 2` do checkout do portao: tira-lo dava vermelho no CI (o `HEAD^1`), mas nunca aqui (a fixture
  // tem a historia toda) — fica fixado pelo texto (leitura 1 do C1).
  const gate = fatiaDoJob(ci, "guard-gate");
  // O controlo da fatia: num `ci.yml` sem `simulators` (a forma de um derivado), o `fetch-depth` do job SEGUINTE nao
  // pode contar como o do `guard-gate` — a fatia antiga, ate ao `simulators:`, ia ate ao fim e encontrava-o.
  const sintetico = "jobs:\n  guard-gate:\n    steps:\n      - uses: actions/checkout@v7\n  secret-scan:\n    steps:\n      - uses: actions/checkout@v7\n        with:\n          fetch-depth: 2\n";
  registarResultado("portao: a fatia do `guard-gate` acaba no job seguinte, sem `simulators` (#372)", /fetch-depth/.test(fatiaDoJob(sintetico, "guard-gate")) ? ["a fatia apanhou o `fetch-depth` do job seguinte"] : []);
  registarResultado("portao: o checkout do portao traz a base (`fetch-depth: 2`) (#347)", /- uses: actions\/checkout@\S+\n\s+with:\n\s+fetch-depth: 2\n/.test(gate) ? [] : ["o checkout do `guard-gate` nao tem `fetch-depth: 2`"]);
  for (const c of casos) {
    const r = corre(passo.corpo, c.env, c.o);
    registarResultado(`portao: ${c.nome} (#347)`, [
      ...((r.code === 0) === c.verde ? [] : [`esperava ${c.verde ? "verde" : "vermelho"}, saiu ${r.code}: ${r.out.trim().split("\n").slice(-2).join(" | ")}`]),
      ...(c.tem && !r.out.includes(c.tem) ? [`faltou a linha "${c.tem}"`] : []),
      ...(c.sem && r.out.includes(c.sem) ? [`nao devia ter "${c.sem}"`] : []),
      ...(c.diz && !r.out.includes(c.diz) ? [`o vermelho nao foi o esperado: faltou "${c.diz}"`] : []),
    ]);
  }

  // O portao falha fechado POR SI (#372 A2): um `defaults: run: shell:` sem `-e` num derivado punha-o verde com
  // os shards a reprovar. Corre-se SEM o `-e` do runner, e o controlo tira a primeira linha (o `set -eu`) e tem
  // de ficar verde — senao o caso nao mede nada.
  const SET = /^set -eu\n/;
  const vermelho = { head: "maquinaria", aplicavel: false, basePlano: plano };
  if (!SET.test(passo.corpo) && ehDerivado(lerRaiz)) {
    console.log("  SKIP  portao: o portao deste projeto nao abre com `set -eu` (#372: vem com o shell do portao, se o projeto o adotar)");
    registarResultado("portao: sem o `set -eu` num derivado, nada a medir (#372)", []);
  } else {
    const r = corre(passo.corpo, PR, vermelho, { semE: true });
    registarResultado("portao: sem o `-e` do runner, os shards a discordar continuam vermelhos (#372)", [
      ...(SET.test(passo.corpo) ? [] : ["o corpo do portao nao abre com `set -eu`"]),
      ...(r.code !== 0 && r.out.includes(DISCORDA) ? [] : [`esperava vermelho com "${DISCORDA}", saiu ${r.code}`]),
    ]);
    const semSet = corre(passo.corpo.replace(SET, ""), PR, vermelho, { semE: true });
    registarResultado("portao: o mesmo corpo sem o `set -eu` e sem o `-e` fica verde (controlo, #372)", semSet.code === 0 ? [] : [`o controlo saiu ${semSet.code}: o caso acima nao prova o \`set -eu\``]);
  }
}
