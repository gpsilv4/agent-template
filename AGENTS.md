# AGENTS.md — {{PROJECT_NAME}}

> Entry point cross-tool para agentes de IA (Cursor, Windsurf, Zed, GitHub Copilot coding agent, etc.).
> Claude Code usa `CLAUDE.md` e Gemini usa `GEMINI.md` (mesmo conteudo, so difere a sintaxe de import).
> A **fonte de verdade** partilhada esta em `.agent/` — nunca editar regras aqui; editar em `.agent/`.

{{PROJECT_DESCRIPTION}}
Stack: {{STACK}}.

## Regras (ler sempre antes de agir)

- `.agent/rules/core-rules.md` — padroes de codigo, type safety, DRY, performance, seguranca, CI/CD
- `.agent/rules/process-rules.md` — git, branches, sprints, backlog, arquivamento, testes proativos
- `.agent/rules/anti-patterns.md` — anti-padroes derivados de bugs (com `grep` de detecao)
- `.agent/rules/business-logic.md` — regras de negocio do dominio
- `.agent/rules/pages-architecture.md` — arquitetura de paginas/UI

## Estado atual

- `.agent/context/` — `session.md`, `task.md`, `decisions.md`, `backlog.md` (trabalho ativo), etc.
- Ficheiros `*-archive.md` sao historico inerte — ler on-demand, nao carregar sempre.

## Workflows (ler on-demand quando invocados)

`setup` · `plan` · `review` · `refactor` · `deploy` · `debug` · `e2e-tests` · `security-tests`
→ ficheiros em `.agent/workflows/<nome>.md`. No Claude Code sao tambem slash commands (`.claude/commands/`).

## Regras de ouro

- UI em {{UI_LANGUAGE}}; codigo, variaveis e commits em ingles (Conventional Commits).
- TypeScript estrito, `any` proibido. Ficheiros ~400 linhas (flag > 500).
- Nunca expor secrets. NUNCA `git commit`/`push` sem autorizacao explicita do utilizador.
- Antes de commit, correr a checklist de `.agent/rules/sync-docs.md` e os guards (`.agent/scripts/`).
