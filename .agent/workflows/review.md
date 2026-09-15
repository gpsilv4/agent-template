# /review — Code Review

Checklist de revisao de codigo antes de fazer commit no {{PROJECT_NAME}}.

> Para alteracoes com **UI**, correr tambem `/design-review` (qualidade visual, UX, a11y, estados) — este `/review` cobre codigo/seguranca.

> Este workflow **e a Fase 3** do Metodo de Trabalho por Ticket (`process-rules.md`): cada
> passagem **declara o angulo antes de correr**, e um angulo ja usado nesta alteracao **nao
> conta como passagem**. Numa passagem com angulo novo e sem achados, **apresenta-se e
> espera-se** — fechar o ciclo e decisao do utilizador, nunca do agente. A lista de angulos
> esta em `.agent/rules/ticket-method.md` (nao carregado).

## 0. Escala por tamanho do ticket (ler ANTES de comecar)

> Esta checklist nao escalava: um `S` (**< 30 min** no backlog) pagava as mesmas caixas que
> um `L`. Um processo que custa tanto como o trabalho e abandonado ao terceiro ticket — e a
> aritmetica que o mostra esta em `src/docs/ticket-method-why.md`.

| Tamanho | Seccoes obrigatorias | Porque |
|---------|---------------------|--------|
| **`S`** | **1, 2, 8, 9, 10, 12, 13** | O que nenhum tamanho dispensa: o CI passa, o CHANGELOG regista, os anti-padroes conhecidos nao voltaram, os testes acompanham, os docs sincronizam, o backlog fecha. Sao ~26 caixas. |
| **`M`** | Todas menos a **11** | O leitor independente e o unico passo caro que um `M` dispensa por defeito (continua disponivel se o diff mexer no nucleo do dominio). |
| **`L`** | **Todas**, a 11 incluida | Um `L` toca no nucleo ou atravessa fronteiras: e onde um segundo par de olhos paga. |

> **As seccoes saltadas dizem-se em voz alta.** No relatorio da Fase 5, listar quais e
> porque — "saltei 3, 5, 6, 7 (ticket `S`)". Uma seccao saltada em silencio e
> indistinguivel de uma seccao esquecida, e o objetivo da escala e tornar a diferenca
> visivel, nao esconder trabalho por fazer.
>
> **Um `S` que revele algo maior deixa de ser `S`.** Se a seccao 8 apanhar um anti-padrao
> real ou a 9 revelar um buraco de cobertura, sobe para `M` e corre o resto.

---

## 1. Build & CI Check  — a partir de `S`

> **No template nu ainda nao ha `package.json`**, logo os dois primeiros passos saem em erro
> ("Missing script") e nao ha nada a concluir dai. Nesse estado, o que substitui esta seccao
> sao as suites de `.agent/scripts/` (ver §9) e o job `guard-tests` do CI. A partir do momento
> em que o projeto tem app, estes passos passam a valer.

- `npx tsc --noEmit` — 0 erros
- `npm run lint` — passa
- CI pipeline verde no branch — **verificar com um comando, nao a olho**, mas so quando
  **ja existe PR** (o `/review` corre tipicamente antes do commit; sem PR o comando sai em
  erro "no pull requests found"). **Contar os checks antes de os esperar** — com zero checks
  o `gh pr checks --watch` sai `0` e o gate passa sem nada ter sido verificado:
  `n=$(gh pr checks --json state --jq 'length' 2>/dev/null || echo 0); [ "${n:-0}" -gt 0 ] && gh pr checks --watch || echo "sem PR/checks ainda"`
  Antes de haver PR, os equivalentes locais sao o `tsc`/`lint`/testes desta checklist
- Se CI falhou, corrigir antes de pedir review/merge
- **Security Audit**: corre com `continue-on-error` por defeito, logo fica **sempre verde**.
  Abrir o log e ler o relatorio — verde nao significa limpo
- Mensagens de commit seguem Conventional Commits (`feat:`, `fix:`, `docs:`, etc.) — ver `CONTRIBUTING.md`

## 2. CHANGELOG  — a partir de `S`

- [ ] Alteracoes significativas registadas em `src/docs/CHANGELOG.md`?

> **Excecao, no template**: `src/docs/CHANGELOG.md` e os ficheiros de `.agent/context/`
> ficam **deliberadamente vazios/nao tocados** enquanto isto e um template — sao o estado
> inicial que cada projeto derivado herda. Escrever historia do template neles daria a cada
> novo projeto um passado que nao e o dele. Num projeto derivado, a regra vale por inteiro.

