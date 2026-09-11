# Anti-Padroes ({{PROJECT_NAME}})

> Anti-padroes derivados de bugs reais. Sempre-carregado — manter enxuto (conta para o orcamento de bytes).
> Adicionar uma entrada sempre que um bug revele um padrao evitavel; quando vira regra estavel, migrar para `core-rules.md`.
>
> **A evidencia vive em `src/docs/anti-patterns-why.md`** (NAO carregado): de onde veio cada
> entrada, o que custou, e as receitas de deteccao por inteiro. Aqui ficam as instrucoes —
> quatro campos por entrada. Chegou a 66 bytes do gate; um template sem espaco para o
> consumidor escrever os seus proprios anti-padroes falha no objectivo.

## Formato de cada entrada

- **Origem**: ticket/bug que o revelou (ex: `B7`)
- **Anti-padrao**: o que **NAO** fazer
- **Correto**: o que fazer em vez disso
- **Detecao em review**: um `grep` concreto que apanha o anti-padrao

---

<!-- Exemplo (substituir/remover no bootstrap — este e ilustrativo, nao especifico do projeto).
     Usa `##`, o mesmo nivel das entradas reais: com `###` um `grep '^### AP'` devolvia **so**
     este exemplo e dava a impressao de que existia apenas o AP1 — aconteceu de facto a quem
     correu o `/upgrade`, e cegava qualquer verificacao escrita contra o nivel errado.

## AP1 — `useEffect` para data fetching

- **Origem**: B3 (dados desatualizados apos navegacao)
- **Anti-padrao**: `useEffect(() => { fetch(...).then(setState) }, [])` para dados do backend.
- **Correto**: usar o data-fetching layer do projeto (<state-management>) com cache + invalidacao.
- **Detecao em review**: `grep -rn "useEffect" src/ | grep -i "fetch\|setState"`

-->

## AP1 — Teste cuja assercao e satisfeita por outra verificacao

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

## AP2 — Zero resultados lido como zero problemas

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

## AP3 — Teste que depende do estado do repo em vez de o montar

- **Origem**: o teste do Guard 13 neste template; repetiu-se na correcao do `AP7`.
- **Anti-padrao**: uma assercao que so e verdadeira no estado **atual** do repo, sem a fixture
  a montar essa condicao. Passa no template nu e falha no primeiro dia de cada consumidor.
- **Correto**: a fixture **cria ou apaga** aquilo de que a assercao depende, e **deriva** o que
  precisa da propria fixture. Nunca herdar do repo.
- **Detecao em review**: `grep -n 'test(.*, null,' <suite>` para mutacoes vazias, e por cada
  uma perguntar _"o que e que isto assume sobre o repo?"_. Sobretudo: correr a suite num
  **projeto derivado**. Verde num sitio e vermelho no outro nao esta a afirmar o que diz.

## AP4 — O loop que fica verde enfraquecendo o teste

- **Origem**: o desenho de um loop de correcao automatica num projeto real.
- **Anti-padrao**: um loop com o objetivo _"ficar verde"_ tem uma **solucao degenerada** —
  enfraquecer o teste em vez de corrigir o codigo. Por ordem de subtileza: apagar a assercao;
  `it.skip`/`xit`/`@pytest.mark.skip`; e **estreitar a selecao do runner** (`include`,
  `testMatch`, `-k`), que remove falhas sem tocar em nenhum ficheiro de teste.
- **Correto**: **retirar a capacidade**, nao pedir contencao. Veredicto pelo **exit code** do
  runner (nunca por regex sobre o output); congelar os testes **e a config** do runner; nao
  arrancar sem falha inicial; perguntar ao **git** o que mudou e **abortar** se o git falhar;
  contagem que nao desce e *skipped* que nao sobem; procurar marcas so na superficie congelada.
- **Detecao em review**: `node .agent/scripts/check-test-surface.mjs <baseline>` — compara
  contagens contra a baseline e reprova se a superficie foi enfraquecida.

> **Limite honesto**: e um passo a correr, nao uma barreira — a autoridade que o agente nao
> alcanca e o **CI**. E as contagens medem **volume, nao forca**: trocar assercoes por triviais
> (`eq(1, 1)`) nao move nenhuma contagem. Nao substitui ler o diff. O invariante e sobre o
> **total** da superficie e nao por ficheiro: uma extracao (o que este ficheiro manda fazer
> acima das 500 linhas) baixa a contagem na origem sem perder nada, e um gate que a reprova
> ensina a ignorar o gate.

## AP5 — `.trim()` no output de um comando cujas colunas significam algo

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

## AP6 — Blocklist de formas perigosas onde era preciso um allowlist

- **Origem**: o hook `guard-protected-branch` deste template. **32 defeitos** na primeira
  leitura; a segunda encontrou mais 22 no resultado da correcao.
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

> Esta entrada vem do template, como as outras. **Nao a substituas por uma tua**: os ficheiros
> do template citam estes IDs (rules, workflows, `.agent/scripts/`, `.claude/hooks/`), e apagar
> uma entrada deixa essas citacoes penduradas — o Guard 15 reprova, e diz quais. Acrescenta os
> teus com o proximo ID livre. Se um dia deixares de ter verificadores proprios, apaga a
> entrada **e** as citacoes dela na mesma passagem.

## AP7 — Ramo inalcancavel, justificado por prosa em vez de medido

- **Origem**: o ramo "ninguem cita" do Guard 15 (`guards/anti-patterns.mjs`).
- **Anti-padrao**: nao poder testar um ramo e **escrever a razao** ao lado em vez de procurar o
  invariante que o impede. A razao escrita costuma estar errada, e faz o leitor seguinte pensar
  que noutro sitio o ramo dispara. Causa proxima tipica: o mesmo input lido com **normalizacoes
  diferentes** nos dois lados de uma contagem. Segunda ordem: um ramo que so e alcancavel
  reescrevendo o codigo-fonte do verificador nao esta testado, esta encenado.
- **Correto**: ramo sem teste possivel e defeito **do codigo**, nao do teste. Duas leituras do
  mesmo input usam o **mesmo helper** — e ao limpar um input antes de contar, preservar os `\n`
  se a mensagem citar numeros de linha.
- **Detecao em review**: a varredura de mutacao nao ve isto (um `note()` nao e sitio de aviso, e
  um falso positivo e invisivel para ela). Sinal grosseiro:
  `git grep -nE "inalcancavel|codigo morto" -- .agent .claude`; cada ocorrencia paga um
  **controlo negativo por ramo** — desligar a correcao e exigir vermelho.
