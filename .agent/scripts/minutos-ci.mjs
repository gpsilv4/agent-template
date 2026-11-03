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
 * repos) nao e isto: ver `src/docs/upgrade-derivados-privados.md` §6.
 *
 * Pagina os runs e os jobs (100 por pagina, sem repetidos). Falha ALTO, nunca com "0 min": sem `gh`, sem sessao, um
 * erro da API, uma resposta sem a lista ou sem `total_count`, mais de 1000 runs no intervalo (o limite de uma pesquisa
 * por data: estreitar), ou menos runs/jobs lidos do que a API diz haver. Um zero falso e pior do que nenhum numero.
 */
import { execFileSync } from "child_process";
import { cobrado, correuOPasso, ehDoDependabot, mediana, passosDosJobs, resumoDosJobs } from "./lib/minutos-calculo.mjs";
import { repoDoOrigin } from "./lib/marcas-yaml.mjs";

const POR_PAGINA = 100;
const LIMITE_DA_PESQUISA = 1000;
const LINHA_DOS_120 = 120;

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
  else if (["--run", "--desde", "--ate", "--app", "--repo"].includes(a) && ARGS[i + 1] !== undefined) opt[a.slice(2)] = ARGS[++i];
  else erros.push(`argumento desconhecido ou sem valor: ${a}`);
}
if (!opt.run === !opt.desde) erros.push("da exatamente um de `--run <id>` ou `--desde AAAA-MM-DD`");
for (const k of ["desde", "ate"]) if (opt[k] && !/^\d{4}-\d{2}-\d{2}$/.test(opt[k])) erros.push(`--${k} quer AAAA-MM-DD (deu ${opt[k]})`);
if (opt.run && !/^\d+$/.test(opt.run)) erros.push(`--run quer o id numerico de um run (deu ${opt.run})`);
if (erros.length) fatal(`${erros.join("; ")}\n  uso: --run <id> | --desde AAAA-MM-DD [--ate AAAA-MM-DD] [--passos] [--app "<passo>"] [--repo dono/repo]`);

/** Um pedido a API pelo `gh`, ja em JSON. */
function api(caminho) {
  let saida;
  try {
    saida = execFileSync("gh", ["api", caminho], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const det = err instanceof Error && "stderr" in err ? String(err.stderr).trim() : err instanceof Error ? err.message : String(err);
    return fatal(`o gh falhou em ${caminho} (sem gh, sem sessao, ou um erro da API): ${det || "sem detalhe"}`);
  }
  try {
    return JSON.parse(saida);
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
