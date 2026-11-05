/**
 * As contas do `minutos-ci.mjs` (#429): puras, sem `gh` — {{PROJECT_NAME}}
 *
 * O GitHub cobra um repo PRIVADO por job, cada job arredondado ao minuto ACIMA: um job de 8 s paga 1 min, um de 61 s
 * paga 2. O que se paga e a soma dos jobs; o que o runner gastou ("real") e a soma dos segundos. A diferenca e o
 * arredondamento, e e por isso que menos jobs (e jobs abaixo de 60/120 s) custam menos. Os runs do PROPRIO
 * Dependabot (`event: dynamic`) tambem se pagam num privado (medido contra a faturacao, 3 nov 2026): contam-se a parte.
 *
 * E as contas do `--quota` (#442): os minutos dos repos privados da conta no mes, a projecao e o nivel.
 *
 * NAO e um entry point. Nao recusa nada (so contas): a suite `test-minutos-ci.mjs` prende cada uma. (Um ficheiro aqui
 * com uma recusa — um `throw new Error(`, um `warn(` — passava a verificador e a varredura exigia-lhe par: a licao do
 * #439. As recusas ficam no script, num `fatal(`.)
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

// --- A quota da CONTA (#442) ---
// A faturacao (`/users/<login>/settings/billing/usage`) traz um item por dia, repo e SKU, e traz tambem os repos
// PUBLICOS (os montantes nao os distinguem: medido a 5 nov 2026). So os privados gastam a quota; a visibilidade de
// cada repo vem de fora (`visibilidade`: repo -> "privado" | "publico" | "desconhecido"). Um repo desconhecido (ja nao
// existe, ou nao o encontrei) CONTA: antes contar a mais do que esconder minutos.

const ehLinux = (i) => i.sku === "Actions Linux" && i.unitType === "Minutes";

/**
 * Os minutos do mes contra a quota: `{ porRepo, total, publicos, desconhecidos, outros, ultimoDia }`. `porRepo` e
 * `[[repo, min]]` dos que contam (privados e desconhecidos), do maior para o menor; `outros` sao os itens em minutos
 * de outros SKUs (Windows, macOS, runners maiores) dos que contam, que NAO entram na soma (o multiplicador do Free nao
 * esta confirmado sobre a faturacao); `ultimoDia` e o dia (UTC) da ultima entrada em minutos, ou 0 sem nenhuma.
 */
export function quotaDoMes(itens, visibilidade) {
  const conta = (repo) => visibilidade.get(repo) !== "publico";
  const porRepo = new Map();
  const outros = new Map();
  let publicos = 0;
  let ultimoDia = 0;
  for (const i of itens) {
    if (i.unitType !== "Minutes") continue;
    ultimoDia = Math.max(ultimoDia, new Date(i.date).getUTCDate() || 0);
    const q = Number(i.quantity) || 0;
    if (!conta(i.repositoryName)) {
      if (ehLinux(i)) publicos += q;
    } else if (ehLinux(i)) porRepo.set(i.repositoryName, (porRepo.get(i.repositoryName) ?? 0) + q);
    else outros.set(`${i.sku} · ${i.repositoryName}`, (outros.get(`${i.sku} · ${i.repositoryName}`) ?? 0) + q);
  }
  const lista = [...porRepo].sort((a, b) => b[1] - a[1]);
  return {
    porRepo: lista,
    total: lista.reduce((a, [, m]) => a + m, 0),
    publicos,
    desconhecidos: lista.map(([r]) => r).filter((r) => visibilidade.get(r) === "desconhecido"),
    outros: [...outros],
    ultimoDia,
  };
}

/** Os dias de um mes (`mes` de 1 a 12), em UTC. */
export const diasDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** A projecao linear ao fim do mes: o ritmo ate ao dia `dia` (quem chama da o de hoje), vezes os dias do mes; `null`
 *  sem nenhum dia. */
export const projecao = (total, dia, dias) => (dia > 0 ? (total / dia) * dias : null);

/** A projecao do mes CORRENTE (#453): o ritmo ate HOJE (e nao ate a ultima entrada, que pode estar dias atras), e so a
 *  partir do dia 3 — os primeiros dias sao ruido, e 70 min no dia 1 projetavam 2100 (um falso AVISO no /deploy). O
 *  `hoje` e um parametro, para os dias 1, 2 e 3 se testarem em todas as corridas. `null` antes do dia 3. */
export const projecaoDoMes = ({ total, ultimoDia, hoje, dias }) => (hoje >= 3 ? projecao(total, Math.max(ultimoDia, hoje), dias) : null);

/** O nivel da quota: "esgotada" (>= limite), "aviso" (>= 80%, ou a projecao acima do limite), ou `null`. */
export function nivelDaQuota(total, proj, limite) {
  if (total >= limite) return "esgotada";
  if (total >= 0.8 * limite || (proj !== null && proj > limite)) return "aviso";
  return null;
}

/** A mediana de uma lista de numeros; `null` com a lista vazia. */
export function mediana(ns) {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
