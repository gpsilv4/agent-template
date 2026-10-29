/**
 * Os passos que SALTAM por uma variavel (#353) — {{PROJECT_NAME}}
 *
 * Os passos da app do `ci.yml` saltam no shell quando uma variavel diz que nao ha app:
 * `env: TEM_APP: ${{ steps.check.outputs.has_pkg }}` e `case "$TEM_APP" in true) ;; false) ... exit 0;; ...`.
 * Um valor LITERAL (`TEM_APP: 'false'`), uma expressao que da sempre o mesmo (`${{ x && 'false' }}`) ou o `env:`
 * passado do passo para o job desligam o passo sem nenhuma marca e sem nenhuma contagem que desca. O gate
 * (`superficie-gate.mjs`, `verificaGate`) chama `saltosNovos` e poe o que sair nos seus `sinais`, com o trailer
 * `Test-Surface:` como saida — o idioma do deploy (`TARGET: staging` + `case "$TARGET"`) e legitimo.
 *
 * A UNIDADE e `(job, chave)`, e conta-se o NUMERO de passos suspeitos dela: avisa quando ha mais agora do que na
 * base. Renomear ou reordenar passos fica calado; um passo novo, ou um nome repetido, com um valor suspeito, avisa.
 * O VALOR EFETIVO e o do `env:` do passo, senao o do job, senao o do workflow (a precedencia do GitHub).
 * SUSPEITO (o `classe`): um LITERAL cujo ramo do `case` sai sem erro (o passo salta) — o `true` do template cai no
 * `true) ;;` e corre, o mesmo `true` num `case ... in true) exit 0` salta; uma EXPRESSAO sem referencias, ou com um
 * literal que vence (`&& 'false'`, `'false' ||`); a chave REATRIBUIDA no proprio `run` (`K=false`); e o que nao se
 * le (falha fechada). Seguro: uma referencia, uma comparacao, `!x`, `x || 'padrao'`; o `${{ env.X }}` le-se como o X
 * do job ou do workflow. O idioma do deploy (`TARGET: staging` + um ramo que faz deploy) fica seguro.
 * LIMITES (escritos): editar o `case` em vez do `env:` (`true|false) exit 0;;`, #411); outras formas de ler a
 * variavel (`[[ $K == x ]]`, `test`, `case "x$K"`, um script externo, `switch ($env:K)`); as indireccoes que um
 * caminho de contexto esconde (`${{ matrix.x }}`, um output que escreve `false`, `vars.X`, `secrets.X`); o
 * `$GITHUB_ENV` de um passo anterior (#362) e a chave que nenhum `env:` define (e uma variavel da shell; no
 * template, tirar o `env:` faz o `*)` do `case` reprovar); um `case` partido de forma que a variavel e o `in`
 * fiquem fora do passo, e um ` #` numa string antes dele na mesma linha (o `semComentario` corta-a); de suspeito
 * para suspeito fica calado; trocar um suspeito por outro no mesmo `(job, chave)` fica calado; renomear o id do
 * job faz a unidade nascer (avisa).
 * O gate so olha os workflows que ja existiam e correm testes, e o trailer aceita o ficheiro inteiro.
 *
 * Cada aviso sai por `suspeito(`, o sinal do par em `lib/pares.mjs`; o dono na varredura e o
 * `tests/tests-saltos-variavel.mjs`, no `test-guards`.
 */
import { semComentario, indent, idDe } from "./estrutura-workflow.mjs";

/** Le uma variavel num `case` — `case "$K"`, `case $K`, `case "${K}"`, `case "${K:-x}"`, `case "${K,,}"` — com
 *  quebras de linha pelo meio. O nome vem no grupo 1 (com chavetas) ou no 2 (sem). */
