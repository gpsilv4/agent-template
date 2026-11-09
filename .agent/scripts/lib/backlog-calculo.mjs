/**
 * O CALCULO do backlog, sem efeitos — {{PROJECT_NAME}}
 *
 * Saiu do `check-backlog.mjs` (#431), que o usa para AVISAR e o `lib/backlog-corrige.mjs` para REESCREVER os
 * valores derivados: um so calculo, para o `--corrigir` nunca escrever um numero que o verificador calcule de outra
 * forma. Le as tabelas por tipo do ativo e o Historico do arquivo, conta por seccao e no total, e valida o Resumo, o
 * Total e a barra do Progresso Geral. Cada aviso sai com `derivado: true` so quando e uma CONTAGEM escrita diferente
 * da calculada (uma linha do Resumo, o Total, o Progresso, os blocos da barra): e a unica classe que o `--corrigir`
 * pode reescrever. Tudo o resto (um ID duplicado, um estado desconhecido, uma seccao que falta) deixa os proprios
 * contadores errados, e e de uma pessoa.
 */

import { leBacklog, norm, semAcentos, idDe, tableRows, section, SECTIONS, ID_LIKE, OPEN_STATES, CLOSED_STATES } from "./backlog-itens.mjs";
import { regrasDoBacklog } from "./backlog-regras.mjs";
import { VAZIO_RE } from "./backlog-celulas.mjs";

/**
 * Um backlog que nao existe (`null`) ou so com espacos: nao ha nada a validar, e e um erro (#477). Um so predicado para
 * o `check-backlog` e a vista: com dois (`!active` e `!active.trim()`), um backlog so com espacos dava ao verificador
 * oito avisos de cabecalhos em falta e a vista "esta vazio".
 * @param {string | null | undefined} texto
 */
export const ehBacklogVazio = (texto) => !texto?.trim();

// Vocabulario da barra, explicito. Acrescentar um glifo aqui e a forma suportada de o adotar.
export const BLOCO_VAZIO = new Set(["_", " ", "\t", "-", "\u00b7", "\u2591", "\u2b1c", "\u25cb", "\u25fb", "\u25ab"]);
// `\u2b1b` (⬛) e o PAR de `\u2b1c` (⬜), que ja estava nos vazios. Sem ele, quem usasse o
// par mais natural de todos levava dois avisos de uma vez ("nao sei classificar" + "0 blocos").
export const BLOCO_CHEIO = new Set(["\u2588", "\u2593", "\u2592", "#", "\u25a0", "\u25cf", "\u2b1b", "\ud83d\udfe9", "\ud83d\udfe6", "\ud83d\udfe8", "\u25fc", "\u25aa"]);

/** Marca de um aviso que e uma contagem escrita diferente da calculada (o que o `--corrigir` pode reescrever). */
const DERIVADO = true;

/**
 * @param {string} active  o `backlog.md`
 * @param {string | null} archiveRaw  o `backlog-archive.md`, ou `null` se nao existe
 * @param {{ ACTIVE: string, ARCHIVE: string }} nomes  os caminhos, para as mensagens
 * @param {{ areas?: Record<string, string> | null }} [opcoes]  a lista de areas do projeto (`lib/backlog-areas.mjs`), ou
 *   `null` sem ela; em falta vale `null` (#465): esquecer de a passar faz barulho com a coluna presente, e nao desliga nada
 */
