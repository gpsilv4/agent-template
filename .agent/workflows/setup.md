# /setup — Onboarding de Developer

Guia para configurar o ambiente de desenvolvimento do {{PROJECT_NAME}}.

## Arquitetura de Ambientes

```
.env.local (staging)     ->  npm run dev  ->  localhost:3000
                                               |
                                    {{BACKEND}} STAGING

feature branch           ->  git push  ->  {{HOSTING}} Preview URL
                                               |
                                    {{BACKEND}} STAGING

main branch              ->  git push  ->  {{HOSTING}} PRODUCAO
                                               |
                                    {{BACKEND}} PRODUCAO
```

> Desenvolvimento local usa **sempre** o backend de staging — nunca producao.

---

## 1. Pre-requisitos

- Node.js >= 18
- npm >= 9
- Acesso ao projeto backend **Staging**
- Git configurado
<!-- Adicionar outros pre-requisitos especificos do projeto -->

## 2. Instalacao

```bash
git clone <repo-url>
cd {{PROJECT_SLUG}}
npm install
```

## 3. Variaveis de Ambiente

Criar `.env.local` na raiz apontando para o projeto **STAGING**:

```env
# Adaptar ao backend do projeto
{{ENV_VARS_TEMPLATE}}
```

> Nunca usar chaves secretas (service_role, admin keys) no frontend.
> Nunca apontar `.env.local` para producao durante desenvolvimento.

## 4. Git — Trabalhar em Branches

Nunca commitar diretamente em `main`. Usar feature branches:

```bash
# Criar branch para nova feature
git checkout -b feature/nome-da-feature

# Desenvolver e commitar na branch
git add .
git commit -m "feat: descricao"
git push origin feature/nome-da-feature

# Quando validado -> merge para main (deploy para prod)
git checkout main
git merge feature/nome-da-feature
git push origin main
```

## 5. Estrutura do Projeto

```
{{PROJECT_STRUCTURE}}
```

## 6. Correr Localmente

```bash
npm run dev
```

Abre `http://localhost:3000`.

## 7. Build e Verificacao

```bash
npx tsc --noEmit        # 0 erros de TypeScript
npm run lint             # Sem warnings ESLint
npm run build            # Verificar tamanhos do bundle
```

## 8. Documentacao Essencial

Antes de tocar no codigo, ler:

1. **`.agent/rules/core-rules.md`** — Regras de codigo e padroes
2. **`.agent/rules/business-logic.md`** — Logica de negocio
3. **`.agent/rules/pages-architecture.md`** — Arquitetura UI

## 9. Workflows Disponiveis

| Comando     | Quando usar                          |
| ----------- | ------------------------------------ |
| `/plan`     | Antes de comecar uma feature nova    |
| `/debug`    | Para resolver bugs de forma metodica |
| `/review`   | Antes de fazer commit                |
| `/deploy`   | Antes de ir para producao            |
| `/refactor` | Ao reorganizar codigo existente      |
| `/e2e-tests` | Para correr testes E2E funcionais  |
| `/security-tests` | Para correr testes de seguranca |
| `/setup`    | Este guia (onboarding)               |

## 10. Convencoes Importantes

- **Linguagem UI**: {{UI_LANGUAGE}}
- **Codigo/Variaveis**: Ingles
- **Branches**: sempre feature branches, nunca commitar direto em `main`
- **Data Fetching**: {{STATE_MANAGEMENT}}
- **CHANGELOG**: Atualizar `src/docs/CHANGELOG.md` antes de deploys
- **Ficheiros**: Maximo ~400 linhas (flag se > 500)
- **Seguranca**: Nunca expor chaves secretas no cliente
