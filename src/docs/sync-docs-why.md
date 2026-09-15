# Porque a matriz de propagacao e assim — evidencia

> **NAO carregado.** Par de `.agent/rules/sync-docs.md`: la ficam as instrucoes, aqui a razao
> de cada uma. A separacao existe por orcamento de contexto — a checklist e reaberta antes de
> cada commit e passou o limiar de 12 500 bytes.

## Script novo: porque **nunca** no job `quality`

O job `quality` tem `if: has_pkg == 'true'` e salta por inteiro num template sem app. Um guard
la ficava **testado** (pelas suites) e **nunca aplicado**. Foi o padrao que o `check-test-surface`
teve durante meses: documentado em todo o lado e corrido por nada.

O `check-test-surface` vive no `guard-tests` mas com `if: github.event_name == 'pull_request'`,
porque precisa da base do PR — logo nao corre no push para `main`. Os `test-*.mjs`, o
`check-doc-versions` e o `check-backlog` correm sempre: nao dependem de `package.json`.

## Constante adaptavel: porque entra na tabela do `/upgrade`

Sem a linha na tabela de categorias, um upgrade faz **copia cega** e apaga a adaptacao do
projeto — devolvendo o gate a medir zero. Um gate que mede zero nao avisa nunca, e ninguem
nota, porque continua verde.

## Duplicacao forcada: verifica-se, nao se proibe

Acontece com as Fronteiras (`CLAUDE.md` -> `.cursor/rules/*.mdc` + `.github/copilot-instructions.md`,
Guard 1d) e com `CLAUDE.md`≡`GEMINI.md` (Guard 2). E a regra *"duplicacao nova e flag no
/review"* de `core-rules.md` levada ao fim: **quando extrair e impossivel, verifica-se**.


## Servidor MCP: porque a aprovacao vem ANTES da configuracao

Um `.mcp.json` no repo e **partilhado com quem clona** — e conveniente e perigoso ao mesmo
tempo. Um servidor que so uma pessoa quer vai na config de utilizador, nao no repo.

E as credenciais vao por variavel de ambiente sempre: um token dentro do ficheiro e um secret
versionado. O `gitleaks` do CI apanha-o, mas nessa altura o commit ja aconteceu — e um secret
num repo publico conta-se como comprometido a partir do push, nao a partir da deteccao.


## Porque o `25a`/`25b` foi renumerado para 26/27

O Guard 12 conta os pontos da checklist com `^\d+\. \[ \]`, que **nao apanha sufixos de
letra**. Os pontos `25a` e `25b` existiam e nao contavam: a prosa dizia "26 pontos", o guard
contava 26, os dois concordavam um com o outro — e ambos subestimavam o trabalho real em dois.
E o `TP1` dentro do guard escrito para impedir o `TP1`.
