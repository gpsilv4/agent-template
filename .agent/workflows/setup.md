# /setup — Onboarding de Developer

Guia para configurar o ambiente de desenvolvimento do {{PROJECT_NAME}}.

> **Isto e documentacao para uma PESSOA, nao uma tarefa de agente** — e a excecao entre os
> workflows. Um agente nao corre `nvm use` na tua maquina nem abre um browser; o que ele pode
> fazer aqui e ler-te os passos, verificar o que ja esta feito, e confirmar no fim. Vive em
> `.agent/workflows/` para ter um comando (`/setup`) e uma fonte unica com os outros.
>
> **O passo que nao se pode saltar e o `core.hooksPath`** (§2). Sem ele o `commit-msg` nao
> corre e a regra de mensagens limpas passa a ser so prosa — e um clone novo nao o traz, por
> mais que o repo esteja bem configurado.

## Arquitetura de Ambientes

```
.env.local (staging)     ->  npm run dev  ->  localhost:3000
                                               |
                                    {{BACKEND}} STAGING

feature branch           ->  git push  ->  {{HOSTING}} Preview URL
                                               |
                                    {{BACKEND}} STAGING

main branch              ->  git push  ->  {{HOSTING}} PRODUCAO
                                               |
                                    {{BACKEND}} PRODUCAO
```

> Desenvolvimento local usa **sempre** o backend de staging — nunca producao.

---

## 1. Pre-requisitos

- Node.js (ver `.nvmrc` para versao exata — correr `nvm use` se usas nvm)
- npm >= 9
- Acesso ao projeto backend **Staging**
- Git configurado
- **`gh`** (GitHub CLI), autenticado — o gate de CI do `/review` e do `/deploy` corre
  `gh pr checks`, e o `/audit` tambem o usa. **Sem ele o gate falha com "command not found",
  que e indistinguivel de "nao ha checks"** — e ai o `/deploy` avanca sobre um CI que ninguem
  viu. Verificar com `gh auth status`.
<!-- Adicionar outros pre-requisitos especificos do projeto -->

## 2. Instalacao

```bash
git clone <repo-url>
cd {{PROJECT_SLUG}}
nvm use                              # usa a versao Node definida em .nvmrc
git config core.hooksPath .githooks  # liga os hooks do git (versionados)
npm install
```

> O `core.hooksPath` e **por clone**: o git nao versiona `.git/hooks`, logo nao ha forma de o
> ligar automaticamente. Sem ele o `commit-msg` nao corre e a regra de mensagens limpas passa a
> ser so prosa. Confirmar com `git config core.hooksPath` (tem de devolver `.githooks`).

Antes de comecar a desenvolver, ler `CONTRIBUTING.md` para workflow, commit format e PR process.

## 3. Variaveis de Ambiente

Criar `.env.local` na raiz apontando para o projeto **STAGING**:

```env
# Adaptar ao backend do projeto
{{ENV_VARS_TEMPLATE}}
```

> Nunca usar chaves secretas (service_role, admin keys) no frontend.
> Nunca apontar `.env.local` para producao durante desenvolvimento.

## 4. Git — Trabalhar em Branches

Nunca commitar diretamente em `main`. Usar feature branches:

```bash
# Criar branch para nova feature
git checkout -b feature/nome-da-feature

# Desenvolver e commitar na branch
git add .
git commit -m "feat: descricao"
git push origin feature/nome-da-feature

# Abrir Pull Request para main (nunca merge direto).
# `--body-file` usa o template do repo; `--fill` ignorava-o.
gh pr create --title "feat: descricao" \
             --body-file .github/pull_request_template.md
# -> preencher checklist -> CI verde + review -> `gh pr merge --squash` (deploy para prod)
```

## 5. Estrutura do Projeto

```
{{PROJECT_STRUCTURE}}
```

## 6. Correr Localmente

```bash
npm run dev
```

Abre `http://localhost:3000`.

## 7. Build e Verificacao

