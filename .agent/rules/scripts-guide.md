# Guia dos Scripts de Verificacao ({{PROJECT_NAME}})

> **Nao carregado automaticamente.** O ponteiro obrigatorio vive em `core-rules.md`
> ("Scripts de verificacao"); este ficheiro e o detalhe. Manter aqui — e nao nas rules
> carregadas — porque a lista cresce com cada verificador e o orcamento de bytes das rules
> sempre-carregadas e finito (foi excedido a serio quando esta secao vivia lá).
>
> Abrir ao mexer em `.agent/scripts/`. Para os hooks, ver `hooks-guide.md`.

> **Evidencia em `src/docs/scripts-guide-why.md`** (nao carregado): de onde veio cada decisao
> e o que custou. Aqui ficam as instrucoes.

> **Os hooks vivem em `.agent/rules/hooks-guide.md`.** Sao dois catalogos independentes,
> consultados em momentos diferentes — um ao mexer num verificador, outro ao mexer num hook —
> e juntos cresciam para lá do orcamento a cada peca nova. Ver a nota no fim.

## Os verificadores e as suas suites

- **Doc Guards** (`.agent/scripts/check-doc-versions.mjs` + `guards/*.mjs`): Guards que correm sem config — orcamento de bytes com **um tecto unico de 12 000 para tudo o que se le** (NOTE a 11 500): rules carregadas, rules de referencia, **workflows** e catalogos de definicoes. Orcamenta tambem o **contexto** carregado (`.agent/context/`: NOTE 36 000 / gate 48 000, derivado das regras de arquivamento do `process-rules.md`; as rules ficam fora desta soma porque tem dono proprio no primeiro orcamento). Mais: paridade `CLAUDE.md`≡`GEMINI.md`, workflows↔wrappers (existencia **e** conteudo do ponteiro), workflows listados em `CLAUDE`/`GEMINI`/`AGENTS`/`agent-guide`, `@imports` resolvem, sanidade do `.claude/settings.json` (deny de secrets, allow sem wildcards abertos), **placeholders esquecidos apos o bootstrap** (salta enquanto o bootstrap nao correu), **as Fronteiras copiadas nos ponteiros do Cursor e do Copilot** (copia forcada: nao esta verificado que esses tools sigam um ponteiro em markdown, logo o bloco esta la e o guard compara-o), versao `package.json`≡`CHANGELOG`, `.nvmrc`, termos obsoletos — mais versoes de deps (configuravel). Caminhos ancorados a raiz do repo (nao ao cwd) e **todo o skip e visivel**: um guard que nao corre imprime `SKIP`, nunca desaparece. Sai `!= 0` em warning (serve de gate). **Corre no CI** no job `guard-tests` — e nao no `quality`, que salta sem `package.json` e deixava estes guards testados mas nunca aplicados. Correr tambem antes de commit e apos Dependabot PRs.
- **Guard 16 — politica MCP** (`.agent/scripts/guards/mcp.mjs`): le a configuracao MCP **dos quatro agentes** (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` — chave `servers` —, `.gemini/settings.json`), quando existe, e reprova em segredo literal, em servidor sem linha em *Servidores aprovados* (`.agent/rules/mcp-policy.md`) e em JSON ilegivel (`AP2`). **`SKIP` visivel no template nu.** Verifica a configuracao, nao o comportamento — ver *why*. Testes: `tests-mcp.mjs`.
- **Guard 17 — tamanho de ficheiro** (`.agent/scripts/guards/sizes.mjs`): mede o flag das 500 linhas que `core-rules.md` declarava e ninguem media — nos `.mjs` de `.agent/scripts/` e `.claude/hooks/`, nao no codigo da app (esse e trabalho do `/review`). Ficheiro novo acima de 500 reprova. Os que ja estavam acima entram em `TETOS` com a contagem do dia: **nao sao isentos, sao catraca** — podem encolher, crescer reprova, e quando um desce ate ao limite o guard manda tirar a entrada. Testes: `tests-sizes.mjs`.
- **Bundle Size Checker** (`.agent/scripts/check-bundle-sizes.mjs`): mede o First Load JS por rota contra os `TARGETS`. **Prefere falhar a reportar um numero que nao mediu** — ficheiro do manifest ausente do disco, ou rota cujos chunks proprios nao resolvem, saem `!= 0` em vez de imprimir `[OK]`. Limite conhecido no cabecalho: as rotas do App Router nao estao no `build-manifest.json`, e o varrimento de diretorio nao cobre route groups. Testes: `test-bundle-sizes.mjs`.
- **Modulos de guard** (`.agent/scripts/guards/*.mjs`): guards extraidos do ficheiro de entrada quando ele passa o flag das 500 linhas — `budgets` (serie 1: **quatro** orcamentos — 1 carregadas, 1b referencia, 1c contexto, 1e workflows/catalogos — mais 1d, a copia das Fronteiras), `settings` (11), `versions` (3 + deps), `derived-counts` (12/12c/12d/12e), `placeholders` (13), `anti-patterns` (15), `mcp` (16), `sizes` (17). Cada um leva a sua entrada em `PARES`; os testes vivem no `test-guards.mjs`, diretamente ou por um `tests-*.mjs` que ele descobre em disco. O `test-test-surface.mjs` segue o mesmo desenho: harness em `test-surface-harness.mjs`, marcas em `tests-surface-marks.mjs`, tabelas de padroes em `surface-patterns.mjs`. **Porque cada um esta onde esta — e porque o `surface-patterns.mjs` nao pode chamar-se `check-*` — esta no cabecalho de cada ficheiro.** Duas consequencias que se veem de fora: uma extracao **nao** fecha o gate da superficie (ele compara o TOTAL, e uma descida com o total intacto sai `NOTE`), e esvaziar as tabelas de padroes reprova por um invariante escrito a mao — as contagens usam as tabelas actuais, logo esvazia-las desligava a propria contagem que as vigiava.
- **Suites de testes negativos** (`test-guards.mjs`, `test-bundle-sizes.mjs`, `test-backlog.mjs`, `test-mutation-sweep.mjs`, `test-test-surface.mjs`, `test-registo.mjs`, `test-simulate-derived.mjs`, `test-commit-msg.mjs` e `.claude/hooks/tests/test-hooks.mjs`): uma por verificador — quebram o que ele promete verificar e afirmam que avisa e sai `!= 0`. Correm **sempre** no job `guard-tests` do CI (nao estao condicionadas ao `package.json`) e uma suite vermelha **reprova o job**. Sem dependencias nem `package.json`. Correr apos qualquer alteracao a um `check-*.mjs`: um guard que passa quando devia falhar produz confianca infundada.
- **Backlog Checker** (`.agent/scripts/check-backlog.mjs`): Trata os contadores do Resumo e a barra de progresso do backlog como dados derivados — recalcula-os a partir das tabelas (items abertos em `backlog.md` + fechados em `backlog-archive.md`) e avisa se divergirem; deteta tambem IDs duplicados. Caminhos ancorados a raiz do repo (nao ao cwd) e **ficheiro ausente reprova** — um gate que nao consegue validar nao pode sair `0`. Correr antes de commit; **corre no CI** no job `guard-tests`.
- **Test Surface Checker** (`.agent/scripts/check-test-surface.mjs`): responde a "a superficie de teste foi enfraquecida desde a baseline?" — testes apagados, `skip`/`only` acrescentados, ou a **configuracao do runner** estreitada (que remove falhas sem tocar num teste). Compara **contagens** entre as duas versoes, nao linhas do diff. Sai `!= 0` tambem quando **nao consegue medir**. Ver `AP4`.
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

## Porque este ficheiro nao tem os hooks

Um catalogo cresce com o numero de pecas, e este cresceu tres vezes numa so sessao ate ao
limiar do Guard 1b — cortar prosa adiava, nao resolvia. A divisao segue a fronteira que este
ficheiro ja desenhava na seccao acima: **os verificadores sao universais** (so precisam de
`node`, correm em qualquer agente e no CI) e **os hooks sao so-Claude-Code**. Quem mexe num
raramente mexe no outro.