## 3. Performance  — a partir de `M`

- [ ] `npm run build` — bundle sizes dentro dos targets?
- [ ] Nenhum `useEffect` com fetch manual — todo o data fetching usa {{STATE_MANAGEMENT}}
- [ ] Bibliotecas pesadas (PDF, charts, Excel) importadas com `await import()` ou lazy loading
- [ ] Queries paralelas com `Promise.all` (sem waterfalls)
- [ ] Otimizacao de imagens do framework utilizada
- [ ] Skeleton loaders para novos loading states
- [ ] Cache invalidado (`mutate()` / `invalidate()`) apos todas as escritas

## 4. Logica de Negocio  — a partir de `M`

<!-- Esta seccao deve ser preenchida com as regras especificas do projeto -->
<!-- Exemplos: -->
<!-- - [ ] Calculos financeiros usam as formulas corretas? -->
<!-- - [ ] Permissoes/roles verificados antes de renderizar conteudo? -->
<!-- - [ ] Validacao de inputs com limites de negocio tem validacao dupla (HTML + programatica)? -->

- [ ] Regras de `.agent/rules/business-logic.md` respeitadas?

## 5. Mobile  — a partir de `M`

> Os quatro pontos de layout responsivo passaram para o `/design-review`, que e o workflow de
> UI. Num projeto sem UI, esta seccao nao se aplica.

## 6. Arquitetura  — a partir de `M`

- [ ] Ficheiros com menos de ~400 linhas (flag se > 500)
- [ ] **Diff minimo**: nenhuma reformatacao de codigo que o ticket nao toca — `git diff --stat` proporcional a alteracao (`core-rules.md`)
- [ ] Parent detem estado, sub-components recebem props
- [ ] Nomes de componentes descritivos
- [ ] One-time form init usa guard `initialized` para evitar resets por revalidation
- [ ] `useMemo` para dados computados antes de passar a sub-components
- [ ] Sem `// eslint-disable` sem comentario justificativo
- [ ] **Duplicacao nova**: extraida, ou justificada por escrito? (`core-rules.md`, Rule of three — a partir da 2a repeticao, extrair; logica de negocio nunca se duplica)

## 7. Seguranca  — a partir de `M`

- [ ] Sem queries diretas a tabelas de auth no cliente
- [ ] Politicas de seguranca cobrem novas tabelas/colunas
- [ ] Chaves secretas nunca expostas no frontend
- [ ] **ZERO dados sensiveis em ficheiros commitados**

## 8. Anti-Padroes  — a partir de `S`

> `anti-patterns.md` define, para cada entrada, um **`grep` de detecao "para o /review"**.
> Este e o passo que os corre — sem ele, esse campo nao tem consumidor.

- [ ] Correr os `grep` de detecao de **cada entrada** dos **dois** ficheiros: `.agent/rules/anti-patterns.md` (vazio no template nu) e `.agent/rules/anti-patterns-template.md` (`AP1`-`AP7`). Varrer so o primeiro e correr zero greps e marcar a caixa sobre o diff
- [ ] Algum achado -> corrigir, ou justificar por escrito porque nao se aplica
- [ ] Duvida sobre o que uma deteccao apanha, ou porque a entrada existe? -> `src/docs/anti-patterns-why.md`
      (evidencia e receitas por inteiro; **nao** carregado, abrir so quando faz falta)
- [ ] O trabalho revelou um padrao evitavel novo? -> propor entrada nova em `anti-patterns.md`
      **e** a seccao correspondente no `anti-patterns-why.md` (as duas andam em par)

## 9. Testes  — a partir de `S`

> **Os testes da camada de agente correm sempre**, com ou sem app, e sao estes — sem eles um
> agente que siga esta seccao num template nu nao corre nada e marca a checkbox:
>
> ```
> node .agent/scripts/test-guards.mjs          node .agent/scripts/test-backlog.mjs
> node .agent/scripts/test-bundle-sizes.mjs    node .agent/scripts/test-mutation-sweep.mjs
> node .agent/scripts/test-test-surface.mjs    node .claude/hooks/tests/test-hooks.mjs
> ```
>
> Os `npm run` abaixo sao os da **app** e so existem depois de haver `package.json`.

