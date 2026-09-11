# Porque o metodo por ticket e assim ({{PROJECT_NAME}})

> **Leitura de humano, uma vez.** As **instrucoes** — o que fazer, em que ordem, onde parar —
> estao em `.agent/rules/ticket-method.md`, que o agente reabre a cada ticket `M`/`L`. Este
> ficheiro e a **evidencia**: de onde veio cada regra, o que foi medido, e o que custa.
>
> Estao separados porque servem leitores diferentes. Um agente a comecar um ticket precisa das
> instrucoes; misturar a evidencia com elas levou o ficheiro de instrucoes aos 16 KB, relidos
> por inteiro a cada ticket. As secoes abaixo seguem a ordem das fases, para se poder ir
> direto ao _porque_ de uma regra concreta.

## De onde vem cada regra

Nenhuma foi inventada em abstracto. Cada uma veio de um erro **que aconteceu** — metade neste
repo (marcadas `T`, de template) e metade num projeto construido a partir dele (`P`), que e a
razao de estarem aqui: sao as que qualquer projeto repete.

| Erro real | Regra que ficou | |
|-----------|-----------------|-|
| Um `tail -1` mostrou `125 passed` e engoliu o `1 failed` | **Nunca filtrar** o sumario de uma corrida (Fase 2) | `P` |
| Uma assercao passava com o defeito no ecra — um `toHaveCount(0)` cumpre-se no primeiro instante em que a contagem e zero | Cada teste novo nasce com o seu **controlo negativo** (Fase 1) | `P` |
| Duas passagens de `/review` seguidas nao encontraram nada, por serem a mesma checklist | Cada passagem **declara o angulo** antes de correr (Fase 3) | `P` |
| Uma varredura reportou `39/39` medindo **3 sitios de 21**: o padrao so via `warn(`, e o verificador emitia por um wrapper `flag()` | Cobertura de mutacao **derivada por script**, nunca contada a mao (Fase 1) | `T` |
| Um check de seguranca — o que obriga a pedir autorizacao antes de `git commit`/`push` — podia ser desligado com a suite **toda verde** | O **leitor independente** da Fase 4 e obrigatorio num `L` ou no nucleo do dominio | `T` |
| Faltava um verificador **inteiro**: um placeholder esquecido no bootstrap nao avisava ninguem | **Usar** o que se construiu — nenhuma revisao encontra codigo que nao existe | `T` |
| Seis passagens minhas declararam o trabalho limpo; uma leitura independente achou tres defeitos ALTO em 16 minutos | "Validei e esta limpo" **nao e informacao** quando o validador e o autor | `T` |
| Um `npx prettier` num projeto sem prettier inflou um diff para `+225/-99` | **Nao reformatar o que o ticket nao toca** (Fase 1) | `P` |

> Num projeto derivado, **substitui estas linhas pelas tuas**. A tabela vale pelos erros que
> *tu* cometeste: sao esses que a tua equipa reconhece e por isso respeita.

---

## Fase 1 — porque a cobertura de mutacao e um piso e nao um teto

> Mediu-se as duas coisas na mesma sessao. O `check-backlog.mjs` tinha **12/12** sitios
> cobertos **e**, ao mesmo tempo, respondia `Backlog vazio — nada a validar` com exit `0` a um
> backlog com tres items cujas seccoes tinham sido renomeadas. A cobertura estava perfeita; o
> aviso que faltava nem existia para ser coberto. Foi um **angulo** da Fase 3 (acoplamento)
> que o apanhou, nao a varredura. Cobertura de mutacao e um piso, nao um teto.

### Padroes reais de assercao que nao afirma nada

As tres formas que se mediram, e que a Fase 1 existe para apanhar antes de chegarem ao repo:

| Forma | Porque passa sem afirmar |
|---|---|
| Assercao de **visibilidade sem limiar** | cumpre-se com **um pixel** visivel; o elemento pode estar praticamente fora do ecra |
| Assercao de **contagem zero** | cumpre-se no **primeiro instante** em que a contagem e zero — antes de a UI re-renderizar, nao depois |
| Assercao de **texto contra o output inteiro** | e satisfeita por **outra** verificacao que a mesma mutacao tambem disparou (ver `AP1`) |

