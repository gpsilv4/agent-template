# O `/upgrade` num derivado privado — {{PROJECT_NAME}}

> **Nao carregado:** abre-se ao fazer o `/upgrade` de um projeto PRIVADO (o `upgrade.md` aponta para aqui). Num repo
> privado cada minuto de CI e cobrado, e cada job arredondado ao minuto acima; o template e publico e nao paga, e por
> isso nao sente nada disto. Cada nota vem de um caso medido num derivado privado (#432, 2026-11-01).

## 1. Uma advisory nova a meio do upgrade

O audit de producao ficou vermelho no PR do upgrade, por uma advisory que nao veio do upgrade.

- **Um PR a parte, so com o lockfile, mergeado ANTES do upgrade.** Misturados, o vermelho do audit parece do upgrade, e
  o upgrade espera por uma correcao que nao e dele.
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
- **Opcional, num privado:** o rebase automatico do Dependabot corre o CI do PR dele a cada merge no `main` (medido: 4
  runs, 17 min, num dia, para um PR). `rebase-strategy: disabled` no `dependabot.yml` para isso; a troca e que os PRs
  dele ficam desatualizados em silencio, e um PR de SEGURANCA faz-se no proprio dia (`@dependabot rebase`, CI, merge).
  O template e publico, nao paga, e o default dele nao muda.

## 5. Publicar um texto escrito num ficheiro

O hook `guard-textos-publicos` le o texto antes de o comando correr:

- `gh ... -F $VAR` / `--body-file $VAR` e recusado: nao le expansoes. O caminho vai literal.
- Criar o ficheiro e publica-lo **no mesmo comando** e recusado: o hook le o ficheiro antes de ele existir. Escrever
  primeiro (a ferramenta de edicao), publicar num comando a parte.

## 6. Os minutos: medir, e tres regras para os manter

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

**Pela conta inteira** (todos os repos, o que a faturacao conta), a mao — pede o scope `user` ao `gh`
(`gh auth refresh -h github.com -s user`):

```bash
gh api "/users/<utilizador>/settings/billing/usage/summary?year=AAAA&month=M"   # o total do mes
gh api "/users/<utilizador>/settings/billing/usage?year=AAAA&month=M"           # por repo (somar o `quantity`)
```

Medir **5 PRs antes e 5 depois** de cada mudanca de CI, pelo id do run, e escrever os dois numeros. O exemplo de CI
de um job, para um derivado sem a maquinaria, esta em `src/docs/exemplos/ci-sem-maquinaria.yml` (a cache da
`node_modules` vai la como passo opcional, com as condicoes dela). Esse exemplo **nao reverifica a app no push**: e
uma troca de minutos, nao uma equivalencia. Dois PRs verdes contra o mesmo `main` podem parti-lo juntos, e num
privado sem GitHub Pro nao ha "Require branches to be up to date": atualizar o PR com o `main` antes do merge quando
outro entrou entretanto.

**O push do merge nao corre num privado** (#439): repetia as mensagens e o gitleaks que o PR ja correu sobre os
mesmos commits, e era 1 min de 3 por PR. Um push direto corre tudo. A condicao depende do metodo de merge (as duas
formas e o porque estao no exemplo e no `src/docs/upgrade-parcial.md` §4). Quem grava a cache depois de um merge passa
a ser o `src/docs/exemplos/cache-sem-maquinaria.yml`: num merge com `(deps` na mensagem, e toda a semana a restaurar,
para o GitHub nao a apagar aos 7 dias sem uso. Os riscos, aceites e escritos no exemplo: a mensagem final do merge
deixa de ser lida; um PR mergeado vermelho deixa a app por verificar ate ao PR seguinte, e as mensagens e o gitleaks
desse PR nunca; um PR cujo ultimo commit diga `[skip ci]` nao corre, e entra sem nenhuma verificacao; uma mensagem (ou, na
variante, um committer) forjada num push direto salta, e na variante um commit pela UI web no `main` salta sem
gitleaks; num repo de rebase, ou com um `.nvmrc` de `lts/*`, a cache nova so nasce no `schedule`.

Tres regras que um derivado privado copia para as suas `process-rules` (o template nao as impoe: num repo publico nao
pagam nada). Medidas num derivado, a 1 e 2 nov:
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
  entao pelo push do merge, hoje pelo `cache.yml`, #439) devolveu-o a 16 s e o PR a 2 min. Depois, o build sem repetir o tsc e a `node_modules` em cache levaram a mediana a
  70 s.
