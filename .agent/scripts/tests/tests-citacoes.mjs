/**
 * Testes do Guard 20 (citacoes de ficheiro nas instrucoes) — {{PROJECT_NAME}}
 *
 * Espelha `guards/citacoes.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco e
 * chama `registar()`.
 *
 * O QUE ESTE GUARD ARRISCA, e por isso os contra-casos sao mais do que os casos: ele le **prosa**,
 * e prosa tem exemplos, padroes e nomes genericos. Um guard que os acuse acusa quem lhe obedece — e
 * um guard assim e desligado na primeira semana. Aconteceu ao Guard 19, cuja primeira versao
 * acusou um harness que fazia tudo bem.
 *
 * Por isso a fronteira esta medida: dos 21 nomes nus que este repo cita nas instrucoes, **20
 * resolvem para exactamente um ficheiro** e 13 deles vivem numa subpasta. Se o guard exigisse a
 * pasta, acusava 13 citacoes correctas.
 */
import { pathToFileURL } from "url";
import { test, writeF, file } from "./harness/test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-citacoes.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Uma rule sintetica que cita `nome`. As rules do sandbox sao reais; esta acrescenta-se. */
const citaEm = (dir, texto) => writeF(dir, ".agent/rules/exemplo-citacao.md", `# Exemplo\n\n${texto}\n`);

export function registar() {
  // --- O estado limpo do repo ------------------------------------------------
  test("G20: o repo como esta passa — todas as citacoes resolvem", null, {
    code: 0,
    includes: ["Guard 20:", "todas resolvem para um so"],
  });

  // --- Citacao MORTA: o defeito que o guard existe para apanhar ---------------
  // Nao da erro nenhum sem este guard: fica a mentir ate alguem a seguir, e quem a segue perde
  // tempo a procurar antes de desconfiar da documentacao.
  test("G20: citar um ficheiro que nao existe avisa", (dir) => {
    citaEm(dir, "Correr o `check-inexistente.mjs` antes de commit.");
  }, {
    code: 1,
    includes: ["exemplo-citacao.md:3", "`check-inexistente.mjs`", "nao existe", "procurar o que nao ha"],
  });

  // --- Os CONTRA-CASOS, e sao eles que impedem o guard de virar ruido ---------
  // 1. Um nome que resolve para um ficheiro em SUBPASTA nao e defeito. Sem este caso, o guard
  //    acusava 13 citacoes correctas deste repo e era desligado.
  test("G20: nome de ficheiro em subpasta, citado sem a pasta, NAO avisa", (dir) => {
    citaEm(dir, "Os testes dos guards vivem no `test-guards.mjs`.");
  }, { code: 0, includes: ["todas resolvem para um so"] });

  // 2. Um PADRAO nao e um ficheiro. A prosa deste repo usa-os constantemente.
  test("G20: um padrao (`tests-*.mjs`) NAO avisa", (dir) => {
    citaEm(dir, "Cada modulo `tests-*.mjs` declara o seu entry point.");
  }, { code: 0, includes: ["todas resolvem para um so"] });

  // 3. Um EXEMPLO inventado. O `hooks-guide.md` tem um destes de verdade, e e legitimo: serve para
  //    dizer "um ficheiro qualquer com este feitio".
  test("G20: um exemplo inventado (`tests-x.mjs`) NAO avisa", (dir) => {
    citaEm(dir, "Um ficheiro chamado `tests-x.mjs` que passa sem correr nada e a forma errada.");
  }, { code: 0, includes: ["todas resolvem para um so"] });

  // --- Ambiguidade: dois ficheiros com o mesmo nome ---------------------------
  // Hoje nao acontece, e e por isso que tem de ser medido: quando acontecer, a instrucao manda
  // procurar um nome que corresponde a dois sitios e nao diz qual.
  test("G20: nome que existe em DOIS sitios avisa por ambiguidade", (dir) => {
    writeF(dir, ".agent/scripts/duplicado.mjs", "// um\n");
    writeF(dir, ".agent/scripts/lib/duplicado.mjs", "// outro\n");
    citaEm(dir, "Ver o `duplicado.mjs`.");
  }, {
    code: 1,
    includes: ["`duplicado.mjs`", "existem 2", "a instrucao nao diz qual"],
  });

  // --- O que o guard NAO olha ------------------------------------------------
  // Os ficheiros de `.agent/scripts/` inventam nomes de proposito (fixtures). Varre-los era acusar
  // o desenho dos testes — e a razao pela qual o guard so le `rules/` e `workflows/`.
  test("G20: nome inventado por uma FIXTURE em .agent/scripts/ nao e acusado", (dir) => {
    writeF(dir, ".agent/scripts/tests/tests-inventa.mjs", 'const f = "`check-que-nao-existe.mjs`";\n');
  }, { code: 0, includes: ["todas resolvem para um so"] });
}
