# /upgrade — Trazer melhorias do template para este projeto

Workflow para atualizar um projeto **derivado** com melhorias feitas no template de origem,
sem apagar o que e deste projeto.

> **E o inverso da Matriz de Propagacao** (`.agent/rules/sync-docs.md`). A matriz responde a
> _"acrescentei X, onde tem de ir"_; este workflow responde a _"o template ganhou X, o que
> trago"_. Por isso decide por **categoria de ficheiro**, e nao por uma lista de nomes: uma
> lista envelhece a cada alteracao do template, uma categoria nao.

## 0. Fase 0 — mostrar e esperar

**Nada e copiado antes de aprovacao.** Este workflow toca em ficheiros que carregam o estado
e as decisoes do projeto; um `cp -R` mal apontado apaga trabalho que nao esta em mais sitio
nenhum. Apresentar sempre: o que se traz, o que se ignora, e o diff de tudo o que ja existe.

## 1. Descobrir de que ponto o projeto partiu

```bash
cat .agent/.template-version 2>/dev/null || echo "SEM MARCA"
```

> **E preciso um clone local do template.** Os comandos abaixo usam `git -C "$TPL"` ou
> `cd "$TPL"`, que exigem um **diretorio** — uma URL falha com `cannot change to '...'`. Se so
> tiveres a URL: `git clone <url> /tmp/tpl && TPL=/tmp/tpl`.

Isto decide o modo. Os dois sao validos; o segundo e o normal em projetos criados antes de a
marca existir.

### Modo A — com marca (`.agent/.template-version` existe)

O ficheiro traz o commit do template de onde este projeto nasceu (ou da ultima atualizacao).

```bash
TPL=<caminho-para-um-CLONE-LOCAL-do-template>
SHA=$(grep -oE '\b[0-9a-f]{7,40}\b' .agent/.template-version | head -1)
# Sem baseline NAO se faz diff — cai-se no Modo B em vez de comparar contra `HEAD` por acidente.
: "${SHA:?marca ilegivel — usar o Modo B}"
BR=$(git -C "$TPL" symbolic-ref --short HEAD)
git -C "$TPL" log --oneline "$SHA".."$BR"          # o que mudou desde entao
git -C "$TPL" diff --stat "$SHA".."$BR"            # e em que ficheiros
```

Trabalhar **so** sobre esses ficheiros. E o modo preciso: nao propoe nada que o projeto ja
tenha.

### Modo B — sem marca (nao se sabe o ponto de partida)

**Nao fazer diff contra o template.** Sem baseline, o diff marca tudo como novo — incluindo o
que o projeto ja tem e possivelmente customizou — e a proposta fica inutil ou destrutiva.

Em vez disso, **detetar capacidades**: por cada coisa que o template tem, verificar se este
projeto a tem, e so entao propor. Perguntas em vez de diffs:

```bash
TPL=<caminho-para-um-CLONE-LOCAL-do-template>
# 1. Que ficheiros o template tem que este projeto nao tem?
(cd "$TPL" && git ls-files) | while read -r f; do [ -e "$f" ] || echo "AUSENTE: $f"; done
# 2. Que scripts de verificacao existem em cada lado?
ls .agent/scripts/ ; ls "$TPL/.agent/scripts/"
# 3. Que workflows existem em cada lado?
ls .agent/workflows/ ; ls "$TPL/.agent/workflows/"
```

O que esta **ausente** e candidato a copia. O que existe nos dois vai para a tabela da secao
2 e decide-se por categoria — nunca por overwrite cego.

## 2. Decidir por categoria, nao por ficheiro

> **Regra geral, antes da tabela.** Um ficheiro que o projeto **nao modificou** desde o
> bootstrap traz-se por inteiro: nao ha julgamento a fazer sobre uma copia intacta, e mante-la
> so a deixa a apodrecer. O "diff e decidir" da tabela aplica-se ao que ele **customizou**.
>
> Compara-se contra a versao do template **de onde o projeto saiu** (`.template-version`), com
> os placeholders ja substituidos — nao contra o template nu, ou tudo aparece customizado.
>
> Nao e detalhe — porque custa (`src/docs/upgrade-why.md`).

