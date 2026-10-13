/**
 * Testes do `continue-on-error` por passo e dos scripts do `package.json` — {{PROJECT_NAME}}
 *
 * Do #296 (parte 3 do #285). Duas formas que as marcas por linha nao viam:
 *  - MOVER um `continue-on-error: true` que ja existe (o do passo `Audit`) para o passo que corre os
 *    testes: a contagem por ficheiro fica igual, e o passo de teste deixa de reprovar;
 *  - os `scripts` de teste do `package.json` (`"test": "vitest || true"`), que estavam fora da
 *    superficie.
 *
 * Cada forma tem o seu contra-caso: mover o `continue-on-error` para um passo que NAO corre testes, e
 * um bump de versao, uma dependencia nova ou um script `"build"` mudado no `package.json`.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git } from "./harness/test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-passos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

const CI = ".github/workflows/ci.yml";
const TOLERANTE = "comando de teste num passo ou job com `continue-on-error`";

/** Um workflow com um passo de teste e um passo de auditoria; `ondeCoe` decide onde vive o
 *  `continue-on-error: true` ("audit", "teste", "eco" ou "job-teste"). */
const wf = (ondeCoe) =>
  "name: CI\non:\n  pull_request:\njobs:\n" +
  `  t:\n    runs-on: ubuntu-latest\n${ondeCoe === "job-teste" ? "    continue-on-error: true\n" : ""}    steps:\n` +
  `      - name: Testes\n${ondeCoe === "teste" ? "        continue-on-error: true\n" : ""}        run: npm test\n` +
  `      - name: Eco\n${ondeCoe === "eco" ? "        continue-on-error: true\n" : ""}        run: echo ola\n` +
  `  a:\n    runs-on: ubuntu-latest\n${ondeCoe === "job-audit" ? "    continue-on-error: true\n" : ""}    steps:\n` +
  `      - name: Audit\n${ondeCoe === "audit" ? "        continue-on-error: true\n" : ""}        run: npm audit\n`;

const muda = (dir, ficheiro, antes, depois) => {
  mkdirSync(join(dir, ficheiro.split("/").slice(0, -1).join("/") || "."), { recursive: true });
  writeFileSync(join(dir, ficheiro), antes);
  commit(dir, "antes");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ficheiro), depois);
  commit(dir, "depois");
  return ref;
};

/** Um `package.json` com `scripts` e as dependencias. */
const pkg = ({ scripts = { test: "vitest run", "test:unit": "vitest run unit", build: "next build" }, versao = "1.0.0", deps = { next: "15.0.0" } } = {}) =>
  `${JSON.stringify({ name: "app", version: versao, scripts, dependencies: deps }, null, 2)}\n`;

