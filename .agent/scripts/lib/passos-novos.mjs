/**
 * Os passos NOVOS antes das suites (#362) — {{PROJECT_NAME}}
 *
 * O gate (`superficie-gate.mjs`) so via os passos que perdia: um passo NOVO "so alarga a rede". Mas um passo novo
 * ANTES das suites, num job da maquinaria, desliga-as sem tocar nelas: `run: printf 'process.exit(0)' >
 * .agent/scripts/tests/test-guards.mjs`, ou `echo "BASH_ENV=./x.sh" >> "$GITHUB_ENV"`. O `verificaGate` chama
 * `passosNovos` e poe o que sair nos seus `sinais`, com o trailer `Test-Surface:` como saida.
 *
 * QUE PASSOS: num job que EXISTIA na base e corre a maquinaria, os do agora ANTES do ultimo passo da maquinaria que ja
 * existia na base (uma verificacao acrescentada no fim nao mexe no limite), que nao existiam na base — multiconjunto pelo passo normalizado sem o `name:` e sem o `@ref` dos `uses:` (renomear, ou
 * o Dependabot subir uma versao, nao avisa), medido sobre os passos da base que estavam ANTES do ultimo da maquinaria
 * (mover um passo de depois para antes avisa). Um passo existente cujo `run:` muda e um passo novo.
 * O QUE PASSA, por lista do que e permitido (`TP6`; o resto avisa, e o que nao se le tambem):
 *  - as chaves do passo: `name`, `id`, `run`, `working-directory`, `if`, `timeout-minutes`, `continue-on-error`, e
 *    `uses`+`with` so nos `uses:` permitidos; uma chave repetida avisa;
 *  - o `run:` numa linha, ou `run: |`; cada LINHA FISICA do corpo, crua, e um comando (juntar as continuacoes `\`
 *    reabria a fuga: `ls \` + `# x` + `node -e ...` — a shell corre o `node -e`); sem `${{`, `$(`, `` ` ``, `<`,
 *    `>`, nem um prefixo `X=y`; os separadores (`;`, `&&`, `||`, `&`, `|`) partem os comandos, e CADA um tem de
 *    estar na lista: `echo`, `printf`, `ls`, `cat`, `pwd`, `true`, `which`, `printenv`; `env` sem argumentos;
 *    `set` so com o que endurece (`-e`, `-u`, `-x`, `-o pipefail`);
 *    `node`/`npm` `-v`/`--version`; `git status|log|show|diff|rev-parse|describe` sem `--output`/`--ext-diff`/
 *    `--exec-path`; e `[exec] node <caminho da maquinaria> [args]`, ancorado, sem `..`, sem opcoes antes, num passo
 *    sem `working-directory:` — se o ficheiro existia na base e nao mudou, ou, novo ou mudado, se tiver a forma de um
 *    PONTO DE ENTRADA de verificacao (`tests/test-*.mjs`, `check-*.mjs`, `simulate-*.mjs`, `mutation-sweep.mjs`, o
 *    runner em paralelo, os testes dos hooks, um `.githooks/<hook>`), e nao for uma ligacao simbolica;
 *  - os `uses:` `actions/checkout` (no `with:` so `fetch-depth`, `persist-credentials`, `fetch-tags`,
 *    `show-progress`) e `actions/setup-*` (so as versoes, `distribution`, `architecture`, `check-latest`, `cache`).
 * LIMITES (escritos): o codigo da maquinaria que o PR muda — um ponto de entrada, ou um modulo que ele importe —
 * corre antes das suites, como as proprias suites ja o correm (um ataque disfarcado de verificador); e o mesmo para
 * um passo que JA EXISTIA cujo efeito vem de ficheiros do PR (o `npm ci` corre os scripts do `package.json`, um
 * `uses: ./...` corre o `action.yml` mudado, um `./x.sh`) — o passo nao muda, logo nao e novo; um `actions/checkout`
 * novo sem `persist-credentials: false` guarda o token (nao desliga as suites); os argumentos de
 * um script que ja existe nao se julgam; os comandos da lista resolvem-se pelo `PATH` (um `$GITHUB_PATH` escrito por
 * uma suite, como o `ci.yml` ja diz); o nome de um `uses:` sem o `@ref` (o SHA trocado por um commit de um fork nao
 * se ve); um job NOVO, e os passos DEPOIS do ultimo da maquinaria, ficam de fora; o job `quality` de um template
 * so entra quando corre a maquinaria (alarga-lo dava um alarme a cada `npm ci`).
 *
 * Cada aviso sai por `novo(`, o sinal do par em `lib/pares.mjs`; o dono na varredura e o
 * `tests/tests-passos-novos.mjs`, no `test-guards`.
 */
