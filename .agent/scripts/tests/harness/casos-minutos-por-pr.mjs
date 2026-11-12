/**
 * Os casos do custo por PR e do `--todos` do `minutos-ci` (#517) — {{PROJECT_NAME}}
 *
 * Sairam do `test-minutos-ci.mjs` pelo tamanho (as 500 linhas). NAO e uma suite nem um modulo descoberto: a suite
 * chama `registarPorPr` com os seus ajudantes (o `caso`, o `gh` falso, as fixtures da conta). Sem sitios de recusa:
 * so regista.
 */
import { celula, custoPorTipo, prDoRun, tipoDoRun } from "../../lib/minutos-por-pr.mjs";
import { temGuardTests } from "../../lib/modo-upgrade.mjs";

export function registarPorPr({ caso, espera, cli, conta, ITEM, run, job }) {
  // --- O custo por PR (#517) ---
  const PR = (n, extra = {}) => ({ event: "pull_request", pull_requests: [{ number: n }], actor: { login: "alguem" }, ...extra });
  caso("tipoDoRun: a marca faz o upgrade; so .md e docs; o bot e o Dependabot; sem numero e sem-pr; um push fica de fora", () => [
    ...espera(tipoDoRun(PR(1), 1, [".agent/.template-version", "README.md"]) === "upgrade", "um PR que mexe na marca devia ser upgrade"),
    ...espera(tipoDoRun(PR(1), 1, ["README.md", "src/docs/x.md"]) === "docs", "um PR so de .md devia ser docs"),
    ...espera(tipoDoRun(PR(1), 1, ["src/app.ts", "README.md"]) === "normal", "um PR com codigo devia ser normal"),
    ...espera(tipoDoRun(PR(1, { actor: { login: "dependabot[bot]" } }), 1, null) === "dependabot", "um PR do bot devia ser dependabot"),
    ...espera(tipoDoRun({ event: "dynamic" }, null, null) === "dynamic", "o dynamic"),
    ...espera(tipoDoRun({ event: "pull_request", pull_requests: [] }, null, null) === "sem-pr", "sem numero devia ser sem-pr"),
    ...espera(tipoDoRun({ event: "push" }, null, null) === null, "um push devia ficar fora"),
    ...espera(tipoDoRun(PR(1), 1, []) === "normal", "um PR sem ficheiros nao e docs (every de uma lista vazia)"),
  ]);
  caso("CONTROLO: 'upgrade' no titulo ou no branch, sem mexer na marca, e um PR normal", () =>
    espera(tipoDoRun(PR(1, { display_title: "chore: upgrade do template", head_branch: "chore/upgrade-template" }), 1, ["src/app.ts"]) === "normal", "adivinhou pelo titulo"));
  caso("prDoRun: o do run primeiro; vazio, pelo branch nos PRs do repo (o mais recente ate ao run); sem par, null", () => {
    const prs = [{ number: 3, head: { ref: "fix/x" }, created_at: "2026-10-01T00:00:00Z" }, { number: 9, head: { ref: "fix/x" }, created_at: "2026-11-02T00:00:00Z" }, { number: 12, head: { ref: "fix/x" }, created_at: "2026-11-20T00:00:00Z" }];
    const r = (extra) => ({ event: "pull_request", pull_requests: [], head_branch: "fix/x", created_at: "2026-11-05T00:00:00Z", ...extra });
    return [
      ...espera(prDoRun(r({ pull_requests: [{ number: 7 }] }), prs) === 7, "o numero do proprio run devia vencer"),
      ...espera(prDoRun(r(), prs) === 9, `pelo branch: ${prDoRun(r(), prs)}, esperava 9 (o 12 e depois do run, o 3 e mais antigo)`),
      ...espera(prDoRun(r({ head_branch: "outro" }), prs) === null, "sem PR do branch devia ser null"),
      ...espera(prDoRun(r({ event: "push" }), prs) === null, "um push nao tem PR"),
    ];
  });
  caso("custoPorTipo e celula: a mediana com n, 'sem amostra', o dynamic pelo total com as falhadas, e um em curso fora", () => {
    const l = (tipo, cobrado, extra = {}) => ({ tipo, cobrado, jobs: 1, concluido: true, conclusao: "success", ...extra });
    const c = custoPorTipo([l("normal", 2), l("normal", 4), l("normal", 9, { concluido: false }), l("dynamic", 2, { conclusao: "failure" }), l("dynamic", 1), l("upgrade", 8, { jobs: 5 }), l(null, 3)]);
    return [
      ...espera(celula("normal", c.normal) === "3 min (n=2)", `normal: ${celula("normal", c.normal)}`),
      ...espera(celula("dependabot", c.dependabot) === "sem amostra", `dependabot: ${celula("dependabot", c.dependabot)}`),
      ...espera(celula("dynamic", c.dynamic) === "3 min (n=2; 1 falhadas: 2 min)", `dynamic: ${celula("dynamic", c.dynamic)}`),
      ...espera(celula("upgrade", c.upgrade) === "8 min (n=1; 5 jobs)", `upgrade: ${celula("upgrade", c.upgrade)}`),
      ...espera(c.outros.n === 1 && c.outros.total === 3, `outros: ${JSON.stringify(c.outros)}`),
    ];
  });

  const U = "/users/eu/settings/billing/usage";
  // A CLI: um privado com um mes de runs de cada tipo.
  const RP = "repos/eu/priv/actions/runs";
  const b64 = (t) => ({ content: Buffer.from(t).toString("base64"), encoding: "base64" });
  const MARCA_P = "repos/eu/priv/contents/.agent/.template-version#1";
  const CI_P = "repos/eu/priv/contents/.github/workflows/ci.yml#1";
  const jobsDe = (id, ...ss) => ({ [`${RP}/${id}/jobs#1`]: { total_count: ss.length, jobs: ss.map((x) => job(x)) } });
  const MES_PR = {
    ...conta([ITEM("priv", 50)], { priv: true }),
    [MARCA_P]: b64("versao: v1\nmodo: parcial\n"),
    [`${RP}#1`]: { total_count: 7, workflow_runs: [
      run(1, "pull_request", { pull_requests: [{ number: 5 }], actor: { login: "eu" } }),
      run(2, "pull_request", { pull_requests: [{ number: 6 }], actor: { login: "eu" } }),
      run(3, "pull_request", { pull_requests: [{ number: 7 }], actor: { login: "eu" } }),
      run(4, "pull_request", { pull_requests: [{ number: 8 }], actor: { login: "dependabot[bot]" } }),
      run(5, "dynamic", { conclusion: "failure" }),
      run(6, "dynamic"),
      run(7, "push"),
    ] },
    ...jobsDe(1, 61, 8), ...jobsDe(2, 30), ...jobsDe(3, 20), ...jobsDe(4, 40), ...jobsDe(5, 61), ...jobsDe(6, 30), ...jobsDe(7, 30),
    "repos/eu/priv/pulls/5/files#1": [{ filename: ".agent/.template-version" }, { filename: ".agent/scripts/x.mjs" }],
    "repos/eu/priv/pulls/6/files#1": [{ filename: "src/app.ts" }],
    "repos/eu/priv/pulls/7/files#1": [{ filename: "README.md" }],
  };
  const linhaDe = (r, rotulo) => r.out.split("\n").find((x) => x.trim().startsWith(rotulo))?.trim().replace(/\s+/g, " ") ?? "";
  caso("--quota --por-pr: o modo da marca e cada tipo na sua linha, com o que fica fora das colunas", () => {
    const r = cli(MES_PR, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [
      ...espera(r.status === 0, `saiu ${r.status}: ${r.err}`),
      ...espera(/^ {2}priv \(modo parcial\)$/m.test(r.out), `modo: ${r.out}`),
      ...espera(linhaDe(r, "upgrade") === "upgrade 3 min (n=1; 2 jobs)", `upgrade: ${linhaDe(r, "upgrade")}`),
      ...espera(linhaDe(r, "PR normal") === "PR normal 1 min (n=1)", `normal: ${linhaDe(r, "PR normal")}`),
      ...espera(linhaDe(r, "PR Dependabot") === "PR Dependabot 1 min (n=1)", `PR Dependabot: ${linhaDe(r, "PR Dependabot")}`),
      ...espera(linhaDe(r, "Dependabot (dynamic)") === "Dependabot (dynamic) 3 min (n=2; 1 falhadas: 2 min)", `dynamic: ${linhaDe(r, "Dependabot (dynamic)")}`),
      ...espera(/fora das colunas: so docs 1 run\(s\), 1 min; outros eventos \(push, agendados\) 1 run\(s\), 1 min/.test(r.out), `fora: ${r.out}`),
      ...espera(!/pulls\/8\/files/.test(r.log), "leu os ficheiros de um PR do Dependabot (nao precisa)"),
      ...espera(/created=2020-01-01\.\.2020-01-31/.test(r.log), `o mes nao vai no pedido: ${r.log}`),
    ];
  });
  caso("--quota --por-pr: o modo sem a linha `modo:` vem do guard-tests do ci.yml; sem marca, 'sem marca'; sem runs, 'sem amostra'", () => {
    const vazio = { [`${RP}#1`]: { total_count: 0, workflow_runs: [] } };
    const semModo = cli({ ...conta([ITEM("priv", 5)], { priv: true }), ...vazio, [MARCA_P]: b64("versao: v1\n"), [CI_P]: b64("jobs:\n  guard-tests:\n    runs-on: x\n") }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    const semMarca = cli({ ...conta([ITEM("priv", 5)], { priv: true }), ...vazio }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [
      ...espera(/priv \(modo completo\)/.test(semModo.out), `sem modo: ${semModo.out} ${semModo.err}`),
      ...espera(/priv \(modo sem marca\)/.test(semMarca.out), `sem marca: ${semMarca.out} ${semMarca.err}`),
      ...espera(linhaDe(semMarca, "PR normal") === "PR normal sem amostra", `sem runs: ${linhaDe(semMarca, "PR normal")}`),
    ];
  });
  caso("--quota --por-pr: um run de PR sem `pull_requests` (branch apagado) acha o PR pelo branch; com todos, nao le a lista", () => {
    const semNum = { ...MES_PR, [`${RP}#1`]: { total_count: 1, workflow_runs: [run(2, "pull_request", { pull_requests: [], head_branch: "feat/y", actor: { login: "eu" } })] },
      "repos/eu/priv/pulls#1": [{ number: 6, head: { ref: "feat/y" }, created_at: "2019-12-30T00:00:00Z", updated_at: "2020-01-02T00:00:00Z" }] };
    const r = cli(semNum, ["--quota", "--por-pr", "--mes", "2020-01"]);
    const todos = cli(MES_PR, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [
      ...espera(linhaDe(r, "PR normal") === "PR normal 1 min (n=1)" && !/sem o numero do PR/.test(r.out), `pelo branch: ${r.out} ${r.err}`),
      ...espera(!/pulls\?state=all/.test(todos.log), "leu a lista dos PRs sem precisar"),
    ];
  });
  caso("--quota --por-pr: uma contradicao do modo diz o porque (a linha `modo:` com um comentario, #508)", () => {
    const r = cli({ ...MES_PR, [MARCA_P]: b64("modo: parcial (decidido em outubro)\n") }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return espera(/priv \(modo contradicao: a marca diz `modo: parcial \(decidido em outubro\)`/.test(r.out), `saida: ${r.out}`);
  });
  caso("recusa --por-pr: os ficheiros de um PR com erro (500) — sai != 0 e diz em que, sem a linha desse repo", () => {
    const r = cli({ ...MES_PR, "repos/eu/priv/pulls/6/files#1": "ERRO500" }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [...espera(r.status !== 0, `saiu ${r.status}`), ...espera(/o gh falhou em repos\/eu\/priv\/pulls\/6\/files/.test(r.err), `stderr: ${r.err}`), ...espera(!/PR normal/.test(r.out), "imprimiu a linha do repo")];
  });
  caso("recusa --por-pr: a marca com outro erro (500), e uma resposta sem `content`", () => {
    const e500 = cli({ ...MES_PR, [MARCA_P]: "ERRO500" }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    const semC = cli({ ...MES_PR, [MARCA_P]: { name: "x" } }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [...espera(e500.status !== 0 && /o gh falhou a ler \.agent\/\.template-version de eu\/priv/.test(e500.err), `500: ${e500.err}`), ...espera(semC.status !== 0 && /nao traz o `content`/.test(semC.err), `sem content: ${semC.err}`)];
  });
  caso("CONTROLO: sem --por-pr, o --quota nao le runs nem a marca", () => {
    const r = cli(MES_PR, ["--quota", "--mes", "2020-01"]);
    return espera(r.status === 0 && !/actions\/runs|contents/.test(r.log) && !/custo por PR/.test(r.out), `log: ${r.log}`);
  });

  // O `--todos`: um bloco por privado, o total geral; o publico nao se le.
  const RQ = "repos/eu/outro/actions/runs";
  const DOIS = {
    ...conta([ITEM("priv", 5), ITEM("outro", 5), ITEM("pub", 5)], { priv: true, outro: true, pub: false }),
    [`${RP}#1`]: { total_count: 1, workflow_runs: [run(1)] }, ...jobsDe(1, 61),
    [`${RQ}#1`]: { total_count: 1, workflow_runs: [run(9)] }, [`${RQ}/9/jobs#1`]: { total_count: 1, jobs: [job(30)] },
  };
  caso("--desde --todos: um bloco por repo privado com o subtotal, e o total geral; o publico fica de fora", () => {
    const r = cli(DOIS, ["--desde", "2020-01-01", "--ate", "2020-01-31", "--todos"]);
    return [
      ...espera(r.status === 0, `saiu ${r.status}: ${r.err}`),
      ...espera(/=== eu\/outro ===/.test(r.out) && /=== eu\/priv ===/.test(r.out), `blocos: ${r.out}`),
      ...espera(/TOTAL de 2 repo\(s\) privado\(s\), 2020-01-01 a 2020-01-31: 3 min cobrados/.test(r.out), `total: ${r.out}`),
      ...espera(!/repos\/eu\/pub\/actions/.test(r.log), "leu os runs do repo publico"),
    ];
  });
  caso("--todos: os meses do intervalo vao todos a faturacao (um repo so de janeiro entra num --desde de janeiro)", () => {
    const r = cli({ ...DOIS, "/users/eu/settings/billing/usage#1": { usageItems: [ITEM("priv", 5)] } }, ["--desde", "2020-01-15", "--ate", "2020-02-10", "--todos"]);
    return espera(/month=1\b/.test(r.log) && /month=2\b/.test(r.log), `log: ${r.log}`);
  });
  caso("CONTROLO: sem --todos, um so repo, e sem a faturacao", () => {
    const r = cli(DOIS, ["--desde", "2020-01-01", "--repo", "eu/priv"]);
    return espera(r.status === 0 && !/billing/.test(r.log) && !/===/.test(r.out) && /COBRADO 2 min/.test(r.out), `saida: ${r.out} log: ${r.log}`);
  });

  // --- Da leitura independente do #517 ---
  caso("recusa --por-pr: a lista dos ficheiros de um PR que nao e uma lista — a recusa com mensagem, e nao um TypeError", () => {
    const r = cli({ ...MES_PR, "repos/eu/priv/pulls/6/files#1": { message: "x" } }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [...espera(r.status !== 0 && /a resposta dos ficheiros do PR 6 de eu\/priv nao e uma lista/.test(r.err), `stderr: ${r.err}`), ...espera(!/PR normal/.test(r.out), "imprimiu a linha do repo")];
  });
  // A lista dos PRs: do mais recente para tras, e para na pagina que ja tem um PR anterior ao mes.
  const pr = (n, ref, upd) => ({ number: n, head: { ref }, created_at: "2019-12-01T00:00:00Z", updated_at: upd });
  const umSemNumero = (extra) => ({ ...MES_PR, [`${RP}#1`]: { total_count: 1, workflow_runs: [run(2, "pull_request", { pull_requests: [], head_branch: "feat/y", actor: { login: "eu" } })] }, ...extra });
  caso("--por-pr: o PR do branch na 2.a pagina da lista e lido; o pedido e `sort=updated&direction=desc`", () => {
    const pag1 = Array.from({ length: 100 }, (_, i) => pr(100 + i, `outro/${i}`, "2020-01-20T00:00:00Z"));
    const r = cli(umSemNumero({ "repos/eu/priv/pulls#1": pag1, "repos/eu/priv/pulls#2": [pr(6, "feat/y", "2020-01-02T00:00:00Z")] }), ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [...espera(linhaDe(r, "PR normal") === "PR normal 1 min (n=1)", `pagina 2: ${r.out} ${r.err}`), ...espera(/pulls\?state=all&sort=updated&direction=desc&per_page=100&page=2/.test(r.log), `pedido: ${r.log}`)];
  });
  caso("CONTROLO: uma pagina cheia que ja tem um PR anterior ao mes para ali (a seguinte nao se pede)", () => {
    const pag1 = [...Array.from({ length: 99 }, (_, i) => pr(100 + i, `outro/${i}`, "2020-01-20T00:00:00Z")), pr(6, "feat/y", "2019-12-15T00:00:00Z")];
    const r = cli(umSemNumero({ "repos/eu/priv/pulls#1": pag1 }), ["--quota", "--por-pr", "--mes", "2020-01"]);
    return espera(r.status === 0 && !/pulls\?[^\n]*page=2/.test(r.log), `pediu a pagina 2: ${r.log} ${r.err}`);
  });
  caso("--todos: a passagem do ano (dezembro e janeiro vao os dois a faturacao)", () => {
    const r = cli({ ...DOIS, "/users/eu/settings/billing/usage#1": { usageItems: [ITEM("priv", 5)] } }, ["--desde", "2019-12-20", "--ate", "2020-01-05", "--todos"]);
    return espera(/year=2019&month=12\b/.test(r.log) && /year=2020&month=1\b/.test(r.log), `log: ${r.log}`);
  });
  caso("--por-pr: um repo desconhecido (404) conta na quota e fica FORA do custo por PR, sem lhe ler os runs", () => {
    const r = cli({ ...MES_PR, [`${U}#1`]: { usageItems: [ITEM("priv", 50), ITEM("foi", 5)] } }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [...espera(r.status === 0 && /FORA: foi \(nao o encontrei/.test(r.out), `saida: ${r.out} ${r.err}`), ...espera(!/repos\/eu\/foi\/(actions|contents)/.test(r.log), "leu os runs ou a marca de um repo 404")];
  });
  caso("--por-pr: dois workflows com pull_request nas mesmas colunas — di-lo (como o run a run)", () => {
    const m = { ...MES_PR, [`${RP}#1`]: { total_count: 2, workflow_runs: [run(2, "pull_request", { pull_requests: [{ number: 6 }], actor: { login: "eu" } }), run(3, "pull_request", { name: "CodeQL", pull_requests: [{ number: 6 }], actor: { login: "eu" } })] }, ...jobsDe(3, 20) };
    const r = cli(m, ["--quota", "--por-pr", "--mes", "2020-01"]);
    const so = cli(MES_PR, ["--quota", "--por-pr", "--mes", "2020-01"]);
    // Um CodeQL so EM CURSO nao entra nas colunas: nao mistura nada (segunda leitura do #517).
    const emCurso = cli({ ...m, [`${RP}#1`]: { total_count: 2, workflow_runs: [run(2, "pull_request", { pull_requests: [{ number: 6 }], actor: { login: "eu" } }), run(3, "pull_request", { name: "CodeQL", status: "in_progress", conclusion: null, pull_requests: [{ number: 6 }], actor: { login: "eu" } })] } }, ["--quota", "--por-pr", "--mes", "2020-01"]);
    return [...espera(/mistura 2 workflows nas colunas dos PRs: CI, CodeQL/.test(r.out), `saida: ${r.out} ${r.err}`), ...espera(!/mistura/.test(so.out), "CONTROLO: um so workflow nao devia avisar"), ...espera(!/mistura/.test(emCurso.out), `um CodeQL em curso nao entra nas colunas: ${emCurso.out}`)];
  });
  caso("temGuardTests: a mesma leitura da 2b — comentado nao conta, um comentario na linha conta, sem corpo nao conta", () => [
    ...espera(temGuardTests("jobs:\n  guard-tests:   # suites\n    runs-on: x\n"), "com um comentario na linha"),
    ...espera(!temGuardTests("jobs:\n  # guard-tests:\n  #   runs-on: x\n"), "comentado"),
    ...espera(!temGuardTests("jobs:\n  ci:\n    runs-on: x\n  guard-tests:"), "sem corpo, no fim"),
    ...espera(!temGuardTests(null), "sem ci.yml"),
  ]);
}
