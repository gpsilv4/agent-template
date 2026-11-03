#!/usr/bin/env node
/**
 * Testes do exemplo de CI para um derivado SEM a maquinaria (`src/docs/exemplos/ci-sem-maquinaria.yml`, #429)
 *
 * O exemplo nao corre em lado nenhum deste repo, e nenhum gate o le (a superficie, o Guard 11 e o Guard 15 so leem
 * `.github/workflows/`): esta suite e a UNICA protecao dele. Prova tres coisas:
 *   1. as PROPRIEDADES da receita, lidas do ficheiro (um job, os eventos, `!cancelled()`, o `concurrency` do #427,
 *      backlog/hooks/mensagens/gitleaks sempre, o que corre num push, as caches que so o `main` grava, a chave da
 *      `node_modules`) e a regra da saida de um passo saltado: um `if:` so le a saida de outro passo LIVREMENTE na forma `steps.X.outputs.k == '<nao vazio>'`; tudo o
 *      resto (`!=`, `!`, `== ''`, `contains`, os operandos trocados, `['k']`) repete o `if:` de X e nao corre depois de
 *      uma falha que X nao corre (uma LISTA DO QUE SE PERMITE, `TP6`);
 *   2. as mesmas propriedades no bloco OPCIONAL T80 descomentado, que e onde um derivado publicou a armadilha;
 *   3. o shell do passo `scope`, corrido com `bash -e` num repo git de fixture (como o `tests-plano-passo.mjs`).
 * Cada propriedade tem o seu controlo: o exemplo mutado de UMA forma tem de dar o problema dessa forma.
 *
 * Num derivado sem o exemplo, SKIP; no template e exigido (`TP15`).
 *
 *   node .agent/scripts/tests/test-ci-exemplo.mjs
 */
import { spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { jobsDe, passosDe, indent } from "../lib/estrutura-workflow.mjs";
import { concurrencyDeTopo, problemasDaConcurrency } from "../lib/marcas-yaml.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const EXEMPLO = "src/docs/exemplos/ci-sem-maquinaria.yml";
const ler = (p) => leOuNull(join(ROOT, p));

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

// --- As expressoes de um `if:` ---

/** O `if:` sem `${{ }}` e com os espacos colapsados. */
const normaliza = (e) => e.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, "$1").replace(/\s+/g, " ").trim();

/** O indice do `)` que fecha o `(` em `i`, fora de aspas; -1 se nao fecha. */
function fecho(s, i) {
  let fundo = 0;
  let aspa = null;
  for (let k = i; k < s.length; k++) {
    if (aspa) {
      if (s[k] === aspa) aspa = null;
    } else if (s[k] === "'" || s[k] === '"') aspa = s[k];
    else if (s[k] === "(") fundo++;
    else if (s[k] === ")" && --fundo === 0) return k;
  }
  return -1;
}

