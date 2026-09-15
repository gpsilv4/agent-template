# Anti-Padroes ({{PROJECT_NAME}})

> Anti-padroes deste projeto. Sempre-carregado — manter enxuto (conta para o orcamento de bytes).
> Adicionar uma entrada sempre que um bug revele um padrao evitavel; quando vira regra estavel,
> migrar para `core-rules.md`.
>
> **Os sete anti-padroes do template (`AP1`-`AP7`) vivem em `anti-patterns-template.md`** — NAO
> carregado, lido on-demand. Sao sobre a maquinaria do template (hooks `.mjs`, `git status
> --porcelain`), e mante-los aqui custava 24% do orcamento sempre-carregado a todos os
> projetos, incluindo aos que nao sao Node. O Guard 15 varre os dois ficheiros, logo as
> citacoes continuam a resolver.
>
> **O Guard 15 reprova se o mesmo numero estiver definido nos DOIS ficheiros.** Uma citacao a
> `AP4` resolveria — mas para qual dos dois, que tem significados diferentes? E pior do que uma
> referencia morta: a morta denuncia-se, esta confirma uma leitura que nao e a do autor.
>
> **Comeca no proximo ID livre** — os sete do template estao tomados e sao citados em dezenas
> de sitios. Confirma com: `git grep -hoE '^#{2,3}[[:space:]]+AP[0-9]+' .agent/rules/ | sort -uV | tail -1`

## Formato de cada entrada

- **Origem**: ticket/bug que o revelou (ex: `B7`)
- **Anti-padrao**: o que **NAO** fazer
- **Correto**: o que fazer em vez disso
- **Detecao em review**: um `grep` concreto que apanha o anti-padrao

---

<!--
Exemplo (comentado — substituir pelo primeiro anti-padrao real do projeto):

## APn — useEffect + useState para dados do backend

- **Origem**: B1
- **Anti-padrao**: `useEffect(() => { fetch(...).then(setState) }, [])`
- **Correto**: usar o cliente de data-fetching do projeto (ver `core-rules.md`)
- **Detecao em review**: `grep -rn "useEffect" src/ | grep -i "fetch\|supabase\|api"`
-->
