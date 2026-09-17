/**
 * Testes do Guard 19 (isolamento das suites) — {{PROJECT_NAME}}
 *
 * Espelha `guards/isolamento.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco
 * e chama `registar()`.
 *
 * O QUE ESTE GUARD PROTEGE, e porque os testes tem de ser exigentes: a varredura de mutacao corre
 * em paralelo, e o que torna isso seguro nao e o codigo dela — e as suites nao se verem umas as
 * outras. Se este guard falhar ABERTO, o paralelismo continua a parecer funcionar e passa a dar
 * vermelhos que nao sao reais. Um vermelho que nao e real ensina a re-correr em vez de investigar,
 * e ai a rede toda deixou de valer.
 *
 * Por isso cada regra tem os DOIS lados: o caso que avisa e o caso vizinho que NAO pode avisar.
 * Sem o segundo, um guard que avisasse sempre passava metade destes testes.
 */
import { pathToFileURL } from "url";
import { test, writeF } from "./test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-isolamento.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Uma suite sintetica no sandbox. O nome TEM de casar a convencao `test-*`/`tests-*`, senao o
 *  guard nem olha para ela — e essa e uma das coisas que estes testes medem. */
const suite = (dir, nome, corpo) => writeF(dir, `.agent/scripts/${nome}`, corpo);

export function registar() {
  // --- O estado limpo do repo ------------------------------------------------
  test("G19: o repo como esta passa — as suites reais sao isoladas", null, {
    code: 0,
    includes: ["Guard 19:", "suites isoladas"],
  });

  // --- 1. Caminho temporario fixo -------------------------------------------
  // O caso que mais interessa: e o unico dos tres que se escreve por distraccao, e o que
  // produz corrupcao silenciosa em vez de um erro.
  test("G19: caminho temporario FIXO avisa", (dir) => {
    suite(dir, "test-mau.mjs", 'import { join } from "path";\nconst d = join(tmpdir(), "fixo");\n');
  }, { code: 1, includes: ["test-mau.mjs:2", "caminho temporario fixo", "mkdtempSync"] });

  // O vizinho que NAO pode avisar. Sem ele, um guard que acusasse toda a linha com `tmpdir()`
  // passava o teste de cima — e foi exactamente esse o primeiro erro deste guard, apanhado
  // quando ele acusou o `test-upgrade-harness.mjs`, que faz tudo bem.
  test("G19: `mkdtempSync(join(tmpdir(), ...))` NAO avisa", (dir) => {
    suite(dir, "test-bom.mjs", 'const d = mkdtempSync(join(tmpdir(), "prefixo-"));\n');
  }, { code: 0, includes: ["suites isoladas"] });

  // O segundo vizinho, e o caso real que motivou a correccao: `tmpdir()` sozinho nao e um
  // caminho — e um valor por omissao que vai para o `mkdtempSync` mais abaixo.
  test("G19: `tmpdir()` sozinho (valor por omissao) NAO avisa", (dir) => {
    suite(dir, "test-bom.mjs", "export function cenario({ base = tmpdir() } = {}) {\n  return base;\n}\n");
  }, { code: 0, includes: ["suites isoladas"] });

  // --- 2. Portas e servidores ------------------------------------------------
  test("G19: servidor a ouvir numa porta avisa", (dir) => {
    suite(dir, "test-mau.mjs", "const s = createServer(fn);\n");
  }, { code: 1, includes: ["porta ou servidor", "EADDRINUSE"] });

  test("G19: `.listen(` tambem avisa", (dir) => {
    suite(dir, "test-mau.mjs", "servidor.listen(3000);\n");
  }, { code: 1, includes: ["porta ou servidor"] });

  // --- 3. Escrita em process.env ---------------------------------------------
  test("G19: ESCRITA em process.env avisa", (dir) => {
    suite(dir, "test-mau.mjs", 'process.env.MODO = "teste";\n');
  }, { code: 1, includes: ["escrita em process.env", "estado global"] });

  // A metade que impede a regra de virar ruido: LER o ambiente e legitimo e comum (`process.env.CI`
  // aparece em codigo normal). Uma regra que nao distinga leitura de escrita acusa toda a gente,
  // e uma regra que acusa toda a gente e desligada na primeira semana.
  test("G19: LER process.env NAO avisa", (dir) => {
    suite(dir, "test-bom.mjs", "if (process.env.CI) console.log(\"no CI\");\n");
  }, { code: 0, includes: ["suites isoladas"] });

  // --- O que o guard NAO olha ------------------------------------------------
  // Um `check-*.mjs` nao e uma suite: pode abrir o que quiser, e nao corre em paralelo com
  // nada. Sem este teste, alargar o guard a todo o repo passava despercebido — e ai ele
  // reprovava codigo correcto, que e a forma mais rapida de o fazer desaparecer.
  test("G19: um verificador (nao-suite) com porta NAO e acusado", (dir) => {
    writeF(dir, ".agent/scripts/check-servidor.mjs", "createServer(fn).listen(8080);\n");
  }, { code: 0, includes: ["suites isoladas"] });

  // As fixtures deste repo SAO strings com codigo dentro, e esse codigo corre noutro processo,
  // no seu proprio sandbox. Acusa-las era acusar precisamente os testes que existem para medir
  // o isolamento — o guard a morder quem lhe obedece.
  test("G19: codigo dentro de um literal (fixture) NAO e acusado", (dir) => {
    suite(dir, "test-bom.mjs", 'writeFileSync(f, \'process.env.X = "1"; createServer(fn);\');\n');
  }, { code: 0, includes: ["suites isoladas"] });

  // E o contra-caso do contra-caso: o guard ignora o CONTEUDO das strings, nao a linha inteira.
  // Uma implementacao que saltasse qualquer linha com aspas deixava passar uma violacao real
  // escrita ao lado de um texto qualquer.
  test("G19: violacao REAL ao lado de um literal continua a ser acusada", (dir) => {
    suite(dir, "test-mau.mjs", 'const d = join(tmpdir(), "fixo"); console.log("a montar");\n');
  }, { code: 1, includes: ["caminho temporario fixo"] });

  // Comentarios que MENCIONEM o padrao nao sao codigo. Este ficheiro e o proprio guard estao
  // cheios deles — se contassem, o repo reprovava por se documentar a si proprio.
  test("G19: comentario que menciona o padrao NAO avisa", (dir) => {
    suite(dir, "test-bom.mjs", '// nunca fazer join(tmpdir(), "fixo") aqui\nconst x = 1;\n');
  }, { code: 0, includes: ["suites isoladas"] });
}
