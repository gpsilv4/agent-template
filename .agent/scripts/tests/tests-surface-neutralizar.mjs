/**
 * Testes das formas de NEUTRALIZAR um passo de teste num workflow — {{PROJECT_NAME}}
 *
 * O passo continua la (a contagem de steps nao desce) e nenhum `skip` aparece, mas a falha deixa
 * de chegar ao CI: `|| :` ou `|| exit 0`, o mesmo dentro de um `run: |`, a saida canalizada para
 * `cat`/`tee` (sem `pipefail`), `continue-on-error: ${{ true }}`, um passo em flow mapping. Do
 * #281. Cada forma leva o contra-teste do que NAO pode contar: o mesmo texto num `.js` (codigo
 * normal) e o mesmo idioma num comando que nao corre testes.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, registarResultado } from "./harness/test-surface-harness.mjs";
import { MARCAS } from "../lib/surface-patterns.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-neutralizar.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

/** Um workflow cujos passos sao `passos` (texto YAML ja indentado), antes e depois. */
const workflow = (dir, wf, antes, depois) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, `.github/workflows/${wf}`), `jobs:\n  t:\n    steps:\n${antes}`);
  commit(dir, "antes");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, `.github/workflows/${wf}`), `jobs:\n  t:\n    steps:\n${depois}`);
  commit(dir, "depois");
  return ref;
};
const PASSO = "      - run: node a-test.mjs\n";
const ENGOLIDA = "falha engolida";
const CANALIZADA = "saida de um step canalizada";

