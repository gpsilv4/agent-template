#!/usr/bin/env node
/**
 * Testes do `minutos-ci.mjs` e do `lib/minutos-calculo.mjs` (#429) — {{PROJECT_NAME}}
 *
 * As contas (puras) e a CLI contra um `gh` FALSO no `PATH`, que serve JSON de fixture pela pagina pedida — o teste
 * exercita o ciclo de paginacao do proprio script, e nao o do `gh`. O que se prova:
 *   - o arredondamento (60 s paga 1, 61 paga 2, um job saltado nao paga) e a soma por job;
 *   - a segunda pagina de runs e de jobs, sem repetidos; os runs do proprio Dependabot (`dynamic`) NA soma (pagam-se,
 *     medido contra a faturacao a 3 nov 2026) e contados a parte; um run em curso FORA da soma e da mediana;
 *   - o pedido leva o intervalo e os jobs `filter=all` (o `gh` falso recusa sem ele);
 *   - `--passos` e a mediana (do job mais longo de cada run) contra 120 s, com `--app` (so os PRs em que o passo correu) e sem ele (todos, e di-lo);
 *   - as recusas: cada uma pela SUA mensagem, nunca com "COBRADO 0" — sem `gh`/sessao, nao-JSON, mais de 1000 runs,
 *     uma resposta sem a lista ou sem `total_count`, uma lista mais curta do que o `total_count`, sem repo, argumentos;
 *   - o `--quota` (#442): so os privados (um publico fora, um repo que ja nao existe DENTRO), so o Linux (os outros
 *     SKUs listados fora da soma), a projecao no mes corrente, as linhas `QUOTA:`, e as suas recusas (o scope `user`);
 *   - o `--por-pr` e o `--todos` (#517, no `harness/casos-minutos-por-pr.mjs`): o tipo de cada run (a marca faz o
 *     upgrade, e nao o titulo), o numero do PR pelo branch quando o run o nao traz, o modo de cada privado, um repo 404
 *     fora, os meses do intervalo na faturacao, e as recusas.
 *
 *   node .agent/scripts/tests/test-minutos-ci.mjs
 */
import { spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { cobrado, correuOPasso, diasDoMes, ehDoDependabot, mediana, nivelDaQuota, projecao, projecaoDoMes, quotaDoMes, resumoDosJobs, segundos } from "../lib/minutos-calculo.mjs";
import { repoDoOrigin } from "../lib/repo-origin.mjs";
import { registarPorPr } from "./harness/casos-minutos-por-pr.mjs";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const CLI = join(ROOT, ".agent/scripts/minutos-ci.mjs");
let passed = 0;
const falhas = [];
function caso(nome, fn) {
  let p;
  try {
    p = fn() ?? [];
  } catch (err) {
    p = [`rebentou: ${err instanceof Error ? err.message : String(err)}`];
  }
  if (p.length === 0) {
    passed++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`  FAIL  ${nome}`);
    for (const m of p) console.log(`          ${m}`);
  }
}
const espera = (cond, msg) => (cond ? [] : [msg]);

// --- As contas ---
caso("arredondamento: 60 s paga 1, 61 paga 2, 1 paga 1, 0 paga 0", () => [[60, 1], [61, 2], [1, 1], [0.4, 1], [0, 0], [120, 2], [121, 3]].flatMap(([s, m]) => espera(cobrado(s) === m, `cobrado(${s}) = ${cobrado(s)}, esperava ${m}`)));
caso("um run: a soma dos jobs arredondados, sem os saltados e os por acabar", () => {
  const t = (s) => new Date(Date.UTC(2026, 10, 1, 0, 0, s)).toISOString();
  const r = resumoDosJobs([
    { started_at: t(0), completed_at: t(8), conclusion: "success" },
    { started_at: t(0), completed_at: t(61), conclusion: "failure" },
    { started_at: t(0), completed_at: t(30), conclusion: "skipped" },
    { started_at: t(0), completed_at: null, conclusion: null },
  ]);
  return espera(r.n === 4 && r.real === 69 && r.cobrado === 3, `deu ${JSON.stringify(r)}, esperava n 4, real 69, cobrado 3`);
});
// O `dono/repo` do `origin` (`lib/repo-origin.mjs`, #455): sem `--repo`, e de onde o `minutos-ci` tira o repo que mede.
// Nunca teve caso proprio enquanto viveu no `marcas-yaml`: so corria dentro do CLI. O `null` (nao e do GitHub) faz o CLI
// pedir o `--repo`, em vez de medir outro repo.
caso("repoDoOrigin: https e ssh, com e sem .git, nomes com ponto e hifen; outro host ou sem repo da null", () =>
  [
    ["https://github.com/dono/repo.git", "dono/repo"],
    ["https://github.com/dono/repo", "dono/repo"],
    ["git@github.com:dono/repo.git", "dono/repo"],
    ["git@github.com:o-dono/o.repo-x", "o-dono/o.repo-x"],
    ["https://GitHub.com/dono/repo.git", "dono/repo"],
    ["https://gitlab.com/dono/repo.git", null],
    ["https://github.com/dono", null],
    ["", null],
  ].flatMap(([url, esperado]) => espera(repoDoOrigin(url) === esperado, `repoDoOrigin(${JSON.stringify(url)}) = ${repoDoOrigin(url)}, esperava ${esperado}`)));
