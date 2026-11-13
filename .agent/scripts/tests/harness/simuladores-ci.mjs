/**
 * Os SIMULADORES do `ci.yml` do template (#460): os tres jobs que os correm, e o comando de cada um. Uma so
 * definicao (`TP8`) para as suites que os leem: o `tests-estrutura-workflow` (o que o bootstrap deixa, e que
 * nenhuma verificacao saiu na divisao) e o `tests-plano-ci` (a regex da `--skips`, so no job do bootstrap).
 *
 * Ate ao #460 eram um job so, `simulators`, com as tres corridas em serie (chegou aos 29,7 min de 30). Cada uma
 * no seu job tem o seu limite. O BOOTSTRAP (§2.7) remove os tres num derivado, e o `/upgrade` nao os traz.
 *
 * So dados e transformacoes puras, SEM nenhuma forma das recusas da varredura (`RECUSAS` do `mutation-sweep.mjs`):
 * um harness assim nao e um verificador e nao precisa de par no `PARES`. Quem decide o veredicto sao as suites.
 */

/** Cada job, com o comando que o mede (uma linha do `run:`, tal e qual). */
export const SIMULADORES = {
  "simulate-private": "SIMULATE_PRIVADO=1 node .agent/scripts/simulate-derived.mjs",
  "simulate-derived": "node .agent/scripts/simulate-derived.mjs",
  "simulate-upgrade": "node .agent/scripts/simulate-upgrade.mjs",
};

/** O job onde vive o `grep -qE ... <<<"$tocados"` que liga a `--skips` sobre o derivado maduro (#308). */
export const JOB_DA_SKIPS = "simulate-derived";

const IDS = Object.keys(SIMULADORES).join("|");

/** Os fins de linha num so (`\n`): um `ci.yml` com CRLF (um checkout com `core.autocrlf`) lia-se de tres formas — o
 *  `$` do `m` aceita antes do `\r`, o `\n` explicito nao —, e a leitura das fatias dava um verde vazio (leitor do #460). */
const lf = (t) => t.replace(/\r\n?/g, "\n");

/** O cabecalho de um job: `  id:` a 2 espacos, com o id nu, entre aspas, ou com pontos (`"a.b":`). */
const CABECALHO = String.raw`^  (?:[\w.-]+|"[^"\n]+"|'[^'\n]+'):[ \t]*(?:#.*)?$`;
/** O FIM de um bloco: o cabecalho do job seguinte, ou os comentarios (e linhas em branco) a 2 espacos logo antes dele,
 *  que sao dele e nao do anterior (leitor do #460); ou o fim do ficheiro. */
const FIM = String.raw`(?=(?:^  #.*\n|^[ \t]*\n)*${CABECALHO}|(?![\s\S]))`;
/** O resto da linha do cabecalho e o corpo, ate ao FIM (preguicoso: para no primeiro). */
const CORPO = String.raw`:[ \t]*(?:#.*)?(?:\n|$(?![\s\S]))[\s\S]*?${FIM}`;

/** O bloco de um job (do cabecalho ao job seguinte, ou ao fim do ficheiro), ou `undefined`. */
export const blocoDoJob = (ci, id) =>
  new RegExp(String.raw`^  ${id}${CORPO}`, "m").exec(lf(ci))?.[0];

/** O `ci.yml` sem os tres jobs — o que o BOOTSTRAP deixa —, com os comentarios a 2 espacos logo antes de cada um (sao
 *  dele). Tambem quando um deles e o ultimo do ficheiro. */
export const semSimuladores = (ci) =>
  lf(ci).replace(new RegExp(String.raw`(?:^  #.*\n|^[ \t]*\n)*^  (?:${IDS})${CORPO}`, "gm"), "");

/** Algum dos tres jobs esta no `ci.yml`? */
export const temSimuladores = (ci) => new RegExp(String.raw`^  (?:${IDS}):[ \t]*(?:#.*)?$`, "m").test(lf(ci));
