/**
 * A ESPERA de um PR (#554) — {{PROJECT_NAME}}
 *
 * Para fechar o #460 mediu-se a mao (a API dos jobs com `jq`) a espera de cada PR e a mediana antes e depois de uma
 * mudanca no CI. Isto e essa medicao, por escrito e testada. As decisoes (Fase 0 v2 no #554):
 *   - a espera de um run = do `run_started_at` ao `completed_at` do ULTIMO job que correu NESTA tentativa (o fim do
 *     ultimo job ja e o fim do caminho critico, e conta as filas entre jobs, que tambem se esperam; medido: 25,5 contra
 *     os 25,4 do caminho critico a mao no PR #552);
 *   - a UNIDADE e o run: cada run que acabou e uma espera que alguem teve;
 *   - so os runs `success`/`failure` entram: um `cancelled` pela `concurrency` (um push novo cancela o anterior) dura
 *     ate ao cancelamento e puxava a mediana para baixo — a direcao do que se quer provar;
 *   - o corte e no `created_at` do run, em UTC, e `>=` vai para o "depois": uma re-tentativa de um run criado antes do
 *     corte corre o CI antigo, e fica no "antes".
 * Puro, sem a API e sem recusas: o `minutos-ci` traz os dados e decide o que imprimir.
 */
import { mediana, naoCorreu, segundos } from "./minutos-calculo.mjs";

/** O prefixo de job que marca um PR de MAQUINARIA (a perna completa da varredura correu): o que o #460 mede. */
export const GRUPO_POR_OMISSAO = "Mutation sweep (completa";

/** Os jobs DESTA tentativa do run (com `filter=all` a API traz tambem os das tentativas antigas). Um job sem
 *  `run_attempt` (fixtures antigas) conta como desta. */
export const jobsDaTentativa = (run, jobs) => jobs.filter((j) => j.run_attempt === undefined || run.run_attempt === undefined || j.run_attempt === run.run_attempt);

/** A espera de um run em segundos, ou `null` (sem `run_started_at`, nenhum job desta tentativa correu, ou um fim que
 *  nao vem DEPOIS do inicio: o `segundos` da 0 a um intervalo ao contrario, e um 0 medido seria um zero que nao mediu
 *  nada, `TP2`). */
export function esperaDoRun(run, jobs) {
  if (!run.run_started_at) return null;
  const correram = jobsDaTentativa(run, jobs).filter((j) => !naoCorreu(j));
  if (!correram.length) return null;
  const fim = correram.map((j) => j.completed_at).sort().at(-1);
  const s = segundos(run.run_started_at, fim);
  return s > 0 ? s : null;
}

/** Os runs de PR do workflow pedido (o filtro que o `minutos-ci` aplica ANTES de pedir os jobs). */
export const doWorkflow = (runs, workflow) => runs.filter((r) => r.event === "pull_request" && r.path === workflow);

/** O run entra na mediana: acabou, e com `success`/`failure` (so a esses se pedem os jobs). */
export const medivel = (r) => r.status === "completed" && (r.conclusion === "success" || r.conclusion === "failure");

/** O run e do GRUPO: um job (de QUALQUER tentativa) cujo nome comeca pelo prefixo e que correu. */
export const ehDoGrupo = (jobs, prefixo) => jobs.some((j) => typeof j.name === "string" && j.name.startsWith(prefixo) && !naoCorreu(j));

/** Antes e depois do corte, pelo `created_at` (`>=` vai para o depois). `corteIso` em UTC (`AAAA-MM-DDTHH:MMZ`). Um
 *  `created_at` que nao se le vai para `semData` (contado): nunca some dos dois lados calado. */
export function pelosDoisLados(runs, corteIso) {
  const c = Date.parse(corteIso);
  const t = (r) => Date.parse(r.created_at);
  return { antes: runs.filter((r) => t(r) < c), depois: runs.filter((r) => t(r) >= c), semData: runs.filter((r) => Number.isNaN(t(r))) };
}

/** O resumo de uma lista de esperas (segundos): `{ n, mediana, min, max }`; vazia -> `n: 0` e o resto `null`. */
export function resumo(esperas) {
  if (!esperas.length) return { n: 0, mediana: null, min: null, max: null };
  return { n: esperas.length, mediana: mediana(esperas), min: Math.min(...esperas), max: Math.max(...esperas) };
}

/** A variacao em % de `antes` para `depois`; `null` se algum lado nao tem amostra (nunca uma conta com `null`). */
export const variacao = (antes, depois) => (antes === null || depois === null || antes === 0 ? null : (100 * (depois - antes)) / antes);

