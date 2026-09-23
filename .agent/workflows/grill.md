# /grill — Interrogar quem pediu, antes de haver codigo

Extrair as decisoes que **ainda nao foram tomadas** de um pedido, uma pergunta de cada vez,
ate nao sobrar ramo por resolver. Corre **antes** da explicacao da Fase 0 do
`.agent/rules/ticket-method.md`: o que sai daqui e o input do plano.

> **Porque existe.** O resto do metodo tem o agente a **falar**: a Fase 0 explica e espera
> aprovacao, o `plan-auditor` julga um plano ja escrito, o `/plan` estrutura o que o agente
> ja decidiu. Em nenhum ponto alguem **pergunta** ao utilizador o que ele nao disse. A
> ambiguidade de requisitos fica por extrair ate aparecer no code review — ou depois do
> deploy, que e onde custa.
>
> Um "sim" a um plano nao significa acordo: significa que a explicacao era plausivel. Isto
> serve para descobrir onde nao havia acordo nenhum.

## Quando corre

| Situacao | Corre? |
|---|---|
| Ticket `L`, ou que toca no nucleo do dominio | **Sim**, sempre |
| Ticket `M` cujo pedido admite mais do que uma leitura razoavel | **Sim** |
| Ticket `M` sem ambiguidade; ticket `S` | **Nao** — seria cerimonia |
| Discussao de desenho fora de um ticket (`/grill` invocado a mao) | **Sim** |

> **Um `S` nunca e interrogado.** Mudar um numero nao tem ramos de decisao, e um processo que
> pergunta na mesma ensina a saltar o processo. Se durante o interrogatorio de um `M` os ramos
> se multiplicarem, isso e sinal de que o ticket e `L` — dizer isso e um resultado valido.

## 1. Antes de perguntar: procurar

**Uma pergunta cuja resposta esta no repo e um custo, nao um esclarecimento.** Antes de
escrever a primeira pergunta, procurar nas fontes por esta ordem: `.agent/rules/`
(sobretudo `business-logic.md` e `core-rules.md`), `.agent/context/decisions.md`, o codigo, e
`backlog-archive.md` para tickets parecidos ja fechados.

Cada pergunta que sobreviver a esta passagem e uma pergunta a que **o projeto nao responde**.
Se a procura responder a tudo, dizer isso e passar a Fase 0 — tambem e um resultado.

## 2. Mapear os ramos

Ler o pedido e listar cada ponto onde **mais do que uma implementacao razoavel** satisfaz o
que foi escrito. Um ramo e um sitio onde duas pessoas competentes fariam coisas diferentes.

Ordenar por **custo de estar errado**, nao por ordem de aparicao. Primeiro o que e caro
desfazer: forma dos dados, fronteiras de modulo, contratos publicos, o que vai para a base de
dados. Por ultimo o que se muda numa tarde: copy, cores, ordem de listas.

Tipos de ramo que costumam ficar por dizer:

- **Ambito**: o que fica de fora? Qual e a versao mais pequena que ja tem valor?
- **Dados**: onde vive o estado, quem e dono, o que acontece numa escrita concorrente.
- **Casos limite**: vazio, um, muitos, duplicado, apagado a meio, offline, sem permissao.
- **Falha**: o que o utilizador ve quando corre mal; o que se repete e o que nao.
- **Reversibilidade**: da-se `undo`? migra-se? o que acontece aos dados ja existentes?
- **Pronto**: que observacao concreta prova que esta feito.

## 3. Perguntar

**Uma pergunta de cada vez.** Um bloco de oito perguntas recebe oito respostas curtas e
nenhuma discussao — e a discussao e onde aparece o que ninguem tinha pensado.

Cada pergunta leva:

1. A pergunta, concreta, respondivel numa frase.
2. **A recomendacao do agente** e uma frase de porque. Perguntar sem recomendar empurra o
   trabalho todo para quem pediu; recomendar da algo contra o que discordar, que e mais
   rapido do que inventar do zero.
3. A evidencia, quando existir (`ficheiro:linha`, uma decisao em `decisions.md`, um ticket
   fechado parecido).

Formato: `[i/N] <pergunta>` — com `N` a ser o numero de ramos mapeados no passo 2, e a dizer
**quando N mudar** (um ramo novo que aparece a meio e informacao, nao ruido).

**Nao perguntar**: o que a Fase 0 ja vai perguntar (aprovacao), o que e obviamente do
utilizador (prioridade), nem coisas que so existem para parecer minucioso. Se nao souberes o
que farias com cada resposta possivel, a pergunta nao vale.

## 4. Quando PARAR

Para quando **todos os ramos mapeados estiverem resolvidos** — cada um com uma decisao
escrita — ou quando quem pediu disser para parar.

**O agente nao declara o interrogatorio encerrado por si.** Chegado ao fim dos ramos, apresenta
e espera: as decisoes fechadas, os ramos que ficaram **em aberto** e porque, e o que passou a
assuncao explicita. Quem escolhe entre avancar assim, resolver mais um ramo, ou partir o
ticket e quem pediu.

**Um ramo sem resposta nao desaparece: vira assuncao escrita.** "Assumo X porque nao ficou
decidido" e verificavel mais tarde; um ramo esquecido nao e.

## 5. Output — Decisoes Fechadas

O que sai alimenta directamente a Fase 0. Num ticket `L` vai para
> **No template**: o output vai para um **issue**, nunca para `.agent/context/` (o Guard 21 reprova).

`.agent/context/implementation_plan.md`; noutros casos fica no chat.

```
## Decisoes fechadas
| # | Ramo | Decisao | Porque |

## Em aberto (assuncoes)
| # | Ramo | Assuncao | O que a desbloqueia |

## Consequencias
- O que isto exclui do ambito
- O que passa a ser testavel, e como
```

As linhas de **Consequencias** sao o que distingue isto de um questionario: se nenhuma
decisao mudou o que vai ser construido, o interrogatorio nao serviu para nada — e dizer isso
e mais honesto do que apresentar uma tabela cheia.

## Limite honesto

Isto reduz retrabalho por ambiguidade; nao o elimina. Nao apanha o que **nem o utilizador
sabe** ate ver a coisa a funcionar — para isso serve entregar cedo e pequeno, nao perguntar
mais. E nada aqui e mecanicamente verificado: e um workflow, nao um guard. A rede que o
projeto tem para o que e verificavel esta em `.agent/scripts/`; esta parte depende de o
agente a seguir.
