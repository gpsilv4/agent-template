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

- [ ] **src/docs/CHANGELOG.md** atualizado?
- [ ] **Regras do Agente** (`.agent/rules/`) verificadas?
- [ ] **Workflows do Agente** (`.agent/workflows/`) verificados?
- [ ] **Scripts de Automacao** (`.agent/scripts/`) verificados?
- [ ] **Manuais Tecnicos** (`src/docs/`) verificados?
- [ ] **`.agent/context/session.md`** limpo — tarefas concluidas e proximos passos atualizados?
- [ ] **`.agent/context/decisions.md`** com decisoes desta release?
- [ ] **`.agent/context/backlog.md`** — items concluidos marcados, contadores atualizados?
- [ ] **`README.md`** atualizado se funcionalidades ou stack mudaram?
- Se a documentacao nao foi atualizada, fazer **ANTES** de continuar o deploy.

## 2. Verificacoes de Build

- Correr `npx tsc --noEmit` — deve ter 0 erros
- Correr `npm run lint` — deve passar
- Correr `npm run build` — verificar tamanhos do bundle

### Bundle Benchmarks de Referencia

<!-- Adaptar ao projeto. Exemplo para Next.js: -->

| Pagina | Target | Limite Alarme |
| ------ | ------ | ------------- |
<!-- | Home   | < 160 kB | > 180 kB | -->
<!-- | etc.   | < 160 kB | > 180 kB | -->

## 3. Verificacoes de Configuracao e Seguranca

- Variaveis de ambiente locais configuradas (`.env.local`)
- Variaveis de ambiente de **producao** configuradas no painel de hosting
- **ZERO dados sensiveis em ficheiros commitados**

## 4. Base de Dados — Migracoes

### Passo 1: Testar em Staging primeiro

- Aplicar migracoes pendentes no backend **STAGING**
- Verificar que as tabelas/colunas foram criadas corretamente
- Testar a app localmente com as novas migracoes
- Confirmar que politicas de seguranca cobrem as novas tabelas

### Passo 2: Aplicar em Producao (so apos validacao em staging)

- Aplicar as mesmas migracoes no backend **PRODUCAO**
- Migracoes destrutivas (`DROP`, `DELETE`, renomear colunas) requerem atencao especial

## 5. Testes

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
Verificacao manual apenas (ver seccao 7).

## 6. Deploy para Producao

- **Regra para o Agente de IA**: NUNCA executar comandos de `git commit` ou `git push` automaticamente sem permissao.
- Antes de commitar, o Agente **tem** de perguntar: _"Estou pronto para fazer o commit/push, posso avancar?"_

```bash
# 1. Merge da feature branch para main
git checkout main
git merge feature/nome-da-feature
git push origin main
# -> Deploy automatico para producao

# 2. Aplicar migracoes em prod (se houver)
# (adaptar ao backend do projeto)
```

## 7. Verificacao Pos-Deploy

- Testar fluxo de autenticacao (login/logout)
- Verificar que seguranca de dados esta ativa (utilizadores isolados)
- Testar paginas criticas em mobile (iPhone viewport)
- Confirmar que exports (PDF/Excel) funcionam (dynamic imports)
