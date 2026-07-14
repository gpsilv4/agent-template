# Process Rules ({{PROJECT_NAME}})

> Regras de processo para agentes de IA: sessao, backlog, git, branches e fluxos de trabalho.

---

### Regra de Sincronizacao de Sessao (Agente de IA)

- No fim de qualquer tarefa significativa (feature, bug, refactor, deploy), o Agente **deve perguntar**:
  _"Queres que atualize o `session.md`, `task.md`, `walkthrough.md` e/ou `decisions.md`?"_
- Reconhecer linguagem natural como sinal de fim de sessao: **"acabei"**, **"commit"**, **"vamos parar"**, **"fechar"**, **"terminei"**.
- Ficheiros **substituidos** a cada feature (refletem estado atual): `session.md`, `task.md`, `walkthrough.md`, `implementation_plan.md`
- Ficheiro **acumulado**: `decisions.md` — novas entradas no topo. Quando uma decisao se torna padrao recorrente, propor migracao para `.agent/rules/`.
- Ficheiros **permanentes**: `backlog.md` (trabalho ativo, importado no contexto) e `backlog-archive.md` (historico + sprints fechados, **nao** importado) — ver regras detalhadas abaixo.

---

### Regra de Backlog (Agente de IA)

O `backlog.md` e o documento central de trabalho pendente. Qualquer agente deve seguir estas regras:

**Layout e arquivo (ordem das seccoes).** O backlog divide-se em dois ficheiros, por frequencia de leitura:
- **`backlog.md`** (importado em `CLAUDE.md`/`GEMINI.md` — entra no contexto a cada sessao): so trabalho **ativo**, ordenado do acionavel para o topo:
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
4. Decidir com o utilizador em que sprint colocar (ou no backlog do Sprint 4+)
5. Atualizar os contadores na tabela "Resumo" (Total +1, Pendente +1)

**Ao iniciar um item:**
1. **ANTES de implementar**, o Agente deve explicar detalhadamente:
   - O que e o problema/melhoria (contexto)
   - Que ficheiros vai alterar
   - Como vai resolver (abordagem tecnica)
   - Impacto esperado para o utilizador
2. Aguardar aprovacao do utilizador antes de tocar no codigo
3. Na tabela da seccao, mudar `Estado` de `Pendente` para `A Fazer`
4. Atualizar contadores no "Resumo" (Pendente -1, A Fazer +1)
5. Atualizar a linha **Proximo:** com o item seguinte do sprint

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
  5. **Testes**: para cada item, avaliar se justifica criar/atualizar testes (unitarios, E2E ou security) e perguntar ao utilizador — indicando qual o tipo adequado e porque
  6. **Trabalho nao planeado**: listar qualquer trabalho feito que NAO estava no sprint (hotfixes, testes adicionais, refactors de oportunidade) e criar tickets no backlog com IDs antes de pedir commit
- So depois perguntar: _"Queres que atualize a documentacao, faca commit e crie o PR?"_
- Ao concluir, perguntar: _"Sprint X concluido. Queres avancar para o Sprint Y?"_
- Remover a seccao do sprint concluido de `backlog.md` (os items ja estao no Historico) e adicionar uma linha ao "Sprints Fechados (Indice)" em `backlog-archive.md`

**Quando o utilizador reporta um novo bug ou pede uma melhoria:**
- Propor criacao de item no backlog com ID, descricao, esforco e sprint sugerido
- Aguardar aprovacao antes de adicionar

---

### Regra de Arquivamento (Agente de IA)

Ficheiros de contexto sempre-carregados que crescem sem limite incham o contexto do agente. Aplicar o mesmo
principio do backlog (ativo vs arquivo) a todo o historico inerte:

- **`decisions.md`** > ~150 linhas -> propor mover as entradas mais antigas para `decisions-archive.md`.
- **`walkthrough.md`** > ~200 linhas -> propor mover releases antigas para `walkthrough-archive.md`.
- Os ficheiros `*-archive.md` **nao sao importados** em `CLAUDE.md`/`GEMINI.md` — sao historico inerte, lidos on-demand.
- O agente **propoe** o arquivamento e aguarda aprovacao; nunca apaga historico, so o move.

---

