---
description: Code review antes de commit (checklist completa + guards)
---

Ler `.agent/workflows/review.md` e correr a checklist de review no diff atual.
Incluir os guards: `node .agent/scripts/check-doc-versions.mjs` e `node .agent/scripts/check-backlog.mjs`.

Opcional: delegar a analise ao subagente `code-reviewer` (read-only).
