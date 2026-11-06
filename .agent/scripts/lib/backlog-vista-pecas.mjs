/**
 * As PECAS puras da vista do backlog (#446, divididas no #468) — {{PROJECT_NAME}}
 *
 * O texto de uma descricao para HTML (os escapes por contexto, o Markdown simples, os IDs como links), os titulos e os
 * pedidos dos cartoes, e as decisoes que o JS da pagina repete no browser (`passaFiltro`, `vistaParou`, `comparaCelulas`:
 * injetadas com `toString()`, logo so podem usar o que o browser tem). A montagem da pagina e do `backlog-vista.mjs`.
 * REGRA DO CODIGO (a mesma do gerador): o `escapa(` e o `urlSegura(` chamam-se numa linha propria, FORA de um template
 * literal, um por linha — a varredura apaga as strings antes de procurar o sinal (`lib/pares.mjs`).
 */
import { ID_LIKE, norm } from "./backlog-itens.mjs";

/** O texto escapado para HTML (texto e atributos entre aspas). */
export function escapa(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** O URL, se o texto CRU for `http(s)://` sem espacos, aspas nem `<>`; senao `null` (o `javascript:` e tudo o resto). */
export function urlSegura(cru) {
  return /^https?:\/\/[^\s"'<>]+$/.test(cru ?? "") ? cru : null;
}

/** Um valor em JSON para dentro de um `<script>`: o `<` escapado, e um `</script>` numa descricao nao sai do bloco. */
export function jsonSeguro(valor) {
  return JSON.stringify(valor).replace(/</g, "\\u003c");
}

/** A faixa de erro, entre marcadores (o CLI substitui-a, nunca a acumula). Uma so, para o gerador e o CLI (`TP8`). */
export const FAIXA_RE = /<!-- erro:inicio -->[\s\S]*?<!-- erro:fim -->/;
export function faixaDeErro(msg) {
  const seguro = escapa(msg);
  return `<!-- erro:inicio --><div class="erro" role="alert">${seguro}</div><!-- erro:fim -->`;
}

/** Os IDs de um texto cru que viram link: so os que tem a forma de um ID E um destino na pagina. */
const destinoDe = (ids, id) => (ID_LIKE.test(id) ? ids.get(id) ?? null : null);

/** Um texto cru com os IDs como links (por palavra inteira), e cada outro pedaco escapado. */
function comIds(cru, ids) {
  let html = "";
  for (const p of String(cru).split(/([A-Za-z0-9]+)/)) {
    const ancora = destinoDe(ids, p);
    const seguro = escapa(p);
    html += ancora ? `<a class="id" href="#${ancora}">${seguro}</a>` : seguro;
  }
  return html;
}

/** O Markdown simples de uma descricao: `codigo`, [texto](url) e **negrito**, numa so alternacao (vence o mais a esquerda). */
export function renderTexto(cru, ids = new Map()) {
  const re = /(`[^`]*`)|\[([^\]\n]*)\]\(([^)\s]*)\)|\*\*(.+?)\*\*/g;
  let html = "";
  let pos = 0;
  for (const m of String(cru ?? "").matchAll(re)) {
    html += comIds(String(cru).slice(pos, m.index), ids);
    if (m[1]) {
      const codigo = escapa(m[1].slice(1, -1));
      html += `<code>${codigo}</code>`;
    } else if (m[3] !== undefined) {
      const url = urlSegura(m[3]);
      const rotulo = escapa(m[2]);
      const href = escapa(url ?? "");
      const literal = escapa(m[0]);
      html += url ? `<a href="${href}" rel="noopener noreferrer" target="_blank">${rotulo}</a>` : literal;
    } else {
      html += `<b>${comIds(m[4], ids)}</b>`;
    }
    pos = m.index + m[0].length;
  }
  return html + comIds(String(cru ?? "").slice(pos), ids);
}

/** O titulo de um cartao: o texto a negrito da descricao, senao a 1.a frase; ate 80 caracteres, com `…`. */
export function tituloDe(descricao) {
  const d = String(descricao ?? "").trim();
  // O negrito so quando ABRE a descricao (`**Export PDF**: …`): um negrito a meio (`… em **dark-only**`) e enfase, e
  // como titulo dava "dark-only" ou "e" (medido nos backlogs dos derivados).
  const t = (/^\*\*(.+?)\*\*/.exec(d)?.[1] ?? d.split(/\.\s|;\s|\s—\s/)[0]).replace(/[`*]/g, "").trim();
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

/** Os pedidos a colar no chat do agente, por estado (decidido a 5 nov: a vista nao escreve; o agente cumpre as regras). */
export function pedidosDe(estado, id) {
  if (estado === "pendente") return [`passa o ${id} a A Fazer`, `cancela o ${id}`];
  if (estado === "a fazer") return [`fecha o ${id} como Concluido`, `cancela o ${id}`];
  return [];
}

/** O rotulo curto de um pedido, para o botao do cartao (o texto inteiro e o que se copia). */
export function rotuloDe(pedido) {
  if (pedido.startsWith("passa")) return "→ A Fazer";
  if (pedido.startsWith("fecha")) return "✓ Concluido";
  return "✕ Cancelar";
}

/** Se um cartao passa os filtros (o JS chama-a no browser, com o mesmo texto: `passaFiltro.toString()`). */
// A Prioridade compara-se por IGUALDADE da chave normalizada (#468: antes, "contem", e "Alta" apanhava "Altissima"); a
// opcao "(sem prioridade)" e a chave `SEM_PRIORIDADE` e casa os cartoes sem valor. O cartao leva a chave no JSON.
export function passaFiltro(c, f) {
  const q = String(f.q || "").toLowerCase();
  const prioridade = !f.prioridade || (f.prioridade === "__sem__" ? !c.prioridade : c.prioridade === f.prioridade);
  return (!f.tipo || c.tipo === f.tipo) && (!f.esforco || c.esforco === f.esforco) && prioridade && (!q || c.busca.indexOf(q) >= 0);
}
export const SEM_PRIORIDADE = "__sem__";

/** A ordem de duas celulas da tabela dos Fechados (o JS chama-a no browser, com o mesmo texto): natural (S2 antes de
 *  S10, v0.9.0 antes de v0.10.0), sem distinguir caixa nem acentos, e as VAZIAS no fim nos dois sentidos. */
export function comparaCelulas(a, b, sentido) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
  const r = x.localeCompare(y, "pt", { numeric: true, sensitivity: "base" });
  return sentido === "desc" ? -r : r;
}

