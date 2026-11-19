/**
 * Os pares da varredura para os HOOKS (`.claude/hooks/` e o `lib/` deles) — {{PROJECT_NAME}}
 *
 * Saiu do `lib/pares.mjs` quando ele chegou as 498 linhas (#243): os pares do template crescem a
 * cada verificador, e os dos hooks sao a familia maior. O `pares.mjs` junta-os no MESMO sitio da
 * ordem em que estavam — a varredura corre pela ordem da tabela, e a ordem e semantica.
 *
 * Nao tem sitios de recusa — e uma tabela. O formato de cada entrada esta no `pares.mjs`.
 */
export const PARES_DOS_HOOKS = [
  {
    // O sinal de um guard-hook e a negacao. Mutar `negar(` deixa o hook a permitir tudo em
    // silencio, que e exatamente a falha que uma suite tem de apanhar.
    alvo: ".claude/hooks/lib/fronteira.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    // As condicoes da decisao, marcadas com `nega(` para terem a forma que a varredura ja
    // le. Sem o marcador, o sinal teria de casar tres sintaxes de `return` — string literal,
    // template literal e um ternario — sem casar o `return null`, e isso e fragil ao ponto de
    // ser o proximo `TP8`. O neutro devolve `null`, que e a forma de PERMITIR deste ficheiro:
    // mutar um sitio deixa a fronteira a autorizar exactamente uma classe de escrita.
    //
    // `(?<!const\s)` pela mesma razao que o `(?<!function\s)` do vizinho: mutar a DEFINICAO da
    // erro de sintaxe, a suite fica vermelha pela razao errada, e a varredura conta-o como
    // cobertura. Aqui a definicao e uma arrow atribuida a `const`.
    sinal: /(?<![\w.$])(?<!const\s)nega\(/,
    neutro: "((x) => null)(",
  },
  {
    // A outra metade de `hooks/lib/`: o que conta como invocacao DESTRUTIVA de git. A recusa
    // aqui e `return true` — o ficheiro responde a "isto e perigoso?", logo o `true` e que nega.
    // O neutro e `return false`: cada mutacao deixa passar uma forma insegura de cada vez.
    alvo: ".claude/hooks/lib/verbos-git.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<=^\s*(?:if \(.*\) )?)return true(?=;)/,
    neutro: "return false",
  },
  {
    // O modulo-FOLHA da fronteira (#243): o que E a fronteira e qual e o verbo real de um segmento.
    // Nao nega — decide. Os sitios sao as tres perguntas, e o neutro responde sempre "nao": um
    // caminho da fronteira deixa de o ser, uma flag passa a engolir o alvo, uma cabeca deixa de o ser.
    alvo: ".claude/hooks/lib/fronteira-dados.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])(?:CAMINHOS_FRONTEIRA\.some|FRONTEIRA\.test|CABECAS\.has)\(/,
    neutro: "((x) => false)(",
  },
  {
    // A terceira peca (#185): os caminhos escritos de outra maneira. Nao nega — reescreve, e o
    // `fronteira.mjs` nega pelo texto reescrito. O sinal e `formaCanonica(`: o sitio que diz "isto
    // da na fronteira". O neutro devolve `null` (FORA): cada mutacao deixa uma forma de escrever o
    // caminho, ou o directorio de um `cd`, por reconhecer. A definicao e uma `const` atribuida,
    // e `formaCanonica =` nao casa.
    alvo: ".claude/hooks/lib/caminhos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])formaCanonica\(/,
    neutro: "((x) => null)(",
  },
  {
    // O LEXER (#336; em `comandos.mjs` desde o #580). Nao nega: diz onde acaba uma substituicao, umas aspas ou um heredoc. O neutro
    // devolve o FIM do texto — a mutacao engole o resto do comando numa palavra (ou num corpo de heredoc), e
    // os casos de estrutura do `tests-posicao.mjs` tem de ficar vermelhos. Auto-contido de proposito: um nome
    // que nao existisse no ambito lancava, caia no `erro-ao-analisar`, e contava como morto pela razao errada.
    // As DEFINICOES (`const fechaSubst =`, `function fechaHeredoc(`) nao casam. Ficam de fora os ciclos que
    // seguem as aspas SIMPLES (o `indexOf`), as CRASES (dentro e fora de aspas duplas) e o `$'...'` — e dito,
    // para nao se ler "o lexer coberto" a mais. O `aritmetica()` usa o `fechaSubst(`, e entra.
    alvo: ".claude/hooks/lib/comandos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])(?<!function\s)(?:fechaSubst|fechaAspas|fechaHeredoc)\(/,
    neutro: "((t) => t.length)(",
  },
  {
    // A entrada, a saida e o PRAZO do guard (#227). Os sitios de chamada de `negar(` sao dois: o
    // prazo esgotado, e a negacao que o worker passa ao processo principal. Mutado um, o guard
    // permite o que devia negar. A definicao (`export function negar(`) nao conta.
    alvo: ".claude/hooks/lib/resposta.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])(?<!function\s)negar\(/,
    neutro: "(() => {})(",
  },
  {
    // O parser do `git status --porcelain -z` (A3 do #195), partilhado pelo `stop-verify` e pelo
    // `session-context`. Nao nega nem avisa: o seu sinal e o caminho que ENTREGA — mutado, um hook
    // deixa de ver os ficheiros tocados, e a divida desaparece em silencio.
    alvo: ".claude/hooks/lib/porcelain.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])caminhos\.push\(/,
    neutro: "(() => {})(",
  },
  {
    // O ambito do Bash de um subagente (S-01 do #195). O sinal e o `return false` que recusa um
    // comando composto ou com `--output`: mutado para `true`, esse comando passa. A recusa fora dos
    // prefixos vem do `.some(...)` e mede-se pelos testes de ponta a ponta, nao por este par.
    alvo: ".claude/hooks/lib/ambito-agente.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /return false(?=;)/,
    neutro: "return true",
  },
  {
    // Os branches protegidos numa so fonte (#257). O sinal e o default de quando o JSON falta ou e invalido:
    // mutado para `[]`, um hook sem config deixava de proteger qualquer branch — falha aberta.
    alvo: ".claude/hooks/lib/protegidos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /lista: PROTEGIDOS_POR_OMISSAO(?=, estado)/,
    neutro: "lista: []",
  },
  {
    // O hook que liga o ambito ao payload. Um so sitio de `negar(`: mutado, nada nega.
    alvo: ".claude/hooks/guard-subagent-bash.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])(?<!function\s)negar\(/,
    neutro: "(() => {})(",
  },
  {
    // O hook dos nomes proibidos nos textos publicados (#375b). Cada `negar(` e um estado: a lib em falta, a lista
    // que nao serve, o texto por ler, o nome achado. Mutado um, esse caso publica.
    alvo: ".claude/hooks/guard-textos-publicos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])(?<!function\s)negar\(/,
    neutro: "(() => {})(",
  },
  {
    // ...e o que ele le (#375b). O que NAO se consegue ler vai para o `porLer` (o hook nega): desligado um, uma
    // expansao ou um pipe passavam a texto lido, e o nome dentro deles publicava-se.
    alvo: ".claude/hooks/lib/textos-publicos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])out\.porLer\.push\(/,
    neutro: "(() => {})(",
  },
  {
    // ...e o que ele LE: desligado um `out.textos.push(`, esse texto (um ficheiro, um heredoc) nao era procurado.
    alvo: ".claude/hooks/lib/textos-publicos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])out\.textos\.push\(/,
    neutro: "(() => {})(",
  },
  {
    // ...e para ONDE publica (#399): desligado um `out.alvoExterno = true`, um repo DESLIGADO publicava noutro repo
    // sem verificacao. O neutro mantem o valor (`falhou = falhou;`): um `false` desfaria o `true` de outro sitio.
    alvo: ".claude/hooks/lib/textos-publicos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])out\.alvoExterno = true/,
    neutro: "out.alvoExterno = out.alvoExterno",
  },
  {
    alvo: ".claude/hooks/guard-protected-branch.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    // `(?<!function\s)`: sem isto o padrao casava a DEFINICAO `function negar(razao)`, e
    // mutar uma definicao da erro de sintaxe — a suite ficava vermelha pela razao errada e a
    // varredura contava-o como cobertura. So os sitios de CHAMADA sao mutacoes com sentido.
    sinal: /(?<![\w.$])(?<!function\s)negar\(/,
    neutro: "(() => {})(",
  },
  {
    // Estes dois nao negam: informam. O seu sinal e o `console.log` do payload — mutado, o
    // hook fica mudo, e uma suite que afirme o conteudo tem de ficar vermelha.
    alvo: ".claude/hooks/session-context.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])console\.log\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".claude/hooks/stop-verify.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])console\.log\(/,
    neutro: "(() => {})(",
  },
  // --- As ATRIBUICOES (#546): as duas definicoes de `fronteira-dados.mjs`, em cada sitio que as CHAMA (a definicao nao e
  // um sitio). O neutro responde "nao e atribuicao": a palavra deixa de se saltar, e o perigo que vinha a seguir (o `git`,
  // o `GIT_PAGER`, o interpretador) ou o verbo da allowlist deixa de se ver. Ficam de fora, e e dito: a LARGA no
  // `RECEBE_CODIGO` (`fronteira.mjs`), dentro de uma template string que a varredura nao le — um controlo manual do
  // #546 (a regex antiga) ficou vermelho no `env X+=1 $C <<EOF`; as linhas
  // `.every(...)` do `defineGhRepo`/`mudaONode` (ensombradas pelo `cabeca()`), e o `nomeDaAtribuicao(` nos argumentos
  // de um `export` (um argumento sem `=` com `[`/`+` nem e valido em bash: o mutante e equivalente). O do guard dos
  // branches esta no `invocacoes-git.mjs` desde o #580.
  ...[".claude/hooks/lib/invocacoes-git.mjs", ".claude/hooks/lib/verbos-git.mjs", ".claude/hooks/lib/posicao.mjs"].map((alvo) => ({
    alvo,
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])ATRIBUICAO_LARGA\.test\(/,
    neutro: "((x) => false)(",
  })),
  // A do BASH onde decide o verbo (a allowlist do `levaMarcador`, so com o indice literal desde o M3 do `/audit` da
  // v0.63.6; a leitura nova do `verboEm`) e, no `cabeca-comando` (era o `textos-publicos` ate ao #580), so a do `cabeca()`
  // pelo CRU: os outros dois do ficheiro sao os `.every(...)` ensombrados, acima.
  ...[[".claude/hooks/lib/caminhos.mjs", /(?<![\w.$])ATRIBUICAO_BASH_LITERAL\.test\(/], [".claude/hooks/lib/posicao.mjs", /(?<![\w.$])ATRIBUICAO_BASH\.test\(/],
    [".claude/hooks/lib/cabeca-comando.mjs", /(?<![\w.$])ATRIBUICAO_BASH\.test\((?=ws\[i\]\.cru\))/]].map(([alvo, sinal]) => ({
    alvo,
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal,
    neutro: "((x) => false)(",
  })),
  // A LARGA depois de um `env`/`sudo`: no `depoisDeAtribuidora` (duas seguidas, `env A-B=1 C-D=1 $N`) e no `cabeca()`.
  ...[".claude/hooks/lib/fronteira-dados.mjs", ".claude/hooks/lib/cabeca-comando.mjs"].map((alvo) => ({
    alvo,
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])ATRIBUICAO_LARGA\.test\(/,
    neutro: "((x) => false)(",
  })),
  {
    // Cada forma que muda o `node` e tira a isencao do `commit-msg` (#536, #545, #546), uma por linha: desligada uma,
    // essa forma passava a deixar o `node .githooks/commit-msg` isento depois de mudar o `node`. Casa tambem a 1.a linha
    // do `defineGhRepo` (o `GH_REPO` que o `cabeca()` recolhe), a mesma forma: desligada, um `sudo GH_REPO=o/r gh` publicava.
    // Em `cabeca-comando.mjs` desde o #580.
    alvo: ".claude/hooks/lib/cabeca-comando.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /^ {2}if \((?=.+\) return true;$)/,
    neutro: "  if (false && ",
  },
  {
    // #565: as duas cabecas que mudam a pasta (`env -C`/`--chdir`, `sudo -D`/`-i`/`--login`), uma por linha: desligada
    // uma, um `-F f` relativo desse `gh` lia-se no cwd do hook e publicava-se o de outra pasta (o caso da pasta mudada).
    alvo: ".claude/hooks/lib/cabeca-comando.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    // O sinal sem o literal (a varredura le as linhas com o conteudo das strings em branco, `"env"` vira `"   "`).
    sinal: /^ {4}if \((?=vistas\.has\()/,
    neutro: "    if (false && ",
  },
  {
    // #565: o despacho das palavras `gh`/`git` que NAO sao o verbo do `cabeca()` (a do verbo despacha-se noutra linha).
    // Desligado, volta-se exatamente ao `main`: o valor de uma flag de cabeca esconde o `gh` (`env -u FOO gh`,
    // `sudo -u eu git commit`), e so os casos do #565 ficam vermelhos.
    alvo: ".claude/hooks/lib/textos-publicos.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])despacha\(cmd, ws, k,/,
    neutro: "(() => {})(cmd, ws, k,",
  },
  {
    // O `+=` literal das variaveis que o git executa e do `NODE_OPTIONS` com `data:`: tirado, o `GIT_PAGER+=cmd` e o
    // `NODE_OPTIONS+='--import=data:...'` deixavam de se ler.
    alvo: ".claude/hooks/lib/verbos-git.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<=_\\d\+\)|GIT_CONFIG_PARAMETERS)\\\+\?(?==)/,
    neutro: "",
  },
  {
    alvo: ".claude/hooks/lib/posicao.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<=NODE_OPTIONS)\\\+\?(?==)/,
    neutro: "",
  },
];
