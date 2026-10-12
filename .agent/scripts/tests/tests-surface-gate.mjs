/**
 * Testes do gate no `check-test-surface`: o trigger e os passos da maquinaria — {{PROJECT_NAME}}
 *
 * Do #285, parte 1.
 *
 * O que se afirma: desligar o `Guard Tests` sem tocar num teste avisa — um `on:` que muda, o gate
 * a comparar `HEAD` consigo mesmo, o padrao do `grep` que decide se a varredura corre. E, do outro
 * lado, o que NAO avisa: um comentario, uma verificacao acrescentada, um workflow novo ou um que
 * nao corre testes. Sem o segundo lado, a regra seria satisfeita por "avisar sempre" — e um aviso
 * que dispara sempre e desligado na primeira semana.
 *
 * O trailer `Test-Surface: <ficheiro> — <porque>` e a unica saida: com motivo, NOTE; sem motivo, ou
 * para outro ficheiro, continua WARN.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, registarResultado } from "./harness/test-surface-harness.mjs";
import { blocoOn, unidadesDaMaquinaria, perdidas, aceites } from "../lib/superficie-gate.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-gate.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

const CI = ".github/workflows/ci.yml";

/** Um workflow que CORRE TESTES (um passo de verificacao), com o `on:` e o gate configuraveis. */
const workflow = ({ on = "on:\n  pull_request:\n    branches: [main]\n", topo = "", job = "", gate = 'node .agent/scripts/check-test-surface.mjs "$BASE"', extra = "", audit = "        run: npm audit\n" } = {}) =>
  `name: CI\n${on}${topo}jobs:\n  guard:\n    runs-on: ubuntu-latest\n${job}    steps:\n` +
  `      - run: node .agent/scripts/tests/test-guards.mjs\n` +
  `      - run: echo ola\n` +
  `      - run: ${gate}\n` +
  `      - run: |\n          if git diff --name-only | grep -qE '^\\.agent/scripts/'; then echo varre; fi\n${extra}` +
  `  audit:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Audit\n        continue-on-error: true\n${audit}`;

/** Escreve `antes` e commita; escreve `depois` e commita com `msg`. Devolve a baseline. */
const muda = (dir, antes, depois, { ficheiro = CI, msg = "muda", msgAntes = "antes" } = {}) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  // Sem `antes` (um workflow NOVO), a baseline e o commit da sandbox: nao ha nada a commitar.
  if (antes !== null) {
    writeFileSync(join(dir, ficheiro), antes);
    commit(dir, msgAntes);
  }
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ficheiro), depois);
  commit(dir, msg);
  return ref;
};

