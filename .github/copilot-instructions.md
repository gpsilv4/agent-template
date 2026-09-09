# {{PROJECT_NAME}} — instrucoes para o GitHub Copilot

> **Ponteiro fino. Nao duplicar logica aqui.** O Copilot carrega este ficheiro
> automaticamente; `CLAUDE.md` e `AGENTS.md` nao. Sem ele o Copilot nao lia nada
> do `.agent/` sem lhe ser dito ficheiro a ficheiro.

Le e segue **`AGENTS.md`** na raiz do repositorio. E o ponto de entrada cross-tool
e aponta para a fonte unica de verdade em `.agent/`:

- `.agent/rules/` — regras sempre validas (codigo, processo, anti-padroes)
- `.agent/workflows/` — os passos de cada tarefa (`plan`, `review`, `deploy`, ...)
- `.agent/context/` — estado atual do projeto (sessao, backlog, decisoes)

Ao pedirem-te uma tarefa que tenha workflow (`/plan`, `/review`, `/debug`,
`/refactor`, `/deploy`, ...), **abre `.agent/workflows/<nome>.md` e segue os passos**
em vez de improvisar.

O que **nao** se aplica a ti (e so-Claude Code, ignora sem perda de logica):
`.claude/settings.json` (fronteira de permissoes), `.claude/agents/` (subagentes),
`.claude/commands/` (slash commands nativos).
