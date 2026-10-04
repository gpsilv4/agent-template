# Anti-Padroes do TEMPLATE (TP1-TP12) — {{PROJECT_NAME}}

> **NAO carregado** no contexto do agente. Lido on-demand: pelo Guard 15
> (`.agent/scripts/guards/anti-patterns.mjs`), que resolve as citacoes, e por quem for ler
> uma citacao concreta.
>
> **Porque vive aqui e nao no `anti-patterns.md`**: sao licoes sobre a maquinaria do TEMPLATE,
> e um projeto que nao a use pagava-as em todas as sessoes. A medicao esta no `-why`.
>
> **Continuam a ser citaveis e citadas.** Dezenas de ficheiros do template (`.agent/scripts/`,
> `.claude/hooks/`, as rules e os workflows) referem os `TPn`, e o Guard 15 varre os DOIS
> ficheiros — apagar uma entrada daqui deixa essas citacoes penduradas e o guard reprova,
> dizendo quais. Nao as substituas pelas tuas: os teus vao para
> `.agent/rules/anti-patterns.md` com o prefixo `AP`, que esta todo livre. Sao **espacos de
> nomes separados**: o quarto daqui e o teu quarto nunca se confundem, e um `/upgrade` traz as
> citacoes do template sem reescrever nenhuma.

## TP1 — Teste cuja assercao e satisfeita por outra verificacao

- **Origem**: cinco rondas de review a este template, sempre a mesma classe.
- **Anti-padrao**: afirmar `includes("<texto>")` sobre o output INTEIRO de um verificador, com
  uma mutacao que quebra mais do que o alvo do teste. Fica verde porque OUTRA verificacao
  falhou. Variante: o `includes` nao distingue niveis, logo despromover um erro a aviso mantem
  o teste verde e desliga o gate. **Forma mais teimosa**: contagens escritas em prosa ou em
  mensagens de commit — o mesmo numero saiu errado quatro vezes numa sessao.
- **Correto**: afirmar contra as linhas do **nivel certo**, e mutar so o input do alvo. Nao
  escrever contagens que nao se derivaram no momento: correr o comando e colar, ou escrever **o
  comando** em vez do numero.
- **Detecao em review**: sabotar, nao contar a olho — `node .agent/scripts/mutation-sweep.mjs`
  desliga cada sitio de erro, um a um, e exige a suite vermelha em cada um. Sai `!= 0` tambem
  se um verificador nao tiver suite nenhuma.

## TP2 — Zero resultados lido como zero problemas

- **Origem**: o `check-backlog.mjs` deste template.
- **Anti-padrao**: um verificador que nao encontra dados concluir que **nao ha nada a
  verificar**. Um backlog populado, com o titulo de uma seccao renomeado, lia zero linhas e
  anunciava `Backlog vazio` com exit `0` — o gate passava **a afirmar** que estava vazio.
  Variantes: caminhos relativos ao `cwd`, esperar por checks de CI que ainda nao arrancaram,
  clone com CRLF.
- **Correto**: separar **"nao ha nada"** de **"nao consegui ler"**. Verificar primeiro que a
  estrutura de que dependes existe (cabecalhos, ficheiros, contagem > 0) e reprovar se nao
  existir; ancorar caminhos a raiz do repo, nunca ao `cwd`; nunca afirmar "vazio" com um aviso
  disparado.
- **Detecao em review**: num input **valido e populado**, renomear o que o verificador procura
  e exigir que reprove. Correr cada verificador **de uma subpasta** e **num clone com CRLF** —
  output identico ao da raiz.

## TP3 — Teste que depende do estado do repo em vez de o montar

- **Origem**: o teste do Guard 13 neste template; repetiu-se na correcao do `TP7`.
- **Anti-padrao**: uma assercao que so e verdadeira no estado **atual** do repo, sem a fixture
  a montar essa condicao. Passa no template nu e falha no primeiro dia de cada consumidor.
- **Correto**: a fixture **cria ou apaga** aquilo de que a assercao depende, e **deriva** o que
  precisa da propria fixture. Nunca herdar do repo.
