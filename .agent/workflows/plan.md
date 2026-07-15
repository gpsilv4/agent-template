# /plan — Planear Nova Feature

Workflow estruturado para planear uma nova funcionalidade no {{PROJECT_NAME}}.

## 0. Verificar Backlog

- Antes de planear, consultar `.agent/context/backlog.md` — o item pode ja estar registado
- Se existir: referenciar o ID (ex: "Implementa UX3") e seguir o sprint sugerido
- Se nao existir: criar novo item no backlog apos aprovacao do utilizador

## 1. Contexto & Abordagem (analise funcional — ANTES de desenhar)

**Contexto do dominio:**

- Identificar que paginas/componentes sao afetados
- Verificar se existem regras de negocio relevantes (ver `.agent/rules/business-logic.md`)
- Consultar a documentacao em `src/docs/`

**Reutilizacao & abordagem** (pensar como engenheiro senior antes de escrever codigo — nao saltar):

- **Ja foi feito?** `grep`/pesquisar o codebase por funcionalidade/util/hook/componente semelhante. Preferir **reutilizar ou estender** o existente a criar de novo (ver regra DRY em `core-rules.md`).
- **E o melhor caminho?** Considerar 1-2 **abordagens alternativas**; escolher com justificacao (custo, complexidade, manutencao, impacto no utilizador) — nao a primeira que vem a cabeca.
- **Melhorar vs recriar**: se ja existe algo parecido, decidir explicitamente **estender/refatorar** vs **substituir**, e porque.
- **Menor mudanca que resolve**: preferir a solucao mais simples que cumpre o objetivo; evitar over-engineering e abstracoes prematuras.
- Apresentar ao utilizador a abordagem escolhida + alternativas rejeitadas antes de implementar.

**Definicao de Pronto (criterios de aceitacao):**

- Definir, em bullets **testaveis**, o que significa a feature estar concluida (comportamento observavel, nao tarefas). Ex: "utilizador sem sessao e redirecionado para /login"; "export gera PDF com as colunas X, Y, Z".
- Incluir edge cases e estados (vazio, erro, loading) que contam como "pronto".
- Estes criterios sao a base do `/review` e dos testes E2E — se nao for testavel, nao e criterio.

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

## 6. Testes & CI/CD

- [ ] Planear testes E2E com Playwright para fluxos criticos
- [ ] Planear testes de seguranca se houver novos formularios, APIs ou headers
- [ ] Se novas dependencias forem adicionadas, planear auditoria
- [ ] CI pipeline (`.github/workflows/ci.yml`) precisa de atualizacao? (novos env vars, novos scripts de teste, novos targets de bundle)
- [ ] E2E pipeline (`.github/workflows/e2e.yml`) precisa de novos secrets ou triggers?

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
