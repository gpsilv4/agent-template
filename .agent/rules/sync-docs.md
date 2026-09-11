# Sync Docs — Checklist ({{PROJECT_NAME}})

> **Nao carregado automaticamente no contexto.** Consultado on-demand pelos workflows `/review` e `/deploy`
> (e sempre que o agente vai dizer "Estou pronto para commit"). Manter aqui — e nao em `process-rules.md` —
> para o contexto sempre-carregado ficar enxuto.

## Regra Obrigatoria

Esta checklist DEVE ser corrida **automaticamente** pelo agente antes de dizer "Estou pronto para commit".
Nao basta atualizar apenas os ficheiros de contexto (`.agent/context/`) — e obrigatorio verificar e atualizar
**TODOS os pontos** abaixo. O agente **NAO deve esperar** que o utilizador peca "sync docs" — deve faze-lo proativamente.

## Checklist

1. [ ] `README.md` — contagens de testes, stack, scripts atualizados
2. [ ] `CLAUDE.md` — referencias a `.agent/` files corretas
3. [ ] `GEMINI.md` — **espelho** de `CLAUDE.md` (atualizar **em par** — so difere a sintaxe `@[...]`). Verificar paridade: `node .agent/scripts/check-doc-versions.mjs`
4. [ ] `.agent/rules/` — todas as regras refletem o estado atual do codigo (e dentro do orcamento de bytes)
5. [ ] `.agent/rules/scripts-guide.md` — se acrescentaste ou alteraste um verificador (`.agent/scripts/`) ou um hook (`.claude/hooks/`): o detalhe vive la, e nao nas rules carregadas, porque o orcamento de bytes ja foi excedido a serio quando vivia
6. [ ] **Pares rule/evidencia** — as instrucoes vivem na rule carregada, a historia no ficheiro
   nao-carregado, e as duas atualizam-se **juntas**: `.agent/rules/anti-patterns.md` **e**
   `src/docs/anti-patterns-why.md` (ao acrescentar ou reescrever um anti-padrao: os quatro
   campos na rule, a evidencia no `-why`). Idem `.agent/rules/ticket-method.md` (instrucoes) **e** `src/docs/ticket-method-why.md` (evidencia: de onde veio a regra, o que custa) — se o processo por ticket mudou: fases, escala `S`/`M`/`L`, lista de angulos.
   **Renumerar ou mudar o ambito de uma fase obriga a atualizar quem a cita por numero**: `process-rules.md`
   (ponteiro + "Ao iniciar um item"), `/plan` (Fase 0), `/debug` (Fase 0+1), `/refactor` (Fase 0+4), `/review` (Fase 3)
7. [ ] `.agent/context/session.md` — estado da sessao atual
8. [ ] `.agent/context/task.md` — tarefas atualizadas
9. [ ] `.agent/context/backlog.md` + `.agent/context/backlog-archive.md`:
   - [ ] Trabalho feito fora do sprint esta registado com ID?
   - [ ] Contadores + barra de progresso corretos? (correr `node .agent/scripts/check-backlog.mjs`)
   - [ ] Linha **Proximo:** atualizada?
   - [ ] Items fechados movidos para `backlog-archive.md`; ordem das seccoes respeitada (🎯 -> 📚)?
10. [ ] `.agent/context/decisions.md` — novas decisoes registadas (arquivar as antigas se > ~150 linhas, ver Regra de Arquivamento)
11. [ ] `.agent/context/walkthrough.md` — se houve feature/fix user-facing (arquivar se > ~200 linhas)
12. [ ] `.agent/context/audit-history.md` — se correste `/audit`: baseline datada acrescentada? (acumulado, **nao** importado)
13. [ ] `.agent/context/implementation_plan.md` — se houve novo plano
14. [ ] `.agent/workflows/` — workflows refletem processos atuais
15. [ ] `.agent/scripts/` — scripts e targets atualizados.
    **Verificador novo ou alterado?** Entao (a) tem o seu `test-*.mjs` com controlos negativos,
    (b) esta registado em `PARES` no `mutation-sweep.mjs` com o seu `sinal` de reprovacao, e
    (c) `node .agent/scripts/mutation-sweep.mjs` sai 0. A varredura reprova de proposito um
    verificador sem suite — nao a silenciar, escrever a suite.
    **Guard extraido para `guards/*.mjs`, ou hook novo em `.claude/hooks/`?** A entrada em `PARES` e obrigatoria: os avisos
    passam a viver no modulo, e sem ela a varredura cobre so o ficheiro de entrada e reporta
    100% a mentir. A soma dos sitios antes e depois de um refactor tem de ser a MESMA.
    **Script novo que a documentacao manda correr?** Pre-aprova-lo em `.claude/settings.json`
    (`allow`, com alvo FIXO e sem wildcard de argumentos) — o Guard 11 verifica excesso de
    permissoes, nunca falta, logo um script por pre-aprovar nao avisa: so incomoda quem o corre
