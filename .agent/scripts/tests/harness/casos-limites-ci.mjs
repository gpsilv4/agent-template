/**
 * Os casos dos LIMITES de cada job (#542): `lib/limites-ci.mjs` (puro) e a secao `LIMITES` do `minutos-ci` contra o
 * `gh` falso da suite. Chamados no lugar pelo `test-minutos-ci.mjs` (o ficheiro dele estava nos 395 de 500 linhas).
 *
 * Os LIMIARES provam-se aqui, NA fronteira (89,9/90; 74,9/75): a varredura neutraliza as chamadas `aviso(`, nao as
 * constantes — mudar 0.90 para 0.91, ou 0.75 para 0.76, tem de deixar um caso vermelho.
 */
import { CRESCIMENTO, IMINENTE, LIMITE_DO_GITHUB_MIN, avisosDoJob, limiteDaAnotacao, limiteDoJob, limitesDoWorkflow, moldeDoNome } from "../../lib/limites-ci.mjs";

const WORKFLOW = (tSim) => `name: CI
on: pull_request
jobs:
  guard-tests:
    name: Guard Suites
    timeout-minutes: 20
    steps:
      - run: echo
  sweep:
    name: Mutation sweep (\${{ matrix.modo }} \${{ matrix.shard }}/\${{ matrix.de }})
    strategy:
      matrix:
        modo: [completa]
    timeout-minutes: 75   # o tecto da varredura
    steps:
      - run: echo
  simuladores:
    name: Simuladores
    timeout-minutes: ${tSim}
    steps:
      - run: echo
  sem-limite:
    steps:
      - run: echo
  limite-expr:
    timeout-minutes: \${{ inputs.t }}
    steps:
      - run: echo
  lint:
    name: "Lint"
    strategy:
      matrix:
        node: [20, 22]
    timeout-minutes: 7
    steps:
      - run: echo
  chama:
    uses: ./.github/workflows/outro.yml
`;

