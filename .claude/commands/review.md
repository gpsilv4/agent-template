---
description: Code review antes de commit (checklist completa + guards)
---

Ler `.agent/workflows/review.md` e correr a checklist de review no diff atual.
Incluir os guards: `node .agent/scripts/check-doc-versions.mjs` e `node .agent/scripts/check-backlog.mjs`.

Num ticket `L` ou no nucleo do dominio, a Fase 4 e **obrigatoria**: delegar ao subagente `code-reviewer`.