caso("segundos: 0 sem inicio ou fim", () => espera(segundos(null, "2026-11-01T00:00:10Z") === 0 && segundos("2026-11-01T00:00:00Z", "2026-11-01T00:00:10Z") === 10, "segundos errados"));
caso("mediana: impar, par e vazia", () => [...espera(mediana([65, 87, 70]) === 70, `impar: ${mediana([65, 87, 70])}`), ...espera(mediana([60, 80]) === 70, `par: ${mediana([60, 80])}`), ...espera(mediana([]) === null, "vazia")]);
caso("um passo saltado nao faz de um PR um PR de app", () => {
  const jobs = [{ steps: [{ name: "TypeScript", conclusion: "skipped" }, { name: "Gitleaks", conclusion: "success" }] }];
  return [...espera(!correuOPasso(jobs, "TypeScript"), "contou o TypeScript saltado"), ...espera(correuOPasso([{ steps: [{ name: "TypeScript", conclusion: "failure" }] }], "TypeScript"), "um passo que falhou tambem correu")];
});
caso("o Dependabot proprio e o `dynamic`, e so ele (pago, contado a parte)", () => espera(ehDoDependabot({ event: "dynamic" }) && !ehDoDependabot({ event: "pull_request" }), "dynamic"));

// --- A CLI, contra um `gh` falso ---

const GH_FALSO = `#!/usr/bin/env node
const { readFileSync, appendFileSync } = require("fs");
const caminho = process.argv[3] ?? "";
appendFileSync(process.env.FAKE_GH_LOG, caminho + "\\n");
const [base, q = ""] = caminho.split("?");
const pagina = new URLSearchParams(q).get("page") ?? "1";
const mapa = JSON.parse(readFileSync(process.env.FAKE_GH, "utf8"));
const chave = base + "#" + pagina;
const v = mapa[chave] ?? mapa[base.replace(/\\/runs\\/\\d+\\//, "/runs/*/") + "#" + pagina] ?? mapa[base.replace(/\\/runs\\/\\d+\\//, "/runs/*/") + "#*"];
// O pedido de jobs leva filter=all (os jobs das tentativas anteriores tambem se pagam): sem ele, 404.
if (/\\/jobs$/.test(base) && new URLSearchParams(q).get("filter") !== "all") { process.stderr.write("HTTP 404: sem filter=all\\n"); process.exit(1); }
if (v === undefined) { process.stderr.write("HTTP 404: " + chave + "\\n"); process.exit(1); }
if (v === "FALHA") { process.stderr.write("HTTP 401: Bad credentials\\n"); process.exit(1); }
if (v === "ERRO500") { process.stderr.write("HTTP 500: Server Error\\n"); process.exit(1); }
process.stdout.write(v === "NAOJSON" ? "<html>nao</html>" : JSON.stringify(v));
`;
function cli(mapa, args, { semGh = false, cwd = null } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "minutos-ci-test-"));
  try {
    const bin = join(raiz, "bin");
    mkdirSync(bin);
    if (!semGh) {
      writeFileSync(join(bin, "gh"), GH_FALSO);
      chmodSync(join(bin, "gh"), 0o755);
    }
    writeFileSync(join(raiz, "mapa.json"), JSON.stringify(mapa));
    writeFileSync(join(raiz, "log"), "");
    // Sem `gh` no PATH: so o binario do node e o `git` (o PATH real traria o `gh` verdadeiro).
    const path = semGh ? bin : `${bin}:${process.env.PATH}`;
    // Com um teto: um ciclo que nao acaba (os meses do `--todos`) fica vermelho, e nao pendurado ate ao timeout do job.
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: cwd ?? raiz, encoding: "utf8", timeout: 60000, env: { ...process.env, PATH: path, FAKE_GH: join(raiz, "mapa.json"), FAKE_GH_LOG: join(raiz, "log") } });
    return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "", log: readFileSync(join(raiz, "log"), "utf8") };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

