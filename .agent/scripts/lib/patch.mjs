/**
 * Aplicar um patch de texto, e saber QUAL dos tres resultados aconteceu — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: `texto.replace(padrao, novo)` devolve o texto igual em **dois** casos que nao tem
 * nada a ver um com o outro:
 *
 *   1. o padrao nao casou nada — o ficheiro mudou de forma, e quem chama nao pode continuar;
 *   2. o padrao casou e o resultado e identico — **o valor ja era o desejado**, e nao ha problema
 *      nenhum.
 *
 * Colapsar os dois num `if (depois === texto) fatal(...)` produz um falso alarme no caso mais
 * provavel de todos: fixar um valor que ja esta fixado. E o `TP2` — dois estados diferentes lidos
 * como um — e ja custou duas vezes neste repo:
 *
 *   - o `test-bundle-sizes.mjs` rebentava quando o gate ja estava suspenso (corrigido no PR #68);
 *   - o `configura()` do `simulate-derived.mjs` reescreveu o mesmo defeito **no mesmo commit** que
 *     corrigiu o primeiro, e punha o simulador a `exit 1` em qualquer derivado que tivesse
 *     suspendido o gate — que e exactamente o estado que ele existe para simular.
 *
 * O segundo so apareceu numa ronda de `/upgrade` num projeto real. Por isso a distincao vive aqui,
 * uma vez, e nao em cada sitio que precise dela: duas copias da mesma regra a concordar a mao e o
 * `TP8`, e foi assim que a primeira correccao nao chegou a segunda.
 *
 * Um terceiro sitio com a mesma forma (`tests-versions.mjs`, a fixture que esvazia o `CHECKS`)
 * apareceu ao correr `grep` pelo PADRAO em vez de pelo ficheiro — a regra que a ronda 5 sugeriu.
 */

/**
 * @param texto  o conteudo actual
 * @param padrao `RegExp` ou `string`, como o `String.replace` aceita
 * @param novo   o substituto. **Se contiver `$`** — e as listas de regex deste repo contem —
 *               passar uma FUNCAO: um replacement string interpreta `$&`, `` $` `` e `$'`, e ja
 *               truncou um ficheiro inteiro neste repo.
 * @returns {{estado: "aplicado"|"ja-estava"|"sem-alvo", texto: string}}
 *          `aplicado`  — casou e mudou; usar `texto`.
 *          `ja-estava` — casou e o resultado e identico; **nao e erro**, nao ha nada a escrever.
 *          `sem-alvo`  — nao casou nada; o ficheiro mudou de forma e quem chama decide o que dizer.
 */
export function aplica(texto, padrao, novo) {
  const depois = texto.replace(padrao, novo);
  if (depois !== texto) return { estado: "aplicado", texto: depois };
  // `match` e nao `test`: um `RegExp` com a flag `g` guarda `lastIndex` entre chamadas e o `test`
  // alterna entre `true` e `false` sobre o mesmo input. Ja aconteceu neste repo, num guard.
  return { estado: texto.match(padrao) === null ? "sem-alvo" : "ja-estava", texto };
}
