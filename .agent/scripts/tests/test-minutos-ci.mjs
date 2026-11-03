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
 *     uma resposta sem a lista ou sem `total_count`, uma lista mais curta do que o `total_count`, sem repo, argumentos.
 *
 *   node .agent/scripts/tests/test-minutos-ci.mjs
 */
import { spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { cobrado, correuOPasso, ehDoDependabot, mediana, resumoDosJobs, segundos } from "../lib/minutos-calculo.mjs";

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
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: cwd ?? raiz, encoding: "utf8", env: { ...process.env, PATH: path, FAKE_GH: join(raiz, "mapa.json"), FAKE_GH_LOG: join(raiz, "log") } });
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

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
