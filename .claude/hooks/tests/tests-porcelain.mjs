/**
 * O parser do `git status --porcelain -z` (`lib/porcelain.mjs`) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: a funcao vivia em duas copias que ja tinham divergido (A3 do #195). Os hooks que a
 * usam tem testes de ponta a ponta; este afirma o contrato da propria funcao, sem `git`: o que
 * casa e o que nao casa num caminho, o par das renomeacoes, e o apagado.
 */
import { pathToFileURL } from "url";
import { caminhosPorcelain } from "../lib/porcelain.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-porcelain.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** Uma saida de `git status --porcelain -z`: entradas separadas por NUL, com o NUL final. */
const z = (...entradas) => `${entradas.join("\0")}\0`;

export function registar({ test, eq }) {
  test("porcelain: o caminho sai cru, sem a coluna de estado", () => {
    eq(JSON.stringify(caminhosPorcelain(z(" M a.mjs", "?? pasta/b c.mjs"))),
      JSON.stringify([{ caminho: "a.mjs", apagado: false }, { caminho: "pasta/b c.mjs", apagado: false }]),
      "os caminhos tem de sair sem o estado, e com o espaco intacto");
  });

  test("porcelain: uma renomeacao consome as DUAS entradas, e devolve o caminho novo", () => {
    // `R  novo\0antigo\0`: a segunda entrada e um caminho nu, sem coluna de estado.
    eq(JSON.stringify(caminhosPorcelain(z("R  novo.mjs", "antigo.mjs", " M outro.mjs"))),
      JSON.stringify([{ caminho: "novo.mjs", apagado: false }, { caminho: "outro.mjs", apagado: false }]),
      "o caminho de origem nao pode aparecer como um ficheiro a mais, com 3 caracteres comidos");
  });

  test("porcelain: uma renomeacao na arvore de trabalho (` R`) tambem consome as duas", () => {
    eq(JSON.stringify(caminhosPorcelain(z(" R novo.mjs", "antigo.mjs"))),
      JSON.stringify([{ caminho: "novo.mjs", apagado: false }]),
      "o `R` na segunda coluna tambem traz a origem como entrada seguinte");
  });

  test("porcelain: uma copia tambem consome as duas entradas", () => {
    eq(caminhosPorcelain(z("C  copia.mjs", "origem.mjs")).length, 1, "a origem de uma copia nao e um ficheiro tocado a mais");
  });

  test("porcelain: o apagado vem marcado, no indice e na arvore", () => {
    eq(JSON.stringify(caminhosPorcelain(z("D  x.mjs", " D y.mjs", " M z.mjs")).map((e) => e.apagado)),
      JSON.stringify([true, true, false]), "o facto de ter sido apagado tem de chegar ao consumidor");
  });

  test("porcelain: uma saida vazia nao da caminhos", () => {
    eq(caminhosPorcelain("").length, 0, "sem mudancas, sem caminhos");
  });
}
