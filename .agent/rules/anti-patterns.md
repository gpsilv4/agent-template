# Anti-Padroes ({{PROJECT_NAME}})

> Anti-padroes derivados de bugs reais. Sempre-carregado — manter enxuto (conta para o orcamento de bytes).
> Adicionar uma entrada sempre que um bug revele um padrao evitavel; quando vira regra estavel, migrar para `core-rules.md`.

## Formato de cada entrada

- **Origem**: ticket/bug que o revelou (ex: `B7`)
- **Anti-padrao**: o que **NAO** fazer
- **Correto**: o que fazer em vez disso
- **Detecao em review**: um `grep` concreto que apanha o anti-padrao

---

<!-- Exemplo (substituir/remover no bootstrap — este e ilustrativo, nao especifico do projeto):

### AP1 — `useEffect` para data fetching

- **Origem**: B3 (dados desatualizados apos navegacao)
- **Anti-padrao**: `useEffect(() => { fetch(...).then(setState) }, [])` para dados do backend.
- **Correto**: usar o data-fetching layer do projeto (<state-management>) com cache + invalidacao.
- **Detecao em review**: `grep -rn "useEffect" src/ | grep -i "fetch\|setState"`

-->

## AP1 — Teste cuja assercao e satisfeita por outro guard

- **Origem**: quatro rondas consecutivas de review a este repo (a mesma classe, quatro vezes).
- **Anti-padrao**: afirmar `out.includes("<texto>")` sobre o output INTEIRO de um verificador,
  com uma mutacao que quebra mais do que o alvo do teste. Tipico: escrever `CLAUDE.md` sem
  escrever `GEMINI.md`, o que dispara sempre o guard de paridade. O teste fica verde porque
  OUTRO guard avisou, e neutralizar o guard sob teste passa despercebido. A variante mais
  subtil: `includes` nao distingue `WARN` de `NOTE`, logo despromover um aviso a nota mantem
  o teste verde e desliga o gate.
- **Correto**: afirmar contra as linhas do NIVEL certo (so as `WARN`), e mutar apenas o input
  do guard sob teste — ou normalizar tudo o resto primeiro. Para verificadores, medir
  **cobertura de mutacao**: sabotar cada sitio de aviso, um a um, e exigir que a suite fique
  vermelha em cada um. Foi essa varredura que revelou 7 ramos sem cobertura que 109 testes
  verdes escondiam.
- **Detecao em review**: `grep -n 'writeF(dir, "CLAUDE.md"' .agent/scripts/test-guards.mjs` —
  cada ocorrencia tem de escrever tambem o `GEMINI.md`, ou declarar `excludes: ["DIVERGEM"]`.
  E `grep -c 'includes:' .agent/scripts/test-guards.mjs` nao pode crescer sem que a varredura
  de mutacao (`node .agent/scripts/test-guards.mjs` apos sabotar cada `warn(`) continue a
  apanhar 100% dos sitios.
