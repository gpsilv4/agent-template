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

## 6. Os minutos: medir, e duas regras para os manter

Os minutos cobrados sao a soma dos jobs, cada um arredondado ao minuto acima: um job de 8 s paga 1 min, e um de 121 s
paga 3. Medir antes do upgrade e depois, com a mesma tabela (a API `actions/runs/{id}/jobs`, paginada; `gh run list -L
N` corta em silencio), e a duracao POR PASSO, que e o que encontra o passo lento. Os jobs do proprio Dependabot
(`event: dynamic`) sao gratis e ficam de fora. O script e o do #429.

Duas regras que um derivado privado copia para as suas `process-rules` (o template nao as impoe: num repo publico nao
pagam nada). Medidas num derivado, a 1 e 2 nov:
- **Um push por PR,** quando o trabalho esta pronto e as verificacoes locais passaram: cada push num PR corre o CI
  outra vez. Excecoes: um preview para testar num dispositivo, o controlo negativo de uma mudanca de CI, juntar o
  `main` a um PR antigo. Depois da regra, 7 de 8 PRs correram uma so vez.
- **Se a mediana dos PRs de app passar de 120 s, procurar o passo lento** antes de acrescentar testes ao mesmo job. O
  caso medido: o `Install` subiu de 16 s para 71 s porque o push do `main` nao instalava e nunca guardava a cache do
  npm (e a chave mudava a cada PR, com a versao da app no lockfile); a correcao (a impressao digital das dependencias
  sem a versao, gravada so no `main` quando falta) devolveu-o a 16 s e o PR a 2 min. Com a mediana a ~117 s, a margem e
  de ~5 %: o passo seguinte a ver e o audit de dev ou o build.
