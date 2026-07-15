# /market-scan — Analise de Mercado & Ideacao de Features

Research **externo** de produto para o {{PROJECT_NAME}}: o que fazem apps semelhantes, que features faltam, e que ideias adotar. Distinto do `/audit` (saude interna). Cadencia **estrategica** (nao rotina), conduzido pelo utilizador.

> **Fundamentar na web e ser cetico**: cada afirmacao (features, pricing) leva **fonte (URL) + data + confianca** (alta/media/baixa) e e marcada **verificado** vs **assuncao**. Pricing e features alucinam e ficam stale — nunca inventar. **Nao implementar nada** — o output sao propostas de backlog.

## 1. Enquadramento (perguntar ao utilizador)

- 3-5 **concorrentes / apps de referencia** (se nao souber, sugerir com base no dominio em `business-logic.md`)
- **Utilizador-alvo e job-to-be-done (JTBD)**: que "trabalho" a app resolve para o utilizador
- **Diferenciador / posicionamento** pretendido

## 2. Scan de Concorrentes (web-grounded)

- Por concorrente: proposta de valor, features-chave, **pricing/monetizacao** (tiers, modelo), forcas/fraquezas — cada afirmacao com fonte + data + confianca
- **Sinais de utilizador** (varias fontes, nao so a marketing page): reviews app-store/Play, G2/Capterra, Reddit/foruns, changelogs dos concorrentes, comunidades
- Tabela comparativa de features (concorrentes vs a app)

## 3. Gap Analysis (por necessidade, nao por checklist)

- **Necessidades (JTBD) por satisfazer** que o mercado cobre e a app nao — nao apenas "features que faltam"
- Onde a app **ja ganha** (manter/amplificar)
- Tendencias emergentes e timing no dominio

## 4. Ideias a Adotar (adaptar, nao copiar)

- Padroes/features que servem o utilizador-alvo — adaptados ao contexto e diferenciador do projeto
- Incluir **inspiracao nao-concorrente** (produtos adjacentes com UX/padroes exemplares)
- Descartar o que nao encaixa (dizer porque)

## 5. Sugestoes Priorizadas

- **Impacto x esforco**, mas ponderado pelo **fit estrategico**: a ideia reforca o diferenciador ou so persegue paridade?
- **Guard anti "me-too"**: sinalizar features que achatam o posicionamento; nao recomendar so porque um concorrente as tem
- **Risco** (1 linha por ideia quando relevante): dependencia de plataforma/API de terceiros, regulatorio
- Recomendar as 3-5 de maior alavancagem, cada uma com um **teste barato para validar antes de construir** (fake-door, landing page, 3 entrevistas, prototipo)

## 6. Output

- Relatorio: comparativo + gaps + ideias + sugestoes priorizadas (com **fontes web datadas + confianca**)
- **Proposta de backlog**: features aprovadas -> items (seccao Features Futuras), com esforco e sprint sugerido — aguardar aprovacao
- Registar decisoes de produto relevantes em `.agent/context/decisions.md`

## Sessao (Handoff)

> Perguntar ao utilizador antes de terminar:

- [ ] Items aprovados adicionados ao `backlog.md`?
- [ ] Decisoes de produto em `.agent/context/decisions.md`?
