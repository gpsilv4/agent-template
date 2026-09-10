# Guia dos Scripts de Verificacao ({{PROJECT_NAME}})

> **Nao carregado automaticamente.** O ponteiro obrigatorio vive em `core-rules.md`
> ("Scripts de verificacao"); este ficheiro e o detalhe. Manter aqui — e nao nas rules
> carregadas — porque a lista cresce com cada verificador e o orcamento de bytes das rules
> sempre-carregadas e finito (foi excedido a serio quando esta secao vivia lá).
>
> Abrir ao mexer em `.agent/scripts/` ou em `.claude/hooks/`.

## Os verificadores e as suas suites

- **Doc Guards** (`.agent/scripts/check-doc-versions.mjs` + `guards/*.mjs`): Guards que correm sem config — orcamento de bytes das rules carregadas (WARN 11.5k / MAX 12k) e das de **referencia** (NOTE 12k / MAX 20k, limiares diferentes porque uma entra no contexto a cada sessao e a outra por ticket), paridade `CLAUDE.md`≡`GEMINI.md`, workflows↔wrappers (existencia **e** conteudo do ponteiro), workflows listados em `CLAUDE`/`GEMINI`/`AGENTS`/`agent-guide`, `@imports` resolvem, sanidade do `.claude/settings.json` (deny de secrets, allow sem wildcards abertos), **placeholders esquecidos apos o bootstrap** (salta enquanto o bootstrap nao correu), versao `package.json`≡`CHANGELOG`, `.nvmrc`, termos obsoletos — mais versoes de deps (configuravel). Caminhos ancorados a raiz do repo (nao ao cwd) e **todo o skip e visivel**: um guard que nao corre imprime `SKIP`, nunca desaparece. Sai `!= 0` em warning (serve de gate). Opt-in no CI; correr antes de commit e apos Dependabot PRs.
- **Bundle Size Checker** (`.agent/scripts/check-bundle-sizes.mjs`): mede o First Load JS por rota contra os `TARGETS`. **Prefere falhar a reportar um numero que nao mediu** — ficheiro do manifest ausente do disco, ou rota cujos chunks proprios nao resolvem, saem `!= 0` em vez de imprimir `[OK]`. Limite conhecido no cabecalho: as rotas do App Router nao estao no `build-manifest.json`, e o varrimento de diretorio nao cobre route groups. Testes: `test-bundle-sizes.mjs`.
- **Suites de testes negativos** (`test-guards.mjs`, `test-bundle-sizes.mjs`, `test-backlog.mjs`, `test-mutation-sweep.mjs`, `test-test-surface.mjs`, e `.claude/hooks/tests/test-hooks.mjs`): uma por verificador — quebram o que ele promete verificar e afirmam que avisa e sai `!= 0`. Correm no job `guard-tests` do CI, sem gate. Sem dependencias nem `package.json`. Correr apos qualquer alteracao a um `check-*.mjs`: um guard que passa quando devia falhar produz confianca infundada.
- **Backlog Checker** (`.agent/scripts/check-backlog.mjs`): Trata os contadores do Resumo e a barra de progresso do backlog como dados derivados — recalcula-os a partir das tabelas (items abertos em `backlog.md` + fechados em `backlog-archive.md`) e avisa se divergirem; deteta tambem IDs duplicados. Caminhos ancorados a raiz do repo (nao ao cwd) e **ficheiro ausente reprova** — um gate que nao consegue validar nao pode sair `0`. Correr antes de commit; opt-in no CI.
- **Test Surface Checker** (`.agent/scripts/check-test-surface.mjs`): responde a "a superficie de teste foi enfraquecida desde a baseline?" — testes apagados, `skip`/`only` acrescentados, ou a **configuracao do runner** estreitada (que remove falhas sem tocar num teste). Compara **contagens** entre as duas versoes, nao linhas do diff. Sai `!= 0` tambem quando **nao consegue medir**. Ver `AP4`.
- **Hooks** (`.claude/hooks/`, **so-Claude Code**): o agente pode esquecer uma regra do `CLAUDE.md`; um hook nao esquece. Saem `0` em tudo excepto na negacao explicita — um hook avariado nunca bloqueia trabalho legitimo. Testes em `.claude/hooks/tests/test-hooks.mjs`.
  - `guard-protected-branch` (`PreToolUse`/`Bash`) — num branch protegido **permite so os verbos seguros** do `git` (leitura, `add`, `switch`, `stash`, `fetch`, `checkout -b`) e **nega o resto**, incluindo o que nao consegue identificar; force-push e negado em qualquer branch. E um **allowlist** de proposito: a versao com blocklist de verbos perigosos tinha 32 defeitos medidos (28 formas de a contornar, 3 de force-push, 1 falso positivo) — ver `AP6`. O alvo vem do `cwd` do payload **e de todos os `-C`/`--git-dir`/`cd`/`pushd` do comando**, e sem nenhuma pista cai no `cwd` do hook (antes devolvia lista vazia e **permitia**). A tabela `BYPASSES` na suite e a lista viva de formas conhecidas: acrescentar uma quando aparecer.
  - `session-context` (`SessionStart`) — afirma o estado real (branch, o que esta por commitar, PRs abertos) em vez de o deixar inferir. Deliberadamente **curto**: entra no contexto a cada sessao.
  - `stop-verify` (`Stop`) — diz que suite ficou **em divida** para os ficheiros tocados. Nao corre nada: um hook de fim de turno que corresse suites seria desligado.
  - Ambos usam `git status --untracked-files=all`, porque sem isso o git **colapsa diretorios** nao rastreados e um ficheiro novo em pasta nova aparece como a pasta.
  - **Nao ha `lint-changed-file`** de proposito: os comandos de lint sao especificos da stack, logo o template so poderia trazer um hook inerte — e um hook que nao faz nada por omissao e prosa com mais passos. Se o teu projeto tem lint, vale a pena escreve-lo: `PostToolUse`/`Write|Edit`, a devolver o que nao e auto-corrigivel como contexto para ser corrigido no mesmo turno.
- **Mutation Sweep** (`.agent/scripts/mutation-sweep.mjs`): mede se as suites **afirmam** algo — desliga cada sitio de erro de cada verificador, um a um, e exige que a suite fique vermelha. Sai `!= 0` se um sitio puder ser desligado com a suite verde, se um verificador nao tiver suite, ou se a baseline ja estiver vermelha. Custa minutos (recorre a suite por sitio), logo e opt-in no CI: correr localmente apos mexer num `check-*.mjs`. **Substitui contar sitios a mao** — o numero e derivado. **Varre-se a si proprio** (`--only=mutation-sweep`): reprova quem nao tem suite, logo nao pode ser a excecao.

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
