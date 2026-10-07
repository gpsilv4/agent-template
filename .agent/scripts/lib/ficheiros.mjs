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

/** O bloco `const NOME = ...` ate a linha que fecha na coluna 0 (`};` ou `];`). Devolve `null`
 *  se nao existir — e quem chama decide, porque "nao ha" e "nao consegui ler" pedem accoes
 *  diferentes (`TP2`). */
export function blocoDaConstante(texto, nome) {
  if (texto === null) return null;
  const linhas = texto.split("\n");
  const i = linhas.findIndex((l) => l.startsWith(`const ${nome} = `));
  if (i === -1) return null;
  // Uma constante de uma linha so (`const X = [];`) fecha nela propria.
  if (/;\s*$/.test(linhas[i]) && !/[[{]\s*$/.test(linhas[i])) return linhas[i];
  const fim = linhas.findIndex((l, n) => n > i && /^[\]}]\);?;?$|^[\]}];$/.test(l));
  if (fim === -1) return null;
  return linhas.slice(i, fim + 1).join("\n");
}

/** Os nomes de branch do PRIMEIRO literal de array de um bloco JS — `["main", "staging"]`, ou o de
 *  `new Set([...])` (#257). Sem comentarios (um apostrofo num `// the team's` desalinhava as aspas
 *  e engolia um branch) e so ate ao `]` que fecha o literal (um `]; // QA` no fim da linha fazia o
 *  `blocoDaConstante` ir ate ao proximo fecho). `null` se algum item nao for um nome de branch
 *  citado: quem chama recusa em vez de escrever lixo como se fosse uma lista de branches.
 *  @returns {string[]|null} */
export function listaDeBranches(bloco) {
  const i = (bloco ?? "").indexOf("[");
  if (i === -1) return null;
  let prof = 0;
  let j = i;
  for (; j < bloco.length; j++) {
    if (bloco[j] === "[") prof++;
    else if (bloco[j] === "]" && --prof === 0) break;
  }
  if (prof !== 0) return null;
  const corpo = bloco.slice(i + 1, j).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const nomes = corpo.split(",").map((t) => t.trim()).filter(Boolean).map((t) => /^(["'])([\w.\/-]+)\1$/.exec(t)?.[2]);
  return nomes.every(Boolean) ? nomes : null;
}
