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

> **Onde vive o que** (arvore no `README.md`): a raiz tem os **7 pontos de entrada** — o que se
> invoca — e **`tests/`** tudo o que os testa, com os construtores de fixture em
> `tests/harness/`. A pasta existe porque `test-*` (entry point) e `tests-*` (modulo descoberto)
> diferiam de **um carater**, e a maquinaria aplica a distincao.

- **Doc Guards** (`.agent/scripts/check-doc-versions.mjs` + `guards/*.mjs`): Guards que correm sem config — orcamento de bytes com **um tecto unico de 12 000 para tudo o que se le** (NOTE a 11 500): rules carregadas, rules de referencia, **workflows** e catalogos de definicoes. Orcamenta tambem o **contexto** carregado (`.agent/context/`: NOTE 36 000 / gate 48 000, derivado das regras de arquivamento do `process-rules.md`; as rules ficam fora desta soma porque tem dono proprio no primeiro orcamento). Mais: paridade `CLAUDE.md`≡`GEMINI.md`, workflows↔wrappers (existencia **e** conteudo do ponteiro), workflows listados em `CLAUDE`/`GEMINI`/`AGENTS`/`agent-guide`, `@imports` resolvem, sanidade do `.claude/settings.json` (deny de secrets, allow sem wildcards abertos), **placeholders esquecidos apos o bootstrap** (salta enquanto o bootstrap nao correu), **as Fronteiras copiadas nos ponteiros do Cursor e do Copilot** (copia forcada — ver *why*), versao `package.json`≡`CHANGELOG`, `.nvmrc`, termos obsoletos e versoes de deps (configuravel). Caminhos ancorados a raiz do repo e **todo o skip e visivel**: um guard que nao corre imprime `SKIP`. Sai `!= 0` em warning (serve de gate). **Corre no CI** no job `guard-tests`, nao no `quality` (ver *why*). Correr antes de commit e apos Dependabot PRs.
- **Guard 16 — politica MCP** (`.agent/scripts/guards/mcp.mjs`): le a configuracao MCP **dos quatro agentes** (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` — chave `servers` —, `.gemini/settings.json`), quando existe, e reprova em segredo literal, em servidor sem linha em *Servidores aprovados* (`.agent/rules/mcp-policy.md`) e em JSON ilegivel (`TP2`). **`SKIP` visivel no template nu.** Verifica a configuracao, nao o comportamento — ver *why*. Testes: `tests-mcp.mjs`.
- **Guard 17 — tamanho de ficheiro** (`guards/sizes.mjs`): o flag das 500 linhas, nos `.mjs` da maquinaria (nao no codigo da app — esse e trabalho do `/review`). Os que ja estavam acima entram em `TETOS`: **nao sao isentos, sao catraca** — so encolhem, e quando um desce ate ao limite o guard manda tirar a entrada. Testes: `tests-sizes.mjs`.
- **`lib/patch.mjs`** — patch de texto com TRES resultados: `aplicado`, `ja-estava` (o valor ja era o desejado — **nao e erro**) e `sem-alvo` (o ficheiro mudou de forma). Colapsar os dois ultimos num `if (depois === texto) fatal(...)` ja custou tres vezes; ver o cabecalho do modulo.
- **`lib/derivado.mjs`** — "template ou derivado?", por dois sinais (a marca, ou a ausencia do `BOOTSTRAP.md`). Decide o Guard 13 e os **dois** simuladores, que num derivado dao `SKIP` visivel.
- **O que SAIU do template** (`lib/upgrade-mecanico.mjs`): o upgrade copia e **nunca apaga**, logo um ficheiro renomeado ficava no consumidor ao lado do novo. O motor lista os que **estavam na tag**, **ja nao estao no template** e **ainda existem no consumidor** — as tres juntas impedem propor apagar trabalho do projeto. **Lista, nao apaga.**
- **Guard 20 — citacoes de ficheiro** (`guards/citacoes.mjs`): um ficheiro citado numa rule ou workflow **existe** e e **um so**. Estreito de proposito: citar sem a pasta **nao** e defeito — o porque esta no cabecalho. Testes: `tests-citacoes.mjs`.
- **Guard 19 — isolamento das suites** (`guards/isolamento.mjs`): o que torna a varredura **paralela** segura — tmpdir proprio (`mkdtempSync`, nunca caminho fixo), zero portas, zero escrita em `process.env`. Verificacao ESTATICA; o limite e o porque estao no cabecalho do modulo. Testes: `tests-isolamento.mjs`.
- **Bundle Size Checker** (`.agent/scripts/check-bundle-sizes.mjs`): mede o First Load JS por rota contra os `TARGETS` de **`.agent/scripts/config/bundles.mjs`** — a configuracao (rotas, orcamentos, e o interruptor `ALVOS_REPROVAM`) vive la e **o `/upgrade` nunca a substitui** (so a cria se faltar); aqui so mora a logica, que o upgrade substitui. **Prefere falhar a reportar um numero que nao mediu** — ficheiro do manifest ausente do disco, ou rota cujos chunks proprios nao resolvem, saem `!= 0` em vez de imprimir `[OK]`. Limite conhecido no cabecalho: as rotas do App Router nao estao no `build-manifest.json`, e o varrimento de diretorio nao cobre route groups. Testes: `test-bundle-sizes.mjs`.
- **Modulos de guard** (`.agent/scripts/guards/*.mjs`): guards extraidos do ficheiro de entrada quando ele passa o flag das 500 linhas — `budgets` (serie 1: **quatro** orcamentos — 1 carregadas, 1b referencia, 1c contexto, 1e workflows/catalogos — mais 1d, a copia das Fronteiras), `settings` (11), `versions` (3 + deps), `derived-counts` (12/12c/12d/12e), `placeholders` (13), `anti-patterns` (15), `mcp` (16), `sizes` (17). Cada um leva a sua entrada em `PARES`; os testes vivem no `test-guards.mjs`, diretamente ou por um `tests-*.mjs` que ele descobre em disco. O `test-test-surface.mjs` segue o mesmo desenho, com o harness em `tests/harness/` e as tabelas de padroes em `lib/surface-patterns.mjs`. **Porque cada um esta onde esta esta no cabecalho de cada ficheiro.** Duas consequencias visiveis de fora: uma extraccao **nao** fecha o gate da superficie (ele compara o TOTAL), e esvaziar as tabelas de padroes reprova — ver `scripts-guide-why.md`.
- **Suites de testes negativos** (`test-guards.mjs`, `test-bundle-sizes.mjs`, `test-backlog.mjs`, `test-mutation-sweep.mjs`, `test-test-surface.mjs`, `test-registo.mjs`, `test-mapa-suites.mjs`, `test-simulate-derived.mjs`, `test-simulate-upgrade.mjs`, `test-commit-msg.mjs` e `.claude/hooks/tests/test-hooks.mjs`): uma por verificador — quebram o que ele promete verificar e afirmam que avisa e sai `!= 0`. Correm **sempre** no job `guard-tests` do CI (nao estao condicionadas ao `package.json`) e uma suite vermelha **reprova o job**. Sem dependencias nem `package.json`. Correr apos qualquer alteracao a um `check-*.mjs`: um guard que passa quando devia falhar produz confianca infundada.
- **Backlog Checker** (`.agent/scripts/check-backlog.mjs`): Trata os contadores do Resumo e a barra de progresso do backlog como dados derivados — recalcula-os a partir das tabelas (items abertos em `backlog.md` + fechados em `backlog-archive.md`) e avisa se divergirem; deteta tambem IDs duplicados. Caminhos ancorados a raiz do repo (nao ao cwd) e **ficheiro ausente reprova** — um gate que nao consegue validar nao pode sair `0`. Correr antes de commit; **corre no CI** no job `guard-tests`.
- **Test Surface Checker** (`.agent/scripts/check-test-surface.mjs`): responde a "a superficie de teste foi enfraquecida desde a baseline?" — testes apagados, `skip`/`only` acrescentados, ou a **configuracao do runner** estreitada (que remove falhas sem tocar num teste). Compara **contagens** entre as duas versoes, nao linhas do diff. Sai `!= 0` tambem quando **nao consegue medir**. Ver `TP4`.
## Correr a varredura: `--diff` localmente, completa no CI

| Onde | O que correr | Porque |
|---|---|---|
| **Local, a trabalhar** | `node .agent/scripts/mutation-sweep.mjs --diff` | So os alvos que este branch tocou. Minutos em vez de dezenas deles |
| **Local, excepcao** | a completa, sem flags | **So** ao mexer no proprio `mutation-sweep.mjs` ou em `lib/mapa-suites.mjs`: usar o filtro para validar o filtro e circular |
| **CI** | a completa, sem flags | Nao muda. O CI e o **portao** — e nao ha troca a fazer: a varredura corre em paralelo e afirma exactamente o mesmo |

A varredura corre em **8 processos** (ou o numero de cores, o que for menor), cada um com a **sua
copia do repo**. `--workers=1` devolve o comportamento sequencial, para comparar um resultado sem
mudar mais nada. Medido nesta maquina: **58 min -> 14m04s (4,1x)**, com `diff` vazio contra o
sequencial. A copia por worker nao e detalhe: com uma copia partilhada mediram-se **12% de
veredictos errados**, todos a acusar cobertura que existe.

O `--diff` escolhe por **duas vias**: o ficheiro alterado **e** um alvo, ou leva a uma **suite**
(e ai varrem-se todos os alvos que a usam — e como mexer no `tests/harness/test-harness.mjs` seleciona os
alvos todos que dependem dele). Sem baseline resoluvel **reprova**; sem alvos, **lista** o que
nao casou regra nenhuma, para uma lacuna no mapa ficar visivel em vez de absorvida.

> **Porque esta regra esta escrita.** Sem ela, corre-se a completa por habito — a seguir a
> checklist — e o habito passa por decisao. Aconteceu no proprio PR que introduziu o `--diff`,
> e so se viu porque alguem perguntou "porque estas a correr a completa?".

> **Guard 18** (no mesmo modulo do 15): cada `TPn` do catalogo do template tem de ter a sua
> seccao em `src/docs/anti-patterns-why.md`. A outra direccao ja estava fechada — uma seccao
> orfa la e uma citacao morta para o Guard 15. **So os `TPn`**: um projeto derivado pode
> legitimamente nunca escrever um `-why`, e exigir-lho era impor-lhe uma pratica do template.

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
