# Anti-Padroes — de onde vieram e o que custaram ({{PROJECT_NAME}})

> **NAO carregado no contexto.** Par de `.agent/rules/anti-patterns.md`, tal como
> `ticket-method-why.md` e par de `ticket-method.md`: as **instrucoes** vivem na rule (enxuta,
> sempre carregada, com orcamento de bytes), a **evidencia** vive aqui.
>
> Porque separado: a rule chegou a 11 934 bytes de um gate de 12 000 — 66 de folga num
> ficheiro que **entra no contexto a cada sessao**, e a proxima frase que alguem escrevesse
> quebrava o CI. Um template sem espaco para o consumidor escrever os seus proprios
> anti-padroes falha no objectivo. As quatro entradas mais pesadas somavam 7,7 KB dos 11,9,
> quase todo em historia de guerra — que e valiosa, e nao precisa de estar sempre carregada.
>
> Ler on-demand: ao mexer num verificador, ao discutir uma entrada, ou quando o `/review`
> manda confirmar uma deteccao.

---

## Porque o prefixo do template e `TP` e nao `AP`

As sete entradas nasceram no prefixo `AP` — o mesmo que um projeto derivado usa para as suas.
(Escrever aqui um ID concreto desse prefixo seria uma citacao morta, e o Guard 15 apanhou-a ao
escrever este paragrafo.) Enquanto o template estava sozinho isso nao custava nada; ao segundo `/upgrade` custou
duas vezes.

O que acontecia: o projeto derivado escrevia os seus anti-padroes a partir dos seus proprios
bugs, comecando no primeiro numero livre — mas "livre" tinha de ser calculado contra os sete
do template, que ele nao tem razao nenhuma para conhecer. Num consumidor real quatro numeros
ficaram com dois significados cada; o quarto era "o loop que fica verde enfraquecendo o teste"
no template e "elemento interativo fora do design system" no projeto. Uma citacao a esse numero
**resolvia** — para a entrada errada. E pior do que uma referencia morta: a morta denuncia-se,
esta confirma uma leitura que nao e a do autor e nada no ecra a contradiz. O Guard 15 passou a
reprovar a colisao, mas reprovar e so o segundo melhor: obrigava a renumerar a mao, e cada
`/upgrade` trazia ~27 citacoes para reescrever uma a uma.

Prefixos separados eliminam a classe em vez de a detetar. O template usa `TP`, o projeto usa
`AP` e comeca no primeiro numero com o espaco todo livre; as citacoes `TPn` que um `/upgrade`
traz copiam-se como estao, porque significam o mesmo em todos os projetos. **Custou 204 sitios
em 59 ficheiros, uma vez.** O que substituiu era ~27 reescritas de citacoes **por `/upgrade`,
em cada projeto derivado, para sempre** — e feitas a mao, logo com a taxa de erro de uma tarefa
mecanica repetida.

O Guard 15 continua a ler os dois prefixos e a reprovar a colisao. Nao por a forma antiga poder
voltar, mas porque sobra uma forma nova: a entrada escrita no ficheiro do prefixo errado, que e
o que um `/upgrade` desatento faz ao acrescentar onde devia substituir.

---

## TP1 — Teste cuja assercao e satisfeita por outra verificacao

**Origem**: cinco rondas de review a este template, sempre a mesma classe.

O `includes` sobre o output inteiro nao distingue **nivel**: um teste que espera um erro fica
verde com uma linha `NOTE` do mesmo texto, ou com o aviso de **outro** verificador que a mesma
mutacao tambem disparou. Sabotar o verificador sob teste passa invisivel. Por isso o harness
deste repo afirma contra as linhas `WARN` quando espera `code: 1`, e so usa o output inteiro
quando espera `code: 0` (onde `OK`/`SKIP`/`NOTE` sao o que interessa).

