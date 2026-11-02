/**
 * O `if: ${{ !cancelled() }}` dos passos da app, de ponta a ponta pelo `check-test-surface` (#428) — {{PROJECT_NAME}}
 *
 * Um `if:` num passo e uma marca (pode saltar). O `!cancelled()` so faz um passo correr MAIS do que o default
 * (`success()`), e e isento, na forma exacta, so nos passos do job `quality` do `ci.yml` (`lib/marcas-yaml.mjs`,
 * `NAO_CANCELADO`). A mesma forma noutro job (um `deploy`, que correria com os testes vermelhos — a licao do #308),
 * noutro workflow, ou como `if:` do proprio job, continua a contar; e qualquer cauda tambem. Uma linha por caso.
 *
 * NAO e um entry point: o `test-test-surface.mjs` descobre-o em disco e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { test } from "./harness/test-surface-harness.mjs";
import { muda } from "./tests-surface-gate.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-nao-cancelado.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  const IF = "condicao `if:`";
  // Um workflow que CORRE TESTES, com dois passos num job `id`; `cond` e o `if:` do 2.o passo (ou do job, `noJob`).
  const wf = (cond = null, { id = "quality", noJob = false, passo = "Unit Tests" } = {}) =>
    `name: CI\non:\n  pull_request:\njobs:\n  ${id}:\n    runs-on: y\n${noJob && cond !== null ? `    if: ${cond}\n` : ""}    steps:\n` +
    `      - name: Install\n        run: npm ci\n` +
    `      - name: ${passo}\n${!noJob && cond !== null ? `        if: ${cond}\n` : ""}        run: npm run test:unit\n`;
  const DEPLOY = { ficheiro: ".github/workflows/release.yml" };
  for (const [nome, depois, opts, { code, includes, excludes }] of [
    ["a forma exacta num passo do `quality` do `ci.yml` nao conta", wf("${{ !cancelled() }}"), {}, { code: 0, excludes: [IF] }],
    ["entre aspas simples nao conta", wf("'${{ !cancelled() }}'"), {}, { code: 0, excludes: [IF] }],
    ["sem espacos no `${{ }}` nao conta", wf("${{!cancelled()}}"), {}, { code: 0, excludes: [IF] }],
    ["sem `${{ }}`, entre aspas, nao conta", wf('"!cancelled()"'), {}, { code: 0, excludes: [IF] }],
    ["com um comentario nao conta", wf("${{ !cancelled() }}  # todas as falhas numa corrida"), {}, { code: 0, excludes: [IF] }],
    ["com uma cauda (`}} && false`, uma string sempre verdadeira) conta", wf("${{ !cancelled() }} && false"), {}, { code: 1, includes: [IF] }],
    ["`!cancelled() && x` conta", wf("${{ !cancelled() && github.event_name == 'push' }}"), {}, { code: 1, includes: [IF] }],
    ["`success() || x` conta", wf("${{ success() || false }}"), {}, { code: 1, includes: [IF] }],
    ["`failure()` conta", wf("${{ failure() }}"), {}, { code: 1, includes: [IF] }],
    ["`always()` num passo conta", wf("${{ always() }}"), {}, { code: 1, includes: [IF] }],
    ["uma continuacao na linha seguinte conta", wf("${{ !cancelled() }}\n          && false"), {}, { code: 1, includes: [IF] }],
    ["`! cancelled()` (outra grafia) conta: falha fechada", wf("${{ ! cancelled() }}"), {}, { code: 1, includes: [IF] }],
    ["a mesma forma como `if:` do JOB conta", wf("${{ !cancelled() }}", { noJob: true }), {}, { code: 1, includes: [IF] }],
    ["a mesma forma num passo de um `deploy` conta (#308)", wf("${{ !cancelled() }}", { id: "deploy" }), {}, { code: 1, includes: [IF] }],
    ["a mesma forma noutro workflow conta", wf("${{ !cancelled() }}"), DEPLOY, { code: 1, includes: [IF] }],
    // A leitura independente do #428: so as verificacoes, pelo nome, e a forma mesmo exacta.
    ["a mesma forma num passo do `quality` que nao e uma verificacao (um Deploy) conta", wf("${{ !cancelled() }}", { passo: "Deploy" }), {}, { code: 1, includes: [IF] }],
    ["`${{ !cancelled()` sem o `}}` conta", wf("${{ !cancelled()"), {}, { code: 1, includes: [IF] }],
    ["`!cancelled() }}` sem o `${{` conta", wf("\x27!cancelled() }}\x27"), {}, { code: 1, includes: [IF] }],
    ["um `#` colado (`}}#x`, um escalar) conta", wf("${{ !cancelled() }}#x"), {}, { code: 1, includes: [IF] }],
  ]) {
    test(`nao cancelado (#428): ${nome}`, (dir) => muda(dir, wf(null, { id: /deploy/.test(nome) ? "deploy" : "quality" }), depois, opts), { code, includes, excludes });
  }
}