import { indent, MAQUINARIA, jobsDe, passosDe } from "./estrutura-workflow.mjs";

const CHAVES = new Set(["name", "id", "run", "working-directory", "if", "timeout-minutes", "continue-on-error", "uses", "with"]);
const USES = /^(?:actions\/checkout|actions\/setup-[\w-]+)$/;
const WITH_CHECKOUT = /^(?:fetch-depth|persist-credentials|fetch-tags|show-progress)$/;
const WITH_SETUP = /^(?:[\w-]*version(?:-file)?|distribution|architecture|check-latest|cache|cache-dependency-path)$/;
const MAQ_ANCORADO = /^(?:\.\/)?(?:\.agent\/scripts|\.claude\/hooks|\.githooks)\/(?!.*\.\.)[\w./-]+$/;
const VERIFICADOR = /^(?:\.agent\/scripts\/(?:tests\/test-[\w-]+|check-[\w-]+|simulate-[\w-]+|mutation-sweep|lib\/suites-em-paralelo)\.mjs|\.claude\/hooks\/tests\/test-[\w-]+\.mjs|\.githooks\/[\w-]+(?:\.mjs)?)$/;
const LEITURA = /^(?:echo|printf|ls|cat|pwd|true|which|printenv)$/;
const GIT_LEITURA = /^(?:status|log|show|diff|rev-parse|describe)$/;

