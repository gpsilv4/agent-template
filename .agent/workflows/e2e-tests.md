# /e2e-tests — Testes E2E Funcionais (Playwright)

Checklist para execucao e manutencao da suite de testes Playwright do {{PROJECT_NAME}}.

## 1. Variaveis de Ambiente Necessarias

Antes de correr os testes, garante que o teu ficheiro `.env.local` contem as credenciais de teste validas.

```env
# Adaptar ao projeto
{{TEST_ENV_VARS}}
```

## 2. Preparacao e Dependencias

- Correr `npm install`
- Correr `npx playwright install chromium` (instala o browser para execucao)

## 3. Execucao da Suite de Testes

Os testes dependem de um ficheiro de global setup que gera o estado de autenticacao.

- Correr `npm run test` — Executa todos os testes em modo Headless. O servidor de desenvolvimento sera iniciado automaticamente.

### Outras formas de execucao:

- `npm run test:ui` — Interface do Playwright para debugging facil.
- `npm run test:headed` — Abre o browser de forma visivel.

## 4. O que testamos?

<!-- Preencher com os specs do projeto. Exemplos: -->

<!-- 1. **`auth.spec.ts`**: Login, registo, recuperacao de passwords, erro com credenciais incorretas. -->
<!-- 2. **`dashboard.spec.ts`**: Navegacao, metricas, KPIs. -->
<!-- 3. **`workflow.spec.ts`**: Ciclo de vida completo (criar, editar, eliminar). -->

## 5. Regras para Novos Testes E2E

1. Utilizar helpers partilhados (ex: `waitForDataLoad(page)`) para detetar states de loading.
2. Preferir locators de estrutura DOM e `data-testid` em vez de titulos textuais literais.
3. Codigos/IDs unicos para dados de teste (evitar colisoes com dados reais).
4. Limpeza de dados no final do teste (manter conta de teste limpa).

## 6. Testes em Preview URL

```bash
PLAYWRIGHT_BASE_URL=<preview-url> npm run test
```

Timeouts sao automaticamente maiores para ambientes remotos.

## 7. Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Atualizar `.agent/context/session.md`?
- [ ] Atualizar `.agent/context/walkthrough.md`?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
