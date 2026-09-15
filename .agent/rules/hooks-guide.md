# Guia dos Hooks ({{PROJECT_NAME}})

> **Rule de REFERENCIA — nao carregada.** Abrir ao mexer em `.claude/hooks/` ou `.githooks/`.
> Par de `.agent/rules/scripts-guide.md`, que cobre os verificadores universais.
>
> **A divisao nao e arbitraria**: os verificadores (`.agent/scripts/`) so precisam de `node`,
> correm em qualquer agente e no CI; os hooks de `.claude/hooks/` sao **so-Claude-Code**. Quem
> mexe num raramente mexe no outro, e juntos os dois catalogos cresciam para la do orcamento a
> cada peca nova.
>
> A evidencia (de onde veio cada decisao, o que custou) vive em
> `src/docs/scripts-guide-why.md`.

- **Hooks** (`.claude/hooks/`, **so-Claude Code**): o agente pode esquecer uma regra do `CLAUDE.md`; um hook nao esquece. Saem `0` em tudo excepto na negacao explicita — um hook avariado nunca bloqueia trabalho legitimo. Testes em `.claude/hooks/tests/test-hooks.mjs`.
  - `guard-protected-branch` (`PreToolUse`/`Bash`) — num branch protegido **permite so os verbos seguros** do `git` e **nega o resto**, incluindo o que nao consegue identificar; force-push cru (`--force`, `-f`, `+refspec`) e `--mirror` sao negados em **qualquer** branch; `--delete` e `:refspec` sao negados quando o **alvo** e um branch protegido — apagar um `fix/...` mergeado e rotina e tem de passar. E um **allowlist** de proposito: a versao com blocklist tinha 32 defeitos medidos — ver `TP6`. Os detalhes que so aparecem quando se mede (a FORMA conta e nao so o verbo; alguns verbos exigem uma forma; so o verbo falha fechado) estao em `src/docs/scripts-guide-why.md`.
    O alvo vem do `cwd` do payload **e de todos os `-C`/`--git-dir`/`cd`/`pushd` do comando**; sem pista valida cai no `cwd` do hook (lista vazia **permitia**). A tabela `BYPASSES` na suite e a lista viva de formas conhecidas — acrescentar uma quando aparecer. **Nao se escreve o tamanho dela em prosa**: a primeira tentativa dizia 28 quando a tabela tinha 47, e envelheceu no mesmo dia. O numero esta a um `grep -c` de distancia.
  - `session-context` (`SessionStart`) — afirma o estado real (branch, o que esta por commitar, PRs abertos) em vez de o deixar inferir. Deliberadamente **curto**: entra no contexto a cada sessao.
  - `stop-verify` (`Stop`) — diz que suite ficou **em divida** para os ficheiros tocados. Nao corre nada: um hook de fim de turno que corresse suites seria desligado.
  - `reinject-fronteiras` (`PreCompact`) — devolve o bloco **Fronteiras** do `CLAUDE.md` antes de a janela compactar. Sem ele, a compactacao descarta as rules importadas e o agente segue sem as regras nao-negociaveis, sem nada no ecra a dize-lo. So as Fronteiras (~600 bytes): reinjectar as rules inteiras derrotava o proposito da compactacao. Falha aberta.
  - `prompt-fase0` (`UserPromptSubmit`) — quando o pedido parece uma ordem de implementacao, devolve o que a **Fase 0** exige, antes de o agente responder. **Nao bloqueia** e **cala-se em perguntas** — ruido a cada prompt ensina a ignorar o lembrete. Falha aberta.
  - O `session-context` e o `stop-verify` usam `git status --untracked-files=all -z`: sem o `--untracked-files=all` o git **colapsa diretorios** nao rastreados (um ficheiro novo em pasta nova aparece como a pasta), e sem o `-z` cita os caminhos com acentos ou espacos e o matcher deixa de os reconhecer. (Este "ambos" dizia-se de dois hooks quando havia tres; com cinco, nomeiam-se.)
  - **Nao ha `lint-changed-file`** de proposito: os comandos de lint sao especificos da stack, logo o template so poderia trazer um hook inerte — e um hook que nao faz nada por omissao e prosa com mais passos. Se o teu projeto tem lint, vale a pena escreve-lo: `PostToolUse`/`Write|Edit`, a devolver o que nao e auto-corrigivel como contexto para ser corrigido no mesmo turno.
  - **A fronteira nao se reescreve a si propria.** O `deny` do `.claude/settings.json` cobre
    `Edit`/`Write` e **nao cobre `Bash`**: `sed -i`, `>`, `node -e`, `mv`, `rm` ou `chmod`
    sobre `.claude/settings.json`, `.claude/hooks/` ou `.githooks/` reescreviam a fronteira
    sem passar por nenhuma das duas — e o `BOOTSTRAP.md` vendia essa linha como "sem ela, o
    agente alarga as proprias permissoes". O hook fecha-o com uma **allowlist dos verbos de
    leitura**, nao uma blocklist dos de escrita (`TP6`): as formas de escrever em shell nao
    sao enumeraveis, as de ler sao poucas. Julga **por segmento** (`;`, `&&`, `|`, `do`) e nao
    pelo primeiro verbo da linha — a primeira versao negava um `for` que corresse a suite dos
    hooks, medido na sessao em que nasceu. O caminho aberto e o `Edit`, que pede aprovacao.