- **Detecao em review**: `grep -n 'test(.*, null,' <suite>` para mutacoes vazias, e por cada
  uma perguntar _"o que e que isto assume sobre o repo?"_. Sobretudo: correr a suite num
  **projeto derivado**. Verde num sitio e vermelho no outro nao esta a afirmar o que diz.

## TP4 — O loop que fica verde enfraquecendo o teste

- **Origem**: o desenho de um loop de correcao automatica num projeto real.
- **Anti-padrao**: com o objetivo _"ficar verde"_, enfraquecer o teste em vez de corrigir o
  codigo: apagar a assercao, `it.skip`/`xit`, ou **estreitar a selecao do runner** (`include`,
  `-k`), que remove falhas sem tocar em nenhum teste.
- **Correto**: **retirar a capacidade**, nao pedir contencao: veredicto pelo exit code, testes
  **e** config do runner congelados, contagens que nao descem, abortar se o git falhar.
- **Detecao em review**: `node .agent/scripts/check-test-surface.mjs <baseline>`. E um passo e
  nao uma barreira (essa e o CI), e mede volume e nao forca — os limites estao no `-why`.

## TP5 — `.trim()` no output de um comando cujas colunas significam algo

- **Origem**: o hook `stop-verify` sub-reportava a divida **em silencio**, com a suite verde.
- **Anti-padrao**: `.trim()` ao output **inteiro** de um comando de colunas fixas. No
  `git status --porcelain` a coluna de um ficheiro nao-staged e um **espaco** (` M path`):
  trimar come-o so na primeira linha, o `slice(3)` leva um caractere do caminho, e o ficheiro
  desaparece da analise sem erro nenhum.
- **Correto**: cortar **so** o que sobra no fim — `.replace(/\n+$/, "")` — e trimar por linha,
  nunca em bloco. Nao normalizar espacos de um formato onde o espaco e dado.
- **Detecao em review**: o instrumento fiavel e o **teste com as duas formas** de linha
  (`?? path` sem espaco **e** ` M path` com espaco) — era so a primeira que os testes montavam.
  Grep secundario: `grep -rn 'execFileSync(.*)\.trim()\|}).trim()' .agent .claude`, e o revisor
  confirma se aquele output tem espaco significativo.

## TP6 — Blocklist de formas perigosas onde era preciso um allowlist

- **Origem**: o hook `guard-protected-branch` deste template — **32 defeitos** na primeira leitura.
- **Anti-padrao**: enumerar o que e **perigoso**. As formas de escrever a mesma coisa numa
  shell nao tem fim (`eval`, `sh -c`, backticks, `$(...)`, caminho absoluto, `xargs`, `sudo`,
  `env`, `{ }`, aspas pelo meio), logo a lista **falha aberta**. Pior: cada correcao cria
  formas novas.
- **Correto**: enumerar o que e **seguro** e negar o resto (falha **fechada**). A lista de
  verbos inofensivos e finita; a de comandos ofuscados nao e. Onde falhar fechado bloquearia
  trabalho legitimo, a mensagem de negacao diz o que acrescentar a lista.
- **Detecao em review**: **uma tabela de formas, nao uma leitura da regex** — a varredura de
  mutacao deu `2/2` com os 32 defeitos e sem eles. O instrumento e a tabela `BYPASSES` em
  `.claude/hooks/tests/tests-bypasses.mjs`: cada forma conhecida e um caso, e cresce quando
  aparece outra. O tamanho nao se cita em prosa; esta a um `grep -c` de distancia.

## TP7 — Ramo inalcancavel, justificado por prosa em vez de medido

- **Origem**: o ramo "ninguem cita" do Guard 15 (`guards/anti-patterns.mjs`).
- **Anti-padrao**: um ramo que nao se consegue testar, com a **razao escrita** ao lado em vez do
  invariante que o impede. A razao costuma estar errada; causa tipica: o mesmo input lido com
  **normalizacoes diferentes** nos dois lados de uma contagem.
- **Correto**: ramo sem teste possivel e defeito **do codigo**: as duas leituras usam o **mesmo
  helper**, ou o ramo sai.
- **Detecao em review**: `git grep -nE "inalcancavel|codigo morto" -- .agent .claude`; cada
  ocorrencia paga um **controlo negativo** (desligar a correcao e exigir vermelho).

## TP8 — Duas copias da mesma regra, a concordar a mao

