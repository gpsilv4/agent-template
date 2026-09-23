# /security-tests — Testes de Seguranca

Levar a suite de seguranca a um **veredicto**, e manter honesta a lista do que ela cobre.
Valida headers HTTP, flags de cookies, XSS/injection, bypass de autenticacao e isolamento de
dados.

## 0. Entrada e saida

**Corre quando**: acrescentaste uma rota, um formulario, um header, uma tabela ou uma
dependencia; e antes de qualquer release.

**Esta feito quando** as quatro forem verdade:

1. `npm run test:security` sai **0** — o veredicto e o exit code, nunca a leitura do output.
2. `npm audit --audit-level=high` corrido e **cada advisory alto tem destino**: corrigido, ou
   um ticket com a razao de ficar. "Transitivo e nao da para atualizar" e uma razao valida
   **escrita**; nao e razao para o ignorar em silencio.
3. **Cada categoria da §3 tem pelo menos um teste, ou uma linha a dizer porque nao se
   aplica.** Uma categoria sem teste e sem justificacao e uma lacuna, nao uma ausencia de
   risco.
4. Nenhum achado do ZAP ou de um agente (§5) ficou por verificar contra o codigo real.

> **O que este workflow NAO e**: um exame de penetracao. Cobre o que se testa por automatismo
> repetivel. Auth complexa, logica de negocio e multi-tenant precisam de leitura humana ou de
> um agente (§5) — e isso esta dito aqui para nao se confundir "a suite passou" com "a app
> esta segura".

## 1. Variaveis de Ambiente Necessarias

As mesmas do E2E funcional — os testes de seguranca reutilizam as sessoes autenticadas.

## 2. Execucao

```bash
# Testes de seguranca ({{TEST_FRAMEWORK}})
npm run test:security

# Auditoria de dependencias
npm run test:audit

# Tudo junto (E2E + seguranca)
npm run test:all
```

## 3. Categorias — e o teste que prova cada uma

> Isto e o **catalogo do que tem de estar coberto**, nao uma leitura. Para cada linha:
> existe teste? Se nao, ha uma justificacao escrita de porque nao se aplica a este projeto?
> Duas colunas mentais, um resultado verificavel.

### 3.1 Security Headers
- `X-Frame-Options: DENY` — previne clickjacking
- `X-Content-Type-Options: nosniff` — previne MIME-sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — limita informacao de referrer
- `Permissions-Policy` — restringe acesso a camera, microfone e geolocalizacao
- Headers presentes tambem em API routes

### 3.2 Cookie Security
- Cookies de sessao devem ter `SameSite=Lax`
- Verificar flags `HttpOnly` e `Secure` conforme o backend

### 3.3 XSS / Injection
- Campos de login (email/password) nao executam `<script>` tags
- Campos de registo nao executam event handlers (`onerror`)
- URL params com payloads XSS nao executam
- Mensagens de erro nao renderizam HTML raw

### 3.4 Auth Bypass
- Rotas protegidas redirecionam sem autenticacao
- API routes retornam erros adequados (400, nao 500)
- Cookies manipulados/falsos nao concedem acesso

### 3.5 Content Security Policy (CSP)
- CSP header presente com directivas-chave
- `default-src 'self'`, `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`

### 3.6 CSRF Prevention
- APIs criticas rejeitam requests sem autenticacao
- Cookies auth usam `SameSite=Lax`

### 3.7 Rate Limiting Resilience
- Requests rapidos simultaneos nao causam crashes (status < 500)
- Backend tem rate limiting built-in para endpoints de autenticacao

### 3.8 IDOR Prevention
- Webhooks/APIs nao processam dados falsos
- Politicas de seguranca bloqueiam acesso a dados de outros utilizadores

### 3.9 File Upload Validation
- API rejeita ficheiros com MIME type invalido
- API rejeita ficheiros oversized

### 3.10 Data Isolation
- Utilizadores diferentes tem sessoes isoladas
- API sem autenticacao retorna dados vazios (politicas de seguranca ativas)

## 4. Auditoria de Dependencias

```bash
npm run test:audit
```

- Corre `npm audit --audit-level=high`
- Reporta vulnerabilidades de severidade alta ou critica
- Deve ser executado periodicamente e antes de releases

## 5. OWASP ZAP (Manual, Pre-Release)

Scan completo opcional antes de releases importantes (instalar o OWASP ZAP conforme o teu OS — ver https://www.zaproxy.org/download/):

```bash
# Exemplo (adaptar OS/porta ao projeto):
zap-cli quick-scan http://localhost:<PORT>
```

> **Nota:** `zap-cli` **nao** vem com o ZAP — e um wrapper Python separado (`pip install zapcli`).
> Em alternativa, usar o modo headless do proprio ZAP (`zap.sh -cmd ...`) — confirmar os flags
> na documentacao da versao instalada.

**Quando usar:** Antes de releases com alteracoes significativas em auth, formularios ou APIs.

### Alternativa: agente autonomo de pentesting

Para projetos onde o scan de headers/inputs nao chega — auth complexa, multi-tenant,
APIs publicas — existem agentes de pentesting autonomos (ex: `usestrix/strix`) que exploram
a app em vez de correr uma checklist fixa.

**Nao e dependencia deste template** e nao substitui as seccoes 1-4: e uma opcao a considerar
no mesmo momento do ZAP, pre-release. Se o usares:

- **So contra ambientes teus** (local ou staging dedicado) — nunca producao, e nunca contra
  sistemas de terceiros sem autorizacao escrita.
- Tratar os achados como o `/review` trata os do `code-reviewer`: **verificar cada um** contra
  o codigo real antes de agir. Um agente que explora tambem alucina.
- Os achados confirmados viram tickets no backlog, com severidade e esforco.

## 6. Regras para Novos Testes de Seguranca

- Novos headers de seguranca -> adicionar teste em "Security Headers"
- Novos formularios/inputs -> adicionar teste XSS correspondente
- Novas API routes -> adicionar teste de auth bypass
- Novas tabelas -> verificar isolamento de dados
- Novas dependencias -> correr `npm run test:audit`

## 7. Output

- Veredicto: **exit code** de `npm run test:security`, e quantos testes correram.
- Tabela categoria -> coberta? -> se nao, porque (teste em falta vs nao se aplica).
- `npm audit`: advisories altos, cada um com destino (corrigido / ticket / razao escrita).
- Achados do ZAP ou de agente, **cada um verificado** contra o codigo real antes de entrar.
- O que ficou **por cobrir**, dito explicitamente.

## 8. Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

> **No template**: o output vai para um **issue**, nunca para `.agent/context/` (o Guard 21 reprova).

- [ ] Atualizar `.agent/context/session.md`?
- [ ] Atualizar `.agent/context/walkthrough.md`?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
