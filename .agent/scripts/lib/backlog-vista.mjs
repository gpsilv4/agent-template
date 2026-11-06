/**
 * A VISTA do backlog: um HTML local, so de leitura, gerado a partir do leitor partilhado (#446) — {{PROJECT_NAME}}
 *
 * PURO: recebe o backlog lido (`lib/backlog-itens.mjs`) e o calculo (`lib/backlog-calculo.mjs`) e devolve o HTML. Nao le
 * nem escreve ficheiros (isso e o `backlog-board.mjs`), e a hora entra por parametro: o mesmo backlog com a mesma
 * `agora` da o mesmo HTML.
 *
 * A SEGURANCA (Fase 0 v3 do #446): o backlog e texto de pessoas e de agentes, e entra num HTML.
 *  - O texto de uma descricao divide-se PRIMEIRO em segmentos sobre o texto cru (codigo, link, negrito, simples); cada
 *    pedaco e escapado por si, e os IDs so viram link sobre o texto cru do simples e do negrito.
 *  - Um URL so passa se o texto cru casar `^https?://` sem espacos nem aspas (`urlSegura`).
 *  - Os dados para o JS vao num `<script type="application/json">` com o `<` escapado (`jsonSeguro`).
 *  - A pagina leva uma CSP que so deixa correr o seu proprio script (pelo hash): um escape falhado nao executa.
 *  - O detalhe de cada ticket e renderizado AQUI, em elementos `hidden`: o JS so mostra e esconde.
 * REGRA DO CODIGO: o `escapa(`, o `urlSegura(` e o `jsonSeguro(` chamam-se numa linha propria, FORA de um template
 * literal, um por linha. A varredura apaga as strings antes de procurar o sinal, e uma chamada dentro de `${...}` era
 * invisivel para o par (`lib/pares.mjs`).
 */
import { createHash } from "crypto";
import { CLOSED_STATES, ID_LIKE, OPEN_STATES, SECTIONS } from "./backlog-itens.mjs";
import { CSS, JS_CORPO } from "./backlog-vista-assets.mjs";

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
export function passaFiltro(c, f) {
  const q = String(f.q || "").toLowerCase();
  return (!f.tipo || c.tipo === f.tipo) && (!f.esforco || c.esforco === f.esforco) && (!f.prioridade || c.prioridade.toLowerCase().indexOf(String(f.prioridade).toLowerCase()) >= 0) && (!q || c.busca.indexOf(q) >= 0);
}

/** Se o `--vigiar` parou: so com ele, com a batida ligada (sem ela, uma vista sem gravacoes e so velha, nao parada), sem
 *  erro (a faixa ja o diz), e com a ultima geracao a mais de 3 batidas. */
export function vistaParou(geradaEm, agora, vigiar, erro, batida) {
  return Boolean(vigiar) && batida > 0 && !erro && agora - geradaEm > batida * 3;
}

const ordemNumerica = (o) => (/^\s*\d+\s*$/.test(o ?? "") ? Number(o) : Infinity);

/** O CRLF e o CR sozinho passam a LF: e o que o browser faz ao texto de um script inline antes de lhe calcular o hash. */
export const normalizaFimDeLinha = (texto) => texto.replace(/\r\n?/g, "\n");

