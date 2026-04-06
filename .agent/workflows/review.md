# /review — Code Review

Checklist de revisao de codigo antes de fazer commit no {{PROJECT_NAME}}.

## 1. Build Check

- `npx tsc --noEmit` — 0 erros
- `npm run lint` — passa

## 2. CHANGELOG

- [ ] Alteracoes significativas registadas em `src/docs/CHANGELOG.md`?

## 3. Performance

- [ ] `npm run build` — bundle sizes dentro dos targets?
- [ ] Nenhum `useEffect` com fetch manual — todo o data fetching usa {{STATE_MANAGEMENT}}
- [ ] Bibliotecas pesadas (PDF, charts, Excel) importadas com `await import()` ou lazy loading
- [ ] Queries paralelas com `Promise.all` (sem waterfalls)
- [ ] Otimizacao de imagens do framework utilizada
- [ ] Skeleton loaders para novos loading states
- [ ] Cache invalidado (`mutate()` / `invalidate()`) apos todas as escritas

## 4. Logica de Negocio

<!-- Esta seccao deve ser preenchida com as regras especificas do projeto -->
<!-- Exemplos: -->
<!-- - [ ] Calculos financeiros usam as formulas corretas? -->
<!-- - [ ] Permissoes/roles verificados antes de renderizar conteudo? -->
<!-- - [ ] Validacao de inputs com limites de negocio tem validacao dupla (HTML + programatica)? -->

- [ ] Regras de `.agent/rules/business-logic.md` respeitadas?

## 5. Mobile

- [ ] Sem `grid-cols-*` fixo sem fallback (`flex flex-col sm:flex-row`)
- [ ] Popovers com `w-[min(300px,calc(100vw-2rem))]`
- [ ] Modals/Sheets com `w-full` e `overflow-x-hidden`
- [ ] Sticky headers com `min-w-0 shrink` no texto

## 6. Arquitetura

- [ ] Ficheiros com menos de ~400 linhas (flag se > 500)
- [ ] Parent detem estado, sub-components recebem props
- [ ] Nomes de componentes descritivos
- [ ] One-time form init usa guard `initialized` para evitar resets por revalidation
- [ ] `useMemo` para dados computados antes de passar a sub-components
- [ ] Sem `// eslint-disable` sem comentario justificativo

## 7. Seguranca

- [ ] Sem queries diretas a tabelas de auth no cliente
- [ ] Politicas de seguranca cobrem novas tabelas/colunas
- [ ] Chaves secretas nunca expostas no frontend
- [ ] **ZERO dados sensiveis em ficheiros commitados**

## 8. Testes

- [ ] Testes unitarios passam: `npm run test:unit`
- [ ] Testes E2E funcionais passam: `npm run test`
- [ ] Testes de seguranca passam: `npm run test:security`
- [ ] Auditoria de dependencias: `npm run test:audit`

## 9. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **src/docs/CHANGELOG.md** reflete todas as alteracoes?
- [ ] **Regras do Agente** (`.agent/rules/`) estao atualizadas?
- [ ] **Workflows do Agente** (`.agent/workflows/`) estao atualizados?
- [ ] **Scripts de Automacao** (`.agent/scripts/`) estao atualizados?
- [ ] **Manuais Tecnicos** (`src/docs/`) estao em sintonia com a UI e logica final?
- [ ] **`README.md`** atualizado se funcionalidades ou stack mudaram?

## 10. Backlog

- [ ] O trabalho feito corresponde a um item do `backlog.md`? Se sim, marcar como `Concluido` e mover para Historico.
- [ ] Atualizar contadores da tabela "Resumo" no `backlog.md`.
- [ ] Atualizar a barra de progresso e a linha **Proximo:** no `backlog.md`.
- [ ] O trabalho revelou novos bugs ou melhorias? Propor novos items ao utilizador.

## 11. Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Atualizar `.agent/context/session.md` com o estado atual?
- [ ] Atualizar `.agent/context/walkthrough.md` com o resumo do que foi implementado?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
- [ ] Registar em `.agent/context/decisions.md` se houve alguma decisao arquitetural nova?