const R = "repos/o/r/actions/runs";
const T = (s) => new Date(Date.UTC(2026, 10, 1, 0, 0, s)).toISOString();
const job = (s, passos = []) => ({ name: "CI", started_at: T(0), completed_at: T(s), conclusion: "success", steps: passos.map(([name, d, conclusion = "success"]) => ({ name, started_at: T(0), completed_at: T(d), conclusion })) });
const run = (id, event = "pull_request", extra = {}) => ({ id, event, name: "CI", created_at: "2026-11-01T10:00:00Z", status: "completed", conclusion: "success", ...extra });
const NAO_ZERO = (r) => [...espera(r.status !== 0, `saiu ${r.status}`), ...espera(!/COBRADO/.test(r.out), "imprimiu um total (um zero falso?)")];

caso("--run: um run, dois jobs (8 s e 64 s) -> COBRADO 3, REAL 1.2", () => {
  const r = cli({ [`${R}/7#1`]: run(7), [`${R}/7/jobs#1`]: { total_count: 2, jobs: [job(8), job(64)] } }, ["--run", "7", "--repo", "o/r"]);
  return [...espera(r.status === 0, `saiu ${r.status}: ${r.err}`), ...espera(/COBRADO 3 min · REAL 1\.2 min/.test(r.out), `saida: ${r.out}`)];
});
caso("--desde: a 2.a pagina de runs (101 runs) e lida", () => {
  const pag1 = Array.from({ length: 100 }, (_, i) => run(1000 + i));
  const r = cli({ [`${R}#1`]: { total_count: 101, workflow_runs: pag1 }, [`${R}#2`]: { total_count: 101, workflow_runs: [run(2000)] }, [`${R}/*/jobs#*`]: { total_count: 1, jobs: [job(30)] } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return [...espera(r.status === 0, `saiu ${r.status}: ${r.err}`), ...espera(/101 run\(s\)/.test(r.out) && /COBRADO 101 min/.test(r.out), `saida: ${r.out.split("\n")[0]} … ${r.out.match(/COBRADO.*/)?.[0]}`), ...espera(/per_page=100&page=2/.test(r.log), "nao pediu a pagina 2 com per_page=100")];
});
caso("a 2.a pagina de JOBS de um run e lida", () => {
  const pag1 = Array.from({ length: 100 }, () => job(10));
  const r = cli({ [`${R}/7#1`]: run(7), [`${R}/7/jobs#1`]: { total_count: 101, jobs: pag1 }, [`${R}/7/jobs#2`]: { total_count: 101, jobs: [job(61)] } }, ["--run", "7", "--repo", "o/r"]);
  return espera(r.status === 0 && /COBRADO 102 min/.test(r.out), `saiu ${r.status}: ${r.out.match(/COBRADO.*/)?.[0] ?? r.err}`);
});
caso("os runs do proprio Dependabot (`dynamic`) ENTRAM na soma (pagam-se), e contam-se a parte", () => {
  const r = cli({ [`${R}#1`]: { total_count: 2, workflow_runs: [run(1), run(2, "dynamic")] }, [`${R}/*/jobs#*`]: { total_count: 1, jobs: [job(61)] } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return espera(r.status === 0 && /1 do proprio Dependabot \(`dynamic`: PAGOS, na soma, 2 min\)/.test(r.out) && /COBRADO 4 min/.test(r.out), `saida: ${r.out}`);
});
caso("um run em curso fica FORA da soma e da mediana, e listado", () => {
  const r = cli({ [`${R}#1`]: { total_count: 2, workflow_runs: [run(1), run(2, "pull_request", { status: "in_progress", conclusion: null })] }, [`${R}/1/jobs#1`]: { total_count: 1, jobs: [job(61)] }, [`${R}/2/jobs#1`]: { total_count: 1, jobs: [{ ...job(5), completed_at: null, conclusion: null }] } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return [...espera(r.status === 0 && /COBRADO 2 min/.test(r.out), `soma: ${r.out.match(/COBRADO.*/)?.[0] ?? r.err}`), ...espera(/EM CURSO \(fora da soma e da mediana\): 2 /.test(r.out), "nao listou o run em curso"), ...espera(/: 61s em 1 run\(s\)/.test(r.out), `mediana: ${r.out.match(/mediana.*/)?.[0]}`)];
});
caso("um run repetido entre duas paginas conta uma vez", () => {
  const pag1 = Array.from({ length: 100 }, (_, i) => run(i));
  const r = cli({ [`${R}#1`]: { total_count: 101, workflow_runs: pag1 }, [`${R}#2`]: { total_count: 101, workflow_runs: [run(99), run(100)] }, [`${R}/*/jobs#*`]: { total_count: 1, jobs: [job(30)] } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return espera(r.status === 0 && /101 run\(s\)/.test(r.out) && /COBRADO 101 min/.test(r.out), `saida: ${r.out.split("\n")[0]} … ${r.out.match(/COBRADO.*/)?.[0] ?? r.err}`);
});
caso("com o total exato (100), nao pede a pagina seguinte", () => {
  const r = cli({ [`${R}#1`]: { total_count: 100, workflow_runs: Array.from({ length: 100 }, (_, i) => run(i)) }, [`${R}/*/jobs#*`]: { total_count: 1, jobs: [job(30)] } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return [...espera(r.status === 0, `saiu ${r.status}: ${r.err}`), ...espera(!/actions\/runs\?[^\n]*page=2/.test(r.log), "pediu a pagina 2 de runs")];
});
const TRES_PRS = {
  [`${R}#1`]: { total_count: 3, workflow_runs: [run(1), run(2), run(3)] },
  [`${R}/1/jobs#1`]: { total_count: 1, jobs: [job(70, [["TypeScript", 10], ["Build", 15]])] },
  [`${R}/2/jobs#1`]: { total_count: 1, jobs: [job(130, [["TypeScript", 12], ["Build", 40]])] },
  [`${R}/3/jobs#1`]: { total_count: 1, jobs: [job(20, [["TypeScript", 0, "skipped"]])] },
};
caso("--app TypeScript: a mediana so dos PRs em que o passo correu (70 e 130 -> 100), 1 acima dos 120", () => {
  const r = cli(TRES_PRS, ["--desde", "2026-11-01", "--app", "TypeScript", "--repo", "o/r"]);
  return espera(r.status === 0 && /mediana dos PRs de app \(em que o passo "TypeScript" correu\), do job mais longo de cada run: 100s em 2 run\(s\) — 1 acima dos 120s/.test(r.out), `saida: ${r.out.match(/mediana.*/)?.[0] ?? r.err}`);
});
caso("sem --app: a mediana de TODOS os PRs (20, 70, 130 -> 70), e di-lo", () => {
  const r = cli(TRES_PRS, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return espera(r.status === 0 && /mediana de TODOS os PRs \(sem --app: os de docs incluidos\), do job mais longo de cada run: 70s em 3 run\(s\)/.test(r.out), `saida: ${r.out.match(/mediana.*/)?.[0] ?? r.err}`);
});
caso("a mediana e a do job MAIS LONGO de cada run, nao a soma: cinco jobs de 30 s -> 30s, 0 acima, COBRADO 5", () => {
  const r = cli({ [`${R}#1`]: { total_count: 1, workflow_runs: [run(1)] }, [`${R}/1/jobs#1`]: { total_count: 5, jobs: Array.from({ length: 5 }, () => job(30)) } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return espera(r.status === 0 && /: 30s em 1 run\(s\) — 0 acima/.test(r.out) && /COBRADO 5 min/.test(r.out), `saida: ${r.out.match(/mediana.*/)?.[0] ?? r.err}`);
});
caso("o intervalo vai no pedido: `created=desde..ate`, e ate 2099-12-31 sem --ate", () => {
  const m = { [`${R}#1`]: { total_count: 1, workflow_runs: [run(1)] }, [`${R}/*/jobs#*`]: { total_count: 1, jobs: [job(30)] } };
  const com = cli(m, ["--desde", "2026-11-01", "--ate", "2026-11-05", "--repo", "o/r"]);
  const sem = cli(m, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return [...espera(/actions\/runs\?[^\n]*created=2026-11-01\.\.2026-11-05/.test(com.log), `com --ate: ${com.log}`), ...espera(/actions\/runs\?[^\n]*created=2026-11-01\.\.2099-12-31/.test(sem.log), `sem --ate: ${sem.log}`)];
});
caso("sem --app, dois workflows com pull_request na mesma mediana: di-lo", () => {
  const r = cli({ [`${R}#1`]: { total_count: 2, workflow_runs: [run(1), run(2, "pull_request", { name: "CodeQL" })] }, [`${R}/*/jobs#*`]: { total_count: 1, jobs: [job(30)] } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return espera(r.status === 0 && /mistura 2 workflows: CI, CodeQL/.test(r.out), `saida: ${r.out}`);
});
caso("sem PRs (um --run de um push): 'sem runs', e nunca a linha '0s em 0 run(s)' (#453)", () => {
  const r = cli({ [`${R}/7#1`]: run(7, "push"), [`${R}/7/jobs#1`]: { total_count: 1, jobs: [job(30)] } }, ["--run", "7", "--repo", "o/r"]);
  return [...espera(r.status === 0 && /mediana .*: sem runs/.test(r.out), `saida: ${r.out}`), ...espera(!/0s em 0 run/.test(r.out), "imprimiu a mediana de zero runs")];
});
caso("--passos: a duracao de cada passo; sem ele, nenhuma", () => {
  const com = cli(TRES_PRS, ["--desde", "2026-11-01", "--passos", "--repo", "o/r"]);
  const sem = cli(TRES_PRS, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return [...espera(/CI \/ Build: 40s \(success\)/.test(com.out), `com --passos: ${com.out}`), ...espera(!/CI \/ Build:/.test(sem.out), "sem --passos imprimiu passos")];
});

// As recusas: cada uma pela sua mensagem.
caso("recusa: o gh falha (sem sessao) -> sai != 0, diz que o gh falhou, nunca um total", () => {
  const r = cli({ [`${R}/7#1`]: "FALHA" }, ["--run", "7", "--repo", "o/r"]);
  return [...NAO_ZERO(r), ...espera(/o gh falhou/.test(r.err) && /Bad credentials/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: sem `gh` no PATH", () => {
  const r = cli({}, ["--run", "7", "--repo", "o/r"], { semGh: true });
  return [...NAO_ZERO(r), ...espera(/o gh falhou/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: uma resposta que nao e JSON", () => {
  const r = cli({ [`${R}/7#1`]: "NAOJSON" }, ["--run", "7", "--repo", "o/r"]);
  return [...NAO_ZERO(r), ...espera(/nao e JSON/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: mais de 1000 runs no intervalo (o limite da pesquisa) — estreitar", () => {
  const r = cli({ [`${R}#1`]: { total_count: 1500, workflow_runs: Array.from({ length: 100 }, (_, i) => run(i)) } }, ["--desde", "2026-10-01", "--repo", "o/r"]);
  return [...NAO_ZERO(r), ...espera(/1500 runs/.test(r.err) && /estreitar/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: uma resposta sem a lista (`workflow_runs`)", () => {
  const r = cli({ [`${R}#1`]: { total_count: 3, message: "outra coisa" } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return [...NAO_ZERO(r), ...espera(/nao tem `workflow_runs` e `total_count`/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: uma resposta sem `total_count`", () => {
  const r = cli({ [`${R}/7#1`]: run(7), [`${R}/7/jobs#1`]: { jobs: [job(10)] } }, ["--run", "7", "--repo", "o/r"]);
  return [...NAO_ZERO(r), ...espera(/nao tem `jobs` e `total_count`/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: menos runs lidos do que o total_count (uma lista cortada)", () => {
  const r = cli({ [`${R}#1`]: { total_count: 150, workflow_runs: Array.from({ length: 100 }, (_, i) => run(i)) }, [`${R}#2`]: { total_count: 150, workflow_runs: [] } }, ["--desde", "2026-11-01", "--repo", "o/r"]);
  return [...NAO_ZERO(r), ...espera(/li 100 runs/.test(r.err) && /cortada/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: menos jobs lidos do que o total_count de um run", () => {
  const r = cli({ [`${R}/7#1`]: run(7), [`${R}/7/jobs#1`]: { total_count: 3, jobs: [job(10)] } }, ["--run", "7", "--repo", "o/r"]);
  return [...NAO_ZERO(r), ...espera(/li 1 jobs do run 7/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa: sem --repo e sem um origin do GitHub", () => {
  const r = cli({}, ["--run", "7"]);
  return [...NAO_ZERO(r), ...espera(/nao sei o repo/.test(r.err), `stderr: ${r.err}`)];
});
for (const [nome, args] of [["nenhum de --run/--desde", []], ["os dois", ["--run", "1", "--desde", "2026-11-01"]], ["um argumento desconhecido", ["--run", "1", "--ultimos", "5"]], ["uma data mal escrita", ["--desde", "1/11/2026"]], ["um --run que nao e um numero", ["--run", "abc"]]]) {
  caso(`recusa: argumentos — ${nome}`, () => {
    const r = cli({}, [...args, "--repo", "o/r"]);
    return [...NAO_ZERO(r), ...espera(/uso:/.test(r.err), `stderr: ${r.err}`), ...espera(r.log === "", "chamou o gh antes de validar os argumentos")];
  });
}

// --- O `--quota` (#442): a quota da CONTA ---

// As contas, puras.
const ITEM = (repo, quantity, sku = "Actions Linux", unitType = "Minutes", dia = 1) => ({ date: `2026-11-${String(dia).padStart(2, "0")}T00:00:00Z`, product: "actions", sku, quantity, unitType, repositoryName: repo });
caso("quota: so os privados e os desconhecidos contam; o publico e o storage ficam fora", () => {
  const vis = new Map([["priv", "privado"], ["pub", "publico"], ["foi", "desconhecido"]]);
  const q = quotaDoMes([ITEM("priv", 300), ITEM("pub", 700), ITEM("foi", 10), ITEM("priv", 0.5, "Actions storage", "GigabyteHours")], vis);
  return [...espera(q.total === 310 && q.publicos === 700, `total ${q.total}, publicos ${q.publicos}`), ...espera(JSON.stringify(q.desconhecidos) === '["foi"]', `desconhecidos: ${q.desconhecidos}`), ...espera(q.porRepo[0][0] === "priv", "porRepo nao vem do maior para o menor")];
});
caso("quota: um outro SKU em minutos fica FORA da soma, listado", () => {
  const q = quotaDoMes([ITEM("priv", 100), ITEM("priv", 40, "Actions Windows")], new Map([["priv", "privado"]]));
  return espera(q.total === 100 && q.outros.length === 1 && q.outros[0][1] === 40, `deu ${JSON.stringify(q)}`);
});
caso("quota: a projecao, os dias do mes e o nivel", () => [
  ...espera(diasDoMes(2026, 11) === 30 && diasDoMes(2028, 2) === 29, "dias do mes"),
  ...espera(projecao(100, 10, 30) === 300 && projecao(0, 0, 30) === null, "projecao"),
  ...espera(nivelDaQuota(2000, null, 2000) === "esgotada" && nivelDaQuota(1600, null, 2000) === "aviso" && nivelDaQuota(1000, 2100, 2000) === "aviso" && nivelDaQuota(1000, 1500, 2000) === null, "nivel"),
]);

// O limiar do dia 3 (#453), com o `hoje` como parametro: os tres lados em TODAS as corridas, e nao pelo relogio.
caso("quota: a projecao do mes so a partir do dia 3, pelo ritmo ate hoje (dias 1, 2 e 3, e a ultima entrada a frente)", () => [
  ...espera(projecaoDoMes({ total: 70, ultimoDia: 1, hoje: 1, dias: 30 }) === null, "dia 1: projetou (o falso AVISO do /deploy)"),
  ...espera(projecaoDoMes({ total: 70, ultimoDia: 2, hoje: 2, dias: 30 }) === null, "dia 2: projetou"),
  ...espera(projecaoDoMes({ total: 70, ultimoDia: 1, hoje: 3, dias: 30 }) === 700, "dia 3: o ritmo e ate HOJE (70/3 x 30)"),
  ...espera(projecaoDoMes({ total: 70, ultimoDia: 10, hoje: 3, dias: 30 }) === 210, "uma entrada a frente de hoje: o ritmo e ate ela"),
]);

// A CLI, contra o `gh` falso.
const U = "/users/eu/settings/billing/usage";
const HOJE = new Date().toISOString().slice(0, 7);
const [AH, MH] = HOJE.split("-").map(Number);
const DIA = (repo, q, dia, sku) => ({ ...ITEM(repo, q, sku), date: `${HOJE}-${String(dia).padStart(2, "0")}T00:00:00Z` });
const conta = (itens, repos) => ({ "user#1": { login: "eu" }, [`${U}#1`]: { usageItems: itens }, ...Object.fromEntries(Object.entries(repos).map(([r, v]) => [`repos/eu/${r}#1`, v === null ? "ERRO500" : { private: v }])) });
const QUOTA_OK = conta([DIA("priv", 300, 1), DIA("priv", 200, 10), DIA("pub", 700, 2)], { priv: true, pub: false });
const NAO_TOTAL = (r) => [...espera(r.status !== 0, `saiu ${r.status}`), ...espera(!/TOTAL/.test(r.out), "imprimiu um total (um zero falso?)")];
const linhaQuota = (r) => r.out.split("\n").filter((l) => l.startsWith("QUOTA:"));

caso("--quota: a soma so dos privados, por repo e no total, e os publicos numa linha a parte", () => {
  const r = cli(QUOTA_OK, ["--quota", "--mes", HOJE]);
  return [...espera(r.status === 0, `saiu ${r.status}: ${r.err}`), ...espera(/priv\s+500 min/.test(r.out) && /TOTAL 500 \/ 2000 min \(25%\)/.test(r.out), `saida: ${r.out}`), ...espera(/publicos \(fora da quota\): 700 min/.test(r.out), "nao separou os publicos"), ...espera(/year=\d+&month=\d+/.test(r.log), `o pedido nao leva o mes: ${r.log}`)];
});
caso("--quota: um repo que ja nao existe (404) CONTA, com o aviso; tratado como publico, a soma descia", () => {
  const r = cli(conta([DIA("priv", 300, 1), DIA("foi", 50, 2)], { priv: true }), ["--quota", "--mes", HOJE]);
  return espera(r.status === 0 && /foi\s+50 min\s+\(contado como privado: nao o encontrei\)/.test(r.out) && /TOTAL 350 /.test(r.out), `saida: ${r.out} ${r.err}`);
});
caso("--quota: um outro SKU em minutos fica fora da soma, listado, e o total diz 'pelo menos'", () => {
  const r = cli(conta([DIA("priv", 300, 1), DIA("priv", 40, 1, "Actions Windows")], { priv: true }), ["--quota", "--mes", HOJE]);
  return espera(r.status === 0 && /FORA DA SOMA: Actions Windows · priv: 40 min/.test(r.out) && /TOTAL pelo menos 300 \//.test(r.out), `saida: ${r.out}`);
});
// A projecao usa o dia de HOJE (UTC) no mes corrente, e so a partir do dia 3: o caso calcula o que espera com o mesmo
// relogio, e nos dias 1 e 2 espera nenhuma projecao.
const DIA_HOJE = new Date().getUTCDate();
caso("--quota: a projecao no mes corrente (o ritmo ate hoje, a partir do dia 3) e nenhuma num mes passado", () => {
  const dia = Math.max(10, DIA_HOJE);
  const esperada = Math.round((500 / dia) * diasDoMes(AH, MH));
  const agora = cli(QUOTA_OK, ["--quota", "--mes", HOJE]);
  const passado = cli(conta([ITEM("priv", 500)], { priv: true }), ["--quota", "--mes", "2020-01"]);
  const linha = DIA_HOJE >= 3 ? new RegExp(`projecao ao fim do mes \\(o ritmo ate ao dia ${dia}\\): ~${esperada} min`).test(agora.out) : !/projecao/.test(agora.out);
  return [...espera(linha, `agora (dia ${DIA_HOJE}): ${agora.out}`), ...espera(passado.status === 0 && !/projecao/.test(passado.out), `passado: ${passado.out}`)];
});
caso("--quota: as linhas QUOTA: a 85% AVISO, a 100% ESGOTADA, a projecao acima do limite AVISO; a 25%, nenhuma", () => {
  const um = (q, dia, mesArg = "2020-01") => cli(conta([{ ...ITEM("priv", q), date: `${mesArg}-${String(dia).padStart(2, "0")}T00:00:00Z` }], { priv: true }), ["--quota", "--mes", mesArg]);
  const a85 = linhaQuota(um(1700, 1));
  const a100 = linhaQuota(um(2000, 1));
  const proj = linhaQuota(cli(conta([DIA("priv", 1000, 1)], { priv: true }), ["--quota", "--mes", HOJE]));
  const baixo = linhaQuota(um(500, 1));
  return [
    ...espera(a85.length === 1 && /^QUOTA: AVISO — 85% de 2000 min$/.test(a85[0]), `85%: ${a85}`),
    ...espera(a100.length === 1 && /^QUOTA: ESGOTADA — 2000 de 2000 min/.test(a100[0]), `100%: ${a100}`),
    ...espera(DIA_HOJE < 3 ? proj.length === 0 : proj.length === 1 && /^QUOTA: AVISO — 50% de 2000 min, e a projecao \(~\d+\) passa o limite$/.test(proj[0]), `projecao (dia ${DIA_HOJE}): ${proj}`),
    ...espera(baixo.length === 0, `a 25% saiu uma linha QUOTA: ${baixo}`),
  ];
});
caso("--quota: a percentagem arredonda para BAIXO (1599 -> 79%, sem aviso; 1990 -> 99%, AVISO e nao ESGOTADA)", () => {
  const um = (q) => cli(conta([{ ...ITEM("priv", q), date: "2020-01-01T00:00:00Z" }], { priv: true }), ["--quota", "--mes", "2020-01"]);
  const a = um(1599);
  const b = um(1990);
  return [...espera(/\(79%\)/.test(a.out) && linhaQuota(a).length === 0, `1599: ${a.out}`), ...espera(/\(99%\)/.test(b.out) && /^QUOTA: AVISO — 99%/.test(linhaQuota(b)[0] ?? ""), `1990: ${b.out}`)];
});
caso("--quota: o --limite (3000 no Pro) muda a percentagem", () => {
  const r = cli(conta([ITEM("priv", 1500)], { priv: true }), ["--quota", "--mes", "2020-01", "--limite", "3000"]);
  return espera(r.status === 0 && /TOTAL 1500 \/ 3000 min \(50%\)/.test(r.out) && linhaQuota(r).length === 0, `saida: ${r.out}`);
});
caso("--quota: um mes sem uso diz 'nenhum minuto registado' e sai 0", () => {
  const r = cli(conta([], {}), ["--quota", "--mes", "2020-01"]);
  return espera(r.status === 0 && /nenhum minuto registado/.test(r.out) && /TOTAL 0 \/ 2000/.test(r.out), `saida: ${r.out} ${r.err}`);
});
// As recusas do --quota: cada uma pela sua mensagem, e sem total.
caso("recusa --quota: sem o scope `user` (404 na faturacao) diz o comando", () => {
  const r = cli({ "user#1": { login: "eu" } }, ["--quota"]);
  return [...NAO_TOTAL(r), ...espera(/gh auth refresh -h github\.com -s user/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa --quota: a faturacao com outro erro (500)", () => {
  const r = cli({ "user#1": { login: "eu" }, [`${U}#1`]: "ERRO500" }, ["--quota"]);
  return [...NAO_TOTAL(r), ...espera(/o gh falhou na faturacao/.test(r.err) && /HTTP 500/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa --quota: o `gh api user` sem login", () => {
  const r = cli({ "user#1": { nome: "x" } }, ["--quota"]);
  return [...NAO_TOTAL(r), ...espera(/nao devolveu o `login`/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa --quota: o `gh api user` a falhar", () => {
  const r = cli({ "user#1": "FALHA" }, ["--quota"]);
  return [...NAO_TOTAL(r), ...espera(/o gh falhou em user/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa --quota: uma faturacao sem `usageItems`", () => {
  const r = cli({ "user#1": { login: "eu" }, [`${U}#1`]: { outra: [] } }, ["--quota"]);
  return [...NAO_TOTAL(r), ...espera(/nao tem a lista `usageItems`/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa --quota: a faturacao que nao e JSON", () => {
  const r = cli({ "user#1": { login: "eu" }, [`${U}#1`]: "NAOJSON" }, ["--quota"]);
  return [...NAO_TOTAL(r), ...espera(/nao tem a lista `usageItems`/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa --quota: a visibilidade de um repo com outro erro (500)", () => {
  const r = cli(conta([DIA("priv", 300, 1)], { priv: null }), ["--quota", "--mes", HOJE]);
  return [...NAO_TOTAL(r), ...espera(/nao consegui ler a visibilidade de eu\/priv/.test(r.err), `stderr: ${r.err}`)];
});
caso("recusa --quota: um repo que nao diz se e privado", () => {
  const r = cli({ ...conta([DIA("priv", 300, 1)], {}), "repos/eu/priv#1": { name: "priv" } }, ["--quota", "--mes", HOJE]);
  return [...NAO_TOTAL(r), ...espera(/nao diz se e privado/.test(r.err), `stderr: ${r.err}`)];
});
for (const [nome, args, frase] of [
  ["o --quota com o --desde", ["--quota", "--desde", "2026-11-01"], "nao se junta"],
  ["o --quota com o --run", ["--quota", "--run", "7"], "nao se junta"],
  ["o --quota com o --repo", ["--quota", "--repo", "o/r"], "nao se junta"],
  ["o --quota com o --ate", ["--quota", "--ate", "2026-11-05"], "nao se junta"],
  ["o --quota com o --app", ["--quota", "--app", "TypeScript"], "nao se junta"],
  ["o --quota com o --passos", ["--quota", "--passos"], "nao se junta"],
  ["um --mes no futuro (um zero que nao mediu)", ["--quota", "--mes", "2999-01"], "esta no futuro"],
  ["o --mes sem o --quota", ["--desde", "2026-11-01", "--mes", "2026-11"], "so com o `--quota`"],
  ["o --limite sem o --quota", ["--desde", "2026-11-01", "--limite", "3000"], "so com o `--quota`"],
  ["um --mes mal formado", ["--quota", "--mes", "2026-13"], "--mes quer AAAA-MM"],
  ["um --limite que nao e um inteiro", ["--quota", "--limite", "2k"], "--limite quer um inteiro"],
  ["o --por-pr sem o --quota", ["--desde", "2026-11-01", "--por-pr"], "o `--por-pr` so com o `--quota`"],
  ["o --todos com o --repo", ["--desde", "2026-11-01", "--todos", "--repo", "o/r"], "nao se junta com `--repo`"],
  ["o --todos com o --quota", ["--quota", "--todos"], "nem `--todos`"],
  ["um --ate antes do --desde (um intervalo sem runs)", ["--desde", "2026-11-05", "--ate", "2026-11-01", "--todos"], "vem antes do --desde"],
  ["um --desde no futuro (um zero que nao mediu nada, #535)", ["--desde", "2999-01-01", "--todos"], "esta no futuro"],
  ["um --desde com o mes 13 (#535)", ["--desde", "2026-13-01", "--todos"], "que exista"],
  ["um --ate a 30 de fevereiro (#535)", ["--desde", "2026-02-01", "--ate", "2026-02-30", "--repo", "o/r"], "que exista"],
  ["o --todos com o --run (#535)", ["--todos", "--run", "1"], "nao se junta com `--repo` nem `--run`"],
]) {
  caso(`recusa --quota: argumentos — ${nome}`, () => {
    const r = cli({}, args);
    return [...NAO_TOTAL(r), ...espera(r.err.includes(frase), `stderr: ${r.err}`), ...espera(r.log === "", "chamou o gh antes de validar os argumentos")];
  });
}

// --- O custo por PR e o `--todos` (#517): no harness, pelo tamanho desta suite ---
registarPorPr({ caso, espera, cli, conta, ITEM, run, job });

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
