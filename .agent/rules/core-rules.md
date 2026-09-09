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

### Diff minimo

- **Nao reformatar o que o ticket nao toca.** Um formatador que o projeto nao usa (`npx prettier` num repo sem prettier) inflou um diff de 1 linha para `+225/-99` — a revisao passa a procurar a alteracao real no meio de ruido. Formatacao errada e ticket proprio.

### Reutilizacao & DRY

- **Procurar antes de criar**: `grep`/pesquisa pelo que ja existe (util, hook, componente) antes de escrever codigo novo.
- **Rule of three**: abstrair cedo demais tambem e divida — a abstracao errada custa mais do que uma duplicacao. A partir da **segunda repeticao**, extrair. Logica de negocio/estado **nunca** se duplica.
- **Duplicacao nova e flag no `/review`**: ou se extrai, ou se justifica por escrito.

### Seguranca

<!-- Adaptar ao backend do projeto -->
- Nunca expor chaves secretas no frontend.
- Apenas chaves publicas (`NEXT_PUBLIC_*`, `VITE_*`, etc.) no cliente.
- **ZERO** dados sensiveis em ficheiros commitados — nunca incluir API keys (reais ou de teste), secrets, tokens, passwords, credenciais ou URLs com keys em codigo, documentacao, `.agent/` ou `src/docs/`. Usar placeholders descritivos: `<real-key>`, `(ver .env.local)`, etc.

### Mobile

- `flex flex-col sm:flex-row` (evitar grids fixos em wraps curtos).
- Popovers: `w-[min(300px,calc(100vw-2rem))]`.
- Sheets/Modals: `w-full` e `overflow-x-hidden`.

### Qualidade & Design (Barra: {{QUALITY_TIER}})

> So para projetos com UI. Tier definido no bootstrap: **{{QUALITY_TIER}}** (MVP < Polido < Elite). Rubrica completa em `/design-review` (correr antes de dar UI por concluida — complementa o `/review`).

- **Consistencia**: usar design tokens (cor/espacamento/tipografia); uma escala de espacamento e uma de tipografia; nº limitado de tamanhos de fonte. Zero valores hardcoded soltos.
- **Estados obrigatorios** em toda a UI: loading (skeleton, sem layout shift), empty (com orientacao), error (mensagem accionavel), success; e hover/focus/active/disabled nos interativos.
- **Acessibilidade** (Polido: AA basico; Elite: AA completo): contraste AA, foco visivel, navegacao por teclado, semantica correta, respeitar `prefers-reduced-motion`.
- **Responsividade**: mobile-first, alvos de toque >= 44px, sem overflow horizontal.
- **Premium** [Polido/Elite]: transicoes subtis (150-300ms) com proposito, microcopy humano, atencao ao detalhe (alinhamento/ritmo).
- **SEO/metadata** [so web publico]: `<title>`/description por pagina, Open Graph, sitemap.

### Testagem E2E

- Usar `data-testid` em componentes interativos criticos (toggles, botoes de acao em listas) para garantir seletores resilientes que sobrevivam a mudancas de texto ou animacoes de UI.

### CI/CD Pipeline

