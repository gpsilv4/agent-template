/**
 * Os leitores dos exemplos de CI de um derivado sem a maquinaria (`src/docs/exemplos/`, #429 e #439) — {{PROJECT_NAME}}
 *
 * Sairam do `test-ci-exemplo.mjs` quando ele chegou as ~500 linhas (#439): as expressoes de um `if:`, as chaves de um
 * passo, os eventos, o avaliador de uma tabela de verdade, as variantes comentadas, e as fixtures git onde o shell de
 * um passo corre. NAO e uma suite nem um modulo descoberto (`tests-*.mjs`): e um ajudante que a suite e o
 * `harness/casos-salto-cache.mjs` importam. Sem sitios de recusa: so le.
 */
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { jobsDe, passosDe, indent, semComentario } from "../../lib/estrutura-workflow.mjs";

// --- As expressoes de um `if:` ---

/** O `if:` sem `${{ }}` e com os espacos colapsados. */
export const normaliza = (e) => e.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, "$1").replace(/\s+/g, " ").trim();

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
export function semExteriores(c) {
  let s = c.trim();
  while (s.startsWith("(") && fecho(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
  return s;
}

/** Partir `s` no operador `op` (`&&` ou `||`) a profundidade 0, fora de aspas. */
export function parteNoTopo(s, op) {
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
export const conjuntos = (expr) => parteNoTopo(normaliza(expr), "&&");

// A forma LIVRE de um conjunto: um `==` com um literal NAO vazio sobre a saida ou a conclusao de um passo (saltado, a
// saida e `''` e a conclusao `'skipped'`: as duas tornam a forma falsa), ou um `||` feito so de formas livres.
const ATOMO_LIVRE = /^steps\.[\w-]+\.(?:outputs\.[\w-]+|conclusion|outcome) == '[^']+'$/;
export const livre = (c) => parteNoTopo(c, "||").every((a) => ATOMO_LIVRE.test(a));
export const REFS = /steps\.([\w-]+)\.(?:outputs|conclusion|outcome)\b/g;
// O que a regra nao ve, e por isso se recusa: os passos lidos por indice, ou inteiros.
export const OPACO = /\bsteps\s*\[|\bsteps\.[\w-]+\s*\[|toJSON\s*\(\s*steps\b/;
/** As funcoes que deixam um passo correr depois de uma falha (os nomes nao distinguem maiusculas no GitHub). */
const DEPOIS_DE_FALHA = /(!\s*cancelled|\balways|\bfailure)\s*\(\s*\)/gi;
export const depoisDeFalha = (e) => new Set([...(e ?? "").matchAll(DEPOIS_DE_FALHA)].map((m) => m[0].replace(/\s+/g, "").toLowerCase()));

/**
 * A regra da saida de um passo saltado, sobre os passos de um job: cada conjunto que le a saida de X fora da forma
 * livre repete o `if:` de X, e nao corre depois de uma falha que X nao corre. (O porque no cabecalho da suite.)
 */
export function problemasDeSaidas(passos) {
  const out = [];
  const porId = new Map(passos.filter((p) => p.id).map((p) => [p.id, p]));
  for (const p of passos) {
    const nome = p.name ?? p.uses ?? "?";
    if (OPACO.test(p.if ?? "")) out.push(`${nome}: le os passos por uma forma que a regra nao ve (\`steps[...]\`, \`toJSON(steps)\`)`);
    const cs = conjuntos(p.if ?? "");
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
  return out;
}

/**
 * O valor de um `if:` num cenario. `ctx`: o valor de cada `steps.X…`, `github.event_name` e `github.event.…`; o que
 * falta e `''`, como no GitHub (um `head_commit` nulo le-se vazio). `!cancelled()`, `always()` e `success()` sao
 * verdadeiros (nenhum cancelamento); `failure()` falso; `startsWith` e `contains` sobre texto, sem distinguir
 * maiusculas (como o GitHub). `null` quando a expressao tem algo que isto nao avalia (`fromJSON`, `hashFiles`…): e
 * um problema, nao um "passa".
 */
export function avalia(expr, ctx) {
  if (!expr) return true;
  const js = normaliza(expr)
    .replace(/\bsteps\.[\w-]+\.(?:outputs\.[\w-]+|conclusion|outcome)|\bgithub\.event(?:_name\b|(?:\.[\w-]+)+)/g, (v) => `v(${JSON.stringify(v)})`)
    .replace(/!\s*cancelled\s*\(\s*\)|\balways\s*\(\s*\)|\bsuccess\s*\(\s*\)/gi, "true")
    .replace(/\bfailure\s*\(\s*\)/gi, "false")
    .replace(/\bstartsWith\s*\(/gi, "sw(")
    .replace(/\bcontains\s*\(/gi, "ct(");
  if (/[a-z]\w*\s*\(/i.test(js.replace(/v\("[^"]*"\)/g, "").replace(/\b(?:sw|ct)\(/g, "").replace(/'[^']*'/g, "''"))) return null;
  const txt = (x) => String(x ?? "").toLowerCase();
  try {
    return Boolean(
      new Function("v", "sw", "ct", `return (${js});`)(
        (k) => ctx[k] ?? "",
        (a, b) => txt(a).startsWith(txt(b)),
        (a, b) => txt(a).includes(txt(b))
      )
    );
  } catch {
    return null;
  }
}

/**
 * Os `if:` (de job e de passo) escritos como ESCALAR SIMPLES que o YAML le de outra maneira (#439): um `#` depois de
 * um espaco comeca um comentario e corta a condicao (o `'Merge pull request #'` do derivado A), e um escalar comecado
 * por `!`, `&`, `*`, `{` ou `[` e uma tag, uma ancora, um alias ou uma colecao. Le as linhas CRUAS: o leitor de jobs ja
 * tira os comentarios, e e por isso que o corte passava calado. Em bloco (`>-`, `|`) ou entre aspas, o `#` e texto.
 */
export function cortesDosIf(texto) {
  const out = [];
  const ls = texto.split(/\r\n|\r|\n/);
  ls.forEach((l, i) => {
    const m = /^[ \t]*(?:-[ \t]+)?if[ \t]*:[ \t]*(.*)$/.exec(l);
    if (!m || m[1] === "" || /^[>|'"]/.test(m[1])) return;
    // Um escalar simples continua nas linhas seguintes mais indentadas que a chave (o YAML junta-as com um espaco):
    // o ` #` de uma delas corta tambem. Acaba numa linha vazia, num comentario, numa chave ou num `-`.
    let v = m[1];
    const ind = indent(l.replace(/-[ \t]+(?=if[ \t]*:)/, (x) => " ".repeat(x.length)));
    for (let j = i + 1; j < ls.length && ls[j].trim() && indent(ls[j]) > ind && !/^[ \t]*(?:#|-[ \t]|[\w-]+[ \t]*:)/.test(ls[j]) && !/(^|[ \t])#/.test(v); j++) v = `${v} ${ls[j].trim()}`;
    if (/^[!&*{[]/.test(v)) out.push(`linha ${i + 1}: o \`if:\` comeca por \`${v[0]}\`, que o YAML le como outra coisa — usar \`\${{ }}\` ou um bloco (\`if: >-\`)`);
    const cortado = semComentario(v).trim();
    if (incompleta(cortado)) out.push(`linha ${i + 1}: ${cortado === v.trim() ? "o `if:` nao fecha" : "um ` #` corta o `if:`: o YAML le o resto como comentario"} (\`${cortado}\`) — escrever em bloco (\`if: >-\`)`);
  });
  return out;
}
/** Aspas, parenteses ou `${{` por fechar. */
function incompleta(s) {
  let fundo = 0;
  let aspa = null;
  for (const ch of s) {
    if (aspa) {
      if (ch === aspa) aspa = null;
    } else if (ch === "'" || ch === '"') aspa = ch;
    else if (ch === "(") fundo++;
    else if (ch === ")") fundo--;
  }
  return aspa !== null || fundo !== 0 || (s.match(/\$\{\{/g) ?? []).length !== (s.match(/\}\}/g) ?? []).length;
}

// --- Os jobs e os passos ---

/** O `if:` de primeiro nivel de um job: `{ forma: "bloco" | "simples", valor }`, ou `null` sem ele. Le as linhas
 *  CRUAS (`todas`): dentro de um bloco o `#` e texto, e o leitor de jobs ja o tinha cortado. */
export function ifDeJob(job) {
  const ne = job.ls.slice(1).filter((l) => l.trim());
  if (!ne.length) return null;
  const ind = Math.min(...ne.map(indent));
  const k = job.ls.findIndex((l, i) => i > 0 && l.trim() && indent(l) === ind && /^[ \t]*if[ \t]*:/.test(l));
  if (k < 0) return null;
  const v = job.todas[k].replace(/^[ \t]*if[ \t]*:[ \t]*/, "");
  if (!/^[>|]/.test(v)) return { forma: "simples", valor: semComentario(v).trim() };
  const corpo = [];
  for (let j = k + 1; j < job.todas.length && (!job.todas[j].trim() || indent(job.todas[j]) > ind); j++) corpo.push(job.todas[j].trim());
  return { forma: "bloco", valor: corpo.filter(Boolean).join(v.startsWith(">") ? " " : "\n") };
}

/** As chaves de um passo: `{ name, id, if, uses, run, with: {k: v}, env: {k: v}, ls, cru }`. */
export function chavesDe(passo) {
  const p = { with: {}, env: {}, ls: passo.ls, cru: passo.cru };
  const primeira = passo.ls[0].replace(/^([ \t]*)-[ \t]*/, (_, a) => `${a}  `);
  const linhas = [primeira, ...passo.ls.slice(1)];
  const kInd = indent(primeira);
  let emMapa = null;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.trim()) continue;
    const m = /^[ \t]*["']?([\w-]+)["']?[ \t]*:[ \t]*(.*)$/.exec(l);
    if (!m) continue;
    if (indent(l) === kInd) {
      emMapa = m[1] === "with" || m[1] === "env" ? m[1] : null;
      if (!emMapa) p[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
      if (m[1] === "run") p.runIdx = i;
    } else if (emMapa && indent(l) > kInd) p[emMapa][m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
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

/** O job unico de um exemplo, e os seus passos (`passos: []` quando nao ha exatamente um job). */
export function passosDoExemplo(texto) {
  const jobs = jobsDe(texto);
  if (jobs.length !== 1) return { jobs, passos: [] };
  return { jobs, passos: (passosDe(jobs[0].ls, jobs[0].todas) ?? []).map(chavesDe) };
}

/** Os eventos do `on:` de topo. */
export function eventos(texto) {
  const ls = texto.split("\n");
  const i = ls.findIndex((l) => /^["']?on["']?[ \t]*:/.test(l));
  if (i < 0) return [];
  const fim = ls.findIndex((l, j) => j > i && /^[^\s#]/.test(l));
  const filhos = ls.slice(i + 1, fim < 0 ? ls.length : fim).filter((l) => l.trim() && !/^[ \t]*#/.test(l));
  if (!filhos.length) return [];
  const ind = Math.min(...filhos.map(indent));
  return filhos.filter((l) => indent(l) === ind).map((l) => l.trim().replace(/[ \t]*:.*$/, ""));
}

// --- As variantes comentadas ---

const descomenta = (l) => l.replace(/^([ \t]*)# ?/, "$1").replace(/^[ \t]+$/, "");

/** O exemplo com o bloco CACHE trocado pelo bloco OPCIONAL T80 descomentado. */
export function comT80(texto) {
  const ls = texto.split("\n");
  const at = (re) => ls.findIndex((l) => re.test(l));
  const [ci, cf, ti, tf] = [at(/# --- CACHE inicio ---/), at(/# --- CACHE fim ---/), at(/# --- OPCIONAL T80 inicio/), at(/# --- OPCIONAL T80 fim ---/)];
  if ([ci, cf, ti, tf].some((k) => k < 0) || !(ci < cf && cf < ti && ti < tf)) return null;
  const p0 = ls.findIndex((l, k) => k > ti && k < tf && /^[ \t]*# - name:/.test(l));
  if (p0 < 0) return null;
  const t80 = ls.slice(p0, tf).map(descomenta);
  // A segunda edicao que o comentario do T80 pede: nas verificacoes, a pasta da cache vale como instalacao.
  return [...ls.slice(0, ci), ...t80, ...ls.slice(cf + 1, ti), ...ls.slice(tf + 1)].join("\n")
    .replaceAll("steps.install.conclusion == 'success'", "(steps.install.conclusion == 'success' || steps.nmcache.outputs.cache-hit == 'true')");
}

/** O exemplo com a VARIANTE squash (#439): sai o que esta entre `# --- FORMA mensagem inicio/fim ---`, e descomenta-se
 *  o que esta entre cada `# --- VARIANTE squash inicio/fim ---`. `null` sem os marcadores, ou com eles desemparelhados. */
export function comSquash(texto) {
  const ls = texto.split("\n");
  const fi = ls.filter((l) => /# --- FORMA mensagem inicio ---/.test(l)).length;
  const ff = ls.filter((l) => /# --- FORMA mensagem fim ---/.test(l)).length;
  const vi = ls.filter((l) => /# --- VARIANTE squash inicio ---/.test(l)).length;
  const vf = ls.filter((l) => /# --- VARIANTE squash fim ---/.test(l)).length;
  if (fi !== 1 || ff !== 1 || vi === 0 || vi !== vf) return null;
  const out = [];
  let estado = null;
  for (const l of ls) {
    if (/# --- FORMA mensagem inicio ---/.test(l)) estado = "fora";
    else if (/# --- VARIANTE squash inicio ---/.test(l)) estado = "dentro";
    else if (/# --- (?:FORMA mensagem|VARIANTE squash) fim ---/.test(l)) estado = null;
    else if (estado === "dentro") out.push(descomenta(l));
    else if (estado !== "fora") out.push(l);
  }
  return estado === null ? out.join("\n") : null;
}

// --- O shell de um passo, corrido ---

export function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}
/** Um repo cujo HEAD e um merge (o merge ref de um PR): `HEAD^1` a base, e o ramo com `muda(dir)`. `base(dir)` corre
 *  antes do primeiro commit. */
export function repoDePR(raiz, muda, base = () => {}) {
  const dir = join(raiz, "repo");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "a\n");
  writeFileSync(join(dir, "docs", "d.md"), "d\n");
  base(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "checkout", "-q", "-b", "pr");
  muda(dir);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", "pr");
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--no-ff", "-m", "merge", "pr");
  return dir;
}
/** Corre o corpo de um passo como o runner: `bash -e`, com `GITHUB_OUTPUT`, `RUNNER_TEMP` e o `env` do passo.
 *  Devolve as saidas escritas no `GITHUB_OUTPUT` (`{ k: v }`). */
export function correPasso(corpo, dir, raiz, env, path = process.env.PATH) {
  const script = join(raiz, "passo.sh");
  writeFileSync(script, corpo);
  const out = join(raiz, "output");
  writeFileSync(out, "");
  const temp = join(raiz, "runner-temp");
  mkdirSync(temp, { recursive: true });
  const r = spawnSync("bash", ["-e", script], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: path, GITHUB_OUTPUT: out, RUNNER_TEMP: temp, ...env } });
  const saidas = Object.fromEntries([...readFileSync(out, "utf8").matchAll(/^([\w-]+)=(.*)$/gm)].map((m) => [m[1], m[2]]));
  return { status: r.status, saidas, saida: `${r.stdout}${r.stderr}` };
}
/** Um diretorio temporario (o prefixo esta no `lib/tmp-limpo.mjs`), apagado no fim. */
export function comRepo(fn) {
  const raiz = mkdtempSync(join(tmpdir(), "ci-exemplo-test-"));
  try {
    return fn(raiz);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
