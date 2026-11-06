# Metodo de Backlog ({{PROJECT_NAME}})

> O procedimento passo-a-passo do `backlog.md`: o que mexer ao concluir, cancelar, acrescentar
> ou iniciar um item, e ao abrir e fechar um sprint.
>
> **NAO carregado** — abrir ao mexer no backlog. Vivia no `process-rules.md`, que e carregado a
> cada sessao: eram **5 207 bytes (44% do ficheiro)** de um manual que so se consulta ao abrir
> ou fechar um item, pagos em todas as sessoes de todos os projetos derivados. A regra que fica
> carregada e a que decide COMPORTAMENTO (perguntar antes de acrescentar, validar com o
> checker); o procedimento e referencia.


O `backlog.md` e o documento central de trabalho pendente. Qualquer agente deve seguir estas regras:

**Layout e arquivo (ordem das seccoes).** O backlog divide-se em dois ficheiros, por frequencia de leitura:
- **`backlog.md`** (importado nos **tres** pontos de entrada — `CLAUDE.md`, `GEMINI.md` e `AGENTS.md`, este ultimo para Cursor/Copilot/Codex — entra no contexto a cada sessao): so trabalho **ativo**, ordenado do acionavel para o topo:
  1. **Zona Ativa**: `Progresso Geral` + `Proximo:`, `Resumo` (contadores) e o cabecalho `🎯 Trabalho Ativo` (sprints ativos + `Pendentes sem Sprint`).
  2. **Zona de Referencia**: cabecalho `📚 Tickets Abertos por Tipo (Referencia)` com as quatro tabelas por tipo (Bugs, UX, Divida Tecnica, Features) — apenas items **abertos** (Pendente, A Fazer).
- **`backlog-archive.md`** (**nao** importado — nunca esta permanentemente no contexto): `Historico (Fechados)` (Concluido/Cancelado) e o indice de sprints fechados. O agente le-o **on-demand** (via `Read`/grep), sobretudo para confirmar unicidade de IDs.

O agente atualiza as tabelas **pelo nome da seccao** — nunca assumindo posicao — e mantem esta ordem. **Um item vive num so ficheiro**: ao fechar (Concluido/Cancelado), a linha **move-se** de `backlog.md` para `backlog-archive.md`, mantendo o ficheiro ativo enxuto no contexto do agente.