/** O que a shell corre numa linha, ou a razao de nao ser so leitura. `ctx` diz o que o PR fez aos ficheiros. */
function linhaDeLeitura(linha, ctx, comWorkdir) {
  if (/\$\{\{|\$\(|`|<|>/.test(linha)) return "expande ou redireciona";
  for (const c of linha.split(/;|&&|\|\||&|\|/).map((x) => x.trim()).filter(Boolean)) {
    if (/^[A-Za-z_]\w*=/.test(c)) return "tem um prefixo X=y";
    const t = c.split(/\s+/);
    if (LEITURA.test(t[0]) || (t[0] === "env" && t.length === 1)) continue;
    // `set` so com opcoes: cada `run:` corre numa shell sua, e um `set` num passo nao chega as suites (a 2.a leitura).
    if (t[0] === "set" && t.length > 1 && t.slice(1).every((a) => /^(?:[-+][a-zA-Z]+|[a-z]+)$/.test(a))) continue;
    if (/^(?:node|npm)$/.test(t[0]) && t.length === 2 && /^(?:-v|--version)$/.test(t[1])) continue;
    // Os argumentos de um `git`: texto simples (sem aspas, `\` nem globs — `"--output=x"` e `--o*` chegam ao git como
    // `--output`, a 2.a leitura) e sem as opcoes que escrevem ou correm um programa.
    if (t[0] === "git" && GIT_LEITURA.test(t[1] ?? "") && t.slice(2).every((a) => /^[\w./^~@:=,%+-]+$/.test(a) && !/^--?(?:output|ext-diff|exec-path)\b/.test(a))) continue;
    const tn = t[0] === "exec" ? t.slice(1) : t;
    if (tn[0] === "node" && MAQ_ANCORADO.test(tn[1] ?? "") && !comWorkdir) {
      const cam = tn[1].replace(/^\.\//, "");
      // Um FICHEIRO (`node <pasta>` corre o `index.js` que o PR la ponha, as duas leituras).
      if (!/\.[mc]?js$/.test(cam) && !/^\.githooks\/[\w-]+$/.test(cam)) return `corre \`${cam}\`, que nao e um ficheiro de script`;
      if (ctx.ligacao(cam)) return `corre \`${cam}\`, uma ligacao simbolica que o PR mexe`;
      if ((ctx.naBase(cam) && !ctx.mudado(cam)) || VERIFICADOR.test(cam)) continue;
      return `corre \`${cam}\`, ${ctx.naBase(cam) ? "mudado" : "novo"} no PR, que nao e um ponto de entrada de verificacao`;
    }
    return `corre \`${t[0]}\`, que nao e so leitura`;
  }
  return null;
}

/** `null` se o passo so le (ou e um `uses:` permitido), ou a razao. `p` = `{ ls, cru }` (o `passosDe`). */
export function razaoDoPasso(p, ctx) {
  const ls = p.ls.map((l, i) => (i === 0 ? l.replace(/^([ \t]*)-/, "$1 ") : l));
  const cru = p.cru.map((l, i) => (i === 0 ? l.replace(/^([ \t]*)-/, "$1 ") : l));
  const ne = ls.filter((l) => l.trim());
  if (ne.length === 0) return null;
  const ki = Math.min(...ne.map(indent));
  const idx = ls.map((l, i) => i).filter((i) => ls[i].trim() && indent(ls[i]) === ki);
  const chaves = idx.map((i) => /^[ \t]*["']?([\w-]+)["']?[ \t]*:/.exec(ls[i])?.[1] ?? null);
  const fora = chaves.find((k) => k === null || !CHAVES.has(k));
  if (fora !== undefined) return fora === null ? "tem uma linha que nao se le" : `tem a chave \`${fora}:\``;
  if (new Set(chaves).size !== chaves.length) return "tem uma chave repetida";
  const filhas = (i) => ls.slice(i + 1).filter((l, k) => l.trim() && indent(l) > ki && ls.slice(i + 1, i + 1 + k).every((x) => !x.trim() || indent(x) > ki));
  const iUses = idx[chaves.indexOf("uses")];
  if (iUses !== undefined) {
    const nome = ls[iUses].replace(/^[^:]*:[ \t]*/, "").replace(/^["']|["']$/g, "").replace(/@.*$/, "");
    if (!USES.test(nome)) return `usa \`${nome}\``;
    const ok = nome === "actions/checkout" ? WITH_CHECKOUT : WITH_SETUP;
    const iWith = idx[chaves.indexOf("with")];
    // Um `with:` em flow (`{ ref: main }`) ou um alias nao se le: as duas leituras.
    if (iWith !== undefined && ls[iWith].replace(/^[^:]*:[ \t]*/, "").trim()) return `usa \`${nome}\` com um \`with:\` que nao se le`;
    if (iWith !== undefined) {
      const w = filhas(iWith);
      const wi = w.length ? Math.min(...w.map(indent)) : 0;
      for (const l of w.filter((x) => indent(x) === wi)) {
        const k = /^[ \t]*["']?([\w-]+)["']?[ \t]*:/.exec(l)?.[1];
        if (!k || !ok.test(k)) return `usa \`${nome}\` com \`${k ?? l.trim()}\``;
      }
    }
    return null;
  }
  if (chaves.includes("with")) return "tem um `with:` sem `uses:`";
  const iRun = idx[chaves.indexOf("run")];
  if (iRun === undefined) return null;
  const v = ls[iRun].replace(/^[^:]*:[ \t]*/, "");
  const comWorkdir = chaves.includes("working-directory");
  // O corpo de um `run: |` le-se das linhas CRUAS: um `#` dentro de aspas e da shell, nao um comentario do YAML.
  let linhas;
  if (/^\|[-+]?$/.test(v)) linhas = cru.slice(iRun + 1).filter((l, k) => l.trim() && indent(l) > ki && cru.slice(iRun + 1, iRun + 1 + k).every((x) => !x.trim() || indent(x) > ki)).map((l) => l.trim());
  else if (/^[|>"'&*!]/.test(v)) return "tem um `run:` dobrado, entre aspas ou que nao se le";
  else if (filhas(iRun).length) return "tem um `run:` simples em varias linhas";
  else linhas = [v];
  for (let i = 0; i < linhas.length; i++) {
    // Uma linha com aspas por fechar: a shell junta-a a seguinte, e um `#` la deixa de ser comentario (1.a leitura).
    const aberta = (l) => (l.match(/"/g) ?? []).length % 2 === 1 || (l.match(/'/g) ?? []).length % 2 === 1;
    if (aberta(linhas[i])) return "tem uma linha com aspas por fechar";
    if (/^#/.test(linhas[i])) continue;
    // Uma continuacao `\`: so na forma da cadeia do runner, em que cada linha e um `[exec] node <caminho>` — noutra
    // forma, a linha seguinte sao argumentos do comando anterior, e lida sozinha passava (as duas leituras).
    const pedacos = [linhas[i]];
    while (/\\$/.test(pedacos.at(-1)) && i + 1 < linhas.length) pedacos.push(linhas[++i]);
    if (pedacos.length > 1 && !pedacos.every((x) => !aberta(x) && /^(?:exec[ \t]+)?node[ \t]+\S/.test(x))) return "parte um comando por `\\` fora da cadeia do runner";
    for (const x of pedacos) {
      const r = linhaDeLeitura(x.replace(/[ \t]*\\$/, ""), ctx, comWorkdir);
      if (r) return r;
    }
  }
  return null;
}

/**
 * A identidade de um passo: as suas linhas, sem a chave `name:` do PROPRIO passo (nao uma linha `name:` dentro de um
 * `run:`, que a shell corre — a 2.a leitura) e sem o `@ref` dos `uses:`. O corpo de um `run: |` vem das linhas
 * CRUAS (um ` #` la e codigo), sem as linhas que so sao comentario da shell.
 */
function identidade(p) {
  const ls = p.ls.map((l, i) => (i === 0 ? l.replace(/^([ \t]*)-/, "$1 ") : l));
  const cru = p.cru.map((l, i) => (i === 0 ? l.replace(/^([ \t]*)-/, "$1 ") : l));
  const ne = ls.filter((l) => l.trim());
  if (ne.length === 0) return "";
  const ki = Math.min(...ne.map(indent));
  const out = [];
  let chave = null;
  let bloco = false;
  ls.forEach((l, i) => {
    if (l.trim() && indent(l) === ki) {
      chave = /^[ \t]*["']?([\w-]+)["']?[ \t]*:/.exec(l)?.[1] ?? null;
      bloco = chave === "run" && /:[ \t]*\|[-+]?[ \t]*$/.test(l);
    } else if (bloco) {
      if (cru[i].trim() && !/^[ \t]*#/.test(cru[i])) out.push(cru[i].trim());
      return;
    }
    if (chave !== "name" && l.trim()) out.push(l.trim());
  });
  return out.join("\n").replace(/(uses:[ \t]*["']?[^@\s"']+)@\S+/g, "$1");
}
const daMaquinaria = (p) => p.ls.some((l) => MAQUINARIA.test(l));

/**
 * Os avisos do PR: cada passo novo, antes das suites, que nao e so leitura. `ctx`: `naBase(cam)`, `mudado(cam)` e
 * `ligacao(cam)` (o que o PR fez a esse caminho; por omissao, nada mudou).
 * @param {string | null} antes
 * @param {string | null} agora
 * @returns {string[]}
 */
export function passosNovos(antes, agora, ctx = {}) {
  const c = { naBase: () => true, mudado: () => false, ligacao: () => false, ...ctx };
  const base = new Map(jobsDe(antes).map((j) => [j.id, j]));
  const out = [];
  const novo = (m) => out.push(m);
  for (const j of jobsDe(agora)) {
    const a = base.get(j.id);
    if (!a || !j.ls.some((l) => MAQUINARIA.test(l))) continue;
    const pd = passosDe(j.ls, j.todas);
    const pa = passosDe(a.ls, a.todas);
    if (pd === null) {
      if (pa !== null || a.ls.join("\n") !== j.ls.join("\n")) novo(`o job \`${j.id}\` tem os \`steps:\` em flow — nao se le que passos correm antes das suites`);
      continue;
    }
    // O limite e o ultimo passo da maquinaria que JA EXISTIA na base: acrescentar uma verificacao no fim nao faz dos
    // passos de antes "passos movidos para antes das suites" (medido: o caso "uma verificacao ACRESCENTADA" do gate).
    const ua = (pa ?? []).map(daMaquinaria).lastIndexOf(true);
    const antigas = (pa ?? []).filter(daMaquinaria).map(identidade);
    let ultimo = -1;
    pd.forEach((p, i) => {
      const k = daMaquinaria(p) ? antigas.indexOf(identidade(p)) : -1;
      if (k >= 0) {
        antigas.splice(k, 1);
        ultimo = i;
      }
    });
    // Um passo antigo da maquinaria que MUDOU (uma suite acrescentada ao runner) nao casa: o limite recuava e um passo
    // novo entre os dois ficava fora (as duas leituras). Entao o limite e o ultimo passo da maquinaria de agora.
    if (antigas.length) ultimo = pd.map(daMaquinaria).lastIndexOf(true);
    if (ultimo < 0) continue;
    const ja = (pa ?? []).slice(0, Math.max(ua, 0)).map(identidade);
    for (const p of pd.slice(0, ultimo)) {
      const k = ja.indexOf(identidade(p));
      if (k >= 0) {
        ja.splice(k, 1);
        continue;
      }
      const r = razaoDoPasso(p, c);
      if (r) novo(`um passo novo antes das suites no job \`${j.id}\` ${r} (\`${p.ls[0].trim().replace(/^-[ \t]*/, "").slice(0, 80)}\`) — pode desligar as suites antes de correrem`);
    }
  }
  return out;
}