A versao anterior desta entrada trazia **o numero de sitios de mutacao escrito a mao**.
Envelheceu na primeira alteracao ao verificador, e a receita ao lado nunca chegava a esse
numero — por isso o numero passou a ser derivado por um script (`mutation-sweep.mjs`).

### A forma mais teimosa: numeros em prosa e em mensagens de commit

Numa unica sessao o mesmo numero foi escrito errado **quatro vezes**:

| Escrito | Realidade | Como envelheceu |
|---|---|---|
| "9 das 10 suites" | outra contagem | dividiu-se uma suite |
| "todas menos uma" | eram 2 de 11 | por medir |
| "as 28 formas" | a tabela tinha 47 | a tabela cresceu |
| "34 -> 48 casos" (**mensagem de commit**) | eram 47 | escrito sem correr |

Uma mensagem de commit e **imutavel**: um numero errado la fica errado para sempre.

**Regra**: nao escrever contagens que nao se derivaram no momento. Ou se corre o comando e se
cola o resultado, ou se escreve **o comando** em vez do numero. O que nao envelhece sao os
**eventos** ("a leitura encontrou 22 defeitos"), porque descrevem o passado; as contagens
descrevem o presente, e o presente muda.

---

## TP2 — Zero resultados lido como zero problemas

**Origem**: o `check-backlog.mjs` deste template.

Um backlog com tres items, mas com o titulo de uma seccao renomeado, lia zero linhas e
anunciava `Backlog vazio — nada a validar` com exit `0`. O gate passava **a afirmar** que
estava vazio — pior do que falhar, porque produz confianca.

Variantes da mesma forma, todas medidas neste repo:

- **Caminhos relativos ao `cwd`**: o verificador corrido de uma subpasta le zero e passa. Os
  caminhos passaram a ancorar-se a raiz derivada da localizacao do proprio script.
- **Esperar por checks de CI que ainda nao arrancaram**: `gh pr checks --watch` sai `0` com
  zero checks.
- **Clone com CRLF** (`core.autocrlf=true` em Windows): um patch ou regex com `"\n"` literal
  deixa de casar, e o teste passa a nao afirmar nada — verde, e cego.

**Receita de deteccao, por inteiro**: pegar num input **valido e populado**, renomear ou mover
o que o verificador procura, e exigir que ele reprove. Se ele responder "vazio, nada a
validar", esta a mentir com exit `0`. Correr tambem cada verificador **de uma subpasta**
(output identico ao da raiz) e **num clone com CRLF**.

---

## TP3 — Teste que depende do estado do repo em vez de o montar

**Origem**: o teste do Guard 13 neste template.

O teste afirmava que o guard **salta**, passando `null` como mutacao — verdade no template nu,
onde o ficheiro que dispara o guard nao existe, e **falsa em qualquer projeto derivado**, onde
o bootstrap o cria. A suite passava aqui e falhava no primeiro dia de cada consumidor.

Voltou a acontecer na correcao do `TP7`: o teste do ramo "ninguem cita" herdava as definicoes
do `anti-patterns.md` real (a fixture sintetica deriva-as de la), logo num projeto que ainda
nao escreveu anti-padroes — o que a propria rule autoriza por escrito — `existentes` era 0, o
guard caia no `SKIP` e o teste ficava vermelho no consumidor estando verde aqui. A correcao foi
a fixture passar a **derivar as definicoes do que o codigo da fixture cita**, nao do repo.

**Sinal mais forte que qualquer grep**: correr a suite num **projeto derivado** e nao so no
template. Um teste verde num sitio e vermelho no outro nao esta a afirmar o que diz.

---

## TP4 — O loop que fica verde enfraquecendo o teste

**Origem**: o desenho de um loop de correcao automatica num projeto real.

As tres formas, por ordem de subtileza: apagar a assercao; marcar
`it.skip`/`xit`/`@pytest.mark.skip`; e **estreitar a selecao do runner** (`include`,
`testMatch`, `-k`) — que remove falhas igualmente bem e **nao toca em nenhum ficheiro de
teste**, logo escapa a qualquer vigilancia sobre os testes.