| Categoria | O que fazer | Porque |
|-----------|-------------|--------|
| `.agent/context/*`, `src/docs/CHANGELOG.md` | **NUNCA tocar** | E o estado e a historia deste projeto. Nao existem em mais sitio nenhum |
| **`.agent/scripts/config/**`** | **NUNCA substituir; copiar se AUSENTE** (mesma regra dos hooks) | E a configuracao deste projeto. **Ausente nao e o mesmo que teu**: quem vem de uma versao anterior a esta pasta nao a tem, e a logica nova importa-a — ver `upgrade-why.md` |
| `.agent/scripts/**/*.mjs` (inclui `guards/`, **excepto `config/`**) | Copia limpa, **preservando** as constantes que `CONSTANTES_DO_PROJETO` (`lib/upgrade-mecanico.mjs`) nomeia. Substituir os placeholders | Os verificadores sao genericos; so a configuracao e do projeto. Uma copia cega devolve o gate a **medir zero**, e ele diz "superficie intacta" sobre uma suite apagada |
| **Ficheiros que SAIRAM do template** | **Propor apagar**, com aprovacao | O upgrade copia e **nunca apaga**: um renomeado fica ao lado do novo e a descoberta exige-lhe par. So entra o que **estava na tag** — o do projeto nunca esteve. Ver `upgrade-why.md` |
| `.agent/rules/` com conteudo de dominio (`business-logic`, `pages-architecture`) | **Nunca copiar.** Sao 100% deste projeto | Foram gerados no bootstrap a partir das respostas |
| `.agent/rules/anti-patterns*.md` (os DOIS) | `anti-patterns-template.md`: **substituir por inteiro, placeholders incluidos** (senao o Guard 13 reprova) — e do template, e os `TPn` sao iguais em todos os projetos. `anti-patterns.md`: as **entradas** nunca se tocam (sao os `APn` deste projeto), mas o **cabecalho** e prosa do template e traz-se: o antigo cita IDs que ja nao existem, e o Guard 15 lista-os. As citacoes `TPn` nos scripts e workflows **copiam-se como estao** | Os prefixos tornam isto copia em vez de reescrita a mao (eram mais de vinte citacoes por ronda) |
| `.agent/rules/` de processo (`core-rules`, `process-rules`, `sync-docs`, `ticket-method`) | **Diff obrigatorio.** Nao customizadas, copia; customizadas, integrar a mao | Misturam regra generica com decisoes do projeto |
| `.agent/workflows/*` + os dois wrappers | Copia se nao customizados; diff se sim. Ao **acrescentar** um workflow, propagar como manda a matriz (wrappers + tabelas) | Os wrappers sao ponteiros finos; a logica esta no workflow |
| Pontos de entrada (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `copilot-instructions.md`, `.cursor/rules/*.mdc`) | Diff. Preservar a stack e a descricao; trazer estrutura e tabelas | Cabecalho e do projeto, corpo e do template |
| `.github/workflows/*` | **So os jobs em falta** (ex: `guard-tests`). Nao substituir o CI do projeto | O CI do projeto pode ter passos proprios |
| `.claude/settings.json` | Trazer regras de `deny`/`ask` novas; **acrescentar** ao `allow` os scripts novos | O `allow` do projeto reflete o que ele corre |
| `.claude/agents/*` | Copia se ausentes. **Load-bearing**: a Fase 4 exige o `code-reviewer` e a Fase 0 de um `L` o `plan-auditor` | Sem eles essas fases nao correm no Claude Code |
| `.claude/hooks/*` + a chave `hooks` do `settings.json` | Copia se ausentes, **e adaptar** `PROTEGIDOS` (branches deste projeto) e os verbos que o projeto tenha acrescentado a `SEGUROS` no `guard-protected-branch`. Trazer `.claude/hooks/tests/` **inteiro** — um hook sem testes bloqueia trabalho legitimo em silencio | **So-Claude Code**, e o `CLAUDE.md` diz o que isso custa |
| `src/docs/agent-guide.md` | Diff. Um workflow novo **tem** de aparecer aqui — o Guard 9b reprova se faltar | Duplica a lista de workflows, e o guard verifica-a |
| `.github/` restante (`CODEOWNERS`, `ISSUE_TEMPLATE/`, `dependabot.yml`, `pull_request_template.md`) | Diff. O PR template espelha o `/review` deste projeto | Governance: metade e do projeto |
| **Qualquer outro ficheiro versionado** (`README`, `CONTRIBUTING`, `SECURITY`, `LICENSE`, `.editorconfig`, `.nvmrc`, `.gitignore`, `BOOTSTRAP.md`, ...) | **Diff e decidir caso a caso** — nunca overwrite cego | As categorias acima tambem envelhecem; esta linha e a rede |

## 2b. Mudancas que REPROVAM um projeto que estava verde

Nem toda a melhoria e aditiva: quando o template **aperta** um criterio, um projeto que passava
deixa de passar. Nao se trazem em silencio — **dizem-se na Fase 0, com o numero que cada uma custa
neste projeto, medido ANTES de aplicar** (porque, em `upgrade-why.md`).

