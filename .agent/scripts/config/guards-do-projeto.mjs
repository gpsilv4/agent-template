/**
 * Os guards e os pares PROPRIOS deste projeto — {{PROJECT_NAME}}
 *
 * **Este ficheiro e teu. O `/upgrade` nunca o SUBSTITUI** — so o cria se ainda nao existir.
 *
 * PORQUE EXISTE: um guard proprio ligava-se a mao no `check-doc-versions.mjs` (um `import` e uma
 * chamada) e no `lib/pares.mjs` (o par da varredura). Esses dois ficheiros sao do template e o
 * upgrade **substitui-os**: num derivado real, os modulos `guards/pt-pt.mjs` e
 * `guards/conflict-markers.mjs` ficaram no disco e deixaram de ser chamados, com o
 * `check-doc-versions` verde (ronda 7, R7-A, #176). Os modulos sobreviviam; as ligacoes nao.
 *
 * COMO SE USA:
 *  - o modulo vive em `.agent/scripts/guards/` (e o template nao o conhece, logo nao o toca);
 *  - exporta uma funcao que recebe o contexto e devolve quantos guards correu (0 ou 1), como os
 *    do template: `{ read, readMeaningful, warn, ok, note, skip, listDir, listTree, ehDerivado,
 *    ROOT, join, existsSync, readdirSync }`;
 *  - declara-se aqui, e o par da varredura tambem.
 *
 * Um modulo listado que nao exista, ou que nao exporte a funcao, da WARN: uma ligacao partida
 * nao pode passar por "nao ha nada a verificar" (`TP2`).
 */

/** `{ modulo, funcao }` — `modulo` relativo a `.agent/scripts/`. Ex:
 *  `{ modulo: "./guards/pt-pt.mjs", funcao: "guardPtPt" }` */
export const GUARDS = [];

/** Entradas da varredura de mutacao para os modulos acima, no formato do `lib/pares.mjs`
 *  (`alvo`, `suite`, `sinal`, `neutro`). Sem par, a descoberta reprova o modulo com `SEM PAR`. */
export const PARES_DO_PROJETO = [];

/** Onde vivem os scripts DESTE projeto, alem de `.agent/scripts` e `.claude/hooks`. O Guard 20
 *  procura la os `.mjs` que as instrucoes citam. ADAPTAR no bootstrap; uma pasta que nao exista
 *  e ignorada. Vivia dentro do `guards/citacoes.mjs`, que o upgrade substitui (#176). */
export const PASTAS_DE_SCRIPTS = ["scripts", "tools"];
