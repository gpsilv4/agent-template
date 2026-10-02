/**
 * Testes de `lib/intacto.mjs` — {{PROJECT_NAME}}
 *
 * O dono do modulo pela convencao do registo. NAO e um entry point: o `test-guards.mjs` descobre-o.
 */
import { pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { intactoAMenosDePlaceholders as intacto } from "../lib/intacto.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-intacto.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-guards.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

// O placeholder montado, para o sweep do bootstrap nao o substituir num derivado.
const PH = "{" + "{" + "PROJECT_NAME" + "}" + "}";

export function registar() {
  // O caso que motivou o modulo: o derivado tem o nome REAL onde a tag tinha o placeholder.
  registarResultado("intacto: o valor de um placeholder nao conta como alteracao",
    intacto("# Guia (Referee Exam Study)\ncorpo\n", `# Guia (${PH})\ncorpo\n`) ? [] : ["deu alterado so pelo nome do projeto"]);
  // O CONTRA-CASO, sem o qual o de cima passava com um `return true`.
  registarResultado("intacto: uma alteracao fora do placeholder conta",
    intacto("# Guia (Referee Exam Study)\nimport './guards/meu.mjs';\n", `# Guia (${PH})\ncorpo\n`) ? ["uma alteracao real passou por intacta"] : []);
  // O placeholder so aceita UMA linha: aceitar mais escondia linhas acrescentadas ao lado dele.
  registarResultado("intacto: o placeholder nao engole linhas acrescentadas",
    intacto("# Guia (X\nlinha nova)\ncorpo\n", `# Guia (${PH})\ncorpo\n`) ? ["um placeholder engoliu uma linha nova"] : []);
  // Os caracteres especiais do texto da tag sao literais, e nao regex.
  registarResultado("intacto: o texto da tag e literal (um `.` nao e qualquer caracter)",
    intacto(`a+b (${PH}) x.y`, `a+b (${PH}) x.y`) && !intacto("aXb (n) xZy", `a+b (${PH}) x.y`) ? [] : ["o texto da tag foi lido como regex"]);
}
