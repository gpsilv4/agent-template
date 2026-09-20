# Sync Docs — Checklist ({{PROJECT_NAME}})

> **Nao carregado automaticamente no contexto.** Consultado on-demand pelos workflows `/review` e `/deploy`
> (e sempre que o agente vai dizer "Estou pronto para commit"). Manter aqui — e nao em `process-rules.md` —
> para o contexto sempre-carregado ficar enxuto.

## Regra Obrigatoria

Esta checklist DEVE ser corrida **automaticamente** pelo agente antes de dizer "Estou pronto para commit".
Nao basta atualizar apenas os ficheiros de contexto (`.agent/context/`) — e obrigatorio verificar e atualizar
**TODOS os pontos** abaixo. O agente **NAO deve esperar** que o utilizador peca "sync docs" — deve faze-lo proativamente.

## Escala por tamanho do ticket

> Esta checklist corria igual num ticket `S` e num `L`. Com o `/review` a pagar dezenas de caixas ao
> lado, um ticket de **< 30 min** pagava ~100 itens de processo — e um processo mais caro que
> o trabalho deixa de ser corrido. O que nao escala nao e seguido.

| Tamanho | Pontos obrigatorios | Porque |
|---------|--------------------|--------|
| **`S`** | **9, 16, 26, 27, 28** | Backlog fechado, CHANGELOG registado, placeholders e hooks novos cobertos, e os guards corridos. E o minimo que impede drift silencioso. |
| **`M`** | 1-17, 26-28 | Acrescenta as rules, o contexto e os manuais — o que um ticket de feature tipicamente move. |
| **`L`** | **Todos** | Um `L` mexe em estrutura: CI, templates de PR/issue, governanca. |

> Ponto **28** (correr os guards) **nunca se dispensa**, em nenhum tamanho: e o unico da lista
> que nao depende de ninguem se lembrar de nada.

> **A matriz de propagacao vive em `.agent/rules/propagation.md`.** Sao dois catalogos
> consultados em momentos diferentes: esta checklist corre-se **antes de um commit**, a matriz
> abre-se **ao criar um ficheiro novo**. Juntos cresciam para la do orcamento a cada tipo de
> artefacto novo.

## Checklist

1. [ ] `README.md` — contagens de testes, stack, scripts atualizados
2. [ ] `CLAUDE.md` — referencias a `.agent/` files corretas
3. [ ] `GEMINI.md` — **espelho** de `CLAUDE.md` (atualizar **em par** — so difere a sintaxe `@[...]`). Verificar paridade: `node .agent/scripts/check-doc-versions.mjs`
4. [ ] `.agent/rules/` — todas as regras refletem o estado atual do codigo (e dentro do orcamento de bytes)
5. [ ] **Backlog** mexido -> o procedimento vive em `.agent/rules/backlog-method.md`; `check-backlog.mjs` a sair 0
5b. [ ] **Verificador** alterado (`.agent/scripts/`) -> `.agent/rules/scripts-guide.md`; **hook** alterado (`.claude/hooks/` ou `.githooks/`) -> `.agent/rules/hooks-guide.md`. Sao dois catalogos separados desde que juntos passaram o orcamento; o detalhe vive la e nao nas rules carregadas
6. [ ] **Pares rule/evidencia** — as instrucoes vivem na rule carregada, a historia no ficheiro
   nao-carregado, e as duas atualizam-se **juntas**: `.agent/rules/anti-patterns.md` **e**
   `src/docs/anti-patterns-why.md` (ao acrescentar ou reescrever um anti-padrao: os quatro
   campos na rule, a evidencia no `-why`). Idem `.agent/rules/ticket-method.md` (instrucoes) **e** `src/docs/ticket-method-why.md` (evidencia: de onde veio a regra, o que custa) — se o processo por ticket mudou: fases, escala `S`/`M`/`L`, lista de angulos.
   **Renumerar ou mudar o ambito de uma fase obriga a atualizar quem a cita por numero**: `process-rules.md`
   (ponteiro + "Ao iniciar um item"), `/plan` (Fase 0), `/debug` (Fase 0+1), `/refactor` (Fase 0+4), `/review` (Fase 3)

