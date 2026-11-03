/**
 * As contas do `minutos-ci.mjs` (#429): puras, sem `gh` — {{PROJECT_NAME}}
 *
 * O GitHub cobra um repo PRIVADO por job, cada job arredondado ao minuto ACIMA: um job de 8 s paga 1 min, um de 61 s
 * paga 2. O que se paga e a soma dos jobs; o que o runner gastou ("real") e a soma dos segundos. A diferenca e o
 * arredondamento, e e por isso que menos jobs (e jobs abaixo de 60/120 s) custam menos. Os runs do PROPRIO
 * Dependabot (`event: dynamic`) tambem se pagam num privado (medido contra a faturacao, 3 nov 2026): contam-se a parte.
 *
 * NAO e um entry point. Nao recusa nada (so contas): a suite `test-minutos-ci.mjs` prende cada uma.
 */

/** Os segundos entre dois instantes ISO; 0 quando falta um (um job que nao chegou a correr). */
export function segundos(inicio, fim) {
  if (!inicio || !fim) return 0;
  return Math.max(0, (Date.parse(fim) - Date.parse(inicio)) / 1000);
}

/** O que um job de `s` segundos custa: arredondado ao minuto ACIMA, e 0 so se nao correu. */
export const cobrado = (s) => (s > 0 ? Math.ceil(s / 60) : 0);

/** Um job que nao conta: saltado, ou sem inicio/fim. */
const naoCorreu = (j) => j.conclusion === "skipped" || !j.started_at || !j.completed_at;

/** O resumo de um run a partir dos seus jobs: `{ n, real, cobrado, maisLongo }` (`n` jobs; real e maisLongo em
 *  segundos). `maisLongo` e o job mais demorado: e ELE que passa ou nao dos 120 s, e nao a soma (cinco jobs de 30 s
 *  pagam 5 min, e nenhum passa os 120). */
export function resumoDosJobs(jobs) {
  let real = 0;
  let pago = 0;
  let maisLongo = 0;
  for (const j of jobs) {
    if (naoCorreu(j)) continue;
    const s = segundos(j.started_at, j.completed_at);
    real += s;
    pago += cobrado(s);
    maisLongo = Math.max(maisLongo, s);
  }
  return { n: jobs.length, real, cobrado: pago, maisLongo };
}

/** Os passos de todos os jobs: `[{ job, passo, s, conclusao }]` — o que encontra o passo lento. */
export function passosDosJobs(jobs) {
  return jobs.flatMap((j) => (j.steps ?? []).map((p) => ({ job: j.name, passo: p.name, s: segundos(p.started_at, p.completed_at), conclusao: p.conclusion ?? "?" })));
}

/** O run e da app? So se o passo `nome` CORREU (nem saltado, nem por concluir) num dos jobs. */
export const correuOPasso = (jobs, nome) => jobs.some((j) => (j.steps ?? []).some((p) => p.name === nome && p.conclusion && p.conclusion !== "skipped"));

/** O run e do proprio Dependabot (`dynamic`)? Paga-se; conta-se a parte. */
export const ehDoDependabot = (run) => run.event === "dynamic";

/** A mediana de uma lista de numeros; `null` com a lista vazia. */
export function mediana(ns) {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
