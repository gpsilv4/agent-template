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
 *   node .agent/scripts/minutos-ci.mjs --desde AAAA-MM-DD [--ate AAAA-MM-DD] [--passos] [--app "<passo>"] [--repo dono/repo | --todos]
 *   node .agent/scripts/minutos-ci.mjs --quota [--por-pr] [--mes AAAA-MM] [--limite 2000]
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
 * `--quota --por-pr` (#517): e, por repo privado, o modo (a linha `modo:` da marca; sem ela, o job `guard-tests` do
 * `ci.yml`, pelo `lib/modo-upgrade.mjs`) e quanto custa um PR no mes, por tipo (`lib/minutos-por-pr.mjs`): o upgrade
 * (mexe no `.agent/.template-version`), o normal, o do Dependabot, e os runs do proprio Dependabot com as falhadas.
 * Le os runs, os jobs e os ficheiros de cada PR de cada repo: minutos, e nao segundos.
 *
 * `--desde AAAA-MM-DD --todos` (#517): o run a run de TODOS os repos privados (a lista do `--quota`, dos meses do
 * intervalo), um bloco por repo com o subtotal, e o total geral. Sem `--todos` nem `--repo`, o repo do `origin`.
 *
 * Pagina os runs e os jobs (100 por pagina, sem repetidos). Falha ALTO, nunca com "0 min": sem `gh`, sem sessao, um
 * erro da API, uma resposta sem a lista ou sem `total_count`, mais de 1000 runs no intervalo (o limite de uma pesquisa
 * por data: estreitar), ou menos runs/jobs lidos do que a API diz haver. Um zero falso e pior do que nenhum numero.
 */
import { execFileSync } from "child_process";
import { cobrado, correuOPasso, diasDoMes, ehDoDependabot, mediana, nivelDaQuota, passosDosJobs, privadosDoMes, projecaoDoMes, quotaDoMes, resumoDosJobs } from "./lib/minutos-calculo.mjs";
import { repoDoOrigin } from "./lib/repo-origin.mjs";
import { MARCA, TIPOS, celula, custoPorTipo, prDoRun, precisaDosFicheiros, tipoDoRun } from "./lib/minutos-por-pr.mjs";
import { modoDoProjeto, temGuardTests } from "./lib/modo-upgrade.mjs";

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
  else if (a === "--por-pr") opt.porPr = true;
  else if (a === "--todos") opt.todos = true;
  else if (["--run", "--desde", "--ate", "--app", "--repo", "--mes", "--limite"].includes(a) && ARGS[i + 1] !== undefined) opt[a.slice(2)] = ARGS[++i];
  else erros.push(`argumento desconhecido ou sem valor: ${a}`);
}
if (opt.quota && (opt.run || opt.desde || opt.repo || opt.ate || opt.app || opt.passos || opt.todos)) erros.push("o `--quota` e da CONTA: nao se junta com `--run`, `--desde`, `--ate`, `--app`, `--passos`, `--repo` nem `--todos`");
if (opt.porPr && !opt.quota) erros.push("o `--por-pr` so com o `--quota`");
if (opt.todos && (opt.repo || opt.run)) erros.push("o `--todos` e o run a run de TODOS os privados: nao se junta com `--repo` nem `--run`");
if (!opt.quota && (opt.mes || opt.limite)) erros.push("o `--mes` e o `--limite` so com o `--quota`");
if (opt.mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(opt.mes)) erros.push(`--mes quer AAAA-MM (deu ${opt.mes})`);
// Um mes no futuro nao tem faturacao: a API da uma lista vazia, e o TOTAL 0 seria um zero que nao mediu nada.
if (opt.mes && opt.mes > new Date().toISOString().slice(0, 7)) erros.push(`--mes ${opt.mes} esta no futuro (em UTC): nao ha faturacao para medir`);
if (opt.limite && !/^[1-9]\d*$/.test(opt.limite)) erros.push(`--limite quer um inteiro positivo (deu ${opt.limite})`);
if (!opt.quota && !opt.run === !opt.desde) erros.push("da exatamente um de `--run <id>` ou `--desde AAAA-MM-DD` (ou o `--quota`)");
// Uma data REAL (#535): a forma so deixava passar um `2026-13-01` ou um `2026-02-30`, e o `--todos` ficava sem meses.
const dataReal = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
for (const k of ["desde", "ate"]) if (opt[k] && !dataReal(opt[k])) erros.push(`--${k} quer uma data AAAA-MM-DD que exista (deu ${opt[k]})`);
// Um `--desde` no futuro nao tem runs nem faturacao: "nenhum repo" seria um zero que nao mediu nada (`TP2`, #535) — a
// mesma regra do `--mes`.
if (opt.desde && dataReal(opt.desde) && opt.desde > new Date().toISOString().slice(0, 10)) erros.push(`--desde ${opt.desde} esta no futuro (em UTC): nao ha runs para medir`);
// Um intervalo ao contrario nao tem runs: "nenhum repo" ou "0 min" seriam um zero que nao mediu nada (`TP2`).
if (opt.desde && opt.ate && opt.ate < opt.desde) erros.push(`--ate ${opt.ate} vem antes do --desde ${opt.desde}`);
if (opt.run && !/^\d+$/.test(opt.run)) erros.push(`--run quer o id numerico de um run (deu ${opt.run})`);
if (erros.length) fatal(`${erros.join("; ")}\n  uso: --run <id> | --desde AAAA-MM-DD [--ate AAAA-MM-DD] [--passos] [--app "<passo>"] [--repo dono/repo | --todos] | --quota [--por-pr] [--mes AAAA-MM] [--limite ${QUOTA_FREE}]`);

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

