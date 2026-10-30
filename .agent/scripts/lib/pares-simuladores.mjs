/**
 * Os pares da varredura dos SIMULADORES — o `simulate-derived`, o `simulate-upgrade` e as libs que eles orquestram — {{PROJECT_NAME}}
 *
 * Sairam do `lib/pares.mjs` quando ele chegou as 498 linhas (o Guard 17, #400), como os dos hooks (#243) e os dos
 * textos publicos (#375). O `pares.mjs` junta-os NO MESMO SITIO da tabela: a varredura corre pela ordem dela, e os
 * shards repartem os sitios pelo indice global (`lib/varredura-fatia.mjs`), logo a ordem nao muda.
 *
 * Nao tem sitios de recusa — e uma tabela. O formato de cada entrada esta no `pares.mjs`.
 */
export const PARES_DOS_SIMULADORES = [
  {
    // Guard 17 (tamanho de ficheiro). A catraca so vale se cada um dos seus sitios de recusa
    // estiver medido: uma excecao que deixa de avisar e uma catraca aberta, e ninguem repara.
    // O simulador NAO casava a convencao `check-*.mjs` da descoberta, logo nunca foi medido —
    // e tem sitios `fatal()` seus (a contagem NAO se escreve aqui: escrita, era mais uma copia
    // a mao a envelhecer, e envelheceu — dizia 8 depois de a extraccao os levar para
    // `derivado-maduro.mjs`). E o proprio caso que a descoberta existe para nao ter: um
    // verificador com sitios de recusa, com suite propria, e sem rede que prove que eles ficam
    // vermelhos. Nao veio de nenhum relatorio: apareceu ao tentar varre-lo.
    alvo: ".agent/scripts/simulate-derived.mjs",
    suite: ".agent/scripts/tests/test-simulate-derived.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // A MATURIDADE do derivado, extraida do simulador quando ele bateu nas 500 linhas do
    // Guard 17. As recusas vieram com ela: sem esta entrada, a varredura media so o ficheiro
    // de origem e anunciava cobertura completa sobre um sitio que ja la nao esta. E a regra
    // escrita na matriz de propagacao — a soma dos sitios antes e depois de um refactor tem de
    // ser a MESMA, e foi assim que se confirmou (220 antes, 216 sem esta entrada, 220 com ela).
    //
    // Mesmo `sinal` que o ficheiro de origem, e nao por simetria: a forma de recusa e a mesma
    // (`fatal()`), porque o veredicto continua a ser o exit code do que o simulador orquestra.
    alvo: ".agent/scripts/lib/derivado-maduro.mjs",
    suite: ".agent/scripts/tests/test-derivado-maduro.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // O simulador do OUTRO caminho: o `/upgrade`. Mesma razao que o de cima, e a mesma forma
    // de recusa (`fatal()`), porque o veredicto dele tambem e o exit code das suites que
    // orquestra. Um simulador que falhe ABERTO da por verificada metade do produto. O `warn(`
    // tambem reprova (conta `problemas`): sem ele no sinal, o da versao ficava fora da varredura (#241).
    alvo: ".agent/scripts/simulate-upgrade.mjs",
    suite: ".agent/scripts/tests/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])(?:fatal|warn)\(/,
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
    suite: ".agent/scripts/tests/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // O INSTRUMENTO da seccao 2b, dos dois lados. Cada `fatal()` daqui e uma condicao em que a
    // medicao NAO pode ser feita — e uma medicao que nao acontece tem de o dizer, nunca devolver
    // uma lista vazia que se le como "nada a reportar" (`TP2`). E precisamente por um desses
    // ramos faltar do lado do derivado que este issue existiu.
    alvo: ".agent/scripts/lib/medida-upgrade.mjs",
    suite: ".agent/scripts/tests/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // As notas da FORMA do `ci.yml` na 2b, que sairam do `medida-upgrade.mjs` (#347, C0). Nao tem `fatal()`:
    // os sitios sao as `note()` — cada uma e uma diferenca de CI que um derivado deixava de ver. A suite e o
    // `test-guards`, e o dono (`tests-medida-upgrade-ci.mjs`) corre primeiro: a funcao e pura, logo cada
    // sitio custa milissegundos, e nao uma corrida da suite do upgrade.
    alvo: ".agent/scripts/lib/medida-upgrade-ci.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])note\(/,
    neutro: "(() => {})(",
  },
  {
    // O bloco da FRONTEIRA da 2b, que saiu do `medida-upgrade.mjs` (#317) e trouxe as recusas dele: o
    // staging dentro do projeto ou do template, numa pasta cheia, e um caminho com caracteres de controlo.
    // Cada `fatal()` que nao fica vermelho e uma escrita da fronteira que ninguem trava.
    alvo: ".agent/scripts/lib/fronteira-upgrade.mjs",
    suite: ".agent/scripts/tests/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // A FIXTURE do modo template. Cada `fatal()` aqui apanha uma fixture que deixou de
    // representar um consumidor — e uma fixture que nao representa nada passa sempre.
    alvo: ".agent/scripts/lib/projeto-de-ontem.mjs",
    suite: ".agent/scripts/tests/test-simulate-upgrade.mjs",
    sinal: /(?<![\w.$])fatal\(/,
    neutro: "(() => {})(",
  },
];
