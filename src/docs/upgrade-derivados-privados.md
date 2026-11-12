# O `/upgrade` num derivado privado — {{PROJECT_NAME}}

> **Nao carregado:** abre-se ao fazer o `/upgrade` de um projeto PRIVADO (o `upgrade.md` aponta para aqui). Num repo
> privado cada minuto de CI e cobrado, e cada job arredondado ao minuto acima; o template e publico e nao paga, e por
> isso nao sente nada disto. Cada nota vem de um caso medido num derivado privado (#432, 2026-11-01).

## 1. Uma advisory nova a meio do upgrade

O audit de producao ficou vermelho no PR do upgrade, por uma advisory que nao veio do upgrade.

- **Antes do push do upgrade:** `npm audit --omit=dev --audit-level=high` no `main`. A regra depende do CI que o `main`
  ainda tem (#506, R10-6 do derivado B):
  - **o CI ja e o de um job:** um PR a parte, so com o lockfile, mergeado ANTES do upgrade. Misturados, o vermelho do
    audit parece do upgrade, e o upgrade espera por uma correcao que nao e dele;
  - **o upgrade TROCA para o CI de um job:** subir essas dependencias **no proprio PR do upgrade**, com `,deps` no
    titulo (senao o primeiro passo do CI reprova; um re-run le o titulo antigo: um push novo, ou fechar e reabrir). O
    PR a parte correria o CI ANTIGO (medido: a varredura ~73 min, e um teste que reprova com o git da imagem nova). O PR
    do Dependabot que as trazia fecha-se sozinho depois do merge (o "`@dependabot rebase`" deixa de se aplicar).
- `npm update <pacote>` mexe noutras entradas do lockfile (ex.: os campos `libc`). Editar so a entrada do pacote, e
  validar com `npm ci`.

## 2. A versao da app e as tags

- **O PR do upgrade NAO sobe a versao da app:** e maquinaria do agente, nao muda o que o utilizador ve. O mesmo para um
  PR que so mexe no CI ou no lockfile.
- **Uma tag por sprint ou bloco, nunca por PR** (a regra do template desde a `v0.61.0`, `process-rules.md`): num
  privado, cada tag e um job cobrado (o `release.yml`). Medido num derivado: 70 Release num mes, ~70 min, a uma tag
  por PR. Cada PR continua a subir a versao e a escrever no CHANGELOG, se o `check-doc-versions` o exigir; so a tag
  fica para o fim do bloco.

## 3. Os passos que pedem a tua aprovacao

O modo automatico de um agente pode recusar uma acao no GitHub que nao foi pedida por palavras, e a fila para a meio.
Caso real: `gh pr edit --base main` (mudar a base de um PR empilhado) foi recusado ("Unrequested Commit in a Connected
App") e so passou depois de o utilizador o autorizar. Depende das permissoes de cada um: antes de uma fila de PRs,
dizer ao agente que passos de GitHub vai precisar de fazer (mudar a base, fechar e reabrir, mergear).

## 4. Os alertas do Dependabot so de dev

O audit do CI do template (`npm audit --audit-level=high`) cobre dev e producao, e o gate nao muda.

- **Com uma versao compativel:** agrupar com o proximo PR do Dependabot, em vez de um PR proprio.
- **Sem nenhuma versao compativel** (a correcao so existe numa major que as ferramentas nao aceitam): um ticket
  pendente no backlog, SEM `overrides` (forcar uma versao que a ferramenta nao pede parte-a em silencio). Medido: o job
  de seguranca do Dependabot falhou 3 vezes num dia a tentar.
- **Por omissao, num privado (#440):** o `src/docs/exemplos/dependabot-privado.yml` (mensal, `rebase-strategy:
  disabled`). O rebase automatico do Dependabot corre o CI do PR dele a cada merge no `main` (medido: 4 runs, 17 min,
  num dia, para um PR; 113 min em outubro, num derivado). A troca: os PRs dele ficam desatualizados em silencio, e um
  PR de SEGURANCA faz-se no proprio dia (`@dependabot rebase`, CI, merge). O template e publico, nao paga, e o dele
  fica semanal.
- **Um alerta sem versao compativel continua a tentar, e paga:** num derivado, o update de seguranca de um pacote so de
  dev falhou 6 vezes em 5 dias (17 min). **Nao confirmado** que dispensar o alerta no GitHub pare as tentativas (a
  documentacao do GitHub nao o diz): medir num derivado, dispensando-o e vendo se os runs `dynamic` param numa semana.

## 5. Publicar um texto escrito num ficheiro

O hook `guard-textos-publicos` le o texto antes de o comando correr:

- `gh ... -F $VAR` / `--body-file $VAR` e recusado: nao le expansoes. O caminho vai literal.
- Criar o ficheiro e publica-lo **no mesmo comando** e recusado: o hook le o ficheiro antes de ele existir. Escrever
  primeiro (a ferramenta de edicao), publicar num comando a parte.

## 6. Os minutos: medir, e quatro regras para os manter

**Quando a quota acaba** (medido num derivado, a 20 out 2026): o CI para ate ao dia 1. Os jobs falham em 2 s com a
anotacao "The job was not started because recent account payments have failed or your spending limit needs to be
increased", e com o limite de gastos a 0 nada se cobra. A quota e da CONTA: cada derivado privado novo gasta da mesma,
e um repo publico nao conta. **A receita, para nao la chegar** (#441):
- o CI de um job (`src/docs/exemplos/ci-sem-maquinaria.yml`), que salta o push do merge, e o seu par
  `cache-sem-maquinaria.yml`, que grava a cache (o porque de cada um esta no `src/docs/upgrade-parcial.md` §4);
- o Dependabot mensal e sem rebase (`src/docs/exemplos/dependabot-privado.yml`, §4 acima);
- medir antes e depois de cada mudanca (abaixo), e as quatro regras do fim desta seccao.

**Um derivado com a maquinaria completa** (o `/upgrade` completo, #472, #477) usa o MESMO pacote, e descomenta no
exemplo os DOIS blocos `MODO COMPLETO`.
- **(a)** O passo dos guards dos docs, no job `ci`: corre em todos os PRs, por ~1-2 s.
- **(b)** O job `guard-tests`, com as suites dos scripts do template e os verificadores so-node (`check-doc-versions`,
  `check-backlog`, `check-codigo-morto`).
  - Espera pelo `ci` (`needs: ci`) e corre SO quando o PR toca `.agent/scripts/`, `.claude/hooks/` ou `.githooks/`
    (um `/upgrade`).
  - Num PR normal salta, e um job saltado nao se cobra. Num de upgrade paga o job das suites (~3 min cobrados; ~1 min
    mais do que se fossem um passo do `ci`) e verifica o codigo que ele traz. Um PR que so mexa no `ci.yml` tambem o
    corre (`.github/workflows/` conta como maquinaria).
- No bloco (a) vem tambem o `check-test-surface` contra a base do PR, em todos os PRs: um teste da app enfraquecido
  nao toca a maquinaria.

Medido a 7 nov 2026: um derivado completo com o CI de 10 jobs gastava 13 min por PR (o mais longo, as suites, 173 s;
os outros de 5 a 75 s, cada um a pagar o seu minuto), e o derivado parcial com o pacote, 2-3.

Ao adotar:
- **Os checks obrigatorios.** Um job saltado conta como passado num check obrigatorio. Um ruleset que exigia o
  `Guard Tests` (o portao do CI de 10 jobs, que o pacote tira) passa a exigir o `CI` E o `Guard Suites`. Sem o
  `Guard Tests` fora, cada PR fica pendente para sempre; so com o `CI`, as suites vermelhas de um PR de upgrade nao
  bloqueiam o merge.
- **O trailer.** O commit que troca o `ci.yml` tira jobs com maquinaria e traz os `if:` do exemplo: leva o trailer
  `Test-Surface: .github/workflows/ci.yml — <porque>` (o `check-test-surface` reprova sem ele). O trailer cobre o gate
  **e os `if:`** acrescentados (nao as outras marcas, como um `continue-on-error`); o `cache.yml`, novo, nao precisa de
  trailer: um `if:` num workflow que a base nao tinha, e que nao corre testes, nao conta (#491, que o derivado B
  encontrou no PR do upgrade).
- **O que a 2b do `/upgrade` diz com o pacote.** Sai a nota "CI do pacote de um job": as notas da forma do CI de 10
  jobs (o plano da varredura, o salto do merge e o titulo no portao) nao se aplicam, e nao aparecem. Saem tambem duas
  notas esperadas sobre o `mutation-sweep.mjs`, que fica no CI do template de proposito: "o template corre 1
  verificacao(oes) que o ci.yml deste projeto nao corre" e "conta(m) na comparacao mas nao corre(m) aqui". As tres
  ignoram-se.

**Porque um job a parte, e nao um passo do `ci`** (como o #472 o tinha):
- O `/upgrade` reconhece o modo completo pelo job `guard-tests` (`lib/modo-upgrade.mjs`). Sem ele, a marca
  `modo: completo` e o `ci.yml` contradiziam-se, e a 2b nao media nada.
- As suites sao codigo do PR, e no mesmo job das verificacoes da app podiam escrever no `$GITHUB_PATH`.
- Um derivado parcial nao traz o `check-doc-versions.mjs`, por isso o passo (a) nasce comentado.

Os minutos cobrados sao a soma dos jobs, cada um arredondado ao minuto acima: um job de 8 s paga 1 min, e um de 121 s
paga 3. Ha dois numeros, e respondem a perguntas diferentes:
- **Cobrado (arredondado)**: o que a quota gratis ve. A quota (2000 min/mes) e partilhada por TODOS os repos privados
  da conta; os minutos de um repo publico nao contam.
- **Real (efetivo)**: os segundos que o runner gastou. A razao entre os dois e o imposto do arredondamento: num
  derivado, ~2x no CI antigo de 5 jobs, e ainda ~2x com um job de 65-87 s. Menos jobs, e jobs mais curtos, baixam-no.

**Por repo, por run** (o script do #429, com a API `actions/runs/{id}/jobs` paginada; `gh run list -L N` corta em
silencio):

```bash
node .agent/scripts/minutos-ci.mjs --desde 2026-11-01 --app TypeScript   # o mes, e a mediana dos PRs de app
node .agent/scripts/minutos-ci.mjs --run <id> --passos                   # um run, passo a passo: o passo lento
```

A mediana e a do **job mais longo** de cada run (e um job que passa ou nao dos 120 s, nao a soma). O `--app "<passo>"`
e um passo que so corre nos PRs de app (sem ele, a mediana conta tambem os de docs e os outros workflows, e o script
di-lo). Os runs do proprio Dependabot (`event: dynamic`) **tambem se pagam** num privado (medido contra a faturacao:
sem eles a soma nao batia), e entram na soma contados a parte; os PRs dele correm o CI do projeto e contam tambem.
Um run ainda em curso fica fora da soma, listado.

**Pela conta inteira** (a quota, #442) — pede o scope `user` ao `gh` (`gh auth refresh -h github.com -s user`). O
`user` da tambem escrita no perfil, e fica no token de todos os `gh` do agente: retira-lo depois de medir
(`gh auth refresh -h github.com --remove-scopes user`), ou usar um token so para isto (`GH_TOKEN=<token> node …`).

**Dois comandos, duas perguntas** (e dois que os detalham, abaixo da tabela: o custo por PR e o run a run de todos):

| | `minutos-ci.mjs --quota` | `minutos-ci.mjs --desde AAAA-MM-DD --repo dono/repo` |
|---|---|---|
| Responde a | Quanto da quota da CONTA ja gastei este mes, e chego ao fim? | Onde e porque gasta UM repo, run a run? |
| Mostra | cada repo privado; os publicos numa linha; o `TOTAL` contra o limite; a projecao; a linha `QUOTA:` | cada run, os jobs, o cobrado contra o real; `--passos` a duracao de cada passo; a mediana dos PRs contra os 120 s |
| Quando | no dia a dia, antes de abrir PRs, e no `/deploy` | ao mudar o CI (5 PRs antes e 5 depois), ou a procurar o passo lento |

```bash
node .agent/scripts/minutos-ci.mjs --quota                  # o mes corrente: os privados contra os 2000, e a projecao
node .agent/scripts/minutos-ci.mjs --quota --mes 2026-10    # um mes passado; --limite 3000 no Pro
node .agent/scripts/minutos-ci.mjs --quota --por-pr         # e quanto custa um PR em cada privado, por tipo e modo (#517)
node .agent/scripts/minutos-ci.mjs --desde 2026-11-01 --todos  # o run a run de TODOS os privados, um bloco cada (#517)
```

O `--por-pr` le os runs, os jobs e os ficheiros de cada PR (minutos, e nao segundos). O **upgrade** e o PR que mexe
no `.agent/.template-version`; um PR so de `.md` fica fora do **normal**; o **PR Dependabot** e o CI dos PRs dele; o
**Dependabot (dynamic)** mostra o total e as tentativas falhadas. Cada celula e a mediana do cobrado por run, com o `n`
("sem amostra" sem runs). O modo e a linha `modo:` da marca (sem ela, o job `guard-tests`).

A faturacao traz tambem os repos PUBLICOS, e os montantes nao os distinguem (medido a 5 nov 2026): o `--quota`
pergunta a visibilidade de cada repo, e soma so os privados (um repo que ja nao existe conta). Uma linha
`QUOTA: AVISO` (>= 80%, ou a projecao acima do limite) ou `QUOTA: ESGOTADA` e o sinal para abrandar. **O limite de
gastos:** a 0, o CI para quando a quota acaba (medido a 20 out: os jobs falham em 2 s, nada se cobra); um limite
pequeno, ou o Pro (3000 min), deixa-o correr. E uma decisao do utilizador, nao do agente. **A saida tem os nomes dos
repos privados da conta:** e para o terminal ou para o chat, e nunca para um texto versionado ou publico (um commit, o
`session.md`, um PR, uma release).

Medir **5 PRs antes e 5 depois** de cada mudanca de CI, pelo id do run, e escrever os dois numeros. O exemplo de CI
de um job, para um derivado sem a maquinaria, esta em `src/docs/exemplos/ci-sem-maquinaria.yml` (a cache da
`node_modules` vai la como passo opcional, com as condicoes dela). Esse exemplo **nao reverifica a app no push**: e
uma troca de minutos, nao uma equivalencia. Dois PRs verdes contra o mesmo `main` podem parti-lo juntos, e num
privado sem GitHub Pro nao ha "Require branches to be up to date": atualizar o PR com o `main` antes do merge quando
outro entrou entretanto.

**O push do merge nao corre num privado** (#439): repetia as mensagens e o gitleaks que o PR ja correu sobre os
mesmos commits, e era 1 min de 3 por PR. Um push direto corre tudo. A condicao depende do metodo de merge (as duas
formas e o porque estao no exemplo e no `src/docs/upgrade-parcial.md` §4). Quem grava a cache depois de um merge passa
a ser o `src/docs/exemplos/cache-sem-maquinaria.yml`: num merge com `(deps` ou `,deps` na mensagem, e toda a semana a restaurar,
para o GitHub nao a apagar aos 7 dias sem uso. Os riscos, aceites e escritos no exemplo: a mensagem final do merge
deixa de ser lida; um PR mergeado vermelho deixa a app por verificar ate ao PR seguinte, e as mensagens e o gitleaks
desse PR nunca; um PR cujo ultimo commit diga `[skip ci]` nao corre, e entra sem nenhuma verificacao; uma mensagem (ou, na
variante, um committer) forjada num push direto salta, e na variante um commit pela UI web no `main` salta sem
gitleaks; num repo de rebase, ou com um `.nvmrc` de `lts/*`, a cache nova so nasce no `schedule`.

Quatro regras que um derivado privado copia para as suas `process-rules` (o template nao as impoe: num repo publico
nao pagam nada). Medidas num derivado, a 1, 2 e 4 nov:
- **Iterar no localhost.** Enquanto quem pediu testa e pede ajustes, o agente corrige e verifica localmente (tsc,
  lint, testes, guards), sem push nem PR. O push e o PR so com o ticket fechado, e o push corre antes as mesmas
  verificacoes que o CI correria, para o PR passar a primeira. Um push para um **Preview** so quando o teste pede um
  servidor real: num telemovel, a CSP de producao, ou um servico que bloqueia IPs de datacenter. Os commits locais
  continuam, cada um com a sua aprovacao; so o push espera. Porque: cada push num PR corre o CI (~2 min num PR de
  app), e iterar com pushes multiplica-o pelo numero de ajustes.
- **Um push por PR,** quando o trabalho esta pronto e as verificacoes locais passaram: cada push num PR corre o CI
  outra vez. Excecoes: um Preview (pelas razoes acima), o controlo negativo de uma mudanca de CI, juntar o `main` a
  um PR antigo. Depois da regra, 7 de 8 PRs correram uma so vez.
- **Se a mediana dos PRs de app passar de 120 s, procurar o passo lento** (`--passos`) antes de acrescentar testes ao
  mesmo job: um job de 61-120 s paga 2 min, um de 121 s paga 3. O caso medido: o `Install` subiu de 16 s para 71 s
  porque o push do `main` nao instalava e nunca guardava a cache do npm (e a chave mudava a cada PR, com a versao da
  app no lockfile); a correcao (a impressao digital das dependencias sem a versao, gravada so no `main` quando falta:
  entao pelo push do merge, hoje pelo `cache.yml`, #439) devolveu-o a 16 s e o PR a 2 min. Depois, o build sem
  repetir o tsc e a `node_modules` em cache levaram a mediana a 70 s.
- **Tickets `S` do mesmo bloco num so PR** (#441): cada PR custa ~3 min fixos (o job do PR, e o push do merge quando
  ainda corre), seja qual for o tamanho. Cada ticket continua com a sua Fase 0, o seu relatorio e o seu commit, cada um
  aprovado; o PR junta os commits. Com squash, o corpo diz `Closes #a` e `Closes #b`, senao os issues nao fecham.
