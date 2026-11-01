/**
 * O mesmo nome de check ENTRE workflows, de ponta a ponta pelo `check-test-surface` (#355) — {{PROJECT_NAME}}
 *
 * Uma protecao exige checks pelo NOME: um job noutro workflow com o nome de um portao (`name: Guard Tests` +
 * `echo ok`) da-a por satisfeita. Os casos puros (as formas de YAML) estao no `tests-estrutura-workflow.mjs`;
 * aqui fica o que so se ve com o verificador inteiro: o workflow NOVO, o lado do `ci.yml`, a colisao que ja
 * existia, a renomeacao, e a falha fechada quando nao ha lista. Modulo proprio porque o `tests-surface-gate.mjs`
 * (389 linhas) passava das 430 com eles.
 *
 * NAO e um entry point: o `test-test-surface.mjs` descobre-o em disco e chama `registar()`.
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, registarResultado } from "./harness/test-surface-harness.mjs";
import { verificaGate } from "../lib/superficie-gate.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-colisoes.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

const W = ".github/workflows/";
const PORTAO = (nome = "Guard Tests") => `on: pull_request\njobs:\n  guard:\n    name: ${nome}\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/tests/test-guards.mjs\n`;
const FALSO = (nome) => `on: pull_request\njobs:\n  fake:\n    name: ${nome}\n    runs-on: y\n    steps:\n      - run: echo ok\n`;
const MSG = "mesmo nome de check";

/** Commita os workflows de `antes`, aplica `depois` (e o `mv`, renomeado com o git) e commita com `msg`. */
const passos = (dir, antes, depois = {}, mv = null, msg = "depois") => {
  const escreve = (f, t) => { mkdirSync(dirname(join(dir, W, f)), { recursive: true }); writeFileSync(join(dir, W, f), t); };
  for (const [f, t] of Object.entries(antes)) escreve(f, t);
  commit(dir, "antes");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  for (const [f, t] of Object.entries(depois)) escreve(f, t);
  if (mv) git(dir, ["mv", join(W, mv[0]), join(W, mv[1])]);
  commit(dir, msg);
  return ref;
};

/** O CI com o portao agregador (#420): as suites e o `guard-gate`, que le o resultado delas e e o check exigido. */
const SUITES_RUN = "      - run: node .agent/scripts/tests/test-guards.mjs\n";
const GATE = ({ suites = "Guard Suites", portao = "Guard Tests", idPortao = "guard-gate", cabSuites = "", passo = SUITES_RUN, mais = "" } = {}) =>
  `on: pull_request\njobs:\n  guard-tests:\n    name: ${suites}\n${cabSuites}    runs-on: y\n    steps:\n${passo}` +
  `  ${idPortao}:\n    name: ${portao}\n    needs: [guard-tests]\n    if: always()\n    runs-on: y\n    steps:\n` +
  "      - run: test \"${{ needs.guard-tests.result }}\" = success\n" + mais;
const JOB = (id, nome, run = "\"true\"") => `  ${id}:\n    name: ${nome}\n    runs-on: y\n    steps:\n      - run: ${run}\n`;

