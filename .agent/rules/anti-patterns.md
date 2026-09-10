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

> Esta entrada vem do template. Aplica-se a qualquer projeto que escreva testes de
> verificadores; se o teu projeto nao tiver nenhum, podes substitui-la pela primeira que
> um bug teu revelar.
