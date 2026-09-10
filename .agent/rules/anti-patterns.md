# Anti-Padroes ({{PROJECT_NAME}})

> Anti-padroes derivados de bugs reais. Sempre-carregado — manter enxuto (conta para o orcamento de bytes).
> Adicionar uma entrada sempre que um bug revele um padrao evitavel; quando vira regra estavel, migrar para `core-rules.md`.

## Formato de cada entrada

- **Origem**: ticket/bug que o revelou (ex: `B7`)
- **Anti-padrao**: o que **NAO** fazer
- **Correto**: o que fazer em vez disso
- **Detecao em review**: um `grep` concreto que apanha o anti-padrao

---

<!-- Exemplo (substituir/remover no bootstrap — este e ilustrativo, nao especifico do projeto):

### AP1 — `useEffect` para data fetching

- **Origem**: B3 (dados desatualizados apos navegacao)
- **Anti-padrao**: `useEffect(() => { fetch(...).then(setState) }, [])` para dados do backend.
- **Correto**: usar o data-fetching layer do projeto (<state-management>) com cache + invalidacao.
- **Detecao em review**: `grep -rn "useEffect" src/ | grep -i "fetch\|setState"`

-->

## AP1 — Teste cuja assercao e satisfeita por outra verificacao

- **Origem**: cinco rondas de review a este template, sempre a mesma classe.
- **Anti-padrao**: afirmar `output.includes("<texto>")` sobre o output INTEIRO de um
  verificador, com uma mutacao que quebra mais do que o alvo do teste. O teste fica verde
  porque OUTRA verificacao falhou, e neutralizar a que esta sob teste passa despercebido.
  Variante: o `includes` nao distingue niveis, logo despromover um erro a aviso mantem o
  teste verde e desliga o gate.
- **Correto**: afirmar contra as linhas do nivel certo, e mutar so o input do alvo. Para
  verificadores, medir **cobertura de mutacao**: sabotar cada sitio de erro, um a um, e
  exigir que a suite fique vermelha em cada um.
- **Detecao em review**: sabotar, nao contar a olho.
  `node .agent/scripts/mutation-sweep.mjs` — desliga cada sitio de erro dos verificadores,
  um a um, e exige que a suite fique vermelha em cada um. Sai `!= 0` se algum sitio puder
  ser desligado com a suite verde, **e tambem** se um verificador nao tiver suite nenhuma.
  (A versao anterior desta entrada trazia o numero de sitios escrito a mao. Envelheceu na
  primeira alteracao ao verificador, e a receita ao lado nunca chegava a esse numero —
  por isso o numero passou a ser derivado por um script.)
- **A forma mais teimosa: numeros em prosa e em mensagens de commit.** Numa unica sessao o
  mesmo numero foi escrito errado **quatro vezes** — "9 das 10 suites" (envelheceu ao dividir
  uma suite), "todas menos uma" (eram 2 de 11), "as 28 formas" (a tabela tinha 47), e
  "34 -> 48 casos" numa mensagem de commit (eram 47). Uma mensagem de commit e **imutavel**:
  um numero errado la fica errado para sempre. Regra: **nao escrever contagens que nao se
  derivaram no momento**. Ou se corre o comando e se cola o resultado, ou se escreve o comando
  em vez do numero. O que nao envelhece sao os **eventos** ("a leitura encontrou 22 defeitos"),
  porque descrevem o passado; contagens descrevem o presente, e o presente muda.

## AP2 — Zero resultados lido como zero problemas

- **Origem**: o `check-backlog.mjs` deste template.
- **Anti-padrao**: um verificador que nao encontra dados concluir que **nao ha nada a
  verificar**. Um backlog com tres items, mas com o titulo de uma seccao renomeado, lia zero
  linhas e anunciava `Backlog vazio — nada a validar` com exit `0`: o gate passava **a
  afirmar** que estava vazio. Variantes da mesma forma: caminhos relativos ao `cwd` (corrido
  de uma subpasta le zero e passa), e esperar por checks de CI que ainda nao arrancaram
  (`gh pr checks --watch` sai `0` com zero checks).
