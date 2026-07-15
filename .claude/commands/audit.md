---
description: Auditoria completa do projeto/app (multi-lente, milestone) via fan-out de subagentes
---

Ler `.agent/workflows/audit.md` e correr a auditoria holistica: primeiro os guards deterministicos,
depois fan-out de subagentes (um por lente, reutilizar `code-reviewer` para codigo) e sintetizar.
Output: estado por lente + findings por severidade + proposta de items de backlog. Workflow caro — confirmar com o utilizador.