/** As colunas da vista: um cartao por ticket ABERTO, no 1.o bloco onde aparece, senao nos Pendentes, senao "Sem bloco". */
function colunasDaVista(lido) {
  // So os IDs com a forma de um ID (letras e digitos) dao cartao, ancora e detalhe: e o que dispensa escapa-los. Um ID
  // hostil (com `"` ou `<`) numa tabela por tipo da um cartao cinzento, com o texto escapado.
  const todos = [...lido.tickets].filter(([, t]) => OPEN_STATES.includes(t.estado));
  const abertos = new Map(todos.filter(([id]) => ID_LIKE.test(id)));
  const invalidos = todos.filter(([id]) => !ID_LIKE.test(id)).map(([id]) => id);
  const porqueInvalido = (id) => (/~~/.test(id) ? "riscado: fechar move a linha para o arquivo" : "ID invalido");
  const colocados = new Set();
  // Porque um ID planeado nao da um cartao vivo: fechado no arquivo, fechado (ou de estado desconhecido) no ativo, ou
  // nao existe em tabela nenhuma.
  const porqueNaoAberto = (id) => {
    if (lido.fechados.some((f) => f.id === id)) return "fechado";
    const t = lido.tickets.get(id);
    if (!t) return "nao existe";
    return CLOSED_STATES.includes(t.estado) ? "fechado no ativo: mover a linha para o arquivo" : "estado desconhecido";
  };
  const cinzento = (id, porque, extra = {}) => ({ id, cinzento: true, porque, ...extra });
  const cartaoDe = (id, extra) => {
    const t = abertos.get(id);
    if (!t) return cinzento(id, porqueNaoAberto(id), extra);
    colocados.add(id);
    return { ...t, ...extra, emCurso: t.estado === "a fazer" };
  };
  const vistos = new Set();
  const unicos = (linhas) => linhas.filter((l) => l.idLimpo && !l.riscado && !colocados.has(l.idLimpo) && !vistos.has(l.idLimpo) && vistos.add(l.idLimpo));
  // Uma linha riscada num bloco e um fecho a meio (o backlog-method manda mover a linha): fica cinzenta, no seu lugar, e
  // nao conta como o sitio do ticket (senao o B1 aberto aparecia vivo no sprint, sem marca de riscado).
  const riscadas = (linhas) => linhas.filter((l) => l.riscado && l.id).map((l) => cinzento(l.id, porqueInvalido(l.id), { ordemLinha: l.ordem }));
  const ordena = (cs) => cs.sort((a, b) => Number(Boolean(b.emCurso)) - Number(Boolean(a.emCurso)) || ordemNumerica(a.ordemLinha) - ordemNumerica(b.ordemLinha));
  const colunas = lido.blocos.map((b) => ({
    titulo: b.titulo,
    objetivo: b.objetivo,
    fecho: b.fecho,
    // Um ciclo so (verificar e marcar na mesma passagem): o mesmo ID duas vezes no mesmo bloco da um cartao.
    cartoes: ordena([...unicos(b.linhas).map((l) => cartaoDe(l.idLimpo, { ordemLinha: l.ordem, dependeDeLinha: l.dependeDe, prioridadeLinha: l.prioridade })), ...riscadas(b.linhas)]),
  }));
  colunas.push({
    titulo: "Pendentes (sem sprint)",
    pendentes: true,
    cartoes: ordena(unicos(lido.pendentes ?? []).map((p) => cartaoDe(p.idLimpo, { notaLinha: p.nota }))),
  });
  // Uma linha Concluido/Cancelado (ou de estado desconhecido) que ficou numa tabela por tipo conta no cabecalho do calcula
  // e nao estava em lado nenhum: um cartao cinzento diz onde esta e o que falta.
  const foraDeLugar = [...lido.tickets].filter(([, t]) => !OPEN_STATES.includes(t.estado)).map(([id]) => cinzento(id, porqueNaoAberto(id)));
  const sem = [...[...abertos.keys()].filter((id) => !colocados.has(id)).map((id) => cartaoDe(id, {})), ...invalidos.map((id) => cinzento(id, porqueInvalido(id))), ...foraDeLugar];
  if (sem.length) colunas.push({ titulo: "Sem bloco", semBloco: true, cartoes: sem });
  return colunas;
}

/** O detalhe de um ticket aberto, com TUDO o que o backlog sabe dele: onde esta planeado (o bloco e a Ordem, ou os
 *  Pendentes), a prioridade, o "Depende de" e o bloqueio, a nota, e as colunas da tabela por tipo. Renderizado aqui,
 *  escondido: o JS so o mostra. */
