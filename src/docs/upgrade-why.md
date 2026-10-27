# `/upgrade` — o que custou, e porque a lista deixou de se escrever a mao ({{PROJECT_NAME}})

> **NAO carregado no contexto.** Par de `.agent/workflows/upgrade.md`, como o
> `anti-patterns-why.md` e par das rules de anti-padroes: as **instrucoes** vivem no workflow
> (com orcamento de bytes), a **evidencia** vive aqui.

---

## Porque a lista de "mudancas que reprovam" saiu do workflow

O `/upgrade` tinha, escrita a mao, a lista do que cada ronda fazia reprovar num projeto que
estava verde. Tinha dois defeitos e ambos sao estruturais:

1. **Envelhecia a cada release**, e ninguem a recalculava. Uma lista que tem de ser actualizada
   a mao dentro de um workflow e divida: no dia em que estiver errada, ninguem sabe.
2. **Era sempre a lista da ULTIMA ronda**, e um consumidor nao esta necessariamente nessa
   versao. Quem saltasse duas releases lia uma lista que nao era a dele.

O `simulate-upgrade.mjs` resolve os dois: monta um derivado da ultima tag, aplica o upgrade e
**mede** o que passa a reprovar. A lista passa a ser saida de um script em vez de prosa — e e
a lista da versao de onde o consumidor sai, nao a da ultima ronda.

---

## Registo historico: as rondas anteriores

O que se segue e o que estava escrito no workflow. Fica como registo — nao e para seguir, e
para perceber que classes de aperto ja aconteceram.

### Ronda de `v0.4.0`/`v0.5.0`


- **Tecto unico de 12 000 bytes** para *tudo o que o agente le* — rules carregadas, rules de
  referencia, **workflows** e catalogos. Antes as referencias tinham 12 500/14 000 e os
  workflows **nao tinham limite nenhum**. Medir primeiro:
  `for f in .agent/rules/*.md .agent/workflows/*.md; do wc -c "$f"; done | sort -rn | head`
- **Guard 17 (tamanho de ficheiro)**: `> 500` linhas reprova. Os ficheiros que o projeto ja
  tenha acima disso entram em `TETOS` (em `guards/sizes.mjs`) com a contagem **do dia da
  migracao** — e uma catraca, nao uma isencao: podem encolher, crescer reprova.
  Medir: `find .agent/scripts .claude/hooks -name '*.mjs' -exec wc -l {} + | sort -rn | head`
- **A fronteira nao se reescreve por `Bash`** (`guard-protected-branch.mjs`): passam a ser
  negados `sed -i`, redireccao, `node -e`, `mv`, `rm` e `chmod` sobre `.claude/settings.json`,
  `.claude/hooks/` e `.githooks/`. Um projeto com um script de manutencao que toque nesses
  caminhos deixa de o poder correr pelo agente.
- **Guard 16 (MCP) alargado** de `.mcp.json` aos quatro agentes: um servidor que ja estivesse
  configurado no Cursor, no VS Code ou no Gemini passa a exigir linha em *Servidores aprovados*.


---

## Porque a regra "nao customizado -> traz-se" e geral, e nao so para workflows

Estava escrita numa linha so, a dos `.agent/workflows/*`. Mas vale para tudo o que o template
produz, e a razao aparece numa renomeacao de IDs: o custo real **nao e um ficheiro** — e todo
o documento do template de que o consumidor guarda uma copia antiga. As rules de referencia,
os `src/docs/`, os guias. Cada um deles cita IDs que deixaram de resolver.

Medido pelo `simulate-upgrade.mjs` na ronda `v0.5.0` -> `TP`: **14 documentos** numa so ronda.
Traze-los um a um seria uma lista a envelhecer; a regra nao envelhece, e e mecanica — um
ficheiro byte-a-byte igual ao do template de origem nao foi customizado, logo nao ha
julgamento a fazer sobre ele.

---

## Porque a configuracao do projeto saiu dos ficheiros da logica

O template misturava, no mesmo ficheiro, a **logica** (que o upgrade traz) e a **configuracao**
(que nao deve trazer). A mitigacao era uma lista de nomes a preservar (`CONSTANTES_DO_PROJETO`),
mantida **a mao** — e uma lista a mao envelhece.

Foi assim que se perdeu uma decisao real. Um consumidor tinha o gate dos bundles **suspenso**,
com ticket aberto e razao escrita; a ronda trouxe o ficheiro, a constante voltou ao default, e o
gate passou a reprovar **sem ninguem decidir nada**.

**O modo de falha e o pior que ha**: nada desapareceu do ecra. O verificador correu, mediu bem, e
so o veredicto mudou. A verificacao que o consumidor tinha era por DIFERENCA de output e nao o
apanhou — diferenca de output apanha o que some, **nao apanha um default que regressa**.

A separacao fecha a classe em vez de a mitigar: o upgrade copia `.agent/scripts/**` por inteiro
e a configuracao ja nao esta la dentro.

### "Nunca tocar" estava errado. A regra e "nunca SUBSTITUIR, copiar se AUSENTE"

A primeira versao desta regra excluia `config/` da copia **por inteiro**. Parecia a leitura
conservadora — na duvida, nao mexer — e estava errada de uma forma que so aparece no consumidor.

O `check-bundle-sizes.mjs` faz `import { TARGETS, ALVOS_REPROVAM } from "./config/bundles.mjs"`.
Um projeto derivado de uma versao **anterior** a esta pasta nao a tem — e na ronda em que ela
nasce, **nenhum tem**. Com a exclusao total, o upgrade trazia a logica nova e nao trazia o
ficheiro que ela importa: o verificador rebentava no arranque, em todos eles ao mesmo tempo.

**Proteger a configuracao partindo o consumidor nao e proteger nada.** "Ausente" nao e o mesmo
que "teu": nao ha decisao do projeto a preservar num ficheiro que o projeto nao tem.

