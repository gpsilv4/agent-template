# /plan — Planear Nova Feature

Workflow estruturado para planear uma nova funcionalidade no {{PROJECT_NAME}}.

## 0. Verificar Backlog

- Antes de planear, consultar `.agent/context/backlog.md` — o item pode ja estar registado
- Se existir: referenciar o ID (ex: "Implementa UX3") e seguir o sprint sugerido
- Se nao existir: criar novo item no backlog apos aprovacao do utilizador

## 1. Contexto do Dominio

- Identificar que paginas/componentes sao afetados
- Verificar se existem regras de negocio relevantes (ver `.agent/rules/business-logic.md`)
- Consultar a documentacao em `src/docs/`

## 2. Base de Dados

- Verificar se sao necessarias novas tabelas/colunas
- Verificar se sao necessarias novas migracoes
- Verificar se as politicas de seguranca existentes cobrem os novos dados

## 3. Arquitetura de Componentes

- Propor a estrutura seguindo o padrao estabelecido:
  - **Parent**: Detem o estado, hooks de data fetching, handlers e `useMemo` para dados computados
  - **Sub-components**: Recebem props, renderizam JSX, maximo ~400 linhas por ficheiro
  - Nomear componentes de forma descritiva
- Identificar cache keys afetadas e planear invalidacao
- Planear skeleton loaders para loading states

## 4. Performance

- Garantir que imports pesados sao dinamicos (PDF, charts, Excel engines)
- Usar `Promise.all` para queries paralelas ao backend
- Definir target de bundle size para a pagina

## 5. Mobile

- Planear responsividade: flex-wrap em vez de grids fixos
- Popovers com `w-[min(300px,calc(100vw-2rem))]`
- Sheets com `w-full` e `overflow-x-hidden`

## 6. Testes

- [ ] Planear testes E2E com Playwright para fluxos criticos
- [ ] Planear testes de seguranca se houver novos formularios, APIs ou headers
- [ ] Se novas dependencias forem adicionadas, planear auditoria

## 7. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **src/docs/CHANGELOG.md** atualizado com o plano?
- [ ] **Regras do Agente** (`.agent/rules/`) atualizadas se houver novos padroes?
- [ ] **Workflows do Agente** (`.agent/workflows/`) atualizados se o processo mudar?
- [ ] **Scripts de Automacao** (`.agent/scripts/`) atualizados se targets mudaram?
- [ ] **Manuais Tecnicos** (`src/docs/`) atualizados se a UI mudar?
- [ ] **`.agent/context/session.md`** atualizado com a feature em progresso?

## 8. Branch de Trabalho

Antes de comecar a implementacao, perguntar ao utilizador:

> _"Queres que crie um novo branch para esta feature?"_

- **Se sim**: criar automaticamente com o formato `feature/kebab-case-description` (em ingles, sem acentos)
- **Se nao**: continuar no branch atual.

## 9. Output

- Criar `.agent/context/implementation_plan.md` detalhado com ficheiros novos/modificados
- Criar `.agent/context/task.md` com a lista de tarefas da feature
- Incluir exemplos de codigo para logica complexa
- Pedir aprovacao do utilizador antes de implementar
