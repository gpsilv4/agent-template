/**
 * O harness do `test-backlog.mjs` — {{PROJECT_NAME}}
 *
 * NAO e um entry point e nao corre testes: a fixture VALIDA, a sandbox e o `run`. O `test()` e o
 * resumo ficam na suite: sao as assercoes dela, e aqui a varredura exigia-lhes um par proprio.
 * Extraido quando a suite chegou as 476 linhas e os testes do #191 a passavam do limite de 500
 * (Guard 17) — o mesmo desenho dos outros harnesses em `tests/harness/`.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
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

## Plano de Sprints

### Sprint 2 — o que esta aberto

| Ordem | ID | Descricao | Esforco | Depende de |
|-------|-----|-----------|---------|------------|
| 1 | B2 | outra coisa | M | — |
| 2 | UX1 | melhorar algo | S | B2 |
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

export { ACTIVE_OK, ARCHIVE_OK, BAR, sandbox, f, readF, writeF, run };