### Checklist de Sync Docs

> A checklist completa (23 pontos) vive em **`.agent/rules/sync-docs.md`** — **nao carregada automaticamente**,
> para manter o contexto enxuto. O agente deve **abri-la e corre-la** antes de dizer "Estou pronto para commit"
> (proativamente, sem esperar que o utilizador peca), e sempre nos workflows `/review` e `/deploy`.

---

### Regra de Testes (Agente de IA)

- O agente **cria testes proativamente** — nao espera que o utilizador peca. Ao concluir trabalho, avalia e propoe.
- **Triagem por tipo**: **unit** (funcoes puras, regras de negocio), **E2E** (fluxos de utilizador), **security** (novas rotas, inputs ou headers).
- Alteracoes **so visuais** normalmente nao exigem testes novos; **restruturas de UI** obrigam a corrigir os seletores afetados (`data-testid`) no mesmo PR.

---

### Fluxo de Trabalho por Tipo

O Agente segue automaticamente o fluxo correcto, pedindo aprovacao antes de cada passo.

| Tipo | Fluxo |
|------|-------|
| Ticket bug | `/debug` -> implementar -> `/review` |
| Ticket feature | `/plan` -> implementar -> `/review` |
| Ticket refactor | `/refactor` -> implementar -> `/review` |
| Sprint completo | implementar todos -> `/review` -> `/deploy` |

- O Agente **propoe** o proximo passo e aguarda aprovacao: _"Implementacao concluida. Posso correr o /review?"_
- O `/deploy` so corre quando o sprint esta completo e pronto para merge — tickets individuais fazem commit no branch mas nao deploy
- O utilizador pode pedir para saltar ou reordenar passos

---

### Conventional Commits (Obrigatorio)

Todas as mensagens de commit seguem o formato [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci` — tabela completa e exemplos em `CONTRIBUTING.md`.
- Exemplo: `feat(dashboard): add monthly export`

### Regra de Git (Agente de IA)

- **NUNCA** executar `git commit` ou `git push` de forma autonoma.
- Sempre que uma tarefa/workflow terminar e estiver pronta para commit, o Agente **deve obrigatoriamente** informar o utilizador do resumo das alteracoes e perguntar: _"Estou pronto para fazer o commit/push, posso avancar?"_.
- So executar os comandos Git no terminal apos o utilizador analisar o codigo e dar explicitamente "Luz Verde".
- **NUNCA** adicionar `Co-Authored-By` (de qualquer agente IA) nas mensagens de commit. Commits devem ser limpos, apenas com o conteudo descritivo da alteracao.
- Apos merge de PRs, **perguntar ao utilizador** se deve eliminar o branch ou mante-lo.
- **CI Gate**: Antes de mergear para main, confirmar que **todos os CI checks passaram** (TypeScript, lint, build, tests, audit). Nunca mergear com checks vermelhos.
- **PRs**: Usar o template de PR (`.github/pull_request_template.md`) que impoe checklist alinhada com o workflow `/review`.
- **Tags**: Apos cada release/sprint concluido e mergeado para main, criar tag anotada: `git tag vX.Y.Z <commit> -m "Descricao da release"` + `git push origin --tags`. Tags marcam releases oficiais no GitHub.
- **Branch Protection**: Branch protection rules (require status checks, bloquear force push) requerem GitHub Pro em repos privados. O CI funciona como **semaforo informativo**. Se disponivel no futuro, ativar em GitHub Settings > Branches > Branch protection rules.

### Regra de Branch (Agente de IA)

- **Antes de comecar qualquer implementacao** (feature, fix, refactor), perguntar ao utilizador:
  _"Queres que crie um novo branch para isolar esta implementacao?"_
- **Se sim**: criar o branch automaticamente com nomenclatura em ingles, kebab-case:
  - `feature/` — nova funcionalidade
  - `fix/` — correcao de bug
  - `refactor/` — reorganizacao de codigo
  - `chore/` — tarefas de manutencao (docs, configs, migracoes)
  - Exemplo: `git checkout -b feature/add-monthly-export-filter`
- **Se nao**: ignorar e continuar no branch atual.
- O nome do branch deve ser descritivo, curto, sem acentos, sem espacos.
