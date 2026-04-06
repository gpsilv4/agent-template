# Guia do Agente {{PROJECT_NAME}} (`.agent`)

Este documento explica o proposito e o funcionamento da pasta `.agent` na raiz do projeto. Esta pasta contem as "instrucoes de voo" para o Agente de IA, garantindo que ele segue os padroes tecnicos, de negocio e de workflow estabelecidos.

---

## 1. O que e a pasta `.agent`?

A pasta `.agent` funciona como o "cerebro" da assistencia de IA no projeto. Ela serve para:

- **Preservar o Conhecimento**: Garante que o Agente entende as peculiaridades do dominio.
- **Padronizar o Codigo**: Forca o uso dos padroes e ferramentas definidos.
- **Automatizar Processos**: Define passos exatos para tarefas complexas (deploy, planeamento, testes).

---

## 2. Regras de Inteligencia (`.agent/rules/`)

As regras sao diretivas que o Agente consulta antes de cada acao.

- **[core-rules.md]**: Stack, padroes de codigo criticos, type safety, performance, seguranca.
- **[process-rules.md]**: Regras de processo: sessao, backlog, sprints, fluxos de trabalho por tipo, Git, branches.
- **[business-logic.md]**: Regras de negocio especificas do dominio.
- **[pages-architecture.md]**: Estrutura visual e arquitetura de paginas.

---

## 3. Workflows e Slash Commands (`.agent/workflows/`)

Os workflows sao sequencias de passos que o Agente executa para tarefas especificas:

| Comando               | Nome               | Quando usar?                                            |
| :-------------------- | :----------------- | :------------------------------------------------------ |
| **`/setup`**          | Setup Inicial      | Configurar ambiente de desenvolvimento.                 |
| **`/plan`**           | Planear Feature    | **Sempre** antes de comecar uma nova funcionalidade.    |
| **`/debug`**          | Debug Estruturado  | Quando encontras um erro inesperado.                    |
| **`/refactor`**       | Refactoring Seguro | Para limpar codigo sem mudar o comportamento.           |
| **`/review`**         | Code Review        | Antes de fazer commit final.                            |
| **`/e2e-tests`**      | Testes E2E         | Para correr testes funcionais Playwright.               |
| **`/security-tests`** | Testes Seguranca   | Para correr testes de seguranca.                        |
| **`/deploy`**         | Deploy Producao    | Passos finais para enviar para producao.                |

---

## 4. Backlog (`.agent/context/backlog.md`)

O backlog e o documento central de trabalho pendente, organizado por prioridade:

| Seccao | Prefixo ID | Conteudo |
|--------|-----------|----------|
| 1. Bugs / Violacoes de Regras | `B1`, `B2`... | Problemas que violam as core rules ou causam bugs |
| 2. Melhorias UX | `UX1`, `UX2`... | Melhorias de experiencia do utilizador |
| 3. Divida Tecnica | `T1`, `T2`... | Duplicacao de codigo, refactors, inconsistencias |
| 4. Features Futuras | `F1`, `F2`... | Funcionalidades novas com valor para o utilizador |

**Como funciona:**
- IDs sao unicos e permanentes (nunca reutilizar)
- Items concluidos passam para a seccao "Historico" com sprint, versao e data
- Sprints organizam a ordem de execucao com dependencias entre items
- O Agente consulta o backlog antes de planear (`/plan`), corrigir (`/debug`) ou refatorar (`/refactor`)

---

## 5. Ordem dos Workflows por Tipo de Trabalho

### Nova Feature

```
1. /plan      -> definir o que fazer, criar branch, aguardar aprovacao
2. (implementar codigo)
3. /review    -> antes de fazer commit (build, logica, mobile, seguranca)
4. commit + git push -> Preview URL automaticamente
5. /e2e-tests -> correr testes E2E contra a Preview URL
6. /security-tests -> correr testes de seguranca
7. /deploy    -> checklist completo antes de mergear para main
8. merge main -> deploy producao automatico
9. verificacao manual em prod
```

### Bug / Hotfix

```
1. /debug     -> isolar e corrigir o bug
2. /review    -> antes de commit
3. /deploy    -> antes de mergear para main
```

### Refactoring

```
1. /refactor  -> workflow de refactoring seguro (baseline -> extracao -> verificacao)
2. /review    -> antes de commit
3. /deploy    -> antes de mergear para main
```

### Onboarding (novo developer)

```
1. /setup     -> configurar ambiente local (uma vez so)
```

---

## 6. Como tirar partido disto?

Como programador, podes confiar nestas instrucoes para delegar tarefas ao Agente com seguranca:

1. **Planeamento**: "Seguindo o `/plan`, desenha a nova pagina de X."
2. **Correcao**: "Aplica o `/debug` porque o botao Y nao esta a funcionar."
3. **Consistencia**: O Agente sabe as regras de codigo, linguagem e padroes gracas ao `.agent/rules/`.

> [!TIP]
> Se quiseres mudar um padrao de projeto, atualiza o ficheiro correspondente em `.agent/rules/` para que o Agente aprenda o novo padrao imediatamente.
