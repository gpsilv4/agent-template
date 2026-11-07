/**
 * Os casos do passo dos guards dos docs e do bloco MODO COMPLETO do exemplo de CI barato (#472) — {{PROJECT_NAME}}
 *
 * O exemplo (`src/docs/exemplos/ci-sem-maquinaria.yml`) serve um derivado SEM a maquinaria do template; com ela (o
 * `/upgrade` completo), o derivado descomenta o bloco MODO COMPLETO, e as suites dos scripts do template correm SO
 * quando o PR toca a maquinaria. NAO e uma suite nem um modulo descoberto: a `test-ci-exemplo.mjs` importa-o e chama
 * `casosDoModoCompleto` com o `caso` dela e os seus leitores. Sem sitios de recusa: so regista.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { comModoCompleto, conjuntos, passosDoExemplo } from "./expressoes-ci.mjs";

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

const ehDocGuards = (p) => /(?:^|\n)[ \t]*node[ \t]+\.agent\/scripts\/check-doc-versions\.mjs\b/.test(`${p.run ?? ""}\n${p.corpo ?? ""}`);

/** Os problemas do passo dos guards dos docs: existe, so num PR, depois de uma falha, e sem o alcance da app. */
export function problemasDosDocGuards(texto) {
  const p = passosDoExemplo(texto).passos.find(ehDocGuards);
  if (!p) return ["falta o passo dos guards dos docs (`node .agent/scripts/check-doc-versions.mjs`)"];
  const cs = conjuntos(p.if ?? "");
  const out = [];
  if (!cs.includes("!cancelled()")) out.push("os guards dos docs correm depois de uma falha (`!cancelled()`)");
  if (!cs.includes("github.event_name == 'pull_request'")) out.push("os guards dos docs so correm num PR");
  if (/\bsteps\.scope\b/.test(p.if ?? "")) out.push("os guards dos docs correm em todos os PRs (sem o alcance)");
  return out;
}

/** Os problemas do bloco MODO COMPLETO: existe, o passo corre so num PR que toca a maquinaria, e (com `ciTemplate`) a
 *  lista de suites e a do `ci.yml` do template (uma lista so, e nao duas a concordar a mao, `TP8`). Sem `ciTemplate`
 *  (num derivado), a lista nao se compara: o `ci.yml` dele e outro, com as suites dele e por outra ordem. */
export function problemasDoModoCompleto(texto, ciTemplate = null) {
  const completo = comModoCompleto(texto ?? "");
  if (completo === null) return ["nao encontrei o bloco `# --- MODO COMPLETO inicio/fim ---` (com um `# - name:` dentro)"];
  const p = passosDoExemplo(completo).passos.find((x) => /suites-em-paralelo\.mjs/.test(`${x.run ?? ""}\n${x.corpo ?? ""}`));
  if (!p) return ["o bloco MODO COMPLETO nao tem o passo das suites (`suites-em-paralelo.mjs`)"];
  const cs = conjuntos(p.if ?? "");
  const out = [];
  for (const c of ["!cancelled()", "github.event_name == 'pull_request'", "steps.scope.outputs.maquinaria == 'true'"]) {
    if (!cs.includes(c)) out.push(`as suites da maquinaria levam \`${c}\` no \`if:\``);
  }
  if (ciTemplate === null) return out;
  const doExemplo = suitesDoPasso(`${p.corpo ?? ""}`);
  const doTemplate = suitesDoPasso(ciTemplate);
  if (doTemplate.length === 0) out.push("nao encontrei a lista de suites no `ci.yml` do template");
  else if (doExemplo.join("\n") !== doTemplate.join("\n")) {
    const falta = doTemplate.filter((s) => !doExemplo.includes(s));
    const aMais = doExemplo.filter((s) => !doTemplate.includes(s));
    out.push(`a lista de suites nao e a do \`ci.yml\` do template (falta: ${falta.join(", ") || "nada"}; a mais: ${aMais.join(", ") || "nada"}; ou outra ordem)`);
  }
  return out;
}

/** Regista os casos. `deps`: o exemplo, o `ci.yml` do template e os leitores da suite. */
export function casosDoModoCompleto(caso, { texto, ciTemplate, noTemplate, problemas, correScope, repoDePR, comRepo }) {
  // A lista do bloco e a do `ci.yml` do TEMPLATE: num derivado o `ci.yml` e outro (o `/upgrade` acrescenta-lhe as
  // suites novas, e ele tem as suas), e a comparacao saltaria a dizer porque (o defeito que o `simulate-upgrade` mediu).
  const ci = noTemplate ? ciTemplate : null;
  if (!noTemplate) console.log("  SKIP  a lista do bloco MODO COMPLETO contra o `ci.yml`: num derivado o `ci.yml` e o do projeto");
  caso("o passo dos guards dos docs (#472): em todos os PRs, depois de uma falha", () => problemasDosDocGuards(texto));
  caso("controlo: sem o passo dos guards dos docs, reprova", () =>
    problemasDosDocGuards(texto.replace("node .agent/scripts/check-doc-versions.mjs", "true")).length ? [] : ["o exemplo sem o passo passou"]);

  caso("o bloco MODO COMPLETO (#472): as suites so num PR que toca a maquinaria, com a lista do `ci.yml` do template", () => problemasDoModoCompleto(texto, ci));
  caso("o bloco MODO COMPLETO descomentado cumpre a receita (zero problemas)", () => {
    const completo = comModoCompleto(texto);
    return completo === null ? ["nao encontrei o bloco MODO COMPLETO"] : problemas(completo);
  });
  if (noTemplate) caso("controlo: uma suite a menos no `ci.yml` do template reprova a lista do bloco", () => {
    const menos = (ciTemplate ?? "").replace(/^[ \t]*node \.agent\/scripts\/tests\/test-tmp-limpo\.mjs[ \t]*\\\n/m, "");
    return menos !== ciTemplate && problemasDoModoCompleto(texto, menos).some((m) => /a lista de suites/.test(m)) ? [] : ["a lista divergente passou"];
  });
  caso("controlo: sem o alcance da maquinaria no `if:`, o bloco reprova", () => {
    const sem = texto.replace(" && steps.scope.outputs.maquinaria == 'true' }}", " }}");
    return sem !== texto && problemasDoModoCompleto(sem, ci).some((m) => /maquinaria == 'true'/.test(m)) ? [] : ["o bloco sem o alcance passou"];
  });

  // O `scope` escreve `maquinaria` nos tres caminhos (falha fechada como o `app`).
  const scopeCorpo = passosDoExemplo(texto).passos.find((p) => p.id === "scope")?.corpo ?? "";
  const toca = (rel) => (d) => {
    mkdirSync(join(d, rel, ".."), { recursive: true });
    writeFileSync(join(d, rel), "x\n");
  };
  const CASOS = [
    { nome: "um PR que toca `.agent/scripts/` -> maquinaria=true, app=false", evento: "pull_request", muda: toca(".agent/scripts/x.mjs"), app: "false", maq: "true" },
    { nome: "um PR que toca `.githooks/` -> maquinaria=true", evento: "pull_request", muda: toca(".githooks/commit-msg"), app: "false", maq: "true" },
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
