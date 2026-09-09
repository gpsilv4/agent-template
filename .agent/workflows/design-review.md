# /design-review — Review de Qualidade de UI/UX

Rubrica de qualidade visual e de experiencia do {{PROJECT_NAME}}. Correr **antes de dar uma feature de UI por concluida** — complementa o `/review` (que cobre codigo/seguranca), nao o substitui.

**Tier do projeto (bootstrap): {{QUALITY_TIER}}** — MVP < Polido < Elite. Quanto mais alto o tier, mais criterios sao obrigatorios (marcados `[Polido]` / `[Elite]`).

> **Sem notas numericas.** Cada criterio e **passa / falha / N/A**, com um problema concreto e uma correcao. So aplicavel a alteracoes com **UI** — para APIs/CLI/libs, saltar. Ler tambem `.agent/rules/pages-architecture.md` (design system do projeto) e a seccao `### Qualidade & Design (Barra: {{QUALITY_TIER}})` em `core-rules.md`.
> **Verificacao:** este template **nao traz** o harness de medicao — depende do runner de E2E
> e dos seletores do projeto. Mas a parte desta rubrica que e **numero** nao devia ser lida a
> olho, e a seccao seguinte diz exatamente o que medir e a armadilha de cada medicao.

---

## 0. A parte que e numero: medir, nao opinar

Desta rubrica, **quatro** criterios sao numero e devem ser medidos: contraste, alvos de toque,
overflow horizontal e CLS. Todo o resto — hierarquia, microcopy, fluxos, ordem de tabulacao,
armadilhas de foco, leitores de ecra — le-se a olho, e nao ha harness que o substitua. Nao
confundir os dois grupos: medir o que e opiniao da falsa precisao, e opinar sobre o que e
numero da falsa aprovacao.

Construir isto uma vez, no runner de E2E do projeto, e correr **a pedido** — nao em cada
push: mede a app inteira e o seu lugar e antes de dar UI por concluida.

| Medir | A armadilha que da um resultado FALSO |
|-------|----------------------------------------|
| **Contraste** (AA: 4.5:1; 3:1 se >= 24px, ou >= 18.66px negrito) | Com tokens modernos, `getComputedStyle` devolve **`oklch(...)`**. Ler esses tres numeros como se fossem RGB da valores sem relacao com a realidade — deu **cinco falsos positivos** num projeto real. Deixar a conversao ao **proprio browser** (via `canvas`) em vez de escrever um conversor de espacos de cor, que seria mais codigo por testar do que o que se esta a testar. Fundo transparente compoe-se **camada a camada** |
| **Alvos de toque** (>= 44px) | Medir o `<input>` de 16px em vez do `<label>` que o envolve. O alvo real e a caixa onde se acerta com o dedo; medir a dimensao errada da um "passou" que nao quer dizer nada |
| **Overflow horizontal** | `document.scrollWidth` **nao serve** se o `body` tiver `overflow-x-hidden`: o que transborda fica escondido e a pagina jura que nao transborda. Medir **elemento a elemento** |
| **CLS** (<= 0.1) | Medir com o CSS a meio produz uma leitura otimista. Observar com `buffered: true` **depois** de as fontes estarem prontas e os esqueletos sairem — e reportar **qual o no** que saltou, senao nao se sabe o que corrigir |

> **Porque isto esta escrito e nao apenas feito**: num projeto real a medicao foi escrita a
> mao tres vezes no mesmo dia, e **duas dessas versoes deram resultados falsos** — uma leu o
> `oklch` como RGB (linha 1), a outra mediu antes de o CSS assentar e concluiu que estava tudo
> bem quando nao estava (linha 4). Uma medicao que se reinventa a cada review nao e uma
> medicao: e uma opiniao com numeros.

**Limiares que se medem em vez de se escolherem**: se uma transicao deliberada da app exceder
o limiar, nao se relaxa o limiar a olho — mede-se o valor real dessa transicao, fixa-se o
tecto **ligeiramente acima** (para o teste nao falhar com arredondamento de um tipo de letra),
e o custo dela vira **ticket**. Assim qualquer salto **novo** maior continua a falhar.


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
- [ ] **Loading**: skeletons/placeholders (nao spinners nus), sem layout shift — **medir** (§0), nao inspecionar: "tem esqueleto" nao e uma medicao
- [ ] **Empty**: estado vazio com orientacao/CTA (nao ecra em branco)
- [ ] **Error**: mensagem util e accionavel (o que aconteceu + como resolver)
- [ ] **Success**: feedback claro de accao concluida
- [ ] Estados **hover / focus / active / disabled** em todos os interativos

## 4. Acessibilidade (a11y) — [Polido: AA basico · Elite: AA completo]
- [ ] Contraste >= WCAG AA (4.5:1 texto normal, 3:1 grande) — **medir** (§0: `oklch` nao se le como RGB)
- [ ] **Foco visivel** em todos os interativos; ordem de tab logica
- [ ] Navegavel 100% por teclado; sem armadilhas de foco
- [ ] Semantica correta (headings, landmarks, `label` em inputs); ARIA so quando necessario
- [ ] Alt text em imagens informativas; decorativas com `aria-hidden`
- [ ] Respeita `prefers-reduced-motion`

## 5. UI & Qualidade visual
- [ ] Border-radius, sombras e bordas consistentes e subtis
- [ ] Densidade e whitespace equilibrados (nao apertado, nao vazio)
- [ ] Iconografia coerente (mesmo set e peso)
- [ ] Imagens otimizadas e com dimensoes definidas (sem CLS — §0)

## 6. Microcopy & Conteudo
- [ ] Labels e botoes claros, orientados a accao (verbos)
- [ ] Mensagens de erro humanas e uteis; sem jargao tecnico cru
- [ ] Tom consistente; sem "lorem ipsum" nem placeholders esquecidos

## 7. Motion & Feedback [Polido/Elite]
- [ ] Transicoes subtis e rapidas (150-300ms), com proposito (nao decorativas)
- [ ] Feedback imediato a accoes (optimistic UI quando fizer sentido)
- [ ] Nada que bloqueie ou distraia; respeita `prefers-reduced-motion`

## 8. Responsividade
- [ ] Mobile-first; viewport de telemovel sem overflow horizontal (**medir elemento a elemento** — §0)
- [ ] Alvos de toque >= 44px (**medir a caixa clicavel**, nao o input — §0); conteudo re-flui (nao so encolhe)
- [ ] Sem grids fixos que quebram (`flex flex-col sm:flex-row`)

## 9. SEO & Metadata [so apps web com paginas publicas]
- [ ] `<title>` e meta description unicos por pagina
- [ ] Open Graph / cards de partilha
- [ ] URLs semanticas; sitemap; dados estruturados quando relevante
- [ ] `lang` e favicon definidos

## 10. Performance percebida [ligado ao perf budget]
- [ ] Sem waterfalls; skeletons enquanto carrega
- [ ] Bundle dentro do target (`check-bundle-sizes.mjs`); imports pesados lazy
- [ ] Core Web Vitals saudaveis (LCP, CLS, INP) — obrigatorio no tier Elite; o CLS mede-se (§0)

> **Observabilidade** (opcional, depende da stack): se o projeto usa error tracking (ex: Sentry) ou logging estruturado, confirmar que erros de UI sao capturados. Nao assumir um vendor.

## Sessao (Handoff)
> Perguntar ao utilizador antes de terminar:
- [ ] Atualizar `.agent/context/session.md` / `walkthrough.md`?
- [ ] Algum achado vira ticket no `backlog.md` ou entrada em `anti-patterns.md`?
