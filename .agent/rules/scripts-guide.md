# Guia dos Scripts de Verificacao ({{PROJECT_NAME}})

> **Nao carregado automaticamente.** O ponteiro obrigatorio vive em `core-rules.md`
> ("Scripts de verificacao"); este ficheiro e o detalhe. Manter aqui — e nao nas rules
> carregadas — porque a lista cresce com cada verificador e o orcamento de bytes das rules
> sempre-carregadas e finito (foi excedido a serio quando esta secao vivia lá).
>
> Abrir ao mexer em `.agent/scripts/` ou em `.claude/hooks/`.

## Os verificadores e as suas suites

- **Doc Guards** (`.agent/scripts/check-doc-versions.mjs` + `guards/*.mjs`): Guards que correm sem config — orcamento de bytes das rules carregadas (NOTE 11 500 / gate 12 000), das de **referencia** (NOTE 12 500 / gate 14 000, com mensagem mais dura acima de 20 000 — limiares diferentes porque uma entra no contexto a cada sessao e a outra por ticket) e do **contexto** carregado (`.agent/context/`: NOTE 36 000 / gate 48 000, derivado das regras de arquivamento do `process-rules.md`; as rules ficam fora desta soma porque tem dono proprio no primeiro orcamento), paridade `CLAUDE.md`≡`GEMINI.md`, workflows↔wrappers (existencia **e** conteudo do ponteiro), workflows listados em `CLAUDE`/`GEMINI`/`AGENTS`/`agent-guide`, `@imports` resolvem, sanidade do `.claude/settings.json` (deny de secrets, allow sem wildcards abertos), **placeholders esquecidos apos o bootstrap** (salta enquanto o bootstrap nao correu), **as Fronteiras copiadas nos ponteiros do Cursor e do Copilot** (copia forcada: nao esta verificado que esses tools sigam um ponteiro em markdown, logo o bloco esta la e o guard compara-o), versao `package.json`≡`CHANGELOG`, `.nvmrc`, termos obsoletos — mais versoes de deps (configuravel). Caminhos ancorados a raiz do repo (nao ao cwd) e **todo o skip e visivel**: um guard que nao corre imprime `SKIP`, nunca desaparece. Sai `!= 0` em warning (serve de gate). **Corre no CI** no job `guard-tests` — e nao no `quality`, que salta sem `package.json` e deixava estes guards testados mas nunca aplicados. Correr tambem antes de commit e apos Dependabot PRs.
- **Bundle Size Checker** (`.agent/scripts/check-bundle-sizes.mjs`): mede o First Load JS por rota contra os `TARGETS`. **Prefere falhar a reportar um numero que nao mediu** — ficheiro do manifest ausente do disco, ou rota cujos chunks proprios nao resolvem, saem `!= 0` em vez de imprimir `[OK]`. Limite conhecido no cabecalho: as rotas do App Router nao estao no `build-manifest.json`, e o varrimento de diretorio nao cobre route groups. Testes: `test-bundle-sizes.mjs`.
- **Modulos de guard** (`.agent/scripts/guards/*.mjs`): guards extraidos do ficheiro de entrada quando ele passa o flag das 500 linhas — `budgets` (serie 1: tres orcamentos de bytes + a copia das Fronteiras), `settings` (11), `versions` (3 + deps), `derived-counts` (12/12c/12d/12e), `placeholders` (13) e `anti-patterns` (15: as citacoes de anti-padroes resolvem). Cada um leva a sua entrada em `PARES` e a sua suite `tests-*.mjs` espelhada; sem a entrada, a varredura mede o ficheiro de entrada e reporta 100% a mentir, porque os avisos passaram a viver no modulo. **O `test-test-surface.mjs` segue o mesmo desenho** desde que tambem passou o flag: harness em `test-surface-harness.mjs` (com o `resumo()`, porque os contadores sao de la) e o bloco das marcas em `tests-surface-marks.mjs`; as tabelas de padroes (dados, nao decisoes) em `surface-patterns.mjs`, que **nao** pode chamar-se `check-*` nem viver em `guards/` — a descoberta do sweep exigiria um par, e um par com zero sitios reprova com `SINAL ERRADO`. Esse ficheiro tem entrada propria em `CONFIG_CONTAVEIS` (senao esvaziar as tabelas saia da superficie vigiada) e um invariante **escrito a mao** no verificador a contar as entradas das tabelas: as CONTAGENS usam as tabelas actuais, logo esvazia-las desligava a propria contagem que as vigiava — exit 0 sobre o detetor desligado. **Uma extracao nao fecha o gate da superficie de teste**: o `check-test-surface.mjs` compara o TOTAL e nao so cada ficheiro, logo uma contagem que desce na origem e sobe no modulo novo sai como `NOTE` ("movido, nao perdido") e nao `WARN` — a descida do total continua a reprovar.
- **Suites de testes negativos** (`test-guards.mjs`, `test-bundle-sizes.mjs`, `test-backlog.mjs`, `test-mutation-sweep.mjs`, `test-test-surface.mjs`, e `.claude/hooks/tests/test-hooks.mjs`): uma por verificador — quebram o que ele promete verificar e afirmam que avisa e sai `!= 0`. Correm no job `guard-tests` do CI, sem gate. Sem dependencias nem `package.json`. Correr apos qualquer alteracao a um `check-*.mjs`: um guard que passa quando devia falhar produz confianca infundada.
- **Backlog Checker** (`.agent/scripts/check-backlog.mjs`): Trata os contadores do Resumo e a barra de progresso do backlog como dados derivados — recalcula-os a partir das tabelas (items abertos em `backlog.md` + fechados em `backlog-archive.md`) e avisa se divergirem; deteta tambem IDs duplicados. Caminhos ancorados a raiz do repo (nao ao cwd) e **ficheiro ausente reprova** — um gate que nao consegue validar nao pode sair `0`. Correr antes de commit; **corre no CI** no job `guard-tests`.
- **Test Surface Checker** (`.agent/scripts/check-test-surface.mjs`): responde a "a superficie de teste foi enfraquecida desde a baseline?" — testes apagados, `skip`/`only` acrescentados, ou a **configuracao do runner** estreitada (que remove falhas sem tocar num teste). Compara **contagens** entre as duas versoes, nao linhas do diff. Sai `!= 0` tambem quando **nao consegue medir**. Ver `AP4`.
- **Hooks** (`.claude/hooks/`, **so-Claude Code**): o agente pode esquecer uma regra do `CLAUDE.md`; um hook nao esquece. Saem `0` em tudo excepto na negacao explicita — um hook avariado nunca bloqueia trabalho legitimo. Testes em `.claude/hooks/tests/test-hooks.mjs`.
  - `guard-protected-branch` (`PreToolUse`/`Bash`) — num branch protegido **permite so os verbos seguros** do `git` e **nega o resto**, incluindo o que nao consegue identificar; force-push cru (`--force`, `-f`, `+refspec`) e `--mirror` sao negados em **qualquer** branch; `--delete` e `:refspec` sao negados quando o **alvo** e um branch protegido — apagar um `fix/...` mergeado e rotina e tem de passar. E um **allowlist** de proposito: a versao com blocklist tinha 32 defeitos medidos — ver `AP6`. Tres detalhes que so aparecem quando se mede:
    - **A forma conta, nao so o verbo** (`FORMAS_INSEGURAS`): `switch -C main` faz o que `reset --hard` faz, e `branch -f`/`branch -D`/`fetch . HEAD:master` reescrevem ou apagam um branch protegido. O verbo esta em `SEGUROS` e a flag e que destroi.
    - **Alguns verbos exigem uma forma** (`FORMA_EXIGIDA`): `pull --ff-only` e `push --tags` passam porque o procedimento de release deste repo (`deploy.md`, `CONTRIBUTING.md`) corre em `main`; nega-los punha o guard contra a documentacao, e um falso positivo que bloqueia trabalho documentado custa tanto como um bypass.
    - **So o verbo falha fechado.** Chegar ao verbo depende da lista `WRAPPERS`, que **e** uma blocklist: `flock`, `su -c`, `ssh host git commit` e `GIT_PAGER='git commit' git log` passam. Esta escrito no cabecalho do hook e nao se finge o contrario.
    O alvo vem do `cwd` do payload **e de todos os `-C`/`--git-dir`/`cd`/`pushd` do comando**; sem pista valida cai no `cwd` do hook (lista vazia **permitia**). A tabela `BYPASSES` na suite e a lista viva de formas conhecidas — acrescentar uma quando aparecer. **Nao se escreve o tamanho dela em prosa**: a primeira tentativa dizia 28 quando a tabela tinha 47, e envelheceu no mesmo dia. O numero esta a um `grep -c` de distancia.
  - `session-context` (`SessionStart`) — afirma o estado real (branch, o que esta por commitar, PRs abertos) em vez de o deixar inferir. Deliberadamente **curto**: entra no contexto a cada sessao.
  - `stop-verify` (`Stop`) — diz que suite ficou **em divida** para os ficheiros tocados. Nao corre nada: um hook de fim de turno que corresse suites seria desligado.
  - Ambos usam `git status --untracked-files=all`, porque sem isso o git **colapsa diretorios** nao rastreados e um ficheiro novo em pasta nova aparece como a pasta.
  - **Nao ha `lint-changed-file`** de proposito: os comandos de lint sao especificos da stack, logo o template so poderia trazer um hook inerte — e um hook que nao faz nada por omissao e prosa com mais passos. Se o teu projeto tem lint, vale a pena escreve-lo: `PostToolUse`/`Write|Edit`, a devolver o que nao e auto-corrigivel como contexto para ser corrigido no mesmo turno.