export function registarLimites({ caso, espera, cli, run }) {
  // --- Os limiares, NA fronteira (limite de 1000 s) ---
  const c = (s, conclusao = "success", extra = {}) => ({ s, conclusao, limiteS: 1000, cortadoS: null, ...extra });
  const tipos = (corridas) => avisosDoJob("j", corridas).avisos.map((a) => a.tipo);
  caso("limites: o corte iminente na fronteira — 899 s de 1000 nao avisa, 900 avisa (90%)", () => [
    ...espera(IMINENTE === 0.9, `IMINENTE = ${IMINENTE}`),
    ...espera(tipos([c(899)]).length === 0, `899: ${tipos([c(899)])}`),
    ...espera(JSON.stringify(tipos([c(900)])) === '["AVISO"]', `900: ${tipos([c(900)])}`),
  ]);
  caso("limites: o crescimento na fronteira — mediana de 5 a 749 s nao avisa, a 750 avisa (75%)", () => {
    const cinco = (s) => [c(s - 40), c(s + 40), c(s), c(s - 10), c(s + 10)];
    const a = avisosDoJob("j", cinco(749));
    const b = avisosDoJob("j", cinco(750));
    return [
      ...espera(CRESCIMENTO === 0.75, `CRESCIMENTO = ${CRESCIMENTO}`),
      ...espera(a.avisos.length === 0 && a.resumo.mediana === 749, `749: ${JSON.stringify(a)}`),
      ...espera(b.avisos.length === 1 && /a crescer para o limite/.test(b.avisos[0].texto), `750: ${JSON.stringify(b.avisos)}`),
    ];
  });
  caso("limites: com 3 corridas a 80%, nao ha crescimento, e diz-se n<5", () => {
    const r = avisosDoJob("j", [c(800), c(800), c(800)]);
    return [...espera(r.avisos.length === 0, `avisou: ${JSON.stringify(r.avisos)}`), ...espera(/n=3 < 5/.test(r.nota ?? ""), `nota: ${r.nota}`)];
  });
  caso("limites: um corte pela anotacao e CORTADO; um cancelado sem ela fica fora da mediana", () => {
    // Os tres cancelados curtos vem DEPOIS dos cinco de 760 s: se entrassem na mediana, as ultimas 5 seriam
    // [760, 760, 12, 12, 12] e a mediana caia para 12 (o controlo da varredura a mao, C5, so ficou vermelho assim).
    const r = avisosDoJob("j", [c(760), c(760), c(760), c(760), c(760), c(12, "cancelled"), c(12, "cancelled"), c(12, "cancelled"), c(1816, "cancelled", { cortadoS: 1800 })]);
    return [
      ...espera(r.avisos.some((a) => a.tipo === "CORTADO" && /30m16s pelo limite de 30m00s/.test(a.texto)), `sem CORTADO: ${JSON.stringify(r.avisos)}`),
      // Os 12 s do cancelado por `concurrency` puxavam a mediana para baixo dos 75%: fora dela, os 760 avisam.
      ...espera(r.resumo.mediana === 760 && r.avisos.some((a) => /a crescer/.test(a.texto)), `mediana ${r.resumo.mediana}: ${JSON.stringify(r.avisos)}`),
      // Exatamente o corte e o crescimento: o cortado (1816 s) nao entra no "iminente" por ser `cancelled`.
      ...espera(r.avisos.length === 2, `avisos a mais: ${JSON.stringify(r.avisos)}`),
    ];
  });
  caso("limites: a anotacao do corte da o limite efetivo; outra mensagem nao", () => [
    ...espera(limiteDaAnotacao([{ message: "The job has exceeded the maximum execution time of 30m0s" }, { message: "The operation was canceled." }]) === 1800, "30m0s"),
    ...espera(limiteDaAnotacao([{ message: "The job has exceeded the maximum execution time of 1h5m0s" }]) === 3900, "1h5m0s"),
    ...espera(limiteDaAnotacao([{ message: "The operation was canceled." }]) === null, "um cancelamento qualquer nao e corte"),
    ...espera(limiteDaAnotacao([]) === null, "sem anotacoes"),
  ]);

  // --- O limite de cada job, pelo nome da API ---
  const L = limitesDoWorkflow(WORKFLOW(45));
  const de = (nome) => limiteDoJob(nome, L);
  caso("limites: cada nome da API liga-se ao seu job (matriz com expressoes, nome literal, matriz com nome literal)", () => [
    ...espera(de("Mutation sweep (completa 1/3)").id === "sweep" && de("Mutation sweep (completa 1/3)").limiteMin === 75, `sweep: ${JSON.stringify(de("Mutation sweep (completa 1/3)"))}`),
    ...espera(de("Guard Suites").id === "guard-tests" && de("Guard Suites").limiteMin === 20, "guard-tests"),
    ...espera(de("Lint (20)").id === "lint" && de("Lint").id === "lint", `lint: ${JSON.stringify(de("Lint (20)"))}`),
    ...espera(de("Simuladores").limiteMin === 45, "simuladores"),
  ]);
  caso("limites: sem timeout-minutes, o default do GitHub (dito); uma expressao e ilegivel; um `uses:` e um nome desconhecido nao se ligam", () => [
    ...espera(de("sem-limite").limiteMin === LIMITE_DO_GITHUB_MIN && de("sem-limite").porOmissao === true, `sem-limite: ${JSON.stringify(de("sem-limite"))}`),
    ...espera(de("limite-expr").estado === "ok" && de("limite-expr").limiteMin === null, `expr: ${JSON.stringify(de("limite-expr"))}`),
    ...espera(de("chama / job").estado === "sem-job" && de("Outro qualquer").estado === "sem-job", "uses / desconhecido"),
  ]);
  caso("limites: dois moldes que casam o mesmo nome sao AMBIGUOS (nunca o primeiro); um molde sem curinga nao casa a matriz", () => {
    const generico = limitesDoWorkflow(`${WORKFLOW(45)}  qualquer:\n    name: \${{ matrix.x }}\n    strategy:\n      matrix:\n        x: [a]\n    timeout-minutes: 9\n    steps:\n      - run: echo\n`);
    const r = limiteDoJob("Guard Suites", generico);
    return [
      ...espera(r.estado === "ambiguo" && r.ids.includes("guard-tests") && r.ids.includes("qualquer"), `ambiguo: ${JSON.stringify(r)}`),
      ...espera(moldeDoNome("Mutation sweep (${{ matrix.modo }})", true).test("Mutation sweep (completa)"), "o curinga casa"),
      // O sufixo ` (a, b)` so num job de MATRIZ: sem ela, `Lint (20)` nao e o `Lint` (pelo codigo, nao por uma regex do teste).
      ...espera(moldeDoNome("Lint", true).test("Lint (20)") && !moldeDoNome("Lint", false).test("Lint (20)"), "o sufixo da matriz"),
    ];
  });
  caso("limites: um job de um workflow CHAMADO (`<chamador> / <job>`) nunca recebe o limite de um curinga deste", () => {
    const w = limitesDoWorkflow("jobs:\n  a:\n    name: \"Deploy ${{ inputs.env }}\"\n    timeout-minutes: 10\n    steps:\n      - run: x\n  deploy:\n    name: Deploy\n    uses: ./.github/workflows/x.yml\n  todos:\n    name: ${{ matrix.x }}\n    strategy:\n      matrix:\n        x: [k]\n    steps:\n      - run: x\n");
    return [
      ...espera(limiteDoJob("Deploy / build", w).estado === "sem-job", `Deploy / build: ${JSON.stringify(limiteDoJob("Deploy / build", w))}`),
      ...espera(limiteDoJob("Deploy prod", w).estado === "ambiguo", `Deploy prod (o 'a' e o curinga 'todos'): ${JSON.stringify(limiteDoJob("Deploy prod", w))}`),
      ...espera(limiteDoJob(undefined, w).estado === "sem-job", "um nome ausente nao casa o curinga"),
    ];
  });
  caso("limites: a matriz e a do `strategy:` (em bloco ou em flow), nao um `matrix:` no `with:` de um passo", () => {
    const w = limitesDoWorkflow("jobs:\n  x:\n    name: X\n    steps:\n      - uses: a/b@v1\n        with:\n          matrix: 1\n  y:\n    name: Y\n    strategy: { matrix: { a: [1] } }\n    steps:\n      - run: x\n");
    return [
      ...espera(limiteDoJob("X (1)", w).estado === "sem-job" && limiteDoJob("X", w).id === "x", `x: ${JSON.stringify(limiteDoJob("X (1)", w))}`),
      ...espera(limiteDoJob("Y (1)", w).id === "y", `y: ${JSON.stringify(limiteDoJob("Y (1)", w))}`),
    ];
  });

  // --- A CLI: o workflow do commit de cada run, as anotacoes, o 404 ---
  const R = "repos/o/r/actions/runs";
  const CT = "repos/o/r/contents/.github/workflows/ci.yml";
  const b64 = (t) => ({ content: Buffer.from(t).toString("base64") });
  const T = (s) => new Date(Date.UTC(2026, 10, 1, 0, 0, s)).toISOString();
  const jobSim = (id, s, conclusion = "success") => ({ id, name: "Simuladores", started_at: T(0), completed_at: T(s), conclusion, steps: [] });
  const doRepo = { path: ".github/workflows/ci.yml" };
  caso("limites (CLI): cada run e julgado pelo workflow do SEU commit (30 num, 45 noutro), lido uma vez por commit", () => {
    const runs = [run(1, "pull_request", { ...doRepo, head_sha: "s30", created_at: "2026-11-01T10:00:00Z" }), run(2, "pull_request", { ...doRepo, head_sha: "s30", created_at: "2026-11-01T11:00:00Z" }), run(3, "pull_request", { ...doRepo, head_sha: "s45", created_at: "2026-11-01T12:00:00Z" })];
    const r = cli({
      [`${R}#1`]: { total_count: 3, workflow_runs: runs },
      [`${R}/1/jobs#1`]: { total_count: 1, jobs: [jobSim(11, 1700)] },
      [`${R}/2/jobs#1`]: { total_count: 1, jobs: [jobSim(12, 600)] },
      [`${R}/3/jobs#1`]: { total_count: 1, jobs: [jobSim(13, 1700)] },
      [`${CT}@s30#1`]: b64(WORKFLOW(30)),
      [`${CT}@s45#1`]: b64(WORKFLOW(45)),
    }, ["--desde", "2026-11-01", "--repo", "o/r"]);
    const pedidos = (sha) => r.log.split("\n").filter((l) => l === `${CT}?ref=${sha}`).length;
    return [
      ...espera(r.status === 0, `saiu ${r.status}: ${r.err}`),
      // 1700 s de 30 min = 94%: avisa; de 45 min = 63%: nao.
      ...espera(/LIMITE: AVISO .*Simuladores: 28m20s de 30m00s \(94%\)/.test(r.out), `sem o aviso do run de 30: ${r.out}`),
      ...espera(!/de 45m00s \(\d+%\) — corte/.test(r.out), `avisou o run de 45: ${r.out}`),
      ...espera(pedidos("s30") === 1 && pedidos("s45") === 1, `pedidos ao workflow: s30 ${pedidos("s30")}, s45 ${pedidos("s45")} (log: ${r.log})`),
    ];
  });
  caso("limites (CLI): um job cortado sai CORTADO pela anotacao; um cancelado por outra razao conta-se a parte", () => {
    const r = cli({
      [`${R}/7#1`]: run(7, "pull_request", { ...doRepo, head_sha: "s30" }),
      [`${R}/7/jobs#1`]: { total_count: 2, jobs: [jobSim(71, 1816, "cancelled"), { ...jobSim(72, 5, "cancelled"), name: "Guard Suites" }] },
      [`${CT}@s30#1`]: b64(WORKFLOW(30)),
      ["repos/o/r/check-runs/71/annotations#1"]: [{ message: "The job has exceeded the maximum execution time of 30m0s" }, { message: "The operation was canceled." }],
      ["repos/o/r/check-runs/72/annotations#1"]: [{ message: "The operation was canceled." }],
    }, ["--run", "7", "--repo", "o/r"]);
    return [
      ...espera(r.status === 0, `saiu ${r.status}: ${r.err}`),
      ...espera(/LIMITE: CORTADO .*Simuladores: cortado aos 30m16s pelo limite de 30m00s/.test(r.out), `sem o CORTADO: ${r.out}`),
      ...espera(/1 job\(s\) cancelado\(s\) sem ser pelo limite/.test(r.out), `sem a contagem do cancelado: ${r.out}`),
      ...espera(!/CORTADO .*Guard Suites/.test(r.out), "o cancelado por outra razao saiu CORTADO"),
    ];
  });
  caso("limites (CLI): um workflow que nao se le (404) e 'nao lido', nunca 360; o --sem-limites nao pede nada", () => {
    const mapa = { [`${R}/7#1`]: run(7, "pull_request", { ...doRepo, head_sha: "sx" }), [`${R}/7/jobs#1`]: { total_count: 1, jobs: [jobSim(71, 100)] } };
    const r = cli(mapa, ["--run", "7", "--repo", "o/r"]);
    const s = cli(mapa, ["--run", "7", "--repo", "o/r", "--sem-limites"]);
    return [
      ...espera(r.status === 0 && /limite nao lido: .*Simuladores — o workflow nao se leu em sx/.test(r.out), `sem o 'nao lido': ${r.status} ${r.out}`),
      ...espera(!/360|6h00|360m/.test(r.out.split("LIMITES")[1] ?? ""), "inventou o 360"),
      ...espera(s.status === 0 && !/LIMITES|LIMITE:/.test(s.out) && !/contents|check-runs/.test(s.log), `--sem-limites: ${s.out} ${s.log}`),
    ];
  });
  caso("limites (CLI): as 'ultimas 5' sao as MAIS RECENTES, com os runs entregues do mais recente para o mais antigo (como a API)", () => {
    // Tres antigos a 1000 s (83% de 20 min) e cinco recentes a 600 s (50%). Sem ordenar pela hora do job, as "ultimas 5"
    // da lista da API seriam as mais ANTIGAS, e a mediana (1000 s) avisava um crescimento que ja nao existe.
    const n = 8;
    const runs = Array.from({ length: n }, (_, k) => run(100 + k, "pull_request", { ...doRepo, head_sha: "s20", created_at: `2026-11-0${1 + Math.floor(k / 4)}T1${k % 4}:00:00Z` })).reverse();
    const jobs = (k) => ({ id: 900 + k, name: "Simuladores", started_at: T(k * 3600), completed_at: T(k * 3600 + (k < 3 ? 1000 : 600)), conclusion: "success", steps: [] });
    const mapa = { [`${R}#1`]: { total_count: n, workflow_runs: runs }, [`${CT}@s20#1`]: b64(WORKFLOW(20)) };
    for (let k = 0; k < n; k++) mapa[`${R}/${100 + k}/jobs#1`] = { total_count: 1, jobs: [jobs(k)] };
    const r = cli(mapa, ["--desde", "2026-11-01", "--repo", "o/r"]);
    return [
      ...espera(r.status === 0, `saiu ${r.status}: ${r.err}`),
      ...espera(/Simuladores: mediana 10m00s, max 16m40s, limite 20m00s/.test(r.out), `a mediana nao e a dos recentes: ${r.out}`),
      ...espera(!/a crescer para o limite/.test(r.out), `avisou o crescimento dos antigos: ${r.out}`),
    ];
  });
  caso("limites (CLI): 100 anotacoes ou mais recusam (a do corte podia estar noutra pagina)", () => {
    const r = cli({
      [`${R}/7#1`]: run(7, "pull_request", { ...doRepo, head_sha: "s30" }),
      [`${R}/7/jobs#1`]: { total_count: 1, jobs: [jobSim(71, 1816, "cancelled")] },
      [`${CT}@s30#1`]: b64(WORKFLOW(30)),
      ["repos/o/r/check-runs/71/annotations#1"]: Array.from({ length: 100 }, () => ({ message: "::warning:: x" })),
    }, ["--run", "7", "--repo", "o/r"]);
    return [...espera(r.status !== 0 && /100 anotacoes ou mais/.test(r.err), `saiu ${r.status}: ${r.err}`), ...espera(/annotations\?per_page=100/.test(r.log), `o pedido nao leva per_page=100: ${r.log}`)];
  });
  caso("limites (CLI): anotacoes que nao sao uma lista recusam (nunca um zero falso)", () => {
    const r = cli({
      [`${R}/7#1`]: run(7, "pull_request", { ...doRepo, head_sha: "s30" }),
      [`${R}/7/jobs#1`]: { total_count: 1, jobs: [jobSim(71, 1816, "cancelled")] },
      [`${CT}@s30#1`]: b64(WORKFLOW(30)),
      ["repos/o/r/check-runs/71/annotations#1"]: { message: "Not Found" },
    }, ["--run", "7", "--repo", "o/r"]);
    return [...espera(r.status !== 0 && /anotacoes do job 71 .* nao sao uma lista/.test(r.err), `saiu ${r.status}: ${r.err}`)];
  });
}