- **Mutation Sweep** (`.agent/scripts/mutation-sweep.mjs`): mede se as suites **afirmam** algo — desliga cada sitio de erro de cada verificador, um a um, e exige que a suite fique vermelha. Sai `!= 0` se um sitio puder ser desligado com a suite verde, se um verificador nao tiver suite, ou se a baseline ja estiver vermelha. Custa minutos (recorre a suite por sitio), logo e opt-in no CI: correr localmente apos mexer num `check-*.mjs`. **Substitui contar sitios a mao** — o numero e derivado. **Varre-se a si proprio** (`--only=mutation-sweep`): reprova quem nao tem suite, logo nao pode ser a excecao.

- **Hook do git** (`.githooks/commit-msg` + `.agent/scripts/test-commit-msg.mjs`): recusa mensagens de commit que atribuam o trabalho a uma IA (`Co-Authored-By` de ferramenta, "Generated with", emoji de robo); um co-autor humano passa. E do **git** e nao do Claude Code porque um `PreToolUse` ve `git commit -m` e nao ve `-F ficheiro` — e foi por `-F` que a regra foi violada. Ligar por clone: `git config core.hooksPath .githooks`; quem nao ligar fica sem a rede local, e por isso o `ci.yml` repete a verificacao sobre as mensagens do PR. Detalhe e a razao do blocklist no cabecalho do hook.

> **O limite da varredura, e o `TP7`.** Ela mede se cada sitio de aviso **existente** e
> observado; **nao** mede se um ramo nunca dispara, nem ve um falso positivo. Um `note()` nao e
> sitio de aviso, e um `warn()` inalcancavel por construcao passa igualmente — ela nao tem como
> distinguir "coberto" de "impossivel". Medido: `26/26` no Guard 15 antes **e** depois de fechar
> um ramo que era codigo morto. O que apanha isto e o **controlo negativo por ramo** — desligar
> cada metade da correcao, uma por vez, e exigir vermelho em cada uma. Historia completa e as
> licoes transferiveis em `src/docs/anti-patterns-why.md` (`TP7`).

> **`test-harness.mjs`, `tests-*.mjs` e `.claude/hooks/tests/` nao sao entry points.** Correm
> por importacao a partir do `test-guards.mjs` (ou do runner dos hooks) e reprovam se alguem os
> invocar diretamente — um ficheiro chamado `tests-x.mjs` que "passa" sem correr nada e a forma
> canonica do `TP2`.


- **Simulador de projeto derivado** (`.agent/scripts/simulate-derived.mjs` + `test-simulate-derived.mjs`): monta um projeto derivado (copia, substitui placeholders, gera as rules do bootstrap, aplica o passo 2.8) e corre la os verificadores. E a unica coisa que testa a promessa do template — todas as outras suites correm sobre o template **nu**. **Nao** se chama `check-*` de proposito: orquestra verificadores que ja tem par, e um alvo sem sitios de aviso proprios reprova na descoberta do sweep com `SINAL ERRADO`. Corre no CI em `pull_request` (~50s). O limite esta no cabecalho: simula o **estado** "bootstrap concluido", nao executa a checklist passo a passo.
