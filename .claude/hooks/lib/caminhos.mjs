/**
 * Os caminhos escritos de outra maneira, na forma que a fronteira reconhece — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#185): o `FRONTEIRA` do `fronteira.mjs` olha para o TEXTO de um comando, e so
 * reconhecia os caminhos relativos a raiz. `../`, `//`, `/./`, absoluto, `$PWD`, `~` e um `cd`
 * noutro segmento passavam — o caminho estava la, escrito de outra maneira. Este modulo resolve
 * cada argumento contra o directorio em que o segmento corre e reescreve-o, **so se der na
 * fronteira**, na forma canonica. Vive a parte porque o `fronteira.mjs` chegou as 500 linhas.
 *
 * Cinco leituras independentes e uma final sistematica ao PR afinaram isto; os casos medidos, e o
 * que fica de fora, estao no `tests-fronteira-inventario.mjs` (`FECHADO_PELO_CAMINHO`, `ABERTO`).
 */
import { execFileSync } from "child_process";
import { homedir } from "os";
import { posix } from "path";
import { ehCaminhoFronteira, resto } from "./fronteira.mjs";

/** O contexto para resolver caminhos: a raiz do repo, o `cwd` do payload e a home. Impuro (corre
 *  o `git`), por isso fora do `porqueAltera`, que o recebe por parametro e fica testavel. */
export function contextoFronteira(cwd = process.cwd()) {
  let raiz = cwd;
  let prefixo;
  try {
    // `--show-prefix`: o `cwd` relativo a raiz sem comparar strings (o toplevel e o realpath).
    const [topo, pre] = execFileSync("git", ["rev-parse", "--show-toplevel", "--show-prefix"], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000,
    }).split("\n");
    raiz = topo || cwd;
    prefixo = (pre ?? "").replace(/\/$/, "");
  } catch {
    // Fora de um repo: a raiz e o proprio `cwd`. Um caminho absoluto fora dele fica por resolver.
  }
  return { raiz, cwd, prefixo, home: homedir() };
}

/** Um caminho escrito, relativo a raiz — ou `null` se cair FORA (ou for incerto). `~` e `$PWD`
 *  (o directorio corrente) expandem-se; `..`, `//`, `/./` colapsam; um absoluto perde a raiz. */
function relativo(tok, dir, ctx) {
  let t = tok;
  if (ctx.home && (t === "~" || t.startsWith("~/"))) t = ctx.home + t.slice(1);
  if (/^\$\{?PWD\}?(?=\/|$)/.test(t)) {
    if (dir === null) return null;
    t = `${dir || "."}${t.replace(/^\$\{?PWD\}?/, "")}`;
  }
  if (t.startsWith("/")) {
    const r = posix.normalize(t);
    for (const [base, rel] of [[ctx.raiz, ""], [ctx.cwd, ctx.prefixo]]) {
      if (!base || rel === undefined) continue;
      const b = posix.normalize(base).replace(/\/$/, "");
      if (r === b) return rel;
      if (r.startsWith(`${b}/`)) return posix.normalize(posix.join(rel || ".", r.slice(b.length + 1)));
    }
    return null;
  }
  if (dir === null) return null;
  const r = posix.normalize(posix.join(dir || ".", t));
  if (r === ".." || r.startsWith("../")) return null;
  return r === "." ? "" : r;
}

/** A forma que o `FRONTEIRA` reconhece, ou `null`. Uma pasta sai COM a barra. */
const formaCanonica = (p) =>
  p === null ? null : ehCaminhoFronteira(p) ? p : ehCaminhoFronteira(`${p}/`) ? `${p}/` : null;

/** Forma de caminho: barra, `.` inicial, extensao com letras, `~` ou `$PWD`. Com o directorio
 *  DENTRO da fronteira so estes se resolvem: `timeout 60` ou o `rm` de `git rm` nao sao caminhos. */
