#!/usr/bin/env node
/**
 * Os minutos de CI de um repo, cobrados e reais (#429) — {{PROJECT_NAME}}
 *
 * Num repo PRIVADO o GitHub cobra cada job arredondado ao minuto acima, e a quota gratis (2000 min/mes) e partilhada
 * por todos os privados da conta. Isto mede, por run, `jobs | real | cobrado`, e os totais; com `--passos`, a duracao
 * de cada passo (o que encontra o passo lento); e a mediana dos PRs (o job mais longo de cada run) contra os 120 s
 * (um job de 61-120 s paga 2 min).
 * Num repo publico os minutos nao se pagam, mas a medida e a mesma.
 *
 * Uso:
 *   node .agent/scripts/minutos-ci.mjs --run <id>
 *   node .agent/scripts/minutos-ci.mjs --desde AAAA-MM-DD [--ate AAAA-MM-DD] [--passos] [--app "<passo>"] [--repo dono/repo]
 *
 * `--app "<passo>"`: a mediana conta so os PRs em que esse passo CORREU (ex.: `--app TypeScript`), que sao os de app;
 * sem ele conta todos os PRs, os de docs incluidos, e diz-o. Os runs do proprio Dependabot (`dynamic`) PAGAM-SE num
 * privado (medido contra a faturacao, 3 nov 2026: a soma so bateu com eles): entram na soma, contados a parte. Um run
 * ainda em curso fica FORA da soma e da mediana, listado (os jobs por acabar contariam 0). O total da CONTA (todos os
 * repos privados) e o `--quota` (#442), abaixo.
 *
 * `--quota [--mes AAAA-MM] [--limite 2000]` (#442): os minutos Linux do mes dos repos PRIVADOS da conta autenticada,
 * contra a quota (2000 no Free; `--limite 3000` no Pro), por repo e no total, com a projecao ao fim do mes (so no mes
 * corrente) e uma linha fixa `QUOTA: AVISO` (>= 80%, ou a projecao acima do limite) ou `QUOTA: ESGOTADA` (>= 100%).
 * Sai 0: e uma medicao, e o `/deploy` procura a linha. A faturacao traz tambem os repos publicos (que nao gastam a
 * quota) e os montantes nao os distinguem (medido a 5 nov 2026): a visibilidade de cada repo pergunta-se, um a um,
 * e um repo que ja nao existe conta (antes a mais do que esconder minutos). Precisa do scope `user` no `gh`; sem ele,
 * recusa e diz o comando.
 *
 * Pagina os runs e os jobs (100 por pagina, sem repetidos). Falha ALTO, nunca com "0 min": sem `gh`, sem sessao, um
 * erro da API, uma resposta sem a lista ou sem `total_count`, mais de 1000 runs no intervalo (o limite de uma pesquisa
 * por data: estreitar), ou menos runs/jobs lidos do que a API diz haver. Um zero falso e pior do que nenhum numero.
 */
import { execFileSync } from "child_process";
import { cobrado, correuOPasso, diasDoMes, ehDoDependabot, mediana, nivelDaQuota, passosDosJobs, projecao, quotaDoMes, resumoDosJobs } from "./lib/minutos-calculo.mjs";
import { repoDoOrigin } from "./lib/marcas-yaml.mjs";

const POR_PAGINA = 100;
const LIMITE_DA_PESQUISA = 1000;
const LINHA_DOS_120 = 120;
const QUOTA_FREE = 2000;

function fatal(msg) {
  console.error(`minutos-ci: ${msg}`);
  process.exit(1);
}

