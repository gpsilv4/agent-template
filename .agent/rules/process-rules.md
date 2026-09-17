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

O `backlog.md` e o documento central de trabalho pendente: so trabalho **ativo**, importado nos
tres pontos de entrada. O historico (`backlog-archive.md`) **nao** e importado — um item vive
num so ficheiro, e ao fechar **move-se** de um para o outro.

O que fica carregado e o COMPORTAMENTO:

- **Nunca acrescentar um item sem propor e esperar aprovacao** (ID, descricao, esforco, sprint).
- **IDs nunca se reutilizam** — verificar os DOIS ficheiros antes de escolher.
- **Contadores e barra sao dados DERIVADOS**: validar com `node .agent/scripts/check-backlog.mjs`
  antes de commit, nunca a olho.
- **Atualizar pelo NOME da seccao**, nunca pela posicao.
- Ao iniciar um item, correr a **Fase 0** do metodo por ticket e esperar aprovacao.

> O procedimento passo-a-passo (concluir, cancelar, acrescentar, iniciar; abrir e fechar um
> sprint) vive em **`.agent/rules/backlog-method.md`** — **nao carregado**; abrir ao mexer no
> backlog. Eram 44% deste ficheiro, pagos a cada sessao para um manual que so se consulta ao
> abrir ou fechar um item.
---

### Regra de Arquivamento (Agente de IA)

Ficheiros de contexto sempre-carregados que crescem sem limite incham o contexto do agente. Aplicar o mesmo
principio do backlog (ativo vs arquivo) a todo o historico inerte:

- **`decisions.md`** > ~150 linhas -> propor mover as entradas mais antigas para `decisions-archive.md`.
- **`walkthrough.md`** > ~200 linhas -> propor mover releases antigas para `walkthrough-archive.md`.
- Os ficheiros `*-archive.md` **nao sao importados** em nenhum ponto de entrada (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`) — sao historico inerte, lidos on-demand.
- O agente **propoe** o arquivamento e aguarda aprovacao; nunca apaga historico, so o move.

---

### Checklist de Sync Docs

> Ao **criar um ficheiro novo**, a matriz de **`.agent/rules/propagation.md`** diz onde o registar.
> A checklist completa (28 pontos) vive em **`.agent/rules/sync-docs.md`** — **nao carregada automaticamente**,
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
| Ticket `L`, ou `M` ambiguo | `/grill` -> `/plan` -> implementar -> `/review` |
| Ticket refactor | `/refactor` -> implementar -> `/review` |
| Sprint completo | implementar todos -> `/review` -> `/deploy` |

- O `/deploy` so corre quando o sprint esta completo — tickets individuais fazem commit no branch mas nao deploy

### Metodo de Trabalho por Ticket (obrigatorio)

Cada ticket passa por 6 fases (0 a 5): **explicar e esperar aprovacao** -> desenvolver (cada
teste novo nasce com o seu **controlo negativo**) -> loop da maquina (criterio objetivo, tecto
de 5, **sumarios nunca filtrados**) -> loop do julgamento (cada passagem **declara o angulo e a posicao**: `passagem 2 de 4`)
-> **leitor independente** (obrigatorio num `L` ou no nucleo do dominio; no Claude Code e o
subagente `code-reviewer`, fora dele e uma sessao nova ou outro modelo a ler o diff — o que
nao se perde e a leitura independente, e o automatismo) -> **relatorio de 5 pontos**, e so depois o commit.

**Nenhum loop se encerra por decisao do agente.** Sem achados numa passagem, ou chegado ao
numero previsto, ele **apresenta e espera**: achados, angulos ja usados **e os que faltam**,
o que fica aberto, e o custo. Quem escolhe entre aceitar assim, mais um ciclo, ou corrigir
algo por inteiro primeiro e o utilizador. Uma passagem sem achados nao significa "esta
limpo". Git tambem um passo por vez: um "avanca" cobre o passo em causa e nao os seguintes.

O detalhe, a escala por tamanho (`S`/`M`/`L`) e a lista de angulos estao em
**`.agent/rules/ticket-method.md`** — **nao carregado**; abrir ao iniciar um ticket `M` ou `L`.

---

### Conventional Commits (Obrigatorio)

Todas as mensagens seguem [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <description>` — ex. `feat(dashboard): add monthly export`. A lista de types
e os exemplos vivem no `CONTRIBUTING.md`: este entra no contexto a cada sessao, aquele nao.

### Regra de Git (Agente de IA)

- **NUNCA** executar `git commit` ou `git push` de forma autonoma.
- Sempre que uma tarefa/workflow terminar e estiver pronta para commit, o Agente **deve obrigatoriamente** informar o utilizador do resumo das alteracoes e perguntar: _"Estou pronto para fazer o commit/push, posso avancar?"_.
- So executar os comandos Git no terminal apos o utilizador analisar o codigo e dar explicitamente "Luz Verde".
- **NUNCA** atribuir o trabalho a uma IA na mensagem de commit (`Co-Authored-By`, "Generated with", emoji de robo); co-autor humano passa. **Verificado** pelo hook `.githooks/commit-msg` — ligar com `git config core.hooksPath .githooks`.
- Apos merge de PRs, **perguntar ao utilizador** se deve eliminar o branch ou mante-lo.
- **Depois do commit e antes do `push`, correr os dois que apanham de facto** (a ordem importa: o simulador mede o delta entre a ULTIMA TAG e o `HEAD`, logo sem commits nao ha nada a medir e ele salta): `node .agent/scripts/simulate-upgrade.mjs`
  (~3 min) e `node .agent/scripts/check-test-surface.mjs "$(git rev-parse HEAD)"` (~1s). Numa sessao
  com **quatro** reprovacoes de CI, foram estes dois que as apanharam **todas** — nenhuma foi
  apanhada pela varredura de mutacao, porque medem outra coisa: um mede contra a **ultima tag**
  (e ai aparece o que so um consumidor ve), o outro compara a **superficie contra a base do
  branch**. Custam ~3 min juntos; cada reprovacao de CI custa ~22.
- **CI Gate**: Antes de mergear para main, confirmar que **todos os CI checks passaram** (TypeScript, lint, build, tests, audit). Nunca mergear com checks vermelhos.
- **PRs**: Usar o template de PR (`.github/pull_request_template.md`) que impoe checklist alinhada com o workflow `/review`.
- **Tags**: Apos cada release/sprint concluido e mergeado para main, criar tag anotada: `git tag vX.Y.Z <commit> -m "Descricao da release"` + `git push origin --tags`. Tags marcam releases oficiais no GitHub.

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