```bash
npx tsc --noEmit        # 0 erros de TypeScript
npm run lint             # Sem warnings ESLint
npm run build            # Verificar tamanhos do bundle
```

## 8. Documentacao Essencial

Antes de tocar no codigo, ler:

1. **`.agent/rules/core-rules.md`** — Regras de codigo e padroes
2. **`.agent/rules/business-logic.md`** — Logica de negocio
3. **`.agent/rules/pages-architecture.md`** — Arquitetura UI

## 9. Workflows Disponiveis

A tabela completa vive em **`src/docs/agent-guide.md`** (e em `CLAUDE.md`/`GEMINI.md`/
`AGENTS.md`, que sao espelhos). Nao se repete aqui: era uma **quinta** copia mantida a mao, e
a unica que nenhum guard verificava — logo era a primeira a envelhecer. Os Guards 7/9/10
validam as outras quatro.

Os dois que interessam no primeiro dia: **`/grill`** antes de um ticket `L` ou ambiguo, e
**`/review`** antes de qualquer commit.

## 10. Convencoes Importantes

- **Linguagem UI**: {{UI_LANGUAGE}}
- **Codigo/Variaveis**: Ingles
- **Commits**: Conventional Commits obrigatorio (`feat:`, `fix:`, `docs:`, etc.) — ver `CONTRIBUTING.md`
- **Branches**: sempre feature branches, nunca commitar direto em `main`
- **Data Fetching**: {{STATE_MANAGEMENT}}
- **CHANGELOG**: Atualizar `src/docs/CHANGELOG.md` antes de deploys
- **Ficheiros**: Maximo ~400 linhas (flag se > 500)
- **Seguranca**: Nunca expor chaves secretas no cliente — ver `SECURITY.md` para politica de disclosure

## 11. CI/CD Pipelines (Automaticos)

O repositorio tem workflows automaticos em `.github/workflows/`:

- **`ci.yml`**: Corre em cada push e PR para main — TypeScript, lint, build, unit tests, security audit, e um `secret-scan` (gitleaks) que corre sempre. Bundle sizes e doc guards sao opt-in (descomentar no ficheiro). **Todos os checks devem estar verdes antes de mergear** — exceto o Security Audit, que e informativo (`continue-on-error`) e fica verde mesmo com advisories: abrir o log e ler o relatorio. Usa `permissions: contents: read`; PRs do Dependabot correm no `pull_request` normal (sem secrets).
- **`e2e.yml`**: Trigger manual (`workflow_dispatch`) — testes E2E e de seguranca. Usar para validar em staging/preview URLs antes de deploy.

Outros ficheiros `.github/`:

- **`pull_request_template.md`**: Checklist obrigatoria em cada PR (alinhada com `/review`)
- **`ISSUE_TEMPLATE/`**: Templates para bugs e features (alinhados com `backlog.md`)
- **`dependabot.yml`**: Updates automaticos semanais de dependencias npm e GitHub Actions
- **`dependabot-auto-merge.yml`**: auto-merge de PRs patch/minor do Dependabot — **opt-in** (desligado; ver cabecalho do ficheiro). Majors ficam sempre para review manual
- **`CODEOWNERS`**: Define reviewers automaticos por ficheiro

Para correr localmente o **essencial** do pipeline (nao e equivalente — ver notas):

```bash
npx tsc --noEmit && npm run lint && npm run build && npm run test:unit
npm audit --audit-level=high   # separado: informativo, nao deve abortar a cadeia
```

> **Tres diferencas face ao CI**, para nao criares expectativas erradas:
> 1. O `npm audit` corre com `continue-on-error` no CI — nunca reprova o merge.
> 2. Falta aqui o `secret-scan` (gitleaks), que no CI corre **sempre**, ate no template puro.
> 3. No CI cada step e **guardado** (salta se faltar `tsconfig.json` ou o script); a cadeia
>    `&&` local morre no primeiro que faltar.
