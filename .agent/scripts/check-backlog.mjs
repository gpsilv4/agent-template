/**
 * Backlog Checker — {{PROJECT_NAME}}
 *
 * Trata contadores e barra de progresso do backlog como DADOS DERIVADOS:
 * recalcula-os a partir das tabelas por tipo (items abertos em `backlog.md`)
 * e do Historico (items fechados em `backlog-archive.md`), e avisa se o que
 * esta escrito no Resumo / Progresso Geral divergir. Deteta tambem:
 *   - IDs duplicados (um item deve viver num so ficheiro);
 *   - items fechados (Concluido/Cancelado) esquecidos no ficheiro ativo.
 *
 * Tolerante a template vazio: linhas-placeholder (sem ID) sao ignoradas,
 * nunca rebenta em tabelas por preencher.
 *
 * Uso:
 *   node .agent/scripts/check-backlog.mjs
 *
 * Sai com codigo != 0 se houver divergencias (pode funcionar como gate no CI).
 * Correr antes de commit. Opt-in no CI (ver .github/workflows/ci.yml — comentado por defeito).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

// Ancorar a raiz do REPO, nao ao cwd. Com caminhos relativos, correr o script de qualquer
// subpasta (ou de um hook que nao faz cd) lia zero ficheiros, imprimia SKIP e saia 0 — um
// gate a passar tendo validado nada. Mesma ancoragem que o check-doc-versions.mjs.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ACTIVE = ".agent/context/backlog.md";
const ARCHIVE = ".agent/context/backlog-archive.md";

function read(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch {
    return null;
  }
}

// Remove acentos e normaliza para comparar de forma resiliente.
function norm(s) {
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
const idDe = (celula) => norm(celula).toUpperCase();

// Extrai as linhas de dados das tabelas markdown numa seccao de texto.
// Ignora cabecalho, separador (|---|) e linhas totalmente vazias (placeholder).
/** As celulas do CABECALHO de uma tabela. O `tableRows` descarta-o de propósito; a
 *  validacao de `Esforco` precisa dele para achar a coluna **pelo nome** e nao pela posicao
 *  — as quatro seccoes tem esquemas diferentes, e uma posicao fixa mentia a primeira vez
 *  que alguem acrescentasse uma coluna. */
function tableHeader(text) {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|?$/.test(t)) continue;
    return t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => norm(c));
  }
  return null;
}