**O formato dos blocos** (o `check-backlog` verifica-o e reprova, #445):
- **Um bloco** e uma tabela com as colunas `Ordem` e `ID`, seja qual for o titulo. A `Ordem` **e** a ordem de execucao, e a ordem das linhas: cresce linha a linha, sem repetidos. Os saltos sao permitidos, porque fechar tira a linha. Ao reordenar, renumerar. A ordem nao se escreve em prosa.
- **A `Prioridade`** e uma coluna opcional, que o guarda nao le. Como no Jira, o valor (Priority) e a ordem (Rank) sao campos diferentes: "importante, mas depois" e informacao.
- **"A Fazer" e o em curso:** um ticket passa a ele quando comeca a Fase 0. O "Pendente" ainda nao comecou.
- **O "Depende de"** so tem IDs, em maiusculas (um `b2` nao conta). Cada ID tem de existir, e se esta aberto tem de vir ANTES: num bloco anterior, ou no mesmo com `Ordem` menor. Uma dependencia fechada nao conta.
- **Bloqueado** (a espera de algo de fora, como a versao de um pacote) escreve-se no "Depende de", `T58; Bloqueado: <motivo>`, e os IDs do motivo nao contam. **Condicional** (fazer se ou quando algo acontecer) escreve-se na `Nota`, e nao e um bloqueio.
- **Dois tickets "num so PR":** so a linha de DEPOIS cita a de antes, por exemplo `UX122 (num so PR)`. A de antes nao cita a de depois, senao uma das duas depende de algo que vem depois.
- **Debaixo do `> Objetivo:`** (o resultado do bloco), uma linha `> Fecho: /audit → /backlog-review` (o processo de o fechar) e opcional, e o guarda nao a le.
- **Os Pendentes sem Sprint** tem a coluna `Nota`, com esse nome.
- **Uma linha riscada** (`~~X~~`) num bloco, nos Pendentes ou numa tabela por tipo e um fecho a meio: fechar move a linha para o arquivo.

**A vista** (#446): `node .agent/scripts/backlog-board.mjs` gera `.agent/backlog-board.html` (abrir no browser; local, so de leitura, fora do git). Com `--vigiar`, deixado aberto num terminal enquanto se trabalha, volta a gerar a cada gravacao e a pagina recarrega-se sozinha, salvo com um detalhe aberto, texto selecionado ou um campo em uso (sem ele, a pagina mostra o que foi gerado da ultima vez). Mudar um estado e pedi-lo ao agente: o botao "copiar pedido" de cada cartao da o texto, e o agente segue este metodo.

**Ao concluir um item:**
1. **Remover** a linha do item da tabela da seccao por tipo (1-4) em `backlog.md` — items fechados nao ficam no ficheiro ativo
2. **Adicionar** uma linha a tabela "Historico (Fechados)" em **`backlog-archive.md`** (append) com `ID`, `Tipo` (Bug/UX/Tecnica/Feature), descricao, `Estado` = `Concluido`, sprint (ex: `S3`), versao e data
3. No sprint correspondente (Zona Ativa), remover a linha do item concluido
4. Atualizar os contadores na tabela "Resumo" (A Fazer -1, Concluido +1)
5. Atualizar a barra de progresso: 20 blocos = 100%. Formula: `concluidos / contavel x 20` blocos preenchidos (onde `contavel = total - cancelados`; cancelados nao contam). **Contadores e barra sao dados derivados — validar com `node .agent/scripts/check-backlog.mjs` antes de commit.**
6. Atualizar a linha **Proximo:** com o proximo item do sprint (por ordem + dependencias)

**Ao cancelar um item:**
1. **Remover** a linha do item da tabela da seccao em `backlog.md`
2. **Adicionar** ao "Historico (Fechados)" em `backlog-archive.md` com `Estado` = `Cancelado` (mais `Tipo`, descricao, etc.)
3. Atualizar contadores no "Resumo" (Pendente ou A Fazer -1, Cancelado +1)
4. No sprint correspondente, remover a linha do item cancelado
5. Items cancelados nao contam para o progresso (barra de progresso ignora-os)

**Ao adicionar um novo item:**
1. Usar o proximo ID disponivel na seccao (ex: se B6 e o ultimo bug, o novo e B7)
2. Nunca reutilizar um ID de um item concluido ou cancelado — verificar tanto `backlog.md` como `backlog-archive.md` (grep/Read) antes de escolher o ID
3. Adicionar a tabela da seccao correta (Bug, UX, Tecnica, Feature)
4. Decidir com o utilizador em que sprint colocar (ou num sprint futuro)
5. Atualizar os contadores na tabela "Resumo" (Total +1, Pendente +1)

**Ao registar um item que nasce fechado** (um bug ou refactor resolvido sem ter sido item —
o caso que o `/debug` e o `/refactor` mandam registar):
1. Escolher o ID como num item novo (o proximo da seccao do seu Tipo, verificando os DOIS ficheiros)
2. **Nao** passa pelo `backlog.md`: vai direto para o "Historico (Fechados)" em
   `backlog-archive.md`, com `Estado` = `Concluido`, o `Tipo`, a descricao, a versao e a data.
   `Sprint` = `S<n>` se aconteceu durante um sprint, senao `—`
3. Atualizar o "Resumo" (Total +1, Concluido +1) na linha do Tipo **e** na linha `**Total**`, e a
   linha Progresso Geral (barra, `%` e `X/Y`). Validar com o `check-backlog.mjs`

**Ao iniciar um item:**
1. Correr a **Fase 0** do Metodo de Trabalho por Ticket (explicar e esperar aprovacao)
2. Na tabela da seccao, mudar `Estado` de `Pendente` para `A Fazer`
3. Atualizar contadores no "Resumo" (Pendente -1, A Fazer +1)
4. Atualizar a linha **Proximo:** com o item seguinte do sprint

**Ao iniciar um sprint:**
- Se existir o `/backlog-review` (`.agent/workflows/backlog-review.md`; o Modo minimo remove-o), propo-lo primeiro: rever o backlog contra o codigo antes de explicar os items
- O agente deve ler o sprint ativo no `backlog.md` e **avaliar o tamanho**:
  - Se o sprint tem **mais de 9 items**, sugerir divisao em sprints menores (7-9 items cada) e aguardar aprovacao
  - Verificar se novos tickets foram adicionados ao sprint desde o planeamento original
- Explicar **todos os items** do sprint ao utilizador (o que e, como resolve, ficheiros afetados)
- Propor ao utilizador: _"O proximo sprint e o Sprint X com Y items. Queres comecar?"_
- So avancar para implementacao apos aprovacao

**Ao concluir um sprint (todos os items feitos):**
- **ANTES de pedir commit/PR**, o Agente deve apresentar um relatorio com:
  1. Tabela de verificacao (tsc, lint, build, bundles, E2E, security)
  2. Tabela de items com estado final
  3. **Desvios do plano**: para cada item que diferiu da explicacao pre-implementacao, descrever o que mudou e porque
  4. **Problemas encontrados**: erros, bugs ou dificuldades tecnicas e como foram resolvidos
  5. **Testes**: por item, avaliar se justifica teste novo (unit/E2E/security) e perguntar
  6. **Trabalho nao planeado**: listar o que NAO estava no sprint e criar tickets com IDs antes do commit
- So depois perguntar: _"Queres que atualize a documentacao, faca commit e crie o PR?"_
- Ao concluir, perguntar: _"Sprint X concluido. Queres avancar para o Sprint Y?"_
- Remover a seccao do sprint concluido de `backlog.md` (os items ja estao no Historico) e adicionar uma linha ao "Sprints Fechados (Indice)" em `backlog-archive.md`

**Quando o utilizador reporta um novo bug ou pede uma melhoria:**
- Propor criacao de item no backlog com ID, descricao, esforco e sprint sugerido
- Aguardar aprovacao antes de adicionar


**Atualizar um PR antigo, ou um empilhado (git e backlog, #431):**
- `git fetch`; mudar a base do PR para o `main` **primeiro** (um PR empilhado, com a base noutro branch, nao corre o CI: `ci.yml` so em `pull_request` para o `main`); depois `git merge origin/main` (nunca rebase com force push, que esta negado); depois push. Cada passo de git com aprovacao.
- Se o push ja foi feito antes de mudar a base, o CI nao corre: fechar e reabrir o PR, ou um novo push. O mesmo quando o GitHub muda a base sozinho, ao apagar o branch do PR pai.
- Conflitos: resolver so os blocos em conflito, nunca `--theirs`/`--ours` no ficheiro inteiro (apaga as linhas do proprio PR). No `decisions.md` ficam as duas entradas, a mais recente em cima.
- Depois de qualquer merge, **sempre** `node .agent/scripts/check-backlog.mjs`: o git junta linhas das tabelas SEM conflito e deixa o Total errado. **Primeiro** conferir as tabelas de items contra os dois pais (`git diff HEAD^1 -- .agent/context/backlog.md` e o mesmo contra `HEAD^2`): uma linha perdida so se ve ai, e o Total antigo e a unica prova dela. **So depois** `--corrigir` (so os derivados; com outro aviso nao escreve nada) — corrigir antes iguala o Total as tabelas truncadas e apaga essa prova.
