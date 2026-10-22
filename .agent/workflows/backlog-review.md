# /backlog-review — Rever o backlog que ja existe, contra o codigo

> **Quando usar:** ao abrir um sprint, depois de uma release, ou antes de escolher o proximo item · **Quando NAO usar:** para propor trabalho novo de raiz (e o `/audit`), ou para interrogar um ticket (e o `/grill`) (#342).

Confronta cada ticket **aberto** com o codigo de hoje: o que ja foi feito sem estar fechado, o
que deixou de fazer sentido, os duplicados, o que falta, e se a ordem e as dependencias ainda
estao certas. **Nao escreve nada ate a aprovacao**: apresenta veredictos e propostas.

> **Porque existe.** O `/audit` propoe tickets NOVOS (e caro, de milestone); o `/market-scan`
> propoe features; o `/grill` e o `/plan` olham para UM ticket; o `backlog-method.md` diz como
> mexer numa linha. Nenhum manda confrontar o backlog com o codigo, e um backlog que ninguem
> confronta passa a descrever um projeto que ja nao existe. No template isto fez-se a mao seis
> vezes numa so release, e cada passagem achou algo (#342).

## 1. Entrada e ancora

- **Num derivado:** o `.agent/context/backlog.md` e o `backlog-archive.md` (os fechados, e os IDs).
- **No template** (sem `.agent/.template-version`): os issues abertos, os fechados desde a ancora,
  e o **issue do plano** — o issue aberto que ordena a release seguinte (titulo `Plan vX.Y.Z: ...`):
  `gh issue list --state open --limit 500 --json number,title --jq '.[] | select(.title | startswith("Plan v")) | .number'`
  (a procura `--search` do GitHub ignora o `v` solto, e nao serve). Mais de um, ou nenhum: **perguntar**.
  O sprint, a ordem e a `Nota` de cada issue saem do corpo dele (ou do corpo/comentarios do issue).
- **Todo o `gh issue list` leva `--limit 500`**: sem ele devolve 30 em silencio (`TP2`). Se a
  contagem (`--json number --jq length`) der igual ao limite, a lista foi cortada: subir e repetir.

**A ancora** e o "desde quando" dos passos (menos o §3, que usa a criacao do ticket), e o
relatorio diz qual foi:

1. A ultima tag **antes do `HEAD`**: `git describe --tags --abbrev=0 HEAD^`. O `HEAD^` e de
   proposito: logo depois de uma release a tag esta no proprio `HEAD`, e `<tag>..HEAD` saia
   vazio, e o workflow dizia "limpo" sem ter olhado para nada (`TP2`).
2. **Num derivado, so conta uma tag do PROJETO.** Um derivado nascido de `git clone` traz as tags
   do template, e o `commit:` do `.agent/.template-version` nao serve para as separar (o `/upgrade`
   regrava-o com um commit do template que o derivado nao tem). O criterio: o commit que CRIOU a
   marca, `boot=$(git log --diff-filter=A --format=%H -- .agent/.template-version | tail -1)`; uma
   tag antepassada dele (`git merge-base --is-ancestor <tag> "$boot"` sai `0`) e do template.
   **Num projeto adotado** (`.agent/adocao.json` existe) as tags de antes da adocao sao do
   projeto: mostrar as candidatas e **perguntar**.
3. **Se o `describe` falhar** (sem tags, ou um so commit) **ou devolver uma tag do template:**
   perguntar a data, e propor a do `$boot`.
4. **A data**, para o `gh`: `git tag -l <ancora> --format='%(creatordate:short)'` (numa tag
   anotada, quando foi criada; numa leve, a do commit), e
   `gh issue list --state closed --limit 500 --search "closed:>=<data>" --json number,title`. A procura
   e por dia, e o GitHub conta em UTC: um fecho do mesmo dia antes da tag, ou um depois dela mas
   da ronda dela, conta — diz-se, e nao se julga.

## 2. Inventario

Por ticket aberto: ID, titulo, estado, sprint e ordem (ou "sem sprint" e a `Nota`), e as
dependencias declaradas. E os **fechados desde a ancora**: o que resolveram pode ter resolvido
outro de lado. **O issue do plano tambem se reve**: cada afirmacao de estado dele contra o
codigo e os issues (ATUALIZAR, se nao bater).

## 3. Cada ticket, contra o codigo

- O que descreve **ainda existe**? `git grep` dos ficheiros, funcoes, mensagens e numeros que
  cita; `git log --since=<criacao do ticket> -- <ficheiro>` para o que mudou neles (desde a
  ancora so, um ticket resolvido "de lado" antes da ultima tag escapava). A criacao: no template,
  `gh issue view N --json createdAt`; num derivado, o primeiro commit que pos a linha,
  `git log --reverse --format=%cI -S'| <ID> |' -- .agent/context/backlog.md | head -1`.
- **Ja foi feito** por outro ticket, ou por um commit sem ticket?
- O **contexto mudou**: ficheiro movido, desenho trocado, numero desatualizado?
- Os criterios de "pronto" ainda **se podem testar**? Um ticket que **nunca** os teve: ATUALIZAR,
  com os criterios propostos (e o controlo negativo, se for codigo).

Cada ticket sai com **um veredicto e a evidencia** (`ficheiro:linha`, commit ou PR). Sem
evidencia nao ha veredicto, ha uma **pergunta** (§8).

## 4. Duplicados

Os pares que tocam no mesmo ficheiro ou citam a mesma funcao (`git grep` cruzado dos caminhos
citados). Para cada par: o **mesmo** defeito (AGRUPAR), ou dois defeitos no mesmo sitio (MANTER
os dois, com a dependencia escrita). **Na duvida, nao e duplicado** (a regra do `/audit` §4).
Sintoma num ticket e causa noutro sao o mesmo defeito so se a cadeia estiver confirmada no
codigo. **Fica** o que nomeia a causa, ou o mais completo; o texto do outro entra nele.

## 5. Ordem e dependencias

- As dependencias **reais**: ficheiros partilhados, um que bloqueia outro, um que ja nao bloqueia.
- A ordem do sprint ainda e a mais logica? Um sprint com mais de 9 items pede divisao (`backlog-method.md`).
- Num item parqueado: o que o desbloqueia (a `Nota`) **ja aconteceu**? Se sim: ATUALIZAR a
  `Nota` e propor REORDENAR para um sprint (qual, e porque). Se nao, fica, e diz-se. Um
  parqueado **sem** `Nota`, ou com uma que nao diz o que o desbloqueia ("quando houver folga"),
  e uma decisao por registar (§6). Um parqueado que parece que ninguem vai fazer e intencao, nao
  codigo: sai como **pergunta** (§8), com a proposta de fechar e a condicao de reabrir.
- Um sprint que fica **vazio** depois dos FECHAR nao esta "concluido": dize-lo, e perguntar se
  sai do plano ou recebe outros items.

## 6. Em falta — so o que a revisao encontra

- **Promessas sem ticket**, escritas noutros tickets, no plano, ou nas mensagens dos commits e nos
  corpos dos PRs desde a ancora: "issue proprio", "a seguir", "fica para", "fora do ambito". Uma
  promessa com uma **condicao por cumprir** ("a abrir quando X entrar") fica **a vigiar**.
- **`TODO`/`FIXME` novos** desde a ancora, so marcadores (num repo em portugues, "TODO o PR" e
  prosa): `git log -p -U0 -G '(TODO|FIXME)[:(]' <ancora>..HEAD -- . ':!.agent/workflows' ':!src/docs'`.
  Contar so as linhas `+` com o marcador; um marcador so movido aparece como `-`/`+` do mesmo texto.
- **Uma decisao tomada e nao registada:** um item largado, parqueado ou reordenado sem a razao no ticket.

O resto — codigo a precisar de trabalho que ninguem escreveu — e do **`/audit`**. Remeter, nao duplicar.

## 7. Verificar

Cada veredicto contra o ficheiro real: **CONFIRMADO** ou **PLAUSIVEL**, como no `/audit` §4.
Um que nao se confirma **sai**. CONFIRMADO e o que **tu** viste no ficheiro ou no commit; uma
medicao citada de um ticket ou PR, sem a teres repetido, diz-se como tal ("medido no #N").
**FECHAR, AGRUPAR e DIVIDIR so se aplicam CONFIRMADOS**: PLAUSIVEL, saem como pergunta. Um
FECHAR errado fecha trabalho por fazer, e e o veredicto que mais custa.

## 8. Output, e so depois aplicar

1. Uma tabela por ticket: ID, veredicto, evidencia, CONFIRMADO/PLAUSIVEL, e o texto proposto.
2. A ordem proposta, e porque.
3. Os em falta, com a origem (`ficheiro:linha` ou o ticket onde a promessa esta); e os a vigiar.
4. As perguntas: o que nao teve evidencia para um veredicto.
5. A ancora usada, e quantos tickets foram lidos.

**Aguardar aprovacao.** Aplicar SO o aprovado, um passo de cada vez:

| Veredicto | Num derivado (`backlog-method.md`) | No template |
|---|---|---|
| MANTER | nada | nada |
| ATUALIZAR | editar a linha no sitio, pelo nome da seccao | `gh issue edit` (o corpo) ou um comentario |
| DIVIDIR | "Ao adicionar um novo item" para cada parte (IDs novos, verificados nos DOIS ficheiros); o original "Ao cancelar um item", com "dividido em X, Y" | issues novos; o original fechado com a referencia |
| AGRUPAR | o que fica: ATUALIZAR; o outro "Ao cancelar um item", com "agrupado em X" | o outro fechado como duplicado, com a referencia |
| FECHAR (feito) | "Ao concluir um item". O commit que o fez vai na **descricao** (o Historico nao tem coluna de PR). No "Resumo" desce o contador do estado em que o item **estava** — um feito "de lado" esta quase sempre `Pendente`, nao `A Fazer` | `gh issue close` com o PR/commit |
| FECHAR (obsoleto) | "Ao cancelar um item", com a razao | `gh issue close --reason "not planned"`, com a razao |
| REORDENAR | a `Ordem` do sprint **e a linha `Proximo:`** — o `check-backlog` so verifica que aponta para um item aberto, nao que e o primeiro. De "Pendentes sem Sprint" para um sprint: a linha sai de la e entra na tabela do sprint, com `Ordem` | o corpo do issue do plano (sem ele: perguntar onde) |

Depois de aplicar, num derivado: `node .agent/scripts/check-backlog.mjs` — os contadores sao
derivados, nunca a olho.

> **No template:** o output vai para o chat ou para um comentario no issue do plano, e
> `.agent/context/` fica intacto (o **Guard 21** reprova; ver `process-rules.md`). Os textos
> publicos nunca nomeiam repos privados; se o projeto guarda (fora do repo) nomes que nao podem
> ser publicos, procura-los tambem nos issues, PRs e releases — e uma afirmacao de estado como
> as outras.

## Racionalizacoes

> As desculpas que um agente usa para saltar um passo deste workflow, e porque nao colam. Cada
> linha cita a sua origem: um incidente medido, um issue ou um anti-padrao (#245).

| Desculpa | Porque nao |
|---|---|
| "Sem commits desde a tag, nada mudou." | Logo depois de uma release a tag esta no `HEAD`: e por isso que a ancora e a tag ANTES dele (§1, `TP2`). |
| "O ticket parece feito, fecho-o." | Parecer nao e evidencia. Sem o commit ou o `ficheiro:linha` que o fez, e PLAUSIVEL, e sai como pergunta (§7). |
| "Estes dois sao parecidos, agrupo." | Na duvida nao e duplicado: esconder um defeito real dentro de outro custa mais do que mostra-lo duas vezes (`/audit` §4, #267). |
| "Aproveito e proponho tickets novos." | Os em falta sao so os que a revisao ENCONTRA (§6); o resto e o `/audit` §5, que e outro custo e outra altura. |
| "Aplico ja, o utilizador vai concordar." | Nada muda sem aprovacao, e um passo de cada vez: um "avanca" cobre o passo em causa, nao os seguintes (`process-rules.md`). |

## Limite honesto

Isto mede o backlog contra o codigo **que existe**; nao sabe se o ticket ainda e o que o
utilizador **quer** — um ticket valido que deixou de interessar so o utilizador o fecha. E nada
aqui e mecanicamente verificado: os contadores e os IDs sao do `check-backlog.mjs`, o
julgamento sobre o significado de cada ticket e deste workflow, e depende de o agente o seguir.

## Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Os veredictos aprovados aplicados, e o `check-backlog.mjs` verde (num derivado)?
- [ ] O que ficou por decidir (perguntas, PLAUSIVEL) registado no ticket ou no issue do plano?
