/**
 * O exemplo de CI de um job no modo completo (#472, #477, #487) — {{PROJECT_NAME}}
 *
 * PORQUE VIVE EM `lib/`: o `simulate-derived` (#487) monta com ele o CI de um derivado PRIVADO com a maquinaria, e um
 * simulador nao importa de `tests/harness/`. As suites (`harness/expressoes-ci.mjs`, `casos-modo-completo`,
 * `tests-medida-2b-modo`) importam-no daqui: uma so definicao do que e "descomentar o modo completo". Sem sitios de
 * recusa: so transforma texto, e devolve `null` quando os marcadores nao estao como devem.
 */

/** Uma linha comentada do exemplo, descomentada: sai o primeiro `#` (e um espaco), e uma linha so de espacos fica vazia. */
export const descomenta = (l) => l.replace(/^([ \t]*)# ?/, "$1").replace(/^[ \t]+$/, "");

/** O exemplo com os dois blocos MODO COMPLETO (#472, #477) descomentados no lugar: o derivado com a maquinaria do
 *  template. O (a) e um passo do job `ci` (desde o `# - name:`); o (b) e o job `guard-tests` (desde o `# guard-tests:`
 *  a dois espacos). `null` sem os marcadores, com eles fora de ordem, ou sem o inicio do passo ou do job. */
export function comModoCompleto(texto) {
  let ls = texto.split("\n");
  for (const [bloco, inicio] of [["a", /^[ \t]*# - name:/], ["b", /^  # guard-tests:/]]) {
    const i = ls.findIndex((l) => l.includes(`# --- MODO COMPLETO (${bloco}) inicio`));
    const f = ls.findIndex((l) => l.includes(`# --- MODO COMPLETO (${bloco}) fim ---`));
    if (i < 0 || f < i) return null;
    const p0 = ls.findIndex((l, k) => k > i && k < f && inicio.test(l));
    if (p0 < 0) return null;
    ls = [...ls.slice(0, i), ...ls.slice(p0, f).map(descomenta), ...ls.slice(f + 1)];
  }
  return ls.join("\n");
}
