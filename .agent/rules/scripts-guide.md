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

> **A suite de cada peca deriva do nome**: um `check-*` tem o seu `tests/test-*`, e um modulo de
> `guards/` tem o seu `tests/tests-*`. E uma regra, nao um inventario.
>
> **Onde vive o que** (arvore no `README.md`): a raiz tem os **7 pontos de entrada** — o que se
> invoca — e **`tests/`** tudo o que os testa, com os construtores de fixture em
> `tests/harness/`. A pasta existe porque `test-*` (entry point) e `tests-*` (modulo descoberto)
> diferiam de **um carater**, e a maquinaria aplica a distincao.

- **Doc Guards** (`check-doc-versions.mjs` + `guards/*.mjs`): 27 guards numerados que correm **sem configuracao** — orcamentos de bytes, paridade entre os pontos de entrada, `@imports` que resolvem, placeholders esquecidos, tamanho de ficheiro, isolamento das suites, citacoes de ficheiro, politica MCP, versoes. Caminhos ancorados a raiz do repo e **todo o skip e visivel**: um guard que nao corre imprime `SKIP`, nunca desaparece. Sai `!= 0` em warning (serve de gate) e **corre no CI** no job `guard-tests`, nao no `quality`. O que cada um mede esta no seu cabecalho; o porque, em `src/docs/scripts-guide-why.md`.
- **Guard 16 — politica MCP** (`.agent/scripts/guards/mcp.mjs`): le a configuracao MCP **dos quatro agentes** (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` — chave `servers` —, `.gemini/settings.json`), quando existe, e reprova em segredo literal, em servidor sem linha em *Servidores aprovados* (`.agent/rules/mcp-policy.md`) e em JSON ilegivel (`TP2`). **`SKIP` visivel no template nu.** Verifica a configuracao, nao o comportamento — ver *why*.
- **Guard 17 — tamanho de ficheiro** (`guards/sizes.mjs`): o flag das 500 linhas, nos `.mjs` da maquinaria (nao no codigo da app — esse e trabalho do `/review`). Os que ja estavam acima entram em `TETOS`: **nao sao isentos, sao catraca** — so encolhem, e quando um desce ate ao limite o guard manda tirar a entrada.
- **`lib/patch.mjs`** — patch de texto com TRES resultados: `aplicado`, `ja-estava` (o valor ja era o desejado — **nao e erro**) e `sem-alvo` (o ficheiro mudou de forma). Colapsar os dois ultimos num `if (depois === texto) fatal(...)` ja custou tres vezes; ver o cabecalho do modulo.
- **Medicao da seccao 2b** (`lib/medida-upgrade.mjs`): responde a *o que e que este upgrade faz reprovar?* dos **dois** lados. No template, `simulate-upgrade.mjs` sem argumentos (baseline = a ultima tag). Num consumidor, `--projeto=<caminho>` corrido **do clone do template** — a copia que o projeto tem e a antiga, e um flag do lado dele so serviria no upgrade seguinte. Mede o antes e o depois e reporta a **diferenca**: o que ja estava vermelho nao se imputa ao upgrade. Corre sobre uma copia; **nao toca no projeto**.
- **`lib/tmp-limpo.mjs`** — as copias em `tmpdir` limpam-se no **arranque** e nao a saida (um `SIGKILL` nao se apanha), e so as que ja nao tem dono vivo: duas corridas em paralelo acontecem. O porque esta no cabecalho.
- **`lib/derivado.mjs`** — "template ou derivado?", por dois sinais (a marca, ou a ausencia do `BOOTSTRAP.md`). Decide o Guard 13 e os **dois** simuladores: num derivado dao `SKIP` visivel, e o do `/upgrade` aponta dali para o modo que mede.
- **O que SAIU do template** (`lib/upgrade-mecanico.mjs`): o upgrade copia e **nunca apaga**, logo um ficheiro renomeado ficava no consumidor ao lado do novo. O motor lista os que **estavam na tag**, **ja nao estao no template** e **ainda existem no consumidor** — as tres juntas impedem propor apagar trabalho do projeto. **Lista, nao apaga.**
- **Detector de codigo morto** (`check-codigo-morto.mjs`): imports que ninguem usa. Conta ocorrencias sobre **codigo**, nao texto — um nome so num comentario ou numa string nao e uso, e `${nome}` numa template string **e**. Sem dependencias (o `eslint` quebrava a regra dos verificadores so precisarem de `node`). So olha para imports; funcoes internas e exportacoes por usar ficam de fora, e o cabecalho di-lo.
- **Guard 20 — citacoes de ficheiro** (`guards/citacoes.mjs`): um ficheiro citado numa rule ou workflow **existe** e e **um so**. Estreito de proposito: citar sem a pasta **nao** e defeito — o porque esta no cabecalho.
- **Guard 19 — isolamento das suites** (`guards/isolamento.mjs`): o que torna a varredura **paralela** segura — tmpdir proprio (`mkdtempSync`, nunca caminho fixo), zero portas, zero escrita em `process.env`. Verificacao ESTATICA; o limite e o porque estao no cabecalho do modulo.
- **Bundle Size Checker** (`.agent/scripts/check-bundle-sizes.mjs`): mede o First Load JS por rota contra os `TARGETS` de **`.agent/scripts/config/bundles.mjs`** — rotas, orcamentos e o interruptor `ALVOS_REPROVAM` vivem la; aqui so a logica. O que o `/upgrade` faz a cada um esta na tabela dele. **Prefere falhar a reportar um numero que nao mediu** — ficheiro do manifest ausente do disco, ou rota cujos chunks proprios nao resolvem, saem `!= 0` em vez de imprimir `[OK]`. Limites conhecidos no cabecalho.
- **Modulos de guard** (`.agent/scripts/guards/*.mjs`): guards extraidos do ficheiro de entrada quando ele passa o flag das 500 linhas — `budgets` (serie 1: **quatro** orcamentos — 1 carregadas, 1b referencia, 1c contexto, 1e workflows/catalogos — mais 1d, a copia das Fronteiras), `settings` (11), `versions` (3 + deps), `derived-counts` (12/12c/12d/12e), `placeholders` (13), `anti-patterns` (15), `mcp` (16), `sizes` (17). Cada um leva a sua entrada em `PARES`; os testes vivem no `test-guards.mjs`, diretamente ou por um `tests-*.mjs` que ele descobre em disco. O `test-test-surface.mjs` segue o mesmo desenho, com o harness em `tests/harness/` e as tabelas de padroes em `lib/surface-patterns.mjs`. **Porque cada um esta onde esta esta no cabecalho de cada ficheiro.** Duas consequencias visiveis de fora: uma extraccao **nao** fecha o gate da superficie (ele compara o TOTAL), e esvaziar as tabelas de padroes reprova — ver `scripts-guide-why.md`.
- **Suites de testes negativos** (as do job `guard-tests` do `ci.yml`, que e a lista — escrita aqui envelhecia, e ja lhe faltava uma): uma por verificador — quebram o que ele promete verificar e afirmam que avisa e sai `!= 0`. Correm **sempre** no job `guard-tests` do CI (nao estao condicionadas ao `package.json`) e uma suite vermelha **reprova o job**. Sem dependencias nem `package.json`. Correr apos qualquer alteracao a um `check-*.mjs`: um guard que passa quando devia falhar produz confianca infundada.
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