Os seis invariantes, e o defeito que cada um fecha:

1. O veredicto assenta no **exit code** do runner, nunca numa regex sobre o output. Uma versao
   assim dava APROVADO quando o output nao era parseavel — import quebrado, timeout, runner
   ausente.
2. Congelar os testes **e a configuracao** do runner. Congelar so os testes nao basta (ver a
   terceira forma acima).
3. Nao ha loop sem falha inicial: se a suite ja esta verde, o loop nao arranca.
4. Perguntar ao **git** o que mudou desde a baseline — e **abortar** se o git falhar, em vez de
   tratar a resposta vazia como "nada mudou" (e o `TP2` aplicado ao loop).
5. A contagem de testes **nao desce** e os *skipped* **nao sobem** face a baseline.
6. Procurar marcas de enfraquecimento **so na superficie congelada** — senao um `.skip(offset)`
   de paginacao em codigo de producao da falso positivo.

### O limite honesto, em tres partes

**Primeiro**: e um passo a correr, **nao** uma barreira. Nao ha hook a negar a escrita de
testes, e quem corre o loop pode simplesmente nao correr o verificador. A autoridade que o
agente nao alcanca e o **CI**: um job que falha se a contagem descer face a base.

**Segundo**: as contagens medem **volume, nao forca**. Manter os casos e trocar as assercoes
por triviais (`eq(1, 1)`) nao move nenhuma contagem. O gate fecha o degrau grosseiro — apagar,
desativar, esvaziar, estreitar o runner — e **nao substitui ler o diff**.

**Terceiro, e foi este que quase matou o gate**: a comparacao era **por ficheiro**, e o
invariante 5 e sobre o **total**. Mover testes para um modulo novo — o que o `core-rules.md`
manda fazer acima das 500 linhas — baixa a contagem na origem sem perder nada, e o gate
reprovava com `WARN` e exit 1. Medido: tres extracoes legitimas numa sessao fecharam-no. Hoje o
verificador soma o total da superficie; uma descida num ficheiro com o total intacto sai como
`NOTE` ("movido, nao perdido"), e a descida do **total** continua a reprovar. Um gate que
reprova a limpeza que o projeto exige treina quem o le a ignora-lo, e esse e o custo real — nao
o exit code.

### A excepcao do `pull_request`, e as tres vezes que nasceu morta

A marca de "condicao `if:`" tem uma excepcao: gated a `pull_request` nao e enfraquecimento,
porque o step continua a correr onde interessa. Essa excepcao falhou **tres vezes**, cada uma
por uma razao diferente, e cada uma sozinha bastava:

1. `\s*` guloso **recua a largura zero**: o lookahead falhava, o `\s*` voltava a zero e a
   excepcao passava a ser avaliada sobre `" github…"`, que nao casa. O `[ \t]*` tem de viver
   **dentro** do lookahead. (Aconteceu outra vez, anos de licao depois, ao acrescentar o
   wrapper das aspas.)
2. O normalizador de strings corria **antes** do regex, logo a linha comparada era
   `if: github.event_name == ""` — o literal citado **nao existia la**. Dai a flag `cru`.
3. A excepcao cobria so a forma canonica. `github.event_name=='pull_request'` (sem espacos),
   `${{ … }}` (a forma mais idiomatica de GHA) e o escalar YAML entre aspas davam **falso
   positivo**, e um `ci.yml` legitimo fechava o gate. Hoje a excepcao esta ancorada nos dois
   extremos e a tabela de formas tem 21 casos, 10 a excluir e 11 a contar.

O **fim** da condicao e tao importante como o principio: sem o `$`, `== 'pull_request' && false`
era excluido — sabotagem pura escrita como se fosse o gate legitimo.

---

## TP5 — `.trim()` no output de um comando cujas colunas significam algo

**Origem**: o hook `stop-verify` sub-reportava a divida **em silencio**, com 33 testes verdes.

