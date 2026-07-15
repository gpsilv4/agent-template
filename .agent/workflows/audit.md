# /audit — Auditoria Completa do Projeto & App

Health-check **holistico** do {{PROJECT_NAME}}: correr a qualquer momento para ver o "estado da app". Complementa (nao substitui) o `/review` (por-alteracao) e o `/design-review` (por-feature-UI).

> **Workflow mais caro** (muitos agentes/tokens) — usar em **milestones** (fim de sprint, pre-release) ou on-demand, **nao** a cada commit.
> **Sem score de vaidade**: cada achado tem severidade, `ficheiro:linha` e correcao proposta.

## 1. Ambito & Guards

- **Ambito**: perguntar ao utilizador — auditoria **completa** (todo o repo) ou **scoped** (so o que mudou desde a ultima tag/release: `git diff <ultima-tag>`). Scoped e mais barato para milestones frequentes.
- Correr os **guards deterministicos** primeiro e incluir o resultado:
  - `node .agent/scripts/check-doc-versions.mjs`
  - `node .agent/scripts/check-backlog.mjs`
  - `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm audit --audit-level=high` (se aplicavel)

## 2. Lentes (uma por especialista)

No **Claude Code**: fan-out de subagentes, um por lente (reutilizar o subagente `code-reviewer` para as lentes de codigo). Noutros agentes: sequencial.

1. **Organizacao & Conformidade com as Regras** — estrutura correta? Cumpre as suas proprias regras (`.agent/rules/`: ficheiros > 500 linhas, `any` proibido, data-fetching, tokens de design)? CLAUDE == GEMINI, wrappers <-> workflows.
2. **Build & CI/CD** — `npm run build` passa? CI verde no branch? `.nvmrc` == node-version do `ci.yml`? Guards locais espelham o pipeline? Tags/releases em dia?
3. **Arquitetura & Qualidade de Codigo** — complexidade, ficheiros grandes, dead code, duplicacao (DRY), anti-padroes (`anti-patterns.md`), acoplamento/fronteiras. **Dados/BD**: schema, migracoes, indices, integridade. **Resiliencia**: error boundaries, tratamento de erros, logging/observabilidade (como a app falha).
4. **Seguranca** (exploitabilidade) — secrets versionados (gitleaks, se disponivel: `gitleaks detect`), authz/authn, validacao de input, headers, superficie de API. Cobre as categorias de `/security-tests`.
5. **Performance** — bundle vs targets (`check-bundle-sizes.mjs`), waterfalls, N+1, imports pesados nao-lazy, Core Web Vitals*.
6. **UX / UI / Acessibilidade*** — aplicar a rubrica de `/design-review` ao estado atual: estados (loading/empty/error), a11y AA, responsividade, consistencia visual.
7. **Testes** — cobertura de fluxos criticos (unit/E2E/security), gaps, testes flaky.
8. **Documentacao & Consistencia** (dono do doc-drift) — README/docs refletem o real? CHANGELOG atualizado? Termos obsoletos/drift (doc-guards).
9. **Dependencias** (frescura/licenca/nao-usadas) — desatualizadas (major atras), nao usadas, duplicadas, licencas problematicas, abandonadas.

> \*Lentes marcadas com `*` (Performance CWV, UX/a11y) precisam de **app a correr / medicoes** para serem reais — sem isso, limitar a riscos ao nivel do codigo e dize-lo explicitamente.

## 3. Severidade

- **Critico** — exploitavel, perda de dados, ou build/CI partido
- **Alto** — bug funcional, regra de negocio violada, risco de seguranca real
- **Medio** — divida tecnica, gap de UX/a11y, cobertura em falta
- **Baixo** — cosmetico, estilo, nice-to-have

## 4. Sintese (obrigatoria)

- **Verificar** cada achado: re-confirmar `ficheiro:linha` + regra contra o ficheiro real; marcar **CONFIRMADO** ou **PLAUSIVEL**; descartar os que nao se confirmam (subagentes podem alucinar).
- **Dedup** entre lentes (ex: `npm audit` cai em Seguranca e Dependencias — manter um; doc-drift so na lente 8).
- **Ordenar** por **severidade x esforco**: separar *quick wins* (alto valor, baixo esforco) de *big rocks*.

## 5. Output

1. **Estado por lente** (severidade dominante + resumo curto)
2. **Top achados** (todas as lentes) com `ficheiro:linha`, severidade, CONFIRMADO/PLAUSIVEL e correcao
3. **Delta** vs auditoria anterior, se existir (novos / resolvidos por severidade)
4. **Proposta de backlog** — cada achado por resolver vira item candidato (ID, seccao, esforco); aguardar aprovacao antes de adicionar
5. **Anti-padroes** — achados recorrentes -> propor entrada em `anti-patterns.md`

## Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Guardar o relatorio datado (para o delta da proxima auditoria) e atualizar `.agent/context/session.md`?
- [ ] Items aprovados adicionados ao `backlog.md`?
