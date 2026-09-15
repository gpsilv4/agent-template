# /debug — Debug Estruturado

Workflow metodico para isolar e corrigir bugs no {{PROJECT_NAME}}. Nunca adivinhar — seguir o processo.

> Um bug e um ticket: corre a **Fase 0** (explicar a causa e a correcao, e esperar) antes de
> tocar no codigo, e o teste de regressao nasce com o seu **controlo negativo** (Fase 1) —
> sem isso nao se sabe se apanha o bug. Ver `.agent/rules/ticket-method.md`.

## 0. Verificar Backlog

- Consultar `.agent/context/backlog.md` — o bug pode ja estar registado (seccao 1: Bugs)
- Se existir: referenciar o ID e seguir o sprint sugerido
- Se nao existir: apos correcao, propor registo do item no Historico (ja concluido) em `backlog-archive.md`

## 1. Reproduzir

- Identificar a pagina/componente exato e os passos para disparar o bug
- Verificar se o bug acontece so em mobile, desktop, ou ambos
- Verificar se o bug e especifico a um tipo de utilizador/role

## 2. Classificar o Bug

### Dados (Backend/DB)

- Query retorna `null` ou vazio -> verificar politicas de seguranca
- Dados inconsistentes -> verificar se migracoes foram aplicadas

> **As duas listas seguintes assumem uma app web com React/Tailwind.** Num projeto de outra
> stack (CLI, lib, API, Python, mobile), **substituir** pelas classes de bug equivalentes do
> teu dominio — o valor esta em ter uma lista de sintomas conhecidos, nao nestes sintomas.
> O `BOOTSTRAP.md` §2.6 manda adaptar os workflows a stack; isto e um dos sitios.

### Estado (Data Fetching/React) — *so para apps com UI reativa*

- **Campos em falta no fetcher**: Verificar se o fetcher inclui TODOS os campos usados
- **Ghost fetchers**: Procurar chamadas a funcoes de fetch que deviam ser invalidacao de cache
- **Variable shadowing**: Mesma variavel definida em `useState` e no hook de data fetching
- **Closures stale**: Handlers passados a Sheets/Modals que fecham sobre estado antigo
- **Hybrid state**: Estado inicializado do backend mas editavel pelo utilizador -> dependencia especifica
- **One-time init**: Formularios re-inicializados por revalidation -> usar guard `initialized`

### UI (Layout/Mobile) — *so com UI; os exemplos sao Tailwind*

- **Overflow horizontal**: `grid-cols-*` fixo sem fallback responsivo -> usar `flex flex-col sm:flex-row`
- **Popovers cortados**: largura fixa -> usar `w-[min(300px,calc(100vw-2rem))]`
- **Sheet boundaries**: Conteudo sai fora do Sheet -> adicionar `overflow-x-hidden`
- **Sticky headers**: Texto transborda -> usar `min-w-0 shrink`

### Build (TypeScript/ESLint)

- Correr `npx tsc --noEmit` para encontrar erros de tipo
- Correr `npm run lint` para encontrar warnings ESLint

## 3. Logica de Negocio — Pitfalls Comuns

<!-- Esta seccao deve ser preenchida com os pitfalls especificos do projeto -->
<!-- Exemplos: -->
<!-- - Calculos financeiros com arredondamento incorrecto -->
<!-- - Permissoes/roles nao verificados antes de operacao -->
<!-- - Datas em timezone errada -->

- Verificar regras em `.agent/rules/business-logic.md`

## 4. Corrigir

- Aplicar a correcao no ficheiro correto
- Correr `npx tsc --noEmit` — deve passar com 0 erros
- Verificar que cache keys afetadas sao invalidadas

## 5. Verificar — e o criterio de saida

**Nao esta feito ate existir um teste que ficaria VERMELHO antes da correcao.** E a unica
verificacao que nao depende de alguem se lembrar de repetir os passos daqui a seis meses.

- [ ] **Teste de regressao** escrito, e **visto a falhar** com a correcao desligada. Um teste
      que nunca se viu vermelho pode nao estar a afirmar nada (`AP1` — e a mesma regra da
      Fase 1 do `ticket-method`: cada teste novo nasce com o seu controlo negativo).
      Se o bug nao justificar teste — tipicamente so-visual — **escrever porque**, em vez de
      deixar a ausencia por explicar.
- [ ] O repro do passo 1 deixou de reproduzir.
- [ ] Testar no browser (desktop + mobile viewport).
- [ ] Confirmar que os dados se atualizam apos operacoes CRUD.
- [ ] Confirmar que a navegacao entre paginas mostra dados do cache (sem spinners).
- [ ] A correcao e **minima**: o que foi tocado alem da causa raiz esta justificado, ou sai.

> **PARA aqui.** Com a causa provada, o repro morto e o teste vermelho-depois-verde, o debug
> acabou — seguir para o `/review`. Continuar a procurar "mais qualquer coisa" sem sintoma
> novo nao e rigor, e trabalho sem criterio de fim.
>
> **Se a causa nao chegou a ser provada**, tambem se para: dizer o que foi testado, o que foi
> excluido e que evidencia falta. Um palpite apresentado como conclusao custa mais do que um
> "nao consegui isolar, falta X".

## 6. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **src/docs/CHANGELOG.md** atualizado com a correcao?
- [ ] **Regras do Agente** (`.agent/rules/business-logic.md`) atualizadas se a causa foi uma regra mal interpretada?
- [ ] **`.agent/rules/anti-patterns.md`** — o bug revelou um padrao evitavel? Registar entrada (origem, anti-padrao, correto, `grep` de detecao)
- [ ] **Workflows do Agente** (`.agent/workflows/`) atualizados se o processo de debug revelou melhoria?
- [ ] **`.agent/context/decisions.md`** atualizado se a causa raiz revelou decisao importante?
- [ ] **`.agent/context/backlog.md`** — bug removido das tabelas ativas e movido para o Historico em `backlog-archive.md`; contadores validados (`node .agent/scripts/check-backlog.mjs`)?
- [ ] **`.agent/context/session.md`** atualizado?