- **Mutation Sweep** (`.agent/scripts/mutation-sweep.mjs`): mede se as suites **afirmam** algo — desliga cada sitio de erro de cada verificador, um a um, e exige que a suite fique vermelha. Sai `!= 0` se um sitio puder ser desligado com a suite verde, se um verificador nao tiver suite, ou se a baseline ja estiver vermelha. Custa minutos (recorre a suite por sitio), logo e opt-in no CI: correr localmente apos mexer num `check-*.mjs`. **Substitui contar sitios a mao** — o numero e derivado. **Varre-se a si proprio** (`--only=mutation-sweep`): reprova quem nao tem suite, logo nao pode ser a excecao.

> **O limite da varredura, e o `AP7`.** Ela mede se cada sitio de aviso **existente** e
> observado; **nao** mede se um ramo nunca dispara, nem ve um falso positivo. Um `note()` nao e
> sitio de aviso, e um `warn()` inalcancavel por construcao passa igualmente — ela nao tem como
> distinguir "coberto" de "impossivel". Medido: `26/26` no Guard 15 antes **e** depois de fechar
> um ramo que era codigo morto. O que apanha isto e o **controlo negativo por ramo** — desligar
> cada metade da correcao, uma por vez, e exigir vermelho em cada uma. Historia completa e as
> licoes transferiveis em `src/docs/anti-patterns-why.md` (`AP7`).

