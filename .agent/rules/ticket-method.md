# Metodo de Trabalho por Ticket ({{PROJECT_NAME}})

> **Nao carregado automaticamente.** O ponteiro obrigatorio vive em `process-rules.md`
> ("Metodo de Trabalho por Ticket"); este ficheiro e o detalhe, aberto ao iniciar um ticket
> `M` ou `L`. Manter aqui — e nao nas rules carregadas — para o contexto do agente ficar enxuto.

## Em uma linha

Seis fases: **explicar antes de fazer** (0) · desenvolver (1) · um loop com criterio de
**maquina** (2) · um loop com criterio de **julgamento** (3) · um **leitor independente** (4)
· relatorio (5). **Nenhuma se salta** — e a 4 e a que mais foge, por ser a mais cara.

O criterio diz o que conta como achado; **nao** diz quando o ciclo acaba. Isso e sempre uma
decisao do utilizador (Fases 2 e 3).

E ha, depois do commit, algo que **nao e do agente e nao se numera: usar** o que mudou. (Nao
lhe chamo fase nem passagem de proposito — as fases sao seis, 0 a 5, e "passagem" ja significa
uma volta da Fase 3.) Nao e
um remate opcional — sao **tres instrumentos que apanham classes diferentes**, e o terceiro e
o unico que apanha uma decisao errada:

| Instrumento | Apanha |
|-------------|--------|
| As Fases 2-3 (o teu julgamento) | o que **acabaste de escrever** |
| A Fase 4 (leitor independente) | o que **nao consegues ver por teres escrito** |
| **Usar** (nao e do agente) | o que **decidiste mal** — inclui o que nunca chegou a existir |

Detalhe mais abaixo, em _"A fase que nao e do agente"_. Saltar as tres nao e ir mais rapido:
e trocar tres tipos de deteccao por um.

O que escala com o tamanho do ticket sao tres delas — a **Fase 0** (do chat ao ficheiro com
alternativas), a **Fase 3** (quantas passagens esperar) e a **Fase 4** (se corre). As outras
tres sao **binarias**: um controlo negativo, o `tsc 0` e o relatorio de 5 pontos valem igual
num `S` e num `L`, e nao ha versao reduzida deles.

A escala nao e um detalhe — e o que torna o metodo viavel. Aplicado por inteiro a tudo,
multiplica o tempo por ticket por 2 a 3. Vale onde um erro custa **confianca na correcao**;
nao vale numa mudanca de texto.

---

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

## Fase 0 — Explicar, e esperar

Antes de tocar no codigo: o problema, os ficheiros que vao mudar, a abordagem, **as
alternativas rejeitadas e porque**, e o que conta como "pronto" em criterios testaveis.
Depois **espera-se pela aprovacao**.

| Ticket | Forma |
|--------|-------|
| `S` — mudar um numero, um texto | explicacao no chat |
| `M` | ficheiro `.agent/context/implementation_plan.md` |
| `L`, ou toca no nucleo do dominio | ficheiro, com as alternativas rejeitadas escritas |

> **O nucleo do dominio** e o conjunto de sitios onde um erro nao da uma resposta errada —
> destroi dados ou a confianca na correcao. Definir na Fase 2 do bootstrap; tipicamente o
> reducer/store, o seed, a pontuacao, as migracoes, o calculo de precos.

**O plano nao e garantia.** Um plano escrito pode estar errado, e estara. Serve para o erro
ficar visivel cedo, nao para o impedir.

## Fase 1 — Desenvolver

Uma regra: **cada teste novo nasce com o seu controlo negativo.** Quebrar de proposito o
codigo que ele cobre e exigir que fique vermelho **na assercao certa**.

Sem isto, um teste pode nao afirmar nada. Padroes reais desta classe:

- Uma assercao de visibilidade sem limiar passa com **um pixel** visivel.
- Uma assercao de contagem zero cumpre-se no **primeiro instante** em que a contagem e zero,
  antes de a UI re-renderizar.
- Uma assercao de texto contra o output **inteiro** e satisfeita por outra verificacao que a
  mesma mutacao tambem disparou (ver `AP1` em `anti-patterns.md`).