/** Os runs de um intervalo com os jobs de cada um, e o resumo (`resumoDosJobs`): o percurso que o run a run, o
 *  `--todos` e o `--por-pr` partilham (`TP8`). `intervalo` e `created=` da API; com `run`, so esse. */
function runsComJobs(repo, { run = null, desde = null, ate = null }) {
  const runs = run
    ? [api(`repos/${repo}/actions/runs/${run}`)]
    : paginado(`repos/${repo}/actions/runs?created=${desde}..${ate ?? "2099-12-31"}`, "workflow_runs", `runs de ${desde} a ${ate ?? "2099-12-31"}`, LIMITE_DA_PESQUISA).itens;
  return runs.map((r) => {
    const { itens: jobs } = paginado(`repos/${repo}/actions/runs/${r.id}/jobs?filter=all`, "jobs", `jobs do run ${r.id}`);
    return { r, jobs, ...resumoDosJobs(jobs) };
  });
}

/** O login da conta autenticada. */
function login() {
  const l = api("user")?.login;
  if (typeof l !== "string" || !l) fatal("o `gh api user` nao devolveu o `login`: nao sei de quem e a quota");
  return l;
}

/** Os itens da faturacao de um mes (`usageItems`), com as recusas do scope `user` e de uma resposta que nao e ela. */
function faturacao(eu, ano, mes) {
  const caminho = `/users/${eu}/settings/billing/usage?year=${ano}&month=${mes}`;
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
  return dados.usageItems;
}

/** A visibilidade de cada repo com minutos, um a um: uma lista dos privados corta (o `gh repo list` para nos 30) e
 *  perde um repo apagado ou renomeado a meio do mes. Um renomeado responde com o nome novo; um 404 fica desconhecido. */
function visibilidadeDe(eu, itens) {
  const visibilidade = new Map();
  for (const nome of new Set(itens.filter((i) => i.unitType === "Minutes").map((i) => i.repositoryName))) {
    const r = nome ? ghApi(`repos/${eu}/${nome}`) : { erro: "HTTP 404: sem nome de repo" };
    if (r.erro !== undefined && !/HTTP 404/.test(r.erro)) fatal(`nao consegui ler a visibilidade de ${eu}/${nome}: ${r.erro || "sem detalhe"}`);
    let priv;
    try {
      priv = r.erro === undefined ? JSON.parse(r.saida)?.private : "desconhecido";
    } catch {
      priv = undefined;
    }
    if (priv === undefined || priv === null) fatal(`a resposta de repos/${eu}/${nome} nao diz se e privado (\`private\`)`);
    visibilidade.set(nome, priv === "desconhecido" ? "desconhecido" : priv ? "privado" : "publico");
  }
  return visibilidade;
}

if (opt.quota) {
  quota();
  process.exit(0);
}

