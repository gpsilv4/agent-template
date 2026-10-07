/**
 * Os caminhos de um `git status --porcelain -z` — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (A3 do #195): esta funcao vivia em DUAS copias, no `stop-verify.mjs` e no
 * `session-context.mjs`, cada uma a dizer "se mudar aqui, mudar la" (`TP8`). E ja tinham
 * divergido: a do `stop-verify` devolvia o apagado, a do `session-context` so strings. Fica uma
 * so, a completa; quem so precisa do caminho fica com o `caminho`.
 */

/** Caminhos de um `git status --porcelain -z`, cada um com o facto de ter sido APAGADO.
 *
 *  `-z` e obrigatorio, nao cosmetico: SEM ele o git **cita** os caminhos que tenham espacos
 *  ou bytes nao-ASCII (`?? ".agent/guards/caf\303\251.mjs"`), e o `slice(3)` entrega a aspa
 *  e os escapes octais ao matcher — nenhuma regra casa e a divida e sub-reportada em
 *  SILENCIO, que e o defeito que o `stop-verify` existe para evitar. Medido: 1 de 3 ficheiros
 *  vistos. E a segunda cara do `TP5` (o `.trim()` foi a primeira).
 *
 *  Com `-z` as entradas vem separadas por NUL e os caminhos crus. Renomeacoes e copias
 *  ocupam DUAS entradas (`R  novo\0antigo\0`): a segunda e um caminho nu, sem coluna de
 *  estado, logo um `slice(3)` cego comia-lhe 3 caracteres. Por isso sao consumidas ao par.
 *
 *  @param {string} saida a saida crua do `git status --porcelain -z`
 *  @returns {{caminho: string, apagado: boolean}[]} */
export function caminhosPorcelain(saida) {
  const entradas = saida.split("\0").filter(Boolean);
  const caminhos = [];
  for (let i = 0; i < entradas.length; i++) {
    const estado = entradas[i].slice(0, 2);
    // O APAGADO vai junto, com o facto de o ser. Quem decide o que fazer com ele e o consumidor,
    // e sao decisoes diferentes: um ficheiro apagado ainda **deve** a suite que o cobria (apagar
    // `lib/pares.mjs` exige o `test-pares.mjs` mais do que modifica-lo), e apagar um ficheiro da
    // FRONTEIRA e o afrouxamento mais forte que ha — calar isso era o oposto do que o aviso quer.
    //
    // Pelo ESTADO que o git da, e nao com um `existsSync`: os caminhos do porcelain sao
    // relativos a raiz do repo e o hook pode correr de uma subpasta, logo um teste ao disco
    // responderia sobre o sitio errado. O git ja sabe o que apagou.
    caminhos.push({ caminho: entradas[i].slice(3), apagado: estado.includes("D") });
    // `R`/`C` trazem o caminho de origem como entrada seguinte, sem coluna de estado — em QUALQUER
    // das duas colunas: ` R` e uma renomeacao na arvore de trabalho (com `git add -N`), e so a
    // primeira coluna deixava a origem passar por um ficheiro a mais (as duas copias antigas tinham-no).
    if (/[RC]/.test(estado)) i++;
  }
  return caminhos;
}
