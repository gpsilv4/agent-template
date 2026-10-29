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

/** Commita os workflows de `antes`, aplica `depois` (e o `mv`, renomeado com o git) e commita. */
const passos = (dir, antes, depois = {}, mv = null) => {
  const escreve = (f, t) => { mkdirSync(dirname(join(dir, W, f)), { recursive: true }); writeFileSync(join(dir, W, f), t); };
  for (const [f, t] of Object.entries(antes)) escreve(f, t);
  commit(dir, "antes");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  for (const [f, t] of Object.entries(depois)) escreve(f, t);
  if (mv) git(dir, ["mv", join(W, mv[0]), join(W, mv[1])]);
  commit(dir, "depois");
  return ref;
};

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
