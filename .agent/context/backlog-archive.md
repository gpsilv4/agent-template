# Backlog — Arquivo ({{PROJECT_NAME}})

> **Arquivo historico do backlog.** Contem items **fechados** (Concluido/Cancelado) e sprints fechados.
> Este ficheiro NAO e importado em `CLAUDE.md`, `GEMINI.md` nem `AGENTS.md` (o ponto de
> entrada do Cursor, Copilot, Codex e restantes) — nao entra no contexto do agente
> a cada sessao, para manter o contexto enxuto. O agente le-o **on-demand** (via `Read`/grep),
> tipicamente para:
>   - confirmar unicidade de IDs antes de criar um item novo (IDs nunca sao reutilizados);
>   - consultar como um item passado foi resolvido.
> O trabalho **ativo/aberto** (Pendente, A Fazer) vive em `backlog.md`. Um item so existe num
> dos dois ficheiros — ao fechar, **move-se** de `backlog.md` para aqui (nao se duplica).
> Fora do "Historico (Fechados)" (os sprints fechados, notas) e historia livre; uma tabela com a coluna `ID`
> so cita IDs que estejam no Historico (o `check-backlog` verifica-o).
> Atualizado: {{DATE}}

**Coluna `Tipo`**: `Bug` | `UX` | `Tecnica` | `Feature` (usada para recalcular os contadores por seccao).

---

## Historico (Fechados)

> Append ao concluir/cancelar um item. Ordenar por data decrescente.

| ID | Tipo | Descricao | Estado | Sprint | Versao | Data |
|----|------|-----------|--------|--------|--------|------|
| | | | | | | |

---

## Sprints Fechados (Indice)

> Referencia dos sprints ja concluidos e removidos da zona ativa de `backlog.md`.

| Sprint | Descricao | Versao | Data de conclusao |
|--------|-----------|--------|-------------------|
| | | | |
