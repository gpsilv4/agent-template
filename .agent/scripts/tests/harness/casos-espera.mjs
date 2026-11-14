/**
 * Os casos da ESPERA de um PR (#554): `lib/espera-ci.mjs` (puro) e o `minutos-ci --espera` contra o `gh` falso da suite.
 * Chamados no lugar pelo `test-minutos-ci.mjs` (o ficheiro dele esta perto das 500 linhas).
 *
 * Cada decisao da Fase 0 tem a sua prova e o seu controlo: a espera ate ao ultimo job QUE CORREU desta tentativa; os
 * `cancelled` fora da mediana; o corte no `created_at` com `>=` na fronteira; o grupo da maquinaria dito quando falta.
 */
import { GRUPO_POR_OMISSAO, doWorkflow, ehDoGrupo, esperaDoRun, jobsDaTentativa, linhasDaEspera, pelosDoisLados, resumo, variacao } from "../../lib/espera-ci.mjs";

const T = (s) => new Date(Date.UTC(2026, 10, 1, 10, 0, s)).toISOString();
const job = (nome, fim, extra = {}) => ({ name: nome, started_at: T(5), completed_at: T(fim), conclusion: "success", ...extra });
const MAQ = "Mutation sweep (completa 1/3)";

export function registarEspera({ caso, espera, cli, run }) {
  // --- A espera de um run ---
  caso("espera: do run_started_at ao fim do ultimo job que CORREU (um skipped mais tarde nao conta)", () => {
    const r = { run_started_at: T(0) };
    const s = esperaDoRun(r, [job("A", 600), job("B", 900, { conclusion: "skipped" })]);
    // O skipped acaba aos 900 s: se contasse, a espera era 900 (o controlo do P1).
    return espera(s === 600, `deu ${s}, esperava 600`);
  });
  caso("espera: numa re-tentativa contam so os jobs DESTA tentativa", () => {
    const r = { run_started_at: T(0), run_attempt: 2 };
    const jobs = [job("A", 2000, { run_attempt: 1 }), job("A", 700, { run_attempt: 2 })];
    // O job da 1.a tentativa acaba aos 2000 s: sem o filtro, a espera era 2000 (o controlo do P4).
    return [...espera(esperaDoRun(r, jobs) === 700, `deu ${esperaDoRun(r, jobs)}, esperava 700`), ...espera(jobsDaTentativa(r, jobs).length === 1, "o filtro da tentativa nao filtrou")];
  });
  caso("espera: sem run_started_at, ou sem nenhum job que correu, e null (nunca 0)", () => [
    ...espera(esperaDoRun({}, [job("A", 60)]) === null, "sem run_started_at devia ser null"),
    ...espera(esperaDoRun({ run_started_at: T(0) }, [job("A", 60, { conclusion: "skipped" })]) === null, "so com skipped devia ser null"),
    // O `segundos` da 0 a um fim antes do inicio: um 0 medido entrava na mediana (o controlo: sem o `s > 0`, da 0).
    ...espera(esperaDoRun({ run_started_at: T(100) }, [job("A", 60)]) === null, `um fim antes do inicio deu ${esperaDoRun({ run_started_at: T(100) }, [job("A", 60)])}`),
  ]);
  caso("espera: o grupo e um job com o prefixo QUE CORREU, de qualquer tentativa", () => [
    ...espera(ehDoGrupo([job(MAQ, 60, { run_attempt: 1 })], GRUPO_POR_OMISSAO), "a perna completa que correu nao contou"),
    ...espera(!ehDoGrupo([job(MAQ, 60, { conclusion: "skipped" })], GRUPO_POR_OMISSAO), "uma perna saltada contou"),
    ...espera(!ehDoGrupo([job("Mutation sweep (skips 1/1)", 60)], GRUPO_POR_OMISSAO), "a skips contou como completa"),
  ]);
  caso("espera: o corte no created_at — igual vai para o DEPOIS, um minuto antes para o ANTES", () => {
    const { antes, depois } = pelosDoisLados([{ id: 1, created_at: "2026-11-13T17:55:00Z" }, { id: 2, created_at: "2026-11-13T17:54:00Z" }], "2026-11-13T17:55:00Z");
    return espera(depois.length === 1 && depois[0].id === 1 && antes.length === 1 && antes[0].id === 2, `antes ${JSON.stringify(antes)} depois ${JSON.stringify(depois)}`);
  });
  caso("espera: um created_at que nao se le vai para o semData (nunca some dos dois lados calado)", () => {
    const { antes, depois, semData } = pelosDoisLados([{ id: 1 }, { id: 2, created_at: "2026-11-13T18:00:00Z" }], "2026-11-13T17:55:00Z");
    return espera(semData.length === 1 && semData[0].id === 1 && antes.length === 0 && depois.length === 1, `semData ${JSON.stringify(semData)}`);
  });
  caso("espera: so os runs de PR do workflow pedido (um push do mesmo workflow fica fora)", () => {
    const rs = [{ id: 1, event: "pull_request", path: "a.yml" }, { id: 2, event: "push", path: "a.yml" }, { id: 3, event: "pull_request", path: "b.yml" }];
    return espera(doWorkflow(rs, "a.yml").map((r) => r.id).join() === "1", `deu ${doWorkflow(rs, "a.yml").map((r) => r.id)}`);
  });
  caso("espera: a variacao e null quando um lado nao tem amostra (nunca uma conta com null)", () => [
    ...espera(variacao(null, 600) === null && variacao(600, null) === null, "uma variacao com um lado vazio"),
    ...espera(variacao(1000, 800) === -20, `deu ${variacao(1000, 800)}`),
    ...espera(resumo([]).n === 0 && resumo([]).mediana === null, "o resumo vazio"),
  ]);

  // --- As linhas do relatorio ---
  const doCi = { event: "pull_request", path: ".github/workflows/ci.yml", status: "completed", conclusion: "success", run_started_at: T(0) };
  const linha = (id, criado, fim, extra = {}, jobs = [job(MAQ, fim)]) => ({ r: { id, created_at: criado, pull_requests: [{ number: id }], ...doCi, ...extra }, jobs });
  const corre = (linhas, o = {}) => linhasDaEspera({ alvo: "o/r", workflow: ".github/workflows/ci.yml", grupo: GRUPO_POR_OMISSAO, ultimos: 5, corte: null, numeroDoPr: (r) => r.pull_requests?.[0]?.number ?? null, linhas, ...o });
  caso("espera: um run CANCELADO (a concurrency) fica fora e e contado; a mediana nao desce", () => {
    const out = corre([linha(1, T(0), 1500), linha(2, T(1), 1800), linha(4, T(3), 30, { conclusion: "cancelled" })]).join("\n");
    // Se o cancelado de 30 s entrasse, a mediana descia de 27,5 (1500 e 1800) para 25,0 min (30, 1500 e 1800): o controlo do P2.
    return [...espera(/cancelados \(fora, a concurrency\): 1;/.test(out), `sem a contagem: ${out}`), ...espera(/mediana 27\.5 min \(n=2;/.test(out), `a mediana mudou: ${out}`)];
  });
  caso("espera: um timed_out e um em curso ficam fora com o SEU nome (nao sao a concurrency)", () => {
    const out = corre([linha(1, T(0), 1500), linha(2, T(1), 30, { conclusion: "timed_out" }), linha(3, T(2), 30, { status: "in_progress", conclusion: null })]).join("\n");
    return [
      ...espera(/cancelados \(fora, a concurrency\): 0;/.test(out), `o timed_out contou como cancelado: ${out}`),
      ...espera(/outras conclusoes \(fora\): 1;/.test(out), `sem as outras conclusoes: ${out}`),
      ...espera(/em curso \(fora\): 1;/.test(out), `sem os em curso: ${out}`),
      ...espera(/1 run\(s\) medido\(s\)/.test(out), `entrou um que nao acabou bem: ${out}`),
    ];
  });
  caso("espera: so o workflow pedido (um CodeQL com pull_request fica fora)", () => {
    const out = corre([linha(1, T(0), 1500), linha(2, T(1), 60, { path: ".github/workflows/codeql.yml" })]).join("\n");
    return espera(/1 run\(s\) medido\(s\)/.test(out), `entrou o outro workflow: ${out}`);
  });
  caso("espera: sem nenhum job do grupo, uma linha DIZ-O (nunca 'sem amostra' calado)", () => {
    const out = corre([linha(1, T(0), 600, {}, [job("Guard Suites", 600)])]).join("\n");
    return espera(/nenhum job "Mutation sweep \(completa" em 1 run/.test(out), `sem a linha: ${out}`);
  });
  caso("espera: sem nenhum run medido, a linha do grupo NAO culpa o prefixo", () => {
    const out = corre([linha(1, T(0), 30, { conclusion: "cancelled" })]).join("\n");
    return [...espera(!/nenhum job/.test(out), `culpou o prefixo sem runs: ${out}`), ...espera(/0 run\(s\) medido\(s\)/.test(out), `o cabecalho: ${out}`)];
  });
  caso("espera: o corte da as duas medianas e a variacao, e marca a amostra pequena", () => {
    const out = corre([linha(1, "2026-11-13T12:00:00Z", 1800), linha(2, "2026-11-13T18:00:00Z", 1500)], { corte: "2026-11-13T17:55" }).join("\n");
    return [
      ...espera(/antes 30\.0 min \(n=1\) -> depois 25\.0 min \(n=1\); -17%/.test(out), `a variacao: ${out}`),
      ...espera(/amostra pequena: n=1 antes, 1 depois, < 5/.test(out), `sem a marca da amostra pequena: ${out}`),
    ];
  });

  // --- A CLI: as recusas, cada uma pela sua mensagem (o P6) ---
  for (const [nome, args, msg] of [
    ["o --espera com o --run", ["--espera", "--run", "7", "--repo", "o/r"], /o `--espera` e a espera dos PRs de UM repo/],
    ["o --espera com o --todos", ["--espera", "--desde", "2026-11-01", "--todos"], /o `--espera` e a espera dos PRs de UM repo/],
    ["o --corte sem o --espera", ["--desde", "2026-11-01", "--corte", "2026-11-02T10:00", "--repo", "o/r"], /o `--corte` so com o `--espera`/],
    ["o --ultimos que nao e um inteiro positivo", ["--espera", "--desde", "2026-11-01", "--ultimos", "0", "--repo", "o/r"], /--ultimos quer um inteiro positivo/],
    ["um --corte sem hora", ["--espera", "--desde", "2026-11-01", "--corte", "2026-11-02", "--repo", "o/r"], /--corte quer AAAA-MM-DDTHH:MM em UTC/],
    ["um --corte no futuro", ["--espera", "--desde", "2026-11-01", "--corte", "2099-01-01T00:00", "--repo", "o/r"], /--corte 2099-01-01T00:00 esta no futuro/],
    ["um --corte antes do --desde", ["--espera", "--desde", "2026-11-10", "--corte", "2026-11-01T00:00", "--repo", "o/r"], /--corte 2026-11-01T00:00 vem antes do --desde 2026-11-10/],
    ["um --corte depois do --ate", ["--espera", "--desde", "2026-11-01", "--ate", "2026-11-05", "--corte", "2026-11-06T00:00", "--repo", "o/r"], /--corte 2026-11-06T00:00 vem depois do --ate 2026-11-05/],
    ["um --grupo vazio", ["--espera", "--desde", "2026-11-01", "--grupo", "", "--repo", "o/r"], /--grupo vazio/],
  ]) {
    caso(`espera (CLI): ${nome} recusa, pela sua mensagem`, () => {
      const r = cli({}, args);
      return [...espera(r.status !== 0, `saiu ${r.status}`), ...espera(msg.test(r.err), `a mensagem: ${r.err}`)];
    });
  }
  caso("espera (CLI): os runs do repo, o numero do PR pelo branch quando o run nao o traz", () => {
    const R = "repos/o/r/actions/runs";
    const runs = [run(1, "pull_request", { ...doCi, created_at: "2026-11-01T10:00:00Z", head_branch: "fix/x", pull_requests: [] })];
    const r = cli({
      [`${R}#1`]: { total_count: 1, workflow_runs: runs },
      [`${R}/1/jobs#1`]: { total_count: 1, jobs: [job(MAQ, 900)] },
      ["repos/o/r/pulls#1"]: [{ number: 42, head: { ref: "fix/x" }, created_at: "2026-11-01T09:00:00Z", updated_at: "2026-11-01T11:00:00Z" }],
    }, ["--espera", "--desde", "2026-11-01", "--repo", "o/r"]);
    return [...espera(r.status === 0, `saiu ${r.status}: ${r.err}`), ...espera(/\s42\s+2026-11-01T10:00\s+15\.0 min/.test(r.out), `sem o PR pelo branch: ${r.out}`)];
  });
  caso("espera (CLI): os jobs so dos runs que entram (um push, o CodeQL e um cancelado nao gastam pedidos)", () => {
    const R = "repos/o/r/actions/runs";
    const runs = [
      run(1, "pull_request", { ...doCi, pull_requests: [{ number: 7 }] }),
      run(2, "push", { ...doCi, event: "push" }),
      run(3, "pull_request", { ...doCi, path: ".github/workflows/codeql.yml" }),
      run(4, "pull_request", { ...doCi, conclusion: "cancelled" }),
    ];
    // So o run 1 tem jobs no gh falso: um pedido aos outros e um 404, e o `minutos-ci` falha.
    const r = cli({ [`${R}#1`]: { total_count: 4, workflow_runs: runs }, [`${R}/1/jobs#1`]: { total_count: 1, jobs: [job(MAQ, 900)] } }, ["--espera", "--desde", "2026-11-01", "--repo", "o/r"]);
    return [...espera(r.status === 0, `saiu ${r.status}: ${r.err}`), ...espera(/1 run\(s\) medido\(s\); cancelados \(fora, a concurrency\): 1;/.test(r.out), `o cabecalho: ${r.out}`)];
  });
  caso("espera (CLI): um --workflow sem runs de PR falha ALTO e diz os que ha (nunca um zero calado)", () => {
    const R = "repos/o/r/actions/runs";
    const r = cli({ [`${R}#1`]: { total_count: 1, workflow_runs: [run(1, "pull_request", { ...doCi, path: ".github/workflows/ci.yaml" })] } }, ["--espera", "--desde", "2026-11-01", "--repo", "o/r"]);
    return [...espera(r.status !== 0, `saiu ${r.status}: ${r.out}`), ...espera(/os workflows com runs de PR sao \.github\/workflows\/ci\.yaml/.test(r.err), `a mensagem: ${r.err}`)];
  });
}
