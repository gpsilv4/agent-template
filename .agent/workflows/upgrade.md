# /upgrade — Trazer melhorias do template para este projeto

> **Quando usar:** num derivado · **Quando NAO usar:** no proprio template (#246).

Atualiza um **derivado** com o template de origem, sem apagar o que e dele.

> **E o inverso da Matriz de Propagacao** (`.agent/rules/propagation.md`): _"o template ganhou X,
> o que trago"_. Decide por **categoria de ficheiro**, nao por uma lista de nomes, que envelhece.

## 0. Fase 0 — mostrar e esperar

**Nada e copiado antes de aprovacao.** Um `cp -R` mal apontado apaga o que so existe aqui.
Mostrar: o que se traz, o que se ignora, e o diff do que ja existe. Repo **privado**: ver
`src/docs/upgrade-derivados-privados.md`.

## 1. Descobrir de que ponto o projeto partiu

```bash
cat .agent/.template-version 2>/dev/null || echo "SEM MARCA"
```

> **`$TPL` e um clone limpo numa TAG** (#490; o resto recusa) fora do `TMPDIR`: `git clone -q --branch <tag> <url> ~/.cache/agent-template/<tag>` (a ultima: `git ls-remote --tags --refs --sort=-v:refname <url> 'v*'`). Num sandbox: no `TMPDIR`, a 2b com `--fronteira-em`.

Isto decide o modo. **Sem a maquinaria** (`modo: parcial` na marca; sem `modo:` nem o job `guard-tests`, propoe-se): o
**modo parcial**, variante do Modo A — `src/docs/upgrade-parcial.md`. No Modo B, esta pergunta vem primeiro.

### Modo A — com marca (`.agent/.template-version` existe)

A marca traz o commit do template de onde o projeto nasceu, ou da ultima atualizacao.

```bash
TPL=<caminho-para-um-CLONE-LOCAL-do-template>
SHA=$(grep -oE '\b[0-9a-f]{7,40}\b' .agent/.template-version | head -1)
# "Use this template": o commit e do PROJETO; resolve-se a versao no clone
V=$(sed -n 's/^versao: *\(v[^[:space:]]*\).*/\1/p' .agent/.template-version | head -1)
git -C "$TPL" cat-file -e "${SHA:-x}^{commit}" 2>/dev/null || SHA=$(git -C "$TPL" rev-parse -q --verify "${V:-x}^{commit}")
# Sem baseline NAO se faz diff: e o Modo B, e nao um diff contra `HEAD` por acidente.
: "${SHA:?marca ilegivel — usar o Modo B}"
T=$(git -C "$TPL" describe --exact-match --tags --match 'v[0-9]*' HEAD)
git -C "$TPL" log --oneline "$SHA".."${T:?sem tag v*}"   # o que mudou desde entao
git -C "$TPL" diff --stat "$SHA".."${T:?sem tag v*}"     # e em que ficheiros
```

Trabalhar **so** sobre esses ficheiros: o que o projeto tem e o template nao mudou fica de fora.

### Modo B — sem marca (nao se sabe o ponto de partida)

**Nao fazer diff contra o template.** Sem baseline, o diff marca tudo como novo, tambem o que o
projeto ja tem e customizou: a proposta fica inutil ou destrutiva.

Em vez disso, **detetar capacidades**: o que o template tem e este projeto nao, e so entao propor:

```bash
TPL=<caminho-para-um-CLONE-LOCAL-do-template>
# 0. ANTES de copiar: as linhas `[ -z` e `T=` da §4
# 1. Que ficheiros o template tem que este projeto nao tem?
(cd "$TPL" && git ls-files) | while read -r f; do [ -e "$f" ] || echo "AUSENTE: $f"; done
# 2. Os scripts de cada lado
ls .agent/scripts/ ; ls "$TPL/.agent/scripts/"
# 3. Os workflows de cada lado
ls .agent/workflows/ ; ls "$TPL/.agent/workflows/"
```

O que esta **ausente** e candidato a copia, **menos o que e so do template** (secao 2); na fronteira, pelo utilizador. O que
existe nos dois decide-se por categoria na tabela da secao 2, nunca por overwrite cego.

## 2. Decidir por categoria, nao por ficheiro

> **Regra geral, antes da tabela.** Um ficheiro que o projeto **nao modificou** desde o
> bootstrap traz-se por inteiro. Num **adotado**, as `colisoes` do `.agent/adocao.json` sao
> dele em TODAS as linhas: nunca se copiam nem se apagam. O "diff e decidir" da tabela aplica-se ao que ele **customizou**.
>
> Compara-se contra a versao do template **de onde o projeto saiu** (`.template-version`), com
> os placeholders ja substituidos — nao contra o template nu, ou tudo aparece customizado.

| Categoria | O que fazer | Porque |
|-----------|-------------|--------|
| `.agent/context/*`, `src/docs/CHANGELOG.md` | **NUNCA tocar** | O estado e a historia deste projeto, so existem aqui |
| **`.agent/scripts/config/**`** | **NUNCA substituir; copiar se AUSENTE** | A configuracao e os guards deste projeto. **Ausente nao e o mesmo que teu**: a logica nova importa-a (`upgrade-why.md`) |
| `.agent/scripts/**/*.mjs` (inclui `guards/`, **excepto `config/`**) e `.github/scripts/` (so os do template) | Copia limpa, **preservando** as constantes que `CONSTANTES_DO_PROJETO` (`lib/upgrade-categorias.mjs`) nomeia. Substituir os placeholders | Os verificadores sao genericos; so a configuracao e do projeto (`upgrade-why.md`) |
| **Ficheiros que SAIRAM do template** | **Propor apagar**, com aprovacao (os da fronteira: a 2b da o `rm`) | O upgrade **nunca apaga**: um renomeado fica ao lado do novo. So entra o que **estava na tag**: o do projeto nunca esteve. Ver `upgrade-why.md` |
| O que o git do `$TPL` **ignora**, e nomes de segredo | **Nunca copiar** | Nao e do template. A mao, so o que `git -C "$TPL" ls-files` lista (`upgrade-why.md`) |
| `.agent/rules/` com conteudo de dominio (`business-logic`, `pages-architecture`) | **Nunca copiar.** Sao 100% deste projeto | Gerados no bootstrap |
| `.agent/rules/anti-patterns*.md` (os DOIS) | `anti-patterns-template.md`: **substituir por inteiro**, placeholders incluidos (Guard 13). `anti-patterns.md`: as **entradas** (`APn`) nunca se tocam; o **cabecalho** intacto vem novo, customizado so a **regra duravel** (`upgrade-why.md`) | Os prefixos tornam isto copia |
| `.agent/rules/` de processo (`core-rules`, `process-rules`, `sync-docs`, `ticket-method`) | **Diff obrigatorio.** Nao customizadas, copia; customizadas, integrar a mao | Misturam regra generica com decisoes do projeto |
| `.agent/workflows/*` + os dois wrappers | Copia se nao customizados; diff se sim. Ao **acrescentar** um workflow, propagar como manda a matriz (wrappers + tabelas) | Pasta de wrappers ausente e opt-out (Guard 6): nao criar |
| Pontos de entrada (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `copilot-instructions.md`, `.cursor/rules/*.mdc`) | Diff. Preservar a stack e a descricao; trazer estrutura e tabelas | Cabecalho e do projeto, corpo e do template |
| **So do template**: os jobs `simulate-*`, `codeql.yml`, `.github/codeql/`, o `BOOTSTRAP.md` (o bootstrap apaga-o) | **Nunca copiar** (modo A ou B); apagar o que os cita nos trazidos (`$TPL/.agent/BOOTSTRAP.md` §2.7) | So servem o repo do template |
| `.github/workflows/*` | **So os jobs em falta**, contra o ficheiro do **TEMPLATE** (passo **comentado** = AUSENTE; **movido** ou **substituido**: o antigo sai). Workflow AUSENTE: inteiro. Nos passos que ja tem, as flags novas e o trailer `Test-Surface:`. A varredura, o `guard-gate` e o pacote de 1 job: `upgrade-why.md` § "A linha `.github/workflows/*`" | O CI tem passos do projeto |
| `.claude/settings.json` | **Do UTILIZADOR** (o `deny` proibe-o ao agente): o `deny`/`ask` em falta e o `allow` da maquinaria (2b lista; Guard 11 avisa), os hooks novos | O agente propoe o texto |
| `.claude/agents/*` | Como a fronteira (linha abaixo). Os customizados: o `tools:` novo por `Edit` (a 2b lista-os; o hook impoe-no). Exigidos: `code-reviewer` (Fase 4), `plan-auditor` (`L`) | So-Claude |
| `.claude/hooks/*`, `.githooks/*` | **Aprovados um a um pelo utilizador**: os comandos da 2b (o staging ja traz os placeholders e as constantes), ou `Edit`/`Write` com aprovacao, nunca `cp` do `$TPL`. Por `Edit` (e no Modo B): substituir os placeholders, manter `CONSTANTES_DO_PROJETO` e o `protegidos.json` | Fronteira (`upgrade-why.md`) |
| `src/docs/agent-guide.md` | Diff. Um workflow novo **tem** de aparecer aqui — o Guard 9b reprova se faltar | Duplica a lista de workflows, e o guard verifica-a |
| `.github/` restante (`CODEOWNERS`, `ISSUE_TEMPLATE/`, `dependabot.yml`, `pull_request_template.md`) | Diff. O PR template espelha o `/review` | Metade e do projeto |
| **Qualquer outro ficheiro versionado** (`README`, `CONTRIBUTING`, `SECURITY`, `LICENSE`, `.editorconfig`, `.nvmrc`, `.gitignore`, ...) | **Diff e decidir caso a caso**, nunca overwrite cego | As categorias acima tambem envelhecem; esta linha e a rede |

## 2b. Mudancas que REPROVAM um projeto que estava verde

Nem toda a melhoria e aditiva: quando o template **aperta** um criterio, um projeto que passava
deixa de passar. Nao se trazem em silencio — **dizem-se na Fase 0, com o numero que cada uma custa
neste projeto, medido ANTES de aplicar** (porque: `upgrade-why.md` § "Porque as mudancas que REPROVAM se anunciam antes de aplicar").

As classes que a reconhecem (limiar apertado, alcance alargado, verbo negado, verificacao nova sem dados) estao no `upgrade-why.md`; a lista mede-se:

```bash
node "$TPL/.agent/scripts/simulate-upgrade.mjs" --projeto="$PWD"
```

Corre-se **do clone do template** (`$TPL`) apontado a este projeto, e nao ao
contrario: a copia daqui e a antiga e nao conhece o modo (porque: `upgrade-why.md` § "Porque a medicao da 2b corre do lado do TEMPLATE, apontada ao projeto"). Sai: o que **saiu** do template, o que **passa**
a reprovar aqui (menos o que ja falhava), o que sobra **depois** das adaptacoes mecanicas (a decidir)
e, por ultimo, a **fronteira**. Fachada `"EsteProjeto"`: editar no staging antes do `cp`.

> Nao toca neste projeto, e sai `0` com lista cheia (`upgrade-why.md`). Sem `.agent/.template-version` recusa-se: e o **Modo B** (a mao, com a tabela). No parcial tambem recusa (sai != 0).

## 3. Verificar — e e aqui que o upgrade se prova

Depois de aplicar — **e de o utilizador aplicar a fronteira** (2b) —, correr **nesta ordem**:

```bash
node .agent/scripts/check-doc-versions.mjs     # paridade, orcamentos, placeholders
node .agent/scripts/check-backlog.mjs          # contadores do backlog
node .claude/hooks/tests/test-hooks.mjs        # so com a camada Claude
node .agent/scripts/tests/test-guards.mjs            # e as outras suites test-*
node .agent/scripts/mutation-sweep.mjs         # custa minutos; e o que interessa
git add -A && node .agent/scripts/check-test-surface.mjs   # `git add` ANTES: ele le `git ls-files`
```

E a 2b outra vez: a colocacao dos jobs so se ve depois de mexer no `ci.yml`.

Na varredura: **`SEM SUITE`** = um verificador deste projeto sem testes (escrever a suite, nao silenciar);
**`ALVO AUSENTE`** = um verificador renomeado ou removido sem atualizar o `PARES`.

Correr tambem **de uma subpasta** (`cd src && node ../.agent/scripts/...`): o mesmo resultado. Em
Windows, confirmar num clone com CRLF.

## 4. Gravar o novo ponto de partida

```bash
TPL=<caminho-para-um-CLONE-LOCAL-do-template>
# O `--verify ...^{commit}` e obrigatorio (porque: `upgrade-why.md` § "Porque o `--verify ...^{commit}` e obrigatorio ao gravar a marca").
[ -z "$(git -C "$TPL" status --porcelain --untracked-files=all)" ] || { echo "FALHOU: sujo"; exit 1; }
T=$(git -C "$TPL" describe --exact-match --tags --match 'v[0-9]*' HEAD) || { echo "FALHOU: sem tag"; exit 1; }
SHA=$(git -C "$TPL" rev-parse --verify "$T^{commit}") || { echo "FALHOU: sem commit em $T"; exit 1; }
M=$(grep -vE '^(template|commit|data|versao):' .agent/.template-version 2>/dev/null)  # o resto fica
printf 'commit: %s\ntemplate: %s\ndata: %s\n%s\n' "$SHA" \
  "$(git -C "$TPL" remote get-url origin 2>/dev/null || echo "$TPL")" "$(date +%F)" "$M" | grep . > .agent/.template-version
```

Sem isto, o proximo `/upgrade` cai no Modo B. So com a fronteira aplicada: senao o proximo ja nao lista o que dela saiu.

**E confirmar as definicoes de seguranca do GitHub**: ler com `gh api`, propor ligar o que falta e esperar o sim — `src/docs/github-security.md`.

## 5. Relatorio (Fase 5) e so depois o commit

O relatorio diz o que foi trazido **por categoria**, o que foi deliberadamente ignorado e
porque, os conflitos que exigiram integracao a mao, e o resultado dos verificadores da secao
3 — incluindo qualquer `SEM SUITE` que tenha aparecido, que e um ticket e nao um detalhe —, e a fronteira por aplicar, se ficou. Aplicada, **apagar o staging** (o caminho vem na 2b) e o clone da tag.
