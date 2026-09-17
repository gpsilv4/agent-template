/**
 * Leituras de ficheiro que distinguem "nao existe" de "rebentou" — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: `leOuNull` estava escrita **duas vezes**, identica — em `lib/upgrade-mecanico.mjs`
 * e no `simulate-derived.mjs`. Duas copias da mesma regra a concordar a mao e o `TP8`, e esta foi
 * encontrada a procurar linhas para cortar, nao a rever codigo.
 *
 * Nao e uma funcao qualquer: `null` em vez de excepcao e uma DECISAO, e e a que faz metade das
 * recusas deste repo poderem existir. "Nao existe" e "nao consegui ler" pedem accoes diferentes a
 * quem chama, e colapsa-las num `try` mudo e o `TP2`.
 */

import { readFileSync } from "fs";

/** O conteudo de `p`, ou `null` se nao der para ler.
 *
 *  Quem chama decide o que fazer com o `null` — e tem de decidir, porque um ficheiro ausente e um
 *  ficheiro ilegivel querem dizer coisas diferentes em quase todos os sitios deste repo. */
export const leOuNull = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
