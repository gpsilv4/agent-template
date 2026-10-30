/**
 * Os passos novos antes das suites, de ponta a ponta pelo `check-test-surface` (#362) — {{PROJECT_NAME}}
 *
 * Um passo novo antes das suites, num job da maquinaria, pode desliga-las sem lhes tocar. Os casos puros (as formas
 * do passo e da shell) estao no `tests-passos-novos.mjs`; aqui fica o que so se ve com o verificador inteiro e um git
 * de verdade: o aviso do gate, o trailer como saida, e o que fica calado. Uma linha por caso (#359).
 *
 * NAO e um entry point: o `test-test-surface.mjs` descobre-o em disco e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { test, commit, git, registarResultado } from "./harness/test-surface-harness.mjs";
import { verificaGate } from "../lib/superficie-gate.mjs";
import { muda } from "./tests-surface-gate.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-passos-novos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  // Um workflow com um job da maquinaria: o checkout, o que vier `antes`, e as suites.
  const wf = (antes = "") =>
    `name: CI\non:\n  pull_request:\njobs:\n  guard:\n    runs-on: y\n    steps:\n      - uses: actions/checkout@v4\n${antes}` +
    `      - run: node .agent/scripts/tests/test-guards.mjs\n`;
  const AVISA = "um passo novo antes das suites no job `guard`";
  const TRAILER = "alteracao\n\nTest-Surface: .github/workflows/ci.yml — o passo novo e deliberado";
  for (const [nome, antes, depois, msg, { code, includes, excludes }] of [
    ["reescrever uma suite antes de ela correr avisa", wf(), wf("      - run: printf 'process.exit(0)' > .agent/scripts/tests/test-guards.mjs\n"), "muda", { code: 1, includes: [AVISA, "expande ou redireciona"] }],
    ["o `BASH_ENV` no `$GITHUB_ENV` avisa", wf(), wf('      - run: echo "BASH_ENV=./x.sh" >> "$GITHUB_ENV"\n'), "muda", { code: 1, includes: [AVISA] }],
    ["o `BASH_ENV` num `env:` ao lado de `run: ls` avisa", wf(), wf("      - env:\n          BASH_ENV: ./x.sh\n        run: ls\n"), "muda", { code: 1, includes: [AVISA, "tem a chave `env:`"] }],
    ["um `run: ls` novo fica calado", wf(), wf("      - run: ls\n"), "muda", { code: 0, excludes: [AVISA] }],
    ["com o trailer, passa a NOTE com o motivo", wf(), wf("      - run: printf x > f\n"), TRAILER, { code: 0, includes: [AVISA, "aceite (Test-Surface: o passo novo e deliberado)"] }],
  ]) {
    test(`passos novos (#362): ${nome}`, (dir) => muda(dir, antes, depois, { msg }), { code, includes, excludes });
  }

  // O CONTEXTO do PR lido de um git de verdade (a 2.a leitura): um modulo da maquinaria que ja existia, MUDADO no PR e
  // chamado por um passo novo antes das suites, avisa; o mesmo modulo sem mudanca fica calado.
  for (const [nome, depoisDoModulo, { code, includes, excludes }] of [
    ["um modulo mudado no PR e chamado antes das suites avisa", "process.exit(0);\n", { code: 1, includes: ["corre `.agent/scripts/lib/x.mjs`, mudado no PR"] }],
    ["o mesmo modulo sem mudanca fica calado", null, { code: 0, excludes: [AVISA] }],
  ]) {
    test(`passos novos (#362): ${nome}`, (dir) => {
      mkdirSync(join(dir, ".agent/scripts/lib"), { recursive: true });
      mkdirSync(join(dir, ".github/workflows"), { recursive: true });
      writeFileSync(join(dir, ".agent/scripts/lib/x.mjs"), "export const x = 1;\n");
      writeFileSync(join(dir, ".github/workflows/ci.yml"), wf());
      commit(dir, "antes");
      const ref = git(dir, ["rev-parse", "HEAD"]);
      if (depoisDoModulo) writeFileSync(join(dir, ".agent/scripts/lib/x.mjs"), depoisDoModulo);
      writeFileSync(join(dir, ".github/workflows/ci.yml"), wf("      - run: node .agent/scripts/lib/x.mjs\n"));
      commit(dir, "depois");
      return ref;
    }, { code, includes, excludes });
  }

  // Uma PASTA com nome de script (`d.mjs/index.js`), na base, com o `index.js` mudado no PR: o `ls-tree` ve a pasta,
  // e so o "e um blob" a separa de um ficheiro que nao mudou (a 1.a leitura).
  test("passos novos (#362): uma pasta com nome de script, com o conteudo mudado, avisa", (dir) => {
    mkdirSync(join(dir, ".agent/scripts/lib/d.mjs"), { recursive: true });
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".agent/scripts/lib/d.mjs/index.js"), "module.exports = 1;\n");
    writeFileSync(join(dir, ".github/workflows/ci.yml"), wf());
    commit(dir, "antes");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/lib/d.mjs/index.js"), "process.exit(0);\n");
    writeFileSync(join(dir, ".github/workflows/ci.yml"), wf("      - run: node .agent/scripts/lib/d.mjs\n"));
    commit(dir, "depois");
    return ref;
  }, { code: 1, includes: ["corre `.agent/scripts/lib/d.mjs`, novo no PR"] });

  // FALHA FECHADA: sem o diff do PR, avisa. Chamado direto, com um `git` que rebenta no `diff --raw`: no verificador
  // inteiro o git ja falhou antes, e o ramo nao se alcanca de ponta a ponta.
  {
    const avisos = [];
    verificaGate({
      f: ".github/workflows/ci.yml", antes: wf(), agora: wf("      - run: ls\n"), contavel: true, base: "b",
      git: (a) => { if (a[0] === "diff") throw new Error("sem git"); return ""; },
      ler: () => null, warn: (m) => avisos.push(m), note: () => {},
    });
    registarResultado("passos novos (#362): sem o diff do PR, avisa (falha fechada)",
      avisos.some((m) => m.includes("nao consegui ler o que o PR mudou (sem git)")) ? [] : [`avisos: ${JSON.stringify(avisos)}`]);
  }
}
