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

## AP1 — Teste cuja assercao e satisfeita por outra verificacao

- **Origem**: cinco rondas de review a este template, sempre a mesma classe.
- **Anti-padrao**: afirmar `output.includes("<texto>")` sobre o output INTEIRO de um
  verificador, com uma mutacao que quebra mais do que o alvo do teste. O teste fica verde
  porque OUTRA verificacao falhou, e neutralizar a que esta sob teste passa despercebido.
  Variante: o `includes` nao distingue niveis, logo despromover um erro a aviso mantem o
  teste verde e desliga o gate.
- **Correto**: afirmar contra as linhas do nivel certo, e mutar so o input do alvo. Para
  verificadores, medir **cobertura de mutacao**: sabotar cada sitio de erro, um a um, e
  exigir que a suite fique vermelha em cada um.
- **Detecao em review**: sabotar e contar.
  `grep -c 'includes:' <ficheiro-de-testes>` nao pode crescer sem que a varredura de
  mutacao continue a apanhar 100% dos sitios. Neste repo:
  `node .agent/scripts/test-guards.mjs` apos trocar cada `warn(` por `note(` em
  `check-doc-versions.mjs` — 47 sitios, todos tem de ficar vermelhos.

> Esta entrada vem do template. Aplica-se a qualquer projeto que escreva testes de
> verificadores; se o teu projeto nao tiver nenhum, podes substitui-la pela primeira que
> um bug teu revelar.