function detalheAberto(t, ids, colocado, dependentes) {
  const id = t.id; // casa o ID_LIKE
  const campo = (nome, html) => (html ? `<dt>${nome}</dt><dd>${html}</dd>` : "");
  const onde = colocado?.coluna ?? "Sem bloco";
  const ondeSeguro = escapa(colocado?.ordem ? `${onde} — Ordem ${colocado.ordem}` : onde);
  const dep = t.dependeDe;
  // Um rotulo fixo, e nao a celula: so os abertos tem detalhe, e o Estado deles e Pendente ou A Fazer (um escape aqui
  // nunca mudava nada, e a varredura nao o podia provar, `TP7`).
  const estado = t.estado === "a fazer" ? "A Fazer (em curso)" : "Pendente";
  const planeamento = [
    campo("Tipo", t.seccao),
    campo("Estado", estado),
    campo("Planeado em", ondeSeguro),
    campo("Prioridade", t.prioridade ? renderTexto(t.prioridade, ids) : ""),
    campo("Depende de", dep && dep.ids.length ? renderTexto(dep.ids.join(", "), ids) : ""),
    campo("Bloqueado", dep && dep.bloqueado !== null ? renderTexto(dep.bloqueado || "(sem motivo)", ids) : ""),
    // O inverso do "Depende de": quem fica a espera deste ticket (ajuda a decidir o que fazer primeiro).
    campo("E dependencia de", dependentes?.length ? renderTexto(dependentes.join(", "), ids) : ""),
    campo("Nota", t.nota ? renderTexto(t.nota, ids) : ""),
    campo("Arquivo", t.noArquivo ? "este ID tambem esta no Historico (um duplicado: o check-backlog avisa)" : ""),
  ].join("");
  const linhas = Object.entries(t.colunas ?? {})
    .filter(([n]) => n !== "id" && n !== "estado")
    .map(([n, v], i) => {
      // A 3.a coluna e a descricao, com um nome por tipo (Problema, Melhoria, Issue, Feature): chama-se "Descricao", com o
      // nome da tabela entre parenteses ("Issue" lia-se como um issue do GitHub).
      const nome = escapa(i === 0 ? `Descricao (${n})` : n);
      return `<dt>${nome}</dt><dd>${renderTexto(v, ids)}</dd>`;
    })
    .join("");
  const pedidos = pedidosDe(t.estado, id).map((p) => `<li><code>${p}</code></li>`).join("");
  return `<section class="detalhe" id="t-${id}" role="dialog" aria-modal="true" aria-labelledby="h-t-${id}" hidden><button type="button" class="fechar" aria-label="Fechar o detalhe">×</button><h2 id="h-t-${id}">${id}</h2><dl>${planeamento}${linhas}</dl><p class="meta">Para mudar o estado, cola no chat do agente:</p><ul class="pedidos-detalhe">${pedidos}</ul></section>`;
}

/** O detalhe de um ticket fechado (o Historico). */
function detalheFechado(f, ids) {
  const id = f.id; // casa o ID_LIKE
  const meta = escapa([f.tipoCelula, f.estadoCelula, f.sprint, f.versao, f.data].filter(Boolean).join(" · "));
  return `<section class="detalhe" id="f-${id}" role="dialog" aria-modal="true" aria-labelledby="h-f-${id}" hidden><button type="button" class="fechar" aria-label="Fechar o detalhe">×</button><h2 id="h-f-${id}">${id}</h2><p class="meta">${meta}</p><p>${renderTexto(f.descricao, ids)}</p></section>`;
}

/** Um cartao. */
function cartaoHtml(c, ids, dados) {
  if (c.cinzento) {
    // O `porque` e uma constante deste ficheiro; o ID pode ser qualquer coisa.
    const cru = escapa(c.id);
    return `<li class="cartao cinzento"><b>${cru}</b> <small>${c.porque}</small></li>`;
  }
  const id = c.id; // casa o ID_LIKE (so letras e digitos): nada a escapar
  const titulo = escapa(tituloDe(c.descricao));
  const etiquetas = [c.seccao, c.esforco && c.esforco.toUpperCase(), c.prioridadeLinha].filter(Boolean).map((e) => {
    const et = escapa(e);
    return `<span class="et">${et}</span>`;
  });
  const dep = c.dependeDeLinha;
  const deps = dep && dep.ids.length ? `<div class="dep">depende de ${renderTexto(dep.ids.join(", "), ids)}</div>` : "";
  const bloq = dep && dep.bloqueado !== null ? `<div class="bloqueado">Bloqueado: ${renderTexto(dep.bloqueado, ids)}</div>` : "";
  const nota = c.notaLinha ? `<div class="nota">${renderTexto(c.notaLinha, ids)}</div>` : "";
  const curso = c.emCurso ? `<span class="curso">Em curso</span>` : "";
  const noArq = c.noArquivo ? `<small>tambem no arquivo</small>` : "";
  dados.push({ id: c.id, tipo: c.seccao, esforco: c.esforco || "", prioridade: c.prioridadeLinha || "", busca: `${c.id} ${c.descricao}`.toLowerCase(), pedidos: pedidosDe(c.estado, c.id) });
  // Os pedidos sao constantes com o ID (que casa o ID_LIKE): nada a escapar.
  // Rotulos curtos (o cartao fica limpo); o texto inteiro vai no `title` e e o que se copia.
  const botoes = pedidosDe(c.estado, c.id).map((p, k) => `<button type="button" class="pedido" data-p="${k}" title="copiar: ${p}" aria-label="copiar o pedido: ${p}">${rotuloDe(p)}</button>`);
  // `data-tipo` e o indice da secao (uma cor por tipo, no CSS) e `data-curso` marca o em curso: atributos, e nao classes,
  // para o markup do cartao (`<li class="cartao" data-i=`) ficar estavel para os testes.
  const tipo = SECTIONS.findIndex((s) => s.key === c.seccao);
  return `<li class="cartao" data-i="${dados.length - 1}" data-tipo="${tipo}"${c.emCurso ? " data-curso" : ""}><a class="abre" href="#t-${id}"><b>${id}</b> ${titulo}</a>${curso}${noArq}<div class="ets">${etiquetas.join("")}</div>${deps}${bloq}${nota}<div class="pedidos">${botoes.join("")}</div></li>`;
}

