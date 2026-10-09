/**
 * Testes das constantes do PROJETO que o `/upgrade` preserva, com a lista REAL — {{PROJECT_NAME}}
 *
 * Os testes do motor (`tests-upgrade-motor.mjs`) passam as constantes a mao, para medir o
 * mecanismo. Estes usam `CONSTANTES_DO_PROJETO` tal como esta: tirar uma entrada da lista tem de
 * fazer um teste falhar, senao a customizacao de um projeto perde-se no proximo upgrade sem aviso.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { cenario, limpa, test } from "./harness/test-upgrade-harness.mjs";
import { CONSTANTES_DO_PROJETO } from "../lib/upgrade-categorias.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-upgrade-constantes.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-simulate-upgrade.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

export function registar() {
  // A lista de nomes de IA do `commit-msg` (#278): o `/upgrade` copia o `.githooks/`, e um projeto
  // que tenha acrescentado nomes a lista (a recusa manda-o ajusta-la ali) tem de os manter.
  test("a lista `IA` do `commit-msg` que o projeto alterou sobrevive ao upgrade", () => {
    const rel = ".githooks/lib/commit-msg.mjs";
    let c;
    try {
      c = cenario({
        ontem: { [rel]: "const IA = /claude/i;\n// velho\n" },
        hoje: { [rel]: "const IA = /claude|novo/i;\n// NOVO\n" },
        consumidor: { [rel]: "const IA = /claude|meubot/i;\n// velho\n" },
        constantes: CONSTANTES_DO_PROJETO.filter(([r]) => r === rel),
      });
      const v = c.ler(rel);
      const p = [];
      if (!v?.includes("meubot")) p.push("perdeu a lista `IA` do projeto (falta em CONSTANTES_DO_PROJETO?)");
      if (!v?.includes("// NOVO")) p.push("nao trouxe o resto do modulo novo");
      return p;
    } finally {
      limpa(c);
    }
  });
}