> **`test-harness.mjs`, `tests-*.mjs` e `.claude/hooks/tests/` nao sao entry points.** Correm
> por importacao a partir do `test-guards.mjs` (ou do runner dos hooks) e reprovam se alguem os
> invocar diretamente — um ficheiro chamado `tests-x.mjs` que "passa" sem correr nada e a forma
> canonica do `AP2`.

## A regra que os liga

Cada verificador **e cada hook** tem de ter **a sua suite de testes negativos** e **a sua
entrada em `PARES`** no `mutation-sweep.mjs`. A varredura reprova com `SEM PAR` um
`check-*.mjs`, um `guards/*.mjs` ou um `.claude/hooks/*.mjs` que exista no disco e nao esteja
registado — nao a silenciar, registar. E reprova com `SEM SUITE` uma entrada sem testes: um
verificador nao verificado nao da confianca, da a aparencia dela.

Os hooks entraram nesta regra depois de se notar que estavam **fora** dela: sao codigo de
enforcement com sitios de decisao, e um hook errado e pior que um guard errado porque corre
**antes** de cada ferramenta. O `sinal` de um guard-hook e a `negar(` — e exclui a *definicao*
da funcao, porque mutar uma definicao da erro de sintaxe e a suite ficaria vermelha pela razao
errada, contando como cobertura o que nao e.

## Universal vs so-Claude

O que carrega **logica** vive em `.agent/scripts/` — so precisa de `node`, logo qualquer agente
corre e o CI corre para todos. Os **hooks** em `.claude/hooks/` sao so-Claude Code e nao contem
logica: chamam as mesmas verificacoes **antes** de a ferramenta correr. Fora do Claude Code
perde-se o automatismo, nao a verificacao.
