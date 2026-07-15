# Bootstrap — Configuracao Inicial do Projeto

> **Este ficheiro e usado UMA VEZ pela AI para customizar o template ao novo projeto.**
> Apos customizacao, pode ser apagado ou mantido como referencia historica.
>
> Funciona com qualquer agente AI: Claude Code, Gemini, Cursor, Copilot, etc.

---

## Instrucoes para a AI

Le este ficheiro completo. Antes de avancar, pergunta ao utilizador:

> _"Ja sabes que stack, backend e arquitetura queres usar, ou preferes que te ajude a decidir?"_

- **Se ja sabe**: saltar para a Fase 1 (Perguntas ao Utilizador).
- **Se nao sabe ou tem duvidas**: comecar pela Fase 0 (Analise e Decisoes). No final da Fase 0, as respostas da Fase 1 sao preenchidas automaticamente com base no que foi decidido — o utilizador so confirma.

---

## Fase 0 — Analise e Decisoes (opcional)

> **Quando usar:** O utilizador descreve o projeto mas nao sabe que tecnologias, arquitetura ou plataformas escolher. A AI analisa e propoe — o utilizador valida.
>
> **Regra critica:** Para no fim de **cada passo** e espera confirmacao do utilizador antes de avancar para o proximo. Nunca saltar passos.

### Passo 1 — Compreender o Projeto

Pedir ao utilizador que descreva o projeto em 3-5 frases:
- O que faz?
- Para quem e?
- Que problema resolve?

Se a descricao for vaga, fazer perguntas de clarificacao antes de avancar.

→ **PARA AQUI.** Confirma que compreendeste o projeto antes de avancar.

---

### Passo 2 — Plataformas

Com base na descricao do projeto, analisar e recomendar:

- Que plataformas fazem sentido? (Web SPA, SSR/SSG, PWA, Mobile nativo, Desktop)
- Qual e a prioridade para o MVP e porque?
- O que fica de fora do MVP e porque?

Apresentar uma recomendacao clara com justificacao.

→ **PARA AQUI.** Espera que o utilizador confirme antes de avancar.

---

### Passo 3 — Stack Tecnica

Com base no projeto e nas plataformas confirmadas, recomendar a stack completa.
Para **cada peca**, responder: o que e, porque foi escolhida, pros, contras e alternativa valida.

Cobrir obrigatoriamente:
- Linguagem principal
- Framework frontend
- Backend / BaaS
- Base de dados
- Autenticacao
- Hosting / Deploy
- Framework de styling
- Gestao de estado / data fetching
- Bibliotecas principais (incluindo integracoes externas)
- Framework de testes

No fim, apresentar a stack numa linha resumida:
> ex: Next.js 16 + Supabase + Tailwind + SWR + Playwright → Vercel

→ **PARA AQUI.** Espera que o utilizador confirme antes de avancar.

---

### Passo 4 — Arquitetura

Com base na stack confirmada, desenhar a arquitetura em texto:

- Listar os componentes principais do sistema
- Mostrar como comunicam entre si (setas simples: `→`)
- Explicar cada ligacao em 1 frase
- Identificar integracoes externas necessarias
- Distinguir o que e critico vs opcional no MVP

Formato esperado:
```
[Browser] → [Frontend Next.js] → [API Routes] → [Supabase DB]
                                → [Servico Externo X]
[Admin]  → [Dashboard]        → [Relatorios PDF]
```

→ **PARA AQUI.** Espera que o utilizador confirme antes de avancar.

---

### Passo 5 — Riscos e Incognitas

Antes de avancar para a configuracao, analisar:

- O que pode correr mal neste projeto? (riscos tecnicos, dependencias externas, complexidade)
- Que decisoes tecnicas sao dificeis de reverter depois?
- Ha algo no projeto que nao esta claro e deve ser clarificado agora?
- Alguma pergunta aberta que condicione as escolhas feitas?

→ **PARA AQUI.** Espera que o utilizador confirme antes de avancar.

---

### Transicao para Fase 1

