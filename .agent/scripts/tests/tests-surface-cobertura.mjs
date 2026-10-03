/**
 * Testes das entradas de tabela que NINGUEM exigia — {{PROJECT_NAME}}
 *
 * Medido no #183: desligar cada entrada das tabelas de padroes (`re: /(?!)/`) e correr esta
 * suite. 17 de 47 ficavam verdes — o verificador perdia um detetor e nada o notava. Cada teste
 * aqui muda uma coisa que SO essa entrada apanha: o controlo negativo e a propria medicao.
 *
 * NAO e um entry point: o `test-test-surface.mjs` descobre-o em disco e chama `registar()`.
 */
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import { readFileSync } from "fs";
import { test, commit, git, registarResultado, ROOT } from "./harness/test-surface-harness.mjs";
import { CONTAGENS, MARCAS } from "../lib/surface-patterns.mjs";
import { PARES } from "../lib/pares.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-cobertura.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

/** Escreve `antes`, commita, escreve `depois` (ou apaga, com `null`), commita, e devolve a base. */
const muda = (dir, rel, antes, depois) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), antes);
  commit(dir, "antes");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  if (depois === null) rmSync(join(dir, rel));
  else writeFileSync(join(dir, rel), depois);
  commit(dir, "depois");
  return ref;
};

export function registar() {
  // A varredura encontra as entradas pela FORMA (`{ re: /.../`, o `re` primeiro). Uma entrada
  // escrita de outra maneira (`{ msg: "x", re: /y/ }`) nao era sitio e entrava sem teste e sem
  // aviso. Contar os sitios contra as entradas exportadas fecha isso (#183).
  {
    const rel = ".agent/scripts/lib/surface-patterns.mjs";
    const par = PARES.find((p) => p.alvo === rel);
    const linhas = readFileSync(join(ROOT, rel), "utf8").split("\n").filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l));
    const sitios = par ? linhas.filter((l) => par.sinal.test(l)).length : -1;
    const entradas = CONTAGENS.length + MARCAS.length;
    registarResultado("cobertura: a varredura ve TODAS as entradas das tabelas (forma `{ re: ... }`)",
      sitios === entradas ? [] : [par ? `${sitios} sitio(s) para ${entradas} entrada(s) — ha uma entrada noutra forma` : `sem par para ${rel} em PARES`]);
  }

  // --- Contagens que so uma entrada mede -----------------------------------------
  test("cobertura: apagar um `def test_` (python) baixa a contagem", (dir) =>
    muda(dir, "tests/test_a.py", "def test_um():\n    pass\n\ndef test_dois():\n    pass\n", "def test_um():\n    pass\n"),
  { code: 1, includes: ["casos de teste (python): 2 -> 1"] });

  test("cobertura: apagar assercoes `eq(` baixa a contagem", (dir) =>
    muda(dir, "tests/a.test.js", 'test("a", () => { eq(x, "um"); eq(y, "dois"); });\n', 'test("a", () => {});\n'),
  { code: 1, includes: ["assercoes (eq/contem): 2 -> 0"] });

  test("cobertura: apagar um `throw new Error` de uma suite baixa a contagem", (dir) =>
    muda(dir, "tests/a.test.js", 'test("a", () => { if (x) throw new Error("um"); if (y) throw new Error("dois"); });\n',
      'test("a", () => { if (x) throw new Error("um"); });\n'),
  { code: 1, includes: ["assercoes (throw): 2 -> 1"] });

  // --- Marcas que so uma entrada apanha --------------------------------------------
  test("cobertura: `test.concurrent.skip` acrescentado e detetado", (dir) =>
    muda(dir, "tests/a.test.js", 'test.concurrent("a", () => {});\n', 'test.concurrent.skip("a", () => {});\n'),
  { code: 1, includes: ["tests/a.test.js", "skip/only com modificador"] });

  test("cobertura: `pytest.skip(...)` acrescentado e detetado", (dir) =>
    muda(dir, "tests/test_b.py", "def test_um():\n    pass\n", 'def test_um():\n    pytest.skip("sem rede")\n'),
  { code: 1, includes: ["tests/test_b.py", "skip programatico"] });

  // --- Ficheiros que so um glob poe na superficie -----------------------------------
  // Apagar e a forma mais brutal de enfraquecer: um ficheiro fora da superficie desaparecia
  // sem uma palavra.
  for (const [rel, porque] of [
    ["test-raiz.mjs", "o glob de prefixo `tests?[-_]`"],
    [".agent/scripts/check-novo.mjs", "os instrumentos `check-*`"],
    [".agent/scripts/lib/modulo.mjs", "os modulos de `.agent/scripts/lib/`"],
    // Fixa que o harness continua na superficie depois de perder a linha propria (#183). Nao prova
    // QUAL glob o apanha (tambem casa o `tests/` da config); o de prefixo exige-o o `test-raiz`.
    [".agent/scripts/tests/harness/test-harness.mjs", "o harness continua na superficie"],
  ]) {
    test(`cobertura: apagar ${rel} e detetado (${porque})`, (dir) =>
      muda(dir, rel, 'export const x = 1;\nif (x) throw new Error("x");\n', null),
    { code: 1, includes: [`${rel}: ficheiro da superficie de teste APAGADO`] });
  }
}