const COM_FORMA_DE_CAMINHO = /\/|^\.|\.[A-Za-z]\w*$|^~|^\$\{?PWD/;

/** O texto com cada `$(...)` equilibrado trocado por `_`, do MESMO comprimento: os indices batem
 *  com o original, e o que esta la dentro deixa de partir segmentos ou fechar parenteses. */
function mascaraSubstituicoes(t) {
  const c = t.split("");
  let fundo = 0;
  for (let k = 0; k < c.length; k++) {
    if (c[k] === "$" && c[k + 1] === "(") (fundo++, (c[k] = c[k + 1] = "_"), k++);
    else if (fundo) (c[k] === "(" ? fundo++ : c[k] === ")" ? fundo-- : 0), (c[k] = "_");
  }
  return c.join("");
}

/** Separadores de segmento. O `do`/`then` so em POSICAO DE COMANDO (depois de um separador): com
 *  `\b`, `x-do` partia o comando e `rm -rf x-do cat <fronteira>` era julgado pelo `cat`; e como
 *  argumento (`grep -r then <fronteira>`) negava uma leitura. */
export const SEPARADOR = /(?:&&|\|\||[;|\n])+|(?<=(?:^|[;\n&|(])\s*)(?:do|then)(?![^\s;&|)])/g;

/** Os pedacos de um comando, partidos pelo `SEPARADOR` sobre o texto com os `$(...)` MASCARADOS:
 *  `[ini, fim]` para cada segmento, e a string para cada separador. Uma so leitura da estrutura,
 *  para o normalizador e para o `porqueAltera` — dois `split` diferentes partiam `$(a; b)` num e
 *  nao no outro. */
export function pedacosDe(visivel) {
  const masc = mascaraSubstituicoes(visivel);
  const pedacos = [];
  let ini = 0;
  for (const m of masc.matchAll(SEPARADOR)) {
    pedacos.push([ini, m.index], m[0]);
    ini = m.index + m[0].length;
  }
  pedacos.push([ini, masc.length]);
  return { masc, pedacos };
}

/** Os interiores das substituicoes `$(...)`, `<(...)` e `>(...)`, as aninhadas incluidas. O que la
 *  esta CORRE, e o verbo de fora (`echo`, `cat`) nao diz nada sobre ele: `cd <fronteira> && echo
 *  $(rm -rf *)` passava. A aritmetica `$((...))` nao e comando e fica de fora. */
export function substituicoes(t) {
  const fora = [];
  for (let k = 0; k < t.length; k++) {
    if (!"$<>".includes(t[k]) || t[k + 1] !== "(" || (t[k] === "$" && t[k + 2] === "(")) continue;
    let fundo = 1;
    let j = k + 2;
    for (; j < t.length && fundo; j++) fundo += t[j] === "(" ? 1 : t[j] === ")" ? -1 : 0;
    const dentro = t.slice(k + 2, fundo ? j : j - 1);
    fora.push(dentro, ...substituicoes(dentro));
    k = j - 1;
  }
  return fora;
}

/** Fechos de bloco: nao sao comandos, e o marcador do directorio nao lhes vai. */
const FECHOS = new Set(["fi", "done", "esac", "}"]);

/** Verbos que NAO escrevem ficheiros, sem o marcador: com ele, a leitura de todos os dias depois
 *  de um `cd` para a fronteira era negada (`| sort | uniq -c`, `|| true`, `|| exit 1`). Medido pela
 *  leitura do commit. `sort` e `uniq` escrevem com `-o` e com um segundo operando — ai levam-no. */
const SEM_MARCADOR = new Set([
  ...FECHOS, "set", "export", "true", "false", ":", "exit", "return", "sleep", "wait", "break",
  "continue", "shift", "read", "tr", "cut", "column", "sort", "uniq",
]);

/** O segmento leva o directorio? Pelo verbo depois das atribuicoes e de `while`/`until`/`{` — que
 *  abrem e nao sao o comando. Uma substituicao leva-o SEMPRE: o que corre la dentro e julgado. */
function levaMarcador(seg, toks) {
  if (/[$<>]\(/.test(seg)) return true;
  let i = 0;
  while (i < toks.length && (["while", "until", "{"].includes(toks[i]) || /^\w+=/.test(toks[i]))) i++;
  const v = toks[i];
  if (v === undefined || v.startsWith("#")) return false;
  if (v === "sort") return toks.slice(i + 1).some((t) => /^-[^-]*o|^--output/.test(t));
  if (v === "uniq") return toks.slice(i + 1).filter((t) => !t.startsWith("-")).length > 1;
  return !SEM_MARCADOR.has(v);
}

/** Reescreve, na forma canonica, os caminhos que DAO na fronteira. Cada argumento resolve-se contra
 *  o directorio do segmento (`cwd`, `cd`/`pushd`/`popd`, subshells). Nunca o verbo nem as flags;
 *  dentro da fronteira, so o que tem forma de caminho — e os alvos de redireccao, sempre.
 *
 *  Depois de um `cd` EXPLICITO para dentro da fronteira, cada segmento seguinte leva o directorio
 *  no fim, para TOCAR a fronteira e o verbo ser julgado: `cd .claude/hooks && rm -rf *` passava
 *  (o `*` nao tem forma de caminho), e no `main` era o segmento do `cd` que o negava. Uma leitura
 *  continua a passar, porque o verbo e de leitura; o que nao escreve nem leva marcador
 *  (`levaMarcador`). So pelo `cd` do proprio comando: com o `cwd` ja la dentro, nada muda face ao
 *  `main`. */
export function normalizaCaminhos(visivel, ctx = {}) {
  const subshell = [];
  const pushd = [];
  let dir = ctx.prefixo !== undefined ? ctx.prefixo : ctx.cwd && ctx.raiz ? relativo(ctx.cwd, "", ctx) : "";
  const dirInicial = dir;
  // A ESTRUTURA le-se com cada `$(...)` mascarado: um `$(a; b)` partia-se no `;`, e o `)` orfao
  // fechava a subshell de fora antes do tempo. Os pedacos reescritos sao os do texto original.
  const { masc, pedacos } = pedacosDe(visivel);
  return pedacos
    .map((p) => {
      if (typeof p === "string") return p; // um separador
      const seg = visivel.slice(p[0], p[1]);
      const segM = masc.slice(p[0], p[1]);
      let fecha = 0;
      for (const c of segM) {
        if (c === "(") subshell.push(dir);
        else if (c === ")") fecha++;
      }
      // O verbo depois das cabecas e das palavras de shell (`if`, `builtin`, `command`, `time`).
      const toks = resto(segM.replace(/[()]/g, " "));
      let out = seg;
      if (toks[0] === "cd" || toks[0] === "pushd") {
        if (toks[0] === "pushd") pushd.push(dir);
        // Sem argumento vai para a home; `-` e o anterior: incerto, fica FORA (nada se reescreve).
        const alvo = toks.slice(1).find((t) => t === "-" || !t.startsWith("-"));
        dir = alvo && alvo !== "-" ? relativo(alvo, dir, ctx) : null;
      } else if (toks[0] === "popd") {
        dir = pushd.length ? pushd.pop() : null;
      } else if (toks[0] !== "for") {
        const dentro = formaCanonica(dir);
        let primeiro = true;
        out = seg.replace(/(^|[\s=(>])([^\s=()<>|;&]+)/g, (m, pre, tok, off) => {
          // Um alvo de redireccao nunca e o verbo, e resolve-se sempre: `> pre-commit` e um caminho.
          const redir = /[<>]\s*$/.test(seg.slice(0, off + pre.length));
          if (primeiro && !redir) {
            primeiro = false;
            return m;
          }
          if (tok.startsWith("-") || (dentro && !redir && !COM_FORMA_DE_CAMINHO.test(tok))) return m;
          const c = formaCanonica(relativo(tok, dir, ctx));
          return c !== null && c !== tok ? pre + c : m;
        });
        if (dentro && dir !== dirInicial && levaMarcador(seg, toks)) out = `${out} ${dentro}`;
      }
      for (; fecha > 0 && subshell.length; fecha--) dir = subshell.pop();
      return out;
    })
    .join("");
}