Havia ainda um segundo caso que a exclusao por pasta partia, e que nao se ve pensando so no
primeiro: um consumidor que **ja tem** a pasta e um template que lhe acrescenta um ficheiro
**novo** la dentro. Recusar a pasta por ela existir deixava esse ficheiro de fora para sempre.
Por isso o filtro desce sempre nas pastas e decide **ficheiro a ficheiro**.

**Como apareceu, e o que isso diz.** Nenhuma das 819 assercoes o apanhou. Apanhou-o o
`simulate-upgrade.mjs` no CI, que constroi um consumidor a partir da **ultima tag real** e
actualiza-o. Suites medem o que alguem se lembrou de afirmar; o simulador mede o que acontece a
um projeto verdadeiro. E a segunda vez que a metade do produto que ninguem media foi a que tinha
o defeito. A lista de nomes a preservar passa a poder **encolher**
a cada constante que se mude, em vez de ter de crescer a cada decisao nova.

**Uma expectativa que estava errada, registada porque a proxima pessoa vai te-la:** esperava-se
que mover as constantes encolhesse a suite de testes (que fatiava literais de dentro do ficheiro
da logica). **Nao encolheu** — o ajudante que ESCREVE a config, com a semantica parcial que o
torna correcto, custa tanto como o fatiamento que substituiu. O ganho e o upgrade deixar de
atropelar decisoes; nao e o tamanho.

---

## Os tres defeitos que a simulacao encontrou na primeira corrida

Escritos porque sao a prova de que o caminho do `/upgrade` nao estava medido — os tres viviam
num template com as suites verdes e a cobertura de mutacao completa.

1. **A tabela mandava preservar `CONTAGENS` em `check-test-surface.mjs`**, e ela vive em
   `surface-patterns.mjs`. Um consumidor a seguir a instrucao copiava o ficheiro por inteiro e
   perdia as suas contagens **em silencio** — o gate voltava a medir zero e a dizer "superficie
   intacta" sobre uma suite apagada.
2. **O catalogo de anti-padroes do template era copiado sem substituir placeholders.** Traz um
   placeholder por substituir no titulo, e o Guard 13 reprovava o consumidor.
3. **O cabecalho do `anti-patterns.md` ficava a citar IDs mortos.** A instrucao dizia "nunca
   tocar" nesse ficheiro — certo para as entradas do projeto, errado para o cabecalho, que e
   prosa do template. Depois da separacao de prefixos as citacoes antigas deixaram de resolver.

## Porque o upgrade passou a dizer o que SAIU do template

O upgrade copia com `cpSync`: acrescenta e substitui, **nunca apaga**. Enquanto o template so
ganhou ficheiros, isso nao custou nada. Assim que um for renomeado ou movido, o consumidor fica
com os **dois** — o velho e o novo.

E nao e desarrumacao. A maquinaria reage ao orfao, e reage mal:

- a **descoberta em disco** da varredura encontra-o e exige-lhe par: `SEM PAR`, gate vermelho;
- o **Guard 17** conta-o, e um ficheiro grande que ja nao devia existir volta a pesar;
- o **`check-test-surface`** ve a superficie duplicada, e a contagem que ele compara deixa de
  significar o que significava.

Ou seja: **uma arrumacao de pastas no template punha vermelhos todos os projetos derivados**, por
uma razao que ninguem ia associar a arrumacao. Foi isso que bloqueou a reorganizacao de
`.agent/scripts/` e obrigou a fazer isto primeiro.

### A regra e estreita de proposito

So entra um ficheiro que cumpra as tres: **estava na tag** de onde o projeto saiu, **ja nao esta
no template**, e **ainda existe no consumidor**.

A primeira condicao e a que torna isto seguro. Um ficheiro que o projeto criou nunca esteve na
tag, logo nunca pode ser proposto — e essa e a diferenca entre propor apagar codigo do template
e propor apagar trabalho de alguem. A terceira evita listar o que o projeto ja tratou: uma lista
com entradas inexistentes perde a confianca de quem a le, e ai deixa de ser lida.

**E uma LISTA, nao uma accao.** Apagar e a coisa menos reversivel deste workflow; fica no passo de
aprovacao, onde a Fase 0 manda.

### Dois defeitos que a implementacao revelou

A primeira versao comparava `git ls-tree HEAD` contra `git ls-tree <tag>`. Mas o motor **copia do
disco**, nao do commit — as duas metades respondiam a perguntas diferentes, e um ficheiro ainda
por commitar aparecia como removido. O lado "agora" passou a vir do disco, que e de onde a copia
vem. Duas leituras do mesmo conceito com normalizacoes diferentes: `TP1`, na forma mais barata.

E a fixture nao sabia exprimir uma remocao. O `null` em `hoje` dizia no comentario "este ficheiro
nao existe" e fazia no codigo "nao sobrescrever" — o ficheiro escrito no passo do `ontem` ficava
no disco. A diferenca entre as duas so aparece quando alguem tenta medir uma **remocao**, e foi
exactamente ai que apareceu.

## Porque as mudancas que REPROVAM se anunciam antes de aplicar

A leitura natural de um gate que fica vermelho a seguir a um upgrade e "o upgrade partiu o meu
CI" — e a accao natural a seguir a essa leitura e desfazer o upgrade, ou afrouxar o guard. As
duas sao o contrario do que se queria.

Por isso a Fase 0 anuncia cada uma com o **numero que custa neste projeto**, medido antes de
aplicar. Um limiar que aperta deixa de ser uma surpresa e passa a ser uma decisao: aceitar agora,
adiar, ou nao trazer. O que nao pode acontecer e o projeto ficar vermelho sem ninguem ter
decidido isso — ai o que se perde nao e o gate, e a confianca em todos os outros.

O historico das rondas anteriores esta neste ficheiro, mais acima.

