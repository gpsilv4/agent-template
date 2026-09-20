# Matriz de Propagacao ({{PROJECT_NAME}})

> **Rule de REFERENCIA — nao carregada.** Abrir **ao criar um ficheiro novo**, para nada ficar
> desatualizado. Par de `.agent/rules/sync-docs.md`, que se corre **antes de um commit**.
>
> A separacao e por momento de uso: um catalogo consulta-se ao criar, o outro ao fechar. Juntos
> passavam o orcamento do Guard 1b a cada tipo de artefacto novo — e cortar prosa adiava em vez
> de resolver.
>
> A evidencia (porque cada linha e assim) vive em `src/docs/sync-docs-why.md`.

## Matriz de Propagacao (ao ADICIONAR um ficheiro novo)

> A fonte de verdade vive em `.agent/`. Ao criar um ficheiro novo, replicar/registar nos sitios abaixo
> para nada ficar desatualizado. Os wrappers `.claude/`/`.gemini/` sao **ponteiros finos** — nunca duplicar logica.

| Novo ficheiro | Onde replicar/registar |
|---|---|
| **Workflow** (`.agent/workflows/X.md`) | wrapper `.claude/commands/X.md` + `.gemini/commands/X.toml` (ponteiro fino que **cita o caminho do proprio workflow** — validado pelo Guard 10); tabela de workflows em `CLAUDE.md` + `GEMINI.md` + `AGENTS.md`; `src/docs/agent-guide.md`; `README.md` (arvore); **tabela de fluxo por tipo** em `process-rules.md` e `CONTRIBUTING.md`; listas de essenciais/removiveis do Modo minimo em `BOOTSTRAP.md`. **Se o workflow mandar escrever em `.agent/context/`**, a nota da excecao do template (o Guard 21 reprova; no template o output vai para um issue) — a regra estava em `process-rules.md` e dez workflows continuavam a dar a ordem sem a mencionar |
| **Rule sempre-carregada** (`.agent/rules/X.md`) | `@import` em `CLAUDE.md` + `GEMINI.md`; **`AGENTS.md`** (enumera as rules pelo nome); array `REQUIRED_RULES` em `check-doc-versions.mjs` (orcamento de bytes); `agent-guide.md`; `README.md` |
| **Ponto de entrada de uma ferramenta** (`.github/copilot-instructions.md`, `.cursor/rules/*.mdc`, ...) | ponteiro **fino** para `AGENTS.md` — nunca logica; incluir no varrimento de placeholders do `BOOTSTRAP` §2.1 (atencao a extensao: `.mdc` nao e `.md`) e nos alvos do Guard 13; linha na tabela de compatibilidade do `README.md` com o que foi **de facto** verificado |
| **Rule NAO carregada** (checklist/guia) | referencia on-demand nos workflows que a usam; **ponteiro curto na rule carregada que a torna obrigatoria** (padrao do `sync-docs.md` e do `ticket-method.md`); `README.md`/`agent-guide.md`; ponto novo na checklist numerada de `.agent/rules/sync-docs.md` — **sem** `@import` |
| **Harness ou fixture de teste** (`tests/harness/`, ou qualquer `mkdtempSync`) | **limpa o que cria**, e um teste afirma-o: as pastas em `tmpdir` antes e depois de uma corrida tem de dar **delta 0**. **Contar antes de limpar** — a contagem e o que denuncia a fuga, um numero anormal e achado e nao sujidade, e apagar sem olhar deita fora a prova com o lixo. So se ve quando a varredura de mutacao corre a suite dezenas de vezes: **1508 pastas num dia**, e uma fuga igual ja inflou uma medicao de tempo em **3x**. E a limpeza a saida nao chega: um `SIGKILL` nao se apanha, logo quem varre o que sobrou e a corrida SEGUINTE, no **arranque** (`lib/tmp-limpo.mjs`) — e so o que ja nao tem dono vivo, porque duas corridas em paralelo acontecem e apagar a cego destruia a copia de uma delas. Limpar e **informar**; nao se pede autorizacao para limpar lixo da propria ferramenta |
| **Ficheiro `.mjs` novo na maquinaria** (`.agent/scripts/`, `.claude/hooks/`) | manter abaixo das **500 linhas** — o Guard 17 reprova acima, e um teto em `guards/sizes.mjs` e catraca (so encolhe), nunca isencao; entrada em `PARES` do `mutation-sweep.mjs` + suite propria em **`.agent/scripts/tests/`** (`test-*` corre-se, `tests-*` e descoberto; um harness vai para `tests/harness/`). Se for um **hook** (`.claude/hooks/`), **ligar na chave `hooks` do `.claude/settings.json`** — um hook por ligar nunca dispara e e indistinguivel de um a funcionar, ao ponto de a varredura o certificar a 100%. O Guard 11 reprova; a saida legitima e `@opt-in: <razao>` no cabecalho |
| **Servidor MCP** (`.mcp.json` ou equivalente noutro agente) | linha em *Servidores aprovados* de `.agent/rules/mcp-policy.md` **antes** de o configurar (o Guard 16 reprova sem ela); credenciais por variavel de ambiente (ver *why*) |
| **Duplicacao forcada** (o mesmo texto em dois ficheiros porque cada tool le so o seu) | um guard que compare as copias — **nunca** confiar em mante-las iguais a mao (ver *why*) |
| **Constante adaptavel** num script (`BANNED`, `CHECKS`, `TEST_GLOBS`, `CONFIG_GLOBS`, `CONTAGENS`) | a linha correspondente na tabela de categorias do `upgrade.md`; e o `BOOTSTRAP.md`, com a receita que manda adapta-la (ver *why*). **Antes de acrescentar mais uma, ver a linha seguinte**: preservar-por-nome e uma lista mantida a mao, e uma lista a mao envelhece |
| **Configuracao do projeto** (`.agent/scripts/config/X.mjs`) | e o sitio PREFERIDO para tudo o que e decisao do projeto e nao logica — o `/upgrade` nao a SUBSTITUI, por categoria e sem lista de nomes — mas copia-a quando o consumidor ainda nao a tem, senao a logica nova fica a importar o que nao existe. Registar em `BOOTSTRAP.md` (a receita que manda adapta-la) e no `scripts-guide.md`; **nao** acrescentar a lista de constantes preservadas do `upgrade.md`, que passaria a proteger um ficheiro que ja nao se copia. Motivo medido: o interruptor `ALVOS_REPROVAM` ficou fora da lista a mao e a decisao de um projeto perdeu-se em silencio (ver `upgrade-why.md`) |
| **Script** (`.agent/scripts/X.mjs`) | passo no job **`guard-tests`** do `ci.yml` se nao depender de `package.json` — **nunca no `quality`** (ver *why*); `core-rules.md` (seccao scripts); `README.md` (arvore + tabela); **e os sitios que o INVOCAM**: `review.md`, `deploy.md`, `pull_request_template.md`, `BOOTSTRAP.md` §2.4. Se e um guard, criar tambem **`tests/test-X.mjs`** com os controlos negativos e a entrada em `PARES` |
| **Git hook versionado** (`.githooks/X`) | suite `tests/test-X.mjs`; entrada em `PARES` no `mutation-sweep.mjs`; passo no job `guard-tests` do `ci.yml`; regra no mapa `lib/mapa-suites.mjs` (o `stop-verify.mjs` importa-o, e o `mutation-sweep --diff` tambem); passo `git config core.hooksPath .githooks` em `/setup` + `CONTRIBUTING.md`; arvore do `README.md` |
| **Modulo partilhado** (`.agent/scripts/lib/X.mjs`) | suite `tests/test-X.mjs`; entrada em `PARES`; a descoberta do `mutation-sweep` ja varre `lib/`, logo **sem par o gate reprova** (excepto um modulo so de dados, sem um unico sitio de recusa); passo no `ci.yml`; regra no mapa `lib/mapa-suites.mjs`; entrada no `allow` de `.claude/settings.json` se for para correr |
| **Context** (`.agent/context/X.md`) | decidir **importado** (`@` em CLAUDE.md + GEMINI.md) vs **arquivo** (nao importado, historico inerte); **`AGENTS.md`**; `README.md`; `agent-guide.md`; **ponto novo na checklist numerada de `.agent/rules/sync-docs.md`** (sem citar o total: o Guard 12 so valida a forma `(N pontos` em linhas que mencionem `sync-docs`, logo um intervalo escrito a mao escapa-lhe — e este dizia `1-24` com 26 pontos; ver *why* sobre a renumeracao do `25a`/`25b`); classificacao substituido/acumulado/permanente em `process-rules.md`; nota dos `*-archive.md` em `CLAUDE.md`/`GEMINI.md`; **e o hash do conteudo por estrear em `PRISTINOS`** (`.agent/scripts/guards/context-virgem.mjs`) — sem ele o Guard 21 reprova o ficheiro novo, e e isso que impede que trabalho pendente entre aqui disfarcado de andaime |

> **Sentido inverso**: quando o **template de origem** ganha algo e se quer trazer para um
> projeto derivado, o workflow e `/upgrade` (`.agent/workflows/upgrade.md`). Decide por
> **categoria de ficheiro** — nunca por lista de nomes, que envelhece — e o `.agent/context/*`
> nunca se toca. Se acrescentares uma categoria a matriz acima, acrescenta a linha
> correspondente a tabela do `/upgrade`.

> Regra de paridade: qualquer edicao a `CLAUDE.md` tem espelho em `GEMINI.md` (so difere `@[...]`) — validado por `check-doc-versions.mjs`.