Quando todos os passos estiverem confirmados, apresentar um resumo:

```
RESUMO DA FASE 0
=================
Projeto:       [nome e descricao]
Plataforma:    [plataforma escolhida]
Stack:         [stack numa linha]
Arquitetura:   [diagrama simplificado]
Riscos:        [riscos principais]
```

Depois, preencher automaticamente as respostas da Fase 1 com base no que foi decidido. Apresentar os campos preenchidos ao utilizador para validacao antes de executar a Fase 2.

Se algum campo nao foi discutido na Fase 0, assinalar com `[a confirmar]` e perguntar ao utilizador.

---

## Fase 1 — Perguntas ao Utilizador

> **Se veio da Fase 0:** Os campos abaixo ja foram preenchidos automaticamente. Apresentar ao utilizador para validacao — so pedir input nos campos marcados `[a confirmar]`.
>
> **Se saltou a Fase 0:** Fazer estas perguntas **uma a uma** ou em bloco (conforme preferencia do utilizador).

Guarda as respostas — vais precisar delas para preencher todos os placeholders.

### Obrigatorias

1. **Nome do projeto** (ex: "MyShop", "HealthTracker", "TaskFlow")
   → Substitui `{{PROJECT_NAME}}` em todos os ficheiros

2. **Slug do projeto** (kebab-case, ex: "my-shop", "health-tracker")
   → Substitui `{{PROJECT_SLUG}}`

3. **Descricao curta** (1-2 frases sobre o que o projeto faz)
   → Substitui `{{PROJECT_DESCRIPTION}}`

4. **Descricao do dominio** (paragrafo detalhado sobre o dominio de negocio, utilizadores-alvo, e contexto)
   → Substitui `{{DOMAIN_DESCRIPTION}}`, base para gerar `business-logic.md`

5. **Stack tecnica**:
   - Framework frontend (ex: "Next.js 16 App Router", "Vite + React", "Nuxt 3")
   - Backend/BaaS (ex: "Supabase", "Firebase", "Express + PostgreSQL")
   - Styling (ex: "Tailwind CSS + Shadcn UI", "Chakra UI", "Styled Components")
   - State management (ex: "SWR", "React Query", "Zustand", "Pinia")
   - Bibliotecas chave (ex: "date-fns, jsPDF, recharts, sonner")
   - Framework de testes (ex: "Playwright", "Cypress", "Vitest")
   → Substitui `{{FRAMEWORK}}`, `{{BACKEND}}`, `{{STYLING}}`, `{{STATE_MANAGEMENT}}`, `{{KEY_LIBRARIES}}`, `{{TEST_FRAMEWORK}}`, `{{STACK}}`

6. **Linguagem da UI** (ex: "Portugues de Portugal (PT-PT)", "English (EN)", "Espanol (ES)")
   → Substitui `{{UI_LANGUAGE}}`

7. **Hosting/Deploy** (ex: "Vercel", "Netlify", "AWS Amplify", "Docker + VPS")
   → Substitui `{{HOSTING}}`

### Opcionais (perguntar se relevante)

8. **Ficheiro de tipos principal** (ex: `src/lib/types.ts`, `src/types/index.ts`)
   → Substitui `{{TYPES_FILE}}`

9. **Paginas principais** (lista das rotas/paginas da app, ex: "Dashboard (/), Products (/products), Settings (/settings)")
   → Base para gerar `pages-architecture.md` e `TARGETS` no bundle checker

10. **Sistema de subscricao/paywall?** (Free vs PRO, roles, permissoes)
    → Se sim: adaptar review.md, plan.md e pages-architecture.md com seccoes de gating

11. **Variaveis de ambiente** (lista das env vars necessarias para dev)
    → Substitui `{{ENV_VARS_TEMPLATE}}` e `{{TEST_ENV_VARS}}`

12. **Estrutura de diretorios** (se ja existir codigo, a AI pode ler automaticamente)
    → Substitui `{{PROJECT_STRUCTURE}}`

13. **Regras de negocio conhecidas** (formulas, limites, calculos, workflows do dominio)
    → Base para gerar `business-logic.md`

