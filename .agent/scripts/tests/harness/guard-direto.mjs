/**
 * Correr UM guard diretamente, com o disco simulado — {{PROJECT_NAME}}
 *
 * NAO e um entry point e nao corre testes: e um construtor de fixture.
 *
 * PORQUE EXISTE (#192): os SKIP de "nao ha nada para verificar" dos Guards 17 a 20 nao se
 * alcancam pelo verificador completo. O do Guard 17, por exemplo, exige zero `.mjs` em
 * `.agent/scripts` — e e la que o proprio verificador vive. Sem teste, apagar o SKIP deixava o
 * guard calado sobre o que nao olhou (o `TP2`), e a varredura `--skips` media-o a descoberto.
 * Chamar o guard com um `listTree`/`listDir` que devolve o disco vazio alcanca-o sem desmontar
 * o repo. Um stub por suite seria uma copia em cada uma, a concordar a mao (`TP8`).
 *
 * @param {(ctx: object) => number} guard  a funcao exportada pelo modulo em `guards/`
 * @param {object} [ctx]  o que substitui o disco por omissao (`read`, `listDir`, `listTree`, ...)
 * @returns {string} as linhas que o guard imprimiu, com o prefixo do nivel (`SKIP  ...`)
 */
export function correDireto(guard, ctx = {}) {
  const linhas = [];
  const nivel = (k) => (m) => linhas.push(`${k}  ${m}`);
  guard({
    read: () => null,
    listDir: () => null,
    listTree: () => null,
    warn: nivel("WARN"),
    ok: nivel("OK"),
    skip: nivel("SKIP"),
    note: nivel("NOTE"),
    ...ctx,
  });
  return linhas.join("\n");
}