- **Origem**: cinco ocorrencias numa so sessao, todas diferentes a olho e iguais por dentro.
- **Anti-padrao**: re-escrever uma regra que ja existe noutro ficheiro e contar com que as duas
  se mantenham iguais. A copia falha onde ninguem sabe que e copia: numa **fronteira**, meses
  depois, com a mensagem a apontar para o sintoma.
- **Correto**: **derivar, nao duplicar.** Quem define exporta, quem precisa importa; em testes,
  a lista deriva-se do disco ou da mesma fonte que o codigo usa.
- **Detecao em review**: a varredura nao o ve (as duas copias estao cobertas). Ao rever um diff:
  **este valor ja existe noutro sitio?** Os sinais grosseiros estao no `-why`.

## TP9 — Teste que pergunta por um caminho fixo que mudou de sitio

- **Origem**: a migracao para `tests/` — **28 de 32** ficheiros sem regra, com a suite verde.
- **Anti-padrao**: escrever a mao, no teste, o **input** que ele pergunta ao codigo — tabela e
  teste envelhecem juntos e continuam de acordo.
- **Correto**: listar o **disco** e perguntar pelo que se listou (`TP8` aplicado ao input), e um
  **catch-all** — *todo* o ficheiro da pasta casa uma regra — que declara o vazio (`total === 0`
  -> "mediria o vazio"), senao a pasta renomeada cala-o.
- **Detecao em review**: `git grep -nE '"\.(agent|claude)/[^"]+\.mjs"' -- '*/tests/*'` — caminho
  literal num teste: legitimo se o MONTA, suspeito se o INTERROGA. Controlo negativo: **mover a
  pasta**, a suite fica vermelha.

## TP10 — Backtick numa string de shell com aspas duplas

- **Origem**: uma mensagem de `git tag -m` que citava caminhos. Apagou o repositorio.
- **Anti-padrao**: backticks num `-m`/`--body`/`echo` entre aspas duplas — o shell executa o
  que esta entre eles. Como a convencao daqui poe comandos em backticks, a mensagem de um
  ticket sobre `rm` **e** esse comando. Fica latente enquanto o conteudo for inofensivo.
- **Correto**: por FICHEIRO (`-F`, `--body-file`) ou heredoc com delimitador entre plicas.
- **Detecao em review**: `git grep -nE '(-m|--message|--body) "[^"]*\`'`.

## TP11 — `cmd | grep -q` num `if`, com `pipefail`

- **Origem**: `#155`, o gatilho da varredura no `ci.yml`.
- **Anti-padrao**: `if cmd | grep -q X; then ... else "nao aplicavel"`. Com `pipefail` o `else`
  apanha `cmd` a falhar e o SIGPIPE de `cmd` quando `grep -q` sai no match (`TP2`).
- **Correto**: `x="$(cmd)"`, depois `grep -q X <<<"$x" || rc=$?` (1 = sem match, 2 = erro).
  `printf "$x" |` nao resolve: o builtin leva o mesmo SIGPIPE.
- **Detecao em review**: `git grep -nE '\|\s*grep\s+-[a-zA-Z]*q' -- '*.yml' '*.sh' '*.mjs'`.

## TP12 — Copiar do disco o que o git ignora

- **Origem**: o `/upgrade` num derivado real (#174, R7-D): os `RELATORIO-*.md` ignorados pelo
  git do template aterraram na copia do projeto, e chaves e `node_modules/` iam pelo mesmo caminho.
- **Anti-padrao**: percorrer a arvore do template com `cpSync`/`andaFicheiros` e levar tudo o que
  esta no disco. O disco de quem mantem o template tem o que o git dele ignora.
- **Correto**: perguntar ao git — `foraDoTemplate()` (`lib/fora-do-template.mjs`) — e reprovar se
  ele nao responder ("nao ignora nada" nao e "nao consegui perguntar", `TP2`).
- **Detecao em review**: `git grep -nE "cpSync\(|andaFicheiros\(" -- .agent/scripts`: cada sitio
  que le a raiz do TEMPLATE passa pelo filtro, ou e excepcao escrita (a copia de trabalho do
  `mutation-sweep.mjs`). Os que andam na copia do consumidor nao sao este caso.
