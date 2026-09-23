# `/review` — de onde vieram as regras e o que custaram ({{PROJECT_NAME}})

> **NAO carregado no contexto.** Par de `.agent/workflows/review.md`, tal como
> `ticket-method-why.md` e par de `ticket-method.md`: as **instrucoes** vivem no workflow
> (lido por inteiro sempre que o comando e invocado, com orcamento de bytes), a **evidencia**
> vive aqui.
>
> Porque separado: o workflow chegou a 11 892 bytes de um gate de 12 000 — **108 de folga**, e
> uma nota de processo de 101 bytes deixou de caber por 7. Um ficheiro sem folga nao trava o
> crescimento, trava a **manutencao**: o que ficou de fora nao foi prosa decorativa, foi uma
> regra que o Guard 21 reprova quando alguem a ignora.
>
> Ler on-demand: ao discutir uma seccao, ao mexer na escala por tamanho, ou quando o workflow
> aponta para aqui.

---

## Porque a checklist tem escala por tamanho

Ela nao escalava: um ticket `S` (**< 30 min** no backlog) pagava as mesmas caixas que um `L`.
Com o `/review` a cobrar dezenas de caixas ao lado das do `sync-docs.md`, um ticket de meia
hora pagava **~100 itens de processo**.

Um processo que custa tanto como o trabalho e abandonado ao terceiro ticket, e a partir dai
nao protege nada — passa a ser uma regra violada a 100%, que e uma licao de que as regras se
ignoram. A aritmetica completa esta em `ticket-method-why.md`.

## Porque uma seccao saltada se diz em voz alta

Uma seccao saltada **em silencio** e indistinguivel de uma seccao **esquecida**. O objetivo da
escala e tornar a diferenca visivel, nao dar cobertura a trabalho por fazer: quem le o
relatorio da Fase 5 tem de conseguir separar "nao se aplica a um `S`" de "passou-me".

E a mesma razao pela qual um `S` que revele algo maior deixa de ser `S`. A escala e uma
previsao sobre o tamanho do trabalho, e uma previsao desmentida pelos factos actualiza-se.

## Porque a lista de suites da camada de agente nao se escreve no workflow

Ela esteve escrita a mao, e envelheceu: a copia no workflow tinha ficado em **6 das 12**
suites. Um agente que a seguisse corria metade e marcava a checkbox na mesma — com razao, do
ponto de vista dele, porque cumpriu a instrucao que tinha a frente.

A fonte e o `ci.yml`, que e o que de facto corre no portao, e a instrucao passou a derivar a
lista de la em vez de a repetir. E o mesmo principio dos guards da serie 12: uma contagem
mantida a mao ao lado da fonte diverge, e nada no ecra o denuncia.

## Porque o template nu nao tem os passos de build

Um template por estrear nao tem `package.json`, logo `npm run typecheck` e `npm run build`
saem em erro com "Missing script" — e desse erro nao se conclui nada sobre o projeto.

O que substitui esses passos nesse estado sao as suites de `.agent/scripts/` e o job
`guard-tests` do CI, que correm sem app nenhuma. A partir do momento em que o projeto tem app,
os passos passam a valer por inteiro. Distinguir os dois estados importa porque um verde
obtido por o comando nao existir nao e um verde.

## Porque o CHANGELOG e o `.agent/context/` ficam vazios no template

Sao o **estado inicial que cada projeto derivado herda**. Escrever historia do template neles
daria a cada projeto novo um passado que nao e o dele: um CHANGELOG com releases que ele nunca
fez, um `session.md` com o trabalho de outra pessoa, um backlog com items de outro produto.

Um derivado que comece assim tem de **apagar** antes de poder escrever, e o que se apaga a
pressa apaga-se mal. Ficarem vazios e o unico estado em que o primeiro commit do consumidor
significa o que diz.

Num projeto derivado a regra vale por inteiro — la, esses ficheiros sao o estado do projeto, e
o Guard 21 salta precisamente por isso.

## Porque a Fase 4 nao substitui o `/review`

O `/review` e a Fase 3: o **teu** julgamento sobre o que escreveste. A Fase 4 e outra coisa —
**outra leitura, sem o raciocinio de quem escreveu**.

A diferenca nao e de rigor, e de ponto de partida. Quem escreveu o codigo le-o atraves da
intencao que tinha; uma segunda leitura so ve o que la esta. E por isso que a Fase 4 nao corre
a app nem olha para o output: se olhasse, estaria a repetir a Fase 3 com outro nome, e duas
passagens iguais nao valem mais do que uma.

Nesta sessao a Fase 4 apanhou, num so ticket, quatro copias a mao por corrigir e um teste que
ficava verde com o guard cego — nenhuma das duas visivel a quem tinha acabado de as escrever.

## Porque cada achado da Fase 4 se verifica, e porque se pergunta pelas ferramentas

**Subagentes alucinam.** Um achado que nao se confirma contra o ficheiro real custa mais do
que nao o ter tido: manda-se alguem investigar um defeito que nao existe, e ao fim de dois ou
tres desses a leitura independente perde credito e deixa de ser corrida. Verificar antes de
agir e o que a mantem util.

**E o campo `tools:` do frontmatter nao entrega necessariamente o que declara.** Um subagente
que julgue nao ter `Bash` responde por leitura onde podia ter medido, e um que o tenha sem o
saber nao o usa. Pedir-lhe que enumere as ferramentas que tem de facto custa uma linha e
decide se o que ele devolve e medicao ou leitura.
