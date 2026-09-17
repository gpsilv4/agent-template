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
| `.agent/scripts/**/*.mjs` (inclui `guards/`, **excepto `config/`**) | Copia limpa, **preservando** as constantes deste projeto que ainda vivem dentro da logica: `BANNED` em `check-doc-versions.mjs`, `CHECKS` em **`guards/versions.mjs`** (mudou de ficheiro quando os guards foram divididos, e um glob `*.mjs` sem `**` nao o apanha), `TEST_GLOBS` e `CONFIG_GLOBS` em `check-test-surface.mjs`, e `CONTAGENS` em `surface-patterns.mjs`. Substituir os placeholders | Os verificadores sao genericos; so a configuracao e do projeto. Sao as que o `BOOTSTRAP.md` §2.4 manda adaptar a stack: uma copia cega devolve o gate a **medir zero**, e ele passa a dizer "superficie intacta" sobre uma suite apagada. `TARGETS` e `ALVOS_REPROVAM` **sairam desta lista** — vivem em `config/`, que a linha de cima ja cobre |
| `.agent/rules/` com conteudo de dominio (`business-logic`, `pages-architecture`) | **Nunca copiar.** Sao 100% deste projeto | Foram gerados no bootstrap a partir das respostas |
| `.agent/rules/anti-patterns*.md` (os DOIS) | `anti-patterns-template.md`: **substituir por inteiro, placeholders incluidos** (senao o Guard 13 reprova) — e do template, e os `TPn` sao iguais em todos os projetos. `anti-patterns.md`: as **entradas** nunca se tocam (sao os `APn` deste projeto), mas o **cabecalho** e prosa do template e traz-se: o antigo cita IDs que ja nao existem, e o Guard 15 lista-os. As citacoes `TPn` nos scripts e workflows **copiam-se como estao** | Os prefixos tornam isto copia em vez de reescrita a mao (eram mais de vinte citacoes por ronda) |
| `.agent/rules/` de processo (`core-rules`, `process-rules`, `sync-docs`, `ticket-method`) | **Diff obrigatorio.** Se o projeto nao as customizou, copia; se customizou, integrar a mao | Misturam regra generica com decisoes do projeto |
| `.agent/workflows/*` + os dois wrappers | Copia se nao customizados; diff se sim. Ao **acrescentar** um workflow, propagar como manda a matriz (wrappers + tabelas) | Os wrappers sao ponteiros finos; a logica esta no workflow |
| Pontos de entrada (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/*.mdc`) | Diff. Preservar a stack e a descricao do projeto; trazer estrutura e tabelas | Cabecalho e do projeto, corpo e do template |
| `.github/workflows/*` | **So os jobs em falta** (ex: `guard-tests`). Nao substituir o CI do projeto | O CI do projeto pode ter passos proprios |
| `.claude/settings.json` | Trazer regras de `deny`/`ask` novas; **acrescentar** ao `allow` os scripts novos | O `allow` do projeto reflete o que ele corre |
| `.claude/agents/*` | Copia se ausentes. **Sao load-bearing**: a Fase 4 exige o `code-reviewer`, e a Fase 0 de um `L` o `plan-auditor` | Sem eles essas fases nao correm no Claude Code |
| `.claude/hooks/*` + a chave `hooks` do `settings.json` | Copia se ausentes, **e adaptar** `PROTEGIDOS` (branches deste projeto) e os verbos que o projeto tenha acrescentado a `SEGUROS` no `guard-protected-branch`. O mapa caminho -> quem-o-verifica ja nao vive aqui: e `lib/mapa-suites.mjs`, e passa pela linha dos scripts. Trazer `.claude/hooks/tests/` **inteiro** — um hook sem testes bloqueia trabalho legitimo em silencio | **So-Claude Code.** A verificacao equivalente vive em `.agent/scripts/check-*.mjs`, que qualquer agente corre |
| `src/docs/agent-guide.md` | Diff. Um workflow novo **tem** de aparecer aqui — o Guard 9b reprova se faltar | Duplica a lista de workflows, e o guard verifica-a |
| `.github/` restante (`CODEOWNERS`, `ISSUE_TEMPLATE/`, `dependabot.yml`, `pull_request_template.md`) | Diff. O PR template deve espelhar o `/review` deste projeto | Governance: metade e do projeto |
| **Qualquer outro ficheiro versionado** (`README`, `CONTRIBUTING`, `SECURITY`, `LICENSE`, `.editorconfig`, `.nvmrc`, `.gitignore`, `BOOTSTRAP.md`, ...) | **Diff e decidir caso a caso** — nunca overwrite cego | As categorias acima tambem envelhecem; esta linha e a rede |

## 2b. Mudancas que REPROVAM um projeto que estava verde

Nem toda a melhoria e aditiva. Quando o template **aperta** um criterio, um projeto que passava
deixa de passar — e a leitura natural ("o upgrade partiu o meu CI") leva a desfaze-lo, que e o
contrario do que se quer. Estas nao se trazem em silencio: **dizem-se na Fase 0, com o numero
que cada uma custa neste projeto, medido ANTES de aplicar.**

| Classe | Como reconhecer | O que perguntar ao utilizador |
|--------|-----------------|-------------------------------|
| **Limiar apertado** | um numero desceu num guard (orcamento de bytes, tamanho de ficheiro, cobertura) | correr o guard NOVO contra o projeto ANTES de aplicar; apresentar a lista do que passa a reprovar e quanto falta a cada um |
| **Alcance alargado** | o guard passa a ler ficheiros que antes ignorava | dizer quais, e o que aparece neles hoje |
| **Verbo negado** | um hook passa a recusar algo que o projeto usa | listar os comandos do projeto que passariam a ser negados |
| **Verificacao nova sem dados** | um guard novo exige um ficheiro/seccao que o projeto nao tem | acrescentar o que falta, ou nao trazer o guard — nunca trazer e deixar vermelho |

**A lista deste upgrade nao se escreve aqui — mede-se:**

```bash
node .agent/scripts/simulate-upgrade.mjs   # FASE 1 = o que passa a reprovar, nomeado
```

Ele monta um derivado da ultima release, aplica o upgrade mecanico e imprime o que reprova.
Uma lista escrita a mao aqui envelhecia a cada release e ninguem a recalculava; esta e medida
contra a versao de onde SAIS. O historico das rondas anteriores vive em `src/docs/upgrade-why.md`.

> Um upgrade que deixa o projeto vermelho sem que ninguem tenha decidido isso e pior do que
> nao ter feito upgrade nenhum.

## 3. Verificar — e e aqui que o upgrade se prova

Depois de aplicar, correr **nesta ordem**:

```bash
node .agent/scripts/check-doc-versions.mjs     # paridade, orcamentos, placeholders
node .agent/scripts/check-backlog.mjs          # contadores do backlog
node .agent/scripts/test-guards.mjs            # e as outras suites test-*
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