A taxonomia serve para **reconhecer** uma destas, e para as fazer a mao no Modo B. A lista em si
nao se escreve: mede-se, logo abaixo.

| Classe | Como reconhecer | A decisao |
|--------|-----------------|-----------|
| **Limiar apertado** | um numero desceu num guard (bytes, tamanho, cobertura) | encolher ate caber, ou congelar em catraca |
| **Alcance alargado** | o guard le ficheiros que antes ignorava | dizer quais, e o que aparece neles hoje |
| **Verbo negado** | um hook recusa algo que o projeto usa | listar esses comandos antes de trazer o hook |
| **Verificacao nova sem dados** | um guard novo exige algo que o projeto nao tem | acrescentar o que falta, ou nao trazer o guard — **nunca** trazer e deixar vermelho |

```bash
node "$TPL/.agent/scripts/simulate-upgrade.mjs" --projeto="$PWD"
```

Corre-se **do clone do template** (`$TPL`, o da secao 1) apontado a este projeto, e nao ao
contrario: a copia daqui e a antiga e nao conhece o modo (porque, em `upgrade-why.md`). Sai: o que **passa** a reprovar aqui
(o que ja estava vermelho e subtraido), o que **saiu** do template com a marca migracao/limpeza,
e o que sobra **depois** das adaptacoes mecanicas — essa ultima e a que precisa de decisao.

> Corre sobre uma copia em `tmpdir`: **nao toca neste projeto**. Sai `0` mesmo com lista cheia —
> uma lista cheia e o output desta secao, nao uma reprovacao. So a impossibilidade de medir sai
> `!= 0`, e ai diz porque. Sem `.agent/.template-version` utilizavel recusa-se, e bem: e o **Modo
> B**, julgamento e nao mecanica, e ai a lista faz-se a mao com a tabela acima. Sem argumentos,
> do lado do template, mede o mesmo contra a ultima tag — e o que o CI corre.

> Um upgrade que deixa o projeto vermelho sem que ninguem tenha decidido isso e pior do que
> nao ter feito upgrade nenhum.

## 3. Verificar — e e aqui que o upgrade se prova

Depois de aplicar, correr **nesta ordem**:

```bash
node .agent/scripts/check-doc-versions.mjs     # paridade, orcamentos, placeholders
node .agent/scripts/check-backlog.mjs          # contadores do backlog
node .agent/scripts/tests/test-guards.mjs            # e as outras suites test-*
node .agent/scripts/mutation-sweep.mjs         # custa minutos; e o que interessa
```

Ler com atencao dois resultados da varredura:

- **`SEM SUITE`** para um verificador deste projeto -> esse guard nao tem testes. Nao
  silenciar: escrever a suite. Um verificador nao verificado da a aparencia de confianca.
- **`ALVO AUSENTE`** -> um verificador foi renomeado ou removido sem atualizar o `PARES`.

Correr tambem **de uma subpasta** (`cd src && node ../.agent/scripts/...`): o resultado tem de
ser identico. E, se alguem no projeto trabalha em Windows, confirmar num clone com CRLF.

## 4. Gravar o novo ponto de partida

```bash
TPL=<caminho-para-um-CLONE-LOCAL-do-template>
# `--verify ...^{commit}` e obrigatorio: sem ele, `rev-parse main` num template cujo branch
# principal se chame `master` IMPRIME a palavra "main" e grava uma marca invalida. O upgrade
# seguinte extrai um SHA vazio, o `git log ""..main` vira `HEAD..main` (vazio) e o workflow
# reporta "nada a trazer" — falha silenciosa, na direcao perigosa.
BR=$(git -C "$TPL" symbolic-ref --short HEAD)                # nao assumir `main`
SHA=$(git -C "$TPL" rev-parse --verify "$BR^{commit}") || { echo "FALHOU: sem commit em $BR"; exit 1; }
printf 'template: %s\ncommit: %s\ndata: %s\n' \
  "$(git -C "$TPL" remote get-url origin 2>/dev/null || echo "$TPL")" \
  "$SHA" "$(date +%F)" > .agent/.template-version
```

Sem isto, o proximo `/upgrade` cai outra vez no Modo B. **E o unico passo que torna o
proximo upgrade barato**, e e o que faltava a este.

## 5. Relatorio (Fase 5) e so depois o commit

O relatorio diz o que foi trazido **por categoria**, o que foi deliberadamente ignorado e
porque, os conflitos que exigiram integracao a mao, e o resultado dos verificadores da secao
3 — incluindo qualquer `SEM SUITE` que tenha aparecido, que e um ticket e nao um detalhe.