No `git status --porcelain` a coluna de estado de um ficheiro nao-staged e um **espaco**
(` M path`). Trimar o output inteiro come esse espaco **so na primeira linha**, e o `slice(3)`
seguinte leva um caractere do caminho: `.agent/x` chega como `agent/x`. O caminho deixa de
casar com qualquer regra e o ficheiro **desaparece da analise sem erro nenhum**.

**Porque a suite verde nao viu**: os testes montavam so a forma `?? path` (ficheiro novo, sem
espaco na coluna). A forma ` M path` (commitado-e-modificado, com espaco) nunca era exercitada,
e e a unica onde o bug aparece. O instrumento fiavel e o **teste com as duas formas** — nao o
grep.

**Grep secundario**: `grep -rn 'execFileSync(.*)\.trim()\|}).trim()' .agent .claude`. Sinaliza
**todo** output de comando que se trima, e o revisor confirma se aquele output tem espaco
significativo (`git status --porcelain` tem; `symbolic-ref` nao). Quando os dois sitios do bug
ainda existiam, apanhava-os; hoje devolve so trims legitimos, e e assim que se espera que
devolva. Um falso positivo barato e preferivel a um grep que falha o defeito — que foi o que a
primeira versao desta linha fazia.

---

## TP6 — Blocklist de formas perigosas onde era preciso um allowlist

**Origem**: o hook `guard-protected-branch` deste template. **32 defeitos** medidos na primeira
leitura: 28 formas de o contornar, 3 formas de force-push que escapavam, 1 falso positivo.

As formas de escrever a mesma coisa numa shell nao tem fim: `eval git commit`, `sh -c "..."`,
backticks, `$(...)`, `/usr/bin/git`, `xargs`, `sudo`, `env`, `{ }`, `if ...; then`,
`! git commit`, `git "commit"`, `git comm""it`. Uma blocklist **falha aberta** — o que nao
previste passa. Pior: cada correcao cria formas novas. Retirar as aspas em bloco fez
`eval "git commit"` escapar.

**Porque a varredura de mutacao nao serve aqui**: deu `2/2 sitios` na versao **com** os 32
defeitos e na versao corrigida. O numero nao se move, porque mede se cada aviso *existente* e
observado — nao se **falta** algum. (Medido na mesma sessao, ja com os hooks registados em
`PARES`; nao e reproduzivel a partir de um commit anterior a esse registo.)

**O instrumento e a tabela `BYPASSES`** em `.claude/hooks/tests/tests-bypasses.mjs`: cada forma
conhecida e um caso, e a tabela cresce quando se encontra outra. A primeira leitura fechou 28
formas; a **segunda encontrou mais 22 defeitos** no resultado dessa correcao. O tamanho da
tabela nao se cita em prosa — foi escrito errado duas vezes no mesmo dia; esta a um `grep -c`
de distancia.

---

## TP7 — Ramo inalcancavel, justificado por prosa em vez de medido

**Origem**: o ramo "ninguem cita" do Guard 15 (`guards/anti-patterns.mjs`).

O guard contava as citacoes de anti-padroes em todos os ficheiros varridos e avisava se fossem
**zero**. Mas o proprio `anti-patterns.md` esta na lista de alvos, e os cabecalhos `## APn` das
definicoes casam o padrao das citacoes — logo cada definicao contava como citacao **de si
mesma**, `citacoes >= definicoes` **sempre**, e `citacoes === 0` so podia acontecer com
`definicoes === 0`, que ja caia no ramo anterior. O ramo era **codigo morto**.

Duas coisas tornam isto um anti-padrao e nao um bug isolado:

1. **A razao escrita no lugar do teste estava errada.** O comentario dizia "inalcancavel por
   teste **neste repo** (os proprios verificadores citam anti-padroes, e o guard varre-os)".
   Plausivel, e falso: era inalcancavel por **construcao**, em qualquer projeto. Quem lesse
   ficava a pensar que noutro sitio o ramo disparava.
