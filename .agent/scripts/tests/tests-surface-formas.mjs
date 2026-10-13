/**
 * Testes das formas de LINHA no `check-test-surface`: continuacoes e argumentos — {{PROJECT_NAME}}
 *
 * Do #295 (parte 2 do #285). As MARCAS leem o workflow linha a linha; estas formas desligam um passo
 * de teste sem o apagar e sem nenhuma marca na mesma linha: um `|| true` depois de um `\`, um `run: >`
 * que junta as linhas, um argumento do runner que estreita a selecao, uma shell sem `-e`, um `if`/`!`
 * que transforma a falha numa condicao.
 *
 * Cada forma tem o seu contra-caso, que NAO pode avisar: sem ele, a marca seria satisfeita por "avisar
 * em tudo" — e um aviso que dispara sempre e desligado na primeira semana.
 *
 * O runner das fixtures e `npm test`, que NAO cita a maquinaria: assim o gate da parte 1 (os passos da
 * maquinaria) fica de fora, e o que se mede e so a marca.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { test, commit, git, registarResultado } from "./harness/test-surface-harness.mjs";
import { MARCAS } from "../lib/surface-patterns.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-formas.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

const CI = ".github/workflows/ci.yml";
/** Um workflow que corre `npm test` num passo; `passo` substitui esse passo. */
const wf = (passo = "      - run: npm test\n") =>
  `name: CI\non:\n  pull_request:\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n${passo}      - run: echo fim\n`;

const muda = (dir, antes, depois) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, CI), antes);
  commit(dir, "antes");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, CI), depois);
  commit(dir, "depois");
  return ref;
};

const ENGOLIDA = "falha engolida";
const SELECAO = "runner com a selecao de testes estreitada na linha de comando";
const SEM_E = "`shell:` que nao para numa falha";
const CONDICAO = "comando de teste usado como condicao";

