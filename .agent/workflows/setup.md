# /setup — Onboarding de Developer

Guia para configurar o ambiente de desenvolvimento do {{PROJECT_NAME}}.

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
<!-- Adicionar outros pre-requisitos especificos do projeto -->

## 2. Instalacao

```bash
git clone <repo-url>
cd {{PROJECT_SLUG}}
nvm use          # usa a versao Node definida em .nvmrc
npm install
```

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

# Quando validado -> merge para main (deploy para prod)
git checkout main
git merge feature/nome-da-feature
git push origin main
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

| Comando     | Quando usar                          |
| ----------- | ------------------------------------ |
| `/plan`     | Antes de comecar uma feature nova    |
| `/debug`    | Para resolver bugs de forma metodica |
| `/review`   | Antes de fazer commit                |
| `/deploy`   | Antes de ir para producao            |
| `/refactor` | Ao reorganizar codigo existente      |
| `/e2e-tests` | Para correr testes E2E funcionais  |
| `/security-tests` | Para correr testes de seguranca |
| `/setup`    | Este guia (onboarding)               |

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

- **`ci.yml`**: Corre em cada push e PR para main — TypeScript, lint, build, unit tests, security audit. **Todos os checks devem estar verdes antes de mergear.**
- **`e2e.yml`**: Trigger manual (`workflow_dispatch`) — testes E2E e de seguranca. Usar para validar em staging/preview URLs antes de deploy.

Outros ficheiros `.github/`:

- **`pull_request_template.md`**: Checklist obrigatoria em cada PR (alinhada com `/review`)
- **`ISSUE_TEMPLATE/`**: Templates para bugs e features (alinhados com `backlog.md`)
- **`dependabot.yml`**: Updates automaticos semanais de dependencias npm e GitHub Actions
- **`CODEOWNERS`**: Define reviewers automaticos por ficheiro

Para correr o CI localmente (mesmos comandos do pipeline):

```bash
npx tsc --noEmit && npm run lint && npm run build && npm run test:unit && npm audit --audit-level=high
```