Para **verificadores** (guards, linters, scripts de CI), o controlo negativo escala para
**cobertura de mutacao**: desligar cada sitio de erro, um a um, e exigir que a suite fique
vermelha em cada um. Neste repo isso e um script — `.agent/scripts/mutation-sweep.mjs` — para
o numero ser derivado e nao contado a mao.

**O que 100% de cobertura prova, exatamente**: que cada aviso que o verificador **ja tem** e
observado por algum teste. Nada mais. Nao diz nada sobre os avisos que **nunca foram
escritos**, e e ai que vivem os defeitos piores.

> Mediu-se as duas coisas na mesma sessao. O `check-backlog.mjs` tinha **12/12** sitios
> cobertos **e**, ao mesmo tempo, respondia `Backlog vazio — nada a validar` com exit `0` a um
> backlog com tres items cujas seccoes tinham sido renomeadas. A cobertura estava perfeita; o
> aviso que faltava nem existia para ser coberto. Foi um **angulo** da Fase 3 (acoplamento)
> que o apanhou, nao a varredura. Cobertura de mutacao e um piso, nao um teto.

## Fase 2 — O loop que a maquina fecha

Criterio objetivo, tecto explicito de **5 tentativas**:

```
tsc 0 · lint 0 · unit + E2E + security verdes
guards de documentacao e de backlog exit 0 · bundles dentro do target
cada teste novo com o seu controlo negativo vermelho
```

**Nunca se filtra o sumario de uma corrida.** Um `tail -1` mostra `125 passed` e engole o
`1 failed`. Um `| grep` mostra a linha que procuravas e esconde o aviso que nao previas. E
cuidado com o exit code do pipe: em `zsh` o `PIPESTATUS` nao existe, logo `cmd | tail` seguido
de `$?` reporta o `tail`, nao o `cmd`.

Ao chegar as 5, **parar e apresentar** o que falha e o que ja se tentou — e e o mesmo
ponto de decisao da Fase 3: o agente nao decide sozinho abandonar nem insistir. O
utilizador escolhe entre mais tentativas, mudar de abordagem, ou aceitar o estado atual
com a falha **escrita no relatorio**.

## Fase 3 — O loop que o julgamento fecha

E o `/review` e, se mexeu em UI, o `/design-review`. Nao e automatizavel: _"isto e um defeito
real?"_ nao tem verificacao de maquina.

**Cada passagem declara o angulo antes de correr.** Um angulo ja usado nesta alteracao nao
conta como passagem — repetir a checklist da o mesmo resultado.

Angulos (adaptar ao dominio no bootstrap; os de UI nao servem a uma CLI ou a uma lib):

| Familia | Angulos |
|---------|---------|
| Sempre | dados intercalados · estado ja gasto · olhar para o output real |
| Com UI | modo correcao · leitor de ecra · so teclado · rede lenta · telemovel deitado |
| Sem UI | clone fresco · toolchain diferente · o agente le isto a letra · acoplamento entre ficheiros |

**Quantas esperar** (para orcamentar, nao para cumprir):

| Ticket | Passagens tipicas | Ponto de decisao |
|--------|-------------------|------------------|
| `S` — mudar um numero, um texto | 1 | 2 |
| `M` | 2-4 | 6 |
| `L`, ou toca no nucleo do dominio | **4-6** | 10 |

**O numero nao e um fim — e um ponto de decisao, e a decisao e do utilizador.** O agente
nunca declara o ciclo encerrado por si. Duas situacoes levam ao mesmo sitio: **parar e
apresentar**.

1. Uma passagem declarou um **angulo novo** e **nao encontrou nada**.
2. Chegou-se ao numero da tabela.

Em ambas, o agente apresenta e **espera**. Ficar muito abaixo do tipico nao e eficiencia: e
sinal de que os angulos declarados eram variacoes do mesmo.

**O que apresentar no ponto de decisao** — para a escolha ser informada, nao um "ok":

- Os achados **desta** ronda e o que foi corrigido, com a medicao de cada um.
- **Os angulos ja usados** e, sobretudo, **os que faltam**. E o que diz onde ainda nao se
  olhou — e o que o utilizador precisa para julgar se vale mais uma.
- O que **fica em aberto de proposito** (defeito conhecido, divida, limite aceite) — nomeado,
  nao omitido.
