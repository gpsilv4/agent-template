/**
 * Testes de `lib/intacto.mjs` — {{PROJECT_NAME}}
 *
 * O dono do modulo pela convencao do registo. NAO e um entry point: o `test-guards.mjs` descobre-o.
 */
import { pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { intactoAMenosDePlaceholders as intacto, capturaPlaceholders, valoresDoProjeto } from "../lib/intacto.mjs";

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
  // O MESMO placeholder com dois valores no mesmo ficheiro nao e o bootstrap: e o projeto (#179).
  registarResultado("intacto: o mesmo placeholder com dois valores no mesmo ficheiro conta como alteracao",
    intacto("# A (Um)\nfeito por Outro\n", `# A (${PH})\nfeito por ${PH}\n`) ? ["dois valores para o mesmo placeholder passaram por intactos"] : []);
  // Varios placeholders numa linha: a falha numa linha de baixo voltava atras por todas as
  // combinacoes desta — medido, 5 por linha davam 6,9 s. Agora e linear.
  {
    const linha = Array.from({ length: 5 }, (_, k) => PH.replace("PROJECT_NAME", `X${"ABCDE"[k]}`)).join(" ");
    const tag = [linha, linha, linha, "fim"].join("\n");
    const palavras = Array.from({ length: 200 }, (_, k) => `p${k}`).join(" ");
    const t0 = Date.now();
    const r = capturaPlaceholders([palavras, palavras, palavras, "fim diferente"].join("\n"), tag);
    registarResultado("intacto: cinco placeholders numa linha nao penduram a comparacao", [
      ...(r === null ? [] : ["um ficheiro alterado deu intacto"]),
      ...(Date.now() - t0 < 500 ? [] : [`${Date.now() - t0} ms`]),
    ]);
  }
  // Dois lado a lado nao dizem onde acaba um e comeca o outro: a linha compara, e nao da valores.
  registarResultado("intacto: placeholders adjacentes comparam mas nao dao valores",
    JSON.stringify(capturaPlaceholders("(c) 2024 2026 Ana", `(c) ${PH} ${PH.replace("PROJECT_NAME", "HOLDER")}`)) === "{}" ? [] : ["deu valores a placeholders adjacentes"]);
  // Vazio, ou o proprio placeholder por substituir, nao e um valor do projeto.
  {
    const v = valoresDoProjeto("Fachada");
    v.recolhe({ PROJECT_NAME: "" });
    v.recolhe({ PROJECT_NAME: PH });
    v.recolhe({ PROJECT_NAME: "Real" });
    registarResultado("intacto: valores vazios ou por substituir nao entram na recolha",
      v.substitui(`# ${PH}`) === "# Real" && v.emConflito(new Set(["PROJECT_NAME"])) === null ? [] : [`ficou ${v.substitui(`# ${PH}`)}`]);
  }
}