export function registar() {
  // --- A falha engolida -----------------------------------------------------------
  test("`|| :` num passo de teste E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs || :\n"), { code: 1, includes: [ENGOLIDA] });
  test("`|| exit 0` num passo de teste E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs || exit 0\n"), { code: 1, includes: [ENGOLIDA] });
  test("`|| true` no CORPO de um `run: |` E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: |\n          node a-test.mjs\n", "      - run: |\n          node a-test.mjs || true\n"),
  { code: 1, includes: [ENGOLIDA] });
  // A marca larga (`run:` na mesma linha) apanha o runner de qualquer stack, que a nova (so os
  // comandos de verificacao conhecidos) nao ve: e por isso que as duas coexistem.
  test("`run: make test || true` (outra stack) E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: make test\n", "      - run: make test || true\n"),
  { code: 1, includes: ["step de teste neutralizado com `|| true`"], excludes: [ENGOLIDA] });
  test("`|| exit 1` (a falha continua) NAO e enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs || exit 1\n"), { code: 0, excludes: [ENGOLIDA] });
  // Num `run: |` (a marca antiga, `run:` na mesma linha, nao chega la): e o `ci.yml` deste repo.
  test("`grep ... || true` num comando que NAO corre testes nao conta", (dir) =>
    workflow(dir, "ci.yml", PASSO, `${PASSO}      - run: |\n          n=$(grep -c x ficheiro || true)\n`), { code: 0, excludes: [ENGOLIDA] });
  test("`npm run test:unit || true` (o runner de um derivado) num `run: |` E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: |\n          npm run test:unit\n", "      - run: |\n          npm run test:unit || true\n"),
  { code: 1, includes: [ENGOLIDA] });
  // As marcas novas sao SO dos workflows: num `.js`, um harness que corre um comando com `|| true`
  // e um objeto com uma chave `if:` que abre a linha sao codigo normal (sem o filtro, contavam os dois).
  test("num `.js`, `|| true` num comando e um `{` no inicio da linha nao sao marcas", (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      'test("soma", () => { expect(1 + 1).toBe(2); });\n' +
        'execSync("node x-test.mjs || true");\nconst casos = [\n{ if: 1 },\n];\n');
    commit(dir, "um || true e um { em JS");
  }, { code: 0, excludes: [ENGOLIDA, "passo em flow mapping"] });

  // --- A saida canalizada (a shell do GitHub Actions nao tem `pipefail`) ------------
  test("`| cat` num passo de teste E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs | cat\n"), { code: 1, includes: [CANALIZADA] });
  test("`| tee` num passo de teste E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs | tee saida.log\n"), { code: 1, includes: [CANALIZADA] });
  test("`| tee` num comando que NAO corre testes nao conta", (dir) =>
    workflow(dir, "ci.yml", PASSO, `${PASSO}      - run: echo ola | tee saida.log\n`), { code: 0, excludes: [CANALIZADA] });
  test("`npx playwright test | tee` E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: npx playwright test\n", "      - run: npx playwright test | tee saida.log\n"), { code: 1, includes: [CANALIZADA] });

  // --- `continue-on-error` noutras formas -------------------------------------------
  test("`continue-on-error: ${{ true }}` E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, `${PASSO}        continue-on-error: \${{ true }}\n`),
  { code: 1, includes: ["`continue-on-error: true`"] });
  test("`continue-on-error: True` E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, `${PASSO}        continue-on-error: True\n`), { code: 1, includes: ["`continue-on-error: true`"] });

  // --- Um passo em flow mapping -------------------------------------------------------
  test("um passo em flow mapping (`- {…}`) pede confirmacao", (dir) =>
    workflow(dir, "ci.yml", `${PASSO}      - run: echo outro\n`, `${PASSO}      - {name: t, if: false, run: echo outro}\n`),
  { code: 1, includes: ["passo em flow mapping"] });
  test("um flow mapping que JA estava na baseline nao e novo", (dir) =>
    workflow(dir, "ci.yml", `${PASSO}      - {name: t, if: false, run: echo outro}\n`, `${PASSO}      - {name: t, if: false, run: echo outro}\n      - run: echo mais\n`),
  { code: 0, excludes: ["passo em flow mapping"] });

  // --- Familia A da leitura independente: as variacoes da mesma neutralizacao (#281) --
  test("`|| echo falhou` num passo de teste E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs || echo falhou\n"), { code: 1, includes: [ENGOLIDA] });
  test("`|| { echo x; exit 1; }` (a falha continua) NAO e enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs || { echo x; exit 1; }\n"), { code: 0, excludes: [ENGOLIDA] });
  test("`node .githooks/... || true` (o hook do CI) num `run: |` E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: |\n          node .githooks/commit-msg f\n", "      - run: |\n          node .githooks/commit-msg f || true\n"),
  { code: 1, includes: [ENGOLIDA] });
  test("`|| true` dentro de aspas (`sh -c '...'`) E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: |\n          echo antes\n          sh -c 'node b-test.mjs'\n",
      "      - run: |\n          echo antes\n          sh -c 'node b-test.mjs || true'\n"), { code: 1, includes: [ENGOLIDA] });
  test("`|& tee` num passo de teste E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs |& tee log\n"), { code: 1, includes: [CANALIZADA] });
  test("`| tail` num passo de teste E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs | tail -n 5\n"), { code: 1, includes: [CANALIZADA] });
  test("`|| false` (a falha continua) NAO e enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, "      - run: node a-test.mjs || false\n"), { code: 0, excludes: [ENGOLIDA] });
  test("`run: make test || exit 0` (outra stack, a marca larga) E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: make test\n", "      - run: make test || exit 0\n"),
  { code: 1, includes: ["step de teste neutralizado com `|| true`"] });
  test("`set +e` no corpo de um passo E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", "      - run: |\n          node a-test.mjs\n", "      - run: |\n          set +e\n          node a-test.mjs\n"),
  { code: 1, includes: ["`set +e`"] });
  test("`continue-on-error: ${{ !false }}` E enfraquecimento", (dir) =>
    workflow(dir, "ci.yml", PASSO, `${PASSO}        continue-on-error: \${{ !false }}\n`), { code: 1, includes: ["`continue-on-error: true`"] });
  test("uma entrada de matriz em flow mapping (`- { os: ... }`) NAO e marca", (dir) =>
    workflow(dir, "ci.yml", PASSO, `    strategy:\n      matrix:\n        include:\n          - { os: ubuntu-latest, node: 20 }\n${PASSO}`),
  { code: 0, excludes: ["passo em flow mapping"] });
  test("um `.yml` que NAO e workflow (fixture em `tests/`) nao conta", (dir) => {
    writeFileSync(join(dir, "tests/dados.yml"), "passos:\n  - run: node a-test.mjs\n");
    commit(dir, "fixture");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "tests/dados.yml"), "passos:\n  - run: node a-test.mjs | tee log\n  - {if: false}\n");
    commit(dir, "fixture mudada");
    return ref;
  }, { code: 0, excludes: [CANALIZADA, "passo em flow mapping"] });

  // --- A tabela das variantes (segunda leitura do #281): cada alternativa da regex presa por um caso --
  // Uma linha num `run: |` novo. `null` = nao pode contar. Cada alternativa do grupo dos runners e cada
  // excecao do `||` tem aqui o seu caso, para que tira-la (ou alarga-la) fique vermelho.
  const VARIANTES = [
    // a falha engolida, nos runners de um derivado e nas formas que escapavam
    ["npm t || true", ENGOLIDA], ["pnpm -r test || true", ENGOLIDA], ["pnpm exec vitest || true", ENGOLIDA],
    ["yarn vitest || true", ENGOLIDA], ["npx --yes vitest || true", ENGOLIDA], ["npm run typecheck || :", ENGOLIDA],
    ["npm run lint || true", ENGOLIDA], ["npm run build || true", ENGOLIDA], ["pnpm test || true", ENGOLIDA],
    ["npx tsc --noEmit || true", ENGOLIDA], ["npx jest || true", ENGOLIDA], ["pytest -q || true", ENGOLIDA],
    ["node x-check.mjs || true", ENGOLIDA], ["node x-sweep.mjs || true", ENGOLIDA], ["node simulate-x.mjs || true", ENGOLIDA],
    ["node a-test.mjs || { echo falhou; exit $?; }", ENGOLIDA], ["node a-test.mjs || true; [ -f x ] || exit 1", ENGOLIDA],
    ["node a-test.mjs || true  # TODO exit 1", ENGOLIDA], ["node a-test.mjs || exit 00", ENGOLIDA],
    // o que NAO e falha engolida
    ["node a-test.mjs || exit $?", null], ["node a-test.mjs || exit", null], ["node a-test.mjs || rc=$?", null],
    ['node a-test.mjs || exit "$rc"', null], ["node a-test.mjs || (echo x && false)", null],
    ["npx playwright test --project=${{ inputs.project || 'chromium' }}", null], ["node x-test.mjs; grep -c y f || true", null],
    ["node x-test.mjs # || true", null], ["node scripts/latest-version.mjs || true", null], ["node checkout.js || true", null],
    ["npx tsc-alias || true", null], ["pip install pytest || true", null], ["npm run lint:fix || true", null],
    // a saida canalizada
    ["npm run build 2>&1 | tee build.log", CANALIZADA], ["node x-test.mjs && grep -E 'a|b' f", null], ["node x-test.mjs; echo a | tee b", null],
    // `set +o errexit`
    ["set +o errexit", "`set +e`"],
  ];
  // O grupo dos runners esta escrito DUAS vezes (a varredura so ve literais): as copias nao podem divergir.
  {
    const grupo = (k) => {
      const src = MARCAS.find((m) => m.msg.startsWith(k)).re.source;
      return src.slice(src.indexOf("(?:\\bnode"), src.indexOf("\\bpytest\\b)") + 11);
    };
    const [a, b] = [grupo("falha engolida"), grupo("saida de um step")];
    registarResultado("o grupo dos runners e IGUAL nas duas marcas (falha engolida, saida canalizada)",
      a.length > 50 && a === b ? [] : [`as copias divergem:\n${a}\n${b}`]);
  }
  for (const [linha, msg] of VARIANTES) {
    test(`variante: \`${linha}\` ${msg ? "conta" : "NAO conta"}`, (dir) =>
      workflow(dir, "ci.yml", PASSO, `${PASSO}      - run: |\n          ${linha}\n`),
    msg ? { code: 1, includes: [msg] } : { code: 0, excludes: [ENGOLIDA, CANALIZADA, "`set +e`"] });
  }
  // As formas de chave e de valor (fora de um `run:`)
  test("flow mapping com a chave entre aspas (`\"if\": false`) conta", (dir) =>
    workflow(dir, "ci.yml", `${PASSO}      - run: echo outro\n`, `${PASSO}      - {name: t, "if": false, run: echo outro}\n`),
  { code: 1, includes: ["passo em flow mapping"] });
  for (const valor of ['"false"', "'false'", "${{ false }}", "false  # nunca"]) {
    test(`\`continue-on-error: ${valor}\` NAO conta`, (dir) =>
      workflow(dir, "ci.yml", PASSO, `${PASSO}        continue-on-error: ${valor}\n`), { code: 0, excludes: ["`continue-on-error: true`"] });
  }
  // Le o texto CRU, logo so nos workflows: um teste em `.js` escreve-o dentro de uma string.
  test("`continue-on-error: true` dentro de uma string de um `.js` NAO conta", (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      'test("soma", () => { expect(1 + 1).toBe(2); });\nconst yaml = `jobs:\n  continue-on-error: true\n`;\n');
    commit(dir, "fixture com continue-on-error");
  }, { code: 0, excludes: ["`continue-on-error: true`"] });
  test("`continue-on-error: \"true\"` (entre aspas) conta", (dir) =>
    workflow(dir, "ci.yml", PASSO, `${PASSO}        continue-on-error: "true"\n`), { code: 1, includes: ["`continue-on-error: true`"] });
  test("`run: make test || :` (a marca larga) conta", (dir) =>
    workflow(dir, "ci.yml", "      - run: make test\n", "      - run: make test || :\n"), { code: 1, includes: ["step de teste neutralizado com `|| true`"] });
  test("um `.yaml` (outra extensao) tambem e workflow", (dir) =>
    workflow(dir, "ci.yaml", PASSO, "      - run: node a-test.mjs | tee log\n"), { code: 1, includes: [CANALIZADA] });

  // --- O `codeql.yml` do PROJETO (sem o cabecalho do template) conta no total --------
  // O cabecalho le-se na BASELINE: tirar o `SO DO TEMPLATE` no mesmo PR que move um passo para o
  // `codeql.yml` nao o faz passar por "movido".
  test("tirar o cabecalho do `codeql.yml` no mesmo PR que lhe move um passo continua perdido", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    const escreve = (ci, cab, codeql) => {
      writeFileSync(join(dir, ".github/workflows/ci.yml"), `jobs:\n  t:\n    steps:\n${ci}`);
      writeFileSync(join(dir, ".github/workflows/codeql.yml"), `${cab}jobs:\n  t:\n    steps:\n${codeql}`);
    };
    escreve(`${PASSO}      - run: node b-test.mjs\n`, "# **SO DO TEMPLATE.**\n", "      - run: echo x\n");
    commit(dir, "dois passos no ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    escreve(PASSO, "# ja nao e do template\n", "      - run: echo x\n      - run: node b-test.mjs\n");
    commit(dir, "tirar o cabecalho e mover");
    return ref;
  }, { code: 1, includes: ["steps de verificacao no CI"], excludes: ["movido, nao perdido"] });
  test("passo movido do `ci.yml` para o `codeql.yml` do PROJETO e \"movido, nao perdido\"", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    const escreve = (ci, codeql) => {
      writeFileSync(join(dir, ".github/workflows/ci.yml"), `jobs:\n  t:\n    steps:\n${ci}`);
      writeFileSync(join(dir, ".github/workflows/codeql.yml"), `# CodeQL do projeto\njobs:\n  t:\n    steps:\n${codeql}`);
    };
    escreve(`${PASSO}      - run: node b-test.mjs\n`, "      - run: echo x\n");
    commit(dir, "dois passos no ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    escreve(PASSO, "      - run: echo x\n      - run: node b-test.mjs\n");
    commit(dir, "mover para o codeql do projeto");
    return ref;
  }, { code: 0, includes: ["movido, nao perdido"] });
}
