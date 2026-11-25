# /security-tests — Testes de Seguranca

> **Quando usar:** ao acrescentar uma rota, um formulario, um header, uma tabela, uma dependencia ou uma chamada a um modelo, e antes de uma release que os traz · **Quando NAO usar:** alteracao so visual, sem rotas nem inputs novos (#246).

Levar a suite de seguranca a um **veredicto**, e manter honesta a lista do que ela cobre.
Valida headers HTTP, flags de cookies, XSS/injection, bypass de autenticacao e isolamento de
dados.

## 0. Entrada e saida

**Corre quando**: acrescentaste uma rota, um formulario, um header, uma tabela, uma
dependencia ou uma chamada a um modelo; e antes de uma release que acrescentou algum deles (a suite em si corre em todas, no `/deploy` §6).

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

# Tudo junto (unit + E2E + security + audit — a definicao do BOOTSTRAP.md)
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
- Headers presentes tambem em API routes, e nas respostas de ERRO (404, 503). Caso: uma 503 sai sem eles — no nginx,
  um `add_header` sem `always` nao se aplica a 4xx/5xx, e um `add_header` numa location apaga os herdados
- CORS: nunca refletir uma origem qualquer COM credenciais. Caso: `Origin: https://mal.example`, ou `Origin: null`, volta
  refletido com `Access-Control-Allow-Credentials: true`

### 3.2 Cookie Security
- Cookies de sessao com `SameSite=Lax` **ou** `Strict` — o `Strict` e mais restrito, nao e um
  erro a corrigir. Reprovar `SameSite=None` sem `Secure`
- Verificar flags `HttpOnly` e `Secure` conforme o backend
- O cookie de sessao com o prefixo `__Host-` (exige `Secure`, `Path=/` e sem `Domain`): e o que trava o cookie tossing
  e um subdominio irmao. Caso: o `Set-Cookie` de sessao sem o prefixo, ou com `Domain`, reprova
- "Terminar a sessao em todo o lado" invalida todas as copias. Caso: um cookie antigo funciona depois do logout global
  (tokens stateless: ate expirar o de acesso, prazo escrito)
- O mesmo nome `__Host-` com dois valores recusa os dois (cookie tossing). Caso: um valido + um falso, nas duas ordens, passa

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
- Cookies auth usam `SameSite=Lax` ou `Strict` (ver 3.2) — necessario, nao suficiente: o `Lax` nao protege de um
  subdominio irmao
- As escritas aceitam so `Sec-Fetch-Site: same-origin` (ou `none`) e o `Origin` igual a origem EXATA; o media type (antes
  do `;`) e `application/json` exato (`text/plain`, `application/x-www-form-urlencoded` e `multipart/form-data` evitam o
  preflight). Caso: um POST com `same-site`, de outra origem, em `text/plain` ou `text/plain; charset=application/json` e aceite
- A isencao por `Bearer` so quando o token e a UNICA credencial. Caso: cookie de sessao + `Bearer` falso salta a origem

### 3.7 Rate Limiting Resilience
- Requests rapidos simultaneos nao causam crashes (status < 500)
- Backend tem rate limiting built-in para endpoints de autenticacao, por conta alem de por IP
- Caso: trocar de identificador (o email em vez do nome) nao reinicia a contagem; pedidos em simultaneo contam como em
  sequencia; no IPv6 o limite e por bloco `/64`
- O IP do `X-Forwarded-For` so atras de um proxy de confianca, que o SOBRESCREVE (se acrescenta, a N-esima a contar da
  direita, N = proxies de confianca). Caso, pela mesma topologia de proxy: trocar o header contorna o limite. Nota: contadores em memoria perdem-se num
  reinicio e nao se partilham entre replicas

### 3.8 IDOR Prevention
- Webhooks/APIs nao processam dados falsos
- Politicas de seguranca bloqueiam acesso a dados de outros utilizadores

### 3.9 File Upload Validation
- O tipo pelos bytes (nem pelo nome nem pelo `Content-Type`), contra uma allowlist (sem HTML; SVG so como download).
  Caso: bytes de HTML com nome `.png` e `Content-Type: image/png`, ou um SVG com `<script>`, servidos inline
- API rejeita ficheiros oversized; quotas por ficheiro, conta, hora e em simultaneo; um tempo maximo sem bytes
- Servidos so ao dono (salvo os publicos por desenho), sem cache partilhada, com `nosniff`, `Content-Security-Policy:
  sandbox`, `Content-Disposition: attachment` fora das imagens, e `Cross-Origin-Resource-Policy: same-origin` (ou
  `same-site`, com um dominio proprio de ficheiros)
- O EXIF/GPS remove-se no SERVIDOR, por um parser isolado e com limites (o tamanho em pixeis). Caso: um upload direto a
  API com GPS sai com GPS

### 3.10 Data Isolation
- Utilizadores diferentes tem sessoes isoladas
- API sem autenticacao retorna dados vazios (politicas de seguranca ativas)

### 3.11 Injecao de prompt (so com texto do utilizador enviado a um modelo)
- O fornecedor FALSO (`.agent/rules/ai-features.md` §8 e §12) devolve uma saida como se a injecao tivesse resultado —
  uma acao fora da lista fechada — e nada se aplica: o validador rejeita-a
- O mesmo com um link ou uma imagem de URL externo na saida: nao se renderiza (exfiltracao por markdown)
- Controlo: com o validador desligado, o mesmo teste reprova

### 3.12 SSRF (so quando o servidor busca um URL do utilizador)
- Bloquear destinos privados, loopback e o metadata da cloud; resolver UMA vez, validar TODOS os enderecos e ligar AO IP
  validado (com o Host/SNI) — nunca `lookup` + `fetch(url)` —, em cada pedido e em cada redirect, nao so ao gravar
- Permitir so unicast global, sobre o endereco JA resolvido (uma lib de IP, nunca strings). Um IP literal tambem; o que
  uma comparacao de strings deixa passar: `::ffff:127.0.0.1`, `2130706433`, `0x7f000001`, `127.1`, `0.0.0.0`, `::1`,
  `fc00::/7`, `fe80::/10`, `64:ff9b::/96`, `100.64.0.0/10`, o metadata em IPv6
- So `https` (a excecao, um modelo local, so por configuracao do operador, nunca do utilizador); tempo maximo e limite
  em simultaneo. Um endpoint de IA dado pelo utilizador tambem
- Caso (com `https` e um resolver injetado, para a recusa vir do destino e nao do esquema): `https://169.254.169.254/`,
  ou um nome publico que redireciona para `127.0.0.1`, e seguido; um nome que resolve primeiro para
  publico e depois para privado passa (DNS rebinding)

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

Cuidados medidos no codigo do Strix (v1.7.0, #267) — confirmar na versao que instalares:

- **Telemetria ligada por omissao** (PostHog, Scarf): `STRIX_TELEMETRY=0` desliga-a. O codigo e as
  respostas da app vao para o fornecedor de LLM configurado: as perguntas da `mcp-policy.md`.
- **Instalar uma versao fixa**, nao o `curl ... | bash` que traz sempre a ultima.
- **Em CI**: `--scope-mode diff` e `--fail-on <severidade>`. O codigo de saida `2` sao vulnerabilidades,
  e o **`1` e um ERRO** (Docker em baixo, config invalida) — o gate trata o `1` como falha do scan, nao
  como "limpo" nem como "ha vulnerabilidades" (`TP2`).
- O "diff-scope" e uma **instrucao ao modelo**, nao uma restricao: o agente pode sair dele.
- O benchmark publicado (96% no XBEN) e da v0.4.0, em desafios CTF: medir no teu projeto antes de confiar.

## 6. Regras para Novos Testes de Seguranca

- Novos headers de seguranca -> adicionar teste em "Security Headers"
- Novos formularios/inputs -> adicionar teste XSS correspondente
- Novas API routes -> adicionar teste de auth bypass
- Novas tabelas -> verificar isolamento de dados
- Novas dependencias -> correr `npm run test:audit`
- Nova chamada a um modelo com texto do utilizador -> adicionar o caso hostil da 3.11
- O servidor passa a buscar um URL do utilizador -> adicionar os casos da 3.12

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
