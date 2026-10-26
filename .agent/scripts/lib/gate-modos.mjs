/**
 * Os MODOS da varredura em shards, lidos do `ci.yml` — {{PROJECT_NAME}}
 *
 * A matriz do job `sweep` diz que modos correm (`completa`, `skips`); a linha do portao
 * (`varredura-shards.mjs <pasta> <modos...>`) diz que modos se exigem. Sao duas listas, e o
 * gate (`estrutura-workflow.mjs`) exige que sejam iguais (#317). Aqui so se LEEM — sem sitios de recusa: `null`
 * e "nao consegui ler", e quem decide reprovar (fechado) e o chamador.
 *
 * As formas de YAML que se leem, porque um derivado pode escrever qualquer uma (leituras do #317):
 * `modo: [a, b]` (com ou sem aspas), `- modo: x` e `modo: "x"`, mapas em linha `- { modo: x, ... }`, e a
 * lista em bloco (`modo:` e os `- x` seguintes). Uma `matrix:` vinda de uma expressao (`fromJSON`) nao tem
 * linhas `modo:`, e uma matriz sem modos lidos e `null` — o mesmo destino, sem um ramo a parte.
 */

const tira = (x) => x.trim().replace(/^(["'])(.*)\1$/, "$2");
const NOME = /^[\w-]+$/;

/** Os modos da matriz de um job (as linhas `ls`, ja sem comentarios); `null` se algo nao se leu. */
export function modosDaMatriz(ls) {
  const modos = [];
  let ilegivel = false;
  ls.forEach((l, i) => {
    if (!/(?:^|[\s{,])modo\s*:/.test(l)) return;
    const lista = /\bmodo\s*:\s*\[([^\]]*)\]/.exec(l);
    const escalares = [...l.matchAll(/(?:^|[\s{,-])modo\s*:\s*(["']?)([\w-]+)\1\s*(?=[,}]|$)/g)].map((m) => m[2]);
    if (lista) modos.push(...lista[1].split(",").map(tira).filter(Boolean));
    else if (escalares.length) modos.push(...escalares);
    else if (/\bmodo\s*:\s*$/.test(l)) {
      // Lista em BLOCO: os `- valor` seguintes, mais indentados do que a chave.
      const ind = l.search(/\S/);
      for (const seg of ls.slice(i + 1)) {
        if (seg.trim() === "") continue;
        const m = /^(\s*)-\s*(["']?)([\w-]+)\2\s*$/.exec(seg);
        if (!m || m[1].length <= ind) break;
        modos.push(m[3]);
      }
    } else ilegivel = true;
  });
  return ilegivel || modos.length === 0 || !modos.every((m) => NOME.test(m)) ? null : [...new Set(modos)];
}

/** Os modos que cada chamada ao portao recebe, num job (as linhas `ls`): um elemento por chamada, `null`
 *  se essa chamada nao se le (uma variavel, um modo com caracteres estranhos). As linhas que acabam em `\`
 *  continuam na seguinte. */
export function modosDoPortao(ls) {
  const texto = ls.join("\n").replace(/\\\n\s*/g, " ");
  return [...texto.matchAll(/\bvarredura-shards\.mjs[ \t]+\S+([^\n]*)/g)].map((m) => {
    const tokens = m[1].trim().split(/\s+/).filter(Boolean).map(tira);
    return tokens.every((t) => NOME.test(t)) ? tokens : null;
  });
}