16. [ ] `src/docs/CHANGELOG.md` — versao atual registada (`## [vX.Y.Z] - Descricao`), alinhada com `package.json`
17. [ ] `src/docs/` restantes — manuais refletem UI/logica atual
18. [ ] `.github/workflows/ci.yml` — CI pipeline reflete comandos e targets atuais
19. [ ] `.github/workflows/e2e.yml` — E2E pipeline atualizado (env vars, triggers)
20. [ ] `.github/pull_request_template.md` — checklist alinhada com `/review`
21. [ ] `.github/ISSUE_TEMPLATE/` — templates alinhados com backlog
22. [ ] `.github/dependabot.yml` — schedule e labels corretos
23. [ ] `CONTRIBUTING.md` — workflow, commit format e PR process atualizados
24. [ ] `SECURITY.md` — politica de disclosure atualizada
25. [ ] `.nvmrc` — fonte unica da versao Node (CI le via `node-version-file`)
26. [ ] **Guards de documentacao** — correr `node .agent/scripts/check-doc-versions.mjs` (e, apos qualquer alteracao aos proprios scripts, `node .agent/scripts/test-guards.mjs` + `node .agent/scripts/test-bundle-sizes.mjs`, que quebram cada guard de proposito e exigem que ele avise) (orcamento de bytes das rules, paridade CLAUDE/GEMINI, paridade workflows↔wrappers + workflows nas tabelas, versao CHANGELOG, `.nvmrc`, termos obsoletos, versoes de deps). Atualizar tudo o que estiver desatualizado, sobretudo apos merge de Dependabot PRs.

## Matriz de Propagacao (ao ADICIONAR um ficheiro novo)

> A fonte de verdade vive em `.agent/`. Ao criar um ficheiro novo, replicar/registar nos sitios abaixo
> para nada ficar desatualizado. Os wrappers `.claude/`/`.gemini/` sao **ponteiros finos** — nunca duplicar logica.

