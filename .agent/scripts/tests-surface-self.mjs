/**
 * Testes do proprio harness da superficie — {{PROJECT_NAME}}
 *
 * Espelha a funcao `avaliar()` de `test-surface-harness.mjs`.
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 *
 * PORQUE EXISTE: a varredura de mutacao mediu **0 de 3** sitios no harness da superficie.
 * Desligar qualquer uma das suas assercoes so torna os 66 testes mais permissivos — nenhum
 * fica vermelho, e o ecra continua a dizer "todos passaram". E o mesmo buraco que o
 * `tests-harness-self.mjs` fecha do outro lado, e fecha-se da mesma maneira: o veredicto foi
 * isolado como funcao pura, e aqui chama-se com entradas fabricadas, uma por assercao.
 */
import { pathToFileURL } from "url";
import { avaliar, registarResultado } from "./test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-self.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  const caso = (nome, entrada, esperado, proibido = []) => {
    let problemas;
    try {
      problemas = avaliar(entrada);
    } catch (err) {
      registarResultado(nome, [`avaliar() rebentou: ${err.message}`], "");
      return;
    }
    const juntos = problemas.join(" | ");
    const faltam = esperado.filter((t) => !juntos.includes(t)).map((t) => `devia reportar "${t}"; reportou: [${juntos}]`);
    const sobram = proibido.filter((t) => juntos.includes(t)).map((t) => `NAO devia reportar "${t}"; reportou: [${juntos}]`);
    registarResultado(nome, [...faltam, ...sobram], "");
  };

  // O contra-caso primeiro: sem ele, um `avaliar()` que devolvesse sempre tudo passava o resto.
  caso(
    "surface-harness: cenario sao devolve ZERO problemas",
    { code: 0, out: "  OK    superficie intacta\n", expect: { code: 0, includes: ["superficie intacta"] } },
    [],
    ["exit", "devia conter"]
  );

  // A invariante do veredicto: o exit code do verificador tem de ser o esperado.
  caso(
    "surface-harness: exit code diferente do esperado e reportado",
    { code: 0, out: "  OK    nada\n", expect: { code: 1 } },
    ["exit 0, esperado 1"]
  );

  // Afirmar contra as linhas WARN, e nao contra o output todo: uma linha `OK` com o mesmo
  // nome de ficheiro satisfazia o `includes` de um teste que espera reprovacao (`AP1`).
  caso(
    "surface-harness: includes nao e satisfeito por uma linha OK",
    { code: 1, out: "  OK    x.mjs alterado, sem marcas\n  WARN  outra coisa\n", expect: { code: 1, includes: ["x.mjs"] } },
    ['linhas WARN devia conter "x.mjs"']
  );

  caso(
    "surface-harness: excludes presente no output e reportado",
    { code: 0, out: "  OK    tudo\n  NOTE  proibido\n", expect: { code: 0, excludes: ["proibido"] } },
    ['output NAO devia conter "proibido"']
  );
}
