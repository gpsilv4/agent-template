# Sync Docs — Checklist ({{PROJECT_NAME}})

> **Nao carregado automaticamente no contexto.** Consultado on-demand pelos workflows `/review` e `/deploy`
> (e sempre que o agente vai dizer "Estou pronto para commit"). Manter aqui — e nao em `process-rules.md` —
> para o contexto sempre-carregado ficar enxuto.

## Regra Obrigatoria

Esta checklist DEVE ser corrida **automaticamente** pelo agente antes de dizer "Estou pronto para commit".
Nao basta atualizar apenas os ficheiros de contexto (`.agent/context/`) — e obrigatorio verificar e atualizar
**TODOS os pontos** abaixo. O agente **NAO deve esperar** que o utilizador peca "sync docs" — deve faze-lo proativamente.

## Checklist

1. [ ] `README.md` — contagens de testes, stack, scripts atualizados
2. [ ] `CLAUDE.md` — referencias a `.agent/` files corretas
3. [ ] `GEMINI.md` — **espelho** de `CLAUDE.md` (atualizar **em par** — so difere a sintaxe `@[...]`). Verificar paridade: `node .agent/scripts/check-doc-versions.mjs`
4. [ ] `.agent/rules/` — todas as regras refletem o estado atual do codigo (e dentro do orcamento de bytes)
5. [ ] `.agent/context/session.md` — estado da sessao atual
6. [ ] `.agent/context/task.md` — tarefas atualizadas
7. [ ] `.agent/context/backlog.md` + `.agent/context/backlog-archive.md`:
   - [ ] Trabalho feito fora do sprint esta registado com ID?
   - [ ] Contadores + barra de progresso corretos? (correr `node .agent/scripts/check-backlog.mjs`)
   - [ ] Linha **Proximo:** atualizada?
   - [ ] Items fechados movidos para `backlog-archive.md`; ordem das seccoes respeitada (🎯 -> 📚)?
8. [ ] `.agent/context/decisions.md` — novas decisoes registadas (arquivar as antigas se > ~150 linhas, ver Regra de Arquivamento)
9. [ ] `.agent/context/walkthrough.md` — se houve feature/fix user-facing (arquivar se > ~200 linhas)
10. [ ] `.agent/context/audit-history.md` — se correste `/audit`: baseline datada acrescentada? (acumulado, **nao** importado)
11. [ ] `.agent/context/implementation_plan.md` — se houve novo plano
12. [ ] `.agent/workflows/` — workflows refletem processos atuais
13. [ ] `.agent/scripts/` — scripts e targets atualizados
14. [ ] `src/docs/CHANGELOG.md` — versao atual registada (`## [vX.Y.Z] - Descricao`), alinhada com `package.json`
15. [ ] `src/docs/` restantes — manuais refletem UI/logica atual
16. [ ] `.github/workflows/ci.yml` — CI pipeline reflete comandos e targets atuais
17. [ ] `.github/workflows/e2e.yml` — E2E pipeline atualizado (env vars, triggers)
18. [ ] `.github/pull_request_template.md` — checklist alinhada com `/review`
19. [ ] `.github/ISSUE_TEMPLATE/` — templates alinhados com backlog
20. [ ] `.github/dependabot.yml` — schedule e labels corretos
21. [ ] `CONTRIBUTING.md` — workflow, commit format e PR process atualizados
22. [ ] `SECURITY.md` — politica de disclosure atualizada
23. [ ] `.nvmrc` — fonte unica da versao Node (CI le via `node-version-file`)
24. [ ] **Guards de documentacao** — correr `node .agent/scripts/check-doc-versions.mjs` (e, apos qualquer alteracao aos proprios scripts, `node .agent/scripts/test-guards.mjs` + `node .agent/scripts/test-bundle-sizes.mjs`, que quebram cada guard de proposito e exigem que ele avise) (orcamento de bytes das rules, paridade CLAUDE/GEMINI, paridade workflows↔wrappers + workflows nas tabelas, versao CHANGELOG, `.nvmrc`, termos obsoletos, versoes de deps). Atualizar tudo o que estiver desatualizado, sobretudo apos merge de Dependabot PRs.

## Matriz de Propagacao (ao ADICIONAR um ficheiro novo)

> A fonte de verdade vive em `.agent/`. Ao criar um ficheiro novo, replicar/registar nos sitios abaixo
> para nada ficar desatualizado. Os wrappers `.claude/`/`.gemini/` sao **ponteiros finos** — nunca duplicar logica.

| Novo ficheiro | Onde replicar/registar |
|---|---|
| **Workflow** (`.agent/workflows/X.md`) | wrapper `.claude/commands/X.md` + `.gemini/commands/X.toml` (ponteiro fino que **cita o caminho do proprio workflow** — validado pelo Guard 10); tabela de workflows em `CLAUDE.md` + `GEMINI.md` + `AGENTS.md`; `src/docs/agent-guide.md`; `README.md` (arvore); **tabela de fluxo por tipo** em `process-rules.md` e `CONTRIBUTING.md`; listas de essenciais/removiveis do Modo minimo em `BOOTSTRAP.md` |
| **Rule sempre-carregada** (`.agent/rules/X.md`) | `@import` em `CLAUDE.md` + `GEMINI.md`; **`AGENTS.md`** (enumera as rules pelo nome); array `REQUIRED_RULES` em `check-doc-versions.mjs` (orcamento de bytes); `agent-guide.md`; `README.md` |
| **Rule NAO carregada** (checklist/guia) | referencia on-demand nos workflows que a usam; `README.md`/`agent-guide.md` — **sem** `@import` |
| **Script** (`.agent/scripts/X.mjs`) | passo em `.github/workflows/ci.yml` — **obrigatorio** e sem gate do `detect` se for um `test-*.mjs` (job `guard-tests`), opt-in comentado se for um checker que precise de build; `core-rules.md` (seccao scripts); `README.md` (arvore + tabela); **e os sitios que o INVOCAM**: `review.md`, `deploy.md`, `.github/pull_request_template.md`, `BOOTSTRAP.md` §2.4 — sem isto o guard fica documentado em todo o lado e corrido por nada. Se e um guard, criar tambem o `test-X.mjs` com os controlos negativos |
| **Context** (`.agent/context/X.md`) | decidir **importado** (`@` em CLAUDE.md + GEMINI.md) vs **arquivo** (nao importado, historico inerte); **`AGENTS.md`**; `README.md`; `agent-guide.md`; **ponto novo na checklist de 1-24 acima**; classificacao substituido/acumulado/permanente em `process-rules.md`; nota dos `*-archive.md` em `CLAUDE.md`/`GEMINI.md` |

> Regra de paridade: qualquer edicao a `CLAUDE.md` tem espelho em `GEMINI.md` (so difere `@[...]`) — validado por `check-doc-versions.mjs`.

## Contra-verificacao por grep (anti-drift)

Depois de atualizar, correr um grep pelos termos que acabaram de mudar (ficheiros renomeados, contagens antigas, versoes)
nos docs vivos — para apanhar referencias esquecidas. Excluir entradas historicas (`*-archive.md`, `CHANGELOG.md`).
Exemplo: `grep -rn "nome-antigo\|contagem-antiga" README.md CLAUDE.md GEMINI.md .agent/rules/ .agent/workflows/`
