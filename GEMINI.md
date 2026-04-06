# {{PROJECT_NAME}} — Contexto do Projeto

{{PROJECT_DESCRIPTION}}
Stack: {{STACK}}.

> As regras e workflows abaixo sao a fonte de verdade partilhada com todos os agentes AI deste projeto.
> Edita sempre os ficheiros em `.agent/` — nunca diretamente aqui.

---

## Regras (carregar sempre)

@[.agent/rules/core-rules.md]
@[.agent/rules/process-rules.md]
@[.agent/rules/business-logic.md]
@[.agent/rules/pages-architecture.md]

---

## Estado atual e decisoes

@[.agent/context/session.md]
@[.agent/context/decisions.md]
@[.agent/context/task.md]
@[.agent/context/walkthrough.md]
@[.agent/context/implementation_plan.md]
@[.agent/context/backlog.md]

---

## Workflows disponiveis

| Workflow                  | Ficheiro                               |
| ------------------------- | -------------------------------------- |
| Setup / Onboarding        | @[.agent/workflows/setup.md]           |
| Planear funcionalidade    | @[.agent/workflows/plan.md]            |
| Review antes de commit    | @[.agent/workflows/review.md]          |
| Refactoring seguro        | @[.agent/workflows/refactor.md]        |
| Testes E2E (Funcionais)   | @[.agent/workflows/e2e-tests.md]       |
| Testes de Seguranca       | @[.agent/workflows/security-tests.md]  |
| Debugging estruturado     | @[.agent/workflows/debug.md]           |
| Deploy para producao      | @[.agent/workflows/deploy.md]          |
