/**
 * Os casos do MODO COMPLETO do exemplo de CI barato (#472, #477) — {{PROJECT_NAME}}
 *
 * O exemplo (`src/docs/exemplos/ci-sem-maquinaria.yml`) serve um derivado SEM a maquinaria do template; com ela (o
 * `/upgrade` completo), o derivado descomenta os dois blocos MODO COMPLETO: (a) o passo dos guards dos docs no job
 * `ci`, e (b) o job `guard-tests`, que so arranca num PR que toca a maquinaria. O (b) e um JOB, e nao um passo, porque
 * e por ele que o `/upgrade` reconhece o modo completo (`lib/modo-upgrade.mjs`), e a 2b le os verificadores nele
 * (#477): por isso os casos leem o exemplo descomentado pelos leitores REAIS da 2b, num `ci.yml` em disco.
 * NAO e uma suite nem um modulo descoberto: a `test-ci-exemplo.mjs` importa-o e chama `casosDoModoCompleto` com o
 * `caso` dela e os seus leitores. Sem sitios de recusa: so regista.
 */
import { chmodSync, writeFileSync, mkdirSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { conjuntos, passosDoExemplo, semJob } from "./expressoes-ci.mjs";
import { comModoCompleto } from "../../lib/exemplo-ci.mjs";
import { defeitosDeEstrutura, jobsDe, passosDe } from "../../lib/estrutura-workflow.mjs";
import { comandosPorJob } from "../../lib/medida-upgrade.mjs";
import { notasDaFormaDoCi } from "../../lib/medida-upgrade-ci.mjs";
import { modoDoProjeto } from "../../lib/modo-upgrade.mjs";

/** As suites de um passo `suites-em-paralelo.mjs -- \` (as linhas `node <caminho>.mjs` a seguir), pela ordem. */
export function suitesDoPasso(texto) {
  const ls = (texto ?? "").split(/\r\n|\r|\n/);
  const i = ls.findIndex((l) => /suites-em-paralelo\.mjs -- \\\s*$/.test(l));
  if (i < 0) return [];
  const out = [];
  for (const l of ls.slice(i + 1)) {
    const m = /^[ \t]*(node \S+\.mjs)[ \t]*(\\)?[ \t]*$/.exec(l);
    if (!m) break;
    out.push(m[1]);
    if (!m[2]) break;
  }
  return out;
}

const DOC_GUARDS = /(?:^|\n)[ \t]*node[ \t]+\.agent\/scripts\/check-doc-versions\.mjs\b/;
const ehDocGuards = (p) => DOC_GUARDS.test(`${p.run ?? ""}\n${p.corpo ?? ""}`);

/** Os problemas do passo dos guards dos docs. No exemplo ENTREGUE (parcial) nao ha nenhum ativo: um derivado parcial
 *  nao traz o `check-doc-versions.mjs` (#477). Com `completo`, o passo (a) existe: so num PR, depois de uma falha, e
 *  sem o alcance da app. */
export function problemasDosDocGuards(texto, completo = false) {
  const p = passosDoExemplo(texto).passos.find(ehDocGuards);
  if (!completo) return p ? ["o exemplo entregue corre o `check-doc-versions.mjs`, que um derivado parcial nao traz (#477): o passo vai no MODO COMPLETO (a)"] : [];
  if (!p) return ["falta o passo dos guards dos docs (`node .agent/scripts/check-doc-versions.mjs`)"];
  const cs = conjuntos(p.if ?? "");
  const out = [];
  if (!cs.includes("!cancelled()")) out.push("os guards dos docs correm depois de uma falha (`!cancelled()`)");
  if (!cs.includes("github.event_name == 'pull_request'")) out.push("os guards dos docs so correm num PR");
  if (/\bsteps\.scope\b/.test(p.if ?? "")) out.push("os guards dos docs correm em todos os PRs (sem o alcance)");
  return out;
}

/** O job `guard-tests` do exemplo descomentado, com os passos lidos (`null` sem ele). */
function jobDaMaquinaria(completo) {
  const j = jobsDe(completo).find((x) => x.id === "guard-tests");
  if (!j) return null;
  const linhas = j.todas.join("\n");
  const chave = (k) => new RegExp(`^    ${k}:[ \\t]*(.*?)[ \\t]*$`, "m").exec(linhas)?.[1] ?? null;
  return { linhas, needs: chave("needs"), se: chave("if"), passos: passosDe(j.ls, j.todas) ?? [] };
}

/** Os problemas do MODO COMPLETO descomentado: os jobs sao `ci` e `guard-tests`; o `ci` exporta o alcance; o
 *  `guard-tests` espera pelo `ci`, so corre num PR que toca a maquinaria, com o historico inteiro, e (com `ciTemplate`)
 *  com a lista de suites do `ci.yml` do template (uma lista so, `TP8`). Sem `ciTemplate` (num derivado) a lista nao
 *  se compara: o `ci.yml` dele e outro. */
export function problemasDoModoCompleto(texto, ciTemplate = null) {
  const completo = comModoCompleto(texto ?? "");
  if (completo === null) return ["nao encontrei os blocos `# --- MODO COMPLETO (a)/(b) inicio/fim ---` (o passo e o job `# guard-tests:`)"];
  const ids = jobsDe(completo).map((j) => j.id).join(",");
  if (ids !== "ci,guard-tests") return [`o modo completo tem os jobs \`ci\` e \`guard-tests\`, e so esses (tem: ${ids})`];
  const out = [...defeitosDeEstrutura(completo).map((d) => `estrutura: ${d}`)];
  const doCi = jobsDe(completo).find((x) => x.id === "ci").todas.join("\n");
  if (!/^      maquinaria:[ \t]*\$\{\{[ \t]*steps\.scope\.outputs\.maquinaria[ \t]*\}\}[ \t]*$/m.test(doCi)) out.push("o job `ci` exporta `outputs: maquinaria: ${{ steps.scope.outputs.maquinaria }}`");
  const sup = passosDoExemplo(semJob(completo, "guard-tests")).passos.find((p) => /check-test-surface\.mjs "\$\(git rev-parse HEAD\^1\)"/.test(p.run ?? ""));
  if (!sup) out.push("o bloco (a) corre o `check-test-surface` contra a base do PR (`HEAD^1`)");
  else if (!conjuntos(sup.if ?? "").includes("github.event_name == 'pull_request'") || /\bsteps\.scope\b/.test(sup.if ?? "")) out.push("o `check-test-surface` corre em todos os PRs, e so em PRs");
  const j = jobDaMaquinaria(completo);
  if (!/^\[?[ \t]*ci[ \t]*\]?$/.test(j.needs ?? "")) out.push("o `guard-tests` espera pelo `ci` (`needs: ci`): e de la que le o alcance");
  const cs = conjuntos(j.se ?? "");
  for (const c of ["!cancelled()", "github.event_name == 'pull_request'", "needs.ci.outputs.maquinaria == 'true'"]) {
    if (!cs.includes(c)) out.push(`o \`guard-tests\` leva \`${c}\` no \`if:\``);
  }
  if (!/^[ \t]+fetch-depth:[ \t]*0[ \t]*$/m.test(j.linhas)) out.push("o checkout do `guard-tests` leva `fetch-depth: 0` (ha suites que chamam o git)");
  if (!/^[ \t]+persist-credentials:[ \t]*false[ \t]*$/m.test(j.linhas)) out.push("o checkout do `guard-tests` leva `persist-credentials: false`");
  // Codigo do PR, sem nada a mais: so `contents: read`, e nenhum segredo.
  const perms = /^    permissions:[ \t]*\n((?:      .*\n)+)/m.exec(`${j.linhas}\n`)?.[1].trim().split(/\s*\n\s*/) ?? [];
  if (perms.join(",") !== "contents: read") out.push(`o \`guard-tests\` tem so \`permissions: contents: read\` (tem: ${perms.join(", ") || "nada"})`);
  if (/\bsecrets\./.test(j.linhas)) out.push("o `guard-tests` corre codigo do PR: nenhum `secrets.`");
  if (ciTemplate === null) return out;
  const doExemplo = suitesDoPasso(j.linhas);
  const doTemplate = suitesDoPasso(ciTemplate);
  if (doTemplate.length === 0) out.push("nao encontrei a lista de suites no `ci.yml` do template");
  else if (doExemplo.join("\n") !== doTemplate.join("\n")) {
    const falta = doTemplate.filter((s) => !doExemplo.includes(s));
    const aMais = doExemplo.filter((s) => !doTemplate.includes(s));
    out.push(`a lista de suites nao e a do \`ci.yml\` do template (falta: ${falta.join(", ") || "nada"}; a mais: ${aMais.join(", ") || "nada"}; ou outra ordem)`);
  }
  return out;
}

/** O que a 2b do `/upgrade` le de um `ci.yml` (`texto`) escrito numa raiz: o modo com `modo: completo` na marca, os
 *  comandos do `guard-tests`, e as notas da FORMA contra o `ciTemplate`. Os leitores sao os REAIS (#477). */
export function leituraDa2b(raiz, texto, ciTemplate) {
  mkdirSync(join(raiz, ".github/workflows"), { recursive: true });
  writeFileSync(join(raiz, ".github/workflows/ci.yml"), texto);
  const porJob = comandosPorJob(raiz);
  const modo = modoDoProjeto({ marca: "modo: completo\n", temGuardTests: porJob !== null }).modo;
  const guardDe = (t) => t.split(/^  guard-tests:[ \t]*(?:#.*)?$/m)[1]?.split(/^  [\w-]+:[ \t]*(?:#.*)?$/m)[0] ?? "";
  const notas = [];
  notasDaFormaDoCi({ ciAqui: texto, ciLa: ciTemplate, guardAqui: guardDe(texto), guardLa: guardDe(ciTemplate), repetidos: null, sweepAqui: porJob?.sweep, note: (m) => notas.push(m) });
  return { modo, guard: porJob?.["guard-tests"] ?? null, notas };
}

/** Regista os casos. `deps`: o exemplo, o `ci.yml` do template e os leitores da suite. */
export function casosDoModoCompleto(caso, { texto, ciTemplate, noTemplate, problemas, correScope, repoDePR, comRepo }) {
  // A lista do bloco e a do `ci.yml` do TEMPLATE: num derivado o `ci.yml` e outro (o `/upgrade` acrescenta-lhe as
  // suites novas, e ele tem as suas), e a comparacao saltaria a dizer porque (o defeito que o `simulate-upgrade` mediu).
  const ci = noTemplate ? ciTemplate : null;
  if (!noTemplate) console.log("  SKIP  a lista e as notas do MODO COMPLETO contra o `ci.yml`: num derivado o `ci.yml` e o do projeto");
  const completo = comModoCompleto(texto);

  caso("o exemplo entregue (parcial) nao corre o `check-doc-versions` (#477)", () => problemasDosDocGuards(texto));
  caso("controlo: o passo dos guards dos docs descomentado no exemplo entregue reprova", () =>
    problemasDosDocGuards(semJob(completo ?? "", "guard-tests"), false).length ? [] : ["o passo ativo passou no exemplo entregue"]);
  caso("o MODO COMPLETO (a): os guards dos docs em todos os PRs, depois de uma falha (#472)", () => problemasDosDocGuards(semJob(completo ?? "", "guard-tests"), true));

  caso("o MODO COMPLETO (b) (#477): um job `guard-tests` que espera pelo `ci` e so corre num PR que toca a maquinaria", () => problemasDoModoCompleto(texto, ci));
  caso("o MODO COMPLETO descomentado: o job `ci` cumpre a receita (zero problemas)", () =>
    completo === null ? ["nao encontrei os blocos MODO COMPLETO"] : problemas(semJob(completo, "guard-tests")));
  if (noTemplate) caso("controlo: uma suite a menos no `ci.yml` do template reprova a lista do job", () => {
    const menos = (ciTemplate ?? "").replace(/^[ \t]*node \.agent\/scripts\/tests\/test-tmp-limpo\.mjs[ \t]*\\\n/m, "");
    return menos !== ciTemplate && problemasDoModoCompleto(texto, menos).some((m) => /a lista de suites/.test(m)) ? [] : ["a lista divergente passou"];
  });
  // Cada parte do job, desfeita, da o seu problema.
  for (const [nome, de, para, espera] of [
    ["sem o alcance da maquinaria no `if:`", " && needs.ci.outputs.maquinaria == 'true' }}", " }}", "maquinaria == 'true'"],
    ["sem o `!cancelled()` no `if:`", "if: ${{ !cancelled() && github.event_name == 'pull_request' && needs.ci", "if: ${{ github.event_name == 'pull_request' && needs.ci", "!cancelled()"],
    ["sem o `needs: ci`", "  #   needs: ci\n", "", "needs: ci"],
    ["com `fetch-depth: 1`", "  #         fetch-depth: 0\n", "  #         fetch-depth: 1\n", "fetch-depth: 0"],
    ["sem o output `maquinaria` do job `ci`", "      maquinaria: ${{ steps.scope.outputs.maquinaria }}\n", "      maquinaria: ${{ steps.scope.outputs.app }}\n", "exporta `outputs: maquinaria"],
    ["com `persist-credentials: true`", "  #         persist-credentials: false\n", "  #         persist-credentials: true\n", "persist-credentials: false"],
    ["com `pull-requests: write`", "  #     contents: read\n  #   steps:", "  #     contents: read\n  #     pull-requests: write\n  #   steps:", "so `permissions: contents: read`"],
    ["com um segredo no job", "  #         node-version-file: .nvmrc\n  #     - name: Suites", "  #         node-version-file: .nvmrc\n  #       env:\n  #         T: ${{ secrets.X }}\n  #     - name: Suites", "nenhum `secrets.`"],
    ["sem o `check-test-surface` no bloco (a)", "      #   run: node .agent/scripts/check-test-surface.mjs", "      #   run: node .agent/scripts/outro.mjs", "o bloco (a) corre o `check-test-surface`"],
    ["com o `needs:` a apontar para um job que nao existe", "  #   needs: ci\n", "  #   needs: [ci, nada]\n", "estrutura:"],
    ["um terceiro job", "  # --- MODO COMPLETO (b) fim ---", "  # x:\n  #   runs-on: y\n  # --- MODO COMPLETO (b) fim ---", "e so esses"],
  ]) {
    caso(`controlo: ${nome}, o modo completo reprova`, () => {
      const mudado = texto.replace(de, para);
      return mudado !== texto && problemasDoModoCompleto(mudado, ci).some((m) => m.includes(espera)) ? [] : [`o exemplo ${nome} passou`];
    });
  }

  // C1 (#477): o `/upgrade` le o modo completo pelo job `guard-tests`, e as notas da forma do CI de 10 jobs calam-se.
  caso("C1: os leitores da 2b dao `completo` ao exemplo descomentado, com as suites e os verificadores no `guard-tests`", () => comRepo((raiz) => {
    const r = leituraDa2b(raiz, completo ?? "", ciTemplate ?? "");
    const faltam = [".agent/scripts/check-doc-versions.mjs", ".agent/scripts/check-backlog.mjs", ".agent/scripts/check-codigo-morto.mjs", ".agent/scripts/tests/test-guards.mjs"].filter((c) => !(r.guard ?? []).includes(c));
    return [...(r.modo === "completo" ? [] : [`modo: ${r.modo}`]), ...faltam.map((c) => `o \`guard-tests\` nao corre ${c}`)];
  }));
  caso("controlo C1: o exemplo ENTREGUE com `modo: completo` na marca da `contradicao`", () => comRepo((raiz) => {
    const r = leituraDa2b(raiz, texto, ciTemplate ?? "");
    return r.modo === "contradicao" ? [] : [`modo: ${r.modo}`];
  }));
  if (noTemplate) {
    const PORTAO = ["quando o plano da base diz", "push de um merge", "verifica o TITULO do PR"];
    caso("C1: com o pacote, a 2b da a nota do pacote e nenhuma das do portao (plano, salto, titulo)", () => comRepo((raiz) => {
      const { notas } = leituraDa2b(raiz, completo ?? "", ciTemplate ?? "");
      return [
        ...(notas.some((n) => n.includes("CI do pacote de um job")) ? [] : ["faltou a nota do pacote"]),
        ...PORTAO.filter((t) => notas.some((n) => n.includes(t))).map((t) => `saiu a nota "${t}"`),
      ];
    }));
    caso("controlo C1: sem o `needs: ci` (sem a marca do pacote), as notas do portao voltam", () => comRepo((raiz) => {
      const { notas } = leituraDa2b(raiz, (completo ?? "").replace(/^    needs: ci\n/m, ""), ciTemplate ?? "");
      return notas.some((n) => n.includes("quando o plano da base diz")) && !notas.some((n) => n.includes("CI do pacote")) ? [] : ["as notas do portao nao voltaram"];
    }));
  }

  // O `scope` escreve `maquinaria` em todos os caminhos (falha fechada como o `app`).
  const scopeCorpo = passosDoExemplo(texto).passos.find((p) => p.id === "scope")?.corpo ?? "";
  const toca = (rel) => (d) => {
    mkdirSync(join(d, rel, ".."), { recursive: true });
    writeFileSync(join(d, rel), "x\n");
  };
  const CASOS = [
    { nome: "um PR que toca `.agent/scripts/` -> maquinaria=true, app=false", evento: "pull_request", muda: toca(".agent/scripts/x.mjs"), app: "false", maq: "true" },
    { nome: "um PR que toca `.githooks/` -> maquinaria=true", evento: "pull_request", muda: toca(".githooks/commit-msg"), app: "false", maq: "true" },
    { nome: "um PR que toca `.claude/hooks/` -> maquinaria=true (#477)", evento: "pull_request", muda: toca(".claude/hooks/x.mjs"), app: "false", maq: "true" },
    { nome: "um PR que so mexe no `ci.yml` -> maquinaria=true (o `guard-tests` julga a lista dele, #477)", evento: "pull_request", muda: toca(".github/workflows/ci.yml"), app: "true", maq: "true" },
    { nome: "um PR so da app -> maquinaria=false (o controlo)", evento: "pull_request", muda: toca("src/b.ts"), app: "true", maq: "false" },
    { nome: "um PR com a app E a maquinaria -> as duas a true (o ciclo nao para na primeira)", evento: "pull_request", muda: (d) => (toca("src/b.ts")(d), toca(".agent/scripts/x.mjs")(d)), app: "true", maq: "true" },
    { nome: "push -> maquinaria=false", evento: "push", muda: toca(".agent/scripts/x.mjs"), app: "false", maq: "false" },
  ];
  for (const c of CASOS) {
    caso(`scope (#472): ${c.nome}`, () => comRepo((raiz) => {
      const r = correScope(scopeCorpo, repoDePR(raiz, c.muda), raiz, c.evento);
      return r.status === 0 && r.app === c.app && r.maquinaria === c.maq ? [] : [`saiu ${r.status}, app=${r.app}, maquinaria=${r.maquinaria} (esperava app=${c.app}, maquinaria=${c.maq}): ${r.saida.trim()}`];
    }));
  }
}

/** As falhas fechadas do `scope` (#477): sem `HEAD^1`, e com o `git diff` a falhar. `deps`: os leitores da suite. */
export function casosDasFalhasFechadas(caso, { scopeCorpo, correScope, repoDePR, comRepo, git }) {
  // As falhas fechadas escrevem `app=true` E `maquinaria=true` (#477); o controlo troca a `maquinaria` dela por `false`.
  const fechada = (r) => (r.status === 0 && r.app === "true" && r.maquinaria === "true" ? [] : [`saiu ${r.status}, app=${r.app}, maquinaria=${r.maquinaria}: ${r.saida.trim()}`]);
  const semBase = (corpo) => comRepo((raiz) => {
    const dir = join(raiz, "repo");
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "d.md"), "d\n");
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "raiz");
    return fechada(correScope(corpo, dir, raiz, "pull_request"));
  });
  const diffFalha = (corpo) => comRepo((raiz) => {
    const dir = repoDePR(raiz, (d) => writeFileSync(join(d, "docs", "d.md"), "d2\n"));
    const bin = join(raiz, "bin");
    mkdirSync(bin);
    const real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    writeFileSync(join(bin, "git"), `#!/bin/sh\nif [ "$1" = "diff" ]; then exit 1; fi\nexec "${real}" "$@"\n`);
    chmodSync(join(bin, "git"), 0o755);
    return fechada(correScope(corpo, dir, raiz, "pull_request", `${bin}:${process.env.PATH}`));
  });
  for (const [nome, fn, marca] of [["um PR sem `HEAD^1` (commit-raiz)", semBase, "sem base"], ["o `git diff` a falhar", diffFalha, "o git diff falhou"]]) {
    caso(`scope: ${nome} -> app=true e maquinaria=true (falha fechada)`, () => fn(scopeCorpo ?? ""));
    caso(`controlo: ${nome} com \`maquinaria=false\` na falha fechada reprova`, () => {
      const ls = (scopeCorpo ?? "").split("\n");
      const i = ls.findIndex((l) => l.includes(marca) && l.includes('"maquinaria=true"'));
      if (i < 0) return [`nao encontrei a linha da falha fechada (${marca})`];
      ls[i] = ls[i].replace('"maquinaria=true"', '"maquinaria=false"');
      return fn(ls.join("\n")).length ? [] : ["a falha fechada aberta passou"];
    });
  }
}
