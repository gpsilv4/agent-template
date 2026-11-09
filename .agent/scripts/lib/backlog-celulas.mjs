/**
 * As CELULAS do backlog: normalizar, o vazio escrito, e a coluna Area — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#465): o leitor (`lib/backlog-itens.mjs`) ia passar das 400 linhas com a coluna Area. Aqui vive o que
 * e de uma celula e nao de uma tabela: o `norm` (que o leitor reexporta, por nome), a regex do vazio (a do Esforco e a
 * da Area, uma so, `TP8`) e a leitura da Area. Folha: nao importa nada, nao avisa nem recusa (sem par na varredura).
 * Quem avisa sao as regras (`lib/backlog-regras.mjs`); quem carrega a lista de areas e o `lib/backlog-areas.mjs`.
 */

// Remove acentos e normaliza para comparar de forma resiliente.
export function norm(s) {
  // A enfase markdown sai ANTES do resto. Sem isto, um cabecalho escrito `| **Esforco** |`
  // — forma corrente, e a que o proprio template usa na linha do Total — dava
  // `indexOf("esforco") === -1`, e a validacao de Esforco **desligava-se em silencio** com
  // exit 0. Falha-aberta no campo que decide o rigor de todo o `ticket-method`.
  // Vale para as celulas tambem: um `| **Concluido** |` caia fora de OPEN_STATES da mesma forma.
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*`]/g, "")
    // Espacos e `_` juntos, e numa so passagem: o `tableHeader` normaliza celulas NAO
    // aparadas (`" _Esforco_ "`), e com o strip de `_` antes do `.trim()` sobrava
    // `"_esforco_"` -> `indexOf("esforco") === -1` -> a validacao voltava a desligar-se em
    // silencio. O negrito so ficou coberto por acaso: o strip de `*` e global.
    .replace(/^[\s_]+|[\s_]+$/g, "")
    .toLowerCase();
}

/** O "vazio" escrito: `-`, `—`, `–`, `n/a` e `?` sao a convencao markdown para uma celula sem valor. Aplica-se ao valor
 *  DEPOIS do `norm` (que ja tira a enfase e passa a minusculas: `**N/A**` conta). Uma so lista para o Esforco e a Area. */
export const VAZIO_RE = /^(?:-+|–|—|n\/a|\?)$/;

/** O cabecalho que se LE como a coluna Area (depois do `norm`: `Area`, `Área`, `Areas`). */
const AREA = /^areas?$/;
/** O que PARECE a coluna Area e nao se le (`TP2`: sem o aviso, a verificacao desligava-se calada). `Area afetada`, com
 *  outro sentido, nao casa nenhum dos dois. */
const PARECIDA = /^(?:area\(s\)|tags?|etiquetas?)$/;

/**
 * A coluna Area de um cabecalho ja normalizado (o do `tableHeader`).
 * @param {string[] | null} cabecalho
 * @returns {{ indice: number, nome: string | null, parecida: string | null }} `indice` -1 sem ela; `parecida` e o nome
 *   de uma coluna que parece a Area e nao se le (so quando nao ha a verdadeira).
 */
export function colunaDaArea(cabecalho) {
  const cab = cabecalho ?? [];
  const indice = cab.findIndex((c) => AREA.test(c));
  if (indice >= 0) return { indice, nome: cab[indice], parecida: null };
  return { indice: -1, nome: null, parecida: cab.find((c) => PARECIDA.test(c)) ?? null };
}

/** Se a Area esta ANTES da descricao (que e a 3.a coluna, por posicao): no lugar do Estado ou da descricao, partia-os. */
export const areaAntesDaDescricao = (cabecalho) => {
  const { indice } = colunaDaArea(cabecalho);
  return indice >= 0 && indice <= 2;
};

/**
 * As areas de uma celula: separadas por virgula, cada uma com a CHAVE (pelo `norm`, para comparar) e o ROTULO (como
 * esta escrito, para mostrar). Um fragmento vazio (`seguranca,`) ou o vazio escrito (`—`) nao conta.
 * @param {string} celula
 * @returns {{ chave: string, rotulo: string }[]}
 */
export function leAreas(celula) {
  const out = [];
  for (const parte of (celula ?? "").split(",")) {
    const rotulo = parte.trim();
    const chave = norm(rotulo);
    if (chave && !VAZIO_RE.test(chave)) out.push({ chave, rotulo });
  }
  return out;
}