const min = (s) => (s === null ? "-" : `${(s / 60).toFixed(1)} min`);
const linhaDoResumo = (nome, r) => (r.n === 0 ? `  ${nome}: sem amostra` : `  ${nome}: mediana ${min(r.mediana)} (n=${r.n}; ${min(r.min)} a ${min(r.max)})`);

/**
 * As linhas do `minutos-ci --espera` (#554), a partir dos runs com os jobs (`runsComJobs`). Puro: o `numeroDoPr(run)` vem
 * de fora (o `prDoRun`, com os PRs do repo so quando um run nao traz o numero).
 * @param {{ alvo: string, workflow: string, grupo: string, ultimos: number, corte: string | null,
 *           linhas: Array<{ r: object, jobs: object[] }>, numeroDoPr: (run: object) => number | null }} o
 * @returns {string[]}
 */
export function linhasDaEspera({ alvo, workflow, grupo, ultimos, corte, linhas, numeroDoPr }) {
  const doPr = linhas.filter((l) => doWorkflow([l.r], workflow).length);
  const emCurso = doPr.filter((l) => l.r.status !== "completed").length;
  const acabados = doPr.filter((l) => l.r.status === "completed");
  // So o `cancelled` e a concurrency; um `timed_out`, um `action_required` (um fork a espera de aprovacao) ou um
  // `startup_failure` tambem ficam fora, mas com o seu nome.
  const cancelados = acabados.filter((l) => l.r.conclusion === "cancelled").length;
  const outras = acabados.filter((l) => !medivel(l.r) && l.r.conclusion !== "cancelled").length;
  const medidos = acabados.filter((l) => medivel(l.r)).map((l) => ({ r: l.r, s: esperaDoRun(l.r, l.jobs), maq: ehDoGrupo(l.jobs, grupo) }));
  const fora = medidos.filter((m) => m.s === null);
  const validos = medidos.filter((m) => m.s !== null);
  const retentados = validos.filter((m) => (m.r.run_attempt ?? 1) > 1).length;
  const out = [
    `espera dos PRs de ${alvo} (${workflow}): ${validos.length} run(s) medido(s); cancelados (fora, a concurrency): ${cancelados}; outras conclusoes (fora): ${outras}; em curso (fora): ${emCurso}; sem jobs que correram (fora): ${fora.length}${retentados ? `; re-tentados: ${retentados} (conta a ultima tentativa)` : ""}`,
  ];
  if (validos.length && !validos.some((m) => m.maq)) out.push(`  nenhum job "${grupo}" em ${validos.length} run(s) — o prefixo mudou, ou nenhum PR desta amostra correu a varredura completa (--grupo para outro)`);
  const grupos = [[`maquinaria (um job "${grupo}" correu)`, validos.filter((m) => m.maq)], ["outros", validos.filter((m) => !m.maq)]];
  for (const [nome, ms] of grupos) {
    out.push(linhaDoResumo(nome, resumo(ms.map((m) => m.s))));
    const recentes = [...ms].sort((a, b) => String(b.r.created_at).localeCompare(String(a.r.created_at))).slice(0, ultimos);
    for (const m of recentes) out.push(`    ${String(numeroDoPr(m.r) ?? "?").padStart(5)}  ${String(m.r.created_at ?? "").slice(0, 16)}  ${min(m.s)}`);
  }
  if (corte !== null) {
    const iso = `${corte}:00Z`;
    out.push(`antes e depois de ${corte} UTC (pelo created_at do run; o corte escolhe-se pelo CI que o run correu):`);
    for (const [nome, ms] of grupos) {
      const { antes, depois, semData } = pelosDoisLados(ms.map((m) => ({ ...m, created_at: m.r.created_at })), iso);
      const a = resumo(antes.map((m) => m.s));
      const d = resumo(depois.map((m) => m.s));
      const v = variacao(a.mediana, d.mediana);
      const pequena = (a.n > 0 && a.n < 5) || (d.n > 0 && d.n < 5) ? ` (amostra pequena: n=${a.n} antes, ${d.n} depois, < 5)` : "";
      out.push(`  ${nome}: antes ${min(a.mediana)} (n=${a.n}) -> depois ${min(d.mediana)} (n=${d.n})${v === null ? "; sem variacao (um lado sem amostra)" : `; ${v > 0 ? "+" : ""}${v.toFixed(0)}%`}${pequena}${semData.length ? `; sem created_at (fora): ${semData.length}` : ""}`);
    }
  }
  return out;
}