> **Pontos 7 a 13, enquanto `.agent/.template-version` NAO existir** (este repo e o template por
> estrear): **saltam-se todos.** Nada se escreve em `.agent/context/` — esses ficheiros sao o
> andaime que cada projeto derivado herda, e o que la ficar nasce dentro dele. O estado e o
> trabalho pendente vivem em **issues**. O **Guard 21** reprova; a razao esta em `process-rules.md`.

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
    **Ficheiro acima das 500 linhas?** O Guard 17 reprova. Dividi-lo (dados para um modulo
    proprio e o corte mais barato) ou, com razao escrita, congela-lo em `TETOS` de
    `guards/sizes.mjs` — congelar e uma catraca (so encolhe), nao uma isencao. E ao ENCOLHER
    um congelado, **baixar o teto no mesmo commit**: a folga que fica por reclamar e espaco
    para voltar a crescer em silencio, e o guard reprova ate ela ser reclamada.
    **Script novo que a documentacao manda correr?** Pre-aprova-lo em `.claude/settings.json`
    (`allow`, com alvo FIXO e sem wildcard de argumentos) — o Guard 11 verifica excesso de
    permissoes, nunca falta, logo um script por pre-aprovar nao avisa: so incomoda quem o corre
16. [ ] `src/docs/CHANGELOG.md` — versao atual registada (`## [vX.Y.Z] - Descricao`), alinhada com `package.json`
    > No **template de origem** este ficheiro fica vazio de propósito (ver `/review` §2);
    > num projeto derivado a regra vale por inteiro.
17. [ ] `src/docs/` restantes — manuais refletem UI/logica atual
18. [ ] `.github/workflows/ci.yml` — CI pipeline reflete comandos e targets atuais
19. [ ] `.github/workflows/e2e.yml` — E2E pipeline atualizado (env vars, triggers)
20. [ ] `.github/pull_request_template.md` — checklist alinhada com `/review`
21. [ ] `.github/ISSUE_TEMPLATE/` — templates alinhados com backlog
22. [ ] `.github/dependabot.yml` — schedule e labels corretos
23. [ ] `CONTRIBUTING.md` — workflow, commit format e PR process atualizados
24. [ ] `SECURITY.md` — politica de disclosure atualizada
25. [ ] `.nvmrc` — fonte unica da versao Node (CI le via `node-version-file`)
26. [ ] **Ficheiro novo com um placeholder `{{ ... }}`?** (escrito com espacos de propósito: o sweep da Fase 2.1 casa `{{[A-Z_]+}}` e substituia este token, deixando a instrucao sem sentido em todos os derivados) O bootstrap tem de o varrer: confirmar que
    o tipo dele esta na Fase 2.1 do `BOOTSTRAP.md`, nos alvos do Guard 13 e no
    `simulate-derived.mjs`. Um `.githooks/commit-msg` sem extensao escapou as tres e o
    placeholder sobrevivia ao bootstrap — apanhado pela simulacao de projeto derivado.
27. [ ] `.githooks/` — hook novo ou alterado? Entao (a) tem a sua suite `test-*.mjs`, (b) esta
    em `PARES` no `mutation-sweep.mjs` com o seu `sinal`, (c) a suite corre no job `guard-tests`
    do `ci.yml`, e (d) o passo `git config core.hooksPath .githooks` continua documentado no
    `/setup` e no `CONTRIBUTING.md` — sem ele o hook nao corre em clone nenhum
28. [ ] **Guards de documentacao** — correr `node .agent/scripts/check-doc-versions.mjs` (e, apos qualquer alteracao aos proprios scripts, `node .agent/scripts/tests/test-guards.mjs` + `node .agent/scripts/tests/test-bundle-sizes.mjs`, que quebram cada guard de proposito e exigem que ele avise) (orcamento de bytes das rules, paridade CLAUDE/GEMINI, paridade workflows↔wrappers + workflows nas tabelas, versao CHANGELOG, `.nvmrc`, termos obsoletos, versoes de deps). Atualizar tudo o que estiver desatualizado, sobretudo apos merge de Dependabot PRs.

> **Evidencia em `src/docs/sync-docs-why.md`** (nao carregado): porque cada linha e assim.

## Contra-verificacao por grep (anti-drift)

Depois de atualizar, correr um grep pelos termos que acabaram de mudar (ficheiros renomeados, contagens antigas, versoes)
nos docs vivos — para apanhar referencias esquecidas. Excluir entradas historicas (`*-archive.md`, `CHANGELOG.md`).
Exemplo: `grep -rn "nome-antigo\|contagem-antiga" README.md CLAUDE.md GEMINI.md .agent/rules/ .agent/workflows/`