function tableRows(text) {
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

// Conteudo entre um heading que faz match e o proximo heading.
function section(text, headingRegex) {
  const out = [];
  let capturing = false;
  for (const line of text.split("\n")) {
    const isHeading = /^#{1,6}\s/.test(line);
    if (isHeading) {
      if (capturing) break;
      if (headingRegex.test(line)) {
        capturing = true;
        continue;
      }
    }
    if (capturing) out.push(line);
  }
  return out.join("\n");
}

const OPEN_STATES = ["pendente", "a fazer"];
const CLOSED_STATES = ["concluido", "cancelado"];

// --- Main ---

console.log("\n=== Backlog Check ===\n");

const active = read(ACTIVE);
if (!active) {
  // NAO sair 0: este ficheiro e importado pelas rules e a sua ausencia impede a
  // verificacao por completo. Sair 0 aqui transformava o gate em decoracao.
  console.log(`  WARN  ${ACTIVE} nao encontrado ou vazio — impossivel validar o backlog.\n`);
  process.exit(1);
}
// O arquivo guarda os items fechados. Ausente != vazio: se nao existe, os contadores de
// Concluido/Cancelado sao calculados a partir de nada e a divergencia seria atribuida ao
// Resumo em vez a fonte que falta.
const archiveRaw = read(ARCHIVE);
const archive = archiveRaw ?? "";

let warnings = 0;
const warn = (msg) => {
  console.log(`  WARN  ${msg}`);
  warnings++;
};

if (archiveRaw === null) {
  warn(`${ARCHIVE} nao encontrado — o layout de dois ficheiros do backlog esta incompleto (items fechados vivem la)`);
}

// Seccoes por tipo (ordem == ordem das linhas do Resumo, sem a linha Total).
// `resumo` e o rotulo tal como aparece na primeira coluna da tabela Resumo — usado para
// casar por nome em vez de por posicao. Ao renomear uma seccao num projeto derivado,
// atualizar aqui e no `backlog.md` em simultaneo (o guard avisa se divergirem).
const SECTIONS = [
  { key: "Bugs", resumo: "Bugs / Violacoes de Regras", re: /^##\s*1\./, tipos: ["bug", "bugs"] },
  { key: "UX", resumo: "Melhorias UX", re: /^##\s*2\./, tipos: ["ux"] },
  { key: "Divida Tecnica", resumo: "Divida Tecnica", re: /^##\s*3\./, tipos: ["tecnica", "divida tecnica", "tech"] },
  { key: "Features", resumo: "Features Futuras", re: /^##\s*4\./, tipos: ["feature", "features"] },
];

const counts = {};
for (const { key } of SECTIONS) {
  counts[key] = { pendente: 0, "a fazer": 0, concluido: 0, cancelado: 0, total: 0 };
}

const allIds = new Map(); // id -> [origens]
const trackId = (id, origem) => {
  if (!id) return;
  if (!allIds.has(id)) allIds.set(id, []);
  allIds.get(id).push(origem);
};

// 1) Items ABERTOS a partir das tabelas por tipo em backlog.md
const ESFORCOS = ["s", "m", "l"];
for (const { key, re } of SECTIONS) {
  const seccao = section(active, re);
  // `Esforco` gate-ia todo o `ticket-method` (Fase 0, Fase 3, Fase 4) e era texto livre sem
  // validacao nenhuma — medido: um item com `Esforco = XXL` passava com exit 0. Um campo que
  // decide o rigor do processo nao pode ser o unico sem rede.
  const cabecalho = tableHeader(seccao);
  const iEsforco = cabecalho ? cabecalho.indexOf("esforco") : -1;
  for (const cells of tableRows(seccao)) {
    const id = idDe(cells[0]);
    if (iEsforco >= 0 && id) {
      // `-`, `—` e `n/a` sao a convencao markdown para "vazio", e a celula vazia ja era
      // tolerada de propósito. Reprovar a forma escrita e tolerar a vazia era incoerente.
      const e = norm(cells[iEsforco] ?? "").replace(/^(?:-+|–|—|n\/a|\?)$/, ""); // `norm` ja tira a enfase
      if (e && !ESFORCOS.includes(e)) {
        warn(`${key}: item "${id}" tem Esforco "${cells[iEsforco]}" — esperado S, M ou L (ver a legenda do backlog)`);
      }
    }
    const estado = norm(cells[1]);
    trackId(id, `${key} (ativo)`);
    if (OPEN_STATES.includes(estado)) {
      counts[key][estado]++;
      counts[key].total++;
    } else if (CLOSED_STATES.includes(estado)) {
      warn(`${key}: item "${id}" esta "${cells[1]}" mas continua no ficheiro ativo — mover para backlog-archive.md`);
      counts[key][estado]++;
      counts[key].total++;
    } else if (id) {
      warn(`${key}: item "${id}" tem Estado desconhecido ("${cells[1]}")`);
      counts[key].total++;
    }
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
  if (!active.split("\n").some((l) => re.test(l))) {
    warn(`${ACTIVE}: nao encontrei o cabecalho da seccao "${key}" (${re}) — os items dessa seccao nao estao a ser contados`);
  }
}

const ID_LIKE = /^[A-Z]{1,4}\d+$/;
const contados = new Set(allIds.keys());
for (const cells of tableRows(active)) {
  const id = idDe(cells[0]);
  if (ID_LIKE.test(id) && !contados.has(id)) {
    warn(`${ACTIVE}: item "${id}" esta numa tabela que nenhuma seccao reconhecida cobre — verificar os cabecalhos \`## 1.\`..\`## 4.\``);
  }
}

// 2) Items FECHADOS a partir do Historico em backlog-archive.md
//    Colunas: ID | Tipo | Descricao | Estado | Sprint | Versao | Data
const tipoToKey = {};
for (const { key, tipos } of SECTIONS) for (const t of tipos) tipoToKey[t] = key;

for (const cells of tableRows(section(archive, /^##\s*Historico/i))) {
  const id = idDe(cells[0]);
  const tipo = norm(cells[1]);
  const estado = norm(cells[3]);
  trackId(id, "arquivo");
  const key = tipoToKey[tipo];
  if (!key) {
    if (id) warn(`Arquivo: item "${id}" tem Tipo desconhecido ("${cells[1]}") — usar Bug/UX/Tecnica/Feature`);
    continue;
  }
  if (CLOSED_STATES.includes(estado)) {
    counts[key][estado]++;
    counts[key].total++;
  } else if (id) {
    warn(`Arquivo: item "${id}" tem Estado invalido ("${cells[3]}") — deve ser Concluido ou Cancelado`);
  }
}

// 3) Duplicados de ID (um item vive num so sitio)
for (const [id, origens] of allIds) {
  if (origens.length > 1) warn(`ID duplicado "${id}" em: ${origens.join(", ")}`);
}

// --- Totais globais ---
const g = { pendente: 0, "a fazer": 0, concluido: 0, cancelado: 0, total: 0 };
for (const { key } of SECTIONS) for (const k of Object.keys(g)) g[k] += counts[key][k];

// --- Validar tabela Resumo ---
// O heading `## Resumo` nao tinha rede: renomeado, `section()` devolve "", `tableRows("")`
// devolve [], o forEach nao corre e o checker anunciava "contadores consistentes" com exit 0
// — a desligar em silencio a sua propria razao de existir. Mesma forma do AP2 que este
// ficheiro deu origem, e que ficou de fora quando os cabecalhos `## 1.`..`## 4.` a ganharam.
const todasResumoRows = tableRows(section(active, /^##\s*Resumo/i));
// A linha `**Total**` era FILTRADA e nunca comparada — e e o numero mais lido do backlog.
// Medido: um Resumo com Total a `999/888/777/666/555` saia `OK — contadores consistentes`
// com exit 0. O gate nao so passava: **afirmava** consistencia que nao verificara (AP1).
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
resumoRows.forEach((cells) => {
  const key = porNome.get(norm(cells[0]));
  if (key === undefined) {
    warn(`${ACTIVE}: linha do Resumo "${cells[0]}" nao corresponde a nenhuma seccao conhecida`);
    return;
  }
  const c = counts[key];
  // `parseInt(x) || 0` tornava qualquer celula ilegivel (`?`, `n/a`, `—`, ou um numero em
  // **negrito**) num zero silencioso — o AP2 a nivel de celula, e uma mensagem que acusava o
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
    warn(`Resumo "${key}": escrito [${nums.join(",")}] != calculado [${expected.join(",")}] (Total,Pend,AFazer,Concl,Canc)`);
  }
});

// --- Validar a linha `**Total**` do Resumo contra o agregado ---
if (linhaTotal) {
  const nums = linhaTotal.slice(1, 6).map((x) => {
    const m = /-?\d+/.exec(x);
    return m ? Number(m[0]) : null;
  });
  if (nums.includes(null)) {
    warn(`${ACTIVE}: a linha "Total" do Resumo tem celulas nao numericas — nao validada`);
  } else {
    const esperado = [g.total, g.pendente, g["a fazer"], g.concluido, g.cancelado];
    if (nums.join(",") !== esperado.join(",")) {
      warn(`Resumo "Total": escrito [${nums.join(",")}] != calculado [${esperado.join(",")}] (Total,Pend,AFazer,Concl,Canc)`);
    }
  }
} else if (resumoRows.length > 0) {
  warn(`${ACTIVE}: a tabela "Resumo" nao tem linha "**Total**" — o numero mais lido do backlog ficaria sem rede`);
}

// --- Validar barra de progresso ---
// Vocabulario da barra, explicito. Acrescentar um glifo aqui e a forma suportada de o adotar.
const BLOCO_VAZIO = new Set(["_", " ", "\t", "-", "\u00b7", "\u2591", "\u2b1c", "\u25cb", "\u25fb", "\u25ab"]);
// `\u2b1b` (⬛) e o PAR de `\u2b1c` (⬜), que ja estava nos vazios. Sem ele, quem usasse o
// par mais natural de todos levava dois avisos de uma vez ("nao sei classificar" + "0 blocos").
const BLOCO_CHEIO = new Set(["\u2588", "\u2593", "\u2592", "#", "\u25a0", "\u25cf", "\u2b1b", "\ud83d\udfe9", "\ud83d\udfe6", "\ud83d\udfe8", "\u25fc", "\u25aa"]);

// Linha esperada: `<bar>` **NN%** (X/Y concluidos)
const progMatch = active.match(/`([^`]*)`\s*\*\*(\d+)%\*\*\s*\((\d+)\/(\d+)/);
const countable = g.total - g.cancelado; // cancelados nao contam
const expectedPct = countable > 0 ? Math.round((g.concluido / countable) * 100) : 0;
const expectedFilled = countable > 0 ? Math.round((g.concluido / countable) * 20) : 0;

if (!progMatch) {
  if (g.total > 0) warn("Nao encontrei a linha de Progresso Geral no formato esperado.");
} else {
  // `[...str]` e nao `.length`: glifos fora do BMP (🟩/⬜, que um projeto derivado pode usar)
  // sao pares surrogate e contavam a DOBRAR — uma barra legitima de 20 blocos media 30, e a
  // mensagem afirmava "tem 30 blocos" sobre um ficheiro que tem 20. E o `AP1` dentro do
  // verificador escrito para o combater.
  const blocos = [...progMatch[1]];
  // Allowlist dos dois lados, e nao `!/[_\s]/` (AP6). O teste anterior perguntava "nao e
  // vazio?", logo **qualquer** glifo desconhecido contava como preenchido — e o comentario
  // acima ja admitia que um projeto derivado usa `⬜`, o quadrado BRANCO, que e precisamente
  // um bloco VAZIO: uma barra de 20 `⬜` (0% feito) media 20/20 e passava por 100%.
  // O que nao souber classificar, di-lo em vez de assumir.
  const desconhecidos = [...new Set(blocos.filter((c) => !BLOCO_VAZIO.has(c) && !BLOCO_CHEIO.has(c)))];
  if (desconhecidos.length) {
    warn(`Barra: nao sei classificar ${desconhecidos.map((c) => `"${c}"`).join(", ")} — usar \`_\`/\`⬜\` (vazio) e \`█\`/\`🟩\` (cheio), ou acrescentar o glifo a check-backlog.mjs`);
  }
  const filled = blocos.filter((c) => BLOCO_CHEIO.has(c)).length;
  const pct = parseInt(progMatch[2], 10);
  const wConcl = parseInt(progMatch[3], 10);
  const wTotal = parseInt(progMatch[4], 10);
  if (wConcl !== g.concluido) warn(`Progresso: concluidos escritos (${wConcl}) != calculado (${g.concluido})`);
  if (wTotal !== countable) warn(`Progresso: total escrito (${wTotal}) != calculado (${countable}, exclui cancelados)`);
  if (pct !== expectedPct) warn(`Progresso: percentagem escrita (${pct}%) != calculado (${expectedPct}%)`);
  if (filled !== expectedFilled) warn(`Barra: ${filled} blocos preenchidos != esperado ${expectedFilled} (de 20)`);
  // A LARGURA nunca era verificada: `process-rules.md` diz "20 blocos = 100%" e a propria
  // mensagem acima diz "(de 20)", mas uma barra de 40 caracteres passava com exit 0.
  const largura = blocos.length;
  if (largura !== 20) warn(`Barra: tem ${largura} blocos, esperados 20 (20 blocos = 100%)`);
}

// --- Resumo final ---
console.log("");
console.log(`  Items: total ${g.total} | pendente ${g.pendente} | a fazer ${g["a fazer"]} | concluido ${g.concluido} | cancelado ${g.cancelado}`);
console.log(`  Progresso calculado: ${g.concluido}/${countable} (${expectedPct}%), ${expectedFilled}/20 blocos`);
console.log("");

if (g.total === 0 && warnings === 0) {
  // "Vazio" so se pode afirmar quando NADA avisou. Com avisos, zero items contados e
  // provavelmente um problema de leitura (seccoes renomeadas), nao um backlog vazio —
  // dizer "nada a validar" ali era desinformar sobre a propria falha.
  console.log("  Backlog vazio (template) — nada a validar.\n");
} else if (g.total === 0) {
  console.log(`WARNING: ${warnings} problema(s) e ZERO items contados — o backlog pode nao estar vazio, mas ilegivel. Corrigir antes de commit.\n`);
} else if (warnings === 0) {
  console.log("  OK — contadores (por seccao e Total), barra, esforcos e IDs consistentes.\n");
} else {
  console.log(`WARNING: ${warnings} divergencia(s). Corrigir antes de commit.\n`);
}

// Exit != 0 em caso de divergencia para poder funcionar como gate no CI.
process.exit(warnings > 0 ? 1 : 0);
