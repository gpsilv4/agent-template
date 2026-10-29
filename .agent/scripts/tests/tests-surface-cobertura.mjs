/**
 * Testes das entradas de tabela que NINGUEM exigia — {{PROJECT_NAME}}
 *
 * Medido no #183: desligar cada entrada das tabelas de padroes (`re: /(?!)/`) e correr esta
 * suite. 17 de 47 ficavam verdes — o verificador perdia um detetor e nada o notava. Cada teste
 * aqui muda uma coisa que SO essa entrada apanha: o controlo negativo e a propria medicao.
 *
 * NAO e um entry point: o `test-test-surface.mjs` descobre-o em disco e chama `registar()`.
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { test, commit, git, registarResultado, ROOT, seOGlobExistir, seAContagemExistir } from "./harness/test-surface-harness.mjs";
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

  // --- Os registos do harness (#359) ------------------------------------------------
  // Uma entrada com tres formas; cada caso apaga UMA linha de UMA forma. Atras da guarda: a entrada e do projeto.
  // Os casos sao linhas `[rotulo, ..., { de, para }]` — a forma que a propria entrada conta: apagar um avisa.
  {
    const MSG = "registos, assercoes e linhas de casos (registarResultado)";
    const REG = 'registarResultado("a", []);\n', IDI = '  ...(x ? [] : ["um"]),\n', INV = '  ...(x ? ["um"] : []),\n';
    const OBJ = '  { nome: "a", v: 1 },\n', LIN = '  ["a", 1, { esperado: 1 }],\n', LINC = '  ["b", 2, { esperado: 2 }], // nota\n';
    const DEF = "function registarResultado(n, p) {}\n";
    const lista = (...ls) => `const p = [\n${ls.join("")}];\n`;
    // Os limites escritos na entrada, presos pelo veredicto: um refactor que nao mantem um item por caso AVISA.
    const CINCO = ["a", "b", "c", "d", "e"];
    const SOLTOS = CINCO.map((n) => `registarResultado("${n}", x === 1 ? [] : ["falhou"]);\n`).join("");
    const CICLO = lista(...CINCO.map((n) => `  ["${n}", { esperado: 1 }],\n`)) + 'for (const [n, { esperado }] of p) registarResultado(n, x === esperado ? [] : ["falhou"]);\n';
    const IDIOMAS = `registarResultado("a", [\n${IDI}  ...(y ? [] : ["dois"]),\n]);\n`;
    const FILTRO = 'registarResultado("a", [[x, "um"], [y, "dois"]].filter(([c]) => !c).map(([, m]) => m));\n';
    seAContagemExistir(MSG, "cobertura (registos)", () => {
      for (const [nome, antes, depois, { de, para }] of [
        ["apagar um registo desce", REG + REG, REG, { de: 2, para: 1 }],
        ["a definicao nao conta (o lookbehind)", DEF + REG + REG, DEF + REG, { de: 2, para: 1 }],
        ["apagar uma linha do idioma `c ? [] : [\"msg\"]` desce", lista(IDI, IDI), lista(IDI), { de: 2, para: 1 }],
        ["apagar uma linha do inverso `c ? [\"msg\"] : []` desce", lista(INV, INV), lista(INV), { de: 2, para: 1 }],
        ["apagar uma linha `{ nome: ... }` de uma tabela desce", lista(OBJ, OBJ), lista(OBJ), { de: 2, para: 1 }],
        ["apagar uma linha `[rotulo, ..., { esperado }]` desce", lista(LIN, LINC), lista(LINC), { de: 2, para: 1 }],
        ["apagar a mesma forma com um comentario no fim desce", lista(LIN, LINC), lista(LIN), { de: 2, para: 1 }],
        ["acrescentar fica calado", REG, REG + REG, { de: 1, para: 2 }],
        ["5 registos soltos -> 1 registo num ciclo sobre 5 linhas avisa (10 -> 7, limite)", SOLTOS, CICLO, { de: 10, para: 7 }],
        ["o idioma consolidado num `.filter().map()` avisa (3 -> 1, limite)", IDIOMAS, FILTRO, { de: 3, para: 1 }],
      ]) {
        test(`cobertura (registos): ${nome}`, (dir) => muda(dir, "tests/a.test.js", antes, depois),
          para < de ? { code: 1, includes: [`${MSG}: ${de} -> ${para}`] } : { code: 0, excludes: [`${MSG}:`] });
      }
      test("cobertura (registos): mover um registo para outro ficheiro fica calado", (dir) => {
        mkdirSync(join(dir, "tests"), { recursive: true });
        writeFileSync(join(dir, "tests/a.test.js"), REG + REG);
        writeFileSync(join(dir, "tests/b.test.js"), "");
        commit(dir, "antes");
        const ref = git(dir, ["rev-parse", "HEAD"]);
        writeFileSync(join(dir, "tests/a.test.js"), REG);
        writeFileSync(join(dir, "tests/b.test.js"), REG);
        commit(dir, "depois");
        return ref;
      }, { code: 0, includes: [`${MSG}: 2 -> 1 — o total da superficie NAO desceu (movido, nao perdido)`] });
      // O custo, num processo filho com `timeout` (a razao no `tests-surface-blocos.mjs`): um caso por cuidado
      // escrito na entrada. Sem eles: 257 s, 10,9 s e 14,9 s; com eles, < 100 ms cada.
      const nome = "cobertura (registos): linhas de espacos, `, {` e `?[\"\"` repetidos medem-se em < 5 s";
      const re = CONTAGENS.find((c) => c.msg === MSG).re;
      const codigo = `
        const g = new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags + "g")});
        for (const t of ["\\n".repeat(20000), " ".repeat(200).concat("\\n").repeat(20000), "[\\"\\"" + ", {".repeat(50000), "?[\\"\\"".repeat(50000)]) t.match(g);`;
      let problemas = [];
      try {
        execFileSync(process.execPath, ["-e", codigo], { timeout: 5000, stdio: "ignore" });
      } catch (err) {
        problemas = [err.signal ? `nao terminou em 5 s (${err.signal}) — backtracking?` : `rebentou: ${err.message}`];
      }
      registarResultado(nome, problemas, "");
    });
  }

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

  // --- Os globs da `config/` (parte C do #183) -----------------------------------------
  // Chaveados pelo texto (`seOGlobExistir`, no harness): a config e do projeto. Cada caminho e
  // apanhado SO pelo glob que o caso cobre. O oitavo (`vitest|jest|...config`) tem os seus dois
  // testes no `test-test-surface.mjs`, atras do mesmo filtro.
  const APAGAR = (rel) => ({ antes: 'export const x = 1;\nif (x) throw new Error("x");\n', depois: null, msg: `${rel}: ficheiro da superficie de teste APAGADO` });
  const MUDAR = (rel) => ({ antes: "[cfg]\na = 1\n", depois: "[cfg]\na = 2\n", msg: rel, tambem: "configuracao do runner alterada" });
  for (const [glob, rel, caso] of [
    ["/(^|\\/)(tests?|__tests__|spec|e2e)\\//i", "spec/a.mjs", APAGAR],
    ["/\\.(test|spec)\\.[cm]?[jt]sx?$/i", "src/a.test.js", APAGAR],
    ["/_test\\.py$/i", "src/a_test.py", APAGAR],
    ["/(^|\\/)test_[^/]+\\.py$/i", "src/test_a.py", APAGAR],
    ["/(^|\\/)(conftest|factories)\\.py$/i", "conftest.py", MUDAR],
    ["/(^|\\/)(pytest\\.ini|tox\\.ini)$/i", "pytest.ini", MUDAR],
    ["/(^|\\/)\\.mocharc\\./i", ".mocharc.json", MUDAR],
  ]) {
    const nome = `cobertura (config): ${rel}`;
    const c = caso(rel);
    seOGlobExistir(glob, nome, () =>
      test(nome, (dir) => muda(dir, rel, c.antes, c.depois), { code: 1, includes: [c.msg, ...(c.tambem ? [c.tambem] : [])] }));
  }
}
