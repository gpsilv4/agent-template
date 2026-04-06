# /debug — Debug Estruturado

Workflow metodico para isolar e corrigir bugs no {{PROJECT_NAME}}. Nunca adivinhar — seguir o processo.

## 0. Verificar Backlog

- Consultar `.agent/context/backlog.md` — o bug pode ja estar registado (seccao 1: Bugs)
- Se existir: referenciar o ID e seguir o sprint sugerido
- Se nao existir: apos correcao, propor criacao de item no Historico (ja concluido)

## 1. Reproduzir

- Identificar a pagina/componente exato e os passos para disparar o bug
- Verificar se o bug acontece so em mobile, desktop, ou ambos
- Verificar se o bug e especifico a um tipo de utilizador/role

## 2. Classificar o Bug

### Dados (Backend/DB)

- Query retorna `null` ou vazio -> verificar politicas de seguranca
- Dados inconsistentes -> verificar se migracoes foram aplicadas

### Estado (Data Fetching/React)

- **Campos em falta no fetcher**: Verificar se o fetcher inclui TODOS os campos usados
- **Ghost fetchers**: Procurar chamadas a funcoes de fetch que deviam ser invalidacao de cache
- **Variable shadowing**: Mesma variavel definida em `useState` e no hook de data fetching
- **Closures stale**: Handlers passados a Sheets/Modals que fecham sobre estado antigo
- **Hybrid state**: Estado inicializado do backend mas editavel pelo utilizador -> dependencia especifica
- **One-time init**: Formularios re-inicializados por revalidation -> usar guard `initialized`

### UI (Layout/Mobile)

- **Overflow horizontal**: `grid-cols-*` fixo sem fallback responsivo -> usar `flex flex-col sm:flex-row`
- **Popovers cortados**: largura fixa -> usar `w-[min(300px,calc(100vw-2rem))]`
- **Sheet boundaries**: Conteudo sai fora do Sheet -> adicionar `overflow-x-hidden`
- **Sticky headers**: Texto transborda -> usar `min-w-0 shrink`

### Build (TypeScript/ESLint)

- Correr `npx tsc --noEmit` para encontrar erros de tipo
- Correr `npm run lint` para encontrar warnings ESLint

## 3. Logica de Negocio — Pitfalls Comuns

<!-- Esta seccao deve ser preenchida com os pitfalls especificos do projeto -->
<!-- Exemplos: -->
<!-- - Calculos financeiros com arredondamento incorrecto -->
<!-- - Permissoes/roles nao verificados antes de operacao -->
<!-- - Datas em timezone errada -->

- Verificar regras em `.agent/rules/business-logic.md`

## 4. Corrigir

- Aplicar a correcao no ficheiro correto
- Correr `npx tsc --noEmit` — deve passar com 0 erros
- Verificar que cache keys afetadas sao invalidadas

## 5. Verificar

- Testar no browser (desktop + mobile viewport)
- Confirmar que os dados se atualizam apos operacoes CRUD
- Confirmar que a navegacao entre paginas mostra dados do cache (sem spinners)

## 6. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **src/docs/CHANGELOG.md** atualizado com a correcao?
- [ ] **Regras do Agente** (`.agent/rules/business-logic.md`) atualizadas se a causa foi uma regra mal interpretada?
- [ ] **Workflows do Agente** (`.agent/workflows/`) atualizados se o processo de debug revelou melhoria?
- [ ] **`.agent/context/decisions.md`** atualizado se a causa raiz revelou decisao importante?
- [ ] **`.agent/context/backlog.md`** — bug marcado `Concluido`, movido para Historico, contadores atualizados?
- [ ] **`.agent/context/session.md`** atualizado?
