# Process Rules ({{PROJECT_NAME}})

> Regras de processo para agentes de IA: sessao, backlog, git, branches e fluxos de trabalho.

---

### Regra de Sincronizacao de Sessao (Agente de IA)

- No fim de qualquer tarefa significativa (feature, bug, refactor, deploy), o Agente **deve perguntar**:
  _"Queres que atualize o `session.md`, `task.md`, `walkthrough.md` e/ou `decisions.md`?"_
- Reconhecer linguagem natural como sinal de fim de sessao: **"acabei"**, **"commit"**, **"vamos parar"**, **"fechar"**, **"terminei"**.
- Ficheiros **substituidos** a cada feature (refletem estado atual): `session.md`, `task.md`, `walkthrough.md`, `implementation_plan.md`
- Ficheiro **acumulado**: `decisions.md` — novas entradas no topo. Quando uma decisao se torna padrao recorrente, propor migracao para `.agent/rules/`.
- Ficheiro **permanente**: `backlog.md` — ver regras detalhadas abaixo.

---

### Regra de Backlog (Agente de IA)

O `backlog.md` e o documento central de trabalho pendente. Qualquer agente deve seguir estas regras:

**Ao concluir um item:**
1. Na tabela da seccao (1-4), mudar `Estado` de `A Fazer` para `Concluido`
2. Na tabela "Historico (Concluido)" no fundo, adicionar uma linha com o ID, descricao, sprint (ex: `S3`), versao e data
3. No sprint correspondente, remover a linha do item concluido
4. Atualizar os contadores na tabela "Resumo" (A Fazer -1, Concluido +1)
5. Atualizar a barra de progresso: blocos por cada 5% concluido (20 blocos = 100%). Formula: `concluidos / total x 20` blocos preenchidos, resto vazios
6. Atualizar a linha **Proximo:** com o proximo item do sprint (por ordem + dependencias)

**Ao cancelar um item:**
1. Na tabela da seccao, mudar `Estado` para `Cancelado`
2. Atualizar contadores no "Resumo" (Pendente ou A Fazer -1, Cancelado +1)
3. No sprint correspondente, remover a linha do item cancelado
4. Items cancelados nao contam para o progresso (barra de progresso ignora-os)

**Ao adicionar um novo item:**
1. Usar o proximo ID disponivel na seccao (ex: se B6 e o ultimo bug, o novo e B7)
2. Nunca reutilizar um ID de um item concluido ou cancelado
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
- Remover a seccao do sprint concluido (os items ja estao no Historico)

**Quando o utilizador reporta um novo bug ou pede uma melhoria:**
- Propor criacao de item no backlog com ID, descricao, esforco e sprint sugerido
- Aguardar aprovacao antes de adicionar

---

### Checklist de Sync Docs (correr AUTOMATICAMENTE antes de commit)

> **Regra Obrigatoria**: Esta checklist DEVE ser corrida **automaticamente** pelo agente antes de dizer "Estou pronto para commit". Nao basta atualizar apenas os ficheiros de contexto (`.agent/context/`) — e obrigatorio verificar e atualizar **TODOS os pontos** abaixo. O agente NAO deve esperar que o utilizador peca "sync docs" — deve faze-lo proativamente.

1. [ ] `README.md` — contagens de testes, stack, scripts atualizados
2. [ ] `CLAUDE.md` — referencias a `.agent/` files corretas
3. [ ] `GEMINI.md` — mesma estrutura que CLAUDE.md
4. [ ] `.agent/rules/` — todas as regras refletem o estado atual do codigo
5. [ ] `.agent/context/session.md` — estado da sessao atual
6. [ ] `.agent/context/task.md` — tarefas atualizadas
7. [ ] `.agent/context/backlog.md`:
   - [ ] Trabalho feito fora do sprint esta registado com ID?
   - [ ] Contadores (Total, Pendente, A Fazer, Concluido, Cancelado) corretos?
   - [ ] Barra de progresso correta?
   - [ ] Linha **Proximo:** atualizada?
   - [ ] Historico tem todos os items concluidos (com coluna Sprint)?
8. [ ] `.agent/context/decisions.md` — novas decisoes registadas
9. [ ] `.agent/context/walkthrough.md` — se houve feature/fix user-facing
10. [ ] `.agent/context/implementation_plan.md` — se houve novo plano
11. [ ] `.agent/workflows/` — workflows refletem processos atuais
12. [ ] `.agent/scripts/` — scripts e targets atualizados
13. [ ] `src/docs/CHANGELOG.md` — versao atual registada
14. [ ] `src/docs/` restantes — manuais refletem UI/logica atual

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

### Regra de Git (Agente de IA)

- **NUNCA** executar `git commit` ou `git push` de forma autonoma.
- Sempre que uma tarefa/workflow terminar e estiver pronta para commit, o Agente **deve obrigatoriamente** informar o utilizador do resumo das alteracoes e perguntar: _"Estou pronto para fazer o commit/push, posso avancar?"_.
- So executar os comandos Git no terminal apos o utilizador analisar o codigo e dar explicitamente "Luz Verde".
- **NUNCA** adicionar `Co-Authored-By` (de qualquer agente IA) nas mensagens de commit. Commits devem ser limpos, apenas com o conteudo descritivo da alteracao.
- Apos merge de PRs, **perguntar ao utilizador** se deve eliminar o branch ou mante-lo.

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
