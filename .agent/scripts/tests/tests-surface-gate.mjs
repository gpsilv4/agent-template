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
import { ehDerivado } from "../lib/derivado.mjs";
import { modosDaMatriz, modosDoPortao } from "../lib/gate-modos.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { pathToFileURL } from "url";
import { test, commit, git, registarResultado, ROOT } from "./harness/test-surface-harness.mjs";
import { blocoOn, unidadesDaMaquinaria, perdidas, aceites, defeitosDeEstrutura } from "../lib/superficie-gate.mjs";

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

  // O controlo POSITIVO do #347 (PR A): a app juntou-se num job `quality` e a maquinaria ficou no seu. Mover um
  // passo da maquinaria (as suites) para o job da app tem de AVISAR — sem isto, o "OK sem marcas" do PR A
  // podia ser cegueira e nao medicao.
  test("gate: MOVER o passo das suites para o job da app (`quality`) avisa (#347)", (dir) =>
    muda(dir, workflow(), workflow().replace("      - run: node .agent/scripts/tests/test-guards.mjs\n", "") +
      "  quality:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node .agent/scripts/tests/test-guards.mjs\n"),
  { code: 1, includes: ["passo da maquinaria mudou ou saiu: node .agent/scripts/tests/test-guards.mjs"] });
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

  // --- O AGREGADOR e a ESTRUTURA (#308) ------------------------------------------
  // O check que a protecao exige passou a ser um job sem maquinaria, que AGREGA os que a tem
  // (`guard-gate`: `needs: [guard-tests, sweep]`). Desliga-lo sem tocar numa linha de maquinaria
  // tem de avisar; e um `needs:` partido ou dois checks com o mesmo nome sao defeitos sem trailer.
  // Um agregador LE o resultado (`needs.guard.result`): so depender nao chega (ver o `deploy` abaixo).
  const gate = ({ caso = "success) ;;", needs = "[guard]", nome = "Guard Tests", sempre = "    if: always()\n", id = "gate", le = "guard" } = {}) =>
    `  ${id}:\n    name: ${nome}\n    runs-on: ubuntu-latest\n    needs: ${needs}\n${sempre}    steps:\n` +
    `      - env:\n          R: \${{ needs.${le}.result }}\n        run: |\n          case "$R" in\n            ${caso}\n            *) exit 1 ;;\n          esac\n`;
  const comGate = (o) => workflow() + gate(o);
  test("gate: o `case` do agregador que passa a aceitar `failure` avisa (#308)", (dir) =>
    muda(dir, comGate(), comGate({ caso: "success|failure) ;;" })),
  { code: 1, includes: ["passo da maquinaria mudou ou saiu: o job gate (agrega o resultado da maquinaria)"] });
  test("gate: tirar o `if: always()` do agregador avisa (#308)", (dir) =>
    muda(dir, comGate(), comGate({ sempre: "" })),
  { code: 1, includes: ["o job gate (agrega o resultado da maquinaria)"] });
  // O contra-caso: um agregador NOVO so alarga a rede, e um intacto nao avisa.
  test("gate: acrescentar um agregador nao avisa (#308)", (dir) =>
    muda(dir, workflow(), comGate()),
  { code: 0, excludes: ["agrega o resultado", "mudou ou saiu"] });
  test("gate: um `needs:` para um job que nao existe avisa, mesmo com o trailer (#308)", (dir) =>
    muda(dir, comGate(), comGate({ needs: "[guard, sweep]" }), { msg: `muda\n\nTest-Surface: ${CI} — de proposito` }),
  { code: 1, includes: ["o job `gate` tem `needs: sweep`, e o job `sweep` nao existe"] });
  test("gate: dois jobs com o mesmo nome de check avisam (#308)", (dir) =>
    muda(dir, comGate(), comGate().replace("  guard:\n    runs-on: ubuntu-latest\n", "  guard:\n    name: Guard Tests\n    runs-on: ubuntu-latest\n")),
  { code: 1, includes: ["os jobs `guard` e `gate` tem o mesmo nome de check, `Guard Tests`"] });
  // Segunda ronda de leituras do #308.
  // So o que o PR INTRODUZ: um defeito que ja la estava nao deixa vermelho cada PR que toque no ficheiro.
  test("gate: um `needs:` partido que JA existia nao avisa num PR que muda outra coisa (#308)", (dir) =>
    muda(dir, comGate({ needs: "[guard, ausente]" }), comGate({ needs: "[guard, ausente]" }).replace("echo ola", "echo ola2")),
  { code: 0, excludes: ["nao existe — o GitHub rejeita"] });
  // A varredura num job seu SEM um agregador que leia o resultado dele: fora do check exigido.
  const sweepJob = "  sweep:\n    needs: guard\n    runs-on: ubuntu-latest\n    steps:\n      - run: node .agent/scripts/mutation-sweep.mjs\n";
  test("gate: a varredura num job sem agregador avisa (#308)", (dir) =>
    muda(dir, comGate(), comGate() + sweepJob),
  { code: 1, includes: ["a varredura corre no job `sweep`, sem as suites e sem um agregador que leia `needs.sweep.result`"] });
  // A partir de um workflow SEM agregador: mudar um agregador que ja existia avisa (e outro caso).
  test("gate: com um agregador que a le, nao avisa (#308)", (dir) =>
    muda(dir, workflow(), workflow() + sweepJob + gate({ needs: "[guard, sweep]", le: "sweep" })),
  { code: 0, excludes: ["sem um agregador"] });
  test("gate: a varredura em dois jobs avisa (corre 2x) (#308)", (dir) =>
    muda(dir, comGate(), workflow({ extra: "      - run: node .agent/scripts/mutation-sweep.mjs\n" }) + sweepJob + gate({ needs: "[guard, sweep]", le: "sweep" })),
  { code: 1, includes: ["a varredura de mutacao corre em 2 jobs (`guard`, `sweep`)"] });
  // O contra-caso da invariante: num workflow SEM suites, o job que so corre a varredura e o proprio
  // check — e num workflow NOVO o diferencial nao protege (tudo o que la esta e "novo").
  test("gate: um workflow novo so com a varredura (sem suites) nao avisa (#308)", (dir) =>
    muda(dir, null, "name: V\non:\n  pull_request:\njobs:\n  v:\n    runs-on: x\n    steps:\n      - run: node .agent/scripts/mutation-sweep.mjs\n", { ficheiro: ".github/workflows/varredura.yml" }),
  { code: 0, excludes: ["sem um agregador"] });
  // So depender nao e agregar: um `deploy` a jusante pode subir o `timeout-minutes` em paz.
  const deploy = (t) => `  deploy:\n    needs: [guard]\n    runs-on: ubuntu-latest\n    timeout-minutes: ${t}\n    steps:\n      - uses: actions/checkout@v4\n`;
  test("gate: um job que so depende da maquinaria (sem ler o resultado) nao e vigiado (#308)", (dir) =>
    muda(dir, workflow() + deploy(5), workflow() + deploy(9).replace("checkout@v4", "checkout@v5")),
  { code: 0, excludes: ["agrega o resultado", "mudou ou saiu"] });
  // Um agregador de agregadores tambem e vigiado.
  test("gate: um agregador que le outro agregador e vigiado (#308)", (dir) => {
    const cadeia = (caso) => comGate() + gate({ id: "final", nome: "Final", needs: "[gate]", le: "gate", caso });
    return muda(dir, cadeia("success) ;;"), cadeia("success|failure) ;;"));
  }, { code: 1, includes: ["o job final (agrega o resultado da maquinaria)"] });
  // Nomes repetidos FORA da maquinaria sao idioma legitimo; um `#` entre aspas e do nome.
  test("gate: dois jobs `name: Deploy` alheios a maquinaria nao avisam (#308)", (dir) =>
    muda(dir, comGate(), comGate() + "  a:\n    name: Deploy\n    runs-on: x\n  b:\n    name: Deploy\n    runs-on: x\n"),
  { code: 0, excludes: ["mesmo nome de check"] });
  registarResultado("gate: nomes com `#` entre aspas, aliases e `needs:` em varias linhas leem-se certo (#308)", [
    ...(defeitosDeEstrutura('jobs:\n  a:\n    name: "Shard #1"\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/x.mjs\n  b:\n    name: "Shard #2"\n    runs-on: y\n').length === 0 ? [] : ["`\"Shard #1\"` e `\"Shard #2\"` colidiram"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: y\n  b:\n    needs: *deps\n    runs-on: y\n").length === 0 ? [] : ["um alias foi lido como um job em falta"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: y\n  b:\n    needs: [\n      a,\n      zz]\n    runs-on: y\n").some((d) => d.includes("`needs: zz`")) ? [] : ["o `needs:` em varias linhas nao foi lido"]),
  ]);
  // Os SHARDS (#308): a matriz repartida sem o portao que confere os relatorios e falha aberta; com ele,
  // nada a dizer; e um `SWEEP_SHARD` so num comentario nao reparte nada.
  {
    const shards = "jobs:\n  sweep:\n    runs-on: y\n    steps:\n      - env:\n          SWEEP_SHARD: 1/2\n        run: node .agent/scripts/mutation-sweep.mjs\n";
    const portao = "  gate:\n    runs-on: y\n    needs: [sweep]\n    steps:\n      - env:\n          V: ${{ needs.sweep.result }}\n        run: node .agent/scripts/lib/varredura-shards.mjs x\n";
    // O portao num job que NAO agrega (nao le `needs.sweep.result`): nenhuma protecao o exige.
    const aParte = "  conta:\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/lib/varredura-shards.mjs x\n";
    const diz = (t) => defeitosDeEstrutura(t).some((d) => d.includes("nenhum job AGREGADOR confere os relatorios"));
    registarResultado("gate: shards sem o portao num agregador sao um defeito; com ele, nao (#308)", [
      ...(diz(shards) ? [] : ["a matriz em shards sem portao passou"]),
      ...(!diz(shards + portao) ? [] : ["com o portao num agregador, continuou a reprovar"]),
      ...(diz(shards + aParte) ? [] : ["o portao num job a parte, que nao agrega, passou"]),
      ...(!diz(shards.replace("SWEEP_SHARD: 1/2", "# SWEEP_SHARD: 1/2")) ? [] : ["um SWEEP_SHARD comentado contou"]),
    ]);
  }
  // Os MODOS (#317): cada modo da matriz do `sweep` tem de chegar ao portao; os dois jeitos de os escrever.
  {
    const matriz = "jobs:\n  sweep:\n    runs-on: y\n    strategy:\n      matrix:\n        modo: [completa]\n        include:\n          - modo: skips\n    steps:\n      - env:\n          SWEEP_SHARD: 1/2\n        run: node .agent/scripts/mutation-sweep.mjs\n";
    const portao = (args) => `  gate:\n    runs-on: y\n    needs: [sweep]\n    steps:\n      - env:\n          V: \${{ needs.sweep.result }}\n        run: node .agent/scripts/lib/varredura-shards.mjs x${args}\n`;
    const faltam = (t) => defeitosDeEstrutura(t).find((d) => d.includes("nao recebe o(s) modo(s)")) ?? "";
    registarResultado("gate: o portao recebe todos os modos da matriz (#317)", [
      ...(faltam(matriz + portao("")).includes("completa, skips") ? [] : [`sem modos devia faltar completa e skips: "${faltam(matriz + portao(""))}"`]),
      ...(faltam(matriz + portao(" completa")).includes("modo(s) skips da matriz") ? [] : ["o modo do `include` nao foi lido"]),
      ...(faltam(matriz + portao(" completa skips")) === "" ? [] : ["com os dois modos, continuou a reprovar"]),
    ]);
  }
  // O leitor (`lib/gate-modos.mjs`) directo: os nomes, sem duplicados, e `null` no que nao se le.
  registarResultado("gate-modos: le a matriz e o portao, e devolve null no que nao se le (#317)", [
    ...(JSON.stringify(modosDaMatriz(["modo: [completa]", "include:", "  - modo: skips", "  - modo: completa"])) === '["completa","skips"]' ? [] : ["a matriz nao deu completa e skips"]),
    ...(modosDaMatriz(["modo: ${{ x }}"]) === null ? [] : ["um modo de uma expressao devia dar null"]),
    ...(JSON.stringify(modosDoPortao(["run: node .agent/scripts/lib/varredura-shards.mjs x completa \\", "  skips"])) === '[["completa","skips"]]' ? [] : ["a continuacao nao foi lida"]),
    ...(JSON.stringify(modosDoPortao(["run: node .agent/scripts/lib/varredura-shards.mjs x $M"])) === "[null]" ? [] : ["uma variavel devia dar null"]),
  ]);
  // As outras formas de YAML (leituras do #317): leem-se, e o que nao se le FALHA FECHADO.
  {
    const job = (m) => `jobs:\n  sweep:\n    runs-on: y\n    strategy:\n      matrix:\n${m}    steps:\n      - env:\n          SWEEP_SHARD: 1/2\n        run: node .agent/scripts/mutation-sweep.mjs\n`;
    const gate = (args) => `  gate:\n    runs-on: y\n    needs: [sweep]\n    steps:\n      - env:\n          V: \${{ needs.sweep.result }}\n        run: node .agent/scripts/lib/varredura-shards.mjs x${args}\n`;
    const defeitos = (t) => defeitosDeEstrutura(t).filter((d) => /modo|modos/.test(d));
    const limpo = (nome, m, args) => (defeitos(job(m) + gate(args)).length === 0 ? [] : [`${nome}: ${defeitos(job(m) + gate(args)).join(" | ")}`]);
    const diz = (nome, m, args, texto) => (defeitos(job(m) + gate(args)).some((d) => d.includes(texto)) ? [] : [`${nome}: esperava "${texto}"`]);
    registarResultado("gate: os modos leem-se em todas as formas de YAML, e o que nao se le reprova (#317)", [
      ...limpo("lista com aspas", '        modo: ["completa", "skips"]\n', " completa skips"),
      ...limpo("escalar com aspas", "        include:\n          - modo: 'skips'\n          - modo: \"completa\"\n", " completa skips"),
      ...limpo("mapa em linha", "        include:\n          - { modo: completa, shard: 1 }\n          - { modo: skips, shard: 1 }\n", " completa skips"),
      ...limpo("lista em bloco", "        modo:\n          - completa\n          - skips\n", " completa skips"),
      ...limpo("portao com aspas e continuacao", "        modo: [completa, skips]\n", ' \\\n          "completa" \'skips\''),
      ...diz("matriz de uma expressao", "        matrix: ${{ fromJSON(x) }}\n", " completa", "nao consegui ler os modos da matriz"),
      ...diz("portao com uma variavel", "        modo: [completa]\n", " $MODOS", "nao consegui ler os modos que o portao recebe"),
      ...diz("um modo a mais no portao", "        modo: [completa]\n", " completa skips", "exige o(s) modo(s) skips, que a matriz nao tem"),
    ]);
  }
  // O que o bootstrap deixa: o `ci.yml` do TEMPLATE sem o job `simulators` (o §2.7 remove-o) nao tem
  // defeitos. So no template: num derivado, o `ci.yml` e do projeto.
  {
    const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
    const ci = lerRaiz(".github/workflows/ci.yml");
    if (ehDerivado(lerRaiz) || ci === null) console.log("  SKIP  gate: o ci.yml do template sem o `simulators` (so no template)");
    else {
      const semSimuladores = ci.replace(/^  simulators:[\s\S]*?(?=^  [\w-]+:[ \t]*(?:#.*)?$)/m, "");
      registarResultado("gate: o ci.yml do template, sem o job `simulators` (o bootstrap), nao tem defeitos de estrutura (#308)", [
        ...(semSimuladores !== ci ? [] : ["nao encontrei o job `simulators` para o tirar"]),
        ...defeitosDeEstrutura(semSimuladores),
        ...defeitosDeEstrutura(ci),
      ]);
    }
  }

  // A excecao do `always()` na marca do `if:` (#308): so num AGREGADOR (um job que le `needs.<X>.result`),
  // e so a forma exacta. Cada forma excluida tem o seu par que CONTA — sem o par, alargar a excecao
  // "resolvia" o falso positivo desligando a marca (o mesmo cuidado da excecao do `pull_request`).
  const IF = "condicao `if:`";
  const base = "jobs:\n  x:\n    runs-on: y\n    steps:\n      - run: node a-test.mjs\n";
  const agregador = (cond) => `${base}  t:\n    needs: x\n${cond === null ? "" : `    if: ${cond}\n`}    runs-on: y\n    steps:\n      - env:\n          R: \${{ needs.x.result }}\n        run: echo "$R"\n`;
  for (const cond of ["always()", "${{ always() }}", '"always()"', "always()  # o agregador"]) {
    test(`gate: \`if: ${cond}\` num agregador nao conta como condicao acrescentada (#308)`, (dir) =>
      muda(dir, agregador(null), agregador(cond)),
    { code: 0, excludes: [IF] });
  }
  for (const cond of ["always() && false", "${{ always() && github.event_name == 'push' }}", "${{ !always() }}", "failure()", "always()\n      && false"]) {
    test(`gate: \`if: ${cond.replace(/\n/g, " ")}\` num agregador continua a contar (#308)`, (dir) =>
      muda(dir, agregador(null), agregador(cond)),
    { code: 1, includes: [IF] });
  }
  // O push de um merge num privado (#347, PR B): a forma exacta, so como `if:` de JOB, e so nos tres jobs do
  // `ci.yml` que o PR tambem corre. Cada forma excluida tem o par que CONTA: uma cauda, um `)`, as aspas
  // trocadas, uma continuacao, cada operador, o passo, outro job, outro workflow.
  const MP = "github.event_name == 'pull_request' || !github.event.repository.private || github.event.head_commit.committer.username != 'web-flow'";
  const comJob = (cond, id = "quality") => `${base}  ${id}:\n    runs-on: y\n${cond === null ? "" : `    if: ${cond}\n`}    steps:\n      - run: node b-test.mjs\n`;
  for (const [rotulo, cond] of [["nua", MP], ["em ${{ }}", `\${{ ${MP} }}`], ["entre aspas", `"${MP}"`], ["com comentario", `${MP}  # so o merge num privado`]]) {
    test(`gate: \`if:\` do merge num privado como if de job nao conta (#347) — ${rotulo}`, (dir) =>
      muda(dir, comJob(null), comJob(cond)),
    { code: 0, excludes: [IF] });
  }
  for (const [rotulo, cond] of [
    ["uma cauda `&& false`", `${MP} && false`], ["`(a || b) && false`", `(${MP}) && false`], ["um `)` a mais", `${MP})`],
    ["aspas trocadas", `"${MP}'`], ["uma continuacao", `${MP}\n      && false`], ["outro committer", MP.replace("'web-flow'", "'outro'")],
    ["sem o `!private`", MP.replace(" || !github.event.repository.private", "")], ["o `==` trocado por `!=`", MP.replace("==", "!=")],
    // O `!` e o terceiro operador (segunda leitura): sem eles, um repo PUBLICO passava a saltar os merges.
    ["sem o `!` do private", MP.replace("!github", "github")], ["o `!=` do committer trocado por `==`", MP.replace("!= 'web-flow'", "== 'web-flow'")],
  ]) {
    test(`gate: \`if:\` do merge num privado alterado continua a contar (#347) — ${rotulo}`, (dir) =>
      muda(dir, comJob(null), comJob(cond)),
    { code: 1, includes: [IF] });
  }
  test("gate: a forma do merge num privado num PASSO conta (#347)", (dir) =>
    muda(dir, comJob(null), `${base}  quality:\n    runs-on: y\n    steps:\n      - if: ${MP}\n        run: node b-test.mjs\n`),
  { code: 1, includes: [IF] });
  // A chave `if:` como ULTIMA do ultimo passo do job (segunda leitura): sem o guarda da indentacao, era isenta.
  test("gate: a forma do merge num privado no fim do ultimo passo conta (#347)", (dir) =>
    muda(dir, comJob(null), `${base}  quality:\n    runs-on: y\n    steps:\n      - name: t\n        run: node b-test.mjs\n        if: ${MP}\n`),
  { code: 1, includes: [IF] });
  // Outro job (um `deploy` a jusante) e outro workflow (so de `push`): o "o PR ja correu isto" e falso (as duas leituras).
  test("gate: a forma do merge num privado noutro job do ci.yml conta (#347)", (dir) =>
    muda(dir, comJob(null, "deploy"), comJob(MP, "deploy")),
  { code: 1, includes: [IF] });
  test("gate: a forma do merge num privado noutro workflow conta (#347)", (dir) =>
    muda(dir, comJob(null), comJob(MP), { ficheiro: ".github/workflows/deploy.yml" }),
  { code: 1, includes: [IF] });
  // A auditoria do #308: um job a jusante dos testes que NAO le resultados (um `deploy`) com `always()`
  // corre com os testes vermelhos — conta. A primeira versao da excecao vivia no regex e deixava-o passar.
  test("gate: `if: always()` num job que nao le resultados (um deploy) conta (#308)", (dir) =>
    muda(dir, `${base}  deploy:\n    needs: x\n    runs-on: y\n    steps:\n      - run: ./deploy.sh\n`,
      `${base}  deploy:\n    needs: x\n    if: always()\n    runs-on: y\n    steps:\n      - run: ./deploy.sh\n`),
  { code: 1, includes: [IF] });
  registarResultado("gate: defeitosDeEstrutura le o `needs:` em bloco, e o id como nome quando falta o `name:` (#308)", [
    ...(JSON.stringify(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n  b:\n    needs:\n      - a\n      - c\n    runs-on: x\n")) === JSON.stringify(["o job `b` tem `needs: c`, e o job `c` nao existe — o GitHub rejeita o workflow inteiro"]) ? [] : ["o `needs:` em bloco nao foi lido"]),
    // So contam colisoes que envolvam a maquinaria (#308, segunda leitura): com ela no `a`, colide; sem ela, nao.
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n    steps:\n      - run: node .agent/scripts/x.mjs\n  b:\n    name: a\n    runs-on: x\n").length === 1 ? [] : ["o id `a` (com maquinaria) e o `name: a` deviam colidir"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n  b:\n    name: a\n    runs-on: x\n").length === 0 ? [] : ["uma colisao sem maquinaria avisou"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n  b:\n    needs: a\n    runs-on: x\n").length === 0 ? [] : ["um workflow certo deu defeitos"]),
  ]);
}