- **Correto**: separar **"nao ha nada"** de **"nao consegui ler"**. Verificar primeiro que a
  estrutura de que dependes existe (cabecalhos, ficheiros, contagem > 0) e reprovar se nao
  existir; ancorar caminhos a raiz do repo, nunca ao `cwd`; e nunca afirmar "vazio" quando
  algum aviso disparou.
- **Detecao em review**: pegar num input **valido e populado**, renomear/mover o que o
  verificador procura, e exigir que ele reprove. Se ele responder "vazio, nada a validar",
  esta a mentir com exit `0`. Correr tambem cada verificador **de uma subpasta** (resultado
  identico ao da raiz) e **num clone com CRLF** (`core.autocrlf=true` em Windows): um patch
  ou regex com `"\n"` literal deixa de casar e o teste passa a nao afirmar nada.

## AP3 — Teste que depende do estado do repo em vez de o montar

- **Origem**: o teste do Guard 13 neste template.
- **Anti-padrao**: uma assercao que so e verdadeira no estado **atual** do repo, sem a fixture
  a montar essa condicao. O teste do Guard 13 afirmava que ele **salta**, passando `null` como
  mutacao — verdade no template nu, onde o ficheiro que dispara o guard nao existe, e **falsa
  em qualquer projeto derivado**, onde o bootstrap o cria. A suite passava aqui e falhava no
  primeiro dia de cada consumidor.
- **Correto**: a fixture **cria ou apaga** aquilo de que a assercao depende. Se o teste precisa
  que um ficheiro nao exista, apaga-o; se precisa que exista, escreve-o. Nunca herdar do repo.
- **Detecao em review**: procurar testes com mutacao vazia — `grep -n 'test(.*, null,' <suite>`
  — e, por cada um, perguntar _"o que e que isto assume sobre o repo?"_. E, sobretudo: correr a
  suite num **projeto derivado** e nao so no template. Um teste verde num sitio e vermelho no
  outro nao esta a afirmar o que diz.

## AP4 — O loop que fica verde enfraquecendo o teste

- **Origem**: o desenho de um loop de correcao automatica num projeto real.
- **Anti-padrao**: um loop com o objetivo _"ficar verde"_ tem uma **solucao degenerada** —
  enfraquecer o teste em vez de corrigir o codigo. Tres formas, por ordem de subtileza:
  apagar a assercao; marcar `it.skip`/`xit`/`@pytest.mark.skip`; e **estreitar a selecao do
  runner** (`include`, `testMatch`, `-k`), que remove falhas igualmente bem e nao toca em
  nenhum ficheiro de teste.
- **Correto**: **retirar a capacidade**, nao pedir contencao. Durante um loop de correcao:
  1. O veredicto assenta no **exit code** do runner. Nunca numa regex sobre o output — uma
     versao assim dava APROVADO quando o output nao era parseavel (import quebrado, timeout,
     runner ausente).
  2. Congelar os testes **e a configuracao** do runner. Congelar so os testes nao basta.
  3. Nao ha loop sem falha inicial: se a suite ja esta verde, o loop nao arranca.
  4. Perguntar ao **git** o que mudou desde a baseline — e **abortar** se o git falhar, em vez
     de tratar a resposta vazia como "nada mudou".
  5. A contagem de testes **nao desce** e os *skipped* **nao sobem** face a baseline.
  6. Procurar marcas de enfraquecimento **so na superficie congelada** — senao um
     `.skip(offset)` de paginacao em codigo de producao da falso positivo.
- **Detecao em review**: `node .agent/scripts/check-test-surface.mjs <baseline>` — compara
  **contagens** contra a baseline e reprova se a superficie foi enfraquecida.

> **O limite honesto**, em duas partes. Primeiro: e um passo a correr, **nao** uma barreira —
> nao ha hook a negar a escrita de testes, e quem corre o loop pode simplesmente nao o correr.
> A autoridade que o agente nao alcanca e o **CI**: um job que falha se a contagem descer face
> a base. Segundo: as contagens medem **volume, nao forca**. Manter os casos e trocar as
> assercoes por triviais (`eq(1, 1)`) nao move nenhuma contagem. O gate fecha o degrau
> grosseiro — apagar, desativar, esvaziar, estreitar o runner — e nao substitui ler o diff.