if (opt.todos) {
  todos();
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
relatorio(repo);

// --- O relatorio de um repo, run a run ---
/** Imprime o run a run de `alvo`, e devolve o cobrado (para o total do `--todos`). */
function relatorio(alvo) {
  const linhas = runsComJobs(alvo, opt);
  // Um run por acabar fica fora da soma e da mediana: os jobs dele contariam 0, e o total sairia baixo sem aviso.
  const emCurso = linhas.filter((l) => l.r.status !== "completed");
  const pagos = linhas.filter((l) => l.r.status === "completed");
  const dependabot = pagos.filter((l) => ehDoDependabot(l.r));
  const min = (s) => (s / 60).toFixed(1);
  const intervalo = opt.run ? `o run ${opt.run}` : `${opt.desde} a ${opt.ate ?? "hoje"}`;
  console.log(`${alvo}, ${intervalo}: ${linhas.length} run(s); ${dependabot.length} do proprio Dependabot (\`dynamic\`: PAGOS, na soma, ${dependabot.reduce((a, l) => a + l.cobrado, 0)} min)`);
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
  // Sem PRs (um `--run` de um push, um intervalo sem PRs) diz-se so isso: a linha da mediana com "0s em 0 run(s)" era
  // um zero que nao mediu nada (#453).
  if (med === null) console.log(`mediana ${qual}: sem runs`);
  // Sem --app, varios workflows com `pull_request` (um CodeQL, por exemplo) misturam-se na mesma mediana: di-lo.
  const workflows = [...new Set(daApp.map((l) => l.r.name ?? "?"))];
  if (med !== null && workflows.length > 1) console.log(`  (mistura ${workflows.length} workflows: ${workflows.join(", ")} — o --app filtra pelo passo)`);
  else if (med !== null) {
    const acima = daApp.filter((l) => l.maisLongo > LINHA_DOS_120).length;
    console.log(`mediana ${qual}, do job mais longo de cada run: ${Math.round(med)}s em ${daApp.length} run(s) — ${acima} acima dos ${LINHA_DOS_120}s (um job de ${LINHA_DOS_120 + 1}s ou mais paga ${cobrado(LINHA_DOS_120 + 1)} min)`);
  }
  return soma("cobrado");
}

// --- O `--todos` (#517): o run a run de todos os privados ---
function todos() {
  const eu = login();
  // Os meses do intervalo: um repo com minutos so em outubro entra num `--desde` de outubro.
  const fim = (opt.ate ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  const meses = [];
  for (let m = opt.desde.slice(0, 7); m <= fim; ) {
    meses.push(m);
    const [a, n] = m.split("-").map(Number);
    m = n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, "0")}`;
  }
  const itens = meses.flatMap((m) => faturacao(eu, ...m.split("-").map(Number)));
  const { privados, desconhecidos } = privadosDoMes(visibilidadeDe(eu, itens));
  for (const n of desconhecidos) console.log(`FORA: ${eu}/${n} tem minutos na faturacao e nao o encontrei (apagado ou renomeado): os runs dele nao se leem`);
  if (!privados.length) {
    console.log(`nenhum repo privado com minutos de ${meses[0]} a ${meses.at(-1)}`);
    return;
  }
  const subtotais = privados.map((n) => {
    console.log(`\n=== ${eu}/${n} ===`);
    return [n, relatorio(`${eu}/${n}`)];
  });
  console.log(`\nTOTAL de ${privados.length} repo(s) privado(s), ${opt.desde} a ${opt.ate ?? "hoje"}: ${subtotais.reduce((a, [, c]) => a + c, 0)} min cobrados`);
  for (const [n, c] of subtotais) console.log(`  ${n.padEnd(32)} ${String(c).padStart(6)} min`);
}

// --- O `--por-pr` (#517): quanto custa um PR, por tipo, em cada privado ---
/** O texto de um ficheiro do repo pela API, ou `null` se nao existe (404). Outro erro recusa. */
function ficheiroDoRepo(alvo, caminho) {
  const r = ghApi(`repos/${alvo}/contents/${caminho}`);
  if (r.erro !== undefined && /HTTP 404/.test(r.erro)) return null;
  if (r.erro !== undefined) fatal(`o gh falhou a ler ${caminho} de ${alvo}: ${r.erro || "sem detalhe"}`);
  let c;
  try {
    c = JSON.parse(r.saida)?.content;
  } catch {
    c = undefined;
  }
  if (typeof c !== "string") fatal(`a resposta de ${caminho} em ${alvo} nao traz o \`content\`: nao e o ficheiro que pedi`);
  return Buffer.from(c, "base64").toString("utf8");
}

/** Uma lista simples da API (sem `total_count`), pagina a pagina ate uma vir incompleta, ou ate `basta(lote)`. */
function listaSimples(base, oQue, basta = () => false) {
  const itens = [];
  for (let pagina = 1; ; pagina++) {
    const lote = api(`${base}${base.includes("?") ? "&" : "?"}per_page=${POR_PAGINA}&page=${pagina}`);
    if (!Array.isArray(lote)) fatal(`a resposta ${oQue} nao e uma lista`);
    itens.push(...lote);
    if (lote.length < POR_PAGINA || basta(lote)) return itens;
  }
}

/** Os ficheiros de um PR. */
function ficheirosDoPr(alvo, n) {
  return listaSimples(`repos/${alvo}/pulls/${n}/files`, `dos ficheiros do PR ${n} de ${alvo}`).map((f) => f.filename);
}

/** Os PRs do repo atualizados desde `desde` (do mais recente para tras): o numero de um run cujo `pull_requests` vem
 *  vazio encontra-se aqui pelo branch (`prDoRun`). Um PR com runs no mes foi atualizado no mes (um push atualiza-o). */
