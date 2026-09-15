# /e2e-tests — Correr e manter a suite E2E ({{TEST_FRAMEWORK}})

Levar a suite E2E a um **veredicto**: verde, ou uma lista de falhas com causa atribuida. E
manter a cobertura dos fluxos criticos honesta — um fluxo sem spec e divida, nao ausencia de
risco.

> **Nota:** os comandos abaixo assumem **Playwright**. Se `{{TEST_FRAMEWORK}}` for outro
> (Cypress, Vitest browser mode, …), adaptar — e adaptar tambem o `e2e.yml`, que corre
> `test:e2e`.

## 0. Entrada e saida

**Corre quando**: acabaste uma feature com UI, mexeste num fluxo critico, ou antes de um
`/deploy`. Nao corre a cada commit — e caro e lento.

**Esta feito quando** as tres coisas forem verdade, e nao antes:

1. `npm run test:e2e` sai **0** — o veredicto e o exit code do runner, nunca a leitura do
   output. Um resumo verde com exit != 0 e um runner a falhar depois dos testes.
2. **Todo o fluxo critico tem spec.** A lista de fluxos criticos vive em
   `.agent/rules/pages-architecture.md`; cada um tem um spec ou um ticket no backlog.
3. **Nenhuma falha ficou sem causa atribuida.** Um teste que passa a segunda vez sem ninguem
   tocar em nada e *flaky* — ver §5 —, e isso e um achado, nao um sucesso.

## 1. Ambiente

`.env.local` com as credenciais de teste:

```env
{{TEST_ENV_VARS}}
```

## 2. Preparar

- `npm install`
- `npx playwright install chromium` (adaptar ao `{{TEST_FRAMEWORK}}`)

## 3. Correr

- `npm run test:e2e` — headless, arranca o servidor sozinho. **E este o comando cujo exit
  code decide.**
- `npm run test:e2e:ui` — modo interativo, para investigar.
- `npm run test:e2e:headed` — browser visivel.
- Contra uma preview: `PLAYWRIGHT_BASE_URL=<url> npm run test:e2e` (timeouts maiores
  automaticamente).

> **Nunca filtrar o sumario** (`| tail`, `| grep`). A linha que interessa costuma ser a que se
> corta, e um resumo filtrado ja escondeu falhas neste repo (ver `/review` §9).

## 4. Cobertura — o que tem de ter spec

Derivar a lista de `.agent/rules/pages-architecture.md`, nao de memoria. Para cada fluxo
critico, existe spec?

| Fluxo | Spec | Se nao existe |
|-------|------|---------------|
| (derivar de `pages-architecture.md`) | | ticket no backlog, com o risco escrito |

**Um fluxo critico sem spec e um item de backlog, nao uma nota mental.** O que nao esta
rastreado nao volta.

## 5. Testes flaky

Um teste que passa a segunda vez **sem ninguem tocar em nada** nao "passou": e uma falha
intermitente que ainda nao foi diagnosticada. Retry nao e correcao — e o volume de sinal a
baixar.

- Correr o teste suspeito isolado, 5x seguidas. Se falhar uma, e flaky.
- Causas por ordem de frequencia: espera por tempo em vez de por estado; dados partilhados
  entre testes; ordem de execucao assumida; animacao nao terminada.
- **Marcar `skip` e a solucao degenerada** (`TP4`): remove a falha sem remover a causa, e o
  `check-test-surface.mjs` conta-o. Ou se corrige, ou vira ticket com o teste ainda vermelho.

## 6. Regras para specs novos

1. Helpers partilhados para estados de loading (ex: `waitForDataLoad(page)`).
2. `data-testid` e estrutura do DOM, nunca titulos textuais literais.
3. IDs unicos nos dados de teste, para nao colidir com dados reais.
4. Limpeza no fim — a conta de teste fica como estava.

### Hermeticos e gratuitos

- **Nao gastar quota** de APIs pagas nem depender de servicos externos vivos. Arrancar com as
  keys pagas **em branco** e afirmar o **caminho degradado** (ex: 503) em vez da chamada real.
- Isolar do dev do dia-a-dia: porta dedicada, `reuseExistingServer: false` e, se o framework
  permitir, build dir separado (ex: `.next-test`).

## 7. Output

- Veredicto: **exit code** do runner, e o numero de testes que correram.
- Falhas, cada uma com causa atribuida (defeito do produto / defeito do teste / flaky).
- Fluxos criticos **sem spec**, propostos como items de backlog.
- O que **nao** foi coberto e porque.

## 8. Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Atualizar `.agent/context/session.md`?
- [ ] Atualizar `.agent/context/walkthrough.md`?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
- [ ] Specs em falta adicionados ao `backlog.md`?