export function registar() {
  const NOVO = `${W}x.yml: o job \`fake\` tem o mesmo nome de check, \`Guard Tests\`, que o job \`guard\` (portao) de \`${W}ci.yml\``;
  const DA_SUB = `${W}fake.yml: o job \`fake\` tem o mesmo nome de check, \`Guard Tests\`, que o job \`guard\` (portao) de \`${W}ci.yml\``;
  const PARTIDO = "on: pull_request\njobs:\n  fake:\n    needs: nada\n    runs-on: y\n    steps:\n      - run: echo ok\n";
  const BUILD = (q) => (q ? PORTAO("Build").replace("node .agent/scripts/tests/test-guards.mjs", q) : PORTAO("Build"));
  const DO_CI = `${W}ci.yml: o job \`guard\` (portao) tem o mesmo nome de check, \`Deploy\`, que o job \`fake\` de \`${W}x.yml\``;
  for (const [nome, antes, depois, mv, { code, includes, excludes }] of [
    ["um workflow novo com o nome do portao avisa", { "ci.yml": PORTAO() }, { "x.yml": FALSO("Guard Tests") }, null, { code: 1, includes: [NOVO] }],
    ["um workflow novo com outro nome fica calado (controlo)", { "ci.yml": PORTAO() }, { "x.yml": FALSO("Outra") }, null, { code: 0, excludes: [MSG] }],
    ["a colisao que ja existia na base fica calada (so os novos)", { "ci.yml": PORTAO(), "x.yml": FALSO("Guard Tests") }, { "x.yml": FALSO("Guard Tests") + "      - run: echo mais\n" }, null, { code: 0, excludes: [MSG] }],
    ["o portao do `ci.yml` renomeado para um nome de outro ficheiro avisa pela entrada do `ci.yml`", { "ci.yml": PORTAO(), "x.yml": FALSO("Deploy") }, { "ci.yml": PORTAO("Deploy") }, null, { code: 1, includes: [DO_CI], excludes: [`de \`${W}ci.yml\``] }],
    ["mudar o portao do `ci.yml` sem colisao fica calado (o proprio ficheiro nao conta)", { "ci.yml": PORTAO() }, { "ci.yml": PORTAO() + "      - run: echo mais\n" }, null, { code: 0, excludes: [MSG] }],
    ["um workflow NOVO que e portao, sem homonimo, fica calado (o proprio ficheiro nao conta)", { "ci.yml": PORTAO() }, { "y.yml": PORTAO("Outro Portao") }, null, { code: 0, excludes: [MSG] }],
    ["mover de uma subpasta para a raiz um job com o nome do portao avisa (o GitHub passa a corre-lo)", { "ci.yml": PORTAO(), "sub/fake.yml": FALSO("Guard Tests") }, {}, ["sub/fake.yml", "fake.yml"], { code: 1, includes: [DA_SUB] }],
    ["`git mv` de um workflow com um defeito interno antigo fica calado (compara com a origem)", { "x.yml": PARTIDO }, {}, ["x.yml", "y.yml"], { code: 0, excludes: ["nao existe"] }],
    ["`git mv` que introduz um defeito interno avisa (controlo)", { "x.yml": FALSO("A") }, { "x.yml": PARTIDO }, ["x.yml", "y.yml"], { code: 1, includes: ["`needs: nada`"] }],
    ["o `Build` repetido sem portao, que ganha a maquinaria nos DOIS ficheiros no mesmo PR, avisa (o antes contra a base)", { "ci.yml": BUILD("echo ok"), "deploy.yml": BUILD("echo ok") }, { "ci.yml": BUILD(), "deploy.yml": BUILD() }, null, { code: 1, includes: ["tem o mesmo nome de check, `Build`"] }],
    ["um portao numa subpasta (o GitHub nao a corre) nao conta", { "sub/ci.yml": PORTAO() }, { "x.yml": FALSO("Guard Tests") }, null, { code: 0, excludes: [MSG] }],
    ["`git mv` de um workflow com uma colisao antiga fica calado", { "ci.yml": PORTAO(), "x.yml": FALSO("Guard Tests") }, {}, ["x.yml", "y.yml"], { code: 0, excludes: [MSG] }],
  ]) {
    test(`colisoes (#355): ${nome}`, (dir) => passos(dir, antes, depois, mv), { code, includes, excludes });
  }

  // O NOME de check de um portao (#420): o ruleset exige `Guard Tests` pelo nome. Renomear o portao e dar o nome
  // antigo a um job falso satisfazia-o sem aviso: o `name:` e uma chave inofensiva do cabecalho, e nada o comparava.
  const NOME = (id, a, b) => `o nome de check do job portao \`${id}\` mudou de \`${a}\` para \`${b}\` — a protecao exige checks pelo nome`;
  const AGG = NOME("guard-gate", "Guard Tests", "Guard Tests (agg)");
  const RENOMEADO = GATE({ portao: "Guard Tests (agg)", mais: JOB("fake", "Guard Tests") });
  const TRAILER = `depois\n\nTest-Surface: ${W}ci.yml — o portao renomeado de proposito`;
  const ANTIGO = "on: pull_request\njobs:\n  guard-tests:\n    name: Guard Tests\n    runs-on: y\n    steps:\n" + SUITES_RUN;
  const COM_NOME = (n) => `      - name: ${n}\n        run: node .agent/scripts/tests/test-guards.mjs\n`;
  for (const [nome, antes, depois, msg, { code, includes, excludes }] of [
    ["o portao renomeado e um job novo com o nome antigo, no mesmo ficheiro, avisam (o cenario do issue)", { "ci.yml": GATE() }, { "ci.yml": RENOMEADO }, undefined,
      { code: 1, includes: [AGG, "e `Guard Tests` e agora o nome do job `fake` deste ficheiro"] }],
    ["o portao renomeado e o job falso num workflow NOVO avisam", { "ci.yml": GATE() }, { "ci.yml": GATE({ portao: "Guard Tests (agg)" }), "x.yml": FALSO("Guard Tests") }, undefined,
      { code: 1, includes: [AGG, `e \`Guard Tests\` e agora o nome do job \`fake\` de \`${W}x.yml\``] }],
    ["o padrao do #316 (as suites renomeadas, um agregador novo com o nome) avisa pelo nome, nao pelo cabecalho", { "ci.yml": ANTIGO }, { "ci.yml": GATE() }, undefined,
      { code: 1, includes: [NOME("guard-tests", "Guard Tests", "Guard Suites"), "e `Guard Tests` e agora o nome do job `guard-gate` deste ficheiro"], excludes: ["o cabecalho do job"] }],
    ["o `name:` e o `if:` mudados juntos dizem as duas causas", { "ci.yml": GATE() }, { "ci.yml": GATE({ suites: "Outras", cabSuites: "    if: false\n" }) }, undefined,
      { code: 1, includes: [NOME("guard-tests", "Guard Suites", "Outras"), "o cabecalho do job `guard-tests` mudou"] }],
    ["com o trailer passa a nota, e a nota continua a mostrar o job falso", { "ci.yml": GATE() }, { "ci.yml": RENOMEADO }, TRAILER,
      { code: 0, includes: [AGG, "`fake` deste ficheiro", "aceite (Test-Surface: o portao renomeado de proposito)"] }],
    ["o `name:` de um job SEM maquinaria fica calado (o gate nao alarga)", { "ci.yml": GATE({ mais: JOB("quality", "Code Quality") }) }, { "ci.yml": GATE({ mais: JOB("quality", "X") }) }, undefined,
      { code: 0, excludes: ["nome de check do job portao"] }],
    ["o `name:` de um PASSO com maquinaria que muda ja avisava (o passo), sem ser o nome de check", { "ci.yml": GATE({ passo: COM_NOME("a") }) }, { "ci.yml": GATE({ passo: COM_NOME("b") }) }, undefined,
      { code: 1, includes: ["passo da maquinaria mudou ou saiu"], excludes: ["nome de check do job portao"] }],
    ["trocar o id do portao e dar o antigo ao job falso avisa, e diz que o id deixou de ser portao", { "ci.yml": GATE() },
      { "ci.yml": GATE({ idPortao: "real-gate", portao: "Guard Tests (agg)", mais: JOB("guard-gate", "Guard Tests") }) }, undefined,
      { code: 1, includes: ["passo da maquinaria mudou ou saiu: o job guard-gate (agrega", "o job `guard-gate` deixou de ser portao e continua a dar o check `Guard Tests`"] }],
    ["o nome partido numa linha de continuacao, com o falso numa expressao, avisa (a leitura adversarial)", { "ci.yml": GATE() },
      { "ci.yml": GATE({ portao: "Guard Tests\n      (agg)", mais: JOB("fake", "${{ 'Guard Tests' }}") }) }, undefined,
      { code: 1, includes: ["mudou de `Guard Tests` para (nao literal ou de matriz: `name: Guard Tests (agg)`)"] }],
    ["um `name: >-` com o bloco mudado avisa", { "ci.yml": GATE({ portao: ">-\n      Guard Tests" }) }, { "ci.yml": GATE({ portao: ">-\n      Guard Tests (agg)" }) }, undefined,
      { code: 1, includes: ["de (nao literal ou de matriz: `name: >- Guard Tests`) para (nao literal ou de matriz: `name: >- Guard Tests (agg)`)"] }],
    ["o portao com o id mudado e o nome antigo noutro workflow: diz que saiu, e quem ficou com o nome", { "ci.yml": GATE() },
      { "ci.yml": GATE({ idPortao: "real-gate", portao: "Guard Tests (agg)" }), "x.yml": FALSO("guard tests") }, undefined,
      { code: 1, includes: [`o job portao \`guard-gate\` (check \`Guard Tests\`) saiu deste workflow — a protecao exige checks pelo nome — e \`Guard Tests\` e agora o nome do job \`fake\` de \`${W}x.yml\``] }],
    ["um `#` dentro das aspas do nome nao esconde o rename", { "ci.yml": GATE({ portao: "\"Gate #1\"" }) }, { "ci.yml": GATE({ portao: "\"Gate #2\"", mais: JOB("fake", "\"Gate #1\"") }) }, undefined,
      { code: 1, includes: ["mudou de `Gate #1` para `Gate #2`", "e `Gate #1` e agora o nome do job `fake` deste ficheiro"] }],
    ["o escape `''` nas aspas simples, com o falso num bloco, avisa (a terceira leitura)", { "ci.yml": GATE() },
      { "ci.yml": GATE({ portao: "'Guard Tests'' (agg)'", mais: JOB("fake", ">-\n      Guard Tests") }) }, undefined,
      { code: 1, includes: [NOME("guard-gate", "Guard Tests", "Guard Tests' (agg)")] }],
    ["uma linha em branco acrescentada dentro de um nome em bloco avisa", { "ci.yml": GATE({ portao: ">-\n      Guard\n      Tests" }) },
      { "ci.yml": GATE({ portao: ">-\n      Guard\n\n      Tests" }) }, undefined,
      { code: 1, includes: ["o nome de check do job portao `guard-gate` mudou de (nao literal"] }],
    ["um `#` dentro de um nome em bloco e texto: o rename avisa (a quarta leitura)", { "ci.yml": GATE({ portao: ">-\n      Gate #1" }) },
      { "ci.yml": GATE({ portao: ">-\n      Gate #2" }) }, undefined,
      { code: 1, includes: ["o nome de check do job portao `guard-gate` mudou de (nao literal"] }],
    ["so as aspas no nome, com o mesmo valor, ficam caladas", { "ci.yml": GATE() }, { "ci.yml": GATE({ portao: "\"Guard Tests\"" }) }, undefined,
      { code: 0, excludes: ["nome de check do job portao"] }],
    ["uma matriz acrescentada ao portao muda o check, e avisa pelo nome", { "ci.yml": GATE() }, { "ci.yml": GATE({ cabSuites: "    strategy:\n      matrix:\n        x: [a]\n" }) }, undefined,
      { code: 1, includes: ["o nome de check do job portao `guard-tests` mudou de `Guard Suites` para (nao literal ou de matriz: `name: Guard Suites`)"] }],
  ]) {
    test(`nome de check (#420): ${nome}`, (dir) => passos(dir, antes, depois, null, msg), { code, includes, excludes });
  }
  test("nome de check (#420): o `ci.yml` renomeado (`git mv`) com o portao renomeado le o destino", (dir) => passos(dir, { "ci.yml": GATE() }, { "ci.yml": RENOMEADO }, ["ci.yml", "ci2.yml"]),
    { code: 1, includes: [AGG, "e `Guard Tests` e agora o nome do job `fake` deste ficheiro"], excludes: [`de \`${W}ci2.yml\``] });

  // FALHA FECHADA: sem a lista dos outros workflows, avisa. Chamado direto, com um `git` que rebenta no `ls-files`:
  // no verificador inteiro o git ja falhou antes, e o ramo nao se alcanca de ponta a ponta.
  {
    const avisos = [];
    verificaGate({
      f: `${W}x.yml`, antes: "", agora: FALSO("Guard Tests"), contavel: false, base: "b",
      git: (a) => { if (a[0] === "ls-files") throw new Error("sem git"); return ""; },
      ler: () => null, warn: (m) => avisos.push(m), note: () => {},
    });
    registarResultado("colisoes (#355): sem a lista dos outros workflows, avisa (falha fechada)",
      avisos.some((m) => m.includes("nao consegui listar ou ler os outros workflows (sem git)")) ? [] : [`avisos: ${JSON.stringify(avisos)}`]);
  }
}
