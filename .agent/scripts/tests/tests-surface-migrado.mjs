/**
 * Testes do MIGRADO e das RENOMEACOES do `check-test-surface` — {{PROJECT_NAME}}
 *
 * O `git diff` lista com `--no-renames` (um `git mv` para fora da superficie e APAGADO) e le os
 * pares do git com `-M`: uma renomeacao para dentro da superficie e MIGRADO, e a ORIGEM entra no
 * total com a baseline (mover e perder testes no mesmo commit avisa). O destino de uma renomeacao
 * compara as MARCAS com a baseline da origem. Tudo do #279.
 *
 * As fixtures tem conteudo PARECIDO mas nao igual (abaixo de 100% de semelhanca): e o caso em que o
 * caminho da renomeacao se distingue do do homonimo (`tests-surface-marks.mjs`).
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git } from "./harness/test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-migrado.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

/** Um ficheiro de teste com `n` casos (o bastante parecido entre versoes para o git o emparelhar). */
const casos = (n) =>
  Array.from({ length: n }, (_, i) => `test("caso ${i}", () => { expect(${i} + 1).toBe(${i + 1}); });\n`).join("");

export function registar() {
  // Renomeacao com o conteudo MUDADO (um caso a mais): o par do git e um R abaixo de 100.
  test("renomeado para outro nome COM um caso a mais e MIGRADO", (dir) => {
    writeFileSync(join(dir, "tests/a.test.js"), casos(4));
    commit(dir, "quatro casos");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["mv", "tests/a.test.js", "tests/b.test.js"]);
    writeFileSync(join(dir, "tests/b.test.js"), casos(5));
    commit(dir, "renomear e acrescentar");
    return ref;
  }, { code: 0, includes: ["MIGRADO para tests/b.test.js (renomeado"] });
  // Renomeacao que PERDE um caso: a origem entra no total, logo o total desce.
  test("renomeado para outro nome com um caso A MENOS e perdido", (dir) => {
    writeFileSync(join(dir, "tests/a.test.js"), casos(4));
    commit(dir, "quatro casos");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["mv", "tests/a.test.js", "tests/b.test.js"]);
    writeFileSync(join(dir, "tests/b.test.js"), casos(3));
    commit(dir, "renomear e perder");
    return ref;
  }, { code: 1, includes: ["tests/a.test.js: casos de teste: 4 -> 0"] });
  // O `-M` explicito: com `diff.renames=false` na config, o git deixava de emparelhar.
  test("com `diff.renames=false`, a renomeacao continua MIGRADO", (dir) => {
    git(dir, ["config", "diff.renames", "false"]);
    writeFileSync(join(dir, "tests/a.test.js"), casos(4));
    commit(dir, "quatro casos");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["mv", "tests/a.test.js", "tests/b.test.js"]);
    commit(dir, "renomear");
    return ref;
  }, { code: 0, includes: ["MIGRADO para tests/b.test.js (renomeado"] });
  // O HOMONIMO que ja existia e NAO foi tocado: apagar a origem perde os casos dela.
  test("apagar um teste com um homonimo intocado noutra pasta e perdido", (dir) => {
    mkdirSync(join(dir, "tests/sub"), { recursive: true });
    writeFileSync(join(dir, "tests/sub/exemplo.test.js"), casos(2));
    commit(dir, "homonimo");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    rmSync(join(dir, "tests/exemplo.test.js"));
    commit(dir, "apagar o original");
    return ref;
  }, { code: 1, includes: ["tests/exemplo.test.js: casos de teste: 1 -> 0"] });
  // A contagem `zero` no total: juntar tres `process.exit(1)` num helper E renomear o ficheiro.
  const veredicto = (exits) =>
    "// verificador\n" + "const x = 1;\n".repeat(30) + "process.exit(1);\n".repeat(exits);
  test("renomear um verificador e juntar os `process.exit(1)` nao e perda", (dir) => {
    writeFileSync(join(dir, ".agent/scripts/check-x.mjs"), veredicto(3));
    commit(dir, "tres saidas");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["mv", ".agent/scripts/check-x.mjs", ".agent/scripts/check-y.mjs"]);
    writeFileSync(join(dir, ".agent/scripts/check-y.mjs"), veredicto(1));
    commit(dir, "renomear e consolidar");
    return ref;
  }, { code: 0, includes: ["movido, nao perdido"], excludes: ["  WARN  "] });
  test("renomear um verificador e TIRAR todos os `process.exit(1)` E perda", (dir) => {
    writeFileSync(join(dir, ".agent/scripts/check-x.mjs"), veredicto(3));
    commit(dir, "tres saidas");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["mv", ".agent/scripts/check-x.mjs", ".agent/scripts/check-y.mjs"]);
    writeFileSync(join(dir, ".agent/scripts/check-y.mjs"), veredicto(0));
    commit(dir, "renomear e desligar");
    return ref;
  }, { code: 1, includes: ["veredicto do runner (process.exit(1))"] });
  // O DESTINO de uma renomeacao compara as MARCAS com a baseline da origem: uma marca antiga nao e nova.
  test("renomear um workflow com um `continue-on-error` antigo nao o da como acrescentado", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    const wf = "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        continue-on-error: true\n" +
      "      - run: echo passo\n".repeat(10);
    writeFileSync(join(dir, ".github/workflows/ci.yml"), wf);
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["mv", ".github/workflows/ci.yml", ".github/workflows/checks.yml"]);
    commit(dir, "renomear o workflow");
    return ref;
  }, { code: 0, excludes: ["`continue-on-error: true` acrescentado"] });
  test("renomear um workflow e ACRESCENTAR um `continue-on-error` continua a contar", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    const wf = "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n" + "      - run: echo passo\n".repeat(10);
    writeFileSync(join(dir, ".github/workflows/ci.yml"), wf);
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["mv", ".github/workflows/ci.yml", ".github/workflows/checks.yml"]);
    const novo = join(dir, ".github/workflows/checks.yml");
    writeFileSync(novo, readFileSync(novo, "utf8").replace("node a-test.mjs\n", "node a-test.mjs\n        continue-on-error: true\n"));
    commit(dir, "renomear e desligar");
    return ref;
  }, { code: 1, includes: ["`continue-on-error: true` acrescentado"] });
}