14. **Items iniciais de backlog** (bugs conhecidos, melhorias planeadas, features futuras)
    → Popular o `backlog.md`

15. **CI/CD** (ex: "GitHub Actions com Vercel", "GitLab CI", "GitHub Actions only")
    → Adaptar `.github/workflows/` com triggers e targets do projeto

16. **Branch protection?** (require status checks, require reviews, etc.)
    → Configurar no GitHub Settings > Branches > Branch protection rules

17. **Email de seguranca** (para disclosure de vulnerabilidades)
    → Substitui `{{SECURITY_EMAIL}}` em `SECURITY.md`

18. **Copyright holder** (nome ou organizacao para a licenca)
    → Substitui `{{COPYRIGHT_HOLDER}}` e `{{YEAR}}` em `LICENSE`

19. **Tier de qualidade da UI** — *so perguntar se o projeto tem UI* (saltar para APIs/CLI/libs):
    - `MVP` — funcional; estados basicos; sem polish obrigatorio
    - `Polido` — estados completos, a11y AA basico, responsivo, microcopy cuidado
    - `Elite` — tudo no maximo: a11y AA completo, motion com proposito, perf budget (Core Web Vitals), atencao ao detalhe
    → Substitui `{{QUALITY_TIER}}` em `core-rules.md` e `design-review.md`. Se nao houver UI, usar `N/A` e o `/design-review` fica inativo.

---

## Fase 2 — Ficheiros a Gerar/Customizar

Apos obter as respostas, a AI deve processar TODOS os ficheiros abaixo:

### 2.1 Substituicao de Placeholders (em TODOS os ficheiros do template)

Percorrer todos os `.md`, `.mjs` e `LICENSE` e substituir:

| Placeholder | Fonte |
|-------------|-------|
| `{{PROJECT_NAME}}` | Pergunta 1 |
| `{{PROJECT_SLUG}}` | Pergunta 2 |
| `{{PROJECT_DESCRIPTION}}` | Pergunta 3 |
| `{{DOMAIN_DESCRIPTION}}` | Pergunta 4 |
| `{{FRAMEWORK}}` | Pergunta 5 |
| `{{BACKEND}}` | Pergunta 5 |
| `{{STYLING}}` | Pergunta 5 |
| `{{STATE_MANAGEMENT}}` | Pergunta 5 |
| `{{KEY_LIBRARIES}}` | Pergunta 5 |
| `{{TEST_FRAMEWORK}}` | Pergunta 5 |
| `{{STACK}}` | Combinacao da pergunta 5 (ex: "Next.js 16, Supabase, Tailwind CSS, Shadcn UI, TypeScript, Playwright") |
| `{{UI_LANGUAGE}}` | Pergunta 6 |
| `{{HOSTING}}` | Pergunta 7 |
| `{{TYPES_FILE}}` | Pergunta 8 (default: `src/lib/types.ts`) |
| `{{ENV_VARS_TEMPLATE}}` | Pergunta 11 |
| `{{TEST_ENV_VARS}}` | Pergunta 11 |
| `{{PROJECT_STRUCTURE}}` | Pergunta 12 (ou gerar automaticamente) |
| `{{DATE}}` | Data atual (YYYY-MM-DD) |
| `{{AGENT_NAME}}` | Nome do agente AI a usar |
| `{{SECURITY_EMAIL}}` | Pergunta 17 (email para disclosure de vulnerabilidades) |
| `{{COPYRIGHT_HOLDER}}` | Pergunta 18 (nome ou organizacao para LICENSE) |
| `{{YEAR}}` | Ano atual (ex: 2026) |
| `{{SPRINT_DESCRIPTION}}` | "A definir" (placeholder inicial) |
| `{{QUALITY_TIER}}` | Pergunta 19 (MVP/Polido/Elite; `N/A` se sem UI) |

### 2.2 Ficheiros a GERAR do zero

Estes ficheiros nao existem no template — devem ser criados pela AI com base nas respostas:

