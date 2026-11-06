/**
 * O LEITOR do backlog: os tickets, e nao contagens — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#445): o `check-backlog` (pelo `lib/backlog-calculo.mjs`) e a vista do backlog (#446) tem de ler a
 * MESMA coisa. Dois leitores das mesmas tabelas a concordar a mao era o `TP8`, e o que estivesse do lado menos corrido
 * envelhecia sem ninguem reparar. Daqui sai um objeto; o calculo conta e avisa a partir dele, e a vista desenha-o.
 *
 * SO LE: nao tem um unico aviso nem uma recusa (e e isso que o dispensa de par na varredura, `mutation-sweep.mjs`).
 * Quem avisa e o `calcula`. Uma linha estranha (sem ID, com um estado desconhecido) VEM na mesma, como esta: e o
 * `calcula` que decide o que ela conta e o que ela diz.
 *
 * ONDE LE: nas tabelas por tipo, o Estado e a 2.a coluna e a descricao a 3.a (como sempre); o Historico, os blocos e os
 * Pendentes pelo NOME das colunas (#445). Um bloco e uma tabela com `Ordem` e `ID` (as regras estao em
 * `lib/backlog-regras.mjs`, e o `calcula` passa-as como avisos).
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

/** O ID com a mesma tolerancia a enfase que o Estado e o Esforco ganharam. Sem isto,
 *  `| **B7** |` no ativo e `| B7 |` no arquivo eram duas chaves diferentes em `allIds` —
 *  logo o aviso de ID duplicado **nao saia** — e nenhuma delas casava o `ID_LIKE`, pelo que
 *  a linha tambem escapava ao aviso de "tabela que nenhuma seccao reconhece". Dar a
 *  tolerancia a dois campos e a um terceiro nao e pior do que nao a dar a nenhum: e uma
 *  incoerencia que abre uma porta que ninguem procura. */
export const idDe = (celula) => norm(celula).toUpperCase();

/** Os estados de um ticket: os abertos vivem no ativo, os fechados no arquivo. */
export const OPEN_STATES = ["pendente", "a fazer"];
export const CLOSED_STATES = ["concluido", "cancelado"];

/** A forma de um ID (`B7`, `UX12`, `T58`). */
export const ID_LIKE = /^[A-Z]{1,4}\d+$/;

/** As celulas do CABECALHO de uma tabela. O `tableRows` descarta-o de propósito; a
 *  validacao de `Esforco` precisa dele para achar a coluna **pelo nome** e nao pela posicao
 *  — as quatro seccoes tem esquemas diferentes, e uma posicao fixa mentia a primeira vez
 *  que alguem acrescentasse uma coluna. */
export function tableHeader(text) {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|?$/.test(t)) continue;
    return t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => norm(c));
  }
  return null;
}

// Extrai as linhas de dados das tabelas markdown numa seccao de texto.
// Ignora cabecalho, separador (|---|) e linhas totalmente vazias (placeholder).
export function tableRows(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|?$/.test(t)) continue; // separador
    // Proteger pipes escapados (`\|`) em celulas — GFM permite-os e descricoes reais usam-nos.
    const cells = t
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .replace(/\\\|/g, "\u0000")
      .split("|")
      .map((c) => c.replace(/\u0000/g, "|").trim());
    const first = norm(cells[0]);
    if (["id", "seccao", "ordem", "sprint"].includes(first)) continue; // cabecalho
    if (cells.every((c) => c === "")) continue; // placeholder vazio
    rows.push(cells);
  }
  return rows;
}

/** O texto sem os acentos, e so isso (#466): "Dívida Técnica" e "Histórico" casam os `re` escritos sem acentos. NAO e o
 *  `norm`: esse tira tambem `*` e passa a minusculas, e um `## **Bugs**` passava a casar um titulo que hoje nao casa.
 *  Para os TITULOS; o `Proximo:` fica com o `Pr[oó]ximo` dele, porque o leitor devolve o texto da linha (com acentos). */
