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

Isto decide o modo. Os dois sao validos; o segundo e o normal em projetos criados antes de a
marca existir.

### Modo A — com marca (`.agent/.template-version` existe)

O ficheiro traz o commit do template de onde este projeto nasceu (ou da ultima atualizacao).

```bash
TPL=<caminho-ou-url-do-template>
SHA=$(grep -oE '\b[0-9a-f]{7,40}\b' .agent/.template-version | head -1)
git -C "$TPL" log --oneline "$SHA"..main          # o que mudou desde entao
git -C "$TPL" diff --stat "$SHA"..main            # e em que ficheiros
```

Trabalhar **so** sobre esses ficheiros. E o modo preciso: nao propoe nada que o projeto ja
tenha.

### Modo B — sem marca (nao se sabe o ponto de partida)

**Nao fazer diff contra o template.** Sem baseline, o diff marca tudo como novo — incluindo o
que o projeto ja tem e possivelmente customizou — e a proposta fica inutil ou destrutiva.

Em vez disso, **detetar capacidades**: por cada coisa que o template tem, verificar se este
projeto a tem, e so entao propor. Perguntas em vez de diffs:

```bash
TPL=<caminho-ou-url-do-template>
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

| Categoria | O que fazer | Porque |
|-----------|-------------|--------|
| `.agent/context/*`, `src/docs/CHANGELOG.md` | **NUNCA tocar** | E o estado e a historia deste projeto. Nao existem em mais sitio nenhum |
| `.agent/scripts/*.mjs` | Copia limpa, **preservando** as constantes de configuracao deste projeto (`TARGETS` no bundle checker, `CHECKS` e `BANNED` nos doc guards) e substituindo os placeholders | Os verificadores sao genericos; so a configuracao e do projeto |
| `.agent/rules/` com conteudo de dominio (`business-logic`, `pages-architecture`) | **Nunca copiar.** Sao 100% deste projeto | Foram gerados no bootstrap a partir das respostas |
| `.agent/rules/` acumuladas (`anti-patterns`) | **Acrescentar** entradas novas; nunca substituir o ficheiro | O projeto tem anti-padroes proprios, derivados dos seus bugs |
| `.agent/rules/` de processo (`core-rules`, `process-rules`, `sync-docs`, `ticket-method`) | **Diff obrigatorio.** Se o projeto nao as customizou, copia; se customizou, integrar a mao | Misturam regra generica com decisoes do projeto |
| `.agent/workflows/*` + os dois wrappers | Copia se nao customizados; diff se sim. Ao **acrescentar** um workflow, propagar como manda a matriz (wrappers + tabelas) | Os wrappers sao ponteiros finos; a logica esta no workflow |
| Pontos de entrada (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/*.mdc`) | Diff. Preservar a stack e a descricao do projeto; trazer estrutura e tabelas | Cabecalho e do projeto, corpo e do template |
| `.github/workflows/*` | **So os jobs em falta** (ex: `guard-tests`). Nao substituir o CI do projeto | O CI do projeto pode ter passos proprios |
| `.claude/settings.json` | Trazer regras de `deny`/`ask` novas; **acrescentar** ao `allow` os scripts novos | O `allow` do projeto reflete o que ele corre |

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
TPL=<caminho-ou-url-do-template>
printf 'template: %s\ncommit: %s\ndata: %s\n' \
  "$(git -C "$TPL" remote get-url origin 2>/dev/null || echo "$TPL")" \
  "$(git -C "$TPL" rev-parse main)" \
  "$(date +%F)" > .agent/.template-version
```

Sem isto, o proximo `/upgrade` cai outra vez no Modo B. **E o unico passo que torna o
proximo upgrade barato**, e e o que faltava a este.

## 5. Relatorio (Fase 5) e so depois o commit

O relatorio diz o que foi trazido **por categoria**, o que foi deliberadamente ignorado e
porque, os conflitos que exigiram integracao a mao, e o resultado dos verificadores da secao
3 — incluindo qualquer `SEM SUITE` que tenha aparecido, que e um ticket e nao um detalhe.