---

## AP5 — `.trim()` no output de um comando cujas colunas significam algo

- **Origem**: o hook `stop-verify` sub-reportava a divida **em silencio**, com 33 testes verdes.
- **Anti-padrao**: `.trim()` ao output **inteiro** de um comando de colunas fixas. No
  `git status --porcelain` a coluna de estado de um ficheiro nao-staged e um **espaco**
  (` M path`): trimar o output come esse espaco **so na primeira linha**, e o `slice(3)`
  seguinte leva um caractere do caminho — `.agent/x` chega como `agent/x`. O caminho deixa de
  casar com qualquer regra e o ficheiro desaparece da analise sem erro nenhum.
- **Correto**: cortar **so** o que sobra no fim — `.replace(/\n+$/, "")` — e trimar por linha,
  nunca em bloco. Em geral: nao normalizar espacos de um formato onde o espaco e dado.
- **Detecao em review**: o instrumento fiavel e o **teste** — exercitar **as duas formas** de
  linha: um ficheiro novo (`?? path`, sem espaco) **e** um commitado-e-modificado (` M path`,
  com espaco). Era so a primeira que os testes montavam, e o bug conviveu com a suite verde.
  Grep secundario: `grep -rn 'execFileSync(.*)\.trim()\|}).trim()' .agent .claude` — sinaliza
  **todo** output de comando que se trima, e o revisor confirma se aquele output tem espaco
  significativo (`git status --porcelain` tem; `symbolic-ref` nao). Quando os dois sitios do
  bug ainda existiam, apanhava-os; hoje devolve so trims legitimos, e e assim que se espera
  que devolva. Um falso positivo barato e preferivel a um grep que falha o defeito, que foi o
  que a primeira versao desta linha fazia.

---

## AP6 — Blocklist de formas perigosas onde era preciso um allowlist

- **Origem**: o hook `guard-protected-branch` deste template. **32 defeitos** medidos: 28
  formas de o contornar, 3 formas de force-push que escapavam, 1 falso positivo.
- **Anti-padrao**: enumerar o que e **perigoso**. As formas de escrever a mesma coisa numa
  shell nao tem fim — `eval git commit`, `sh -c "..."`, backticks, `$(...)`, `/usr/bin/git`,
  `xargs`, `sudo`, `env`, `{ }`, `if ...; then`, `! git commit`, `git "commit"`,
  `git comm""it` — logo a lista **falha aberta**: o que nao previste passa. Pior: cada
  correcao cria formas novas (retirar as aspas em bloco fez `eval "git commit"` escapar).
- **Correto**: enumerar o que e **seguro** e negar o resto (falha **fechada**). A lista de
  verbos inofensivos e finita; a de comandos ofuscados nao e. Onde falhar fechado bloquearia
  trabalho legitimo, a mensagem de negacao diz o que acrescentar a lista.
- **Detecao em review**: **uma tabela de formas, nao uma leitura da regex.** A cobertura de
  mutacao deste hook deu `2/2 sitios` na versao com os defeitos **e** na versao corrigida — o
  numero nao se move, porque mede se cada aviso *existente* e observado, nao se falta algum.
  (Medido na mesma sessao, ja com os hooks registados em `PARES`; nao e reproduzivel a partir
  de um commit anterior a esse registo.) O instrumento e a tabela `BYPASSES` em
  `.claude/hooks/tests/tests-bypasses.mjs`: cada forma conhecida e um caso, e a tabela cresce
  quando se encontra outra. A primeira leitura fechou 28 formas; a **segunda encontrou mais 22
  defeitos** no resultado dessa correcao. O tamanho da tabela nao se cita em prosa — foi
  escrito errado duas vezes no mesmo dia.

> Esta entrada vem do template. Aplica-se a qualquer projeto que escreva testes de
> verificadores; se o teu projeto nao tiver nenhum, podes substitui-la pela primeira que
> um bug teu revelar.