export const semAcentos = (s) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Conteudo entre um heading que faz match e o proximo heading (o titulo compara-se sem acentos, #466).
export function section(text, headingRegex) {
  const out = [];
  let capturing = false;
  for (const line of text.split("\n")) {
    const isHeading = /^#{1,6}\s/.test(line);
    if (isHeading) {
      if (capturing) break;
      if (headingRegex.test(semAcentos(line))) {
        capturing = true;
        continue;
      }
    }
    if (capturing) out.push(line);
  }
  return out.join("\n");
}

// Seccoes por tipo (ordem == ordem das linhas do Resumo, sem a linha Total).
// `resumo` e o rotulo tal como aparece na primeira coluna da tabela Resumo — usado para
// casar por nome em vez de por posicao. Ao renomear uma seccao num projeto derivado,
// atualizar aqui e no `backlog.md` em simultaneo (o guard avisa se divergirem).
export const SECTIONS = [
  // Pelo NOME, a seguir a um numero opcional (#191): o numero do heading nao e da regra, e a
  // `process-rules` manda actualizar pelo nome. Renumerar ou reordenar ja nao parte nada.
  { key: "Bugs", resumo: "Bugs / Violacoes de Regras", re: /^##\s*(?:\d+\.\s*)?Bugs\b/i, tipos: ["bug", "bugs"] },
  { key: "UX", resumo: "Melhorias UX", re: /^##\s*(?:\d+\.\s*)?Melhorias UX\b/i, tipos: ["ux"] },
  { key: "Divida Tecnica", resumo: "Divida Tecnica", re: /^##\s*(?:\d+\.\s*)?Divida Tecnica\b/i, tipos: ["tecnica", "divida tecnica", "tech"] },
  { key: "Features", resumo: "Features Futuras", re: /^##\s*(?:\d+\.\s*)?Features Futuras\b/i, tipos: ["feature", "features"] },
];

/** Os IDs citados num texto livre (o `Proximo:`, o "Depende de"): as palavras com a forma de um ID, pela ordem. Um so
 *  sitio, para os dois leitores de texto livre nao divergirem (`TP8`). So a forma, e com a caixa como esta: se uma
 *  palavra e um ID que EXISTE e o PR 2 que o cruza com os conhecidos (`S2` ou `ISO27001` tem a forma, e nao o sao). */
export const idsDe = (texto) => (texto ?? "").split(/[^A-Za-z0-9]+/).filter((w) => ID_LIKE.test(w));

/** A celula "Depende de": os IDs antes de `Bloqueado:`, e o motivo depois dele. `null` sem a coluna (como a `ordem` e a
 *  `prioridade`); `bloqueado` e `null` sem a marca, e `""` com a marca e sem motivo — um "bloqueado sem motivo", que
 *  um `if (bloqueado)` leria ao contrario. A marca e a palavra inteira (`Desbloqueado:` nao conta), com a enfase em
 *  volta (`**Bloqueado:**`), que nao passa para o motivo. So le: o que um ID fora de ordem quer dizer e o PR 2 do #445. */
export function leDependeDe(celula) {
  if (celula === null || celula === undefined) return null;
  const m = /\bbloqueado\b[*_`\s]*:[*_`]*/i.exec(celula);
  return {
    texto: celula,
    ids: idsDe(m ? celula.slice(0, m.index) : celula),
    // A enfase de FECHO da marca (`**Bloqueado:**`) e a regex que a come; a do meio do motivo fica, e para mostrar.
    bloqueado: m ? celula.slice(m.index + m[0].length).trim() : null,
  };
}

/** Um par normalizado + cru, pela coluna `nome`: `{ v: null, c: null }` sem a coluna. A mesma convencao em todas as
 *  tabelas (leitura independente do #445): o Esforco de um bloco e o da tabela por tipo comparam-se sem tropecar na caixa. */
const parDe = (cabecalho, cells, nome) => {
  const c = pelaColuna(cabecalho, cells, nome);
  return { v: c === null ? null : norm(c), c };
};

/** As celulas de uma linha pelo nome do cabecalho: para a vista mostrar o que o leitor nao nomeia (Severidade, Pagina…). */
const colunasDe = (cabecalho, cells) => Object.fromEntries((cabecalho ?? []).map((n, i) => [n, cells[i] ?? ""]));

/** A celula da coluna `nome` (pelo cabecalho normalizado), ou `null` sem a coluna. */
const pelaColuna = (cabecalho, cells, nome) => {
  const i = (cabecalho ?? []).indexOf(nome);
  return i < 0 ? null : cells[i] ?? "";
};

/** As linhas das quatro tabelas por tipo, TODAS (abertas, fechadas, de estado desconhecido, sem ID), pela ordem do
 *  `SECTIONS`. Uma secao com duas tabelas le o cabecalho da primeira e as linhas de todas: e o comportamento de sempre. */
function linhasPorTipo(active) {
  const out = [];
  for (const { key, re } of SECTIONS) {
    const seccao = section(active, re);
    const cabecalho = tableHeader(seccao);
    const iEsforco = cabecalho ? cabecalho.indexOf("esforco") : -1;
    for (const cells of tableRows(seccao)) {
      out.push({
        seccao: key,
        id: idDe(cells[0]),
        idCelula: cells[0],
        ...riscoDe(cells[0]),
        estado: norm(cells[1]),
        estadoCelula: cells[1],
        // `null` sem a coluna, e `""` com a celula vazia: o `calcula` so valida o Esforco quando a coluna existe.
        esforco: iEsforco >= 0 ? norm(cells[iEsforco] ?? "") : null,
        esforcoCelula: iEsforco >= 0 ? cells[iEsforco] : null,
        descricao: cells[2] ?? "",
        colunas: colunasDe(cabecalho, cells),
      });
    }
  }
  return out;
}

/** O `~~X~~`: o `id` NAO muda (um riscado nao casa o `ID_LIKE`, e a rede 2b e o `trackId` ficam iguais); `idLimpo` e so
 *  para a mensagem dizer qual e (#445 PR 2). */
const riscoDe = (celula) => ({ riscado: /~~/.test(celula ?? ""), idLimpo: idDe((celula ?? "").replace(/~~/g, "")) });

/** As tabelas de um texto, cada uma com o seu cabecalho, as linhas e onde comeca: uma tabela acaba numa linha que nao
 *  comeca por `|`. As tabelas por tipo NAO passam por aqui (o `calcula` le-as como sempre); os blocos e o arquivo sim. */
export function tabelasDe(texto) {
  const linhas = (texto ?? "").split("\n");
  const out = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].trim().startsWith("|")) continue;
    let f = i;
    while (f < linhas.length && linhas[f].trim().startsWith("|")) f++;
    // O cabecalho e a 1.a linha que nao e o separador, e sai EXPLICITAMENTE: o `tableRows` so o reconhece pela 1.a celula
    // (`ID`, `Ordem`…), e um `| Prioridade | Ordem | ID |` era lido como uma linha de dados.
    const tabela = linhas.slice(i, f);
    const iCab = tabela.findIndex((l) => !/^\|[\s|:-]+\|?$/.test(l.trim()));
    const corpo = tabela.filter((_, k) => k !== iCab).join("\n");
    out.push({ inicio: i, cabecalho: tableHeader(tabela.join("\n")) ?? [], linhas: tableRows(corpo) });
    i = f - 1;
  }
  return out;
}

/** O heading imediatamente acima da linha `i` (o indice e o texto sem os `#`), ou `null`. */
function headingAntes(linhas, i) {
  for (let j = i - 1; j >= 0; j--) if (/^#{1,6}\s/.test(linhas[j])) return { i: j, texto: linhas[j].replace(/^#+\s*/, ""), linha: linhas[j] };
  return null;
}

/** As linhas do Historico do arquivo, pelo NOME das colunas (#445 PR 2: por posicao, uma coluna acrescentada antes do
 *  Estado dava avisos falsos em todas as linhas). Uma coluna em falta da `null` nesse campo. */
function fechados(archive) {
  const seccao = section(archive ?? "", /^##\s*Historico/i);
  const cab = tableHeader(seccao);
  return tableRows(seccao).map((cells) => {
    const tipo = pelaColuna(cab, cells, "tipo");
    const estado = pelaColuna(cab, cells, "estado");
    const id = pelaColuna(cab, cells, "id") ?? "";
    return {
      id: idDe(id),
      idCelula: id,
      tipo: tipo === null ? null : norm(tipo),
      tipoCelula: tipo,
      descricao: pelaColuna(cab, cells, "descricao") ?? "",
      estado: estado === null ? null : norm(estado),
      estadoCelula: estado,
      sprint: pelaColuna(cab, cells, "sprint") ?? "",
      versao: pelaColuna(cab, cells, "versao") ?? "",
      data: pelaColuna(cab, cells, "data") ?? "",
    };
  });
}

/** As colunas que o Historico TEM de ter e nao tem (so com o arquivo e o heading presentes, e com uma tabela). */
function colunasEmFaltaNoHistorico(archive) {
  if (archive === null || !/^##\s*Historico/im.test(semAcentos(archive))) return [];
  const cab = tableHeader(section(archive, /^##\s*Historico/i));
  return cab ? ["id", "tipo", "estado"].filter((c) => !cab.includes(c)) : [];
}

/** Os IDs das tabelas do arquivo, pela coluna `ID` (o indice de sprints nao a tem, e nao da nenhum). Os do proprio
 *  Historico vem tambem, e estao la por definicao: a regra so diz os que la NAO estao (sem filtros que nenhum teste
 *  distinguisse, `TP7`). */
function arquivoForaDoHistorico(archive) {
  const linhas = (archive ?? "").split("\n");
  const out = [];
  for (const t of tabelasDe(archive)) {
    const h = headingAntes(linhas, t.inicio);
    for (const cells of t.linhas) {
      const id = idDe((pelaColuna(t.cabecalho, cells, "id") ?? "").replace(/~~/g, ""));
      if (ID_LIKE.test(id)) out.push({ id, titulo: h?.texto ?? "" });
    }
  }
  return out;
}

/**
 * Os BLOCOS, pelo CABECALHO (#445 PR 2): toda a tabela do ativo com as colunas `Ordem` e `ID`, seja qual for o titulo. O
 * `titulo` e o heading acima (`(tabela 2)` para a segunda debaixo do mesmo); o `objetivo` e o `fecho` sao as linhas `>`
 * entre o heading e a 1.a tabela dele. Devolve tambem o que PARECE um bloco e nao o e, para avisar (`TP2`):
 *  - `semId`: uma tabela com `Ordem` e sem `ID` (um bloco com a coluna mal nomeada passava calado);
 *  - `sprintSemOrdem`: uma tabela com `ID` e sem `Ordem` debaixo de um `Sprint` (a rede 2b de antes valia la).
 */
function blocos(active) {
  const linhas = active.split("\n");
  const out = [];
  const semId = [];
  const sprintSemOrdem = [];
  const porHeading = new Map();
  for (const t of tabelasDe(active)) {
    const h = headingAntes(linhas, t.inicio);
    const n = (porHeading.get(h?.i ?? -1) ?? 0) + 1;
    porHeading.set(h?.i ?? -1, n);
    const titulo = (h?.texto ?? "") + (n > 1 ? ` (tabela ${n})` : "");
    const temOrdem = t.cabecalho.includes("ordem");
    const temId = t.cabecalho.includes("id");
    if (temOrdem && !temId) semId.push({ titulo });
    if (!temOrdem && temId && h && /^#{2,4}\s*Sprint\b/i.test(h.linha)) sprintSemOrdem.push({ titulo });
    if (!temOrdem || !temId) continue;
    const prefacio = n === 1 ? linhas.slice((h?.i ?? -1) + 1, t.inicio).join("\n") : "";
    const cab = t.cabecalho;
    out.push({
      titulo,
      cabecalho: cab,
      // `> Objetivo: x`, `> **Objetivo:** x`, `> **Objetivo**: x`, `> _Objetivo:_ x`; e nao `> Objetivos: x`. O texto vem como
      // esta (com a enfase do meio): e para mostrar. O `> Fecho:` le-se para a vista; o guarda nao o usa.
      objetivo: /^>\s*[*_]*Objetivo[*_]*\s*:[*_]*\s*(.*)$/im.exec(prefacio)?.[1].trim() ?? null,
      fecho: /^>\s*[*_]*Fecho[*_]*\s*:[*_]*\s*(.*)$/im.exec(prefacio)?.[1].trim() ?? null,
      linhas: t.linhas.map((cells) => {
        const idCelula = pelaColuna(cab, cells, "id");
        return {
          ordem: pelaColuna(cab, cells, "ordem"),
          id: idDe(idCelula),
          idCelula,
          ...riscoDe(idCelula),
          descricao: pelaColuna(cab, cells, "descricao"),
          ...((e) => ({ esforco: e.v, esforcoCelula: e.c }))(parDe(cab, cells, "esforco")),
          prioridade: pelaColuna(cab, cells, "prioridade"),
          dependeDe: leDependeDe(pelaColuna(cab, cells, "depende de")),
        };
      }),
    });
  }
  return { blocos: out, semId, sprintSemOrdem };
}

/** O heading dos Pendentes, TOLERANTE (decidido a 5 nov): um emoji no inicio, e `Pendentes sem Sprint` ou `Pendente (sem
 *  sprint)` — as formas dos dois derivados. A coluna `Nota` e estrita (renomeia-se). */
const RE_PENDENTES = /^#{2,3}\s*(?:\d+\.\s*)?(?:\p{Extended_Pictographic}\S*\s*)?Pendentes?\s*\(?sem sprint\)?/iu;

/** A tabela dos Pendentes sem Sprint: a `Nota` pelo nome (`null` sem a coluna). `null` inteiro SEM o heading, e `[]`
 *  com ele e sem linhas: "a secao foi renomeada" e "nao ha pendentes" pedem coisas diferentes (`TP2`). */
function pendentes(active) {
  // Sem acentos, como o `section()` logo abaixo: os dois nao podem discordar sobre o mesmo titulo (#466).
  if (!active.split("\n").some((l) => RE_PENDENTES.test(semAcentos(l)))) return { ps: null, temNota: false, temTabela: false };
  const seccao = section(active, RE_PENDENTES);
  const cabecalho = tableHeader(seccao);
  const ps = tableRows(seccao).map((cells) => {
    const id = pelaColuna(cabecalho, cells, "id");
    const e = parDe(cabecalho, cells, "esforco");
    return { id: id === null ? null : idDe(id), ...riscoDe(id), descricao: pelaColuna(cabecalho, cells, "descricao"), esforco: e.v, esforcoCelula: e.c, nota: pelaColuna(cabecalho, cells, "nota") };
  });
  return { ps, temNota: (cabecalho ?? []).includes("nota"), temTabela: cabecalho !== null };
}

/** A linha `**Proximo:**` (#191): o texto, e o ID para onde aponta (so o PRIMEIRO da linha: o resto e texto livre). O
 *  regex e o de sempre, mudado LITERALMENTE do `calcula` (#446): a vista mostra-a, e o guarda verifica-a, pela mesma leitura. */
function proximo(active) {
  const texto = /^\*\*Pr[oó]ximo:\*\*(.*)$/im.exec(active)?.[1] ?? null;
  return { texto, alvo: idsDe(texto ?? "")[0] ?? null };
}

/** O indice "Sprints Fechados" do arquivo, pelo nome das colunas: cada linha como `{ coluna: celula }` (as colunas do
 *  template e as de um derivado diferem; a vista mostra-as como estao). `[]` sem o heading. */
function sprintsFechados(archive) {
  const seccao = section(archive ?? "", /^##\s*Sprints Fechados/i);
  const cab = tableHeader(seccao);
  return tableRows(seccao).map((cells) => colunasDe(cab, cells));
}

/**
 * O backlog lido: as tabelas como estao, e a juncao por ticket.
 * @param {string} active o `backlog.md`
 * @param {string | null} archiveRaw o `backlog-archive.md`, ou `null`
 */
export function leBacklog(active, archiveRaw) {
  const porTipo = linhasPorTipo(active);
  const arquivo = fechados(archiveRaw);
  const { blocos: bs, semId, sprintSemOrdem } = blocos(active);
  const { ps, temNota, temTabela } = pendentes(active);
  // A JUNCAO (o pedido do #445): um ticket por ID, a partir das tabelas por tipo. E um `Map` (a ordem e a das tabelas);
  // para embutir em JSON, `[...tickets.values()]` — o `JSON.stringify` de um `Map` da `{}`. Com um ID repetido fica a PRIMEIRA
  // linha: o duplicado e o `calcula` que o diz. Uma linha sem ID nao e um ticket.
  const tickets = new Map();
  for (const l of porTipo) {
    if (!l.id || tickets.has(l.id)) continue;
    tickets.set(l.id, { id: l.id, seccao: l.seccao, estado: l.estado, esforco: l.esforco, descricao: l.descricao, colunas: l.colunas, bloco: null, ordem: null, prioridade: null, dependeDe: null, nota: null, noArquivo: false });
  }
  for (const b of bs) {
    for (const l of b.linhas) {
      const t = l.id && tickets.get(l.id);
      if (t && t.bloco === null) Object.assign(t, { bloco: b.titulo, ordem: l.ordem, prioridade: l.prioridade, dependeDe: l.dependeDe });
    }
  }
  for (const p of ps ?? []) {
    const t = p.id && tickets.get(p.id);
    if (t && t.nota === null) t.nota = p.nota;
  }
  const fechadosIds = new Set(arquivo.map((f) => f.id).filter(Boolean));
  // `noArquivo` e "o ID tambem esta no Historico" (um duplicado), e NAO "fechado": o fechado e o Estado.
  for (const t of tickets.values()) t.noArquivo = fechadosIds.has(t.id);
  // O que se procurou e NAO se encontrou (`TP2`): sem isto, uma secao renomeada e uma secao vazia davam o mesmo `[]`.
  const encontradas = { arquivo: archiveRaw !== null, historico: /^##\s*Historico/im.test(semAcentos(archiveRaw)), pendentes: ps !== null, tabelaNosPendentes: temTabela, notaNosPendentes: temNota };
  return {
    linhasPorTipo: porTipo,
    fechados: arquivo,
    blocos: bs,
    pendentes: ps,
    tickets,
    encontradas,
    // O que so as regras leem (#445 PR 2).
    semId,
    sprintSemOrdem,
    colunasEmFaltaNoHistorico: colunasEmFaltaNoHistorico(archiveRaw),
    arquivoForaDoHistorico: arquivoForaDoHistorico(archiveRaw),
    // O que a vista (#446) mostra, e o guarda verifica pela mesma leitura.
    proximo: proximo(active),
    sprintsFechados: sprintsFechados(archiveRaw),
  };
}
