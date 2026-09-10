# AGENTS.md — {{PROJECT_NAME}}

> Entry point cross-tool para agentes de IA (Cursor, Windsurf, Zed, ChatGPT/Codex, GitHub Copilot, etc.).
> O Copilot e o Cursor carregam ficheiros proprios (`.github/copilot-instructions.md` e
> `.cursor/rules/*.mdc`) — ambos sao ponteiros finos que remetem para aqui, sem logica.
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

`setup` · `plan` · `review` · `design-review` · `refactor` · `deploy` · `debug` · `e2e-tests` · `security-tests` · `audit` · `market-scan` · `upgrade`
→ ficheiros em `.agent/workflows/<nome>.md`. No Claude Code sao tambem slash commands (`.claude/commands/`).

## Fronteiras (prioridade maxima)

- **Sempre**: TypeScript estrito (`any` proibido, ficheiros ~400 linhas); UI em {{UI_LANGUAGE}}, codigo/commits em ingles (Conventional Commits); antes de commit, correr `.agent/rules/sync-docs.md` + os guards (`.agent/scripts/`).
- **Perguntar primeiro**: criar branch; alteracoes destrutivas (migracoes, `DROP`, apagar dados); adicionar dependencias.
- **Nunca**: `git commit`/`push` sem autorizacao explicita; expor secrets/keys; commitar dados sensiveis.

> Prosa nao e garantia. A rede tem tres camadas: os **guards** em `.agent/scripts/` (so precisam de `node` — qualquer agente, e o CI corre-os), os **hooks** em `.claude/hooks/` (so-Claude Code: negam commit/push em branch protegido, afirmam o estado no arranque, dizem que suite ficou em divida) e o **CI**. Os hooks sao uma barreira contra o descuido, **nao** contra quem a queira contornar; fora do Claude Code perde-se o automatismo, nao a verificacao.