| Novo ficheiro | Onde replicar/registar |
|---|---|
| **Workflow** (`.agent/workflows/X.md`) | wrapper `.claude/commands/X.md` + `.gemini/commands/X.toml` (ponteiro fino que **cita o caminho do proprio workflow** — validado pelo Guard 10); tabela de workflows em `CLAUDE.md` + `GEMINI.md` + `AGENTS.md`; `src/docs/agent-guide.md`; `README.md` (arvore); **tabela de fluxo por tipo** em `process-rules.md` e `CONTRIBUTING.md`; listas de essenciais/removiveis do Modo minimo em `BOOTSTRAP.md` |
| **Rule sempre-carregada** (`.agent/rules/X.md`) | `@import` em `CLAUDE.md` + `GEMINI.md`; **`AGENTS.md`** (enumera as rules pelo nome); array `REQUIRED_RULES` em `check-doc-versions.mjs` (orcamento de bytes); `agent-guide.md`; `README.md` |
| **Ponto de entrada de uma ferramenta** (`.github/copilot-instructions.md`, `.cursor/rules/*.mdc`, ...) | ponteiro **fino** para `AGENTS.md` — nunca logica; incluir no varrimento de placeholders do `BOOTSTRAP` §2.1 (atencao a extensao: `.mdc` nao e `.md`) e nos alvos do Guard 13; linha na tabela de compatibilidade do `README.md` com o que foi **de facto** verificado |
| **Rule NAO carregada** (checklist/guia) | referencia on-demand nos workflows que a usam; **ponteiro curto na rule carregada que a torna obrigatoria** (padrao do `sync-docs.md` e do `ticket-method.md`); `README.md`/`agent-guide.md`; ponto novo na checklist acima — **sem** `@import` |
| **Duplicacao forcada** (o mesmo texto tem de existir em dois ficheiros porque cada tool le so o seu) | um guard que compare as copias — nunca confiar em as manter iguais a mao. Ja acontece com as Fronteiras (`CLAUDE.md` -> `.cursor/rules/*.mdc` + `.github/copilot-instructions.md`, Guard 1d) e com `CLAUDE.md`≡`GEMINI.md` (Guard 2). E a regra "duplicacao nova e flag no /review" de `core-rules.md`: quando extrair e impossivel, verifica-se |
| **Constante adaptavel** num script (`TARGETS`, `BANNED`, `CHECKS`, `TEST_GLOBS`, `CONFIG_GLOBS`, `CONTAGENS`) | a linha correspondente na tabela de categorias do `upgrade.md` — senao um upgrade faz copia cega e apaga a adaptacao do projeto, devolvendo o gate a medir zero; e o `BOOTSTRAP.md`, com a receita que manda adapta-la |
| **Script** (`.agent/scripts/X.mjs`) | passo em `.github/workflows/ci.yml` — no job **`guard-tests`** se nao depender de `package.json` (e o caso de todos os `test-*.mjs`, do `check-doc-versions` e do `check-backlog`; o `check-test-surface` tambem la vive, mas com `if: github.event_name == 'pull_request'`, porque precisa da base do PR — logo **nao** corre no push para `main`), opt-in comentado so se depender de build ou de configuracao do projeto (`TARGETS`, `CHECKS`). **Nunca no job `quality`**: tem `if: has_pkg == 'true'` e salta num template sem app, o que deixa o guard testado e nunca aplicado; `core-rules.md` (seccao scripts); `README.md` (arvore + tabela); **e os sitios que o INVOCAM**: `review.md`, `deploy.md`, `.github/pull_request_template.md`, `BOOTSTRAP.md` §2.4 — sem isto o guard fica documentado em todo o lado e corrido por nada. Se e um guard, criar tambem o `test-X.mjs` com os controlos negativos |
| **Context** (`.agent/context/X.md`) | decidir **importado** (`@` em CLAUDE.md + GEMINI.md) vs **arquivo** (nao importado, historico inerte); **`AGENTS.md`**; `README.md`; `agent-guide.md`; **ponto novo na checklist numerada acima** (sem citar o total: o Guard 12 so valida a forma `(N pontos` em linhas que mencionem `sync-docs`, logo um intervalo escrito a mao escapa-lhe — e este dizia `1-24` com 26 pontos); classificacao substituido/acumulado/permanente em `process-rules.md`; nota dos `*-archive.md` em `CLAUDE.md`/`GEMINI.md` |

> **Sentido inverso**: quando o **template de origem** ganha algo e se quer trazer para um
> projeto derivado, o workflow e `/upgrade` (`.agent/workflows/upgrade.md`). Decide por
> **categoria de ficheiro** — nunca por lista de nomes, que envelhece — e o `.agent/context/*`
> nunca se toca. Se acrescentares uma categoria a matriz acima, acrescenta a linha
> correspondente a tabela do `/upgrade`.

> Regra de paridade: qualquer edicao a `CLAUDE.md` tem espelho em `GEMINI.md` (so difere `@[...]`) — validado por `check-doc-versions.mjs`.

## Contra-verificacao por grep (anti-drift)

Depois de atualizar, correr um grep pelos termos que acabaram de mudar (ficheiros renomeados, contagens antigas, versoes)
nos docs vivos — para apanhar referencias esquecidas. Excluir entradas historicas (`*-archive.md`, `CHANGELOG.md`).
Exemplo: `grep -rn "nome-antigo\|contagem-antiga" README.md CLAUDE.md GEMINI.md .agent/rules/ .agent/workflows/`
