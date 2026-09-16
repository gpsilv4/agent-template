/**
 * A tabela de pares do `mutation-sweep.mjs` — {{PROJECT_NAME}}
 *
 * Vive a parte por uma razao medida, e nao por gosto: o `mutation-sweep.mjs` passou as 500
 * linhas (o flag que `core-rules.md` torna obrigatorio e que o **Guard 17** verifica), e
 * destas 513 a tabela eram 186 — dados, nao logica. Separar os dados do motor deixa os dois
 * abaixo do limite e torna obvio onde se acrescenta um par.
 *
 * NAO e um entry point: nao corre nada. O `mutation-sweep.mjs` importa `PARES` daqui.
 *
 * Ao acrescentar um verificador ao repo, acrescentar a sua entrada AQUI — a descoberta em
 * disco do varredor reprova quem nao estiver nesta lista, que e o que impede um verificador
 * novo de entrar sem rede nenhuma.
 */

// Cada verificador tem de ter a sua suite E declarar como sinaliza um problema — nem todos
// sinalizam da mesma forma, e um regex global daria "0 sitios, nada a varrer" a um
// verificador inteiro (o mesmo silencio que este repo passou a sessao a eliminar).
//
// `sinal` casa a chamada que faz o verificador reprovar; `neutro` e o que a substitui para
// a DESLIGAR sem quebrar a sintaxe.
//
// O que isto mede, exatamente: se **algum teste nota a falta daquele aviso**. Para os pares
// `warn(`/`flag(` o `neutro` faz a mensagem DESAPARECER — nao e a variante do `TP1` em que a
// mensagem fica e so o gate cai (`warn(` -> `note(`). Nestes verificadores as duas coisas sao
// o mesmo mecanismo (`hasWarnings`/`warnings`), logo a distincao nao e explorável aqui; mas
// nao se deve ler a varredura como prova de que o VEREDICTO esta afirmado, so a mensagem.
//
// `skip(` fica de fora de proposito: um SKIP nao e um achado, e o que o dispara e a
// ausencia de um ficheiro, nao a linha em si.
export const PARES = [
  {
    // Os HARNESSES nao estavam em `PARES` nem na descoberta — zero cobertura de mutacao nos
    // ficheiros que decidem o veredicto de ~260 testes. Medido: reverter a assercao ao nivel
    // da linha WARN, apagar as invariantes WARN<->exit, ou apagar o `if (code !== expect.code)`
    // deixavam tudo verde.
    alvo: ".agent/scripts/test-harness.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])problems\.push\(/,
    neutro: "(() => {})(",
  },
  {
    // O harness do simulador de `/upgrade`, extraido quando a suite passou as 500 linhas e a
    // catraca do Guard 17 exigiu a divisao. Entrou na descoberta no momento em que ganhou o
    // prefixo `test-` da convencao — e a descoberta reclamou logo, com razao: um harness DECIDE
    // o veredicto de toda a suite que o usa.
    //
    // O `sinal` e o `throw`, e nao um `warn(`/`problemas.push(`: este harness nao reporta, ele
    // PARA. A unica recusa que tem e a do `fatal` injectado no motor — desliga-la faz um `cenario`
    // que devia reprovar seguir em frente e a suite passar a medir outra coisa.
    alvo: ".agent/scripts/test-upgrade-harness.mjs",
    suite: ".agent/scripts/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])throw new Error\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/test-surface-harness.mjs",
    suite: ".agent/scripts/test-test-surface.mjs",
    sinal: /(?<![\w.$])problemas\.push\(/,
    neutro: "(() => {})(",
  },
  {
    // Guard 17 (tamanho de ficheiro). A catraca so vale se cada um dos seus sitios de recusa
    // estiver medido: uma excecao que deixa de avisar e uma catraca aberta, e ninguem repara.
    // O simulador NAO casava a convencao `check-*.mjs` da descoberta, logo nunca foi medido —
    // e tem 8 sitios `fatal()`. E o proprio caso que a descoberta existe para nao ter: um
    // verificador com sitios de recusa, com suite propria, e sem rede que prove que eles ficam
    // vermelhos. Nao veio de nenhum relatorio: apareceu ao tentar varre-lo.
    alvo: ".agent/scripts/simulate-derived.mjs",
    suite: ".agent/scripts/test-simulate-derived.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // O simulador do OUTRO caminho: o `/upgrade`. Mesma razao que o de cima, e a mesma forma
    // de recusa (`fatal()`), porque o veredicto dele tambem e o exit code das suites que
    // orquestra. Um simulador que falhe ABERTO da por verificada metade do produto.
    alvo: ".agent/scripts/simulate-upgrade.mjs",
    suite: ".agent/scripts/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // O motor mecanico, em `lib/`. A descoberta varre `lib/`, logo sem par aqui o gate reprova
    // — e com razao: e este modulo que ESCREVE por cima dos ficheiros de um consumidor, e um
    // `fatal()` que deixe de disparar a esse nivel nao custa um aviso, custa dados.
    //
    // A `suite` e a mesma do simulador: o `test-simulate-upgrade.mjs` exercita o motor
    // directamente (chama-o com fixtures proprias), logo cada sitio daqui tem quem o meca.
    alvo: ".agent/scripts/lib/upgrade-mecanico.mjs",
    suite: ".agent/scripts/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/sizes.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/mcp.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Falha aberta por desenho (esta no caminho de CADA prompt), logo nao tem `warn(`.
    // O sitio que DECIDE e o `console.log` do lembrete.
    alvo: ".claude/hooks/prompt-fase0.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])console\.log\(/,
    neutro: "(() => {})(",
  },
  {
    // O hook nao tem `warn(`/`fatal(`: falha aberta por desenho. O sitio que DECIDE e o
    // `console.log` da reinjeccao — desliga-lo faz o hook nao entregar nada, que e
    // exactamente o defeito que os testes tem de apanhar.
    alvo: ".claude/hooks/reinject-fronteiras.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])console\.log\(/,
    neutro: "(() => {})(",
  },
  {
    // A seleccao do runner (TP4, invariante 2). Vive em `lib/` e nao em `guards/` porque
    // nao e um guard de documentacao — mas tem sitios de recusa, logo tem de ter rede.
    alvo: ".agent/scripts/lib/registo.mjs",
    suite: ".agent/scripts/test-registo.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/check-doc-versions.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Modulo do Guard 11, extraido do check-doc-versions.mjs. Tem de estar aqui: os avisos
    // vivem neste ficheiro, e sem a entrada a varredura cobriria 652 das 911 linhas
    // originais e reportaria 100% a mentir. A suite e a mesma do ficheiro de origem.
    alvo: ".agent/scripts/guards/settings.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    // `flag(` e obrigatorio aqui: este guard emite quase tudo por um wrapper `flag()` que
    // chama `warn` por dentro. Com o padrao so a ver `warn(`, a varredura media 3 sitios de
    // 21 — e o unico que via era o `warn(` DENTRO do `flag`, cuja mutacao desliga os 18 de
    // uma vez. Media "existe pelo menos um teste que usa o flag", nao a cobertura.
    sinal: /(?<![\w.$])(warn|flag)\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/versions.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/derived-counts.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/placeholders.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Modulo dos orcamentos de bytes (guards 1/1b/1c/1d), extraido do check-doc-versions.mjs
    // pela mesma razao que o de baixo: o ficheiro de entrada passou o flag das 500 linhas.
    alvo: ".agent/scripts/guards/budgets.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Modulo do Guard 15, extraido do check-doc-versions.mjs quando este passou o flag das
    // 500 linhas. A suite e a mesma do ficheiro de origem: o `tests-anti-patterns.mjs` corre
    // por importacao a partir dela, nao por si.
    alvo: ".agent/scripts/guards/anti-patterns.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // O hook `commit-msg` do git. Nao vive em `.claude/hooks/` porque nao e so-Claude-Code: e
    // o git que o corre, logo vale para qualquer ferramenta e qualquer pessoa. O `sinal` e o
    // `console.error(` — e por ai que ele explica a recusa antes de sair `!= 0`.
    alvo: ".githooks/commit-msg",
    suite: ".agent/scripts/test-commit-msg.mjs",
    // : sem isto o padrao casava a DEFINICAO, e mutar uma definicao da erro
    // de sintaxe — a suite ficava vermelha pela razao errada e contava como cobertura.
    sinal: /(?<![\w.$])(?<!function\s)recusar\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/check-test-surface.mjs",
    suite: ".agent/scripts/test-test-surface.mjs",
    // `fatal(` entra ao lado do `warn(`: os tres sitios de "nao consegui medir" eram
    // `console.log` + `process.exit` soltos, logo ficavam fora desta contagem e a varredura
    // anunciava cobertura completa a medir metade. Ver a nota no cabecalho do `fatal`.
    sinal: /(?<![\w.$])(?:warn|fatal)\(/,
    neutro: "(() => {})(",
  },
  {
    // O sinal de um guard-hook e a negacao. Mutar `negar(` deixa o hook a permitir tudo em
    // silencio, que e exatamente a falha que uma suite tem de apanhar.
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
  {
    alvo: ".agent/scripts/check-bundle-sizes.mjs",
    suite: ".agent/scripts/test-bundle-sizes.mjs",
    // Unico par opcional: um projeto sem bundler pode apagar este verificador. Todos os
    // outros sao do nucleo do template — a sua ausencia e um erro, nao uma configuracao.
    opcional: true,
    // Este nao usa `warn()`: imprime ERROR/FAILED e reprova com `process.exit(1)`.
    sinal: /process\.exit\(1\)/,
    neutro: "process.exit(0)",
  },
  {
    alvo: ".agent/scripts/check-backlog.mjs",
    suite: ".agent/scripts/test-backlog.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Este ficheiro. Estava isento por omissao — e reprova quem nao tem suite, o que fazia
    // dele o unico verificador sem medida no repo. Muta uma COPIA, logo varrer-se a si
    // proprio e seguro: a instancia em execucao nunca e tocada.
    alvo: ".agent/scripts/mutation-sweep.mjs",
    suite: ".agent/scripts/test-mutation-sweep.mjs",
    // Nao usa `warn()`: acumula em `falhou` e reprova no `process.exit(falhou ? 1 : 0)`.
    // O lookbehind `(?<=^\s*)` nao e cosmetico: exige que a atribuicao seja o INICIO da
    // instrucao. Sem ele o padrao casava com esta propria linha de declaracao (e com
    // qualquer comentario que a citasse) — linhas que nao sao sitios de reprovacao e que
    // apareceriam para sempre como "nao cobertas".
    sinal: /(?<=^\s*)falhou = true;/,
    neutro: "falhou = falhou;",
  },
];