function prsDesde(alvo, desde) {
  return listaSimples(`repos/${alvo}/pulls?state=all&sort=updated&direction=desc`, `dos PRs de ${alvo}`, (lote) => lote.some((p) => (p.updated_at ?? "") < desde));
}

function porPr(eu, privados, ano, mes) {
  const mm = String(mes).padStart(2, "0");
  console.log(`\ncusto por PR, ${ano}-${mm} (a mediana do cobrado por run; n = runs; so os acabados):`);
  const NOMES = { upgrade: "upgrade", normal: "PR normal", dependabot: "PR Dependabot", dynamic: "Dependabot (dynamic)" };
  for (const nome of privados) {
    const alvo = `${eu}/${nome}`;
    const marca = ficheiroDoRepo(alvo, MARCA);
    const m = marca === null ? null : modoDoProjeto({ marca, temGuardTests: temGuardTests(ficheiroDoRepo(alvo, ".github/workflows/ci.yml")) });
    // Uma contradicao diz o porque: e o que o projeto corrige (o `/upgrade` di-lo tambem).
    const modo = m === null ? "sem marca" : m.modo === "contradicao" ? `contradicao: ${m.porque}` : m.modo;
    const runs = runsComJobs(alvo, { desde: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${diasDoMes(ano, mes)}` });
    // So se algum run de PR vier sem o numero: um pedido a mais por repo, e nao um por run.
    const prs = runs.some((l) => l.r.event === "pull_request" && !l.r.pull_requests?.[0]?.number) ? prsDesde(alvo, `${ano}-${mm}-01`) : [];
    const doPr = new Map();
    const linhas = runs.map((l) => {
      const n = prDoRun(l.r, prs);
      if (precisaDosFicheiros(l.r, n) && !doPr.has(n)) doPr.set(n, ficheirosDoPr(alvo, n));
      return { tipo: tipoDoRun(l.r, n, doPr.get(n) ?? null), cobrado: l.cobrado, jobs: l.n, concluido: l.r.status === "completed", conclusao: l.r.conclusion ?? null, workflow: l.r.name ?? "?" };
    });
    const c = custoPorTipo(linhas);
    console.log(`  ${nome} (modo ${modo})`);
    // Varios workflows com `pull_request` (um CodeQL ao lado do CI) entram na mesma mediana: di-lo, como o run a run. So
    // os runs que ENTRAM nas colunas dos PRs (acabados, e de um tipo de PR): um em curso ou so de docs nao mistura nada.
    const wf = [...new Set(linhas.filter((l) => l.concluido && ["upgrade", "normal", "dependabot"].includes(l.tipo)).map((l) => l.workflow))];
    if (wf.length > 1) console.log(`    (mistura ${wf.length} workflows nas colunas dos PRs: ${wf.join(", ")})`);
    for (const t of TIPOS) console.log(`    ${NOMES[t].padEnd(22)} ${celula(t, c[t])}`);
    const fora = [["so docs", c.docs], ["sem o numero do PR", c["sem-pr"]], ["outros eventos (push, agendados)", c.outros]].filter(([, x]) => x.n > 0);
    if (fora.length) console.log(`    fora das colunas: ${fora.map(([o, x]) => `${o} ${x.n} run(s), ${x.total} min`).join("; ")}`);
  }
}

// --- A quota da CONTA (#442) ---
function quota() {
  const eu = login();
  const [ano, mes] = (opt.mes ?? new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const limite = Number(opt.limite ?? QUOTA_FREE);
  const itens = faturacao(eu, ano, mes);
  const visibilidade = visibilidadeDe(eu, itens);
  const q = quotaDoMes(itens, visibilidade);
  const mesCorrente = `${ano}-${String(mes).padStart(2, "0")}` === new Date().toISOString().slice(0, 7);
  const hoje = new Date().getUTCDate();
  const proj = mesCorrente ? projecaoDoMes({ total: q.total, ultimoDia: q.ultimoDia, hoje, dias: diasDoMes(ano, mes) }) : null;
  const m = (x) => Math.round(x);
  console.log(`quota de ${eu}, ${ano}-${String(mes).padStart(2, "0")}: so os repos PRIVADOS gastam a quota (Linux; os publicos nao contam)`);
  if (!itens.some((i) => i.unitType === "Minutes")) console.log("  nenhum minuto registado neste mes");
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
  // Os desconhecidos (404) contam na quota, mas os runs deles nao se leem: ficam fora do custo por PR, e di-lo.
  // A MESMA lista do `--todos` (#535): os privados com minutos de qualquer SO (a quota soma so o Linux, o custo por PR nao).
  if (opt.porPr) {
    const { privados, desconhecidos } = privadosDoMes(visibilidade);
    porPr(eu, privados, ano, mes);
    for (const r of desconhecidos) console.log(`  FORA: ${r} (nao o encontrei: os runs dele nao se leem)`);
  }
}
