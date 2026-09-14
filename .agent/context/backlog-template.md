# Backlog do TEMPLATE — trabalho sobre o proprio agent-template

> **Este ficheiro nao pertence ao teu projeto.** Rastreia o desenvolvimento do *template de
> origem*. O bootstrap apaga-o (Fase 2.7); se estas a ler isto num projeto derivado, apaga-o.
>
> **Porque existe, separado do `backlog.md`.** O `backlog.md` e os restantes ficheiros de
> `.agent/context/` ficam **deliberadamente vazios** no template — sao o estado inicial que
> cada projeto derivado herda, e escrever ali a historia do template daria a cada projeto novo
> um passado que nao e o dele (a excecao esta escrita em `/review` §2). Mas o template tambem
> tem trabalho pendente, e mante-lo so em relatorios soltos foi precisamente o que uma
> auditoria apanhou: **quem escreve o processo nao o estava a seguir.**
>
> Tem rede: `node .agent/scripts/check-backlog.mjs .agent/context/backlog-template.md`
> valida contadores, barra, esforcos e IDs unicos, tal como no par principal.
>
> Atualizado: 2026-09-14

**Legenda de Esforco**: S = < 30 min | M = 1-2h | L = meio dia+

## Progresso Geral

`███████████_________` **55%** (6/11 concluidos)

**Proximo:** T4 — 17 sitios `skip()`/`note()` sem teste (varredura `--skips` a medir)

## Resumo

| Seccao | Total | Pendente | A Fazer | Concluido | Cancelado |
|--------|-------|----------|---------|-----------|-----------|
| Bugs / Violacoes de Regras | 1 | 1 | 0 | 0 | 0 |
| Melhorias UX | 0 | 0 | 0 | 0 | 0 |
| Divida Tecnica | 9 | 4 | 0 | 5 | 0 |
| Features Futuras | 1 | 0 | 0 | 1 | 0 |
| **Total** | **11** | **5** | **0** | **6** | **0** |

---

# 🎯 Trabalho Ativo

## Plano de Sprints

### Sprint 1 — Fechar o que a auditoria deixou aberto
> Objetivo: os tres workflows que nao fazem o que prometem, a cobertura que a varredura nao
> ve, e tornar a Fase 0 mecanica em vez de prosa.

| Ordem | ID | Descricao | Esforco | Depende de |
|-------|-----|-----------|---------|------------|
| 7 | T4 | 17 sitios `skip()`/`note()` sem teste | M | — |
| 8 | T5 | 14 entradas de `surface-patterns` sem caso | M | — |

## Pendentes sem Sprint

| ID | Descricao | Esforco | Nota |
|----|-----------|---------|------|
| B1 | Sintaxe de import do `GEMINI.md` por verificar em runtime | S | **Bloqueado por falta de ferramenta**: exige um Gemini CLI real (`/memory show` num clone). A forma documentada ja foi aplicada; falta confirmar que ele carrega mesmo |
| T8 | `business-logic.md` e `pages-architecture.md` nunca auditadas | M | **Nao auditavel no template**: so existem depois do bootstrap. Desbloqueia ao correr o bootstrap num projeto real |

---

# 📚 Tickets Abertos por Tipo (Referencia)

## 1. Bugs / Violacoes de Regras do Projeto

| ID | Estado | Problema | Ficheiro(s) | Severidade | Esforco | Pagina afetada |
|----|--------|---------|-------------|------------|---------|----------------|
| B1 | Pendente | A sintaxe de import do Gemini nunca foi verificada num CLI real; a anterior (`@[x]`) nao existe na documentacao e um guard normalizava-a | `GEMINI.md`, `check-doc-versions.mjs` | Alta | S | — |

## 2. Melhorias UX (impacto direto no utilizador)

| ID | Estado | Melhoria | Detalhe | Esforco | Pagina afetada |
|----|--------|---------|---------|---------|----------------|
| | | | | | |

## 3. Divida Tecnica / Code Quality

| ID | Estado | Issue | Detalhe | Esforco | Ficheiro(s) |
|----|--------|-------|---------|---------|-------------|
| T4 | Pendente | 17 sitios `skip()`/`note()` podem ser apagados com as suites verdes | A varredura exclui `skip(` por desenho e nao ve `note()`. Um guard que deixa de anunciar que nao correu e o `AP2` | M | `check-doc-versions.mjs`, `guards/*.mjs` |
| T5 | Pendente | 14 entradas das tabelas de `surface-patterns` sao desligaveis sem a suite reagir | Quatro sao nucleo deste repo, nao globs de stacks alheias | M | `.agent/scripts/surface-patterns.mjs` |
| T8 | Pendente | Duas das cinco rules sempre-carregadas nunca foram auditadas | `business-logic.md` e `pages-architecture.md` so existem depois do bootstrap | M | `.agent/rules/` |
| T9 | Pendente | As regras de backlog ocupam 5132 bytes numa rule CARREGADA | Quase metade do `process-rules.md`, e so servem quando se toca no backlog. Move-las para referencia (padrao do `ticket-method.md`) poupa ~4KB **em todas as sessoes de todos os projetos derivados**. E decisao arquitetural: muda onde o agente procura as regras | M | `.agent/rules/process-rules.md` |

## 4. Features Futuras (valor para o utilizador)

| ID | Estado | Feature | Impacto | Esforco | Pagina afetada |
|----|--------|---------|---------|---------|----------------|
