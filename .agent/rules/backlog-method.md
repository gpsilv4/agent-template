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

**Ao iniciar um item:**
1. Correr a **Fase 0** do Metodo de Trabalho por Ticket (explicar e esperar aprovacao)
2. Na tabela da seccao, mudar `Estado` de `Pendente` para `A Fazer`
3. Atualizar contadores no "Resumo" (Pendente -1, A Fazer +1)
4. Atualizar a linha **Proximo:** com o item seguinte do sprint

**Ao iniciar um sprint:**
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