// A escala conhecida da Prioridade, nas duas formas (o derivado A escreve "Alto/Medio/Baixo"), ja pelo `norm`.
const ESCALA = [["critica", "critico"], ["alta", "alto"], ["media", "medio"], ["baixa", "baixo"]];
const posicaoNaEscala = (chave) => {
  const i = ESCALA.findIndex((formas) => formas.includes(chave));
  return i < 0 ? ESCALA.length : i;
};

/** As opcoes do filtro Prioridade: os valores que o backlog TEM (sem repetidos pelo `norm`, com a 1.a forma escrita),
 *  pela escala conhecida e depois por ordem natural; `null` quando nenhuma tabela tem a coluna (o filtro nao aparece).
 *  @param {Array<string | null | undefined>} valores a celula de cada linha; `null`/`undefined` = sem a coluna */
export function prioridadesDe(valores) {
  if (!valores.some((v) => v !== null && v !== undefined)) return null;
  const vistas = new Map();
  for (const v of valores) {
    const rotulo = String(v ?? "").trim();
    const chave = norm(rotulo);
    if (chave && !vistas.has(chave)) vistas.set(chave, rotulo);
  }
  return [...vistas]
    .map(([chave, rotulo]) => ({ chave, rotulo }))
    .sort((a, b) => posicaoNaEscala(a.chave) - posicaoNaEscala(b.chave) || a.chave.localeCompare(b.chave, "pt", { numeric: true }));
}

/** Se o `--vigiar` parou: so com ele, com a batida ligada (sem ela, uma vista sem gravacoes e so velha, nao parada), sem
 *  erro (a faixa ja o diz), e com a ultima geracao a mais de 3 batidas. */
export function vistaParou(geradaEm, agora, vigiar, erro, batida) {
  return Boolean(vigiar) && batida > 0 && !erro && agora - geradaEm > batida * 3;
}


/** O CRLF e o CR sozinho passam a LF: e o que o browser faz ao texto de um script inline antes de lhe calcular o hash. */
export const normalizaFimDeLinha = (texto) => texto.replace(/\r\n?/g, "\n");
