# Anti-Padroes ({{PROJECT_NAME}})

> Anti-padroes deste projeto. Sempre-carregado — manter enxuto (conta para o orcamento de bytes).
> Adicionar uma entrada sempre que um bug revele um padrao evitavel; quando vira regra estavel,
> migrar para `core-rules.md`.
>
> **Os anti-padroes do template (`TP1`-`TP9`) vivem em `anti-patterns-template.md`** — NAO
> carregado, lido on-demand. Sao sobre a maquinaria do template (hooks `.mjs`, `git status
> --porcelain`), e mante-los aqui custava 24% do orcamento sempre-carregado a todos os
> projetos, incluindo aos que nao sao Node. O Guard 15 varre os dois ficheiros, logo as
> citacoes continuam a resolver.
>
> **Comeca no primeiro numero.** O prefixo `AP` e teu e esta todo livre: o template usa `TP`, logo os
> numeros dele nao consomem os teus e nenhuma citacao trazida por um `/upgrade` precisa de ser
> reescrita. Antes de os prefixos se separarem, um derivado real ficou com quatro numeros a
> significar duas coisas cada — e nada no ecra o denunciava.
>
> **Cada prefixo no seu ficheiro.** O Guard 15 reprova o mesmo ID definido nos DOIS: uma
> entrada `TP` escrita aqui, ou uma `AP` escrita no ficheiro do template.

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