export function registar() {
  // --- O que AVISA -------------------------------------------------------------
  test("gate: `paths-ignore` no `on:` avisa", (dir) =>
    muda(dir, workflow(), workflow({ on: "on:\n  pull_request:\n    branches: [main]\n    paths-ignore: ['**']\n" })),
  { code: 1, includes: [`${CI}: o \`on:\` mudou`] });
  test("gate: `branches: [nao-existe]` no `on:` avisa", (dir) =>
    muda(dir, workflow(), workflow({ on: "on:\n  pull_request:\n    branches: [nao-existe]\n" })),
  { code: 1, includes: ["o `on:` mudou"] });
  test("gate: o `on:` EM LINHA que perde o pull_request avisa", (dir) =>
    muda(dir, workflow({ on: "on: [push, pull_request]\n" }), workflow({ on: "on: [push]\n" })),
  { code: 1, includes: ["o `on:` mudou"] });
  test("gate: a chave `true:` (o `on` que o YAML 1.1 le assim) tambem conta", (dir) =>
    muda(dir, workflow({ on: "true:\n  pull_request:\n" }), workflow({ on: "true:\n  push:\n" })),
  { code: 1, includes: ["o `on:` mudou"] });
  test("gate: o check-test-surface a comparar HEAD consigo mesmo avisa", (dir) =>
    muda(dir, workflow(), workflow({ gate: "node .agent/scripts/check-test-surface.mjs HEAD" })),
  { code: 1, includes: ['passo da maquinaria mudou ou saiu: node .agent/scripts/check-test-surface.mjs "$BASE"', `Test-Surface: ${CI} — <porque>`], excludes: [`${CI} alterado, sem marcas`] });
  test("gate: o padrao do `grep` que decide a varredura mudado avisa", (dir) =>
    muda(dir, workflow(), workflow().replace("'^\\.agent/scripts/'", "'^nada/'")),
  { code: 1, includes: ["passo da maquinaria mudou ou saiu: if git diff --name-only | grep -qE"] });

  // Da leitura independente: o gate desligava-se sem mudar a LINHA dele.
  test("gate: MOVER a linha do gate para o passo Audit (continue-on-error) avisa", (dir) =>
    muda(dir, workflow(), workflow({ gate: "echo sem gate", audit: '        run: |\n          npm audit\n          node .agent/scripts/check-test-surface.mjs "$BASE"\n' })),
  { code: 1, includes: ['passo da maquinaria mudou ou saiu: node .agent/scripts/check-test-surface.mjs "$BASE"'] });
  test("gate: um `exit 0` ACRESCENTADO no passo do gate avisa", (dir) =>
    muda(dir, workflow(), workflow().replace("      - run: |\n          if git", "      - run: |\n          exit 0\n          if git")),
  { code: 1, includes: ["passo da maquinaria mudou ou saiu: if git diff"] });
  test("gate: `defaults: run: shell` de topo avisa", (dir) =>
    muda(dir, workflow(), workflow({ topo: "defaults:\n  run:\n    shell: 'true {0}'\n" })),
  { code: 1, includes: ["o `defaults:` mudou"] });
  test("gate: o `env:` de topo mudado avisa", (dir) =>
    muda(dir, workflow({ topo: "env:\n  BASE: ${{ github.event.pull_request.base.sha }}\n" }), workflow({ topo: "env:\n  BASE: HEAD\n" })),
  { code: 1, includes: ["o `env:` mudou"] });
  test("gate: o `if:` do JOB do gate mudado avisa", (dir) =>
    muda(dir, workflow({ job: "    if: github.event_name == 'pull_request'\n" }), workflow({ job: "    if: github.event_name == 'nunca'\n" })),
  { code: 1, includes: ["o cabecalho do job `guard` mudou"], excludes: ["passo da maquinaria mudou"] });
  test("gate: um workflow que corre `npm test` (sem `node ...test`) tambem e vigiado", (dir) =>
    muda(dir, "name: E2E\non:\n  pull_request:\njobs:\n  e2e:\n    runs-on: x\n    steps:\n      - run: npm run test:e2e\n",
      "name: E2E\non:\n  workflow_dispatch:\njobs:\n  e2e:\n    runs-on: x\n    steps:\n      - run: npm run test:e2e\n", { ficheiro: ".github/workflows/e2e.yml" }),
  { code: 1, includes: ["o `on:` mudou"] });
  /** O workflow commitado como baseline, sem segunda versao: para os casos de mover. */
  const so = (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, CI), workflow());
    commit(dir, "antes");
    return git(dir, ["rev-parse", "HEAD"]);
  };
  test("gate: renomear um workflow DENTRO de .github/workflows nao avisa", (dir) => {
    const ref = so(dir);
    git(dir, ["mv", CI, ".github/workflows/build.yml"]);
    commit(dir, "renomear");
    return ref;
  }, { code: 0, excludes: ["mudou"] });
  test("gate: mover um workflow para uma pasta que o GitHub nao corre avisa", (dir) => {
    const ref = so(dir);
    mkdirSync(join(dir, "apps/x/.github/workflows"), { recursive: true });
    git(dir, ["mv", CI, "apps/x/.github/workflows/ci.yml"]);
    commit(dir, "mover");
    return ref;
  }, { code: 1, includes: ["saiu para apps/x/.github/workflows/ci.yml"] });

  // Segunda passagem de leituras: o TIPO de escalar do `run:`, as chaves depois de `steps:`, as
  // renomeacoes e os runners.
  test("gate: `run: |` -> `run: >` (junta as linhas: o `#` comenta o resto) num passo do gate avisa", (dir) =>
    // DUAS linhas de conteudo: com uma, `|` e `>` sao o mesmo (e assim que a regra as trata).
    muda(dir, workflow({ extra: "      - run: |\n          set -e # a raiz\n          node .agent/scripts/check-x.mjs\n" }),
      workflow({ extra: "      - run: >\n          set -e # a raiz\n          node .agent/scripts/check-x.mjs\n" })),
  { code: 1, includes: ["passo da maquinaria mudou ou saiu: node .agent/scripts/check-x.mjs"] });
  test("gate: escalar SIMPLES em varias linhas (junta as linhas) avisa", (dir) =>
    muda(dir, workflow({ extra: "      - run: |\n          echo a\n          node .agent/scripts/check-x.mjs\n" }),
      workflow({ extra: "      - run: echo a\n          node .agent/scripts/check-x.mjs\n" })),
  { code: 1, includes: ["passo da maquinaria mudou ou saiu: node .agent/scripts/check-x.mjs"] });
  test("gate: um `if:` DEPOIS dos `steps:` do job conta como cabecalho", (dir) =>
    muda(dir, workflow({ extra: "    if: github.event_name == 'pull_request'\n" }), workflow({ extra: "    if: false\n" })),
  { code: 1, includes: ["o cabecalho do job `guard` mudou"] });
  test("gate: `steps:` em flow — o job inteiro e a unidade", (dir) =>
    muda(dir, "name: F\non: push\njobs:\n  g:\n    runs-on: x\n    steps: [{run: npm test}, {run: node .agent/scripts/check-x.mjs}]\n",
      "name: F\non: push\njobs:\n  g:\n    runs-on: x\n    steps: [{run: npm test}, {run: echo nada}]\n", { ficheiro: ".github/workflows/flow.yml" }),
  { code: 1, includes: ["o job g: (steps em flow)"] });
  test("gate: renomear E mudar o destino no mesmo commit avisa", (dir) => {
    const ref = so(dir);
    git(dir, ["mv", CI, ".github/workflows/build.yml"]);
    writeFileSync(join(dir, ".github/workflows/build.yml"), workflow({ on: "on:\n  pull_request:\n    branches: [main]\n    paths-ignore: ['**']\n" }));
    commit(dir, "renomear e mudar");
    return ref;
  }, { code: 1, includes: ["o `on:` mudou"] });
  test("gate: o trailer da ORIGEM num commit antigo nao cobre a mudanca seguinte ao DESTINO", (dir) => {
    const ref = so(dir);
    git(dir, ["mv", CI, ".github/workflows/build.yml"]);
    commit(dir, `renomear\n\nTest-Surface: ${CI} — renomear`);
    writeFileSync(join(dir, ".github/workflows/build.yml"), workflow({ on: "on:\n  pull_request:\n    branches: [main]\n    paths-ignore: ['**']\n" }));
    commit(dir, "mais");
    return ref;
  }, { code: 1, includes: ["o `on:` mudou"] });
  test("gate: um workflow com `go test` (sem `node ...test`) e vigiado", (dir) =>
    muda(dir, "name: Go\non:\n  pull_request:\njobs:\n  t:\n    runs-on: x\n    steps:\n      - run: go test ./...\n",
      "name: Go\non:\n  workflow_dispatch:\njobs:\n  t:\n    runs-on: x\n    steps:\n      - run: go test ./...\n", { ficheiro: ".github/workflows/go.yml" }),
  { code: 1, includes: ["o `on:` mudou"] });

  // --- O que NAO avisa (cada um e o controlo negativo de um caso de cima) -------------
  test("gate: subir o `timeout-minutes` do job do gate nao avisa (um job morto por tempo falha, nao salta)", (dir) =>
    muda(dir, workflow({ job: "    timeout-minutes: 40\n" }), workflow({ job: "    timeout-minutes: 75\n" })),
  { code: 0, excludes: ["passo da maquinaria"] });
  test("gate: mudar um `permissions:` ANINHADO do job do gate nao avisa", (dir) =>
    muda(dir, workflow({ job: "    permissions:\n      contents: read\n" }), workflow({ job: "    permissions:\n      contents: write\n" })),
  { code: 0, excludes: ["cabecalho", "passo da maquinaria"] });
  test("gate: `npm i -D @playwright/test` nao faz de um workflow um que corre testes", (dir) =>
    muda(dir, "name: P\non:\n  push:\njobs:\n  p:\n    runs-on: x\n    steps:\n      - run: npm i -D @playwright/test\n",
      "name: P\non:\n  workflow_dispatch:\njobs:\n  p:\n    runs-on: x\n    steps:\n      - run: npm i -D @playwright/test\n", { ficheiro: ".github/workflows/p.yml" }),
  { code: 0, excludes: ["o `on:` mudou"] });
  test("gate: mudar um passo SEM a maquinaria no job do gate nao avisa", (dir) =>
    muda(dir, workflow(), workflow().replace("      - run: echo ola\n", "      - run: echo adeus\n")),
  { code: 0, excludes: ["passo da maquinaria"] });
  test("gate: so um comentario no `on:` nao avisa", (dir) =>
    muda(dir, workflow(), workflow({ on: "on:\n  # so no PR\n  pull_request:\n    branches: [main] # o principal\n" })),
  { code: 0, excludes: ["o `on:` mudou"] });
  test("gate: uma verificacao ACRESCENTADA nao avisa", (dir) =>
    muda(dir, workflow(), workflow({ extra: "      - run: node .agent/scripts/check-codigo-morto.mjs\n" })),
  { code: 0, excludes: ["passo da maquinaria"] });
  test("gate: um workflow NOVO nao avisa", (dir) =>
    // Sem o job `audit`: o `continue-on-error` dele e (bem) uma marca antiga, e este caso mede o gate.
    muda(dir, null, workflow({ on: "on: [push]\n" }).split("  audit:")[0], { ficheiro: ".github/workflows/novo.yml" }),
  { code: 0, excludes: ["o `on:` mudou", "passo da maquinaria"] });
  test("gate: o `on:` de um workflow que NAO corre testes nao avisa", (dir) =>
    muda(dir, "name: R\non:\n  push:\n    tags: ['v*']\njobs:\n  r:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
      "name: R\non:\n  push:\n    tags: ['x*']\njobs:\n  r:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
      { ficheiro: ".github/workflows/release.yml" }),
  { code: 0, excludes: ["o `on:` mudou"] });

  // --- A saida: o trailer --------------------------------------------------------
  test("gate: o trailer COM motivo passa o aviso a nota, com o motivo a vista", (dir) =>
    muda(dir, workflow(), workflow({ on: "on:\n  pull_request:\n    branches: [main, release]\n" }),
      { msg: `ci: alargar o trigger\n\nTest-Surface: ${CI} — o branch release tambem precisa do gate` }),
  { code: 0, includes: ["aceite (Test-Surface: o branch release tambem precisa do gate)"] });
  test("gate: o trailer SEM motivo nao conta", (dir) =>
    muda(dir, workflow(), workflow({ on: "on:\n  pull_request:\n    branches: [main, release]\n" }),
      { msg: `ci: alargar\n\nTest-Surface: ${CI} —` }),
  { code: 1, includes: ["o `on:` mudou"] });
  // O trailer vale para a ULTIMA alteracao ao ficheiro, nao para o PR inteiro.
  test("gate: um trailer num commit ANTERIOR do PR nao cobre a alteracao seguinte", (dir) => {
    const ref = muda(dir, workflow(), workflow({ on: "on:\n  pull_request:\n    branches: [main, release]\n" }),
      { msg: `ci: alargar\n\nTest-Surface: ${CI} — o branch release` });
    writeFileSync(join(dir, CI), workflow({ on: "on:\n  pull_request:\n    branches: [main, release]\n    paths-ignore: ['**']\n" }));
    commit(dir, "ci: mais uma coisa");
    return ref;
  }, { code: 1, includes: ["o `on:` mudou"] });
  test("gate: um trailer na BASELINE (fora de base..HEAD) nao conta", (dir) =>
    muda(dir, workflow(), workflow({ on: "on:\n  pull_request:\n    branches: [main, release]\n" }),
      { msgAntes: `antes\n\nTest-Surface: ${CI} — da baseline` }),
  { code: 1, includes: ["o `on:` mudou"] });
  test("gate: o trailer de OUTRO ficheiro nao conta", (dir) =>
    muda(dir, workflow(), workflow({ on: "on:\n  pull_request:\n    branches: [main, release]\n" }),
      { msg: "ci: alargar\n\nTest-Surface: .github/workflows/outro.yml — motivo" }),
  { code: 1, includes: ["o `on:` mudou"] });

  // --- As funcoes puras ------------------------------------------------------------
  registarResultado("gate: blocoOn ignora comentarios, espacos finais e linhas vazias; `${{ }}#` nao e comentario", [
    ...(blocoOn("on:\n  push: # x\n\n  pull_request:   \nenv:\n  A: 1\n") === "on:\n  push:\n  pull_request:" ? [] : [`deu ${JSON.stringify(blocoOn("on:\n  push: # x\n\n  pull_request:   \nenv:\n"))}`]),
    ...(blocoOn('"on":\n  push:\n') === '"on":\n  push:' ? [] : ['`"on":` nao foi lido']),
    ...(blocoOn("on:\n  workflow_dispatch:\n    inputs:\n      r: {default: a#b}\n").includes("a#b") ? [] : ["`a#b` foi lido como comentario"]),
    ...(blocoOn("name: x\njobs: {}\n") === null ? [] : ["sem `on:` devia dar null"]),
    ...(blocoOn("on:\r\n  push:\r\njobs:\r\n") === "on:\n  push:" ? [] : ["CRLF partiu o bloco"]),
  ]);
  {
    const chaves = (t) => unidadesDaMaquinaria(t).map((u) => u.chave);
    const passo = (corpo, job = "") => `on: push\njobs:\n  j:\n    runs-on: x\n${job}    steps:\n${corpo}`;
    registarResultado("gate: unidadesDaMaquinaria e o PASSO com o cabecalho do job, normalizado", [
      ...(JSON.stringify(chaves(passo("      - run: node .agent/scripts/x.mjs\n"))) === JSON.stringify(chaves(passo("      - run: |\n          node .agent/scripts/x.mjs\n")))
        ? [] : ["`run: x` e `run: |` + x deram unidades diferentes"]),
      ...(chaves(passo("      - run: echo ola\n      - run: npm test\n")).length === 0 ? [] : ["um passo sem a maquinaria virou unidade"]),
      ...(chaves(passo("      - run: node .agent/scripts/x.mjs # um comentario\n"))[0] === chaves(passo("      - run: node .agent/scripts/x.mjs\n"))[0] ? [] : ["o comentario mudou a unidade"]),
      ...(chaves(passo("      - run: node .agent/scripts/x.mjs\n", "    if: a\n"))[0] !== chaves(passo("      - run: node .agent/scripts/x.mjs\n", "    if: b\n"))[0] ? [] : ["o `if:` do job nao entrou na unidade"]),
      ...(unidadesDaMaquinaria(passo("      - name: g\n        run: node .agent/scripts/x.mjs a\n"))[0]?.rotulo === "node .agent/scripts/x.mjs a" ? [] : ["rotulo errado"]),
      // As aspas de `run: "x"` saem (as contagens antigas nao o reconhecem — o #295).
      ...(chaves(passo("      - run: 'node .agent/scripts/x.mjs \"$B\"'\n"))[0] === chaves(passo('      - run: node .agent/scripts/x.mjs "$B"\n'))[0] ? [] : ["`run: 'x'` e `run: x` deram unidades diferentes"]),
      // Com DUAS linhas, `|` e `>` sao diferentes (o `>` junta-as).
      ...(chaves(passo("      - run: |\n          a\n          node .agent/scripts/x.mjs\n"))[0] !== chaves(passo("      - run: >\n          a\n          node .agent/scripts/x.mjs\n"))[0] ? [] : ["`|` e `>` de duas linhas deram a mesma unidade"]),
    ]);
  }
  registarResultado("gate: perdidas e um multiconjunto — uma de duas iguais que sai conta", [
    ...(JSON.stringify(perdidas(["a", "a", "b"], ["a", "b", "c"])) === "[1]" ? [] : [`deu ${JSON.stringify(perdidas(["a", "a", "b"], ["a", "b", "c"]))}`]),
    ...(perdidas(["a"], ["a", "x"]).length === 0 ? [] : ["acrescentar contou como perda"]),
  ]);
  registarResultado("gate: aceites le os separadores e recusa o motivo vazio", [
    ...((({ m }) => (m.get("a.yml") === "porque sim" && m.get("b.yml") === "outro" && m.get("c.yml") === "mais um" ? [] : [`separadores: ${JSON.stringify([...m])}`]))({
      m: aceites("x\n\nTest-Surface: a.yml — porque sim\ntest-surface: b.yml -- outro\nTest-Surface: c.yml - mais um\n"),
    })),
    ...(aceites("Test-Surface: a.yml —   \nTest-Surface: b.yml\n").size === 0 ? [] : ["um motivo vazio contou"]),
  ]);
}
