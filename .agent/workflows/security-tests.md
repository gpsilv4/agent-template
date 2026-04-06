# /security-tests — Testes de Seguranca

Checklist para execucao e manutencao dos testes de seguranca do {{PROJECT_NAME}}. Estes testes validam headers HTTP, flags de cookies, prevencao de XSS/injection, bypass de autenticacao e isolamento de dados.

## 1. Variaveis de Ambiente Necessarias

As mesmas do E2E funcional — os testes de seguranca reutilizam as sessoes autenticadas.

## 2. Execucao

```bash
# Testes de seguranca (Playwright)
npm run test:security

# Auditoria de dependencias
npm run test:audit

# Tudo junto (E2E + seguranca)
npm run test:all
```

## 3. Categorias de Testes de Seguranca

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

Scan completo opcional antes de releases importantes:

```bash
brew install --cask zap
zap-cli quick-scan http://localhost:3000
```

**Quando usar:** Antes de releases com alteracoes significativas em auth, formularios ou APIs.

## 6. Regras para Novos Testes de Seguranca

- Novos headers de seguranca -> adicionar teste em "Security Headers"
- Novos formularios/inputs -> adicionar teste XSS correspondente
- Novas API routes -> adicionar teste de auth bypass
- Novas tabelas -> verificar isolamento de dados
- Novas dependencias -> correr `npm run test:audit`

## 7. Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Atualizar `.agent/context/session.md`?
- [ ] Atualizar `.agent/context/walkthrough.md`?
- [ ] Marcar tarefas concluidas em `.agent/context/task.md`?