/** Um par de parenteses exteriores sai so quando o `(` do inicio fecha no ULTIMO caracter (`(a) || (b)` fica). */
function semExteriores(c) {
  let s = c.trim();
  while (s.startsWith("(") && fecho(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
  return s;
}

/** Partir `s` no operador `op` (`&&` ou `||`) a profundidade 0, fora de aspas. */
function parteNoTopo(s, op) {
  const out = [];
  let fundo = 0;
  let aspa = null;
  let ini = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (aspa) {
      if (ch === aspa) aspa = null;
    } else if (ch === "'" || ch === '"') aspa = ch;
    else if (ch === "(") fundo++;
    else if (ch === ")") fundo--;
    else if (fundo === 0 && s.startsWith(op, k)) {
      out.push(s.slice(ini, k));
      ini = k + 2;
      k++;
    }
  }
  out.push(s.slice(ini));
  return out.map(semExteriores).filter(Boolean);
}
/** Os conjuntos de topo: os `&&` a profundidade 0. */
const conjuntos = (expr) => parteNoTopo(normaliza(expr), "&&");

// A forma LIVRE de um conjunto: um `==` com um literal NAO vazio sobre a saida ou a conclusao de um passo (saltado, a
// saida e `''` e a conclusao `'skipped'`: as duas tornam a forma falsa), ou um `||` feito so de formas livres.
const ATOMO_LIVRE = /^steps\.[\w-]+\.(?:outputs\.[\w-]+|conclusion|outcome) == '[^']+'$/;
const livre = (c) => parteNoTopo(c, "||").every((a) => ATOMO_LIVRE.test(a));
const REFS = /steps\.([\w-]+)\.(?:outputs|conclusion|outcome)\b/g;
// O que a regra nao ve, e por isso se recusa: os passos lidos por indice, ou inteiros.
const OPACO = /\bsteps\s*\[|\bsteps\.[\w-]+\s*\[|toJSON\s*\(\s*steps\b/;
/** As funcoes que deixam um passo correr depois de uma falha (os nomes nao distinguem maiusculas no GitHub). */
const DEPOIS_DE_FALHA = /(!\s*cancelled|\balways|\bfailure)\s*\(\s*\)/gi;
const depoisDeFalha = (e) => new Set([...(e ?? "").matchAll(DEPOIS_DE_FALHA)].map((m) => m[0].replace(/\s+/g, "").toLowerCase()));

// --- Os passos ---

/** As chaves de um passo: `{ name, id, if, uses, run, with: {k: v}, ls, cru }`. */
function chavesDe(passo) {
  const p = { with: {}, ls: passo.ls, cru: passo.cru };
  const primeira = passo.ls[0].replace(/^([ \t]*)-[ \t]*/, (_, a) => `${a}  `);
  const linhas = [primeira, ...passo.ls.slice(1)];
  const kInd = indent(primeira);
  let emWith = false;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.trim()) continue;
    const m = /^[ \t]*["']?([\w-]+)["']?[ \t]*:[ \t]*(.*)$/.exec(l);
    if (!m) continue;
    if (indent(l) === kInd) {
      emWith = m[1] === "with";
      if (m[1] !== "with") p[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
      if (m[1] === "run") p.runIdx = i;
    } else if (emWith && indent(l) > kInd) p.with[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  // O corpo cru do `run: |`: as linhas seguintes mais indentadas que a chave, sem a indentacao comum.
  if (p.runIdx !== undefined && /^[|>]/.test(p.run)) {
    const corpo = [];
    for (let j = p.runIdx + 1; j < passo.cru.length && (!passo.cru[j].trim() || indent(passo.cru[j]) > kInd); j++) corpo.push(passo.cru[j]);
    const ne = corpo.filter((l) => l.trim());
    const min = ne.length ? Math.min(...ne.map(indent)) : 0;
    p.corpo = corpo.map((l) => l.slice(min)).join("\n");
  }
  return p;
}

function passosDoExemplo(texto) {
  const jobs = jobsDe(texto);
  if (jobs.length !== 1) return { jobs, passos: [] };
  return { jobs, passos: (passosDe(jobs[0].ls, jobs[0].todas) ?? []).map(chavesDe) };
}

/** Os eventos do `on:` de topo. */
function eventos(texto) {
  const ls = texto.split("\n");
  const i = ls.findIndex((l) => /^["']?on["']?[ \t]*:/.test(l));
  if (i < 0) return [];
  const fim = ls.findIndex((l, j) => j > i && /^[^\s#]/.test(l));
  const filhos = ls.slice(i + 1, fim < 0 ? ls.length : fim).filter((l) => l.trim() && !/^[ \t]*#/.test(l));
  if (!filhos.length) return [];
  const ind = Math.min(...filhos.map(indent));
  return filhos.filter((l) => indent(l) === ind).map((l) => l.trim().replace(/[ \t]*:.*$/, ""));
}

const ehInstall = (p) => /^npm ci\b/.test((p.run ?? "").trim());
// Um COMANDO (o inicio de uma linha), e nao uma palavra: o passo `deps` escreve `npm-deps-…` numa chave.
const comandos = (p) => `${p.run ?? ""}\n${p.corpo ?? ""}`;
const usaNpm = (p) => /(?:^|\n)[ \t]*np[mx][ \t]/.test(comandos(p)) && !ehInstall(p);
const usaNode = (p) => /(?:^|\n)[ \t]*node[ \t]+(?!\.githooks\/commit-msg)/.test(comandos(p));
// Os que correm SEMPRE (tambem no push), achados pelo que fazem e nao pelo nome: renomear nao os tira da regra.
const ehMensagens = (p) => /(?:^|\n)[ \t]*node[ \t]+\.githooks\/commit-msg\b/.test(comandos(p));
const ehGitleaks = (p) => /^gitleaks\/gitleaks-action@/.test(p.uses ?? "");

/** Os problemas do exemplo (vazio = a receita cumpre-se). */
function problemas(texto) {
  const out = [];
  const ev = eventos(texto).sort().join(",");
  if (ev !== "pull_request,push") out.push(`o \`on:\` tem de ser exatamente pull_request e push (tem: ${ev || "nada"}) — o \`scope\` recusa os outros`);
  if (texto.split("\n").some((l) => /^[ \t]*[^#\s].*\bpaths-ignore\b/.test(l) || /^[ \t]*paths-ignore\b/.test(l))) out.push("um `paths-ignore`: um check que nao corre fica pendente se for obrigatorio");
  for (const p of problemasDaConcurrency(concurrencyDeTopo(texto) ?? "")) out.push(`concurrency: ${p}`);
  const { jobs, passos } = passosDoExemplo(texto);
  if (jobs.length !== 1) {
    out.push(`tem de haver UM job (ha ${jobs.length}): cada job e cobrado arredondado ao minuto`);
    return out;
  }
  const porId = new Map(passos.filter((p) => p.id).map((p) => [p.id, p]));
  const checkout = passos.find((p) => /^actions\/checkout@/.test(p.uses ?? ""));
  if (checkout?.with["fetch-depth"] !== "0") out.push("o checkout precisa de `fetch-depth: 0`: as mensagens e o gitleaks leem o intervalo todo");
  const scope = porId.get("scope");
  if (!scope) out.push("falta o passo com `id: scope`");
  else if (scope.if) out.push("o passo `scope` corre em TODOS os eventos (sem `if:`): uma saida vazia nunca chega a um `if:`");
  for (const p of passos) {
    const nome = p.name ?? p.uses ?? "?";
    const cs = conjuntos(p.if ?? "");
    if (ehInstall(p) && depoisDeFalha(p.if).size) out.push(`${nome}: a instalacao nao leva \`!cancelled()\`/\`always()\``);
    if (usaNpm(p)) {
      if (!cs.includes("!cancelled()")) out.push(`${nome}: uma verificacao leva \`!cancelled()\``);
      if (!cs.includes("steps.scope.outputs.app == 'true'")) out.push(`${nome}: uma verificacao da app leva \`steps.scope.outputs.app == 'true'\` (senao corre no push)`);
    }
    if (usaNode(p) && !cs.includes("github.event_name == 'pull_request'")) out.push(`${nome}: corre no push (so as mensagens e o gitleaks correm la)`);
    if (usaNode(p) || ehMensagens(p) || ehGitleaks(p)) {
      if (!cs.includes("!cancelled()")) out.push(`${nome}: corre depois de uma falha, com \`!cancelled()\``);
      if (/\bsteps\.scope\b/.test(p.if ?? "")) out.push(`${nome}: nao depende do alcance (corre tambem nos PRs de docs)`);
    }
    if ((ehMensagens(p) || ehGitleaks(p)) && /\bgithub\.event_name\b/.test(p.if ?? "")) out.push(`${nome}: corre em todos os eventos (tambem no push)`);
    if (ehGitleaks(p) && !/^[ \t]+GITLEAKS_LICENSE:[ \t]*\$\{\{[ \t]*secrets\.GITLEAKS_LICENSE[ \t]*\}\}/m.test(p.ls.join("\n"))) out.push(`${nome}: passa o \`GITLEAKS_LICENSE\` (a acao exige-o numa organizacao)`);
    if (OPACO.test(p.if ?? "")) out.push(`${nome}: le os passos por uma forma que a regra nao ve (\`steps[...]\`, \`toJSON(steps)\`)`);
    if (/^actions\/cache@/.test(p.uses ?? "")) out.push(`${nome}: \`actions/cache\` grava tambem num PR — usar \`restore\` e \`save\` separados`);
    if (/^actions\/cache\/save@/.test(p.uses ?? "") && !cs.includes("github.event_name == 'push'")) out.push(`${nome}: so o push do \`main\` grava uma cache (os PRs nunca)`);
    if (/^actions\/cache\/restore@/.test(p.uses ?? "") && p.with.path === "node_modules") {
      if (p.with["restore-keys"] !== undefined) out.push(`${nome}: a chave da node_modules e EXATA, sem \`restore-keys\``);
      if (!/github\.event_name == 'push'/.test(p.with["lookup-only"] ?? "")) out.push(`${nome}: num push so se procura (\`lookup-only\`)`);
    }
    if (ehInstall(p)) {
      const lookups = cs.flatMap((c) => [...c.matchAll(/steps\.([\w-]+)\.outputs\.cache-hit != 'true'/g)].map((m) => m[1]));
      if (!lookups.some((x) => /github\.event_name == 'push'/.test(porId.get(x)?.with["lookup-only"] ?? ""))) out.push(`${nome}: num push so instala depois de um \`lookup-only\` que falhou`);
    }
    if (ehMensagens(p) && !/git log --no-merges/.test(p.corpo ?? "")) out.push("as mensagens leem com `git log --no-merges`");
    if (ehMensagens(p) && !/PR_TITULO/.test(p.corpo ?? "")) out.push("as mensagens verificam tambem o titulo do PR");
    // A saida de um passo saltado: a regra (o porque no cabecalho).
    for (const c of cs) {
      const refs = [...c.matchAll(REFS)].map((m) => m[1]);
      for (const x of refs) if (!porId.has(x)) out.push(`${nome}: le a saida de \`${x}\`, que nao e o \`id\` de passo nenhum`);
      if (!refs.length || livre(c)) continue;
      for (const x of new Set(refs)) {
        const X = porId.get(x);
        if (!X) continue;
        const emFalta = conjuntos(X.if ?? "").filter((cx) => !cs.includes(cx));
        if (emFalta.length) out.push(`${nome}: \`${c}\` le a saida de \`${x}\` sem repetir o \`if:\` dele (${emFalta.join(" ; ")}) — saltado, a saida e vazia`);
        const a = depoisDeFalha(p.if);
        const b = depoisDeFalha(X.if);
        if ([...a].some((f) => !b.has(f))) out.push(`${nome}: corre depois de uma falha (${[...a].join(", ")}) e \`${x}\` nao — a saida dele fica vazia`);
      }
    }
  }
  if (!/process\.versions\.modules/.test(porId.get("deps")?.corpo ?? "")) out.push("a chave da node_modules leva o ABI do Node instalado (`process.versions.modules`), nao o texto do `.nvmrc`");
  if (!passos.some(ehMensagens)) out.push("falta o passo das mensagens de commit (`node .githooks/commit-msg`)");
  if (!passos.some(ehGitleaks)) out.push("falta o passo do gitleaks (`gitleaks/gitleaks-action@`)");
  if (!/node-modules-\$RUNNER_OS-\$RUNNER_ARCH-/.test(porId.get("deps")?.corpo ?? "")) out.push("a chave da node_modules leva `$RUNNER_OS` e `$RUNNER_ARCH` (um binario por plataforma)");
  out.push(...problemasDaTabela(passos, porId.has("nmcache")));
  return out;
}

/** O valor de um `if:` num cenario (`ctx`: o valor de cada `steps.X…`/`github.event_name`; o que falta e `''`, como
 *  no GitHub). `!cancelled()`, `always()` e `success()` sao verdadeiros (nenhum cancelamento); `failure()` falso.
 *  `null` quando a expressao tem algo que isto nao avalia (`contains`, `fromJSON`…): e um problema, nao um "passa". */
function avalia(expr, ctx) {
  if (!expr) return true;
  const js = normaliza(expr)
    .replace(/\bsteps\.[\w-]+\.(?:outputs\.[\w-]+|conclusion|outcome)|\bgithub\.event_name/g, (v) => `v(${JSON.stringify(v)})`)
    .replace(/!\s*cancelled\s*\(\s*\)|\balways\s*\(\s*\)|\bsuccess\s*\(\s*\)/gi, "true")
    .replace(/\bfailure\s*\(\s*\)/gi, "false");
  if (/[a-z]\w*\s*\(/i.test(js.replace(/v\("[^"]*"\)/g, ""))) return null;
  try {
    return Boolean(new Function("v", `return (${js});`)((k) => ctx[k] ?? ""));
  } catch {
    return null;
  }
}

/** A tabela de verdade do Install e das verificacoes da app, nos caminhos reais de um PR e de um push. */
function problemasDaTabela(passos, comT80) {
  const out = [];
  const E = "github.event_name";
  const APP = "steps.scope.outputs.app";
  const NPM = "steps.npmcache.outputs.cache-hit";
  const NM = "steps.nmcache.outputs.cache-hit";
  const INST = "steps.install.conclusion";
  const DEPS = "steps.deps.outputs.changed";
  const install = passos.find(ehInstall);
  const verificacoes = passos.filter(usaNpm);
  if (!install) return ["falta o passo `npm ci`"];
  if (install.id !== "install") out.push("o Install precisa de `id: install` (as verificacoes leem a conclusao dele)");
  const casosInstall = comT80
    ? [["PR de app, node_modules na cache", { [E]: "pull_request", [APP]: "true", [NM]: "true" }, false], ["PR de app, sem a node_modules", { [E]: "pull_request", [APP]: "true", [NM]: "false" }, true], ["PR de docs", { [E]: "pull_request", [APP]: "false" }, false], ["push, node_modules na cache", { [E]: "push", [APP]: "false", [NM]: "true" }, false], ["push, sem a node_modules", { [E]: "push", [APP]: "false", [NM]: "false" }, true]]
    : [["PR de app", { [E]: "pull_request", [APP]: "true", [NPM]: "true" }, true], ["PR de app, sem a cache do npm", { [E]: "pull_request", [APP]: "true", [NPM]: "false" }, true], ["PR de docs", { [E]: "pull_request", [APP]: "false" }, false], ["push, a cache existe", { [E]: "push", [APP]: "false", [NPM]: "true" }, false], ["push, sem a cache", { [E]: "push", [APP]: "false", [NPM]: "false" }, true]];
  for (const [nome, ctx, quer] of casosInstall) {
    const r = avalia(install.if, ctx);
    if (r === null) out.push(`Install: nao consigo avaliar o \`if:\` (${install.if})`);
    else if (r !== quer) out.push(`Install: num ${nome} ${quer ? "devia instalar e nao instala" : "instala e nao devia"}`);
  }
  const base = { [E]: "pull_request", [APP]: "true", [DEPS]: "true" };
  const casosVerif = [
    ["num PR de app", { ...base, [INST]: "success" }, true],
    ["com o Install vermelho", { ...base, [INST]: "failure" }, false],
    ["com o Install saltado por uma falha anterior", { ...base, [INST]: "skipped" }, false],
    ["num PR de docs", { [E]: "pull_request", [APP]: "false", [INST]: "skipped" }, false],
    ["no push", { [E]: "push", [APP]: "false", [INST]: "success" }, false],
    ...(comT80 ? [["num PR de app com a node_modules da cache", { ...base, [NM]: "true", [INST]: "skipped" }, true]] : []),
  ];
  for (const v of verificacoes) {
    for (const [nome, ctx, quer] of casosVerif) {
      const r = avalia(v.if, ctx);
      if (r === null) out.push(`${v.name}: nao consigo avaliar o \`if:\` (${v.if})`);
      else if (r !== quer) out.push(`${v.name}: ${quer ? `nao corre ${nome}` : nome === "no push" ? "corre no push" : `corre sem a instalacao (${nome})`}`);
    }
  }
  return out;
}

/** O exemplo com o bloco CACHE trocado pelo bloco OPCIONAL T80 descomentado. */
function comT80(texto) {
  const ls = texto.split("\n");
  const at = (re) => ls.findIndex((l) => re.test(l));
  const [ci, cf, ti, tf] = [at(/# --- CACHE inicio ---/), at(/# --- CACHE fim ---/), at(/# --- OPCIONAL T80 inicio/), at(/# --- OPCIONAL T80 fim ---/)];
  if ([ci, cf, ti, tf].some((k) => k < 0) || !(ci < cf && cf < ti && ti < tf)) return null;
  const p0 = ls.findIndex((l, k) => k > ti && k < tf && /^[ \t]*# - name:/.test(l));
  if (p0 < 0) return null;
  const t80 = ls.slice(p0, tf).map((l) => l.replace(/^([ \t]*)# ?/, "$1").replace(/^[ \t]+$/, ""));
  // A segunda edicao que o comentario do T80 pede: nas verificacoes, a pasta da cache vale como instalacao.
  return [...ls.slice(0, ci), ...t80, ...ls.slice(cf + 1, ti), ...ls.slice(tf + 1)].join("\n")
    .replaceAll("steps.install.conclusion == 'success'", "(steps.install.conclusion == 'success' || steps.nmcache.outputs.cache-hit == 'true')");
}

// --- O passo `scope`, corrido ---

function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}
/** Um repo cujo HEAD e um merge (o merge ref de um PR): `HEAD^1` a base, e o ramo com `muda(dir)`. */
function repoDePR(raiz, muda) {
  const dir = join(raiz, "repo");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "a\n");
  writeFileSync(join(dir, "docs", "d.md"), "d\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "checkout", "-q", "-b", "pr");
  muda(dir);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "pr");
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--no-ff", "-m", "merge", "pr");
  return dir;
}
/** Corre o corpo do `scope` como o runner: `bash -e`, com `GITHUB_OUTPUT` e `RUNNER_TEMP`. */
function correScope(corpo, dir, raiz, evento, path = process.env.PATH) {
  const script = join(raiz, "scope.sh");
  writeFileSync(script, corpo);
  const out = join(raiz, "output");
  writeFileSync(out, "");
  const temp = join(raiz, "runner-temp");
  mkdirSync(temp, { recursive: true });
  const r = spawnSync("bash", ["-e", script], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: path, EVENTO: evento, GITHUB_OUTPUT: out, RUNNER_TEMP: temp } });
  const app = /^app=(.*)$/m.exec(readFileSync(out, "utf8"))?.[1] ?? null;
  return { status: r.status, app, saida: `${r.stdout}${r.stderr}` };
}
function comRepo(fn) {
  const raiz = mkdtempSync(join(tmpdir(), "ci-exemplo-test-"));
  try {
    return fn(raiz);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

// --- Os casos ---

const texto = ler(EXEMPLO);
if (texto === null) {
  if (ehDerivado((p) => leOuNull(join(ROOT, p)))) {
    console.log(`  SKIP  ${EXEMPLO} nao existe neste projeto (derivado): o exemplo e do template.`);
    process.exit(0);
  }
  console.log(`  FAIL  ${EXEMPLO} nao existe — no template e exigido (\`TP15\`)`);
  process.exit(1);
}
const scopeCorpo = passosDoExemplo(texto).passos.find((p) => p.id === "scope")?.corpo ?? null;
const T80 = comT80(texto);

caso("o exemplo cumpre a receita (zero problemas)", () => problemas(texto));
caso("o bloco OPCIONAL T80, descomentado no lugar do bloco CACHE, cumpre a receita", () => (T80 === null ? ["nao encontrei os marcadores CACHE/OPCIONAL T80"] : problemas(T80)));

caso("normalizacao: so sai um par de parenteses exteriores que fecha no ultimo caracter", () => {
  const p = [];
  if (semExteriores("(a) || (b)") !== "(a) || (b)") p.push(`(a) || (b) -> ${semExteriores("(a) || (b)")}`);
  if (semExteriores("((a || b))") !== "a || b") p.push(`((a || b)) -> ${semExteriores("((a || b))")}`);
  const cs = conjuntos("${{ !cancelled() && (a == 'x && y' || b) && c }}");
  if (JSON.stringify(cs) !== JSON.stringify(["!cancelled()", "a == 'x && y' || b", "c"])) p.push(`conjuntos: ${JSON.stringify(cs)}`);
  return p;
});

// Os controlos: o exemplo mutado de UMA forma tem de dar o problema dessa forma. `base: "t80"` muta a variante T80.
const INSTALL_IF = "if: (steps.scope.outputs.app == 'true' || github.event_name == 'push') && (github.event_name == 'pull_request' || steps.npmcache.outputs.cache-hit != 'true')";
const MUTACOES = [
  { nome: "um segundo job", de: "    steps:\n      - uses: actions/checkout@", para: "    steps:\n      - run: true\n  outro:\n    runs-on: ubuntu-24.04\n    steps:\n      - uses: actions/checkout@", espera: "UM job" },
  { nome: "workflow_dispatch no `on:`", de: "  push:\n    branches: [main]\n", para: "  push:\n    branches: [main]\n  workflow_dispatch:\n", espera: "exatamente pull_request e push" },
  { nome: "um paths-ignore", de: "  pull_request:\n    branches: [main]\n", para: "  pull_request:\n    branches: [main]\n    paths-ignore: ['docs/**']\n", espera: "paths-ignore" },
  { nome: "cancel-in-progress sempre", de: "cancel-in-progress: ${{ github.event_name == 'pull_request' }}", para: "cancel-in-progress: true", espera: "concurrency:" },
  { nome: "o grupo do push sem o sha", de: "github.event.pull_request.number || github.sha }}", para: "github.event.pull_request.number || github.ref }}", espera: "concurrency:" },
  { nome: "fetch-depth 1", de: "fetch-depth: 0", para: "fetch-depth: 1", espera: "fetch-depth: 0" },
  { nome: "o `id: scope` com um erro", de: "id: scope", para: "id: scopo", espera: "nao e o `id` de passo nenhum" },
  { nome: "o `scope` so num PR", de: "        id: scope\n", para: "        id: scope\n        if: github.event_name == 'pull_request'\n", espera: "corre em TODOS os eventos" },
  { nome: "o TypeScript sem `!cancelled()`", de: "if: ${{ !cancelled() && steps.scope.outputs.app == 'true' && steps.install.conclusion == 'success' }}\n        run: npx tsc", para: "if: ${{ steps.scope.outputs.app == 'true' && steps.install.conclusion == 'success' }}\n        run: npx tsc", espera: "leva `!cancelled()`" },
  { nome: "o TypeScript a correr no push", de: "if: ${{ !cancelled() && steps.scope.outputs.app == 'true' && steps.install.conclusion == 'success' }}\n        run: npx tsc", para: "if: ${{ !cancelled() }}\n        run: npx tsc", espera: "corre no push" },
  { nome: "o TypeScript sem o portao do Install (o defeito do #428)", de: "if: ${{ !cancelled() && steps.scope.outputs.app == 'true' && steps.install.conclusion == 'success' }}\n        run: npx tsc", para: "if: ${{ !cancelled() && steps.scope.outputs.app == 'true' }}\n        run: npx tsc", espera: "corre sem a instalacao" },
  { nome: "o Install nunca corre num PR", de: INSTALL_IF, para: "if: (steps.scope.outputs.app == 'true' || github.event_name == 'push') && github.event_name == 'push' && steps.npmcache.outputs.cache-hit != 'true'", espera: "num PR de app devia instalar" },
  { nome: "`steps['x']` (uma leitura que a regra nao ve)", de: INSTALL_IF, para: "if: (steps.scope.outputs.app == 'true' || github.event_name == 'push') && (github.event_name == 'pull_request' || steps['npmcache'].outputs['cache-hit'] != 'true')", espera: "forma que a regra nao ve" },
  { nome: "o Backlog Check a correr no push", de: "if: ${{ !cancelled() && github.event_name == 'pull_request' }}\n        run: node .agent/scripts/check-backlog.mjs", para: "if: ${{ !cancelled() }}\n        run: node .agent/scripts/check-backlog.mjs", espera: "corre no push" },
  { nome: "a instalacao com `!cancelled()`", de: INSTALL_IF, para: INSTALL_IF.replace("if: (", "if: !cancelled() && ("), espera: "nao leva `!cancelled()`" },
  { nome: "sem `--no-merges`", de: "git log --no-merges --format", para: "git log --format", espera: "--no-merges" },
  { nome: "sem o titulo do PR", de: '            printf \'%s\\n\' "$PR_TITULO"', para: "            true", espera: "titulo do PR" },
  { nome: "um PR a gravar a cache", de: "|| github.event_name == 'push') && github.event_name == 'push' && steps.npmcache.outputs.cache-hit != 'true'\n        uses: actions/cache/save@", para: "|| github.event_name == 'push') && steps.npmcache.outputs.cache-hit != 'true'\n        uses: actions/cache/save@", espera: "so o push do `main` grava" },
  { nome: "`actions/cache` (grava tambem num PR)", de: "uses: actions/cache/restore@v6\n        with:\n          path: ~/.npm", para: "uses: actions/cache@v6\n        with:\n          path: ~/.npm", espera: "grava tambem num PR" },
  { nome: "o push instala sem procurar a cache", de: INSTALL_IF, para: "if: steps.scope.outputs.app == 'true' || github.event_name == 'push'", espera: "depois de um `lookup-only`" },
  // A saida de um passo saltado: cada forma que nao e a livre, sem repetir o `if:` de X.
  { nome: "a forma do #402 (o `!=` sem o `if:` de X)", de: INSTALL_IF, para: "if: github.event_name == 'pull_request' || steps.npmcache.outputs.cache-hit != 'true'", espera: "sem repetir o `if:`" },
  { nome: "um `||` com o `if:` de X", de: INSTALL_IF, para: "if: (steps.scope.outputs.app == 'true' || github.event_name == 'push') || steps.npmcache.outputs.cache-hit != 'true'", espera: "sem repetir o `if:`" },
  { nome: "um `!(...)` do `if:` de X", de: INSTALL_IF, para: "if: !(steps.scope.outputs.app == 'true' || github.event_name == 'push') && steps.npmcache.outputs.cache-hit != 'true'", espera: "sem repetir o `if:`" },
  { nome: "`!steps.X.outputs`", de: INSTALL_IF, para: "if: github.event_name == 'push' && !steps.npmcache.outputs.cache-hit", espera: "sem repetir o `if:`" },
  { nome: "`== ''`", de: INSTALL_IF, para: "if: github.event_name == 'push' && steps.npmcache.outputs.cache-hit == ''", espera: "sem repetir o `if:`" },
  { nome: "os operandos trocados", de: INSTALL_IF, para: "if: github.event_name == 'push' && 'true' != steps.npmcache.outputs.cache-hit", espera: "sem repetir o `if:`" },
  { nome: "`!contains(...)`", de: INSTALL_IF, para: "if: github.event_name == 'push' && !contains(steps.npmcache.outputs.cache-hit, 'true')", espera: "sem repetir o `if:`" },
  { nome: "`['cache-hit']`", de: INSTALL_IF, para: "if: github.event_name == 'push' && steps.npmcache.outputs['cache-hit'] != 'true'", espera: "sem repetir o `if:`" },
  { nome: "o leitor corre depois de uma falha e X nao", de: "if: (steps.scope.outputs.app == 'true' || github.event_name == 'push') && github.event_name == 'push' && steps.npmcache.outputs.cache-hit != 'true'\n", para: "if: ${{ always() && (steps.scope.outputs.app == 'true' || github.event_name == 'push') && github.event_name == 'push' && steps.npmcache.outputs.cache-hit != 'true' }}\n", espera: "corre depois de uma falha" },
  { nome: "a chave da node_modules pelo texto do .nvmrc", de: "-abi$(node -p process.versions.modules)-", para: "-node$(tr -d '[:space:]' < .nvmrc)-", espera: "o ABI do Node" },
  // Os que correm SEMPRE.
  { nome: "o Gitleaks sem `!cancelled()`", de: "if: ${{ !cancelled() }}\n        uses: gitleaks", para: "uses: gitleaks", espera: "com `!cancelled()`" },
  { nome: "o Hooks sem `!cancelled()`", de: "if: ${{ !cancelled() && github.event_name == 'pull_request' }}\n        run: node .claude/hooks", para: "if: github.event_name == 'pull_request'\n        run: node .claude/hooks", espera: "com `!cancelled()`" },
  { nome: "o Backlog Check so nos PRs de app", de: "if: ${{ !cancelled() && github.event_name == 'pull_request' }}\n        run: node .agent/scripts/check-backlog.mjs", para: "if: ${{ !cancelled() && github.event_name == 'pull_request' && steps.scope.outputs.app == 'true' }}\n        run: node .agent/scripts/check-backlog.mjs", espera: "nao depende do alcance" },
  { nome: "o Gitleaks so nos PRs de app", de: "if: ${{ !cancelled() }}\n        uses: gitleaks", para: "if: ${{ !cancelled() && steps.scope.outputs.app == 'true' }}\n        uses: gitleaks", espera: "nao depende do alcance" },
  { nome: "as mensagens so num PR", de: "        if: ${{ !cancelled() }}\n        env:\n          EVENTO", para: "        if: ${{ !cancelled() && github.event_name == 'pull_request' }}\n        env:\n          EVENTO", espera: "em todos os eventos" },
  { nome: "sem o passo das mensagens", todos: true, de: "node .githooks/commit-msg", para: "echo", espera: "falta o passo das mensagens" },
  { nome: "sem o passo do gitleaks", de: "uses: gitleaks/gitleaks-action@", para: "uses: outro/scan@", espera: "falta o passo do gitleaks" },
  { nome: "o Gitleaks sem a licenca", de: "          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}", para: "", espera: "GITLEAKS_LICENSE" },
  { nome: "a chave da node_modules sem a arquitetura", de: "node-modules-$RUNNER_OS-$RUNNER_ARCH-", para: "node-modules-$RUNNER_OS-", espera: "`$RUNNER_ARCH`" },
  // Na variante T80.
  { base: "t80", nome: "T80: `restore-keys` na node_modules", de: "path: node_modules\n          key: ${{ steps.deps.outputs.nm_key }}\n          lookup-only", para: "path: node_modules\n          key: ${{ steps.deps.outputs.nm_key }}\n          restore-keys: node-modules-\n          lookup-only", espera: "sem `restore-keys`" },
  { base: "t80", nome: "T80: a forma do #402 na gravacao do npm", de: "&& github.event_name == 'push' && steps.nmcache.outputs.cache-hit != 'true' && steps.npmcache.outputs.cache-hit != 'true'", para: "&& github.event_name == 'push' && steps.npmcache.outputs.cache-hit != 'true'", espera: "sem repetir o `if:`" },
  { base: "t80", nome: "T80: as verificacoes sem a node_modules da cache como instalacao", de: "&& (steps.install.conclusion == 'success' || steps.nmcache.outputs.cache-hit == 'true') }}\n        run: npx tsc", para: "&& steps.install.conclusion == 'success' }}\n        run: npx tsc", espera: "nao corre num PR de app com a node_modules" },
  { base: "t80", nome: "T80: a node_modules sem `lookup-only` no push", de: "key: ${{ steps.deps.outputs.nm_key }}\n          lookup-only: ${{ github.event_name == 'push' }}", para: "key: ${{ steps.deps.outputs.nm_key }}", espera: "`lookup-only`" },
];
for (const m of MUTACOES) {
  caso(`controlo: ${m.nome}`, () => {
    const base = m.base === "t80" ? T80 : texto;
    if (base === null || !base.includes(m.de)) return [`o texto a mutar ja nao esta no exemplo: ${m.de.slice(0, 80)}`];
    const ps = problemas(m.todos ? base.replaceAll(m.de, m.para) : base.replace(m.de, () => m.para));
    return ps.some((p) => p.includes(m.espera)) ? [] : [`esperava um problema com "${m.espera}"; deu: ${ps.join(" | ") || "nenhum"}`];
  });
}

// O shell do `scope`.
const ESPACO = "src/um \"nome\" com aspas.ts";
const QUEBRA = "src/linha\npartida.ts";
const CASOS_SCOPE = [
  { nome: "PR so de docs -> app=false", evento: "pull_request", muda: (d) => writeFileSync(join(d, "docs", "d.md"), "d2\n"), app: "false" },
  { nome: "PR que toca na app -> app=true", evento: "pull_request", muda: (d) => writeFileSync(join(d, "src", "a.ts"), "a2\n"), app: "true" },
  { nome: "push -> app=false", evento: "push", muda: (d) => writeFileSync(join(d, "src", "a.ts"), "a2\n"), app: "false" },
  { nome: "um ficheiro da app movido para docs/ -> app=true", evento: "pull_request", muda: (d) => git(d, "mv", "src/a.ts", "docs/a.ts"), app: "true" },
  { nome: "um nome da app com aspas e espacos -> app=true", evento: "pull_request", muda: (d) => writeFileSync(join(d, ESPACO), "x\n"), app: "true" },
  { nome: "um nome da app com uma quebra de linha -> app=true", evento: "pull_request", muda: (d) => writeFileSync(join(d, QUEBRA), "x\n"), app: "true" },
];
for (const c of CASOS_SCOPE) {
  caso(`scope: ${c.nome}`, () => comRepo((raiz) => {
    if (scopeCorpo === null) return ["nao encontrei o corpo do passo `scope`"];
    const r = correScope(scopeCorpo, repoDePR(raiz, c.muda), raiz, c.evento);
    return r.status === 0 && r.app === c.app ? [] : [`saiu ${r.status}, app=${r.app} (esperava 0, app=${c.app}): ${r.saida.trim()}`];
  }));
}
caso("scope: um PR sem `HEAD^1` (commit-raiz) -> app=true", () => comRepo((raiz) => {
  const dir = join(raiz, "repo");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "d.md"), "d\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "raiz");
  const r = correScope(scopeCorpo ?? "", dir, raiz, "pull_request");
  return r.status === 0 && r.app === "true" ? [] : [`saiu ${r.status}, app=${r.app}: ${r.saida.trim()}`];
}));
caso("scope: o `git diff` a falhar -> app=true (falha fechada)", () => comRepo((raiz) => {
  const dir = repoDePR(raiz, (d) => writeFileSync(join(d, "docs", "d.md"), "d2\n"));
  const bin = join(raiz, "bin");
  mkdirSync(bin);
  const real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh\nif [ "$1" = "diff" ]; then exit 1; fi\nexec "${real}" "$@"\n`);
  chmodSync(join(bin, "git"), 0o755);
  const r = correScope(scopeCorpo ?? "", dir, raiz, "pull_request", `${bin}:${process.env.PATH}`);
  return r.status === 0 && r.app === "true" ? [] : [`saiu ${r.status}, app=${r.app}: ${r.saida.trim()}`];
}));
caso("scope: um evento desconhecido sai != 0 (e nao escreve app)", () => comRepo((raiz) => {
  const dir = repoDePR(raiz, (d) => writeFileSync(join(d, "src", "a.ts"), "a2\n"));
  const r = correScope(scopeCorpo ?? "", dir, raiz, "workflow_dispatch");
  return r.status !== 0 && r.app === null ? [] : [`saiu ${r.status}, app=${r.app}`];
}));

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
