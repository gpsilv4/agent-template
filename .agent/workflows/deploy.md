# /deploy — Deploy para Producao

Checklist obrigatoria antes de fazer deploy do {{PROJECT_NAME}}.

## Fluxo de Ambientes

```
Desenvolvimento local (codigo local + {{BACKEND}} STAGING)
  -> branch feature -> {{HOSTING}} Preview URL (automatico)
  -> migracoes testadas em staging
        |
Producao (main branch + {{BACKEND}} PROD)
  -> merge para main -> {{HOSTING}} deploy automatico
  -> migracoes aplicadas em prod (ja validadas)
```

> **Regra:** Nunca aplicar migracoes diretamente em producao sem testar em staging primeiro.

---

## 1. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **Correr a checklist completa de `.agent/rules/sync-docs.md`** (24 pontos)
- [ ] **Guards de documentacao**: `node .agent/scripts/check-doc-versions.mjs` — sem WARN
- [ ] **`.agent/context/session.md`** limpo — tarefas concluidas e proximos passos atualizados?
- [ ] **Testes dos guards** passam (`node .agent/scripts/test-guards.mjs`, `node .agent/scripts/test-bundle-sizes.mjs`)?
- [ ] **`.agent/context/backlog.md`** + **`backlog-archive.md`** — items concluidos movidos para o Historico, contadores validados (`node .agent/scripts/check-backlog.mjs`)?
- Se a documentacao nao foi atualizada, fazer **ANTES** de continuar o deploy.

## 2. CI Pipeline Status

- Confirmar que o branch tem **todos os CI checks em verde** — com um comando, nao a olho.
  **Requer PR aberto** (sem PR, `gh pr checks` sai em erro "no pull requests found"):
  ```bash
  gh pr checks --watch    # espera ate terminarem; sai != 0 se algum falhar
  ```
  Um agente em terminal nao consegue "ver no GitHub"; sem este comando o gate e so prosa.
- Se algum check falhou, corrigir antes de continuar o deploy
- **Security Audit**: por defeito e informativo (`continue-on-error`) — fica verde mesmo com advisories. **Abrir o log e ler o relatorio**; nao assumir que verde = limpo
- Se E2E tests estao configurados no CI, devem estar verdes tambem
- Para inspecao humana: GitHub > repo > branch > checks

## 3. Verificacoes de Build (Local)

- Correr `npx tsc --noEmit` — deve ter 0 erros
- Correr `npm run lint` — deve passar
- Correr `npm run build` — verificar tamanhos do bundle

### Bundle Benchmarks de Referencia

<!-- Adaptar ao projeto. Exemplo para Next.js: -->

| Pagina | Target | Limite Alarme |
| ------ | ------ | ------------- |
<!-- | Home   | < 160 kB | > 180 kB | -->
<!-- | etc.   | < 160 kB | > 180 kB | -->

## 4. Verificacoes de Configuracao e Seguranca

- Variaveis de ambiente locais configuradas (`.env.local`)
- Variaveis de ambiente de **producao** configuradas no painel de hosting
- **ZERO dados sensiveis em ficheiros commitados**

## 5. Base de Dados — Migracoes

### Passo 1: Testar em Staging primeiro

- Aplicar migracoes pendentes no backend **STAGING**
- Verificar que as tabelas/colunas foram criadas corretamente
- Testar a app localmente com as novas migracoes
- Confirmar que politicas de seguranca cobrem as novas tabelas

### Passo 2: Aplicar em Producao (so apos validacao em staging)

- Aplicar as mesmas migracoes no backend **PRODUCAO**
- Migracoes destrutivas (`DROP`, `DELETE`, renomear colunas) requerem atencao especial

## 6. Testes

### Fase 1 — Local (antes do git push)

```bash
# Testes unitarios
npm run test:unit

# Testes E2E funcionais
npm run test

# Testes de seguranca
npm run test:security

# Auditoria de dependencias
npm run test:audit

# Ou tudo junto
npm run test:all
```

### Fase 2 — Preview (antes do merge para main)

```bash
PLAYWRIGHT_BASE_URL=<preview-url> npm run test
PLAYWRIGHT_BASE_URL=<preview-url> npm run test:security
npm run test:audit
```

### Fase 3 — Producao (pos-deploy, so manual)

**Nunca** correr testes E2E automaticos contra producao — criam dados reais na BD.
Verificacao manual apenas (ver seccao 8).

## 7. Deploy para Producao

- **Regra para o Agente de IA**: NUNCA executar comandos de `git commit` ou `git push` automaticamente sem permissao.
- Antes de commitar, o Agente **tem** de perguntar: _"Estou pronto para fazer o commit/push, posso avancar?"_

```bash
# 1. Abrir o Pull Request da feature branch para main (nunca merge direto)
#    Usar o template do repo — NAO `--fill`, que preenche o corpo a partir dos
#    commits e ignora o pull_request_template.md (checklist obrigatoria).
gh pr create --title "<tipo(scope): descricao>" \
             --body-file .github/pull_request_template.md
# -> preencher a checklist no PR. SO DEPOIS de o PR existir e que ha checks para esperar:
gh pr checks --watch         # GATE: espera ate terminarem; sai != 0 se algum falhar
gh pr merge --squash         # (ou merge pela UI do GitHub)
# -> Deploy automatico para producao

# 2. Aplicar migracoes em prod (se houver)
# (adaptar ao backend do projeto)

# 3. Criar tag da versao — no commit de merge em main, NAO no branch de feature
#    (apos squash merge o main local esta desatualizado: sincronizar primeiro)
git checkout main
git pull origin main
git tag vX.Y.Z -m "Descricao da release"
git push origin --tags
```

## 8. Verificacao Pos-Deploy

- Testar fluxo de autenticacao (login/logout)
- Verificar que seguranca de dados esta ativa (utilizadores isolados)
- Testar paginas criticas em mobile (iPhone viewport)
- Confirmar que exports (PDF/Excel) funcionam (dynamic imports)