- Custo gasto e custo estimado de mais uma ronda.

**A escolha e explicita**, e o agente propoe a que recomenda mas nao a assume:

| Escolha | O que acontece |
|---------|----------------|
| aceitar assim | avanca-se para a Fase 4/5 com o que fica aberto **escrito no relatorio** |
| mais um ciclo | nova passagem, com um **angulo novo declarado** — nunca repetir a checklist |
| corrigir X por inteiro primeiro | volta-se a Fase 2 so em X, e depois reavalia-se |

> **"A ultima passagem nao encontrou nada" nao e "esta limpo".** Nesta sessao mediu-se as
> duas faces. Cinco de seis passagens renderam num ticket `L`, e declarar "rendimento
> decrescente" a quarta estava errado — a quinta encontrou tanto como a segunda, porque mudou
> de **angulo**. Mas tambem: a ronda que nao encontrou nada **nao** foi o fim — a passagem
> seguinte, de **uso** (ver mais abaixo), achou um defeito de desenho que nenhuma das cinco
> revisoes viu. Por isso a ausencia de achados encerra a *passagem*, nunca o *ciclo*: quem
> encerra o ciclo e o utilizador, informado do que ainda nao foi olhado.

## Fase 4 — O leitor independente

O subagente `code-reviewer`, em modo leitura, **sem o raciocinio de quem escreveu**.

| Ticket | Corre? |
|--------|--------|
| `S` | nao |
| `M` | se pedires |
| `L`, ou toca no nucleo do dominio | **sim** |

**Nao substitui a Fase 3**: le **codigo** — logica, invariantes, ramos mortos, ordem de
hooks. Nao corre a app, nao mede, nao ve o output. Cobre outra coisa.

**Instrui-lo a atacar**, nao a elogiar: "assume que esta errado ate prova em contrario", cada
achado com `ficheiro:linha` e reproducao, e **CONFIRMADO** vs **PLAUSIVEL** explicito.

**Verificar cada achado** contra o ficheiro real antes de agir — subagentes alucinam, e um
achado que nao se confirma custa mais do que nao o ter tido.

> Antes de confiar no `tools:` do frontmatter, confirmar numa sessao nova **que ferramentas o
> subagente tem de facto**: pedir-lhe que as enumere e que tente um comando fora do que
> declara. Ja se mediu um subagente anunciado como read-only com `Bash` irrestrito.

Se encontrar algo, volta-se a Fase 2. Custo: e a etapa mais cara — e por isso a unica
escalada por tamanho de ticket.

## Fase 5 — Relatorio, e so depois o commit

O relatorio diz sempre cinco coisas:

1. O que ficou feito, em **comportamento observavel**.
2. **O que divergiu do plano, e porque.**
3. Cada achado com a **medicao** que o suporta — nao "estava pequeno", mas o numero.
4. **O que cada controlo negativo fez** — incluindo os que **nao** ficaram vermelhos, que sao
   uma resposta e nao um detalhe.
5. Tickets novos, com ID.

E o Git pergunta-se **um passo por vez**: commit, depois push, depois PR, depois merge. Um
"avanca" cobre o passo em causa e **nao os seguintes**.

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

## O que custa

Aplicado por inteiro a tudo, multiplica o tempo por ticket por **2 a 3**. E por isso que tres
fases escalam por tamanho: sem escala, o metodo e abandonado a segunda semana.

A **Fase 4** e a unica com um custo grande e mensuravel. Medido neste repo: uma passagem sobre
dois commits (33 ficheiros) consumiu **~168k tokens** e 16 minutos, e devolveu tres defeitos
ALTO que seis passagens minhas nao viram — um deles a fronteira de seguranca. E cara e vale a
pena onde a tabela da Fase 4 diz que corre; nao vale num `S`.

O resto e quase gratis em tempo de maquina: os controlos negativos correm com a suite, e a
varredura de mutacao custa minutos **uma vez** por alteracao a um verificador, nao por commit.

## O que o metodo nao faz

- **Nao impede erros de desenho.** Um plano pode estar errado; a implementacao revela-o.
- **Nao substitui uma medicao.** Uma hipotese nao medida e uma hipotese, mesmo quando e minha.
- **Nao sabe o que o produto e.** Isso vem de ti.
