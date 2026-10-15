/**
 * Quantos workers a varredura usa (#327): todos os cores num CI, um a menos numa maquina pessoal.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * A formula antiga (`min(8, cpus)`) ocupava todos os cores ate 8; com os processos que cada worker
 * lanca, uma maquina pessoal de 8 cores ou menos ficava sem folga durante a varredura inteira. Os
 * casos fixam os quatro ramos — `--workers`, `SWEEP_WORKERS`, `CI=true`, maquina pessoal — com o
 * `env` e os nucleos injectados, para nao dependerem da maquina onde a suite corre.
 */
import { pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { quantosWorkers } from "../lib/varredura-paralela.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-varredura-workers.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** `[descricao, pedido, env, nucleos, esperado]`: um caso por ramo, e os limites de cada um. */
const CASOS = [
  // Maquina PESSOAL (sem `CI`): um core livre, depois do teto de 8.
  ["pessoal, M1 Pro (10 cores): 8 - 1", undefined, {}, 10, 7],
  ["pessoal, 8 cores: 7", undefined, {}, 8, 7],
  ["pessoal, 4 cores: 3", undefined, {}, 4, 3],
  ["pessoal, 2 cores: 1", undefined, {}, 2, 1],
  ["pessoal, 1 core: nunca abaixo de 1", undefined, {}, 1, 1],
  ["pessoal, 16 cores: o teto (8) menos 1", undefined, {}, 16, 7],
  // CI (`CI=true`): maquina dedicada, todos os cores ate 8 — o que o CI publico e o privado ja usavam.
  ["CI publico (4 vCPU): 4", undefined, { CI: "true" }, 4, 4],
  ["CI privado (2 vCPU): 2", undefined, { CI: "true" }, 2, 2],
  ["CI com 16: o teto, 8", undefined, { CI: "true" }, 16, 8],
  // `CI` com outro valor nao e o CI: a folga e o lado seguro.
  ["CI=false conta como pessoal", undefined, { CI: "false" }, 4, 3],
  // `SWEEP_WORKERS`: a preferencia fixa, por cima da regra, tambem no CI.
  ["SWEEP_WORKERS=6 numa pessoal", undefined, { SWEEP_WORKERS: "6" }, 10, 6],
  ["SWEEP_WORKERS=3 no CI", undefined, { CI: "true", SWEEP_WORKERS: "3" }, 4, 3],
  ["SWEEP_WORKERS acima de 8 fica em 8", undefined, { SWEEP_WORKERS: "20" }, 10, 8],
  ["SWEEP_WORKERS invalido cai na regra", undefined, { SWEEP_WORKERS: "abc" }, 10, 7],
  // `--workers` ganha a tudo.
  ["--workers=2 por cima do SWEEP_WORKERS", "2", { SWEEP_WORKERS: "6" }, 10, 2],
  ["--workers=1 e o sequencial", "1", {}, 10, 1],
  // A prioridade e por VALIDADE: um `--workers=` vazio ou mal escrito nao apaga o `SWEEP_WORKERS`.
  ["--workers= vazio respeita o SWEEP_WORKERS", "", { SWEEP_WORKERS: "3" }, 10, 3],
  ["--workers=abc respeita o SWEEP_WORKERS", "abc", { SWEEP_WORKERS: "3" }, 10, 3],
  // Nunca abaixo de 1, nem com zero nucleos (o `availableParallelism` nao o da; a injeccao sim).
  ["CI com 0 nucleos: 1", undefined, { CI: "true" }, 0, 1],
  ["pessoal com 0 nucleos: 1", undefined, {}, 0, 1],
];

export function registar() {
  for (const [nome, pedido, env, nucleos, esperado] of CASOS) {
    const veio = quantosWorkers(pedido, { env, nucleos });
    registarResultado(`workers: ${nome}`, veio === esperado ? [] : [`deu ${veio}, esperado ${esperado}`]);
  }
}
