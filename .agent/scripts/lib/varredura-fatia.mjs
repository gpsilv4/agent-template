/**
 * A FATIA de um shard da varredura (#308): ler `--shard=k/n` e repartir os sitios. So funcoes
 * puras e SEM sitios de recusa, de proposito: o `mutation-sweep.mjs` importa-a, e tudo o que ele
 * importa vai para a fixture do `test-mutation-sweep` (ver `./varredura-shards.mjs`, que confere
 * os relatorios no portao e tem recusas).
 *
 * A PARTICAO e por SITIO, nao por alvo: o sitio de indice `i` (na ordem de `medir`, a mesma em
 * todas as maquinas porque vem do mesmo checkout) vai para o shard `i % n + 1`. Por alvo, o
 * maior (`surface-patterns`, 38 sitios) fixava sozinho o tempo de uma maquina.
 */

/** As variaveis de ambiente dos shards: o CI passa a fatia e o caminho do relatorio por aqui. O motor
 *  apaga-as do ambiente das SUITES — herdadas, a propria suite da varredura corria partida (leitor do #308). */
export const ENV_SHARD = "SWEEP_SHARD";
export const ENV_RELATORIO = "SWEEP_RELATORIO";

/** Le `k/n` de `--shard=k/n`. `null` sem a opcao; `{ erro }` se estiver mal escrita.
 * @param {string|undefined} valor o que vem depois de `--shard=`
 * @returns {{k: number, n: number} | {erro: string} | null} */
export function qualShard(valor) {
  if (valor === undefined) return null;
  const m = /^(\d+)\/(\d+)$/.exec(valor);
  const k = m ? Number(m[1]) : 0;
  const n = m ? Number(m[2]) : 0;
  return m && n >= 1 && k >= 1 && k <= n ? { k, n } : { erro: `--shard=${valor}: esperado k/n com 1 <= k <= n` };
}

/** Quantos sitios ha em `medir`, antes de qualquer particao. */
export const totalDeSitios = (medir) => medir.reduce((t, m) => t + m.sitios.length, 0);

/** A fatia do shard `k/n`: o sitio de indice global `i` fica se `i % n === k - 1`. Alvos sem
 *  nenhum sitio na fatia saem — nao se lhes corre baseline nem prova do prefixo. Nao muta `medir`.
 * @template {{sitios: number[]}} T
 * @param {T[]} medir
 * @param {{k: number, n: number}} shard
 * @returns {T[]} */
export function particao(medir, { k, n }) {
  let i = 0;
  return medir
    .map((m) => ({ ...m, sitios: m.sitios.filter(() => i++ % n === k - 1) }))
    .filter((m) => m.sitios.length > 0);
}