export function calcula(active, archiveRaw, { ACTIVE, ARCHIVE }, { areas = null } = {}) {
  const avisos = [];
  const warn = (msg, derivado = false) => avisos.push({ msg, derivado });

  if (archiveRaw === null) {
    warn(`${ARCHIVE} nao encontrado — o layout de dois ficheiros do backlog esta incompleto (items fechados vivem la)`);
  }

  const counts = {};
  for (const { key } of SECTIONS) {
    counts[key] = { pendente: 0, "a fazer": 0, concluido: 0, cancelado: 0, total: 0 };
  }

  const allIds = new Map(); // id -> [origens]
  const abertos = new Set(); // ids Pendente/A Fazer nas tabelas por tipo
  const trackId = (id, origem) => {
    if (!id) return;
    if (!allIds.has(id)) allIds.set(id, []);
    allIds.get(id).push(origem);
  };

  // O backlog LIDO (#445): as tabelas vem do leitor partilhado, e daqui so sai o que se conta e o que se avisa.
  const lido = leBacklog(active, archiveRaw);

  // 1) Items ABERTOS a partir das tabelas por tipo em backlog.md
  const ESFORCOS = ["s", "m", "l"];
  for (const l of lido.linhasPorTipo) {
    const { seccao: key, id } = l;
    // `Esforco` gate-ia todo o `ticket-method` (Fase 0, Fase 3, Fase 4) e era texto livre sem
    // validacao nenhuma — medido: um item com `Esforco = XXL` passava com exit 0. Um campo que
    // decide o rigor do processo nao pode ser o unico sem rede. `null` e a tabela sem a coluna: nao se valida.
    if (l.esforco !== null && id) {
      // `-`, `—` e `n/a` sao a convencao markdown para "vazio", e a celula vazia ja era
      // tolerada de propósito. Reprovar a forma escrita e tolerar a vazia era incoerente.
      const e = l.esforco.replace(VAZIO_RE, ""); // `norm` ja tira a enfase; a mesma lista da Area (#465)
      if (e && !ESFORCOS.includes(e)) {
        warn(`${key}: item "${id}" tem Esforco "${l.esforcoCelula}" — esperado S, M ou L (ver a legenda do backlog)`);
      }
    }
    const estado = l.estado;
    trackId(id, `${key} (ativo)`);
    if (OPEN_STATES.includes(estado)) {
      abertos.add(id);
      counts[key][estado]++;
      counts[key].total++;
    } else if (CLOSED_STATES.includes(estado)) {
      warn(`${key}: item "${id}" esta "${l.estadoCelula}" mas continua no ficheiro ativo — mover para backlog-archive.md`);
      counts[key][estado]++;
      counts[key].total++;
    } else if (id) {
      warn(`${key}: item "${id}" tem Estado desconhecido ("${l.estadoCelula}")`);
      counts[key].total++;
    }
  }

  // 1b) A ESTRUTURA que este checker precisa existe de facto?
  // Sem isto havia um falso negativo grave: um backlog com items reais mas com o titulo de
  // uma seccao renomeado (`## 1. Bugs` -> `## Defeitos`) dava zero linhas encontradas, e o
  // checker anunciava "Backlog vazio (template) — nada a validar" com exit 0. Ou seja, o
  // gate passava A DIZER que o backlog estava vazio quando tinha items. Renomear seccoes e a
  // primeira customizacao natural num projeto derivado, logo este e o caminho provavel.
  //
  // Duas redes independentes: (a) os cabecalhos que o parser procura existem; (b) nenhuma
  // linha com aspeto de item ficou de fora da contagem — esta ultima apanha o drift mesmo
  // que os cabecalhos mudem de forma que (a) nao preveja.
  for (const { key, re } of SECTIONS) {
    // Sem acentos, como o `section()` do leitor (#466): os dois nao podem discordar sobre o mesmo titulo.
    if (!active.split("\n").some((l) => re.test(semAcentos(l)))) {
      warn(`${ACTIVE}: nao encontrei o cabecalho da seccao "${key}" (${re}) — os items dessa seccao nao estao a ser contados`);
    }
  }

  const contados = new Set(allIds.keys());
  for (const cells of tableRows(active)) {
    const id = idDe(cells[0]);
    if (ID_LIKE.test(id) && !contados.has(id)) {
      warn(`${ACTIVE}: item "${id}" esta numa tabela que nenhuma seccao reconhecida cobre — verificar os cabecalhos das quatro seccoes`);
    }
  }

  // 2) Items FECHADOS a partir do Historico em backlog-archive.md
  //    Colunas lidas pelo NOME (#445): ID, Tipo, Estado (e Descricao, Sprint, Versao, Data)
  const tipoToKey = {};
  for (const { key, tipos } of SECTIONS) for (const t of tipos) tipoToKey[t] = key;

  // Sem a coluna Tipo ou Estado no Historico, validar linha a linha dava um aviso por linha: a regra das colunas
  // (`backlog-regras.mjs`) diz uma vez o que falta, e as contagens do arquivo ficam por fazer (#445 PR 2).
  const historicoLegivel = !lido.colunasEmFaltaNoHistorico.some((c) => c === "tipo" || c === "estado");
  for (const f of lido.fechados) {
    const { id, tipo, estado } = f;
    trackId(id, "arquivo");
    if (!historicoLegivel) continue;
    const key = tipoToKey[tipo];
    if (!key) {
      if (id) warn(`Arquivo: item "${id}" tem Tipo desconhecido ("${f.tipoCelula}") — usar Bug/UX/Tecnica/Feature`);
      continue;
    }
    if (CLOSED_STATES.includes(estado)) {
      counts[key][estado]++;
      counts[key].total++;
    } else if (id) {
      warn(`Arquivo: item "${id}" tem Estado invalido ("${f.estadoCelula}") — deve ser Concluido ou Cancelado`);
    }
  }

  // 2b) O plano de sprints e o `Proximo:` apontam para items ABERTOS (#191). Ao fechar um item a
  //     linha dele SAI do sprint, e o `Proximo:` passa ao seguinte (`backlog-method.md`) — logo um
  //     ID que la fique e um esquecimento, e um que nao existe e uma gralha. Os dois davam OK: o ID
  //     do sprint vive na SEGUNDA coluna (depois de `Ordem`), e a rede de "tabela que nenhuma
  //     seccao cobre" so le a primeira.
  const fechados = new Set([...allIds].filter(([, o]) => o.includes("arquivo")).map(([id]) => id));
  const porque = (id) =>
    abertos.has(id) ? null : fechados.has(id) ? "esta fechado (vive no backlog-archive.md)" : "nao existe em nenhuma tabela por tipo";
  for (const b of lido.blocos) {
    for (const l of b.linhas) {
      const p = ID_LIKE.test(l.id) ? porque(l.id) : null;
      if (p) warn(`${ACTIVE}: "${b.titulo}" lista "${l.id}", que ${p}`);
    }
  }
  // So o PRIMEIRO ID da linha: e para la que ela aponta, e o resto e texto livre que pode citar outros.
  // A leitura e a do leitor partilhado (#446), com o mesmo regex de sempre: a vista mostra a linha que aqui se verifica.
  const alvo = lido.proximo.alvo;
  if (alvo && porque(alvo)) warn(`${ACTIVE}: **Proximo:** aponta para "${alvo}", que ${porque(alvo)}`);

  // 3) Duplicados de ID (um item vive num so sitio)
  for (const [id, origens] of allIds) {
    if (origens.length > 1) warn(`ID duplicado "${id}" em: ${origens.join(", ")}`);
  }

  // 3b) As regras que nao sao contagens (#445 PR 2): a Ordem, o "Depende de", o arquivo, os riscados, os Pendentes.
  //     Todas reprovam, e nenhuma e `derivado`: o `--corrigir` nao lhes toca.
  for (const msg of regrasDoBacklog(lido, { ACTIVE, ARCHIVE }, { areas })) warn(msg);

  // --- Totais globais ---
  const g = { pendente: 0, "a fazer": 0, concluido: 0, cancelado: 0, total: 0 };
  for (const { key } of SECTIONS) for (const k of Object.keys(g)) g[k] += counts[key][k];

  // --- Validar tabela Resumo ---
  // O heading `## Resumo` nao tinha rede: renomeado, `section()` devolve "", `tableRows("")`
  // devolve [], o forEach nao corre e o checker anunciava "contadores consistentes" com exit 0
  // — a desligar em silencio a sua propria razao de existir. Mesma forma do TP2 que este
  // ficheiro deu origem, e que ficou de fora quando os cabecalhos `## 1.`..`## 4.` a ganharam.
  const todasResumoRows = tableRows(section(active, /^##\s*Resumo/i));
  // A linha `**Total**` era FILTRADA e nunca comparada — e e o numero mais lido do backlog.
  // Medido: um Resumo com Total a `999/888/777/666/555` saia `OK — contadores consistentes`
  // com exit 0. O gate nao so passava: **afirmava** consistencia que nao verificara (TP1).
  const linhaTotal = todasResumoRows.find((r) => norm(r[0]).includes("total"));
  const resumoRows = todasResumoRows.filter((r) => !norm(r[0]).includes("total"));
  if (resumoRows.length !== SECTIONS.length) {
    warn(
      `${ACTIVE}: a tabela "Resumo" tem ${resumoRows.length} linha(s) de seccao, esperadas ${SECTIONS.length} ` +
        `— cabecalho \`## Resumo\` renomeado, tabela alterada ou linha a mais/menos. Contadores NAO validados`
    );
  }
  // Casar por NOME e nao por posicao: `process-rules.md` di-lo explicitamente ("atualiza as
  // tabelas pelo nome da seccao — nunca assumindo posicao"). Por posicao, trocar duas linhas
  // do Resumo atribuia os numeros a seccao errada e a mensagem apontava para o sitio errado.
  const porNome = new Map();
  for (const { key, resumo } of SECTIONS) porNome.set(norm(resumo ?? key), key);
  // Com o Historico ilegivel (sem a coluna Tipo ou Estado), os fechados nao se contaram: comparar o Resumo, o Total e
  // a barra com essas contagens dava avisos falsos sobre contadores que estao certos. A regra da coluna diz o porque.
  if (historicoLegivel) resumoRows.forEach((cells) => {
    const key = porNome.get(norm(cells[0]));
    if (key === undefined) {
      warn(`${ACTIVE}: linha do Resumo "${cells[0]}" nao corresponde a nenhuma seccao conhecida`);
      return;
    }
    const c = counts[key];
    // `parseInt(x) || 0` tornava qualquer celula ilegivel (`?`, `n/a`, `—`, ou um numero em
    // **negrito**) num zero silencioso — o TP2 a nivel de celula, e uma mensagem que acusava o
    // ficheiro de dizer [0,0,0,0,0] quando dizia outra coisa. `\d+` tolera o negrito e o resto
    // e reportado como ilegivel, nao como zero.
    const nums = cells.slice(1, 6).map((x, i) => {
      const m = /-?\d+/.exec(x);
      if (!m) {
        warn(`Resumo "${cells[0]}": celula ${i + 1} nao e um numero (${JSON.stringify(x)}) — nao validei esta linha`);
        return null;
      }
      return Number(m[0]);
    });
    if (nums.includes(null)) return;
    const expected = [c.total, c.pendente, c["a fazer"], c.concluido, c.cancelado];
    if (nums.join(",") !== expected.join(",")) {
      warn(`Resumo "${key}": escrito [${nums.join(",")}] != calculado [${expected.join(",")}] (Total,Pend,AFazer,Concl,Canc)`, DERIVADO);
    }
  });

  // --- Validar a linha `**Total**` do Resumo contra o agregado ---
  if (!historicoLegivel) {
    // nada: ver acima
  } else if (linhaTotal) {
    const nums = linhaTotal.slice(1, 6).map((x) => {
      const m = /-?\d+/.exec(x);
      return m ? Number(m[0]) : null;
    });
    if (nums.includes(null)) {
      warn(`${ACTIVE}: a linha "Total" do Resumo tem celulas nao numericas — nao validada`);
    } else {
      const esperado = [g.total, g.pendente, g["a fazer"], g.concluido, g.cancelado];
      if (nums.join(",") !== esperado.join(",")) {
        warn(`Resumo "Total": escrito [${nums.join(",")}] != calculado [${esperado.join(",")}] (Total,Pend,AFazer,Concl,Canc)`, DERIVADO);
      }
    }
  } else if (resumoRows.length > 0) {
    warn(`${ACTIVE}: a tabela "Resumo" nao tem linha "**Total**" — o numero mais lido do backlog ficaria sem rede`);
  }

  // --- Validar barra de progresso ---

  // Linha esperada: `<bar>` **NN%** (X/Y concluidos)
  const progMatch = active.match(/`([^`]*)`\s*\*\*(\d+)%\*\*\s*\((\d+)\/(\d+)/);
  const countable = g.total - g.cancelado; // cancelados nao contam
  const expectedPct = countable > 0 ? Math.round((g.concluido / countable) * 100) : 0;
  const expectedFilled = countable > 0 ? Math.round((g.concluido / countable) * 20) : 0;

  if (!historicoLegivel) {
    // nada: ver acima
  } else if (!progMatch) {
    if (g.total > 0) warn("Nao encontrei a linha de Progresso Geral no formato esperado.");
  } else {
    // `[...str]` e nao `.length`: glifos fora do BMP (🟩/⬜, que um projeto derivado pode usar)
    // sao pares surrogate e contavam a DOBRAR — uma barra legitima de 20 blocos media 30, e a
    // mensagem afirmava "tem 30 blocos" sobre um ficheiro que tem 20. E o `TP1` dentro do
    // verificador escrito para o combater.
    const blocos = [...progMatch[1]];
    // Allowlist dos dois lados, e nao `!/[_\s]/` (TP6). O teste anterior perguntava "nao e
    // vazio?", logo **qualquer** glifo desconhecido contava como preenchido — e o comentario
    // acima ja admitia que um projeto derivado usa `⬜`, o quadrado BRANCO, que e precisamente
    // um bloco VAZIO: uma barra de 20 `⬜` (0% feito) media 20/20 e passava por 100%.
    // O que nao souber classificar, di-lo em vez de assumir.
    const desconhecidos = [...new Set(blocos.filter((c) => !BLOCO_VAZIO.has(c) && !BLOCO_CHEIO.has(c)))];
    if (desconhecidos.length) {
      warn(`Barra: nao sei classificar ${desconhecidos.map((c) => `"${c}"`).join(", ")} — usar \`_\`/\`⬜\` (vazio) e \`█\`/\`🟩\` (cheio), ou acrescentar o glifo a BLOCO_VAZIO/BLOCO_CHEIO (lib/backlog-calculo.mjs) e ao PAR do lib/backlog-corrige.mjs`);
    }
    const filled = blocos.filter((c) => BLOCO_CHEIO.has(c)).length;
    const pct = parseInt(progMatch[2], 10);
    const wConcl = parseInt(progMatch[3], 10);
    const wTotal = parseInt(progMatch[4], 10);
    if (wConcl !== g.concluido) warn(`Progresso: concluidos escritos (${wConcl}) != calculado (${g.concluido})`, DERIVADO);
    if (wTotal !== countable) warn(`Progresso: total escrito (${wTotal}) != calculado (${countable}, exclui cancelados)`, DERIVADO);
    if (pct !== expectedPct) warn(`Progresso: percentagem escrita (${pct}%) != calculado (${expectedPct}%)`, DERIVADO);
    if (filled !== expectedFilled) warn(`Barra: ${filled} blocos preenchidos != esperado ${expectedFilled} (de 20)`, DERIVADO);
    // A LARGURA nunca era verificada: `process-rules.md` diz "20 blocos = 100%" e a propria
    // mensagem acima diz "(de 20)", mas uma barra de 40 caracteres passava com exit 0.
    const largura = blocos.length;
    if (largura !== 20) warn(`Barra: tem ${largura} blocos, esperados 20 (20 blocos = 100%)`);
  }

  return { avisos, counts, g, countable, expectedPct, expectedFilled };
}