// --- Argumentos ---
const ARGS = process.argv.slice(2);
const opt = {};
const erros = [];
for (let i = 0; i < ARGS.length; i++) {
  const a = ARGS[i];
  if (a === "--passos") opt.passos = true;
  else if (a === "--quota") opt.quota = true;
  else if (["--run", "--desde", "--ate", "--app", "--repo", "--mes", "--limite"].includes(a) && ARGS[i + 1] !== undefined) opt[a.slice(2)] = ARGS[++i];
  else erros.push(`argumento desconhecido ou sem valor: ${a}`);
}
if (opt.quota && (opt.run || opt.desde || opt.repo || opt.ate || opt.app || opt.passos)) erros.push("o `--quota` e da CONTA: nao se junta com `--run`, `--desde`, `--ate`, `--app`, `--passos` nem `--repo`");
if (!opt.quota && (opt.mes || opt.limite)) erros.push("o `--mes` e o `--limite` so com o `--quota`");
if (opt.mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(opt.mes)) erros.push(`--mes quer AAAA-MM (deu ${opt.mes})`);
// Um mes no futuro nao tem faturacao: a API da uma lista vazia, e o TOTAL 0 seria um zero que nao mediu nada.
if (opt.mes && opt.mes > new Date().toISOString().slice(0, 7)) erros.push(`--mes ${opt.mes} esta no futuro (em UTC): nao ha faturacao para medir`);
if (opt.limite && !/^[1-9]\d*$/.test(opt.limite)) erros.push(`--limite quer um inteiro positivo (deu ${opt.limite})`);
if (!opt.quota && !opt.run === !opt.desde) erros.push("da exatamente um de `--run <id>` ou `--desde AAAA-MM-DD` (ou o `--quota`)");
for (const k of ["desde", "ate"]) if (opt[k] && !/^\d{4}-\d{2}-\d{2}$/.test(opt[k])) erros.push(`--${k} quer AAAA-MM-DD (deu ${opt[k]})`);
if (opt.run && !/^\d+$/.test(opt.run)) erros.push(`--run quer o id numerico de um run (deu ${opt.run})`);
if (erros.length) fatal(`${erros.join("; ")}\n  uso: --run <id> | --desde AAAA-MM-DD [--ate AAAA-MM-DD] [--passos] [--app "<passo>"] [--repo dono/repo] | --quota [--mes AAAA-MM] [--limite ${QUOTA_FREE}]`);

