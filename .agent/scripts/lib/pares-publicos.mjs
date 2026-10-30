/**
 * Os pares da varredura do que chega a um TEXTO PUBLICO (#375): o `commit-msg` (e o prefixo que ele verifica, #394),
 * a lista de nomes proibidos e o comando que varre os textos publicos — {{PROJECT_NAME}}
 *
 * Saiu do `lib/pares.mjs` quando ele chegou as 511 linhas (o Guard 17), como os dos hooks (#243). O `pares.mjs`
 * junta-os no sitio onde estavam os do `commit-msg`: a varredura corre pela ordem da tabela.
 *
 * Nao tem sitios de recusa — e uma tabela. O formato de cada entrada esta no `pares.mjs`.
 */
export const PARES_DOS_TEXTOS_PUBLICOS = [
  {
    // O PREFIXO Conventional Commits do `commit-msg` (#394): cada razao sai por `invalido(`, e quem chama le
    // `undefined` como "passa" — o neutro deixa passar o que devia recusar. Dono barato: o
    // `tests-commit-msg-prefixo.mjs`, no `test-guards` (a precedencia do `novo(` do `passos-novos`).
    alvo: ".agent/scripts/lib/prefixo-commit.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$]|function )invalido\(/,
    neutro: "(() => {})(",
  },
  {
    // O hook `commit-msg` do git. Nao vive em `.claude/hooks/` porque nao e so-Claude-Code: e
    // o git que o corre, logo vale para qualquer ferramenta e qualquer pessoa. O `sinal` e o
    // `recusar(` — e por ai que ele explica a recusa antes de sair `!= 0`. O alvo e o MODULO:
    // o `.githooks/commit-msg` e so um ponteiro que o importa (#278).
    alvo: ".githooks/lib/commit-msg.mjs",
    suite: ".agent/scripts/tests/test-commit-msg.mjs",
    // : sem isto o padrao casava a DEFINICAO, e mutar uma definicao da erro
    // de sintaxe — a suite ficava vermelha pela razao errada e contava como cobertura.
    sinal: /(?<![\w.$])(?<!function\s)recusar\(/,
    neutro: "(() => {})(",
  },
  {
    // O PONTEIRO que o git chama pelo nome (#278). O unico sitio e a chamada ao modulo: sem ela o
    // hook sai 0 com qualquer mensagem — e a suite, que o corre como o git, tem de o notar.
    alvo: ".githooks/commit-msg",
    suite: ".agent/scripts/tests/test-commit-msg.mjs",
    sinal: /(?<![\w.$])correr\(/,
    neutro: "(() => {})(",
  },
  {
    // A lista de NOMES PROIBIDOS (#375). Cada estado que nao e `ok` passa por `recusa(r, estado)`: desligado,
    // o fluxo segue sem rebentar e da outro estado — uma lista DENTRO do repo passava por `vazia`, ou por `ok`.
    alvo: ".agent/scripts/lib/nomes-proibidos.mjs",
    suite: ".agent/scripts/tests/test-guards.mjs",
    sinal: /(?<![\w.$])(?<!function\s)recusa\(/,
    neutro: "(() => {})(",
  },
  {
    // O comando que varre os textos publicos (#375). Os "nao consegui medir" saem por `fatal(` (sem lista, o
    // `gh` a falhar, uma leitura cortada): desligado um, o comando dizia "limpo" sem ter lido (`TP2`).
    alvo: ".agent/scripts/check-textos-publicos.mjs",
    suite: ".agent/scripts/tests/test-textos-publicos.mjs",
    sinal: /(?<![\w.$])(?<!function\s)fatal\(/,
    neutro: "(() => {})(",
  },
  {
    // ...e cada achado num texto editavel sai por `achado(`: desligado, o nome passava calado.
    alvo: ".agent/scripts/check-textos-publicos.mjs",
    suite: ".agent/scripts/tests/test-textos-publicos.mjs",
    sinal: /(?<![\w.$])(?<!function\s)achado\(/,
    neutro: "(() => {})(",
  },
];