/**
 * O HTML da vista.
 * @param {ReturnType<import("./backlog-itens.mjs").leBacklog>} lido
 * @param {{ g: Record<string, number>, countable: number, expectedPct: number }} calculo o resultado do `calcula`
 * @param {{ agora: Date, vigiar?: boolean, erro?: string | null }} o
 */
export function geraVista(lido, calculo, { agora, vigiar = false, erro = null, batida = 30000, chave = "vista" }) {
  // Os destinos dos IDs: um aberto abre o seu cartao, um fechado o seu detalhe; um ID nos dois e o aberto (o duplicado).
  const ids = new Map();
  for (const f of lido.fechados) if (ID_LIKE.test(f.id)) ids.set(f.id, `f-${f.id}`);
  for (const [id, t] of lido.tickets) if (ID_LIKE.test(id) && OPEN_STATES.includes(t.estado)) ids.set(id, `t-${id}`);
  const dados = [];
  const colunas = colunasDaVista(lido);
  const colunasHtml = colunas
    .map((col, k) => {
      const titulo = escapa(col.titulo);
      const objetivo = col.objetivo ? `<p class="objetivo">${renderTexto(col.objetivo, ids)}</p>` : "";
      const fecho = col.fecho ? `<p class="fecho">${renderTexto(col.fecho, ids)}</p>` : "";
      const cartoes = col.cartoes.map((c) => cartaoHtml(c, ids, dados)).join("");
      const abertosNaColuna = col.cartoes.filter((c) => !c.cinzento).length;
      const vazio = col.cartoes.length ? "" : `<p class="vazio">Sem tickets.</p>`;
      // `data-sprint` so nos blocos: o "So os sprints" esconde os Pendentes e o "Sem bloco".
      const sprint = col.pendentes || col.semBloco ? "" : " data-sprint";
      return `<section class="coluna" data-bloco="${k}"${sprint}><h2>${titulo}</h2><span class="n" title="tickets abertos">${abertosNaColuna}</span>${objetivo}<ul>${cartoes}</ul>${vazio}${fecho}</section>`;
    })
    .join("");
  // Por TIPO (a zona de referencia do backlog.md): uma coluna por secao, com os cartoes abertos dela, os em curso a
  // cabeca e depois pelo numero do ID. E outro quadro, e o seletor "Agrupar" mostra um ou o outro.
  const porTipoHtml = SECTIONS.map((s, k) => {
    const cartoes = [...lido.tickets.values()]
      .filter((t) => t.seccao === s.key && ID_LIKE.test(t.id) && OPEN_STATES.includes(t.estado))
      // Os mesmos campos do cartao no quadro por bloco (a prioridade, o "Depende de", o bloqueio, a nota): sem eles, o
      // mesmo ticket tinha etiquetas num quadro e nao no outro, e o filtro Prioridade esvaziava este.
      .map((t) => ({ ...t, emCurso: t.estado === "a fazer", prioridadeLinha: t.prioridade, dependeDeLinha: t.dependeDe, notaLinha: t.nota }))
      // Pelo prefixo e depois pelo numero (B2 antes de B10, e os prefixos nao se intercalam).
      .sort((a, b) => Number(b.emCurso) - Number(a.emCurso) || a.id.localeCompare(b.id, "en", { numeric: true }));
    const html = cartoes.map((c) => cartaoHtml(c, ids, dados)).join("");
    const vazio = cartoes.length ? "" : `<p class="vazio">Sem tickets.</p>`;
    return `<section class="coluna" data-tipo-col="${k}"><h2>${s.resumo}</h2><span class="n" title="tickets abertos">${cartoes.length}</span><ul>${html}</ul>${vazio}</section>`;
  }).join("");
  // O filtro por bloco: "todos", ou so uma coluna (num backlog com muitos sprints, as colunas lado a lado sao muitas).
  // "Mostrar": tudo por bloco, tudo por tipo, um bloco (`b:k`) ou um tipo (`t:k`) — um seletor so (pedido de 6 nov).
  const opcoesBloco = colunas
    .map((col, k) => {
      const titulo = escapa(col.titulo);
      return `<option value="b:${k}">${titulo}</option>`;
    })
    .join("");
  const opcoesTipo = SECTIONS.map((s, k) => `<option value="t:${k}">${s.resumo}</option>`).join("");
  const abertos = [...lido.tickets.values()].filter((t) => ID_LIKE.test(t.id) && OPEN_STATES.includes(t.estado));
  // Um por ID: um ID repetido no Historico (o check-backlog ja avisa) dava dois detalhes com o mesmo `id=`.
  const vistosF = new Set();
  const fechados = lido.fechados.filter((f) => ID_LIKE.test(f.id) && !(ids.get(f.id) ?? "").startsWith("t-") && !vistosF.has(f.id) && vistosF.add(f.id));
  // Onde cada ticket ficou no quadro por bloco (a 1.a coluna, como o cartao), para o detalhe o dizer.
  const colocados = new Map();
  for (const col of colunas) for (const c of col.cartoes) if (!c.cinzento && !colocados.has(c.id)) colocados.set(c.id, { coluna: col.titulo, ordem: c.ordemLinha });
  // Quem depende de cada ticket (o inverso do "Depende de" dos blocos), pela ordem em que aparecem.
  const dependentesDe = new Map();
  for (const b of lido.blocos) for (const l of b.linhas) for (const d of l.dependeDe?.ids ?? []) if (l.idLimpo && d !== l.idLimpo && !l.riscado && (ids.get(l.idLimpo) ?? "").startsWith("t-")) dependentesDe.set(d, [...new Set([...(dependentesDe.get(d) ?? []), l.idLimpo])]);
  const detalhes = [...abertos.map((t) => detalheAberto(t, ids, colocados.get(t.id), dependentesDe.get(t.id))), ...fechados.map((f) => detalheFechado(f, ids))].join("");
  // Os fechados numa tabela compacta (as colunas que o Historico tem; a descricao inteira esta no detalhe).
  const listaFechados = fechados
    .map((f) => {
      const id = f.id; // casa o ID_LIKE
      const titulo = escapa(tituloDe(f.descricao));
      const busca = escapa(`${f.id} ${f.descricao}`.toLowerCase());
      const meta = [f.tipoCelula, f.estadoCelula, f.sprint, f.versao, f.data].map((v) => {
        const celula = escapa(v ?? "");
        return `<td>${celula}</td>`;
      });
      return `<tr data-busca="${busca}"><td><a href="#f-${id}">${id}</a></td>${meta.slice(0, 2).join("")}<td>${titulo}</td>${meta.slice(2).join("")}</tr>`;
    })
    .join("");
  // Um ID do Historico que nao casa o ID_LIKE (riscado, `B-3`, hostil) nao tem detalhe nem link: fica uma linha so de
  // texto escapado, para o "Fechados (N)" continuar a bater com o calcula (sumir em silencio era o `TP2`).
  const fechadosInvalidos = lido.fechados
    .filter((f) => !ID_LIKE.test(f.id ?? ""))
    .map((f) => {
      const cru = escapa(`${f.id ?? ""} ${f.descricao ?? ""}`);
      return `<tr data-busca="${cru.toLowerCase()}" class="invalido"><td colspan="7">${cru} <small>(ID invalido: sem detalhe)</small></td></tr>`;
    })
    .join("");
  const indice = lido.sprintsFechados
    .map((s) => {
      const linha = escapa(Object.values(s).join(" · "));
      return `<li>${linha}</li>`;
    })
    .join("");
  const { g, countable, expectedPct } = calculo;
  const proximo = lido.proximo.texto === null ? "(sem a linha **Proximo:**)" : lido.proximo.texto.trim();
  const geradaEm = agora.toISOString().replace(/\.\d{3}Z$/, "Z");
  // A `chave` separa o que o browser guarda por projeto: duas vistas abertas do disco partilham o `localStorage`.
  const json = jsonSeguro({ cartoes: dados, geradaEm: agora.getTime(), vigiar, erro: Boolean(erro), batida, chave });
  // O fim de linha normalizado ANTES do hash: o browser normaliza o CRLF do HTML para LF antes de calcular o hash do
  // script inline, e um checkout com CRLF (o `toString()` traz a fonte como esta) bloqueava o script em silencio.
  const script = normalizaFimDeLinha(`${passaFiltro.toString()}\n${vistaParou.toString()}\n${JS_CORPO}`);
  const hash = createHash("sha256").update(script, "utf8").digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src 'none'`;
  // O recarregar e do JS (so com o `--vigiar`, e nao com o foco na pesquisa): um `meta refresh` perdia o que se escreve.
  const faixa = erro ? faixaDeErro(erro) : "";
  // O que o guarda acusa a vista nao esconde (`TP2`): um heading renomeado dava "Fechados (0)" e um quadro limpo.
  const emFalta = [!lido.encontradas.historico && lido.encontradas.arquivo && "o Historico", !lido.encontradas.pendentes && "os Pendentes sem Sprint"].filter(Boolean);
  const nAvisos = calculo.avisos?.length ?? 0;
  const aviso = nAvisos || emFalta.length ? `<p class="aviso" role="status">O check-backlog tem ${nAvisos} aviso(s)${emFalta.length ? `; nao encontrei ${emFalta.join(" nem ")}` : ""} — correr <code>node .agent/scripts/check-backlog.mjs</code></p>` : "";
  const modo = vigiar ? "atualizada sozinha (--vigiar)" : "gerada uma vez: volte a gerar depois de mexer no backlog";
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Backlog</title>
<style>${CSS}</style>
</head>
<body>
${faixa}${aviso}<header>
<div class="topo"><h1>Backlog</h1><div class="numeros"><span><b>${g.pendente + g["a fazer"]}</b> abertos</span><span><b>${g["a fazer"]}</b> em curso</span><span><b>${g.concluido}</b> concluidos</span></div></div>
<p class="progresso"><progress max="100" value="${expectedPct}" aria-label="Progresso"></progress> <b>${expectedPct}%</b> (${g.concluido}/${countable} concluidos)</p>
<details class="seguir"><summary>A seguir: ${renderTexto(proximo, ids)}</summary></details>
<p class="gerada">Gerada: <time datetime="${geradaEm}">${geradaEm}</time> — ${modo}<span id="parou" hidden> — o --vigiar parou: volte a gerar</span></p>
</header>
<div class="filtros"><select id="f-mostrar" aria-label="Mostrar"><option value="bloco">Tudo (sprints, pendentes e sem bloco)</option><option value="sprints">So os sprints</option><option value="tipo">So os tipos (Bugs, UX, Divida, Features)</option><optgroup label="Um bloco">${opcoesBloco}</optgroup><optgroup label="Um tipo">${opcoesTipo}</optgroup></select><input id="q" type="search" placeholder="ID ou texto" aria-label="Pesquisar"><select id="f-tipo" aria-label="Tipo"><option value="">Tipo</option>${SECTIONS.map((s) => `<option>${s.key}</option>`).join("")}</select><select id="f-esforco" aria-label="Esforco"><option value="">Esforco</option><option value="s">S</option><option value="m">M</option><option value="l">L</option></select><input id="f-prioridade" placeholder="Prioridade" aria-label="Prioridade"></div>
<main class="quadro" id="por-bloco">${colunasHtml}</main>
<main class="quadro" id="por-tipo" hidden>${porTipoHtml}</main>
<details id="fechados"><summary>Fechados (${fechados.length + lido.fechados.filter((f) => !ID_LIKE.test(f.id ?? "")).length})</summary><input id="qf" type="search" placeholder="Pesquisar nos fechados" aria-label="Pesquisar nos fechados"><div class="rolar"><table class="tabela-fechados"><thead><tr><th>ID</th><th>Tipo</th><th>Estado</th><th>Titulo</th><th>Sprint</th><th>Versao</th><th>Data</th></tr></thead><tbody>${listaFechados}${fechadosInvalidos}</tbody></table></div><h3>Sprints Fechados</h3><ul>${indice}</ul></details>
<aside id="painel">${detalhes}</aside>
<script type="application/json" id="dados">${json}</script>
<script>${script}</script>
</body>
</html>
`;
}