| Ficheiro | Base | Conteudo |
|----------|------|----------|
| `.agent/rules/business-logic.md` | Perguntas 4, 13 | Regras de negocio do dominio: formulas, limites, calculos, workflows. Estruturar em seccoes numeradas. Incluir exemplos de codigo se relevante. |
| `.agent/rules/pages-architecture.md` | Perguntas 9, 10, 19 | Arquitetura de paginas: o que cada pagina faz, que dados mostra, interacoes do utilizador. Se houver paywall/roles, documentar o gating por pagina. **Incluir uma seccao "Design System / Barra de Qualidade"** com os tokens/escala concretos da UI lib escolhida (cores, espacamento, tipografia, radius/sombras) e os criterios do tier `{{QUALITY_TIER}}` (estados obrigatorios, a11y, motion, SEO se web publico). Se o projeto usa error tracking/observabilidade (ex: Sentry), notar aqui como capturar erros de UI — senao, omitir (nao assumir vendor). |

**Formato sugerido para `business-logic.md`:**

```markdown
# Business Logic ({{PROJECT_NAME}})

## 1. [Conceito de Dominio A]
- Regra X: ...
- Regra Y: ...

## 2. [Conceito de Dominio B]
- Formula: `resultado = valor_a * taxa + valor_b`
- Limites: min X, max Y

## 3. [Validacoes]
- Campo Z: 0-100, step 0.01
- Regra: validacao dupla (HTML min/max + clamp programatico no handler)
```

**Formato sugerido para `pages-architecture.md`:**

```markdown
# Pages Architecture & UI UX ({{PROJECT_NAME}})

## 1. Home / Dashboard (`/`)
- Dados exibidos: ...
- Interacoes: ...
- Free vs PRO: (se aplicavel)

## 2. [Pagina B] (`/path`)
- Dados exibidos: ...
- Interacoes: ...
```

### 2.3 Adaptar o Bundle Checker

No ficheiro `.agent/scripts/check-bundle-sizes.mjs`, descomentar e adaptar o objeto `TARGETS` com as paginas reais do projeto (pergunta 9):

```javascript
const TARGETS = {
  "/":          { name: "Home",       target: 160, alarm: 180 },
  "/products":  { name: "Products",   target: 160, alarm: 180 },
  "/settings":  { name: "Settings",   target: 155, alarm: 175 },
};
```

**Nota:** Este script so funciona com Next.js App Router. Para outros frameworks, indicar ao utilizador que deve ser adaptado ou removido.

### 2.4 Configurar os Doc Guards

O `.agent/scripts/check-doc-versions.mjs` corre **sem configuracao** os guards genericos: orcamento de bytes das rules, paridade `CLAUDE.md`≡`GEMINI.md`, versao `package.json`≡`CHANGELOG` e scanner de termos obsoletos. **Opcionalmente**, adaptar dois arrays:

- `CHECKS` — dependencias com versoes referenciadas na documentacao:

```javascript
const CHECKS = [
  { name: "Next.js", pkg: "next", pattern: /Next\.js\s+(\d+(?:\.\d+(?:\.\d+)?)?)/g, files: [".agent/rules/core-rules.md"] },
];
```

- `BANNED` — termos/ficheiros renomeados que nao devem reaparecer nos docs vivos:

```javascript
const BANNED = [
  // { re: /nome-antigo/g, msg: "renomeado para nome-novo" },
];
```

Correr antes de commit e apos merge de PRs do Dependabot. Opt-in no CI (descomentar em `ci.yml`).

> O `.agent/scripts/check-backlog.mjs` (valida contadores/barra de progresso e deteta IDs duplicados) **nao precisa de configuracao** — funciona a partir da estrutura do `backlog.md`/`backlog-archive.md`. Correr antes de commit; opt-in no CI.

### 2.5 Adaptar core-rules.md a stack

Dependendo da stack (pergunta 5), ajustar seccoes especificas:

