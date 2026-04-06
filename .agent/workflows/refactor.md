# /refactor — Refactoring Seguro

Workflow para refactoring que garante seguranca e nao introduz regressoes no {{PROJECT_NAME}}.

## 1. Baseline

- Correr `npx tsc --noEmit` e guardar o resultado (deve ser 0 erros)
- Correr `npm run build` e registar os tamanhos do bundle

## 2. Verificar Backlog

- Consultar `.agent/context/backlog.md` seccao 3 (Divida Tecnica) — o refactor pode ja estar registado
- Se existir: referenciar o ID e seguir dependencias do sprint
- Se nao existir: apos refactor, propor criacao de item no Historico (ja concluido)

## 3. Identificar Alvos

- Ficheiros com > 400 linhas -> candidatos a component splitting
- Componentes com > 8 props -> candidatos a composicao ou context
- Componentes pesados / charts / exports -> candidatos a lazy loading
- Logica duplicada entre paginas -> candidatos a custom hooks
- `useEffect` com fetch manual -> candidatos a migracao para {{STATE_MANAGEMENT}}

## 4. Padrao de Extracao

Seguir o padrao estabelecido no projeto:

### Sub-components

- Seccoes visualmente distintas -> novos ficheiros em `src/components/`
- **Estado fica no parent**: data fetching, handlers complexos, `useMemo`
- **JSX move para filhos**: Apenas renderizacao e logica de apresentacao
- **Props explicitas**: Passar dados computados e handlers como props

### Nomenclatura

- Nomes descritivos e consistentes com o padrao existente no projeto.

## 5. Migracao de Data Fetching (se aplicavel)

Seguir o checklist estrito:

1. Mapear todos os `useState`/`useEffect` de data fetching
2. Consolidar num fetcher adequado ao {{STATE_MANAGEMENT}}
3. Substituir chamadas manuais por invalidacao de cache
4. Para **hybrid state** (server-init, client-editable): dependencia especifica, nao do objeto inteiro
5. Para **formularios**: guard `initialized` para evitar resets por revalidation
6. Verificar que nao ha ghost fetchers (`npx tsc --noEmit`)
7. Verificar variable shadowing

## 6. Verificacao Pos-Refactor

- `npx tsc --noEmit` — deve ter 0 erros (igual ou melhor que baseline)
- `npm run build` — bundle sizes nao devem aumentar
- Testar CRUD completo na pagina afetada
- Testar navegacao (cache deve manter dados entre paginas)
- Testar em mobile viewport (sem overflow horizontal)
- Correr testes unitarios: `npm run test:unit`
- Correr testes E2E funcionais: `npm run test`
- Correr testes de seguranca: `npm run test:security`
- Se dependencias mudaram: `npm run test:audit`

## 7. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **src/docs/CHANGELOG.md** atualizado?
- [ ] **Regras do Agente** (`.agent/rules/`) refletem a nova estrutura?
- [ ] **Workflows do Agente** (`.agent/workflows/`) refletem as novas localizacoes?
- [ ] **Scripts de Automacao** (`.agent/scripts/`) atualizados?
- [ ] **Manuais Tecnicos** (`src/docs/`) atualizados?

## 8. Backlog

- [ ] O refactor corresponde a um item do `backlog.md`? Se sim, marcar como `Concluido` e mover para Historico.
- [ ] Atualizar contadores, barra de progresso e **Proximo:** no `backlog.md`.
- [ ] O refactor revelou novos items de divida tecnica? Propor ao utilizador.

## 9. Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Atualizar `.agent/context/session.md`?
- [ ] Atualizar `.agent/context/walkthrough.md`?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
- [ ] Registar em `.agent/context/decisions.md` se houve decisao nova?

## 10. Fallback para Ficheiros Grandes

Se ferramentas de substituicao falharem em ficheiros > 500 linhas:

- Criar script Node.js temporario com `fs.readFileSync` + `.replace()` + `fs.writeFileSync`
- Verificar com `npx tsc --noEmit` imediatamente apos
- Apagar o script temporario
