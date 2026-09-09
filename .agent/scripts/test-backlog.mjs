#!/usr/bin/env node
/**
 * Testes do Backlog Checker — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS do `check-backlog.mjs`.
 *
 * PORQUE EXISTE: o `check-backlog.mjs` tinha 11 sitios de aviso e ZERO testes. As regras
 * mandam corre-lo antes de cada commit, e nada verificava que ele avisa. Um verificador
 * nao verificado nao da confianca — da a aparencia dela.
 *
 * COMO FUNCIONA: cada teste parte de uma fixture VALIDA (contadores, barra e IDs
 * coerentes), quebra UMA coisa, e exige que o checker avise nessa e saia `!= 0`.
 *
 * A fixture e SINTETICA, nao uma copia do repo: o backlog do template esta vazio de
 * proposito, logo os 11 sitios de aviso sao todos inalcancaveis no estado real. Sem
 * fixture nao havia nada para testar.
 *
 * Sem dependencias e sem package.json, como os outros scripts de `.agent/scripts/`.
 *
 *   node .agent/scripts/test-backlog.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKER = join(ROOT, ".agent/scripts/check-backlog.mjs");

// --- A fixture valida -------------------------------------------------------
// Contas que ela codifica (o checker tem de chegar exatamente a estas):
//   Bugs     B1 Pendente + B2 A Fazer (ativo) + B3 Concluido (arquivo) -> 3,1,1,1,0
//   UX       UX1 Pendente (ativo)                                      -> 1,1,0,0,0
//   Tecnica  T1 Concluido (arquivo)                                    -> 1,0,0,1,0
//   Features F1 Cancelado (arquivo)                                    -> 1,0,0,0,1
//   Global   total 6 | pend 2 | afazer 1 | concl 2 | canc 1
//   countable = 6 - 1 = 5;  2/5 = 40%;  round(2/5*20) = 8 blocos
const BAR = "████████____________"; // 8 preenchidos, 12 vazios

const ACTIVE_OK = `# Backlog

## Progresso Geral

\`${BAR}\` **40%** (2/5 concluidos)

**Proximo:** B2

## Resumo

| Seccao | Total | Pendente | A Fazer | Concluido | Cancelado |
|--------|-------|----------|---------|-----------|-----------|
| Bugs / Violacoes de Regras | 3 | 1 | 1 | 1 | 0 |
| Melhorias UX | 1 | 1 | 0 | 0 | 0 |
| Divida Tecnica | 1 | 0 | 0 | 1 | 0 |
| Features Futuras | 1 | 0 | 0 | 0 | 1 |
| **Total** | **6** | **2** | **1** | **2** | **1** |

## 1. Bugs / Violacoes de Regras

| ID | Estado | Problema | Ficheiro(s) | Severidade | Esforco | Pagina afetada |
|----|--------|---------|-------------|------------|---------|----------------|
| B1 | Pendente | algo | a.ts | Media | S | X |
| B2 | A Fazer | outra coisa | b.ts | Alta | M | Y |

## 2. Melhorias UX

| ID | Estado | Melhoria | Detalhe | Esforco | Pagina afetada |
|----|--------|---------|---------|---------|----------------|
| UX1 | Pendente | melhorar algo | detalhe | S | Z |

## 3. Divida Tecnica / Code Quality

| ID | Estado | Issue | Detalhe | Esforco | Ficheiro(s) |
|----|--------|-------|---------|---------|-------------|
| | | | | | |

## 4. Features Futuras

| ID | Estado | Feature | Impacto | Esforco | Pagina afetada |
|----|--------|---------|---------|---------|----------------|
| | | | | | |
`;

const ARCHIVE_OK = `# Backlog Archive

## Historico (Fechados)

| ID | Tipo | Descricao | Estado | Sprint | Versao | Data |
|----|------|-----------|--------|--------|--------|------|
| B3 | Bug | bug fechado | Concluido | S1 | v0.1.0 | 2026-01-01 |
| T1 | Tecnica | divida paga | Concluido | S1 | v0.1.0 | 2026-01-01 |
| F1 | Feature | feature abandonada | Cancelado | S1 | v0.1.0 | 2026-01-02 |

## Sprints Fechados (Indice)

| Sprint | Descricao | Versao |
|--------|-----------|--------|
| S1 | primeiro | v0.1.0 |
`;

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "backlog-test-"));
  mkdirSync(join(dir, ".agent/context"), { recursive: true });
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  // O checker ancora em <script>/../.. — copiado para ca, ROOT passa a ser o sandbox.
  copyFileSync(CHECKER, join(dir, ".agent/scripts/check-backlog.mjs"));
  writeFileSync(join(dir, ".agent/context/backlog.md"), ACTIVE_OK);
  writeFileSync(join(dir, ".agent/context/backlog-archive.md"), ARCHIVE_OK);
  return dir;
}

const f = (dir, p) => join(dir, p);
const readF = (dir, p) => readFileSync(f(dir, p), "utf8");
const writeF = (dir, p, c) => writeFileSync(f(dir, p), c);

function run(dir, cwd) {
  try {
    const out = execFileSync("node", [f(dir, ".agent/scripts/check-backlog.mjs")], {
      cwd: cwd ?? dir,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

let passed = 0;
const failures = [];

function test(name, mutate, expect) {
  const dir = sandbox();
  try {
    const cwd = mutate ? mutate(dir) : undefined;
    const { code, out } = run(dir, cwd);
    const problems = [];

    // Invariante do gate: exit != 0 exatamente quando imprimiu WARN. Sem isto, um
    // `process.exit(0)` fixo passaria a suite inteira.
    const temWarn = out.includes("  WARN  ");
    if (temWarn && code === 0) problems.push("imprimiu WARN mas saiu 0");
    if (!temWarn && code !== 0) problems.push(`nao imprimiu WARN mas saiu ${code}`);
    if (code !== expect.code) problems.push(`exit ${code}, esperado ${expect.code}`);

    // Afirmar contra as linhas WARN, nao o output inteiro: um `includes` sobre tudo e
    // satisfeito por outra verificacao que a mesma mutacao tambem disparou (AP1).
    const alvo =
      expect.code === 0
        ? out
        : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
    const onde = expect.code === 0 ? "output" : "linhas WARN";
    for (const s of expect.includes ?? []) {
      if (!alvo.includes(s)) problems.push(`${onde} devia conter "${s}"`);
    }
    for (const s of expect.excludes ?? []) {
      if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
    }

    if (problems.length) {
      failures.push({ name, problems, out });
      console.log(`  FAIL  ${name}`);
      for (const p of problems) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== Testes do Backlog Checker ===\n");

// --- Baseline: a fixture tem de estar limpa, senao tudo o resto e ruido ------
test("baseline: fixture valida passa sem avisos", null, {
  code: 0,
  includes: ["OK — contadores, barra e IDs consistentes"],
  excludes: ["  WARN  "],
});

// --- Contadores do Resumo (1 sitio, exercitado por seccao) -------------------
test("Resumo: contador de Bugs errado avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("| Bugs / Violacoes de Regras | 3 | 1 | 1 | 1 | 0 |",
                                                    "| Bugs / Violacoes de Regras | 3 | 2 | 0 | 1 | 0 |"));
}, { code: 1, includes: ['Resumo "Bugs": escrito [3,2,0,1,0] != calculado [3,1,1,1,0]'] });

test("Resumo: concluido do arquivo nao contado avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("| Divida Tecnica | 1 | 0 | 0 | 1 | 0 |",
                                                    "| Divida Tecnica | 0 | 0 | 0 | 0 | 0 |"));
}, { code: 1, includes: ['Resumo "Divida Tecnica"'] });

// --- Barra de progresso (4 sitios) ------------------------------------------
test("Progresso: concluidos escritos errados avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("(2/5 concluidos)", "(3/5 concluidos)"));
}, { code: 1, includes: ["Progresso: concluidos escritos (3) != calculado (2)"] });

test("Progresso: total escrito a incluir cancelados avisa", (dir) => {
  // O erro tipico: usar o total (6) em vez do contavel (5).
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("(2/5 concluidos)", "(2/6 concluidos)"));
}, { code: 1, includes: ["Progresso: total escrito (6) != calculado (5, exclui cancelados)"] });

test("Progresso: percentagem errada avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("**40%**", "**33%**"));
}, { code: 1, includes: ["percentagem escrita (33%) != calculado (40%)"] });

test("Barra: numero de blocos errado avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace(BAR, "██████______________"));
}, { code: 1, includes: ["Barra: 6 blocos preenchidos != esperado 8 (de 20)"] });

test("Progresso: linha em formato irreconhecivel avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace(`\`${BAR}\` **40%** (2/5 concluidos)`,
                                                    "Progresso: 40 por cento"));
}, { code: 1, includes: ["Nao encontrei a linha de Progresso Geral no formato esperado"] });

// --- Estados no ficheiro ativo (2 sitios) -----------------------------------
test("Ativo: item Concluido esquecido no ficheiro ativo avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("| B1 | Pendente |", "| B1 | Concluido |"));
}, { code: 1, includes: ['item "B1" esta "Concluido" mas continua no ficheiro ativo'] });

test("Ativo: Estado desconhecido avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("| B1 | Pendente |", "| B1 | Em Curso |"));
}, { code: 1, includes: ['item "B1" tem Estado desconhecido ("Em Curso")'] });

// --- Arquivo (2 sitios) ------------------------------------------------------
test("Arquivo: Tipo desconhecido avisa", (dir) => {
  writeF(dir, ".agent/context/backlog-archive.md",
    readF(dir, ".agent/context/backlog-archive.md").replace("| B3 | Bug |", "| B3 | Erro |"));
}, { code: 1, includes: ['item "B3" tem Tipo desconhecido ("Erro")'] });

test("Arquivo: Estado aberto no historico avisa", (dir) => {
  writeF(dir, ".agent/context/backlog-archive.md",
    readF(dir, ".agent/context/backlog-archive.md").replace(
      "| B3 | Bug | bug fechado | Concluido |", "| B3 | Bug | bug fechado | Pendente |"));
}, { code: 1, includes: ['item "B3" tem Estado invalido ("Pendente")'] });

// --- IDs duplicados (1 sitio) ------------------------------------------------
test("ID que vive nos dois ficheiros avisa", (dir) => {
  // B1 aberto no ativo E fechado no arquivo: a regra diz que um item vive num so sitio.
  writeF(dir, ".agent/context/backlog-archive.md",
    readF(dir, ".agent/context/backlog-archive.md").replace("| B3 | Bug |", "| B1 | Bug |"));
}, { code: 1, includes: ['ID duplicado "B1"'] });

// --- Ficheiros ausentes: o gate NAO pode passar sem validar ------------------
test("backlog.md ausente reprova (nao SKIP silencioso)", (dir) => {
  rmSync(f(dir, ".agent/context/backlog.md"));
}, { code: 1, includes: ["nao encontrado ou vazio — impossivel validar o backlog"] });

test("backlog-archive.md ausente avisa (layout de dois ficheiros incompleto)", (dir) => {
  rmSync(f(dir, ".agent/context/backlog-archive.md"));
}, { code: 1, includes: ["backlog-archive.md nao encontrado"] });

// --- Ancoragem: correr de outra pasta tem de dar o MESMO resultado ----------
test("ancoragem: corrido de subpasta le os mesmos ficheiros", (dir) => {
  mkdirSync(f(dir, "src/deep"), { recursive: true });
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("**40%**", "**99%**"));
  return f(dir, "src/deep"); // cwd != raiz
}, { code: 1, includes: ["percentagem escrita (99%) != calculado (40%)"] });

test("ancoragem: fixture valida vista de subpasta continua limpa", (dir) => {
  mkdirSync(f(dir, "src/deep"), { recursive: true });
  return f(dir, "src/deep");
}, { code: 0, includes: ["OK — contadores, barra e IDs consistentes"], excludes: ["  WARN  "] });

// --- Estrutura: seccao renomeada nao pode virar "backlog vazio" --------------
// O defeito que isto cobre: um backlog com items reais e o cabecalho `## 1. Bugs`
// renomeado dava zero linhas lidas, e o checker anunciava "Backlog vazio (template) —
// nada a validar" com exit 0. Um gate a passar A DIZER que o backlog esta vazio quando
// tem items. Renomear seccoes e a primeira customizacao natural num projeto derivado.
test("Estrutura: cabecalho de seccao renomeado avisa", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md").replace("## 1. Bugs / Violacoes de Regras",
                                                    "## Defeitos e Violacoes"));
}, { code: 1, includes: [
  'nao encontrei o cabecalho da seccao "Bugs"',
  'item "B1" esta numa tabela que nenhuma seccao reconhecida cobre',
] });

test("Estrutura: TODAS as seccoes renomeadas nao reporta 'vazio' com exit 0", (dir) => {
  let c = readF(dir, ".agent/context/backlog.md");
  for (const [de, para] of [["## 1. Bugs / Violacoes de Regras", "## Defeitos"],
                            ["## 2. Melhorias UX", "## Experiencia"],
                            ["## 3. Divida Tecnica / Code Quality", "## Divida"],
                            ["## 4. Features Futuras", "## Novidades"]]) c = c.replace(de, para);
  writeF(dir, ".agent/context/backlog.md", c);
}, { code: 1,
     includes: ['nao encontrei o cabecalho da seccao "Features"'],
     excludes: ["Backlog vazio (template) — nada a validar"] });

test("Estrutura: item numa tabela fora de qualquer seccao avisa", (dir) => {
  // Cabecalhos intactos, mas um item acrescentado numa tabela solta no fim do ficheiro.
  writeF(dir, ".agent/context/backlog.md",
    readF(dir, ".agent/context/backlog.md") +
    "\n## Notas soltas\n\n| ID | Estado | Nota |\n|----|--------|------|\n| B9 | Pendente | orfao |\n");
}, { code: 1, includes: ['item "B9" esta numa tabela que nenhuma seccao reconhecida cobre'] });

// --- Template vazio: nao pode rebentar nem inventar avisos -------------------
test("backlog vazio (estado do template) passa sem avisos", (dir) => {
  writeF(dir, ".agent/context/backlog.md",
    ACTIVE_OK.replace(/^\| (B1|B2|UX1) \|.*$/gm, "| | | | | | | |")
             .replace(/\| (Bugs \/ Violacoes de Regras|Melhorias UX|Divida Tecnica|Features Futuras) \| \d.*$/gm,
                      (m) => m.replace(/\| \d+ /g, "| 0 ").replace(/\| \d+ \|$/, "| 0 |"))
             .replace(`\`${BAR}\` **40%** (2/5 concluidos)`, "`____________________` **0%** (0/0 concluidos)"));
  writeF(dir, ".agent/context/backlog-archive.md",
    ARCHIVE_OK.replace(/^\| (B3|T1|F1) \|.*$/gm, "| | | | | | | |"));
}, { code: 0, includes: ["Backlog vazio (template) — nada a validar"], excludes: ["  WARN  "] });

// --- Resumo ------------------------------------------------------------------
console.log("");
console.log(`  ${passed} passaram, ${failures.length} falharam.`);
console.log("");
if (failures.length) {
  for (const { name, out } of failures) {
    console.log(`--- output de "${name}" ---`);
    console.log(out);
  }
  console.log("  Ha testes do backlog checker a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do backlog checker passaram.\n");