const CASE = /\bcase[ \t\r\n]+["']?\$(?:\{([A-Za-z_]\w*)[^}]*\}|([A-Za-z_]\w*))["']?[ \t\r\n]+in\b/g;
/** Uma referencia de contexto EXACTA: um caminho de propriedades, sem operadores nem literais. */
const REFERENCIA = /^\$\{\{[ \t]*[A-Za-z_][\w-]*(?:\.[\w-]+|\[["'][^"'\]]+["']\])+[ \t]*\}\}$/;
const ILEGIVEL = Symbol("ilegivel");
/** Um ramo que SAI sem erro (`exit`, `exit 0`, `exit $x`): o passo salta. Um `exit 1` reprova, e nao e um salto. */
const SALTA = /\bexit\b(?![ \t]+["']?[1-9])/;
const LITERAL = /'[^']*'|\btrue\b|\bfalse\b|\bnull\b|\b\d+\b/.source;

/** Os ramos do `case` que comeca em `depois` (o texto a seguir ao `in`, ate ao `esac`): `[{ padroes, corpo }]`, ou
 *  `null` quando nao se leem (falha fechada). */
function ramosDe(depois) {
  const fim = depois.search(/\besac\b/);
  if (fim < 0) return null;
  const ramos = [];
  for (const r of depois.slice(0, fim).split(/;;&?|;&/)) {
    if (!r.trim()) continue;
    const m = /^[ \t\r\n]*\(?[ \t]*([^()]*?)[ \t]*\)([\s\S]*)$/.exec(r);
    if (!m) return null;
    const glob = (g) => new RegExp(`^${g.replace(/^(["'])(.*)\1$/, "$2").replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
    ramos.push({ padroes: m[1].split("|").map((g) => glob(g.trim())), corpo: m[2] });
  }
  return ramos;
}

/** O passo SALTA com o literal `s`? O primeiro ramo que o casa decide (como a shell); nenhum, corre. `null`: nao se le. */
function saltaCom(casos, s) {
  for (const depois of casos) {
    const ramos = ramosDe(depois);
    if (ramos === null) return null;
    const r = ramos.find((x) => x.padroes.some((g) => g.test(s)));
    if (r && SALTA.test(r.corpo)) return true;
  }
  return false;
}

/**
 * `seguro` ou `suspeito`, para o valor cru `v` de uma chave que os `casos` (o texto a seguir a cada `in`) leem.
 *  - Um LITERAL e julgado pelo ramo que apanha: suspeito se esse ramo sai sem erro (o passo salta). O `true` do
 *    template cai no `true) ;;` e corre; o mesmo `true` num `case ... in true) exit 0` salta (as duas leituras).
 *  - Uma EXPRESSAO e suspeita sem nenhuma referencia (`${{ 'false' }}`) ou com um literal que vence
 *    (`${{ x && 'false' }}`, `${{ 'false' || x }}`); uma referencia, uma comparacao, um `!x` ou um `x || 'padrao'`
 *    nao sao constantes. `${{ env.X }}` le-se como o X do `env:` do job ou do workflow (`outros`).
 *  - O que nao se le e suspeito (falha fechada).
 */
export function classe(v, casos = [], outros = []) {
  if (typeof v !== "string") return "suspeito";
  // Um escalar em bloco (`>-`, `|`), um alias (`*a`), uma ancora (`&a`) ou uma tag (`!x`): o valor nao esta aqui.
  if (/^[|>*&!]/.test(v.trim())) return "suspeito";
  const s = v.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!s.startsWith("${{")) return saltaCom(casos, s) === false ? "seguro" : "suspeito";
  const env = /^\$\{\{[ \t]*env\.([A-Za-z_]\w*)[ \t]*\}\}$/.exec(s);
  if (env) {
    const x = outros.map((e) => valorDe(e, env[1])).find((y) => y !== undefined);
    return classe(x === ILEGIVEL ? undefined : x ?? "", casos);
  }
  if (REFERENCIA.test(s)) return "seguro";
  if (!/\}\}$/.test(s)) return "suspeito";
  const dentro = s.slice(3, -2).trim();
  const semTexto = dentro.replace(/'[^']*'/g, "''");
  const temReferencia = /(?:^|[^\w.'-])[A-Za-z_][\w-]*(?:\.[\w-]+|\[)/.test(semTexto);
  const literalVence = new RegExp(`&&[ \\t]*(?:${LITERAL})[ \\t]*$|^(?:${LITERAL})[ \\t]*\\|\\|`).test(dentro);
  return temReferencia && !literalVence ? "seguro" : "suspeito";
}

/** As chaves de um `env:` (`ls[i]` e a linha da chave), cada uma com o valor cru. Um `env:` que nao se le (uma
 *  expressao, um alias) devolve `ILEGIVEL`: cada chave lida dele e suspeita. */
function envDe(ls, i) {
  const em = ls[i].replace(/^[ \t]*-?[ \t]*["']?env["']?[ \t]*:[ \t]*/, "");
  const out = new Map();
  if (em.startsWith("{")) {
    // Os pares separam-se nas virgulas de TOPO: as chavetas e as virgulas de um `${{ ... }}` sao do valor.
    if (!/^\{(?:[^{}]|\$\{\{[^}]*\}\})*\}$/.test(em)) return ILEGIVEL;
    for (const par of em.slice(1, -1).match(/(?:[^,$]|\$(?!\{\{)|\$\{\{[^}]*\}\})+/g) ?? []) {
      const m = /^[ \t]*["']?([A-Za-z_]\w*)["']?[ \t]*:(.*)$/.exec(par);
      if (m) out.set(m[1], m[2]);
    }
    return out;
  }
  if (em) return ILEGIVEL;
  const filhas = [];
  for (let k = i + 1; k < ls.length && (!ls[k].trim() || indent(ls[k]) > indent(ls[i].replace("-", " "))); k++) if (ls[k].trim()) filhas.push(ls[k]);
  if (filhas.length === 0) return out;
  const ind = Math.min(...filhas.map(indent));
  for (const l of filhas.filter((x) => indent(x) === ind)) {
    const m = /^[ \t]*["']?([A-Za-z_]\w*)["']?[ \t]*:(.*)$/.exec(l);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/** O `env:` de primeiro nivel de um bloco (as linhas `ls`, com a chave a indentacao `ind`), ou um mapa vazio. */
function envDoNivel(ls, ind) {
  const i = ls.findIndex((l) => l.trim() && indent(l.replace(/^([ \t]*)-/, "$1 ")) === ind && /^[ \t]*-?[ \t]*["']?env["']?[ \t]*:/.test(l));
  return i < 0 ? new Map() : envDe(ls, i);
}

const valorDe = (env, k) => (env === ILEGIVEL ? ILEGIVEL : env.get(k));

/** Os passos de um job (cada um uma lista de linhas, a primeira com o `-`), ou `null` com `steps:` em flow. */
function passosDe(job) {
  const iSteps = job.findIndex((l) => /^[ \t]*steps[ \t]*:/.test(l));
  if (iSteps < 0) return [];
  if (/^[ \t]*steps[ \t]*:[ \t]*\S/.test(job[iSteps])) return null;
  const sInd = indent(job[iSteps]);
  const ls = [];
  for (let k = iSteps + 1; k < job.length && (!job[k].trim() || indent(job[k]) > sInd || /^[ \t]*-/.test(job[k])); k++) ls.push(job[k]);
  const ne = ls.filter((l) => l.trim());
  if (ne.length === 0) return [];
  const ind = Math.min(...ne.map(indent));
  const passos = [];
  for (const l of ls) {
    if (l.trim() && indent(l) === ind && /^[ \t]*-/.test(l)) passos.push([l]);
    else if (passos.length) passos.at(-1).push(l);
  }
  return passos;
}

/**
 * As unidades `(job, chave)` de um workflow, com o numero de passos SUSPEITOS de cada uma: os que leem a chave num
 * `case` e cujo valor efetivo nao e seguro. Um job com `steps:` em flow conta como um suspeito por chave lida
 * (falha fechada).
 * @param {string | null} texto
 * @returns {Map<string, { job: string, chave: string, n: number, valores: string[] }>}
 */
export function saltosPorVariavel(texto) {
  const out = new Map();
  if (!texto) return out;
  const ls = texto.split(/\r\n|\r|\n/).map(semComentario);
  const doWorkflow = envDoNivel(ls, 0);
  const iJobs = ls.findIndex((l) => /^jobs[ \t]*:/.test(l));
  if (iJobs < 0) return out;
  const fim = ls.findIndex((l, j) => j > iJobs && /^[^\s#]/.test(l));
  const corpo = ls.slice(iJobs + 1, fim < 0 ? ls.length : fim);
  const ne = corpo.filter((l) => l.trim());
  if (ne.length === 0) return out;
  const jInd = Math.min(...ne.map(indent));
  const jobs = [];
  for (const l of corpo) {
    if (l.trim() && indent(l) === jInd) jobs.push([l]);
    else if (jobs.length) jobs.at(-1).push(l);
  }
  const soma = (job, chave, v) => {
    const k = `${job}\u0000${chave}`;
    const u = out.get(k) ?? { job, chave, n: 0, valores: [] };
    u.n++;
    u.valores.push(v === ILEGIVEL ? "(um env: que nao se le)" : v.trim() || "(vazio)");
    out.set(k, u);
  };
  for (const job of jobs) {
    const id = idDe(job[0]);
    const corpoJob = job.slice(1).filter((l) => l.trim());
    const doJob = corpoJob.length ? envDoNivel(job, Math.min(...corpoJob.map(indent))) : new Map();
    const passos = passosDe(job);
    if (passos === null) {
      for (const m of job.join("\n").matchAll(CASE)) soma(id, m[1] ?? m[2], ILEGIVEL);
      continue;
    }
    for (const p of passos) {
      // As chaves do passo ficam a coluna do que vem depois do `- ` (`- name: x` e `  env:` na linha seguinte).
      const doPasso = envDoNivel(p, indent(p[0].replace(/^([ \t]*)-/, "$1 ")));
      const texto = p.join("\n");
      const lidas = new Map();
      for (const m of texto.matchAll(CASE)) lidas.set(m[1] ?? m[2], [...(lidas.get(m[1] ?? m[2]) ?? []), texto.slice(m.index + m[0].length)]);
      for (const [chave, casos] of lidas) {
        // Uma chave que nenhum `env:` define e uma variavel da propria shell (`plano=...; case "$plano"`, medido no
        // `ci.yml`) ou do `$GITHUB_ENV` (#362): nao conta — contar dava um alarme por cada `case` sobre uma local.
        const v = [doPasso, doJob, doWorkflow].map((e) => valorDe(e, chave)).find((x) => x !== undefined);
        if (v === undefined) continue;
        // Reatribuida no proprio `run` antes do `case` (`K=false`): o `env:` deixa de decidir (leitura adversarial).
        if (new RegExp(`(?:^|[\\s;&|(])(?:export[ \\t]+)?${chave}=`).test(texto)) soma(id, chave, `${chave}= no run`);
        else if (classe(v === ILEGIVEL ? undefined : v, casos, [doJob, doWorkflow]) === "suspeito") soma(id, chave, v);
      }
    }
  }
  return out;
}

/**
 * Os avisos do PR: cada unidade com mais passos suspeitos agora do que na base. Uma linha por `(job, chave)`, com
 * quantos sao a mais e os valores (um `env:` de job suspeito diz-se uma vez, nao uma por passo).
 * @param {string | null} antes
 * @param {string | null} agora
 * @returns {string[]}
 */
export function saltosNovos(antes, agora) {
  const base = saltosPorVariavel(antes);
  const out = [];
  const suspeito = (m) => out.push(m);
  for (const [k, u] of saltosPorVariavel(agora)) {
    const antes_ = base.get(k)?.n ?? 0;
    if (u.n > antes_) suspeito(`${u.n - antes_} passo(s) a mais (${antes_} -> ${u.n}) do job \`${u.job}\` saltam por \`${u.chave}\` num \`case\` com um valor que nao vem de um output (${[...new Set(u.valores)].map((x) => `\`${x}\``).join(", ")}) — o passo pode saltar sem marca`);
  }
  return out;
}