- [ ] Testes unitarios passam: `npm run test:unit`
- [ ] Testes E2E funcionais passam: `npm run test:e2e`
- [ ] Testes de seguranca passam: `npm run test:security`
- [ ] Auditoria de dependencias: `npm run test:audit`
- [ ] **Nunca filtrar o sumario de uma corrida** (`| tail`, `| grep`): esconde o `1 failed` no meio dos `125 passed`
- [ ] **Restruturas de UI**: os `data-testid` afetados foram corrigidos **no mesmo PR**? (`process-rules.md`)
- [ ] **Triagem proativa** (`process-rules.md`): cada item tocado justifica teste novo? **unit** (funcao pura/regra de negocio), **E2E** (fluxo de utilizador), **security** (rota/input/header novo). Propor ao utilizador — nao esperar que peca
- [ ] Cada teste **novo** nasce com o seu **controlo negativo**: quebrar de proposito o codigo que ele cobre e confirmar que fica vermelho **na assercao certa**. Um teste que passa com o defeito no ecra nao afirma nada

## 10. Sincronizacao de Conhecimento (Docs Sync)  — a partir de `S`

- [ ] **Correr a checklist completa de `.agent/rules/sync-docs.md`** (28 pontos — CHANGELOG, rules, workflows, scripts, manuais, README, `.github/`, etc.)
- [ ] **Testes dos guards** (se mexeste em `.agent/scripts/`, `.claude/hooks/` ou `.githooks/`): as **nove** que o job `guard-tests` do `ci.yml` corre (a lista esta la, e e a fonte) — sem eles, um guard partido parece um guard a passar
- [ ] **Se mexeste num `check-*.mjs`**: `node .agent/scripts/mutation-sweep.mjs` — as suites acima ficarem verdes nao prova que afirmam algo; a varredura desliga cada aviso e exige vermelho. Sai `!= 0` tambem se um verificador novo vier sem suite
- [ ] **Guards de documentacao**: `node .agent/scripts/check-doc-versions.mjs` (bytes das rules, paridade CLAUDE/GEMINI, paridade workflows↔wrappers + tabelas, versao CHANGELOG, termos banidos) — sem WARN
- [ ] **Superficie de teste nao encolheu**: `node .agent/scripts/check-test-surface.mjs` — testes apagados, `skip`/`only` novos, contagens a descer, ou a selecao do runner estreitada. Mede a **arvore de trabalho**, logo corre antes do commit e ve o que esta a ser commitado (ver `AP4`)

## 11. Leitor Independente (Fase 4)  — a partir de `L`

> Este `/review` e a Fase 3 — o teu julgamento. A Fase 4 e outra coisa: **outra leitura, sem
> o raciocinio de quem escreveu**. Nao substitui nada acima; le codigo (logica, invariantes,
> ramos mortos, escopo) e nao corre a app nem olha para o output.

- [ ] **Corre?** `S`: nao. `M`: se pedires. `L` ou toca no nucleo do dominio: **sim**.
- [ ] Invocado como subagente `code-reviewer` (Claude Code) ou, noutro agente, uma sessao
      separada a quem se da so o diff e as regras — **sem** o teu raciocinio.
- [ ] **Instruido a atacar**, nao a elogiar: "assume que esta errado ate prova em contrario",
      cada achado com `ficheiro:linha` + reproducao, e **CONFIRMADO** vs **PLAUSIVEL** explicito.
- [ ] **Cada achado verificado** contra o ficheiro real antes de agir — subagentes alucinam, e
      um achado que nao se confirma custa mais do que nao o ter tido.
- [ ] Confirmado **que ferramentas o subagente tem de facto** (pedir-lhe que as enumere): o
      campo `tools:` do frontmatter nao entrega necessariamente o que declara.
- [ ] Se encontrou algo -> **volta-se a Fase 2** (o loop da maquina) antes de seguir.

> Detalhe e a escala por tamanho: `.agent/rules/ticket-method.md`.

## 12. Backlog  — a partir de `S`

- [ ] O trabalho feito corresponde a um item do `backlog.md`? Se sim, **remover** a linha das tabelas ativas e **mover** para o Historico em `backlog-archive.md`.
- [ ] Atualizar contadores da tabela "Resumo" e validar com `node .agent/scripts/check-backlog.mjs` (0 divergencias).
- [ ] Atualizar a barra de progresso e a linha **Proximo:** no `backlog.md`.
- [ ] O trabalho revelou novos bugs ou melhorias? Propor novos items ao utilizador.

## 13. Sessao (Handoff)  — a partir de `S`

> Perguntar ao utilizador antes de terminar:

- [ ] Atualizar `.agent/context/session.md` com o estado atual?
- [ ] Atualizar `.agent/context/walkthrough.md` com o resumo do que foi implementado?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
- [ ] Registar em `.agent/context/decisions.md` se houve alguma decisao arquitetural nova?
