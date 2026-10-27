/**
 * A isencao do `if:` do PLANO da varredura na marca do `if:` — {{PROJECT_NAME}}
 *
 * Do #347, C2. O job `sweep` do `ci.yml` so arranca quando o plano da base diz que a varredura se aplica:
 * `if: github.event_name == 'pull_request' && needs.guard-tests.outputs.aplica == 'true'`. Essa condicao e
 * uma marca do `check-test-surface` (o `if:` e a forma mais barata de desligar uma verificacao), e nenhum
 * trailer a aceita — sem a isencao, o PR que a traz e cada derivado que a adote ficavam vermelhos sem saida.
 * A isencao vive em `lib/marcas-yaml.mjs`; o porque esta la.
 *
 * Os dois lados, como nas outras isencoes (`tests-surface-gate.mjs`): a forma exacta nao conta, e cada forma
 * que dela se afasta — uma cauda, outro operador, outro output, outro job, um passo, outro workflow — CONTA.
 * Sem o segundo lado, alargar a isencao "resolvia" o falso positivo desligando a marca.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { test } from "./harness/test-surface-harness.mjs";
import { muda } from "./tests-surface-gate.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-plano.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

const IF = "condicao `if:`";
const PL = "github.event_name == 'pull_request' && needs.guard-tests.outputs.aplica == 'true'";
const base = "jobs:\n  guard-tests:\n    runs-on: y\n    steps:\n      - run: node a-test.mjs\n";
/** O `sweep` (ou outro job `id`) com a condicao `cond` como `if:` de JOB, ou sem `if:` (`null`). */
const comJob = (cond, id = "sweep") =>
  `${base}  ${id}:\n    needs: guard-tests\n    runs-on: y\n${cond === null ? "" : `    if: ${cond}\n`}    steps:\n      - run: node b-test.mjs\n`;

export function registar() {
  for (const [rotulo, cond] of [["nua", PL], ["em ${{ }}", `\${{ ${PL} }}`], ["entre aspas", `"${PL}"`], ["com comentario", `${PL}  # so com o plano`]]) {
    test(`gate: \`if:\` do plano como if do job \`sweep\` nao conta (#347 C2) — ${rotulo}`, (dir) =>
      muda(dir, comJob(null), comJob(cond)),
    { code: 0, excludes: [IF] });
  }
  for (const [rotulo, cond] of [
    ["uma cauda `&& false`", `${PL} && false`], ["`(...) || true`", `(${PL}) || true`], ["um `)` a mais", `${PL})`],
    ["aspas trocadas", `"${PL}'`], ["uma continuacao", `${PL}\n      && false`],
    ["`!= 'true'`", PL.replace("== 'true'", "!= 'true'")], ["`== 'false'`", PL.replace("'true'", "'false'")],
    ["outro output", PL.replace("outputs.aplica", "outputs.x")], ["outro job no `needs.`", PL.replace("needs.guard-tests", "needs.quality")],
    ["sem a metade do `pull_request`", "needs.guard-tests.outputs.aplica == 'true'"], ["`||` no lugar do `&&`", PL.replace("&&", "||")],
  ]) {
    test(`gate: \`if:\` do plano alterado continua a contar (#347 C2) — ${rotulo}`, (dir) =>
      muda(dir, comJob(null), comJob(cond)),
    { code: 1, includes: [IF] });
  }
  test("gate: a forma do plano num PASSO do `sweep` conta (#347 C2)", (dir) =>
    muda(dir, comJob(null), `${base}  sweep:\n    runs-on: y\n    steps:\n      - if: ${PL}\n        run: node b-test.mjs\n`),
  { code: 1, includes: [IF] });
  // A chave como ULTIMA do ultimo passo: a indentacao dela nao e a das chaves do job.
  test("gate: a forma do plano no fim do ultimo passo do `sweep` conta (#347 C2)", (dir) =>
    muda(dir, comJob(null), `${base}  sweep:\n    runs-on: y\n    steps:\n      - name: t\n        run: node b-test.mjs\n        if: ${PL}\n`),
  { code: 1, includes: [IF] });
  // Noutro job do `ci.yml` o portao nao recalcula nada por ele: saltar as suites ou a app pelo plano CONTA.
  for (const id of ["guard-tests", "quality", "simulators"]) {
    test(`gate: a forma do plano no job \`${id}\` do ci.yml conta (#347 C2)`, (dir) =>
      muda(dir, id === "guard-tests" ? "jobs:\n  guard-tests:\n    runs-on: y\n    steps:\n      - run: node a-test.mjs\n" : comJob(null, id),
        id === "guard-tests" ? `jobs:\n  guard-tests:\n    runs-on: y\n    if: ${PL}\n    steps:\n      - run: node a-test.mjs\n` : comJob(PL, id)),
    { code: 1, includes: [IF] });
  }
  test("gate: a forma do plano noutro workflow conta (#347 C2)", (dir) =>
    muda(dir, comJob(null), comJob(PL), { ficheiro: ".github/workflows/deploy.yml" }),
  { code: 1, includes: [IF] });
}