/** Um pedido a API pelo `gh`: `{ saida }`, ou `{ erro }` com o que o `gh` disse (quem chama decide a recusa). */
function ghApi(caminho) {
  try {
    return { saida: execFileSync("gh", ["api", caminho], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (err) {
    return { erro: err instanceof Error && "stderr" in err ? String(err.stderr).trim() : err instanceof Error ? err.message : String(err) };
  }
}

/** Um pedido a API pelo `gh`, ja em JSON. */
function api(caminho) {
  const r = ghApi(caminho);
  if (r.erro !== undefined) return fatal(`o gh falhou em ${caminho} (sem gh, sem sessao, ou um erro da API): ${r.erro || "sem detalhe"}`);
  try {
    return JSON.parse(r.saida);
  } catch {
    return fatal(`o gh devolveu uma resposta que nao e JSON em ${caminho}`);
  }
}

/** Todas as paginas de uma lista: pede ate uma pagina vir incompleta, e confere com o `total_count`. Com `limite`,
 *  recusa logo a 1.a pagina um total acima dele (a API nao devolve mais, e a lista sairia cortada). */
function paginado(base, chave, oQue, limite = null) {
  // Por `id`: um run criado entre duas paginas empurra a lista, e a pagina seguinte repete o ultimo da anterior.
  const porId = new Map();
  let total = null;
  for (let pagina = 1; ; pagina++) {
    const r = api(`${base}${base.includes("?") ? "&" : "?"}per_page=${POR_PAGINA}&page=${pagina}`);
    // Estes endpoints devolvem SEMPRE a lista e o `total_count`: sem um deles a resposta e outra, e nao uma lista vazia.
    if (!Array.isArray(r?.[chave]) || typeof r?.total_count !== "number") fatal(`a resposta de ${base} nao tem \`${chave}\` e \`total_count\`: nao e a lista que pedi`);
    const lote = r?.[chave] ?? [];
    total ??= r?.total_count ?? 0;
    if (pagina === 1 && limite !== null && total > limite) fatal(`${total} ${oQue}: uma pesquisa por data so devolve ${limite} — estreitar o intervalo (--ate)`);
    for (const x of lote) porId.set(x.id ?? `${pagina}-${porId.size}`, x);
    if (lote.length < POR_PAGINA || porId.size >= total) break;
  }
  const itens = [...porId.values()];
  if (itens.length < Math.min(total, LIMITE_DA_PESQUISA)) fatal(`li ${itens.length} ${oQue} e a API diz ${total}: a lista vinha cortada`);
  return { itens, total };
}

if (opt.quota) {
  quota();
  process.exit(0);
}

let repo = opt.repo ?? null;
if (!repo) {
  try {
    repo = repoDoOrigin(execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    repo = null;
  }
}
if (!repo) fatal("nao sei o repo: sem `--repo dono/repo` e sem um `origin` do GitHub");

// --- Os runs ---
let runs;
if (opt.run) runs = [api(`repos/${repo}/actions/runs/${opt.run}`)];
else {
  const ate = opt.ate ?? "2099-12-31";
  runs = paginado(`repos/${repo}/actions/runs?created=${opt.desde}..${ate}`, "workflow_runs", `runs de ${opt.desde} a ${ate}`, LIMITE_DA_PESQUISA).itens;
}

const linhas = [];
for (const r of runs) {
  const { itens: jobs } = paginado(`repos/${repo}/actions/runs/${r.id}/jobs?filter=all`, "jobs", `jobs do run ${r.id}`);
  linhas.push({ r, jobs, ...resumoDosJobs(jobs) });
}

// --- O relatorio ---
// Um run por acabar fica fora da soma e da mediana: os jobs dele contariam 0, e o total sairia baixo sem aviso.
const emCurso = linhas.filter((l) => l.r.status !== "completed");
const pagos = linhas.filter((l) => l.r.status === "completed");
const dependabot = pagos.filter((l) => ehDoDependabot(l.r));
const min = (s) => (s / 60).toFixed(1);
const intervalo = opt.run ? `o run ${opt.run}` : `${opt.desde} a ${opt.ate ?? "hoje"}`;
console.log(`${repo}, ${intervalo}: ${linhas.length} run(s); ${dependabot.length} do proprio Dependabot (\`dynamic\`: PAGOS, na soma, ${dependabot.reduce((a, l) => a + l.cobrado, 0)} min)`);
for (const l of emCurso) console.log(`  EM CURSO (fora da soma e da mediana): ${l.r.id} ${l.r.name ?? "?"} / ${l.r.event ?? "?"} (${l.r.status ?? "?"})`);
console.log("quando            workflow / evento                jobs   real  cobrado  conclusao");
for (const l of pagos) {
  const quem = `${l.r.name ?? "?"} / ${l.r.event ?? "?"}`.padEnd(32);
  console.log(`${String(l.r.created_at ?? "").slice(0, 16).padEnd(17)} ${quem} ${String(l.n).padStart(4)} ${`${Math.round(l.real)}s`.padStart(6)} ${String(l.cobrado).padStart(8)}  ${l.r.conclusion ?? "?"}`);
  if (opt.passos) for (const p of passosDosJobs(l.jobs)) console.log(`    ${p.job} / ${p.passo}: ${Math.round(p.s)}s (${p.conclusao})`);
}
const soma = (k) => pagos.reduce((a, l) => a + l[k], 0);
console.log(`\nCOBRADO ${soma("cobrado")} min · REAL ${min(soma("real"))} min (a diferenca e o arredondamento por job)`);

const prs = pagos.filter((l) => l.r.event === "pull_request");
const daApp = opt.app ? prs.filter((l) => correuOPasso(l.jobs, opt.app)) : prs;
// O job mais longo de cada run, e nao a soma: e um job que paga 3 min ao passar dos 120 s.
const med = mediana(daApp.map((l) => l.maisLongo));
const qual = opt.app ? `dos PRs de app (em que o passo "${opt.app}" correu)` : "de TODOS os PRs (sem --app: os de docs incluidos)";
if (med === null) console.log(`mediana ${qual}: sem runs`);
// Sem --app, varios workflows com `pull_request` (um CodeQL, por exemplo) misturam-se na mesma mediana: di-lo.
const workflows = [...new Set(daApp.map((l) => l.r.name ?? "?"))];
if (workflows.length > 1) console.log(`  (mistura ${workflows.length} workflows: ${workflows.join(", ")} — o --app filtra pelo passo)`);
else {
  const acima = daApp.filter((l) => l.maisLongo > LINHA_DOS_120).length;
  console.log(`mediana ${qual}, do job mais longo de cada run: ${Math.round(med)}s em ${daApp.length} run(s) — ${acima} acima dos ${LINHA_DOS_120}s (um job de ${LINHA_DOS_120 + 1}s ou mais paga ${cobrado(LINHA_DOS_120 + 1)} min)`);
}

// --- A quota da CONTA (#442) ---
function quota() {
  const login = api("user")?.login;
  if (typeof login !== "string" || !login) fatal("o `gh api user` nao devolveu o `login`: nao sei de quem e a quota");
  const [ano, mes] = (opt.mes ?? new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const limite = Number(opt.limite ?? QUOTA_FREE);
  const caminho = `/users/${login}/settings/billing/usage?year=${ano}&month=${mes}`;
  const u = ghApi(caminho);
  // Sem o scope `user`, a API da 404 (ou 403): e o caso de quase todas as sessoes do `gh`, e diz-se como resolver.
  if (u.erro !== undefined && /HTTP 40[34]/.test(u.erro)) fatal(`sem acesso a faturacao da conta (${u.erro.split("\n")[0]}): o gh precisa do scope \`user\` — \`gh auth refresh -h github.com -s user\``);
  if (u.erro !== undefined) fatal(`o gh falhou na faturacao (${caminho}): ${u.erro || "sem detalhe"}`);
  let dados = null;
  try {
    dados = JSON.parse(u.saida);
  } catch {
    dados = null;
  }
  if (!Array.isArray(dados?.usageItems)) fatal(`a resposta da faturacao (${caminho}) nao tem a lista \`usageItems\`: nao e a faturacao que pedi`);
  // A visibilidade de cada repo com minutos, um a um: uma lista dos privados corta (o `gh repo list` para nos 30) e
  // perde um repo apagado ou renomeado a meio do mes. Um renomeado responde com o nome novo; um 404 fica desconhecido.
  const visibilidade = new Map();
  for (const nome of new Set(dados.usageItems.filter((i) => i.unitType === "Minutes").map((i) => i.repositoryName))) {
    const r = nome ? ghApi(`repos/${login}/${nome}`) : { erro: "HTTP 404: sem nome de repo" };
    if (r.erro !== undefined && !/HTTP 404/.test(r.erro)) fatal(`nao consegui ler a visibilidade de ${login}/${nome}: ${r.erro || "sem detalhe"}`);
    let priv;
    try {
      priv = r.erro === undefined ? JSON.parse(r.saida)?.private : "desconhecido";
    } catch {
      priv = undefined;
    }
    if (priv === undefined || priv === null) fatal(`a resposta de repos/${login}/${nome} nao diz se e privado (\`private\`)`);
    visibilidade.set(nome, priv === "desconhecido" ? "desconhecido" : priv ? "privado" : "publico");
  }
  const q = quotaDoMes(dados.usageItems, visibilidade);
  const mesCorrente = `${ano}-${String(mes).padStart(2, "0")}` === new Date().toISOString().slice(0, 7);
  // O ritmo ate HOJE (e nao ate a ultima entrada, que pode estar dias atras), e so a partir do dia 3: os primeiros dias
  // sao ruido, e 70 min no dia 1 projetavam 2100 (um falso AVISO no /deploy).
  const hoje = new Date().getUTCDate();
  const proj = mesCorrente && hoje >= 3 ? projecao(q.total, Math.max(q.ultimoDia, hoje), diasDoMes(ano, mes)) : null;
  const m = (x) => Math.round(x);
  console.log(`quota de ${login}, ${ano}-${String(mes).padStart(2, "0")}: so os repos PRIVADOS gastam a quota (Linux; os publicos nao contam)`);
  if (!dados.usageItems.some((i) => i.unitType === "Minutes")) console.log("  nenhum minuto registado neste mes");
  for (const [r, min] of q.porRepo) console.log(`  ${String(r).padEnd(32)} ${String(m(min)).padStart(6)} min${q.desconhecidos.includes(r) ? "  (contado como privado: nao o encontrei)" : ""}`);
  if (q.publicos > 0) console.log(`  publicos (fora da quota): ${m(q.publicos)} min`);
  for (const [o, min] of q.outros) console.log(`  FORA DA SOMA: ${o}: ${m(min)} min (outro SO ou runner: o multiplicador do Free nao esta confirmado sobre a faturacao)`);
  // Para baixo: 1599 de 2000 nao e "80%" sem AVISO, e 1990 nao e "100%" sem ESGOTADA.
  const pct = Math.floor((q.total / limite) * 100);
  console.log(`\nTOTAL ${q.outros.length ? "pelo menos " : ""}${m(q.total)} / ${limite} min (${pct}%)`);
  if (proj !== null) console.log(`projecao ao fim do mes (o ritmo ate ao dia ${Math.max(q.ultimoDia, hoje)}): ~${m(proj)} min`);
  const nivel = nivelDaQuota(q.total, proj, limite);
  if (nivel === "esgotada") console.log(`QUOTA: ESGOTADA — ${m(q.total)} de ${limite} min: com o limite de gastos a 0, o CI para ate ao dia 1 (src/docs/upgrade-derivados-privados.md §6)`);
  if (nivel === "aviso") console.log(`QUOTA: AVISO — ${pct}% de ${limite} min${proj !== null && proj > limite ? `, e a projecao (~${m(proj)}) passa o limite` : ""}`);
}
