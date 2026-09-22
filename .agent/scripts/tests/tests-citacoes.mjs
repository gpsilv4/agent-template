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
import { test, writeF, readF } from "./harness/test-harness.mjs";

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

  // --- Guard 20b: a ANCORA de um ponteiro de racional (#112) -------------------
  // O guard ja garantia que um ficheiro citado EXISTE. Nao garantia que ele contem o que a
  // citacao promete — e foi por ai que dois ponteiros partiram ao mover evidencia no #106,
  // com a bateria inteira verde. Um ficheiro que existe com a seccao movida para fora
  // le-se exactamente como um ponteiro valido.

  test("G20: ponteiro para uma seccao que NAO existe no destino avisa", (dir) => {
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") +
      '\n\nVer o detalhe (porque: `upgrade-why.md` § "Seccao Que Nunca Existiu").\n');
  }, { code: 1, includes: ['aponta para "Seccao Que Nunca Existiu"', "a evidencia mudou de sitio"] });

  // O CASO DO #106, montado: a seccao existe, o ponteiro aponta-lhe, e depois ela **sai**.
  // E a unica forma de provar que isto apanha o defeito real e nao so um nome inventado.
  test("G20: seccao APAGADA do destino deixa o ponteiro a mentir", (dir) => {
    // ACRESCENTAR, nunca substituir: o `upgrade-why.md` real e o destino de tres ponteiros deste
    // repo, e reescreve-lo partia-os — o teste passava a medir o estrago da propria fixture.
    const why = readF(dir, "src/docs/upgrade-why.md");
    writeF(dir, "src/docs/upgrade-why.md", why + "\n## Uma Seccao Qualquer\n\nracional.\n");
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") +
      '\n\nVer (porque: `upgrade-why.md` § "Uma Seccao Qualquer").\n');
    // ... e agora a evidencia muda de sitio, exactamente como no #106: so ESTA seccao sai.
    writeF(dir, "src/docs/upgrade-why.md", why + "\n## Outro Titulo\n\nracional.\n");
  }, { code: 1, includes: ['aponta para "Uma Seccao Qualquer"'] });

  // O terceiro ramo: o ficheiro de destino nao existe DE TODO. Distinto do anterior — la o
  // ficheiro existe e a seccao e que nao; aqui nem ha destino. Sem este caso o ramo ficava sem
  // cobertura, e a varredura dizia-o (4/5).
  test("G20: ponteiro para um ficheiro `-why` que nao existe avisa", (dir) => {
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") +
      '\n\nVer (porque: `inventado-why.md` § "Qualquer Titulo").\n');
  }, { code: 1, includes: ["aponta para `inventado-why.md`", "que nao existe"] });

  test("G20: ponteiro SEM ancora avisa (a convencao nao e opcional)", (dir) => {
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + "\n\nVer (porque: `upgrade-why.md`).\n");
  }, { code: 1, includes: ["sem ancora", "Titulo exacto da seccao"] });

  test("G20: ponteiro com ancora que RESOLVE nao avisa", (dir) => {
    writeF(dir, "src/docs/upgrade-why.md",
      readF(dir, "src/docs/upgrade-why.md") + "\n## Titulo Que Existe\n\nracional.\n");
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") +
      '\n\nVer (porque: `upgrade-why.md` § "Titulo Que Existe").\n');
  }, { code: 0, excludes: ["sem ancora", "a evidencia mudou de sitio"] });
}
