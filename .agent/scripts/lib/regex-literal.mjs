/**
 * Um texto como LITERAL numa regex — {{PROJECT_NAME}}
 *
 * Escapa todos os caracteres especiais, e nao so o `.`: um nome com `+`, `(` ou `\` passava a ser um padrao (o alerta
 * do CodeQL, js/incomplete-sanitization). Estava escrito cinco vezes, letra a letra (#400).
 *
 * DUAS COPIAS FICAM, de proposito, presas a esta pelo `tests/tests-regex-literal.mjs` (o texto igual, e nenhuma
 * copia nova noutro sitio):
 * - `.claude/hooks/lib/fronteira-dados.mjs`: e a folha da fronteira, e um import que falhasse la caia no `catch` do
 *   hook — que PERMITE;
 * - `.agent/scripts/lib/nomes-proibidos.mjs`: o `commit-msg` e o `guard-textos-publicos` carregam-na por `import()`
 *   para recusar com a razao quando falta, e um import dela faltava-lhes por via transitiva.
 * O `commit-msg` nao precisa de escape: le o caractere de comentario por `startsWith`.
 */

/** @param {string} s */
export const literalEmRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
