# /deploy — Deploy para Producao

> **Quando usar:** sprint completo, com todos os items fechados · **Quando NAO usar:** ticket individual (commit no branch, sem deploy) (#246).

Checklist obrigatoria antes de fazer deploy do {{PROJECT_NAME}}.

## Fluxo de Ambientes

```
Desenvolvimento local (codigo local + {{BACKEND}} STAGING)
  -> branch feature -> {{HOSTING}} Preview URL (se o hosting a gerar por branch)
  -> migracoes testadas em staging
        |
Producao (main branch + {{BACKEND}} PROD)
  -> merge para main -> {{HOSTING}} deploy automatico
  -> migracoes aplicadas em prod (ja validadas)
```

> **Regra:** Nunca aplicar migracoes diretamente em producao sem testar em staging primeiro.

---

## 0. O sprint esta completo?

- [ ] **Todos os items do sprint fechados** — o `/deploy` corre por sprint, nao por ticket
  (`process-rules.md`, "Fluxo de Trabalho por Tipo"). Um item fechado **sai** do `backlog.md`:
  verificar que nenhum item do sprint ficou la aberto, que estao todos no Historico do
  `backlog-archive.md` com `Sprint` = `S<n>`, e que o `check-backlog.mjs` sai 0. Se faltar algum,
  **parar aqui** e dize-lo.
- [ ] **Relatorio de fecho do sprint apresentado** (os 6 pontos de `.agent/rules/backlog-method.md`,
  "Ao concluir um sprint") e aprovado, antes de seguir.

---

## 1. Sincronizacao de Conhecimento (Docs Sync)

- [ ] **Correr a checklist completa de `.agent/rules/sync-docs.md`** (28 pontos)
> **Excecao, no template de origem**: `src/docs/CHANGELOG.md` e os ficheiros de
> `.agent/context/` ficam **deliberadamente vazios** — sao o estado inicial que cada projeto
> derivado herda, e escrever historia do template neles daria a cada projeto novo um passado
> que nao e o dele. **Num projeto derivado a regra vale por inteiro.** (A mesma nota vive em
> `/review` §2; estava so la, e este ficheiro mandava o contrario.)

- [ ] **Guards de documentacao**: `node .agent/scripts/check-doc-versions.mjs` — sem WARN
- [ ] **`.agent/context/session.md`** limpo — tarefas concluidas e proximos passos atualizados?
- [ ] **Testes dos guards** passam (`test-guards.mjs`, `test-bundle-sizes.mjs`, `test-backlog.mjs`, `test-mutation-sweep.mjs`, `test-test-surface.mjs` e `.claude/hooks/tests/test-hooks.mjs`)?
- [ ] Se algum `check-*.mjs` mudou neste ciclo: `node .agent/scripts/mutation-sweep.mjs` exit 0?
- [ ] **Superficie de teste**: `node .agent/scripts/check-test-surface.mjs` exit 0 (nenhum teste apagado nem desativado desde a base)?
- [ ] **Codigo morto**: `node .agent/scripts/check-codigo-morto.mjs` exit 0 (nenhum import por usar)?
- [ ] **`.agent/context/backlog.md`** + **`backlog-archive.md`** — items concluidos movidos para o Historico, contadores validados (`node .agent/scripts/check-backlog.mjs`)?
- Se a documentacao nao foi atualizada, fazer **ANTES** de continuar o deploy.

## 2. CI Pipeline Status

- Confirmar que o branch tem **todos os CI checks em verde** — com um comando, nao a olho.
  **Requer PR aberto** (sem PR, `gh pr checks` sai em erro "no pull requests found"):
```bash
# GATE: exigir que os checks EXISTAM antes de exigir que estejam verdes.
# `gh pr checks --watch` sai 0 quando nao ha check nenhum — na janela de propagacao
# logo apos abrir o PR, um gate so com `--watch` passa sem nada ter sido verificado.
n=$(gh pr checks --json state --jq 'length' 2>/dev/null || echo 0)
[ "${n:-0}" -gt 0 ] || { echo "GATE: nenhum check reportado — o CI ainda nao arrancou"; exit 1; }
gh pr checks --watch
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
npm run test:e2e

# Testes de seguranca
npm run test:security

# Auditoria de dependencias
npm run test:audit

# Ou tudo junto (unit + E2E + security + audit)
npm run test:all
```

### Fase 2 — Preview (antes do merge para main; so se o hosting gerar uma)

```bash
# `PLAYWRIGHT_BASE_URL` assume Playwright, e SO muda o alvo se o `playwright.config` a ler em
# `use.baseURL` — sem isso corre contra outro alvo e sai verde. Confirmar antes de confiar.
# Noutro runner (Cypress: `CYPRESS_baseUrl`, WebdriverIO, Vitest browser), a variavel equivalente.
PLAYWRIGHT_BASE_URL=<preview-url> npm run test:e2e
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
# -> preencher a checklist no PR. SO DEPOIS de o PR existir e que ha checks para esperar.
#    Contar antes de esperar: com zero checks o `--watch` sai 0 e o gate passa vazio.
n=$(gh pr checks --json state --jq 'length' 2>/dev/null || echo 0)
[ "${n:-0}" -gt 0 ] && gh pr checks --watch || { echo "GATE: CI ainda nao arrancou"; exit 1; }
gh pr merge --squash         # (ou merge pela UI do GitHub)
# -> Deploy automatico para producao

# 2. Aplicar migracoes em prod (se houver)
# (adaptar ao backend do projeto)

# 3. Criar tag da versao — no commit de merge em main, NAO no branch de feature
#    (apos squash merge o main local esta desatualizado: sincronizar primeiro)
#    SO NO TEMPLATE DE ORIGEM: o `.agent/TEMPLATE_VERSION` tem de dizer `vX.Y.Z` ANTES da tag —
#    sobe-se no PR da release. E o que um projeto criado com "Use this template" grava como a sua
#    origem, e o `simulate-upgrade` reprova se ficar atras da ultima tag (M6 do #195).
#    Tag ANOTADA, com a mensagem num FICHEIRO FORA do repo (ex. no tmpdir; escrito com a
#    ferramenta de edicao, nao pelo shell; dentro do repo ficava por commitar): 1.a linha = titulo do GitHub Release ("vX.Y.Z — titulo"), linha em branco, o resto =
#    notas. Nunca `-m "..."`: uma crase entre aspas duplas EXECUTA (TP10).
git checkout main
git pull --ff-only origin main   # o hook so deixa `pull --ff-only` em `main`
git tag -a vX.Y.Z -F <ficheiro-com-a-mensagem>
git push origin vX.Y.Z

# 4. O GitHub Release cria-se SOZINHO (`.github/workflows/release.yml`, #277): titulo e notas
#    da tag, e a lista de PRs desde a anterior. Confirmar que apareceu (`gh release view vX.Y.Z`).
#    Nao aparece se o commit da tag for anterior ao `release.yml`, ou se o push levar mais de 3
#    tags (o GitHub nao gera eventos): uma tag por push. Nesses casos, cria-lo a mao com
#    `bash .github/scripts/release-da-tag.sh vX.Y.Z` (idempotente).
```

## Racionalizacoes

> As desculpas que um agente usa para saltar um passo deste workflow, e porque nao colam. Cada
> linha cita a sua origem: um incidente medido, um issue ou um anti-padrao (#245).

| Desculpa | Porque nao |
|---|---|
| "O CI esta verde." | Com zero checks, o `gh pr checks --watch` sai 0: o gate conta os checks antes de esperar (secao 2). |
| "A tag chega, o Release faz-se depois." | O Release cria-se sozinho da tag; sem o `release.yml` ficaram 50 de 55 tags sem ele (#277). Confirmar que apareceu (secao 7). |
| "Subo a versao depois da tag." | No template, o `.agent/TEMPLATE_VERSION` sobe ANTES da tag; o `simulate-upgrade` reprova se ficar atras (secao 7, M6 do #195). |
| "A bateria local esta verde, faco push." | O `simulate-derived` entrou porque a sua ausencia deixou passar um PR vermelho (`process-rules.md`): os tres verificadores correm depois do commit. |
| "O Security Audit esta verde." | Por omissao e informativo (`continue-on-error`): verde nao e limpo. Ler o relatorio (secao 2). |

## 8. Verificacao Pos-Deploy

- Testar fluxo de autenticacao (login/logout)
- Verificar que seguranca de dados esta ativa (utilizadores isolados)
- Testar paginas criticas em mobile (iPhone viewport)
- Confirmar que exports (PDF/Excel) funcionam (dynamic imports)