export function registar() {
  // --- O audit informativo (#303, R7B-6) ---------------------------------------------
  // O desenho que o template recomenda — o passo de audit com `continue-on-error` — era inalcancavel
  // para um derivado que o tinha escalado para gate: a marca da chave contava em qualquer passo, e as
  // marcas nao tem saida. Um bloco que SO audita sai da contagem; tudo o resto continua a contar.
  const CRU = "`continue-on-error: true` acrescentado";
  test("passos: voltar o passo de audit a informativo nao avisa (#303)", (dir) =>
    muda(dir, CI, wf(""), wf("audit")), { code: 0, excludes: [CRU] });
  test("passos: um job que SO audita, informativo, nao avisa (#303)", (dir) =>
    muda(dir, CI, wf(""), wf("job-audit")), { code: 0, excludes: [CRU] });
  test("passos: audit em `run: |`, com flags e uma continuacao, informativo, nao avisa (#303)", (dir) =>
    muda(dir, CI, wf(""), wf("audit").replace("        run: npm audit\n", "        run: |\n          # so producao bloqueia noutro passo\n          npm audit \\\n            --omit=dev\n          pnpm audit --audit-level=high\n")),
  { code: 0, excludes: [CRU] });
  // Os contra-casos: o que NAO e so audit continua a contar.
  test("passos: `continue-on-error` num passo que nao e de audit nem de teste continua a avisar (#303)", (dir) =>
    muda(dir, CI, wf(""), wf("eco")), { code: 1, includes: [CRU] });
  test("passos: `npm audit && npm test` num passo tolerado continua a avisar (#303)", (dir) =>
    muda(dir, CI, wf(""), wf("audit").replace("        run: npm audit\n", "        run: npm audit && npm test\n")), { code: 1, includes: [CRU] });
  test("passos: audit e teste em linhas do mesmo `run: |` continua a avisar (#303)", (dir) =>
    muda(dir, CI, wf(""), wf("audit").replace("        run: npm audit\n", "        run: |\n          npm audit\n          make test\n")), { code: 1, includes: [CRU] });
  test("passos: um passo so com `uses:` tolerado continua a avisar (#303)", (dir) =>
    muda(dir, CI, wf(""), wf("").replace("      - name: Audit\n        run: npm audit\n", "      - name: Audit\n        continue-on-error: true\n        uses: actions/dependency-review-action@v4\n")), { code: 1, includes: [CRU] });

  // --- O `continue-on-error` que muda de passo ---------------------------------------
  test("passos: mover o `continue-on-error` do Audit para o passo de TESTE avisa", (dir) =>
    muda(dir, CI, wf("audit"), wf("teste")), { code: 1, includes: [TOLERANTE] });
  // Desde o #303 a chave do Audit nao conta: move-la para um passo que nao audita e ACRESCENTA-LA a
  // ele, e a marca crua avisa. Antes, a contagem ficava igual — e mover para um `make test` (que a
  // marca de teste nao conhece) passava calado. A marca de TESTE continua sem disparar aqui.
  test("passos: mover o `continue-on-error` do Audit para um passo que NAO corre testes nao dispara a marca de teste", (dir) =>
    muda(dir, CI, wf("audit"), wf("eco")), { code: 1, includes: ["`continue-on-error: true` acrescentado"], excludes: [TOLERANTE] });
  test("passos: um `continue-on-error: false` no passo de teste nao avisa", (dir) =>
    muda(dir, CI, wf("audit"), wf("audit").replace("      - name: Testes\n", "      - name: Testes\n        continue-on-error: false\n")),
  { code: 0, excludes: [TOLERANTE] });
  test("passos: o `continue-on-error` num passo com `run: |` (como o `ci.yml` real) avisa", (dir) =>
    muda(dir, CI, wf("audit"), wf("audit").replace("      - name: Testes\n        run: npm test\n", "      - name: Testes\n        continue-on-error: true\n        run: |\n          npm ci\n          npm run test:unit\n")),
  { code: 1, includes: [TOLERANTE] });
  test("passos: o `continue-on-error` num passo SEM testes ANTES do de teste nao dispara a marca de teste", (dir) =>
    // MOVER (do Audit para o passo "Antes"): desde o #303 e a marca crua que avisa (ver acima).
    muda(dir, CI, wf("audit"), wf("").replace("      - name: Testes\n", "      - name: Antes\n        continue-on-error: true\n        run: echo antes\n      - name: Testes\n")),
  { code: 1, includes: ["`continue-on-error: true` acrescentado"], excludes: [TOLERANTE] });
  // O caso que o #303 passou a apanhar: mover a chave do Audit para um `make test`.
  test("passos: mover o `continue-on-error` do Audit para um `make test` avisa (#303)", (dir) =>
    muda(dir, CI, wf("audit"), wf("").replace("        run: npm test\n", "        continue-on-error: true\n        run: make test\n")),
  { code: 1, includes: ["`continue-on-error: true` acrescentado"] });
  test("passos: a chave `\"run\":` entre aspas num passo tolerado avisa", (dir) =>
    muda(dir, CI, wf("audit"), wf("audit").replace("      - name: Testes\n        run: npm test\n", "      - name: Testes\n        continue-on-error: true\n        \"run\": npm test\n")),
  { code: 1, includes: [TOLERANTE] });
  test("passos: um comentario na coluna 0 dentro do job nao corta o bloco tolerado", (dir) =>
    muda(dir, CI, wf("job-audit"), wf("job-teste").replace("    steps:\n      - name: Testes", "    steps:\n# ---\n      - name: Testes")),
  { code: 1, includes: [TOLERANTE] });
  test("passos: `continue-on-error: ${{ matrix.x }}` passado a `true` avisa", (dir) =>
    muda(dir, CI, wf("audit").replace("    runs-on: ubuntu-latest\n    steps:\n      - name: Testes", "    runs-on: ubuntu-latest\n    continue-on-error: ${{ matrix.experimental }}\n    steps:\n      - name: Testes"),
      wf("audit").replace("    runs-on: ubuntu-latest\n    steps:\n      - name: Testes", "    runs-on: ubuntu-latest\n    continue-on-error: true\n    steps:\n      - name: Testes")),
  { code: 1, includes: [TOLERANTE] });
  test("passos: tirar o `continue-on-error` de um passo `npm test \\` + `|| true` nao faz o `|| true` parecer novo", (dir) =>
    muda(dir, CI, wf("audit").replace("      - name: Testes\n        run: npm test\n", "      - name: Testes\n        continue-on-error: true\n        run: |\n          npm test \\\n            || true\n"),
      wf("audit").replace("      - name: Testes\n        run: npm test\n", "      - name: Testes\n        run: |\n          npm test \\\n            || true\n")),
  { code: 0, excludes: ["falha engolida"] });
  test("passos: `run: npm run test:audit` num passo tolerado nao conta (o audit e informativo de proposito)", (dir) =>
    muda(dir, CI, wf("audit"), wf("audit").replace("run: npm audit", "run: npm run test:audit")),
  { code: 0, excludes: [TOLERANTE] });
  // Do #295, encontrado nesta leitura: `defaults: run: shell:` de JOB era dobrado como um `run:`.
  test("passos: `defaults: run: shell: bash {0}` de JOB avisa (nao e dobrado como um `run:`)", (dir) =>
    muda(dir, CI, wf("audit"), wf("audit").replace("  t:\n    runs-on: ubuntu-latest\n", "  t:\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        shell: bash {0}\n")),
  { code: 1, includes: ["`shell:` que nao para numa falha"] });
  // --- Leitura de confirmacao do #296 ----------------------------------------------------
  // Um job condicional processado PRIMEIRO rebaixava o `true` do passo, e mover esse `true` do Audit
  // para o passo de teste (dentro desse job) nao avisava.
  test("passos: num job CONDICIONAL, mover o `true` de passo do Audit para o de teste avisa", (dir) => {
    const job = (w) => w.replace("  t:\n    runs-on: ubuntu-latest\n", "  t:\n    runs-on: ubuntu-latest\n    continue-on-error: ${{ matrix.experimental }}\n");
    const audit = (w) => w.replace("      - name: Eco\n        run: echo ola\n", "      - name: Audit2\n        continue-on-error: true\n        run: npm audit\n");
    return muda(dir, CI, audit(job(wf(""))), job(wf("teste")).replace("      - name: Eco\n        run: echo ola\n", "      - name: Audit2\n        run: npm audit\n"));
  }, { code: 1, includes: [TOLERANTE] });
  test("passos: `continue-on-error: ${{ true }}` no passo de teste avisa (e sempre verdadeiro)", (dir) =>
    muda(dir, CI, wf("audit"), wf("").replace("      - name: Testes\n", "      - name: Testes\n        continue-on-error: ${{ true }}\n")),
  { code: 1, includes: [TOLERANTE] });
  test("passos: um comentario com `${{ }}` nao torna condicional um `continue-on-error: true`", (dir) =>
    muda(dir, CI, wf("audit"), wf("").replace("      - name: Testes\n", "      - name: Testes\n        continue-on-error: true  # ver: ${{ matrix.x }}\n")),
  { code: 1, includes: [TOLERANTE] });
  test("passos: `continue-on-error: False` e `\"${{ false }}\"` nao toleram (nao avisam)", (dir) =>
    muda(dir, CI, wf("audit"), wf("audit").replace("      - name: Testes\n", "      - name: Testes\n        continue-on-error: False\n").replace("      - name: Eco\n", "      - name: Eco\n        continue-on-error: \"${{ false }}\"\n")),
  { code: 0, excludes: [TOLERANTE] });
  test("passos: `run: >` com uma linha MAIS indentada (comando a parte) leva o prefixo", (dir) =>
    muda(dir, CI, wf("audit"), wf("").replace("      - name: Testes\n        run: npm test\n", "      - name: Testes\n        continue-on-error: true\n        run: >\n          echo a\n            npm test\n")),
  { code: 1, includes: [TOLERANTE] });
  test("passos: mover o `continue-on-error` do JOB de auditoria para o JOB de testes avisa", (dir) =>
    muda(dir, CI, wf("job-audit"), wf("job-teste")), { code: 1, includes: [TOLERANTE] });

  // --- Os scripts de teste do `package.json` -------------------------------------------
  test("passos: `\"test\": \"vitest run || true\"` no package.json avisa", (dir) =>
    muda(dir, "package.json", pkg(), pkg({ scripts: { test: "vitest run || true", "test:unit": "vitest run unit", build: "next build" } })),
  { code: 1, includes: ["script de teste do package.json neutralizado"] });
  test("passos: `--passWithNoTests` num script de teste do package.json avisa", (dir) =>
    muda(dir, "package.json", pkg(), pkg({ scripts: { test: "jest --passWithNoTests", "test:unit": "vitest run unit", build: "next build" } })),
  { code: 1, includes: ["script de teste do package.json com a selecao estreitada"] });
  test("passos: apagar o script `test:unit` do package.json avisa", (dir) =>
    muda(dir, "package.json", pkg(), pkg({ scripts: { test: "vitest run", build: "next build" } })),
  { code: 1, includes: ["scripts de teste do package.json"] });

  // --- Leituras independentes do #296 ---------------------------------------------------
  const S = { test: "vitest run", "test:unit": "vitest run unit", "test:e2e": "playwright test", build: "next build" };
  for (const [nome, scripts] of [
    // A forma mais direta: o valor deixa de correr testes, e a chave continua la.
    ["trocar o valor de `test:unit` por `true`", { ...S, "test:unit": "true" }],
    ["trocar o valor de `test:e2e` por `echo ok`", { ...S, "test:e2e": "echo ok" }],
    // O `ci.yml` faz `if scripts?.['test:unit'] ... else skipping`: renomear salta a suite.
    ["renomear `test:unit` para `test:units`", { test: "vitest run", "test:units": "vitest run unit", "test:e2e": "playwright test", build: "next build" }],
  ]) {
    test(`passos: ${nome} no package.json avisa`, (dir) => muda(dir, "package.json", pkg({ scripts: S }), pkg({ scripts })),
      { code: 1, includes: ["scripts de teste do package.json"] });
  }
  for (const [nome, valor] of [
    ["`|| :`", "vitest run || :"],
    ["`; true`", "vitest run; true"],
    ["aspas escapadas antes do `|| true`", "cross-env N=\"x\" vitest run || true"],
  ]) {
    test(`passos: ${nome} no script de teste avisa`, (dir) => muda(dir, "package.json", pkg({ scripts: S }), pkg({ scripts: { ...S, test: valor } })),
      { code: 1, includes: ["script de teste do package.json neutralizado"] });
  }
  test("passos: `-t` no script de teste e2e (o runner) avisa", (dir) =>
    muda(dir, "package.json", pkg({ scripts: S }), pkg({ scripts: { ...S, "test:e2e": "playwright test -g smoke" } })),
  { code: 1, includes: ["script de teste do package.json com a selecao estreitada"] });
  for (const [nome, valor] of [["`; :`", "vitest run; :"], ["`; echo fim`", "vitest run; echo fim"]]) {
    test(`passos: ${nome} no script de teste avisa`, (dir) => muda(dir, "package.json", pkg({ scripts: S }), pkg({ scripts: { ...S, test: valor } })),
      { code: 1, includes: ["script de teste do package.json neutralizado"] });
  }
  // O runner tem de ser um COMANDO, nao uma palavra algures no valor.
  for (const [nome, valor] of [["`echo vitest`", "echo vitest"], ["`exit 0; vitest`", "exit 0; vitest"]]) {
    test(`passos: trocar \`test:unit\` por ${nome} avisa (o runner nao e um comando)`, (dir) =>
      muda(dir, "package.json", pkg({ scripts: S }), pkg({ scripts: { ...S, "test:unit": valor } })),
    { code: 1, includes: ["scripts de teste do package.json"] });
  }
  // Os runners que os derivados usam de facto: apagar o script faz a contagem descer.
  for (const runner of ["react-scripts test", "ng test", "pnpm -r test", "run-s test:*", "npm-run-all test:*", "nx run-many -t test", "deno test", "karma start", "npm t"]) {
    test(`passos: apagar \`test:unit\` = \`${runner}\` avisa`, (dir) =>
      muda(dir, "package.json", pkg({ scripts: { ...S, "test:unit": runner } }), pkg({ scripts: { test: "vitest run", "test:e2e": "playwright test", build: "next build" } })),
    { code: 1, includes: ["scripts de teste do package.json"] });
  }
  test("passos: apagar um script SO de desenvolvimento (`test:watch`) nao avisa", (dir) =>
    muda(dir, "package.json", pkg({ scripts: { ...S, "test:watch": "vitest" } }), pkg({ scripts: S })),
  { code: 0, excludes: ["package.json:"] });
  test("passos: um `-t` de OUTRA ferramenta (`wait-on -t`) num script de teste nao avisa", (dir) =>
    muda(dir, "package.json", pkg({ scripts: S }), pkg({ scripts: { ...S, "test:e2e": "wait-on -t 60000 http://localhost:3000 && playwright test" } })),
  { code: 0, excludes: ["package.json:"] });
  test("passos: um bump de versao, uma dependencia nova e o script `build` mudado nao avisam", (dir) =>
    muda(dir, "package.json", pkg(), pkg({ versao: "1.1.0", deps: { next: "15.1.0", zod: "3.0.0" }, scripts: { test: "vitest run", "test:unit": "vitest run unit", build: "next build --turbo" } })),
  { code: 0, excludes: ["package.json:"] });
}
