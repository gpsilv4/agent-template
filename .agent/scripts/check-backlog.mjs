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
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Extrai as linhas de dados das tabelas markdown numa seccao de texto.
// Ignora cabecalho, separador (|---|) e linhas totalmente vazias (placeholder).
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
for (const { key, re } of SECTIONS) {
  for (const cells of tableRows(section(active, re))) {
    const id = cells[0];
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
  const id = cells[0];
  if (ID_LIKE.test(id) && !contados.has(id)) {
    warn(`${ACTIVE}: item "${id}" esta numa tabela que nenhuma seccao reconhecida cobre — verificar os cabecalhos \`## 1.\`..\`## 4.\``);
  }
}

// 2) Items FECHADOS a partir do Historico em backlog-archive.md
//    Colunas: ID | Tipo | Descricao | Estado | Sprint | Versao | Data
const tipoToKey = {};
for (const { key, tipos } of SECTIONS) for (const t of tipos) tipoToKey[t] = key;

for (const cells of tableRows(section(archive, /^##\s*Historico/i))) {
  const id = cells[0];
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
const resumoRows = tableRows(section(active, /^##\s*Resumo/i)).filter((r) => !norm(r[0]).includes("total"));
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
  const nums = cells.slice(1, 6).map((x) => parseInt(x, 10) || 0);
  const expected = [c.total, c.pendente, c["a fazer"], c.concluido, c.cancelado];
  if (nums.join(",") !== expected.join(",")) {
    warn(`Resumo "${key}": escrito [${nums.join(",")}] != calculado [${expected.join(",")}] (Total,Pend,AFazer,Concl,Canc)`);
  }
});

// --- Validar barra de progresso ---
// Linha esperada: `<bar>` **NN%** (X/Y concluidos)
const progMatch = active.match(/`([^`]*)`\s*\*\*(\d+)%\*\*\s*\((\d+)\/(\d+)/);
const countable = g.total - g.cancelado; // cancelados nao contam
const expectedPct = countable > 0 ? Math.round((g.concluido / countable) * 100) : 0;
const expectedFilled = countable > 0 ? Math.round((g.concluido / countable) * 20) : 0;

if (!progMatch) {
  if (g.total > 0) warn("Nao encontrei a linha de Progresso Geral no formato esperado.");
} else {
  const filled = (progMatch[1].match(/[^_\s]/g) || []).length;
  const pct = parseInt(progMatch[2], 10);
  const wConcl = parseInt(progMatch[3], 10);
  const wTotal = parseInt(progMatch[4], 10);
  if (wConcl !== g.concluido) warn(`Progresso: concluidos escritos (${wConcl}) != calculado (${g.concluido})`);
  if (wTotal !== countable) warn(`Progresso: total escrito (${wTotal}) != calculado (${countable}, exclui cancelados)`);
  if (pct !== expectedPct) warn(`Progresso: percentagem escrita (${pct}%) != calculado (${expectedPct}%)`);
  if (filled !== expectedFilled) warn(`Barra: ${filled} blocos preenchidos != esperado ${expectedFilled} (de 20)`);
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
  console.log("  OK — contadores, barra e IDs consistentes.\n");
} else {
  console.log(`WARNING: ${warnings} divergencia(s). Corrigir antes de commit.\n`);
}

// Exit != 0 em caso de divergencia para poder funcionar como gate no CI.
process.exit(warnings > 0 ? 1 : 0);
