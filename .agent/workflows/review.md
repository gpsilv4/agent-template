# /review — Code Review

Checklist de revisao de codigo antes de fazer commit no {{PROJECT_NAME}}.

> Para alteracoes com **UI**, correr tambem `/design-review` (qualidade visual, UX, a11y, estados) — este `/review` cobre codigo/seguranca.

## 1. Build & CI Check

- `npx tsc --noEmit` — 0 erros
- `npm run lint` — passa
- CI pipeline verde no branch — **verificar com um comando, nao a olho**, mas so quando
  **ja existe PR** (o `/review` corre tipicamente antes do commit; sem PR o comando sai em
  erro "no pull requests found"): `gh pr checks --watch` — espera e sai `!= 0` se falhar.
  Antes de haver PR, os equivalentes locais sao o `tsc`/`lint`/testes desta checklist
- Se CI falhou, corrigir antes de pedir review/merge
- **Security Audit**: corre com `continue-on-error` por defeito, logo fica **sempre verde**.
  Abrir o log e ler o relatorio — verde nao significa limpo
- Mensagens de commit seguem Conventional Commits (`feat:`, `fix:`, `docs:`, etc.) — ver `CONTRIBUTING.md`

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
- [ ] **Duplicacao nova**: extraida, ou justificada por escrito? (`core-rules.md`, Rule of three — a partir da 2a repeticao, extrair; logica de negocio nunca se duplica)

## 7. Seguranca

- [ ] Sem queries diretas a tabelas de auth no cliente
- [ ] Politicas de seguranca cobrem novas tabelas/colunas
- [ ] Chaves secretas nunca expostas no frontend
- [ ] **ZERO dados sensiveis em ficheiros commitados**

## 8. Anti-Padroes

> `anti-patterns.md` define, para cada entrada, um **`grep` de detecao "para o /review"**.
> Este e o passo que os corre — sem ele, esse campo nao tem consumidor.

- [ ] Correr os `grep` de detecao de **cada entrada** de `.agent/rules/anti-patterns.md` sobre o diff
- [ ] Algum achado -> corrigir, ou justificar por escrito porque nao se aplica
- [ ] O trabalho revelou um padrao evitavel novo? -> propor entrada nova em `anti-patterns.md`

## 9. Testes

- [ ] Testes unitarios passam: `npm run test:unit`
- [ ] Testes E2E funcionais passam: `npm run test`
- [ ] Testes de seguranca passam: `npm run test:security`
- [ ] Auditoria de dependencias: `npm run test:audit`
- [ ] **Nunca filtrar o sumario de uma corrida** (`| tail`, `| grep`): esconde o `1 failed` no meio dos `125 passed`
- [ ] **Restruturas de UI**: os `data-testid` afetados foram corrigidos **no mesmo PR**? (`process-rules.md`)
- [ ] **Triagem proativa** (`process-rules.md`): cada item tocado justifica teste novo? **unit** (funcao pura/regra de negocio), **E2E** (fluxo de utilizador), **security** (rota/input/header novo). Propor ao utilizador — nao esperar que peca
- [ ] Cada teste **novo** nasce com o seu **controlo negativo**: quebrar de proposito o codigo que ele cobre e confirmar que fica vermelho **na assercao certa**. Um teste que passa com o defeito no ecra nao afirma nada

## 10. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **Correr a checklist completa de `.agent/rules/sync-docs.md`** (23 pontos — CHANGELOG, rules, workflows, scripts, manuais, README, `.github/`, etc.)
- [ ] **Testes dos guards** (se mexeste em `.agent/scripts/`): `node .agent/scripts/test-guards.mjs` e `node .agent/scripts/test-bundle-sizes.mjs` — sem eles, um guard partido parece um guard a passar
- [ ] **Guards de documentacao**: `node .agent/scripts/check-doc-versions.mjs` (bytes das rules, paridade CLAUDE/GEMINI, paridade workflows↔wrappers + tabelas, versao CHANGELOG, termos banidos) — sem WARN

## 11. Backlog

- [ ] O trabalho feito corresponde a um item do `backlog.md`? Se sim, **remover** a linha das tabelas ativas e **mover** para o Historico em `backlog-archive.md`.
- [ ] Atualizar contadores da tabela "Resumo" e validar com `node .agent/scripts/check-backlog.mjs` (0 divergencias).
- [ ] Atualizar a barra de progresso e a linha **Proximo:** no `backlog.md`.
- [ ] O trabalho revelou novos bugs ou melhorias? Propor novos items ao utilizador.

## 12. Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Atualizar `.agent/context/session.md` com o estado atual?
- [ ] Atualizar `.agent/context/walkthrough.md` com o resumo do que foi implementado?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
- [ ] Registar em `.agent/context/decisions.md` se houve alguma decisao arquitetural nova?
