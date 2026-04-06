# Core Rules ({{PROJECT_NAME}})

## Identidade do Projeto

- **Nome**: {{PROJECT_NAME}}
- **Descricao**: {{PROJECT_DESCRIPTION}}

## Stack

- **Framework**: {{FRAMEWORK}}
- **Backend**: {{BACKEND}}
- **Styling**: {{STYLING}}
- **State**: {{STATE_MANAGEMENT}}
- **Libraries**: {{KEY_LIBRARIES}}
- **Testes**: {{TEST_FRAMEWORK}}
- **Language**: TypeScript estrito

## Linguagem

- **UI/User-facing text**: {{UI_LANGUAGE}}
- **Codigo/Variaveis/Commits**: Ingles

## Dominio

{{DOMAIN_DESCRIPTION}}

---

## Padroes de Codigo Criticos

### Tamanho de Ficheiros

- **Ideal**: ~400 linhas por ficheiro.
- **Flag**: > 500 linhas — candidato obrigatorio a splitting (hooks, sub-components).

### Type Safety

- `any` e **proibido** em todo o codebase. Usar tipos concretos definidos em `{{TYPES_FILE}}`.
- Catch blocks usam `catch (err: unknown)` com `err instanceof Error ? err.message : String(err)`.
- Campos JSONB (se aplicavel) devem ser castados via `as unknown as TargetType` antes de aceder as propriedades.

### Error Handling

- Erros de UI usam `toast.error()` (Sonner ou equivalente) — nunca `alert()` ou `console.error` sozinho.
- `console.log` de debug e **proibido** em codigo commitado.

### Debounce em Toggles

- Operacoes assincronas em botoes de toggle devem usar `disabled` state para prevenir double-clicks durante a operacao.

### Constantes

- Valores hardcoded (labels, limites, configuracoes) devem ser extraidos para ficheiros de constantes.
- Nunca dispersar magic numbers ou strings repetidas pelo codigo.

### Data Fetching

<!-- Adaptar ao state management do projeto: SWR, React Query, TanStack Query, etc. -->
- SEMPRE usar {{STATE_MANAGEMENT}} para fetching. Nunca `useEffect` + `useState` para dados do backend.
- Chamar `mutate()` / `invalidate()` apos operacoes de escrita.
- Usar `Promise.all` para queries paralelas.
- Calculos derivados (stats, totais, tendencias) devem usar `useMemo` — nunca `useEffect` + `setState`.

### Performance

- Imports dinamicos para bibliotecas pesadas (PDF generators, chart libraries, Excel engines) via `await import()` ou `next/dynamic` / lazy loading equivalente.
- Usar otimizacao de imagens do framework (ex: `next/image`).
- Skeleton loaders em vez de spinners nativos.

### Componentes

- Parent detem estado (data fetching, handlers), sub-components recebem props.
- Componentes duplicados devem ser unificados com generics.
- One-time form init com guard `initialized` para evitar resets de revalidation.

### Seguranca

<!-- Adaptar ao backend do projeto -->
- Nunca expor chaves secretas no frontend.
- Apenas chaves publicas (`NEXT_PUBLIC_*`, `VITE_*`, etc.) no cliente.
- **ZERO** dados sensiveis em ficheiros commitados — nunca incluir API keys (reais ou de teste), secrets, tokens, passwords, credenciais ou URLs com keys em codigo, documentacao, `.agent/` ou `src/docs/`. Usar placeholders descritivos: `<real-key>`, `(ver .env.local)`, etc.

### Mobile

- `flex flex-col sm:flex-row` (evitar grids fixos em wraps curtos).
- Popovers: `w-[min(300px,calc(100vw-2rem))]`.
- Sheets/Modals: `w-full` e `overflow-x-hidden`.

### Testagem E2E

- Usar `data-testid` em componentes interativos criticos (toggles, botoes de acao em listas) para garantir seletores resilientes que sobrevivam a mudancas de texto ou animacoes de UI.

### CI/CD Pipeline

- O repositorio usa **GitHub Actions** para validacao automatica (`.github/workflows/`).
- **`ci.yml`** corre em cada push e PR para main: TypeScript, lint, build, unit tests, security audit.
- **`e2e.yml`** e trigger manual (`workflow_dispatch`) para testes E2E e seguranca.
- **Nenhum merge para main** deve acontecer com checks vermelhos no CI.
- **Dependabot** (`.github/dependabot.yml`) gere updates automaticos de dependencias npm e GitHub Actions.
- **PR Template** (`.github/pull_request_template.md`) impoe checklist obrigatoria alinhada com o workflow `/review`.
- **Issue Templates** (`.github/ISSUE_TEMPLATE/`) estruturam bug reports e feature requests alinhados com o backlog.

### Code Quality Config

- **`.editorconfig`**: Garante formatacao consistente (2 spaces, UTF-8, LF) entre IDEs.
- **`.github/CODEOWNERS`**: Define reviewers automaticos por ficheiro/pasta.
- **`LICENSE`**: MIT (ou outra licenca adequada ao projeto).

### Docs & Knowledge Sync

- Toda alteracao significativa de codigo/logica deve ser acompanhada de atualizacao no `src/docs/CHANGELOG.md`, nas regras do Agente (`.agent/rules/`), manuais tecnicos (`src/docs/`), **workflows do agente (`.agent/workflows/`)**, **scripts de automacao (`.agent/scripts/`)** e **pipelines CI/CD (`.github/workflows/`)**.
- O Agente deve propor estas atualizacoes e aguardar confirmacao.
  > O `src/docs/CHANGELOG.md` segue o formato `## [vX.Y.Z] - Descricao` e deve ser atualizado ANTES de cada commit.
  > **Sync Proativo**: O Agente **NAO deve esperar** que o utilizador peca para atualizar a documentacao. Antes de dizer "Estou pronto para commit", verificar e atualizar automaticamente: `.agent/context/`, `.agent/rules/`, `.agent/scripts/`, `.agent/workflows/`, `.github/`, `src/docs/`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- **Conventional Commits**: Todas as mensagens de commit seguem o formato definido em `CONTRIBUTING.md` e `.agent/rules/process-rules.md`.
- **Versao Node**: `.nvmrc` deve estar alinhado com `node-version` em `.github/workflows/ci.yml`.

> Regras de processo (sessao, backlog, git, branches, fluxos) estao em `process-rules.md`.