2. **A causa proxima foi normalizacao assimetrica.** O mesmo ficheiro era lido de duas maneiras
   dentro da mesma verificacao: as definicoes com os comentarios HTML removidos, as citacoes
   **com** eles. Dois lados da mesma contagem tem de usar o **mesmo helper**.

### O que a varredura de mutacao nao ve

`26/26 sitios` — antes e depois de fechar o ramo morto. Um `note()` nao e sitio de aviso, e um
`warn()` inalcancavel por construcao passa igualmente: a varredura mede se cada aviso
**existente** e observado, nao se algum ramo **nunca dispara**. E um **falso positivo** (aviso
a mais) e, por construcao, invisivel para ela.

O instrumento e o **controlo negativo por ramo**: desligar cada metade da correcao, uma por
vez, e exigir que a suite fique vermelha em cada uma. Verde com a correcao desligada = sem
teste, tenha a prosa que tiver.

### Duas licoes transferiveis

- **Duas leituras do mesmo input na mesma verificacao normalizam-se com o mesmo helper.** E o
  mesmo vale para o padrao: o cabecalho de definicao esteve escrito em dois sitios, e alargar
  so um (`#{2,3}` -> `#{2,4}`, o que um derivado com `####` faria) devolvia o codigo morto em
  silencio, com a suite verde.
- **Ao "limpar" um input antes de contar, preservar os `\n`** se a mensagem citar numeros de
  linha. Um `replace(…, "")` encurta o ficheiro e o aviso aponta para a linha errada de tudo o
  que vem depois. Um numero de linha errado **com confianca** custa mais do que aviso nenhum.
- **Um ramo que so e alcancavel reescrevendo o codigo-fonte do verificador nao esta testado, esta
  encenado.** Foi o que sobrou depois da primeira correcao: o ramo passou a ser formalmente
  alcancavel, mas a maioria das citacoes vive nos comentarios dos proprios verificadores — que
  sao alvos de si mesmos — logo qualquer projeto que mantenha `.agent/scripts/` tinha citacoes
  por construcao e o ramo continuava a nao disparar. A correcao real foi **restringir a
  contagem desse ramo a documentacao**, deixando as citacoes em codigo a contar para a
  deteccao de citacoes mortas, que e o que o guard realmente protege.

## TP8 — Duas copias da mesma regra, a concordar a mao

Cinco ocorrencias numa sessao. Sao diferentes a olho e sao a mesma coisa por dentro:

| Onde | As duas copias | Como apareceu |
|---|---|---|
| `/upgrade` | a lista de constantes a preservar vs. as constantes que existem | uma decisao de um projeto (gate suspenso) perdeu-se **em silencio** numa ronda real |
| teste do mapa | lista escrita a mao dos modulos de `lib/` vs. o disco | um modulo novo ficou mapeado para a suite errada |
| descoberta da varredura | isencao por **caminho** vs. o que decide (ter ou nao sitios de recusa) | um harness legitimo levava `SEM PAR` permanente |
| fixture do simulador | o par `(ficheiro, constante)` no codigo e no teste | ficou a customizar uma constante que mudara de ficheiro |
| Guard 17 | `contaLinhas` no guard e reimplementada na adaptacao 2b | **+1 em todos os ficheiros**, invisivel ate um cair em exactamente 500 |

### O que estes cinco ensinam, e nao e obvio

**A copia nao falha onde esta testada.** Nos cinco casos, ambos os lados tinham suites verdes. O
que ninguem mede e a **divergencia** entre eles — e a varredura de mutacao tambem nao a ve, pela
mesma razao: cada copia e coberta pela sua suite.

**Aparece na fronteira, nao no meio.** A contagem errada media +1 em todos os ficheiros e nao
dava sinal nenhum: 400 lido como 401 continua abaixo de 500. So um ficheiro em **exactamente**
500 a revelou. Se um valor esta duplicado, o teste que o apanha e o da fronteira — nunca o do
caso tipico.

