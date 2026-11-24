/**
 * Os pares da varredura dos GUARDS do `check-doc-versions` — o ficheiro de entrada e os modulos de `guards/` — {{PROJECT_NAME}}
 *
 * Sairam do `lib/pares.mjs` quando ele chegou as 495 linhas e o #495 precisava de mais um (o Guard 24), como os dos
 * hooks (#243), dos textos publicos (#375) e dos simuladores (#400). Sai SO o bloco contiguo, e o `pares.mjs` junta-o
 * NO MESMO SITIO da tabela: a varredura corre pela ordem dela, e os shards repartem os sitios pelo indice global
 * (`lib/varredura-fatia.mjs`), logo a ordem nao muda.
 *
 * Nao tem sitios de recusa — e uma tabela. O formato de cada entrada esta no `pares.mjs`.
 */
export const PARES_DOS_GUARDS = [
  {
    alvo: ".agent/scripts/check-doc-versions.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Modulo do Guard 11, extraido do check-doc-versions.mjs. Tem de estar aqui: os avisos
    // vivem neste ficheiro, e sem a entrada a varredura cobriria 652 das 911 linhas
    // originais e reportaria 100% a mentir. A suite e a mesma do ficheiro de origem.
    alvo: ".agent/scripts/guards/settings.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    // `flag(` e obrigatorio aqui: este guard emite quase tudo por um wrapper `flag()` que
    // chama `warn` por dentro. Com o padrao so a ver `warn(`, a varredura media 3 sitios de
    // 21 — e o unico que via era o `warn(` DENTRO do `flag`, cuja mutacao desliga os 18 de
    // uma vez. Media "existe pelo menos um teste que usa o flag", nao a cobertura.
    sinal: /(?<![\w.$])(warn|flag)\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/versions.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/derived-counts.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/placeholders.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Guard 21 (o `.agent/context/` do template por estrear). E o unico guard cuja falha nao
    // produz nada de errado NESTE repo — produz um projeto derivado que nasce com o trabalho
    // de outra pessoa dentro. Ninguem repara ate criar um projeto, logo a varredura e a unica
    // coisa que pode afirmar que os quatro sitios de recusa ficam mesmo vermelhos.
    alvo: ".agent/scripts/guards/context-virgem.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Modulo dos orcamentos de bytes (guards 1/1b/1c/1d), extraido do check-doc-versions.mjs
    // pela mesma razao que o de baixo: o ficheiro de entrada passou o flag das 500 linhas.
    alvo: ".agent/scripts/guards/budgets.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Os guards proprios do projeto e o detetor de guards desligados, extraidos do check-doc-versions.mjs (#539)
    // quando ele chegou as 499 linhas: os dois `warn(` que eram dele vivem aqui.
    alvo: ".agent/scripts/guards/ligacao-proprios.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Modulo do Guard 15, extraido do check-doc-versions.mjs quando este passou o flag das
    // 500 linhas. A suite e a mesma do ficheiro de origem: o `tests-anti-patterns.mjs` corre
    // por importacao a partir dela, nao por si.
    alvo: ".agent/scripts/guards/anti-patterns.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Guard 24 (um SDK de analytics, #495): so emite NOTE — o sinal e o `note(`, e nao o `warn(` dos outros. Com o
    // `warn(`, a varredura completa nao encontrava nenhum sitio e dava SINAL ERRADO (a 2.a leitura do plan-auditor).
    alvo: ".agent/scripts/guards/sdks-analytics.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])note\(/,
    neutro: "(() => {})(",
  },
];