- **Se NAO e Next.js**: remover referencias a `next/dynamic`, `next/image`, `NEXT_PUBLIC_*`
- **Se NAO e React**: adaptar padroes de componentes e hooks
- **Se NAO usa SWR**: adaptar seccao "Data Fetching" ao state management escolhido
- **Se NAO usa Tailwind**: remover padroes mobile especificos de Tailwind
- **Se NAO tem PWA**: remover seccoes de PWA/Service Worker

### 2.6 Adaptar workflows a stack

- **setup.md**: Adaptar env vars, scripts de build, estrutura de diretorios
- **deploy.md**: Adaptar ao hosting (Vercel vs Netlify vs Docker, etc.) e backend (migracoes)
- **review.md**: Adaptar secao de logica de negocio (placeholder -> regras reais)
- **design-review.md**: Substituir `{{QUALITY_TIER}}`; ajustar criterios a UI lib e ao tier escolhido. Se o projeto nao tem UI, o workflow fica inativo (documentar).
- **debug.md**: Adaptar secao de pitfalls comuns (placeholder -> pitfalls reais)

> **Modo minimo (opcional).** O template traz 11 workflows — e muito para um projeto pequeno. Um projeto pode ficar so com o essencial (`plan`, `review`, `debug`, `deploy`) e **remover os restantes** (o ficheiro `.agent/workflows/<x>.md` + os dois wrappers `.claude/commands/<x>` e `.gemini/commands/<x>`). O Guard 6/7 continua a validar a paridade e as tabelas dos que ficarem. Adicionar mais tarde e trivial (ver Matriz de Propagacao em `sync-docs.md`).

### 2.7 Customizar GitHub CI/CD e Governance

- **`.github/workflows/ci.yml`**: Verificar node version, descomentar bundle size check se necessario, ajustar scripts de teste ao projeto
- **`.github/workflows/e2e.yml`**: Descomentar PR trigger se E2E deve rodar automaticamente em PRs; adicionar env vars de teste como GitHub Secrets
- **`.github/pull_request_template.md`**: Verificar que checklist reflete o processo do projeto (alinhar com `/review`)
- **`.github/ISSUE_TEMPLATE/`**: Adaptar templates se backlog tem estrutura ou campos diferentes
- **`.github/dependabot.yml`**: Ajustar schedule e labels se necessario
- **`.github/CODEOWNERS`**: Substituir usernames com os do team real
- **`.editorconfig`**: Verificar que reflete coding standards do projeto (tabs vs spaces, indent size)
- **`LICENSE`**: Substituir `{{COPYRIGHT_HOLDER}}` e `{{YEAR}}`; verificar tipo de licenca (MIT por defeito)
- **`SECURITY.md`**: Substituir `{{SECURITY_EMAIL}}`; adaptar politica de disclosure se necessario
- **`CONTRIBUTING.md`**: Adaptar workflow, commit format e scripts de teste ao projeto
- **`CODE_OF_CONDUCT.md`**: Manter Contributor Covenant ou adaptar
- **`.nvmrc`**: Verificar que versao Node corresponde a `ci.yml` e `setup.md`

### 2.8 Ficheiros de regras/contexto adicionais e lingua

- **`.agent/rules/anti-patterns.md`**: apagar o exemplo `AP1` comentado (e ilustrativo); manter o cabecalho, o preambulo "como fazer crescer" e a linha "sem anti-padroes registados ainda".
- **`.agent/rules/sync-docs.md`**, **`.agent/context/backlog-archive.md`**, **`decisions-archive.md`**, **`walkthrough-archive.md`**: sem conteudo a gerar — o sweep de placeholders (2.1) trata dos titulos. Nao importar `sync-docs.md` nem os `*-archive.md` em `CLAUDE.md`/`GEMINI.md`.
- **Lingua dos docs**: os docs de `.agent/` e `src/docs/` estao em PT-PT. Se a lingua da equipa/UI (pergunta 6) **nao** for PT-PT, **traduzir** rules, workflows e ficheiros de contexto para essa lingua (o codigo, variaveis e nomes de ficheiros permanecem em ingles).

### 2.9 Camada multi-agente (`.claude/` + `.gemini/` + `AGENTS.md`)

