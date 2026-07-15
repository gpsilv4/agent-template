# /design-review — Review de Qualidade de UI/UX

Rubrica de qualidade visual e de experiencia do {{PROJECT_NAME}}. Correr **antes de dar uma feature de UI por concluida** — complementa o `/review` (que cobre codigo/seguranca), nao o substitui.

**Tier do projeto (bootstrap): {{QUALITY_TIER}}** — MVP < Polido < Elite. Quanto mais alto o tier, mais criterios sao obrigatorios (marcados `[Polido]` / `[Elite]`).

> **Sem notas numericas.** Cada criterio e **passa / falha / N/A**, com um problema concreto e uma correcao. So aplicavel a alteracoes com **UI** — para APIs/CLI/libs, saltar. Ler tambem `.agent/rules/pages-architecture.md` (design system do projeto) e a "Barra de Qualidade" em `core-rules.md`.
> **Verificacao:** a11y (AA) e performance (Core Web Vitals) — sobretudo no tier Elite — **nao tem harness automatico** neste template; verificar com **ferramentas/manualmente** (ex: axe DevTools, Lighthouse, leitor de ecra, navegacao por teclado). Um projeto pode adicionar um check opt-in (axe/Lighthouse CI) — nao assumido por defeito.

## 1. Design & Consistencia
- [ ] Usa os **design tokens** do projeto (cor, espacamento, tipografia) — zero valores hardcoded soltos
- [ ] Uma escala de espacamento e uma de tipografia; nº limitado de tamanhos/pesos de fonte
- [ ] Hierarquia visual clara (tamanho, peso, cor, espaco) guia o olho
- [ ] Alinhamento e ritmo de espacamento consistentes (base 4-8px)
- [ ] Componentes reutilizados, coerentes com os existentes (nao reinventados)

## 2. UX & Fluxos
- [ ] Fluxo principal obvio; accao primaria destacada, secundarias subordinadas
- [ ] Menos passos para o objetivo; sem becos sem saida
- [ ] Prevencao de erros (nao so mensagens depois do erro)
- [ ] Confirmacao para accoes destrutivas; desfazer quando possivel

## 3. Estados (o que separa amador de premium)
- [ ] **Loading**: skeletons/placeholders (nao spinners nus), sem layout shift
- [ ] **Empty**: estado vazio com orientacao/CTA (nao ecra em branco)
- [ ] **Error**: mensagem util e accionavel (o que aconteceu + como resolver)
- [ ] **Success**: feedback claro de accao concluida
- [ ] Estados **hover / focus / active / disabled** em todos os interativos

## 4. Acessibilidade (a11y) — [Polido: AA basico · Elite: AA completo]
- [ ] Contraste >= WCAG AA (4.5:1 texto normal, 3:1 grande)
- [ ] **Foco visivel** em todos os interativos; ordem de tab logica
- [ ] Navegavel 100% por teclado; sem armadilhas de foco
- [ ] Semantica correta (headings, landmarks, `label` em inputs); ARIA so quando necessario
- [ ] Alt text em imagens informativas; decorativas com `aria-hidden`
- [ ] Respeita `prefers-reduced-motion`

## 5. UI & Qualidade visual
- [ ] Border-radius, sombras e bordas consistentes e subtis
- [ ] Densidade e whitespace equilibrados (nao apertado, nao vazio)
- [ ] Iconografia coerente (mesmo set e peso)
- [ ] Imagens otimizadas e com dimensoes definidas (sem CLS)

## 6. Microcopy & Conteudo
- [ ] Labels e botoes claros, orientados a accao (verbos)
- [ ] Mensagens de erro humanas e uteis; sem jargao tecnico cru
- [ ] Tom consistente; sem "lorem ipsum" nem placeholders esquecidos

## 7. Motion & Feedback [Polido/Elite]
- [ ] Transicoes subtis e rapidas (150-300ms), com proposito (nao decorativas)
- [ ] Feedback imediato a accoes (optimistic UI quando fizer sentido)
- [ ] Nada que bloqueie ou distraia; respeita `prefers-reduced-motion`

## 8. Responsividade
- [ ] Mobile-first; viewport de telemovel sem overflow horizontal
- [ ] Alvos de toque >= 44px; conteudo re-flui (nao so encolhe)
- [ ] Sem grids fixos que quebram (`flex flex-col sm:flex-row`)

## 9. SEO & Metadata [so apps web com paginas publicas]
- [ ] `<title>` e meta description unicos por pagina
- [ ] Open Graph / cards de partilha
- [ ] URLs semanticas; sitemap; dados estruturados quando relevante
- [ ] `lang` e favicon definidos

## 10. Performance percebida [ligado ao perf budget]
- [ ] Sem waterfalls; skeletons enquanto carrega
- [ ] Bundle dentro do target (`check-bundle-sizes.mjs`); imports pesados lazy
- [ ] Core Web Vitals saudaveis (LCP, CLS, INP) — obrigatorio no tier Elite

> **Observabilidade** (opcional, depende da stack): se o projeto usa error tracking (ex: Sentry) ou logging estruturado, confirmar que erros de UI sao capturados. Nao assumir um vendor.

## Sessao (Handoff)
> Perguntar ao utilizador antes de terminar:
- [ ] Atualizar `.agent/context/session.md` / `walkthrough.md`?
- [ ] Algum achado vira ticket no `backlog.md` ou entrada em `anti-patterns.md`?
