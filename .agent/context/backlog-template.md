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

`____________________` **0%** (0/10 concluidos)

**Proximo:** T1 — `/e2e-tests` sem criterio de sucesso nem condicao de paragem

## Resumo

| Seccao | Total | Pendente | A Fazer | Concluido | Cancelado |
|--------|-------|----------|---------|-----------|-----------|
| Bugs / Violacoes de Regras | 1 | 1 | 0 | 0 | 0 |
| Melhorias UX | 0 | 0 | 0 | 0 | 0 |
| Divida Tecnica | 8 | 8 | 0 | 0 | 0 |
| Features Futuras | 1 | 1 | 0 | 0 | 0 |
| **Total** | **10** | **10** | **0** | **0** | **0** |

---

# 🎯 Trabalho Ativo

## Plano de Sprints

### Sprint 1 — Fechar o que a auditoria deixou aberto
> Objetivo: os tres workflows que nao fazem o que prometem, a cobertura que a varredura nao
> ve, e tornar a Fase 0 mecanica em vez de prosa.

| Ordem | ID | Descricao | Esforco | Depende de |
|-------|-----|-----------|---------|------------|
| 1 | T1 | `/e2e-tests`: criterio de sucesso, paragem e output | M | — |
| 2 | T2 | `/security-tests`: catalogo OWASP -> passos com veredicto | M | — |
| 3 | T7 | `/debug`: criterio de saida no workflow | S | — |
| 4 | T6 | `/setup`: separar o que e workflow do que e documentacao | S | — |
| 5 | T3 | `README`: o primeiro comando antes do inventario | S | — |
| 6 | F1 | Hook `UserPromptSubmit`: Fase 0 deixa de ser so prosa | M | — |
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
| T1 | Pendente | `/e2e-tests` nao passa os tres testes que se aplicam aos outros workflows | Sem criterio de sucesso, sem condicao de paragem, sem output verificavel. A §4 ("O que testamos?") esta **inteiramente dentro de um comentario HTML** | M | `.agent/workflows/e2e-tests.md` |
| T2 | Pendente | `/security-tests` e um catalogo OWASP disfarcado de workflow | Diz o que existe, nunca como se sabe que passou. Um unico comando executavel, que nem existe no template nu | M | `.agent/workflows/security-tests.md` |
| T3 | Pendente | `README`: 110 linhas de arvore antes do primeiro comando | Falha o teste dos 5 minutos — quem chega atravessa o inventario completo antes de saber como comecar | S | `README.md` |
| T4 | Pendente | 17 sitios `skip()`/`note()` podem ser apagados com as suites verdes | A varredura exclui `skip(` por desenho e nao ve `note()`. Um guard que deixa de anunciar que nao correu e o `AP2` | M | `check-doc-versions.mjs`, `guards/*.mjs` |
| T5 | Pendente | 14 entradas das tabelas de `surface-patterns` sao desligaveis sem a suite reagir | Quatro sao nucleo deste repo, nao globs de stacks alheias | M | `.agent/scripts/surface-patterns.mjs` |
| T6 | Pendente | `/setup` e documentacao para humanos empacotada como workflow | Um agente nao corre `nvm use` nem abre um browser. Duplica a tabela de workflows que ja existe em quatro sitios | S | `.agent/workflows/setup.md` |
| T7 | Pendente | `/debug` nao tem criterio de saida explicito no workflow | O subagente `debugger` ja o tem; o workflow que ele diz seguir nao | S | `.agent/workflows/debug.md` |
| T8 | Pendente | Duas das cinco rules sempre-carregadas nunca foram auditadas | `business-logic.md` e `pages-architecture.md` so existem depois do bootstrap | M | `.agent/rules/` |

## 4. Features Futuras (valor para o utilizador)

| ID | Estado | Feature | Impacto | Esforco | Pagina afetada |
|----|--------|---------|---------|---------|----------------|
| F1 | Pendente | Hook `UserPromptSubmit` que injeta o lembrete da Fase 0 | Das ~30 regras do projeto, 13 sao so prosa — incluindo o metodo de 6 fases inteiro. Este hook fecha a primeira delas: detetar "faz o ticket X" sem plano previo | M | `.claude/hooks/`, `.claude/settings.json` |
