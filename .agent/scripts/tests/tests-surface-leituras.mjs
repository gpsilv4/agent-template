/**
 * O `pyproject.toml` (o que traz alem da selecao de testes) e as formas que a terceira leitura deixou: o blob da baseline
 * ausente, o `skipIf` do vitest, a tabela `each` esvaziada, e o apostrofo num comentario — {{PROJECT_NAME}}
 *
 * Sairam do `test-test-surface.mjs` quando ele chegou as 495 linhas (o Guard 17, #400): os casos sao os mesmos, so
 * mudaram de ficheiro. NAO e um entry point: o `test-test-surface.mjs` descobre este modulo e chama `registar()`.
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, apagaObjetoSolto } from "./harness/test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-leituras.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  // --- `pyproject.toml` traz muito mais que a selecao de testes ----------------
  // Medido: com ele em `CONFIG_GLOBS`, um bump de versao ou de dependencias dava exit 1 em
  // qualquer projeto Python — a mesma classe de falso positivo que ja se removeu para os
  // workflows do `.github/`.

  test("pyproject: bump de versao/deps NAO e enfraquecimento", (dir) => {
    writeFileSync(join(dir, "pyproject.toml"),
      '[project]\nname = "x"\nversion = "0.1.0"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n');
    commit(dir, "pyproject");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "pyproject.toml"),
      '[project]\nname = "x"\nversion = "0.2.0"\ndependencies = ["httpx"]\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n');
    commit(dir, "bump");
    return ref;
  }, { code: 0 });

  test("pyproject: estreitar o testpaths E enfraquecimento", (dir) => {
    writeFileSync(join(dir, "pyproject.toml"),
      '[tool.pytest.ini_options]\ntestpaths = ["tests"]\naddopts = "-ra"\n');
    commit(dir, "pyproject");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "pyproject.toml"), '[tool.pytest.ini_options]\naddopts = "-ra"\n');
    commit(dir, "estreitar");
    return ref;
  }, { code: 1, includes: ["selecao de testes do pytest: 2 -> 1"] });

  test("blob da baseline ausente REPROVA (e nao trata o ficheiro como novo)", (dir) => {
    // Apagar o objeto do blob: o `git diff` tambem precisa dele para comparar, logo falha
    // primeiro — e o que se afirma e que o verificador **reprova por nao conseguir medir**, em
    // vez de tratar o ficheiro como novo e dar exit 0 sobre uma suite esvaziada.
    const blob = git(dir, ["rev-parse", "HEAD:tests/exemplo.test.js"]);
    apagaObjetoSolto(dir, blob); // confirma que desapareceu: empacotado, o rm nao fazia nada (#379)
    writeFileSync(join(dir, "tests/exemplo.test.js"), 'test("soma", () => { expect(1).toBe(1); });\n');
    return "HEAD";
  }, { code: 1, includes: ["nao conseguiu listar as alteracoes"] });

  test("skipIf do vitest e apanhado (o \\b falhava antes do If)", (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      'test.skipIf(true)("soma", () => { expect(1 + 1).toBe(2); });\n');
    commit(dir, "skipIf");
  }, { code: 1, includes: ["skipIf"] });

  test("tabela `each` esvaziada faz a contagem descer", (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      'test.each([[1], [2]])("caso %i", (n) => { expect(n).toBeTruthy(); });\n');
    commit(dir, "each com tabela");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      'test.each([])("caso %i", (n) => { expect(n).toBeTruthy(); });\n');
    commit(dir, "esvaziar a tabela");
    return ref;
  }, { code: 1, includes: ["tabelas `each` nao vazias: 1 -> 0"] });

  test("apostrofo num comentario nao dessincroniza a contagem", (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      "// nota: don't skip isto\ntest(\"a\", () => { expect(1).toBe(1); });\ntest(\"b\", () => { expect(2).toBe(2); });\n");
    commit(dir, "com comentario");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      "// nota: don't skip isto, e nao mexer\ntest(\"a\", () => { expect(1).toBe(1); });\ntest(\"b\", () => { expect(2).toBe(2); });\n");
    commit(dir, "editar o comentario");
    return ref;
  }, { code: 0 });
}
