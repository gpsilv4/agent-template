/**
 * Os passos que saltam por uma variavel, de ponta a ponta pelo `check-test-surface` (#353) — {{PROJECT_NAME}}
 *
 * O `case "$TEM_APP"` dos passos da app salta quando a variavel diz que nao ha app: um valor que deixe de vir de um
 * output desliga o passo sem marca. Os casos puros (as formas do valor e do YAML) estao no
 * `tests-saltos-variavel.mjs`; aqui fica o que so se ve com o verificador inteiro: o aviso do gate, o trailer
 * como saida, e o que fica calado. Uma linha por caso, com o esperado num objeto no fim (#359).
 *
 * NAO e um entry point: o `test-test-surface.mjs` descobre-o em disco e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { test } from "./harness/test-surface-harness.mjs";
import { muda } from "./tests-surface-gate.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-saltos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  const OUT = "${{ steps.check.outputs.has_pkg }}";
  const env = (v) => `        env:\n          TEM_APP: ${v}\n`;
  // Um workflow que CORRE TESTES (o `npm run test:unit`), com um passo da app que salta por `TEM_APP`.
  const wf = ({ job = "", passo = env(OUT), outro = "" } = {}) =>
    `name: CI\non:\n  pull_request:\njobs:\n  quality:\n    runs-on: y\n${job}    steps:\n` +
    `      - id: check\n        run: echo "has_pkg=true" >> "$GITHUB_OUTPUT"\n` +
    `      - name: Unit\n${passo}        run: |\n          case "$TEM_APP" in true) ;; false) exit 0;; esac\n          npm run test:unit\n${outro}`;
  const AVISA = "saltam por `TEM_APP` num `case`";
  const TRAILER = "alteracao\n\nTest-Surface: .github/workflows/ci.yml — o passo da app corre sempre neste repo";
  const NODE = "      - name: Build\n        env:\n          NODE_ENV: test\n        run: npm run build\n";
  for (const [nome, antes, depois, msg, { code, includes, excludes }] of [
    ["o output trocado por `'false'` avisa", wf(), wf({ passo: env("'false'") }), "muda", { code: 1, includes: [AVISA, "(`'false'`)"] }],
    ["o output trocado por `${{ x && 'false' }}` avisa", wf(), wf({ passo: env("${{ steps.check.outputs.has_pkg && 'false' }}") }), "muda", { code: 1, includes: [AVISA] }],
    ["o `env:` tirado do passo e `false` no job avisa", wf(), wf({ job: "    env:\n      TEM_APP: false\n", passo: "" }), "muda", { code: 1, includes: [AVISA, "(`false`)"] }],
    ["`true` trocado por `'false'` avisa", wf({ passo: env("true") }), wf({ passo: env("'false'") }), "muda", { code: 1, includes: [AVISA] }],
    ["o output trocado por `true` fica calado (forca o passo a correr)", wf(), wf({ passo: env("true") }), "muda", { code: 0, excludes: [AVISA] }],
    ["um literal numa chave que nenhum `case` le fica calado", wf(), wf({ outro: NODE }), "muda", { code: 0, excludes: [AVISA] }],
    ["um suspeito que ja estava na base fica calado", wf({ passo: env("'false'") }), wf({ passo: env("'false'"), outro: NODE }), "muda", { code: 0, excludes: [AVISA] }],
    ["com o trailer, passa a NOTE com o motivo", wf(), wf({ passo: env("'false'") }), TRAILER, { code: 0, includes: [AVISA, "aceite (Test-Surface: o passo da app corre sempre neste repo)"] }],
  ]) {
    test(`saltos (#353): ${nome}`, (dir) => muda(dir, antes, depois, { msg }), { code, includes, excludes });
  }
}
