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
    // As sete condicoes da decisao, marcadas com `nega(` para terem a forma que a varredura ja
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
];