**A mensagem aponta para o sintoma.** O erro dizia "a forma da constante mudou" e "remover a
entrada de TETOS". Nenhuma das duas era a causa. Uma divergencia entre copias manifesta-se
sempre longe de si propria.

**Latencia.** Dois dos cinco so apareceram **uma release depois** de serem introduzidos, porque
o simulador mede contra a ultima tag real. Isso nao e defeito do simulador: e o que acontece a
quem usa o template, so que a tempo.

### O caso que quase se resolveu mal

Ao juntar `contaLinhas` num sitio so, a primeira tentativa foi um `import` estatico do guard no
simulador. Partiu um teste — e bem: o simulador tem um caminho de recusa para "o guard nao
existe na copia", e um import no topo transformava essa ausencia num **crash de arranque**, ou
seja destruia a mensagem que ali existe para explicar o problema. A saida foi import **dinamico**
depois do guarda de existencia.

A licao secundaria: eliminar uma duplicacao nao pode custar um caminho de recusa. Se custar, a
forma esta errada — nao o objectivo.

---

## TP9 — Teste que pergunta por um caminho fixo, e o caminho mudou de sitio

O achado veio de fora: um `/upgrade` a um projeto real, com relatorio escrito por quem o sofreu.
As suites do template tinham migrado da raiz de `.agent/scripts/` para `tests/`. O que se mediu
depois, no template, com o mapa a responder sobre o disco de hoje:

| | Antes da correcao | Depois |
|---|---|---|
| ficheiros de `tests/` sem regra em `lib/mapa-suites.mjs` | **28 de 32** | **0 de 32** |
| suites vermelhas por causa disso | **0** | — |

Dez regexes do mapa apontavam para `^\.agent/scripts/tests-[\w-]+\.mjs$`: o caminho de antes da
migracao. Nao estavam apagadas — estavam a descrever um repo que ja nao existia.

### Porque e que nada ficou vermelho

O mapa tem suite propria, e a suite tinha dois testes sobre exactamente este assunto. Ambos
perguntavam pelos caminhos **escritos a mao no proprio teste** — os mesmos caminhos de antes da
migracao. Tabela e teste envelheceram juntos, na mesma direccao, e continuaram de acordo. Um
teste so apanha uma mudanca se algo nele vier do lado que muda.

### O erro de leitura que isto me apanhou a mim

Ao ver o sintoma — *"os `tests-*.mjs` nao casam regra nenhuma"* — escrevi no ficheiro uma recusa
**argumentada**: nao havia regra para eles, e explicava porque nao valia a pena haver. A premissa
era falsa. A regra existia; apontava para outro sitio. Medir o sintoma e inferir a causa produz
prosa convincente por cima de um facto errado, e a prosa depois defende-se sozinha. So a ronda
seguinte, contra um projeto real, o desfez.

### A forma da correcao

Os dois testes passaram a **listar o disco** e a perguntar pelo caminho que listaram, e juntou-se
um terceiro que varre `tests/` e `tests/harness/` inteiras. Esse declara o vazio antes de
concluir: sem ficheiros listados devolve *"nao listei ficheiro nenhum — o teste mediria o vazio"*,
senao uma pasta renomeada calava-o em vez de o reprovar (`TP2` outra vez, um nivel acima).

Controlo negativo, e e o que dá confianca no resto: repor **uma** regra no caminho pre-migracao
poe **dois** testes vermelhos. O anterior, com o mesmo defeito reposto, ficava verde.

### O que isto nao prova

O padrao "varrer por padrao em vez de por lista" ja tinha entrado no repo (v0.17.0) — e nao
apanhou isto, porque a migracao e mais antiga do que a regra. Uma regra nova nao audita o
passado: so o que lhe passa pelas maos a partir do dia em que existe. O que auditou o passado foi
correr contra um consumidor real.