- O repositorio usa **GitHub Actions** para validacao automatica (`.github/workflows/`).
- **`ci.yml`** corre em cada push e PR para main: TypeScript, lint, build, unit tests, security audit.
- **`e2e.yml`** e trigger manual (`workflow_dispatch`) para testes E2E e seguranca.
- **Nenhum merge para main** deve acontecer com checks vermelhos no CI.
- **Dependabot** (`.github/dependabot.yml`) gere updates automaticos de dependencias npm e GitHub Actions, com commits em formato Conventional Commits. PRs do Dependabot correm no `pull_request` normal (token read-only, sem secrets — default seguro do GitHub); o CI usa `permissions: contents: read` e nao precisa de `pull_request_target`.
- **PR Template** (`.github/pull_request_template.md`) impoe checklist obrigatoria alinhada com o workflow `/review`.
- **Issue Templates** (`.github/ISSUE_TEMPLATE/`) estruturam bug reports e feature requests alinhados com o backlog.
- **Doc Guards** (`.agent/scripts/check-doc-versions.mjs` + `guards/*.mjs`): Guards que correm sem config — orcamento de bytes das rules (WARN 11.5k / MAX 12k), paridade `CLAUDE.md`≡`GEMINI.md`, workflows↔wrappers (existencia **e** conteudo do ponteiro), workflows listados em `CLAUDE`/`GEMINI`/`AGENTS`/`agent-guide`, `@imports` resolvem, sanidade do `.claude/settings.json` (deny de secrets, allow sem wildcards abertos), **placeholders esquecidos apos o bootstrap** (salta enquanto o bootstrap nao correu), versao `package.json`≡`CHANGELOG`, `.nvmrc`, termos obsoletos — mais versoes de deps (configuravel). Caminhos ancorados a raiz do repo (nao ao cwd) e **todo o skip e visivel**: um guard que nao corre imprime `SKIP`, nunca desaparece. Sai `!= 0` em warning (serve de gate). Opt-in no CI; correr antes de commit e apos Dependabot PRs.
- **Bundle Size Checker** (`.agent/scripts/check-bundle-sizes.mjs`): mede o First Load JS por rota contra os `TARGETS`. **Prefere falhar a reportar um numero que nao mediu** — ficheiro do manifest ausente do disco, ou rota cujos chunks proprios nao resolvem, saem `!= 0` em vez de imprimir `[OK]`. Limite conhecido no cabecalho: as rotas do App Router nao estao no `build-manifest.json`, e o varrimento de diretorio nao cobre route groups. Testes: `test-bundle-sizes.mjs`.
- **Guard Tests** (`test-guards.mjs`, `test-bundle-sizes.mjs`, `test-backlog.mjs`, `test-mutation-sweep.mjs`): testes **negativos** de cada verificador — quebram o que ele promete verificar e afirmam que avisa e sai `!= 0`. Correm no job `guard-tests` do CI, sem gate. Sem dependencias nem `package.json`. Correr apos qualquer alteracao a um `check-*.mjs`: um guard que passa quando devia falhar produz confianca infundada.
- **Backlog Checker** (`.agent/scripts/check-backlog.mjs`): Trata os contadores do Resumo e a barra de progresso do backlog como dados derivados — recalcula-os a partir das tabelas (items abertos em `backlog.md` + fechados em `backlog-archive.md`) e avisa se divergirem; deteta tambem IDs duplicados. Caminhos ancorados a raiz do repo (nao ao cwd) e **ficheiro ausente reprova** — um gate que nao consegue validar nao pode sair `0`. Correr antes de commit; opt-in no CI.
- **Mutation Sweep** (`.agent/scripts/mutation-sweep.mjs`): mede se as suites **afirmam** algo — desliga cada sitio de erro de cada verificador, um a um, e exige que a suite fique vermelha. Sai `!= 0` se um sitio puder ser desligado com a suite verde, se um verificador nao tiver suite, ou se a baseline ja estiver vermelha. Custa minutos (recorre a suite por sitio), logo e opt-in no CI: correr localmente apos mexer num `check-*.mjs`. **Substitui contar sitios a mao** — o numero e derivado. **Varre-se a si proprio** (`--only=mutation-sweep`): reprova quem nao tem suite, logo nao pode ser a excecao.

### Code Quality Config

- **`.editorconfig`**: Garante formatacao consistente (2 spaces, UTF-8, LF) entre IDEs.
- **`.github/CODEOWNERS`**: Define reviewers automaticos por ficheiro/pasta.
- **`LICENSE`**: MIT (ou outra licenca adequada ao projeto).
- **Branch Protection**: Branch protection rules (require status checks, bloquear force push) requerem GitHub Pro em repos privados. O CI funciona como **semaforo informativo**. Se disponivel, ativar em GitHub Settings > Branches > Branch protection rules.

### Docs & Knowledge Sync

- Toda alteracao significativa de codigo/logica deve ser acompanhada de atualizacao no `src/docs/CHANGELOG.md`, nas regras do Agente (`.agent/rules/`), manuais tecnicos (`src/docs/`), **workflows do agente (`.agent/workflows/`)**, **scripts de automacao (`.agent/scripts/`)** e **pipelines CI/CD (`.github/workflows/`)**.
- O Agente deve propor estas atualizacoes e aguardar confirmacao.
  > O `src/docs/CHANGELOG.md` segue o formato `## [vX.Y.Z] - Descricao` e deve ser atualizado ANTES de cada commit.
  > **Sync Proativo**: O Agente **NAO deve esperar** que o utilizador peca para atualizar a documentacao. Antes de dizer "Estou pronto para commit", verificar e atualizar automaticamente: `.agent/context/`, `.agent/rules/`, `.agent/scripts/`, `.agent/workflows/`, `.github/`, `src/docs/`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- **Conventional Commits**: Todas as mensagens de commit seguem o formato definido em `CONTRIBUTING.md` e `.agent/rules/process-rules.md`.
- **Versao Node**: `.nvmrc` e a fonte unica da versao Node — o CI le-a via `node-version-file: .nvmrc` (`ci.yml`/`e2e.yml`).
- **Anti-padroes**: sempre que um bug revele um padrao evitavel, registar uma entrada em `.agent/rules/anti-patterns.md` (com `grep` de detecao para o `/review`).
- **Comandos multi-agente (fonte unica)**: a logica dos workflows vive SO em `.agent/workflows/*.md`. Os `.claude/commands/*` e `.gemini/commands/*` sao **ponteiros finos** ("ler e seguir `.agent/workflows/<x>.md`") — **nunca duplicar logica neles**. Mudar a logica = editar so o workflow (os wrappers apanham automaticamente). Ao **adicionar/renomear/remover** um comando, atualizar ambas as pastas de wrappers + a tabela de workflows em `CLAUDE.md`/`GEMINI.md`/`AGENTS.md`.

> Regras de processo (sessao, backlog, git, branches, fluxos) estao em `process-rules.md`.
> Checklist completa de sync docs + **matriz de propagacao** (o que replicar ao adicionar workflow/rule/script/context) em `sync-docs.md` (nao carregada — consultar antes de commit).