**A lista so serve se for completa** (#175, #184). Medido num derivado real: a 2b mostrou 2 linhas
onde a bateria tinha 19, e entre as escondidas estava um guard do proprio projeto que o upgrade
desligava. Duas causas: guardava-se so a **primeira** linha de aviso de cada comando, e o "antes"
era um conjunto de **comandos** — um comando que ja reprovasse escondia tudo o que passasse a
reprovar por outras razoes. Agora compara-se o multiconjunto das **linhas**, exactas:
normalizar os numeros esconderia `existem 31 -> 33`. Uma linha que so mudou em numeros sai na
mesma, anotada. Um comando que rebenta sem linhas de aviso sai como `exit N`.

**O limite que fica:** a mesma linha antes e depois, com uma causa nova, continua escondida. E a
mesma classe do "default que regressa", mais acima.

**E os blocos `run: |` contam.** A varredura de mutacao do template vive num, e so `run: node X`
numa linha era lido. A NOTE que avisa "o template corre isto e o projeto nao" nunca a nomeava, e
foi para esse caso que ela foi escrita: seis rondas com a varredura comentada. A varredura entra
na comparacao, mas **nao corre na bateria**: demora minutos e mede as suites, nao o projeto. A
saida diz que ficou de fora.

## Porque a medicao da 2b corre do lado do TEMPLATE, apontada ao projeto

A secao 2b promete uma lista — *"o que e que este upgrade faz reprovar neste projeto?"* — e
durante varias releases nomeou um comando que **saltava** no unico sitio onde a secao e lida. Os
dois simuladores recusam-se a correr num derivado (as tags de la sao as releases desse projeto), e
o `/upgrade` so corre num derivado. Quem seguia a secao a letra via um `SKIP`, lia-o como "nada a
medir" e avancava. Foi assim que o #75 — uma mudanca que punha um consumidor a `exit 1` — chegou a
um projeto real: a rede escrita para apanhar aquela classe estava desligada onde a classe ocorre.

**A primeira tentativa foi pelo lado errado, e mediu-se.** O flag comecou por ser
`--template=<clone>`, corrido de dentro do projeto. Montado um derivado real da `v0.14.0` e
corrido o comando, o que apareceu foi o `SKIP` de sempre: um projeto derivado corre a **sua** copia
do simulador, que e a antiga e nao conhece flag nenhum. Um flag do lado do consumidor so serve a
partir do upgrade **seguinte** aquele que o trouxe — e o upgrade que precisa de ser medido e sempre
o que esta a acontecer. Invertida a direccao (`--projeto=<caminho>`, corrido do clone), funciona
no primeiro upgrade de qualquer projeto, incluindo os que sairam de versoes anteriores a esta.

**O antes e o depois sao ambos medidos, e a lista e a diferenca.** Um projeto real pode ja estar
vermelho por razoes suas. Listar tudo o que esta vermelho depois do upgrade era imputar-lhe o que
ele nao fez — e quem lesse a lista uma vez aprendia a desconfiar dela. As duas listas de comandos
tambem sao diferentes de proposito: o ANTES corre os verificadores que o projeto tem hoje, o
DEPOIS os que o template novo traz. Um verificador novo nao pode ter estado verde antes, porque
nao existia; logo tudo o que ele acuse e efeito deste upgrade.

**Nao aplica nada.** A medicao corre sobre uma copia em `tmpdir`, e por isso sai `0` mesmo com a
lista cheia: uma lista cheia e o *output* da secao, nao uma reprovacao. So a impossibilidade de
medir sai `!= 0`. Um instrumento que altera o que mede nao e um instrumento — e ha um teste que
afirma exactamente isso, comparando o `git status` do projeto antes e depois.

**A mecanica e uma so, partilhada pelos dois modos** (`lib/medida-upgrade.mjs`). A pergunta e a
mesma dos dois lados; duas implementacoes a concordar a mao eram o `TP8`, e a do lado menos
corrido envelhecia sem ninguem reparar — que foi, no fundo, a forma original deste defeito.

## Porque a lista das constantes preservadas saiu da tabela do `/upgrade`

A linha dos `.mjs` enumerava-as por extenso — `BANNED`, `CHECKS`, `TEST_GLOBS`, `CONFIG_GLOBS`,
`CONTAGENS` — ao lado do ficheiro de cada uma. Era uma segunda copia de `CONSTANTES_DO_PROJETO`
(`lib/upgrade-mecanico.mjs`), que e a lista que o motor usa de facto, e as duas so podiam
concordar a mao. **Ja tinham divergido**: quando o `CHECKS` mudou para `guards/versions.mjs`, a
prosa ficou a apontar para o sitio antigo e teve de ganhar um aviso entre parentesis a explicar a
mudanca — o sintoma classico de um campo que envelhece (`TP8`). A tabela passa a apontar para a
lista; quem a quiser ler abre o modulo, onde cada entrada tem o comentario que explica porque esta
la. Saiu numa altura em que o ficheiro estava 400 bytes acima do tecto: encolher prosa teria
custado varias passagens, e remover a copia resolveu-o de uma vez, que e o que a nota dos `TETOS`
prescreve.

## Porque o cabecalho do `anti-patterns.md` nao se traz inteiro

A tabela do `/upgrade` dizia, sem ressalva: *"o **cabecalho** e prosa do template e traz-se"*. Uma
instrucao mecanica e para ser cumprida a letra, e cumprida a letra esta poe um consumidor maduro
**acima do tecto**.

**Medido na ronda 6**, num projeto com oito anti-padroes proprios: 11 141 bytes de entradas +
1 811 de cabecalho = **12 952**, contra um tecto de 12 000. O upgrade entregava um ficheiro que o
Guard 1 reprova, e a culpa aparecia do lado do consumidor.

O cabecalho tem duas naturezas, e so uma e para viajar:

- **Regra duravel** (~563 bytes): onde vivem os `TPn` (`anti-patterns-template.md`, nao carregado)
  e a regra do Guard 15 — o mesmo ID definido nos DOIS ficheiros reprova. Isto vale para qualquer
  consumidor, em qualquer momento, e e o que o Guard 15 pressupoe que esteja escrito.
- **Andaime de bootstrap** (~354 bytes): o *"Comeca no primeiro numero"* diz que o prefixo `AP`
  esta todo livre. E conselho para quem tem **zero** entradas. Para quem ja tem oito, e um
  paragrafo pago a cada sessao para dizer algo que ja aconteceu.

A distincao foi feita a mao por quem correu a ronda, e correctamente. O defeito era ela ter de ser
feita a mao: uma instrucao que so funciona se o leitor for cuidadoso nao e uma instrucao mecanica —
e a tabela do `/upgrade` existe precisamente para separar o mecanico do que exige julgamento.

**O que isto nao resolve.** Trazer so a regra duravel deixa aquele consumidor com folga quase
nula, e um projeto que continua a encontrar bugs continua a acrescentar `APn`. A saida estrutural e
a mesma que o template aplica a si proprio: a entrada sempre-carregada fica terse e a evidencia vai
para um `-why`. O `anti-patterns.md` deste repo tem 1 811 bytes; o `anti-patterns-why.md` tem
19 006.

**O que o motor faz (#178).** Ate aqui a regra so estava escrita, e o motor trazia o cabecalho
**inteiro** mesmo assim. Medido no derivado da ronda 7, o ficheiro passava de 11 666 para 12 235
bytes, e o cabecalho que o projeto tinha condensado a mao era apagado. Agora o cabecalho segue a
regra do passo (v): se estiver **intacto** contra a tag, a menos dos placeholders, traz-se o
novo; se estiver **customizado**, nao se toca. Um cabecalho customizado com prosa velha nao fica em
silencio: um ID que ja nao existe e o Guard 15 que o aponta, um intervalo desactualizado e o
G12g, ambos com ficheiro e linha. Quem integra a prosa nova e o consumidor.

**E por isso a prosa que o consumidor guarda nao cita intervalos (#317).** O `anti-patterns.md` e o
`review.md` diziam o intervalo dos anti-padroes do template por extenso, do primeiro ao ultimo. Um
consumidor com o cabecalho customizado fica com essa prosa, e cada `TPn` novo do template punha o
G12g a avisar nele — medido no derivado da ronda 8, depois da v0.58.0. Os dois passaram a dizer "os
`TPn`", que nao envelhece. O titulo do `anti-patterns-template.md` e o `README` continuam com o
intervalo: sao do template, e o G12g mantem-nos certos aqui. Quem ja tem o aviso corrige-o uma vez, na
linha que ele aponta, para a mesma forma.

---

## Duas licoes da ronda 6 — a evidencia das instrucoes que o `upgrade.md` ja traz

Ambas vieram de um `/upgrade` real. **As instrucoes ja subiram para o `upgrade.md`** (#106): a
primeira esta na linha `.github/workflows/*` da tabela da §2, a segunda no bloco de verificacao
da §3. O que fica aqui e o porque — a medicao e a historia do defeito, que e o que pertence a
este ficheiro.

### 1. Um passo COMENTADO conta como AUSENTE

A categoria `.github/workflows/*` diz *"so os jobs em falta, nao substituir o CI do projeto"*.
Um consumidor aplicou-a correctamente e mesmo assim ficou **seis rondas** com a varredura de
mutacao desligada: ela estava **comentada** no `ci.yml` dele, com uma justificacao escrita.

A regra estava certa; a leitura e que nao podia estar. **Um passo comentado nao aparece como "em
falta" — aparece como presente.** Quem compara passo a passo contra o que ja la esta nunca o ve.

A comparacao tem de ser contra o **ficheiro do template**, nao contra a lista de passos activos
do projeto. E a distincao e a mesma que a ronda 6 aprendeu nos ficheiros ao separar *migracao*
de *limpeza*, um nivel abaixo: **desactivado nao e o mesmo que decidido.**

### 2. `git add` ANTES do `check-test-surface.mjs`

O verificador deriva a superficie de `git ls-files`, logo um ficheiro novo **por rastrear nao
conta**. Numa migracao de pastas isso e a diferenca entre **25 avisos com exit 1 e zero**: sem
`add`, os caminhos antigos leem-se como APAGADOS e os novos ainda nao existem para ele.

Nao e defeito do verificador — e o que ele mede, e mede-o de proposito (a baseline tem de ser
uma referencia estavel, e o disco por rastrear nao e). Mas custa uma sessao a quem nao saiba, e
o sintoma parece uma regressao grave em vez de um passo em falta.


## Porque o `--verify ...^{commit}` e obrigatorio ao gravar a marca

O `upgrade.md` §4 diz que e obrigatorio e nao explica porque — a explicacao e esta, e e um modo
de falha silencioso na direcao perigosa.

Sem `--verify`, o `rev-parse main` num template cujo branch principal se chame `master`
**IMPRIME a palavra "main"** em vez de falhar, e grava uma marca invalida. O upgrade seguinte
extrai um SHA vazio, o `git log ""..main` vira `HEAD..main` — que e vazio — e o workflow reporta
**"nada a trazer"**. Ou seja: um template com dezenas de melhorias por trazer aparece como
estando em dia, e ninguem tem como dar por isso.

## O principio por tras da §2b

> Um upgrade que deixa o projeto vermelho sem que ninguem tenha decidido isso e pior do que nao
> ter feito upgrade nenhum.

E daqui que sai a exigencia de **medir antes de aplicar**: nao para impedir que um criterio
aperte, mas para que apertar seja uma decisao tomada por alguem, com o numero a vista.

## Duas consequencias que sairam das celulas "Porque" da tabela da §2

Sairam no #106 por serem historia de defeito e nao ajuda a decidir. Ficam medidas:

- **`.agent/scripts/**/*.mjs`** — uma copia cega devolve o gate a medir zero. **Ja estava medido
  aqui**, em *"Os tres defeitos que a simulacao encontrou"*, ponto 1 — nao se repete.
- **`.claude/hooks/*`** — trazer os hooks sem `.claude/hooks/tests/` deixa um hook sem testes, e
  um hook errado **bloqueia trabalho legitimo em silencio**, antes de cada ferramenta.

## Um passo que o template moveu de job sai do job antigo (#158)

A tabela traz para um projeto **so os jobs em falta** — e e o certo: o CI do projeto tem passos
proprios. Mas um passo que o template MOVEU de um job para outro aparece, no projeto, nos dois: no
job novo (que estava em falta e foi trazido) e no velho (que o projeto ja tinha e ninguem tocou).

O #158 tirou os dois simuladores do `guard-tests` para um job `simulators`. Num derivado isso custa
segundos — os simuladores dao `SKIP` fora do template —, e foi por isso que a variante escolhida foi
essa. A variante recusada mostra o custo do caso geral: mover a **varredura de mutacao** pu-la-ia a
correr duas vezes em cada PR de um derivado que ja a tem no `guard-tests`, ~30 min a mais num repo
privado, sem nada que o apanhasse. (Ate ao #308: hoje a varredura tem o job dela, e a 2b e o
`check-test-surface` apanham esse estado — § "Porque a varredura saiu do `guard-tests` para um job seu".)

**Nao e mecanico, e fica dito**: o `lib/upgrade-mecanico.mjs` nao toca no `.github/` (os jobs em
falta sao categoria de julgamento), logo o `simulate-upgrade` nao mede esta linha. E uma instrucao a
quem corre o `/upgrade`.

**O job `simulators` nao se traz** (leitor independente do #158): trazido, um derivado ficava com um
job inteiro — checkout completo, setup, dois `SKIP` — **verde sem ter medido nada**, a forma mais
suave do `TP2`. Num derivado basta tirar os dois passos do seu `guard-tests`; nao fica mais lento
nem menos coberto, porque eles ja davam `SKIP` la.

**E num repo com branch protection**: se o `Guard Tests` for required check, os simuladores deixam de
bloquear o merge ate o `Simuladores` passar tambem a required. Este template tem um ruleset no `main`
desde 2026-10-09 (exige `Guard Tests`, `Secret Scan`, `Code Quality` e os dois `Analyze`; ate ao #347
era `Detect Project` em vez do `Code Quality`) — e o `Simuladores` nao esta nele (medido a 2026-10-13,
#308; a lista, a 2026-10-20).

## Porque o que o git do template IGNORA nao se copia (R7-D)

O motor copia do **disco** do template, e e de proposito: o `simulate-upgrade` corre antes do
commit, e um ficheiro novo ainda por commitar tem de contar como do template (ver o
`arvoreNoDisco`). Mas o disco de quem mantem o template tem tambem o que o git dele **ignora**, e
o `andaFicheiros` so saltava `.git`. Na ronda 7, os `RELATORIO-*.md` ignorados aterraram na copia
de um derivado real; na reproducao, `settings.local.json`, `credentials.json`, `*.pem`, `id_rsa`
e `node_modules/` iam pelo mesmo caminho. O `.env` so escapava porque a extensao dele nao passa
no filtro dos substituiveis: por acaso, nao por desenho.

**Onde doi.** O motor escreve em copias em `tmpdir` (a do simulador e a da §2b), nunca no projeto.
O custo e duplo: a medicao da §2b corre sobre ficheiros que o projeto nunca vai ter, e da avisos
que nao sao dele; e uma chave do mantenedor e copiada para `tmpdir`. O risco para o projeto real
e a **mesma copia feita a mao**, com um `cp -R` da arvore de trabalho do `$TPL` — dai a linha na
tabela: a mao, so o que o `git ls-files` lista.

**Duas camadas** (`lib/fora-do-template.mjs`):
1. **O que o git ignora**, perguntado ao proprio git (`ls-files --others --ignored
   --exclude-standard --directory`). Nunca reimplementar o `.gitignore`. Se o git nao responde, o
   motor reprova: "nao ignora nada" e "nao consegui perguntar" nao sao a mesma resposta (`TP2`).
2. **Nomes de segredo fixos**, para o dia em que o `.gitignore` do mantenedor nao cobrir uma chave
   (sem distinguir maiusculas), e o lixo do SO e as dependencias (`.DS_Store`, `node_modules/`), com
   razao propria. Falha para o lado seguro, e nao em silencio: o que fica de fora vai em
   `naoCopiados`, e os dois modos mostram-no.

**Dois cuidados que o leitor independente encontrou**, e que os testes agora fixam: o git devolve
os nomes em NFC no macOS e o disco pode te-los em NFD, logo os dois lados normalizam-se antes de
comparar; e a fixture desliga o `.gitignore` GLOBAL de quem corre, que de outro modo fazia o teste
da segunda camada reprovar numa maquina com `*.pem` la (`TP3`). O motor em si respeita-o.

**Ficou de fora uma entrada no catalogo.** A licao merecia um anti-padrao do template, mas o
`anti-patterns-template.md` esta nos 11 969 bytes, a 31 do tecto do Guard 1e. Arranjar espaco e
condensar entradas antigas, e isso e trabalho proprio.

## Porque os guards proprios de um derivado vivem na `config/` (#176)

Num derivado real, o `/upgrade` desligou dois guards do proprio projeto. Os modulos
(`guards/pt-pt.mjs`, `guards/conflict-markers.mjs`) ficaram no disco; o que se perdeu foram as
**ligacoes**: o `import` e a chamada no `check-doc-versions.mjs`, e o par no `lib/pares.mjs`. Os
dois ficheiros sao do template e o upgrade substitui-os por inteiro. O `check-doc-versions` ficou
verde, e quem deu por isso foram os testes do proprio derivado. Sem eles, perdia-se em silencio.

**A regra e a mesma da configuracao, e por isso nao precisou de mecanismo novo:** o que e do
projeto vive na `config/`, que o upgrade nunca substitui, e copia se faltar.
`config/guards-do-projeto.mjs` declara os guards (`GUARDS`), os pares (`PARES_DO_PROJETO`) e as
pastas de scripts do Guard 20 (`PASTAS_DE_SCRIPTS`, que vivia dentro do `guards/citacoes.mjs`).
Uma ligacao partida (um modulo que nao existe, ou que nao exporta a funcao) da WARN.

**Preservar os imports por nome foi recusado:** era mais uma lista a mao, e esta lista existe para
desaparecer (`CONSTANTES_DO_PROJETO`).

**E uma rede do outro lado:** o motor passa a listar os ficheiros da maquinaria que o projeto
**alterou** e que a copia vai substituir (`substituidos`). Nao impede a copia; diz, antes de
aprovar, o que vai deixar de estar como o projeto o tinha. Foi o que faltou para o R7-A se ver
antes de partir.


## Porque um derivado sem as rules do bootstrap passa a avisar (#190)

O `business-logic.md` e o `pages-architecture.md` sao gerados pela Fase 2.2 do `BOOTSTRAP.md`, e
o `CLAUDE.md` importa-os. No template por estrear, a falta deles e esperada, e os Guards 1 e 8
dao SKIP. Num derivado davam o **mesmo** SKIP e saiam 0, com dois `@import` pendurados: o
agente carregava menos contexto do que o `CLAUDE.md` dizia, e nada o denunciava.

Agora, num derivado, a falta e WARN nos dois guards. Um projeto que nunca as gerou recebe esses
dois avisos no primeiro `/upgrade` que traga esta versao. E o comportamento pretendido, e
resolve-se gerando-as. Um projeto que as dispense de proposito tira os `@import` dos pontos de
entrada: os dois guards so avisam de uma rule que o `CLAUDE.md` importa.

## Porque uma entrada propria na `CONTAGENS` passa a pedir teste (#183)

O `surface-patterns.mjs` e do template, mas a `CONTAGENS` e do projeto: o bootstrap manda
acrescentar-lhe o vocabulario dele (`check(`, `assertThat(`), e o upgrade preserva-a. Desde o #183
a varredura de mutacao desliga cada entrada das tabelas e reprova se nenhum teste o notar,
porque 17 de 47 podiam ser apagadas com a suite verde.

**O que isto pede a um derivado:** cada entrada que ele tenha acrescentado precisa de um teste que
a exija, num `tests-surface-*.mjs` dele. O upgrade nunca apaga esse ficheiro, e a descoberta
encontra-o. Sem o teste, o primeiro PR que toque em `.agent/scripts/` depois do upgrade da
`INCOMPLETA` na varredura do CI, a nomear a linha. A §2b nao o mostra antes, porque a bateria
dela nao corre a varredura (minutos).

## Porque a varredura saiu do `guard-tests` para um job seu (#308)

Num derivado privado (2 vCPU) o `guard-tests` chegou aos **51 dos 75 min** (PR #80 do
o derivado privado B), com as suites e as duas varreduras **em serie** (os tempos de cada uma: o
cabecalho do `mutation-sweep.mjs`).
A margem era mais ou menos uma ronda do tamanho da 8, e um job morto pelo tecto le-se como defeito.
O job `sweep` corre as duas varreduras numa matriz, em paralelo, e partilha a mesma condicao ("o PR
toca nos verificadores") — o tempo de parede passa a ser o da maior. Desde a parte 2 do #308 a
completa e ela propria repartida em **2 shards** (`SWEEP_SHARD`), e o `guard-gate` confere os
relatorios de todos (`lib/varredura-shards.mjs`): cada shard so ve a sua fatia, e um em falta
ficava verde.

No #158 ela tinha ficado de proposito no `guard-tests`: move-la poria a correr DUAS vezes num
derivado que ja a tem. O que torna o movimento seguro agora e que cada estado mau de um derivado
tem quem o diga (medidos, com teste — duas leituras independentes do #308; as duas linhas marcadas
"runtime" dependem do GitHub a correr, e estao por raciocinio, nao por suite):

| Estado do derivado depois do `/upgrade` | Quem o diz |
|---|---|
| varredura ausente ou comentada (pode ser decisao: a regra diz "nenhum dos dois") | 2b: "o template corre ... (job `sweep`)" |
| varredura ainda no `guard-tests` | 2b: "corre no job `guard-tests` deste projeto, e no `sweep` do template" |
| varredura nos dois jobs (corre 2x) | 2b, e o `check-test-surface` (a §3 manda correr a 2b de novo depois de aplicar) |
| `sweep` trazido sem o `guard-gate` (a varredura fica fora do check exigido) | `check-test-surface`: "sem um agregador que leia `needs.sweep.result`" |
| `guard-gate` trazido sem o `sweep` (`needs:` partido: o GitHub rejeita o workflow inteiro) | `check-test-surface` |
| o `guard-tests` e o `guard-gate` com o mesmo nome (dois `Guard Tests`) | `check-test-surface` |
| o `guard-gate` mudado (o `case`, o `always()`, o `needs:`) | `check-test-surface`: um agregador e uma unidade da maquinaria (com saida pelo trailer) |
| `sweep` sem shards, com o template em shards | 2b: "reparte a varredura completa em shards ... trazer JUNTOS" |
| (C2, #347) o `if:` do plano no `sweep` sem o shell do portao novo: cada PR sem maquinaria fica vermelho (o portao antigo le o `sweep` saltado como "nao mediu") | 2b: "o template so arranca os shards ... quando o plano da base diz"; o vermelho e do proprio portao — fechado |
| (C2, #347) o shell do portao novo sem o passo do plano e o `if:` (por exemplo, trazido com a nota do salto do merge): `PLANO_JOB` vazio, cada PR vermelho | as duas notas da 2b dizem que o shell traz o plano; o vermelho e do proprio portao — fechado |
| (C2, #347) o `if:` do `sweep` noutra forma que nao a do template | `check-test-surface`: "condicao `if:`", sem trailer que a aceite (a isencao so vale para a forma exacta) |
| a matriz em shards trazida SEM os passos do portao no `guard-gate` (um shard em falta passava verde) | `check-test-surface`: "nenhum job confere os relatorios deles" |
| o portao trazido sem os MODOS, ou com modos que nao sao os da matriz (#317: um modo que deixasse de correr passava verde; um a mais punha todos os PRs vermelhos) | `check-test-surface`: "nao recebe o(s) modo(s)" / "exige o(s) modo(s) ... que a matriz nao tem"; em runtime, o portao: "nenhum relatorio" |
| (runtime) o portao trazido sem o passo do relatorio, ou sem `lib/varredura-shards.mjs` no disco | o proprio portao reprova ("nao consegui ler" / modulo em falta) — fechado, mas a causa e esta linha |
| (runtime) o `ci.yml` novo com o `mutation-sweep.mjs` antigo (ignora o `SWEEP_SHARD`, nao escreve relatorio) | o upload reprova (`if-no-files-found: error`) — fechado; trazer os scripts com o workflow |
| uma protecao que exija os checks das pernas pelo nome (`Mutation sweep (completa)`): com os shards passam a `(completa 1/2)`, `(completa 2/2)` e `(skips 1/1)`, e o antigo nunca aparece — os merges bloqueiam | ninguem automaticamente: o exigido e SO `Guard Tests` (o comentario do `guard-gate` di-lo desde a v0.58.0); quem tenha exigido as pernas troca-as por ele |

Os defeitos de estrutura (as linhas do `check-test-surface` sem trailer) so se dizem quando o PR
os INTRODUZ: um defeito que ja existia deixava vermelho cada PR que tocasse no workflow — os do
Dependabot incluidos, que nao escrevem trailer. E so contam nomes repetidos que envolvam a
maquinaria: `name: Deploy` em staging e prod e idioma legitimo. Um derivado com um `name:` proprio
no `guard-tests` (o que a sua protecao exige) passa-o ao `guard-gate` — a regra da §2 diz "herda".
Agregador e quem LE `needs.<X>.result` de um job com maquinaria, e nao quem so depende dele: um
`deploy` a jusante das suites nao decide gate nenhum (duas leituras independentes do #308).

A uniao dos dois jobs nao chegava: um derivado com a varredura no `guard-tests` dava o MESMO
conjunto que o template com ela no `sweep`. Por isso a 2b compara job a job (`comandosPorJob`).

**E o nome do check.** Uma protecao exige checks pelo NOME, e a deste repo exige `Guard Tests`. Mover a
varredura para um job seu tirava-a desse check: um PR com a varredura vermelha passava a poder ser
mergeado, sem nenhuma definicao mudada. Por isso `Guard Tests` passou a ser um job AGREGADOR
(`guard-gate`, `needs: [guard-tests, sweep]`, `if: always()`), e o das suites chama-se `Guard Suites`.
Nenhum repo precisa de mexer na protecao. O `always()` e excecao a marca do `if:` (so alarga onde o
job corre; sem ele, um `needs` vermelho SALTAVA o gate, e um check saltado conta como passado).

**O custo num privado free** (minutos faturados; cada job arredonda ao minuto): os tres jobs da
matriz (dois shards e a `--skips`) so arrancam num PR em que o plano da base diz que a varredura se
aplica (o C2 do #347; antes, faziam checkout e setup em todo o PR para dizer "nao aplicavel"), e o
gate corre sempre; e cada shard repete as baselines e as provas do prefixo que a sua
fatia pede — ~+4-6 min por PR que toca nos verificadores, contra metade do tempo de parede da
completa, e ~+1 por push. O `sweep` espera pelas suites (`needs: guard-tests`): com elas vermelhas nao
gasta ~40 min a medir um gate ja condenado. Num publico nao se paga. Os tempos medidos (o do derivado
incluido) vivem so no cabecalho do `mutation-sweep.mjs` (`TP8`).

## O que a medicao da 2b faz, e nao faz

Corre sobre uma copia em `tmpdir`: **nao toca neste projeto**. Sai `0` mesmo com lista cheia — uma
lista cheia e o output da secao, nao uma reprovacao. So a impossibilidade de medir sai `!= 0`, e ai
diz porque. Sem `.agent/.template-version` utilizavel recusa-se: e o **Modo B**, e ai a lista faz-se a
mao com a tabela da §2. (Saiu do `upgrade.md` no #308, quando a regra da varredura precisou do espaco.)

## Porque a fronteira e passo do utilizador (#304, R7B-2)

A tabela dizia, para `.claude/hooks/*`: "Substituidos pelo motor". Mas o motor (`aplicaUpgradeMecanico`)
so corre sobre COPIAS — o simulador e a 2b —, e nao ha ponto de entrada que o aplique ao projeto real.
Um derivado (ronda 8) leu a linha a letra, correu o motor num clone em scratch, trouxe tudo **menos** a
fronteira, e o utilizador copiou-a a mao: funcionou, mas a decisao foi do agente e contra a letra do
workflow. E a letra estava errada por outra razao: um agente que copie `.claude/hooks/**` ou
`.githooks/**` reescreve a propria fronteira — o hook nega-o por `Bash`, e o `ask` do settings pede
aprovacao por `Edit` (#301). E por isso que e do utilizador, fora do agente, e nao uma decisao
caso a caso. A 2b aplica o motor a uma copia, lista o que la mudou (`lib/fronteira-upgrade.mjs`) e deixa num
staging que persiste a versao PROCESSADA — nunca a do `$TPL`, que as duas leituras independentes
mostraram partir o derivado: os hooks trazem `{{ PROJECT_NAME }}` (o Guard 13 reprovava cada um), o
`IA` do `commit-msg` e constante do projeto, e o `protegidos.json` MIGRADO do hook (#257) e a lista
dos branches dele — sem ele, o hook novo caia nos de omissao. Os comandos vem prontos para um
terminal novo: `cd` absoluto, plicas, `mkdir -p` onde falta a pasta, `rm` do que saiu, e — num ficheiro
que o projeto alterou (um `SEGUROS` customizado) — um `diff -u` e o `cp` COMENTADO, para decidir antes. O `.githooks/` saiu,
pela mesma razao, da linha da "copia limpa".

**"Do utilizador" e aprovacao humana por ficheiro**, nao um tipo de comando: o `cp` que ele corre, ou
um `Edit`/`Write` do agente que o `ask` faz aprovar (o caminho que a mensagem do hook ja indica). O que
fica fechado e o caminho que ninguem aprova: o motor, ou um `cp` do agente. O `.claude/settings.json`
e so dele — o `deny` proibe-o ao agente por inteiro; o agente propoe o texto. E os `.claude/agents/`
pelo mesmo `ask`, nunca por `cp` (que o contornava): o `tools:` deles e o que o hook impoe aos
subagentes. A §3 corre depois da fronteira aplicada, e a marca da §4 so se grava com ela — senao o
proximo `/upgrade` ja nao listava o que dela SAIU (os `muda`/`novo` voltavam, as remocoes nao).

**A fronteira sai por ULTIMO na 2b (#317).** O bloco media-se e imprimia-se a meio, e a adaptacao do
Guard 17 que vem depois pode acabar em `fatal`: ficavam no ecra comandos de uma medicao que falhou, e um
staging orfao no tmpdir. Agora mede-se no mesmo sitio (sobre a copia como o motor a deixou, com os bytes
lidos logo ali, antes da bateria correr sobre ela) e imprime-se no fim. No mesmo bloco: onde LIGAR cada
hook novo (o evento e o matcher do `settings.json` do template, nao so o caminho), a ligacao que mudou num
hook que o projeto ja tem, os ficheiros da fronteira marcados na lista do que saiu (o `rm` e do
utilizador, nao do agente), e o staging, que persiste de proposito entre a 2b e o `cp` — e por isso so o
utilizador o apaga (§5).

## As classes de "mudancas que reprovam" (taxonomia da 2b)

Saiu do `upgrade.md` no #304, quando a fronteira precisou do espaco. Serve para **reconhecer** uma
destas, e para as fazer a mao no Modo B; a lista em si mede-se (`simulate-upgrade.mjs --projeto`).

| Classe | Como reconhecer | A decisao |
|--------|-----------------|-----------|
| **Limiar apertado** | um numero desceu num guard (bytes, tamanho, cobertura) | encolher ate caber, ou congelar em catraca |
| **Alcance alargado** | o guard le ficheiros que antes ignorava | dizer quais, e o que aparece neles hoje |
| **Verbo negado** | um hook recusa algo que o projeto usa | listar esses comandos antes de trazer o hook |
| **Verificacao nova sem dados** | um guard novo exige algo que o projeto nao tem | acrescentar o que falta, ou nao trazer o guard — **nunca** trazer e deixar vermelho |

**A auditoria do #304** (dois auditores, depois de quatro leitores) acrescentou cinco regras ao bloco: o
Modo B, que nao tem 2b, faz a fronteira por `Edit` com as mesmas tres regras que o staging aplica
(placeholders, `CONSTANTES_DO_PROJETO`, `protegidos.json`) — a tabela do `main` dizia-as, e a primeira
versao do #304 tinha-as perdido; um projeto sem nada em `.claude/` nao recebe hooks nem agentes; uma
pasta da fronteira que e symlink (`.githooks` -> `.husky`) e as colisoes de um adotado ficam de fora;
o que a arvore de trabalho ja tem igual ao staging conta como aplicado (a 2b corrida outra vez na §3
nao o repete); e os `.claude/agents/` intactos saem no mesmo bloco. Os achados baixos ficaram no #317.


## O contrato da lista de nomes proibidos (#375)

A lista vive FORA do repo, e um derivado que a use depende de tres coisas que o template nao pode mudar sem
avisar:

- **O caminho:** `$NOMES_PROIBIDOS_FICHEIRO`, ou, sem ela, `~/.config/agent-template/nomes-proibidos`.
- **O formato:** um nome por linha; `#` no inicio comenta; as linhas em branco, e as sem nenhuma letra ou digito,
  nao contam. `-`, ` ` e `_` sao o mesmo separador, a caixa nao conta, os dois lados vao a NFC (os acentos
  contam), e um nome dentro de uma palavra maior nao casa.
- **Os estados:** sem ficheiro no caminho por omissao, o `commit-msg` passa calado e o `check-textos-publicos.mjs`
  sai `2`; uma lista ilegivel (com a variavel apontada para um ficheiro em falta, ou um symlink sem alvo), vazia ou
  DENTRO do repo recusa nos dois.
- **O interruptor por repo:** a lista vale para todos os repos de quem a tem, e num derivado PRIVADO os nomes dela
  podem ser legitimos (o proprio nome do repo). `git config --local agent-template.nomesProibidos desligado`
  desliga-a nesse repo: o `commit-msg` passa, e o comando sai `2` a dize-lo. So a config local conta.

A lib (`.agent/scripts/lib/nomes-proibidos.mjs`) chega pelo `.agent/scripts/`, que o `/upgrade` copia sozinho;
o `commit-msg` que a importa vem pela fronteira (`.githooks/`). Entre os dois passos, um `commit-msg` antigo
continua a funcionar sem os nomes, e um novo sem a lib recusa com a razao — nunca passa em silencio.