- **`AGENTS.md`**: entry point cross-tool (Cursor, Windsurf, Copilot). O sweep de placeholders (2.1) preenche-o; verificar que reflete a stack e a descricao.
- **`.claude/commands/*.md`**: slash commands nativos do Claude Code — wrappers finos que apontam para `.agent/workflows/`. Outros agentes ignoram esta pasta.
- **`.gemini/commands/*.toml`**: os mesmos comandos para o Gemini CLI (wrappers finos com `{{args}}`). Ja incluidos no template.
- **Traducao**: se a lingua nao for PT-PT, traduzir a `description`/`prompt` dos wrappers em `.claude/commands/` **e** `.gemini/commands/` (a logica esta nos workflows — nao duplicar).
- **`.claude/agents/*.md`** (`code-reviewer`, `debugger`): subagentes read-only/investigacao. Ajustar se o processo mudar.
- **`.claude/settings.json`**: permissions do projeto (nega leitura de `.env*`, permite scripts seguros). Ajustar `allow`/`deny` a stack. `settings.local.json` e pessoal (gitignored) — nao versionar.

---

## Fase 3 — Verificacao Final

Apos completar todas as substituicoes e geracoes, apresentar ao utilizador:

### Checklist

- [ ] Todos os `{{PLACEHOLDER}}` foram substituidos? (`grep -r "{{" --exclude=BOOTSTRAP.md .agent/ CLAUDE.md GEMINI.md AGENTS.md LICENSE SECURITY.md src/docs/` — deve devolver **zero** linhas)
- [ ] `business-logic.md` gerado com regras do dominio?
- [ ] `pages-architecture.md` gerado com paginas e interacoes?
- [ ] `anti-patterns.md`: exemplo `AP1` comentado removido, so cabecalho + linha "sem entradas"?
- [ ] Docs de `.agent/` e `src/docs/` traduzidos, se a lingua nao for PT-PT?
- [ ] `TARGETS` no bundle checker atualizados?
- [ ] `core-rules.md` adaptado a stack?
- [ ] Workflows adaptados a stack e hosting?
- [ ] `CLAUDE.md` e `GEMINI.md` com descricao do projeto?
- [ ] `.github/workflows/ci.yml` configurado com triggers e scripts corretos?
- [ ] `.github/workflows/e2e.yml` triggers e env vars configurados?
- [ ] `.github/pull_request_template.md` reflete checklist do projeto?
- [ ] `.github/CODEOWNERS` tem usernames corretos?
- [ ] `.editorconfig` reflete coding standards?
- [ ] `LICENSE` tem copyright holder correto?

### Resumo de ficheiros

```
Ficheiros com placeholders substituidos:  ~30
Ficheiros gerados do zero:               2 (business-logic.md, pages-architecture.md)
Ficheiros adaptados a stack:             ~9 (core-rules, setup, deploy, review, debug, ci.yml, e2e.yml, editorconfig, anti-patterns)
Ficheiros de governance customizados:    ~4 (CODEOWNERS, PR template, issue templates, dependabot)
```

### Proximo passo

Sugerir ao utilizador:

```bash
# Verificar que nao ficou nenhum placeholder
grep -r "{{" --exclude=BOOTSTRAP.md .agent/ CLAUDE.md GEMINI.md AGENTS.md LICENSE SECURITY.md src/docs/

# Primeiro commit
git add .
git commit -m "chore: bootstrap agent config for {{PROJECT_NAME}}"
```

---

## Notas para a AI

- **Nao inventar regras de negocio** que o utilizador nao mencionou. Se nao ha informacao suficiente, criar seccoes com placeholders e comentarios `<!-- A preencher -->`.
- **Nao remover seccoes** dos workflows — apenas adaptar ou marcar como N/A.
- **Manter o formato** das tabelas markdown exatamente como esta no template.
- **Perguntar ao utilizador** se tem duvidas em vez de assumir.
- Este bootstrap e pensado para ser executado **uma unica vez** no inicio do projeto.
