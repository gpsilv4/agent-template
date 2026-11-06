# O `/upgrade` parcial: um derivado SEM a maquinaria do template

> **Nao carregado.** O `/upgrade` (`.agent/workflows/upgrade.md` §1) aponta para aqui quando o projeto nao traz a
> maquinaria: as suites `test-*`, a varredura de mutacao, os simuladores e o job `guard-tests`. E uma **variante do
> Modo A** (com marca). Sem marca e o Modo B, que faz esta pergunta primeiro (`upgrade.md` §1).
>
> Porque existe: um derivado privado sem a maquinaria pagava ~15 min de CI por PR com o CI do template, e ~3 com um CI
> de um job (medido a 1-2 nov 2026, #429). Nesse projeto, o `/upgrade` normal propunha trazer o que ele decidiu nao ter.

As seccoes estao pela ordem em que se fazem. A suite `test-modo-upgrade.mjs` verifica a ordem e a lista do §2.

## 1. A pergunta

**Este projeto traz a maquinaria do template?** A marca (`.agent/.template-version`) responde, na linha `modo:`. O
disco nao distingue "decidiu nao a trazer" de "perdeu-a por engano", e por isso so propoe:

| `modo:` na marca | job `guard-tests` no `ci.yml` | Modo |
|---|---|---|
| `parcial` | ausente | parcial |
| `parcial` | presente | **contradicao**: perguntar, e corrigir a marca ou o `ci.yml` |
| `completo` | presente | completo (o `upgrade.md` inteiro) |
| `completo` | ausente | **contradicao** |
| (nenhum) | presente | completo (o comportamento de sempre) |
| (nenhum) | ausente | parcial **proposto**: perguntar antes de o escrever |

Um job **comentado** conta como ausente. A regra vive em `.agent/scripts/lib/modo-upgrade.mjs`.

Com a resposta, escrever a linha na marca (`modo: parcial` ou `modo: completo`). O §4 do `upgrade.md` mantem-na nos
upgrades seguintes (reescreve `commit`/`template`/`data`, larga o `versao:` velho, e mantem o resto).

O `simulate-upgrade --projeto` nao mede um projeto parcial: lista o `deny`/`ask` do `settings.json` do template que o
projeto nao tem e os hooks que o template liga e ele nao (por evento e matcher; #454), diz se o projeto nao tem o
`settings.json`, explica e sai != 0 (um 0 que nao mediu nada era um portao a passar sobre nada). No projeto, as tres
verificacoes a mao do §3 substituem o resto.

## 2. O que vem

Vem a **fronteira** e o que ela le, e mais nada da maquinaria. A lista abaixo e o fecho dos `import` e dos caminhos que
esses ficheiros leem: a suite `test-modo-upgrade.mjs` calcula-o no template e reprova se algum faltar aqui.

<!-- fecho:inicio -->
- `.claude/hooks/`: a arvore inteira (os hooks, `lib/`, `tests/`). O `protegidos.json` e do PROJETO: so se copia se
  estiver ausente.
- `.claude/agents/`: os do projeto ficam; os do template oferecem-se um a um. Sem a pasta, o `guard-subagent-bash`
  cai no `catch` e sai 0, e a restricao dos subagentes desaparece calada.
- `.githooks/`: o `commit-msg` e o `lib/`.
- `CONTRIBUTING.md`: so a tabela `### Types` (o `commit-msg` le dela os prefixos).
- `.claude/settings.json`: a ligacao dos hooks **e** o `deny`/`ask` da fronteira, que **o utilizador escreve** (o agente
  propoe o texto; o `simulate-upgrade --projeto` lista o que falta).
- `.agent/scripts/lib/prefixo-commit.mjs`
- `.agent/scripts/lib/nomes-proibidos.mjs`
- `.agent/scripts/lib/agentes.mjs`
- `.agent/scripts/lib/mapa-suites.mjs`: a tabela do template, **sem a mudar** (§3, passo 1).
- `.agent/scripts/check-backlog.mjs`, com `.agent/scripts/lib/backlog-calculo.mjs`, `.agent/scripts/lib/backlog-itens.mjs`, `.agent/scripts/lib/backlog-regras.mjs` e `.agent/scripts/lib/backlog-corrige.mjs` (uma linha cada, abaixo).
- `.agent/scripts/lib/backlog-calculo.mjs`
- `.agent/scripts/lib/backlog-itens.mjs`
- `.agent/scripts/lib/backlog-regras.mjs`
- `.agent/scripts/lib/backlog-corrige.mjs`
- `.agent/scripts/minutos-ci.mjs`, com os dois modulos abaixo.
- `.agent/scripts/lib/minutos-calculo.mjs`
- `.agent/scripts/lib/repo-origin.mjs`
- `.agent/scripts/lib/registo.mjs`: o runner do `test-hooks.mjs`, com os quatro abaixo e o harness.
- `.agent/scripts/lib/varredura-paralela.mjs`
- `.agent/scripts/lib/varredura-fatia.mjs`
- `.agent/scripts/lib/ordem-por-alvo.mjs`
- `.agent/scripts/lib/tmp-limpo.mjs`
- `.agent/scripts/tests/harness/relatorio.mjs`
<!-- fecho:fim -->

**A vista do backlog** (`backlog-board.mjs`, #446) nao vem: nao e fronteira. Um projeto parcial que a queira copia o
`backlog-board.mjs`, as tres libs dela (`lib/backlog-vista.mjs`, `lib/backlog-vista-pecas.mjs` e `lib/backlog-vista-assets.mjs`), o leitor
(`lib/backlog-itens.mjs`, que ja vem) e as duas linhas do `.gitignore`: `.agent/backlog-board.html` e
`.agent/backlog-board.html.tmp` (o CLI recusa sem qualquer uma delas).

**Nao vem:** as outras suites `test-*` e os seus `tests-*.mjs`, os `guards/`, o `check-doc-versions`, o
`check-test-surface`, o `mutation-sweep`, os `simulate-*`, e os jobs `guard-tests`, `sweep` e `simulators`. As rules, os
workflows e os pontos de entrada que o projeto ja tem seguem a tabela do §2 do `upgrade.md`, como num upgrade completo.

## 3. A ordem da fronteira

Cada passo e **aprovado um a um pelo utilizador**, por `Edit`/`Write` (nunca `cp` do `$TPL`), como no `upgrade.md` §2.
A ordem importa: um hook ja esta ligado no `settings.json` de um derivado, e um hook novo escrito antes da lib de que
precisa rebenta no `import` e sai sem bloquear — a fronteira fica desligada em silencio ate a lib chegar. Por isso as
libs vem antes de quem as importa, e os testes (que nao estao ligados) no fim.

1. **As libs** que o `commit-msg` e os hooks importam: `prefixo-commit.mjs`, `nomes-proibidos.mjs`, `agentes.mjs` e o
   `mapa-suites.mjs` (o `stop-verify` do passo 3 importa dele o `regraDe` e o `comandoDe`). A tabela do `mapa-suites`
   vem **como esta no template**: os casos do `test-hooks.mjs` afirmam-na, e mudar uma regra dela poe-no vermelho (e o
   CI de exemplo corre-o). Pode lembrar, no fim de um turno, uma suite do template que o projeto nao tem: e um
   lembrete, nao uma reprovacao. Regras para ficheiros do projeto, so **acrescentadas no fim** (a primeira que casa e a
   que vale, e as do template ficam a frente). O ficheiro vem **sempre** do template, e as regras do projeto
   re-acrescentam-se no fim a cada upgrade (o diff mostra-as).
2. **O `.githooks/`** (o `commit-msg` e o `lib/`) e a tabela `### Types` do `CONTRIBUTING.md`. O `commit-msg` precisa do
   bit de execucao, que um `Write` nao da: o utilizador corre `chmod +x .githooks/commit-msg` e, se ainda nao o fez,
   `git config core.hooksPath .githooks`.
3. **Os outros hooks** da fronteira, por esta ordem: primeiro o `.claude/hooks/lib/` e o `protegidos.json` (se ausente),
   depois os hooks (`guard-textos-publicos` incluido), a pasta `.claude/agents/`, e a linha `.claude/state/` no
   `.gitignore` (o estado de runtime dos hooks). O `.claude/hooks/tests/` fica para o passo 4.
4. **O resto da lista do §2**: as libs do runner do `test-hooks.mjs` (`registo`, `varredura-paralela`, `varredura-fatia`,
   `ordem-por-alvo`, `tmp-limpo`, o `harness/relatorio.mjs`) e so depois o `.claude/hooks/tests/`; o `check-backlog.mjs`
   com as suas libs; e o `minutos-ci.mjs`.
5. **O `.claude/settings.json`**, escrito pelo utilizador: a ligacao dos hooks e o `deny`/`ask` que o
   `simulate-upgrade --projeto` listou. Um hook copiado e nao ligado nunca dispara, e o `test-hooks` nao o ve: a lista
   dos hooks por ligar e a unica rede. Ela so diz o que **falta** ligar: um hook que o template passou a ligar noutro
   sitio, ou deixou de ligar, nao se compara aqui. Para isso, ver o diff da chave `hooks` do `settings.json` do template
   entre a marca e a tag (`git -C "$TPL" diff <marca>..<tag> -- .claude/settings.json`): um hook apagado e ainda ligado
   faz o Claude Code falhar a cada evento.

Depois, as tres verificacoes que o simulador nao faz aqui:

```bash
node .claude/hooks/tests/test-hooks.mjs
node .agent/scripts/check-backlog.mjs
# O `commit-msg` novo sobre os ultimos commits (um que reprove e uma mensagem antiga: anotar, nao reescrever).
git log -20 --no-merges --format='%B%x00' | while IFS= read -r -d '' m; do printf '%s' "$m" > "${TMPDIR:-/tmp}/m"; node .githooks/commit-msg "${TMPDIR:-/tmp}/m" </dev/null || echo "  ^ esta"; done
```

## 4. O CI

O exemplo de um job esta em `src/docs/exemplos/ci-sem-maquinaria.yml`, e o seu par em
`src/docs/exemplos/cache-sem-maquinaria.yml`: copiam-se para o `.github/workflows/` (`ci.yml` e `cache.yml`) e
adapta-se o que esta marcado `# ADAPTAR`. O porque de cada escolha esta nos comentarios deles; a suite
`test-ci-exemplo.mjs` prende-as no template. Os pontos a decidir no projeto:

- **O metodo de merge do repo decide o salto do push do merge** (#439). Com merge commits, a forma ativa (pela
  mensagem `Merge pull request #`). So com squash, a VARIANTE (pelo committer `web-flow`, com a descricao do PR
  verificada no PR, e a opcao de squash "Pull request title and description"). Na duvida, a ativa: num squash nao
  salta nada, e perde-se so a poupanca.
- **Um PR que mude as dependencias (ou o `.nvmrc`) leva `(deps` ou `,deps` no titulo** (`chore(deps):`,
  `feat(reader,deps):`; o `ci.yml` reprova-o sem uma delas): e por essa mensagem que o `cache.yml` grava a cache depois
  do merge. Sem `include: scope` no `dependabot.yml`, adaptar as MARCAS nos dois.
- **O push nao reverifica a app.** Dois PRs verdes contra o mesmo `main` podem parti-lo juntos: atualizar o PR com o
  `main` antes do merge quando outro entrou entretanto.
- **A cache da `node_modules`** (o bloco OPCIONAL T80) so com as condicoes escritas nele, e depois de medir.

## 5. Medir

Antes de trocar o CI, os ultimos runs; depois, os 5 PRs seguintes:

```bash
node .agent/scripts/minutos-ci.mjs --desde AAAA-MM-DD --app TypeScript
```

Cobrado (o que a quota ve) e real (o que o runner gastou), e a mediana do job mais longo dos PRs de app contra 120 s.
O metodo, a faturacao da conta e as quatro regras estao no `src/docs/upgrade-derivados-privados.md` §6.

## 6. As notas

- **Um repo privado:** o `src/docs/upgrade-derivados-privados.md` (as advisories a meio, as tags, os passos que pedem
  aprovacao, o Dependabot so de dev, publicar um texto, os minutos).
- **Um PR antigo ou empilhado** durante o upgrade: a ordem (a base primeiro, depois o merge do `main`, depois o push) e
  o `check-backlog --corrigir` estao no `.agent/rules/backlog-method.md`.
