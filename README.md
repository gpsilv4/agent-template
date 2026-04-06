# Agent Template

Template reutilizavel para configurar agentes AI (Claude Code, Gemini, Cursor, Copilot) em projetos de software.

Inclui estrutura `.agent/` para gestao de conhecimento, CI/CD pipelines, issue/PR templates e DevOps best practices — tudo pronto a customizar.

---

## O que inclui

```
.agent/
├── BOOTSTRAP.md              <- Prompt que a AI segue para customizar (usar 1x)
├── rules/
│   ├── core-rules.md         <- Padroes de codigo (TypeScript, performance, seguranca)
│   └── process-rules.md      <- Git, branches, sprints, backlog, sync docs
├── context/
│   ├── session.md            <- Estado da sessao atual
│   ├── task.md               <- Tarefas em progresso
│   ├── decisions.md          <- Decisoes arquiteturais (acumulado)
│   ├── walkthrough.md        <- Resumo de releases
│   ├── implementation_plan.md <- Plano de implementacao
│   └── backlog.md            <- Backlog com 4 seccoes + sprints + historico
├── workflows/
│   ├── setup.md              <- /setup — Onboarding de developer
│   ├── plan.md               <- /plan — Planear nova feature
│   ├── review.md             <- /review — Code review antes de commit
│   ├── refactor.md           <- /refactor — Refactoring seguro
│   ├── deploy.md             <- /deploy — Deploy para producao
│   ├── debug.md              <- /debug — Debug estruturado
│   ├── e2e-tests.md          <- /e2e-tests — Testes E2E Playwright
│   └── security-tests.md     <- /security-tests — Testes de seguranca
└── scripts/
    └── check-bundle-sizes.mjs <- Bundle size checker (Next.js)

.github/
├── workflows/
│   ├── ci.yml                <- CI: TypeScript, lint, build, unit tests, audit
│   └── e2e.yml               <- E2E + security tests (manual trigger)
├── ISSUE_TEMPLATE/
│   ├── bug_report.md         <- Template para reportar bugs
│   └── feature_request.md    <- Template para pedir features
├── pull_request_template.md  <- Checklist obrigatoria em cada PR
└── dependabot.yml            <- Updates automaticos de dependencias

CLAUDE.md                      <- Ponto de entrada para Claude Code
GEMINI.md                      <- Ponto de entrada para Gemini
src/docs/
├── agent-guide.md             <- Guia da pasta .agent/
└── CHANGELOG.md               <- Template de changelog
```

## Como usar

### 1. Criar repo a partir do template

```bash
# Via GitHub CLI
gh repo create meu-projeto --template gpsilv4/agent-template --clone
cd meu-projeto

# Ou via GitHub UI: "Use this template" -> "Create a new repository"
```

### 2. Abrir a AI e deixar o BOOTSTRAP.md guiar

```bash
# Abrir Claude Code (ou outro agente)
claude

# A AI ve o BOOTSTRAP.md no CLAUDE.md e inicia o processo automaticamente.
# Se nao iniciar, pedir:
# "Le o .agent/BOOTSTRAP.md e configura o projeto"
```

A AI vai:
1. Fazer perguntas sobre o projeto (nome, stack, dominio, paginas)
2. Substituir todos os `{{PLACEHOLDER}}` nos ficheiros
3. Gerar `business-logic.md` e `pages-architecture.md` do zero
4. Adaptar workflows, CI/CD e scripts a stack escolhida

### 3. Verificar e commitar

```bash
# Verificar que nao ficou nenhum placeholder
grep -r "{{" .agent/ CLAUDE.md GEMINI.md src/docs/

# Commit inicial
git add .
git commit -m "chore: bootstrap agent config"
```

### 4. Comecar a desenvolver

```bash
# Planear uma feature
# -> dizer a AI: "faz um /plan para X"

# Corrigir um bug
# -> dizer a AI: "aplica o /debug para Y"

# Review antes de commit
# -> dizer a AI: "corre o /review"
```

## CI/CD Pipelines

### `ci.yml` — Corre automaticamente em cada PR e push para main

| Step | O que faz |
|------|-----------|
| TypeScript | `npx tsc --noEmit` — 0 erros |
| Lint | `npm run lint` — sem warnings |
| Build | `npm run build` — verifica bundle |
| Unit Tests | `npm run test:unit` |
| Security Audit | `npm audit --audit-level=high` |

### `e2e.yml` — Trigger manual (workflow_dispatch)

| Step | O que faz |
|------|-----------|
| E2E Tests | `npm run test` — Playwright headless |
| Security Tests | `npm run test:security` |
| Report | Upload do Playwright report em caso de falha |

> E2E separado do CI porque e mais lento e requer credenciais de teste. Ativar em PRs descomentando o trigger no ficheiro.

### Dependabot

- Updates semanais de dependencias npm (minor + patch agrupados)
- Updates semanais de GitHub Actions
- PRs automaticos com label `dependencies` / `ci`

## Placeholders

| Placeholder | Descricao |
|-------------|-----------|
| `{{PROJECT_NAME}}` | Nome do projeto |
| `{{PROJECT_SLUG}}` | Slug kebab-case |
| `{{PROJECT_DESCRIPTION}}` | Descricao curta (1-2 frases) |
| `{{DOMAIN_DESCRIPTION}}` | Descricao detalhada do dominio |
| `{{FRAMEWORK}}` | Framework frontend |
| `{{BACKEND}}` | Backend/BaaS |
| `{{STYLING}}` | Framework de styling |
| `{{STATE_MANAGEMENT}}` | Gestao de estado/data fetching |
| `{{KEY_LIBRARIES}}` | Bibliotecas chave |
| `{{TEST_FRAMEWORK}}` | Framework de testes |
| `{{STACK}}` | Stack completa (1 linha) |
| `{{UI_LANGUAGE}}` | Linguagem da UI |
| `{{HOSTING}}` | Plataforma de hosting |
| `{{TYPES_FILE}}` | Ficheiro de tipos principal |
| `{{ENV_VARS_TEMPLATE}}` | Template de env vars |
| `{{TEST_ENV_VARS}}` | Env vars para testes |
| `{{PROJECT_STRUCTURE}}` | Arvore de diretorios |

## Ficheiros gerados pela AI (nao existem no template)

- `.agent/rules/business-logic.md` — Regras de negocio do dominio
- `.agent/rules/pages-architecture.md` — Arquitetura de paginas e UI

## Compatibilidade

Testado com:
- Claude Code (Claude Opus 4.6)
- Google Gemini
- Cursor
- GitHub Copilot

Funciona com qualquer agente AI que leia ficheiros markdown do projeto.

## Manutencao do template

Quando evoluis regras num projeto e queres propagar ao template:
1. Atualiza o ficheiro no repo template
2. Projetos existentes **nao** sao afetados (ja foram customizados)
3. Para propagar: cherry-pick manual dos ficheiros genericos