A terceira e a que mais reincide em repos de verificadores: numa sessao apanharam-se **tres**
testes assim, todos escritos na mesma sessao em que o `AP1` estava a ser documentado. Nenhum
foi encontrado a ler — os tres sairam do **controlo negativo**, que e precisamente a regra que
a Fase 1 impoe.

## Fase 3 — porque a paragem e um ponto de decisao e nao um numero

> **"A ultima passagem nao encontrou nada" nao e "esta limpo".** Nesta sessao mediu-se as
> duas faces. Cinco de seis passagens renderam num ticket `L`, e declarar "rendimento
> decrescente" a quarta estava errado — a quinta encontrou tanto como a segunda, porque mudou
> de **angulo**. Mas tambem: a ronda que nao encontrou nada **nao** foi o fim — a passagem
> seguinte, de **uso** (secao anterior), achou um defeito de desenho que nenhuma das cinco
> revisoes viu. Por isso a ausencia de achados encerra a *passagem*, nunca o *ciclo*: quem
> encerra o ciclo e o utilizador, informado do que ainda nao foi olhado.

### O que apresentar no ponto de decisao, e porque cada item la esta

| Item | Porque, sem ele, a escolha nao e informada |
|---|---|
| Achados desta ronda, **com a medicao** | "estava pequeno" nao e um facto; o numero e |
| Angulos ja usados **e os que faltam** | e o unico item que diz **onde ainda nao se olhou** — sem ele, "mais uma ronda" e uma aposta |
| O que fica em aberto **de proposito** | um limite nomeado e uma decisao; omitido, e uma surpresa |
| Custo gasto e custo de mais uma ronda | e o que torna "chega" defensavel em vez de arbitrario |

O agente **propoe** a opcao que recomenda, e nao a assume. As tres escolhas — aceitar assim,
mais um ciclo com angulo novo declarado, ou corrigir X por inteiro primeiro — estao na tabela
do `ticket-method.md`.

---

## A fase que nao e do agente: usar

Depois de cada ticket, **uma passagem a usar o que mudou**. Num produto com UI, e abrir o
ecra; numa lib, e consumi-la de fora; num template, e criar um projeto a partir dele.

Isto nao e opcional nem cosmetico, e a medicao e especifica. Numa sessao real:

- **A revisao** (Fases 2-3, seis passagens) encontrou 22 defeitos — todos em codigo escrito
  minutos antes.
- **O leitor independente** (Fase 4) encontrou, em dezasseis minutos, tres defeitos ALTO que
  as seis passagens nao viram — incluindo um check de seguranca que podia ser desligado com a
  suite toda verde. A revisao falhou ai porque quem escreveu o teste **sabe o que ele queria
  dizer**.
- **Usar** encontrou o que nao existia: simular o bootstrap revelou que faltava um verificador
  inteiro (nenhuma revisao podia encontrar codigo ausente); converter o repo para CRLF revelou
  dois testes que nao afirmavam nada; e correr um gate de CI a serio revelou que ele passava
  com zero verificacoes.

Nenhum destes tres substitui os outros. O erro nao e escolher mal — e escolher so um.

---

## O que custa

Aplicado por inteiro a tudo, multiplica o tempo por ticket por **2 a 3**. E por isso que tres
fases escalam por tamanho: sem escala, o metodo e abandonado a segunda semana.

A **Fase 4** e a unica com um custo grande e mensuravel. Medido neste repo: uma passagem sobre
dois commits (33 ficheiros) consumiu **~168k tokens** e 16 minutos, e devolveu tres defeitos
ALTO que seis passagens minhas nao viram — um deles a fronteira de seguranca. E cara e vale a
pena onde a tabela da Fase 4 diz que corre; nao vale num `S`.

O resto e quase gratis em tempo de maquina: os controlos negativos correm com a suite, e a
varredura de mutacao custa minutos **uma vez** por alteracao a um verificador, nao por commit.