export function registar() {
  // --- Linhas que o runner JUNTA, e as marcas liam separadas --------------------
  test("formas: `npm test \\` + `|| true` na linha seguinte avisa", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          npm test \\\n            || true\n")),
  { code: 1, includes: [ENGOLIDA] });
  test("formas: `run: >` com `npm test` e `|| true` em linhas separadas avisa", (dir) =>
    muda(dir, wf(), wf("      - run: >\n          npm test\n          || true\n")),
  { code: 1, includes: [ENGOLIDA] });
  test("formas: escalar SIMPLES em duas linhas (`run: npm test` + `|| true`) avisa", (dir) =>
    muda(dir, wf(), wf("      - run: npm test\n          || true\n")),
  { code: 1, includes: [ENGOLIDA] });
  test("formas: `run: |` com DUAS linhas separadas nao junta (o `|| true` e outro comando)", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          npm test\n          true || true\n")),
  { code: 0, excludes: [ENGOLIDA] });

  // --- Argumentos do runner que estreitam a selecao -------------------------------
  for (const [nome, passo] of [
    ["`--passWithNoTests`", "      - run: npm test -- --passWithNoTests\n"],
    ["`npx vitest -t`", "      - run: npx vitest -t soma\n"],
    ["`pytest -k`", "      - run: pytest -k soma\n"],
    ["`--testPathPattern`", "      - run: npx jest --testPathPattern=um\n"],
    ["`playwright test --grep`", "      - run: npx playwright test --grep @smoke\n"],
    ["`pytest --lf`", "      - run: pytest --lf\n"],
  ]) {
    test(`formas: ${nome} no runner avisa`, (dir) => muda(dir, wf(), wf(passo)), { code: 1, includes: [SELECAO] });
  }
  test("formas: um `-t` num comando que NAO e runner nao avisa", (dir) =>
    muda(dir, wf(), wf("      - run: npm test\n      - run: tar -t -f build.tar\n")),
  { code: 0, excludes: [SELECAO] });

  // --- A shell -------------------------------------------------------------------
  test("formas: `shell: bash {0}` (sem o `-e`) num passo avisa", (dir) =>
    muda(dir, wf(), wf("      - shell: bash {0}\n        run: npm test\n")),
  { code: 1, includes: [SEM_E] });
  test("formas: `shell: bash -eo pipefail {0}`, `shell: bash`, `pwsh` e `python {0}` nao avisam", (dir) =>
    muda(dir, wf(), wf("      - shell: bash -eo pipefail {0}\n        run: npm test\n      - shell: bash\n        run: echo b\n" +
      "      - shell: pwsh -command \". '{0}'\"\n        run: echo c\n      - shell: python {0}\n        run: print(1)\n" +
      // Terceira leitura: a aspa, o caminho, o `env` e o `-o errexit` tambem sao formas de `-e`.
      "      - shell: \"bash -e {0}\"\n        run: echo d\n      - shell: 'pwsh -command \". {0}\"'\n        run: echo e\n" +
      "      - shell: /bin/bash -e {0}\n        run: echo f\n      - shell: /usr/bin/env bash -e {0}\n        run: echo g\n" +
      "      - shell: bash -o errexit {0}\n        run: echo h\n")),
  { code: 0, excludes: [SEM_E] });
  test("formas: `if npm test; then ... fi` avisa", (dir) =>
    muda(dir, wf(), wf("      - run: if npm test; then echo ok; fi\n")),
  { code: 1, includes: [CONDICAO] });
  test("formas: `! npm test` avisa", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          ! npm test\n")),
  { code: 1, includes: [CONDICAO] });
  test("formas: `[ ! -f x ]` e `npm ci && npm test` nao avisam", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          [ ! -f x ] && echo sem-x\n          npm ci && npm test\n")),
  { code: 0, excludes: [CONDICAO, ENGOLIDA] });
  test("formas: `npm test && echo ok` com mais linhas depois avisa (o `-e` nao para no meio de um `&&`)", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          npm test && echo ok\n          echo depois\n")),
  { code: 1, includes: [CONDICAO] });

  // --- Segunda leitura do #295 ----------------------------------------------------------
  // A juncao das continuacoes `\\` corria sobre o FICHEIRO inteiro: um `name: t \\` engolia a chave
  // `continue-on-error:` real da linha seguinte, e a marca dela (que ja existia) deixava de a ver.
  test("formas: `name: t \\` + `continue-on-error: true` continua a avisar (o `\\` nao junta chaves YAML)", (dir) =>
    muda(dir, wf(), wf("      - name: t \\\n        continue-on-error: true\n        run: npm test\n")),
  { code: 1, includes: ["`continue-on-error: true`"] });
  test("formas: `npm test \\` como ULTIMA linha de um `run: |` nao junta a chave seguinte", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          npm test \\\n        continue-on-error: true\n")),
  { code: 1, includes: ["`continue-on-error: true`"] });
  // O `&&` num `run:` de UMA linha e o ultimo comando: a falha da lista e o exit do passo.
  test("formas: `run: npm ci && npm test && npm run build` (uma linha) seguido de outro passo nao avisa", (dir) =>
    muda(dir, wf(), wf("      - run: npm ci && npm test && npm run build\n        env:\n          CI: true\n")),
  { code: 0, excludes: [CONDICAO] });
  test("formas: `npm test && echo ok` como ULTIMA linha de um `run: |` nao avisa", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          echo a\n          npm test && echo ok\n")),
  { code: 0, excludes: [CONDICAO] });
  test("formas: `npm test && echo ok` com uma linha em branco e depois outro comando avisa", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          npm test && echo ok\n\n          echo depois\n")),
  { code: 1, includes: [CONDICAO] });
  test("formas: um `!` numa string (`echo \"Pronto! npm test\"`) nao avisa", (dir) =>
    muda(dir, wf(), wf("      - run: npm test\n      - run: echo \"Pronto! npm test a seguir\"\n")),
  { code: 0, excludes: [CONDICAO] });
  for (const [nome, passo] of [
    ["`if ! npm test`", "      - run: if ! npm test; then echo x; fi\n"],
    ["`'! npm test; echo ok'` (o `!` depois da aspa)", "      - run: '! npm test; echo ok'\n"],
    ["`while npm test`", "      - run: while npm test; do break; done\n"],
    ["`until npm test`", "      - run: until npm test; do :; done\n"],
  ]) {
    test(`formas: ${nome} avisa`, (dir) => muda(dir, wf(), wf(passo)), { code: 1, includes: [CONDICAO] });
  }
  // Um `run: >` corta no primeiro `#`: tudo o que vem depois na linha dobrada e comentario de shell.
  test("formas: `run: >` com `# nota` antes de `|| true` nao avisa (o `|| true` e comentario)", (dir) =>
    muda(dir, wf(), wf("      - run: >\n          npm test # nota\n          || true\n")),
  { code: 0, excludes: [ENGOLIDA, "neutralizado"] });
  test("formas: `npx tsc -t es2020` (o `-t` do tsc e o target) nao avisa", (dir) =>
    muda(dir, wf(), wf("      - run: npm test\n      - run: npx tsc -t es2020 --noEmit\n")),
  { code: 0, excludes: [SELECAO] });
  for (const [nome, passo] of [
    ["`--testPathPatterns` (jest 30)", "      - run: npx jest --testPathPatterns=um\n"],
    ["`--grep-invert`", "      - run: npx playwright test --grep-invert @lento\n"],
    ["`pytest -m`", "      - run: pytest -m \"not slow\"\n"],
    ["`--last-failed`", "      - run: pytest --last-failed\n"],
    ["`--onlyChanged`", "      - run: npx jest --onlyChanged\n"],
    ["`--testNamePattern`", "      - run: npx jest --testNamePattern soma\n"],
    ["`-g` (playwright)", "      - run: npx playwright test -g smoke\n"],
  ]) {
    test(`formas: ${nome} no runner avisa`, (dir) => muda(dir, wf(), wf(passo)), { code: 1, includes: [SELECAO] });
  }
  for (const [nome, passo] of [
    ["`shell: true -e {0}` (nao e uma shell)", "      - shell: true -e {0}\n        run: npm test\n"],
    ["`shell: sh {0}` em flow mapping", "      - {shell: sh {0}, run: npm test}\n"],
    ["`\"shell\": sh {0}` com a chave entre aspas", "      - \"shell\": sh {0}\n        run: npm test\n"],
  ]) {
    test(`formas: ${nome} avisa`, (dir) => muda(dir, wf(), wf(passo)), { code: 1, includes: ["shell"] });
  }

  // --- Terceira leitura do #295 ------------------------------------------------------------
  test("formas: trocar o passo por `echo \"skip node .../test-x.mjs\"` faz a contagem descer", (dir) =>
    muda(dir, wf("      - run: |\n          node .agent/scripts/tests/test-x.mjs\n"), wf("      - run: |\n          echo \"skip node .agent/scripts/tests/test-x.mjs\"\n")),
  { code: 1, includes: ["steps de verificacao no CI"] });
  test("formas: uma entrada de matriz com `shell:` (`{ os: x, shell: msys2 }`) nao avisa", (dir) =>
    muda(dir, wf(), wf().replace("    runs-on: ubuntu-latest\n", "    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        include:\n          - { os: windows-latest, shell: msys2 }\n")),
  { code: 0, excludes: ["flow mapping"] });
  test("formas: `run:` VAZIO com o corpo mais indentado (escalar simples) junta as linhas", (dir) =>
    muda(dir, wf(), wf("      - run:\n          npm test\n          || true\n")),
  { code: 1, includes: [ENGOLIDA] });
  test("formas: `run: >-` com `! npm test` no corpo avisa (o `!` continua no inicio do comando)", (dir) =>
    muda(dir, wf(), wf("      - run: >-\n          ! npm test\n")),
  { code: 1, includes: [CONDICAO] });
  test("formas: `run: >` com uma linha em BRANCO mantem os comandos separados (`tar -t` nao e do runner)", (dir) =>
    muda(dir, wf(), wf("      - run: >\n          npm test\n\n          tar -t -f x.tar\n")),
  { code: 0, excludes: [SELECAO] });

  // Do #295, na leitura de confirmacao do #296: um COMENTARIO que acaba em `\\` nao junta a linha
  // seguinte (a shell nao continua comentarios), e o `npm test || true` seguinte continua a contar.
  test("formas: `# nota \\` seguido de `npm test || true` num `run: |` avisa", (dir) =>
    muda(dir, wf(), wf("      - run: |\n          # nota \\\n          npm test || true\n")),
  { code: 1, includes: [ENGOLIDA] });

  // Sem backtracking catastrofico nas entradas novas (o padrao do `tests-surface-blocos.mjs`): num
  // PROCESSO FILHO com `timeout`, porque um regex exponencial nao devolve.
  {
    // O ultimo caso e o que o CodeQL apanhou no PR #298 (js/redos): `\r\n#` repetido depois de um `&&`
    // — o `[^\n]` aceitava o `\r`, e cada linha lia-se de duas formas.
    const nome = "formas: as marcas do #295 medem linhas longas, indentacao funda e flags repetidas em < 5 s";
    // E as duas antigas com o mesmo grupo de runners (a ENGOLIDA e a do pipe), que tinham a mesma
    // ambiguidade nas flags (terceira leitura).
    const novas = MARCAS.filter((m) => /selecao de testes|`shell:`|como condicao|falha engolida|canalizada/.test(m.msg));
    const codigo = `
      const res = ${JSON.stringify(novas.map((m) => [m.re.source, m.re.flags]))}.map(([s, f]) => new RegExp(s, f + "g"));
      const fundo = " ".repeat(2000);
      const casos = [
        Array(300).fill(fundo + "npm test" + " x".repeat(1000)).join("\\n"),
        Array(300).fill(fundo + "npm" + " --a".repeat(40)).join("\\n"),
        Array(300).fill("        npm test &&" + " y".repeat(500)).join("\\n"),
        Array(300).fill("        shell: " + "bash ".repeat(400) + "{0}").join("\\n"),
        "        npm test && x" + "\\r\\n#".repeat(5000) + "\\r\\n",
      ];
      for (const re of res) for (const t of casos) t.match(re);`;
    let problemas = novas.length >= 6 ? [] : [`so ${novas.length} marcas encontradas pela msg`];
    try {
      execFileSync(process.execPath, ["-e", codigo], { timeout: 5000, stdio: "ignore" });
    } catch (err) {
      problemas = [...problemas, err.signal ? `nao terminou em 5 s (${err.signal}) — backtracking?` : `rebentou: ${err.message}`];
    }
    registarResultado(nome, problemas, "");
  }

  // --- As aspas do `run:` ------------------------------------------------------------
  // A CONTAGEM dos passos de verificacao nao reconhecia `run: 'node ...'` (medido na parte 1).
  test("formas: `run: 'node .../test-x.mjs'` conta como o mesmo passo (a contagem nao desce)", (dir) =>
    muda(dir, wf("      - run: node .agent/scripts/tests/test-x.mjs\n"), wf("      - run: 'node .agent/scripts/tests/test-x.mjs'\n")),
  { code: 0, excludes: ["steps de verificacao no CI"] });
  test("formas: `run: 'npm test || true'` entre aspas continua a avisar", (dir) =>
    muda(dir, wf(), wf("      - run: 'npm test || true'\n")),
  { code: 1, includes: [ENGOLIDA] });
}
