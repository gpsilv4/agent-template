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
import { CAMINHOS_FRONTEIRA, ehCaminhoFronteira, MAES, resto } from "./fronteira.mjs";

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
  // O `$HOME` e o `~` escrito de outra maneira (#223): `cd $HOME/proj/.claude/hooks` passava.
  if (ctx.home && /^\$\{?HOME\}?(?=\/|$)/.test(t)) t = ctx.home + t.replace(/^\$\{?HOME\}?/, "");
  // `$__RAIZ__` e o `"$(git rev-parse --show-toplevel)"` que o `desaspa` reconheceu (#229).
  if (/^\$__RAIZ__(?=\/|$)/.test(t)) {
    if (!ctx.raiz) return null;
    t = ctx.raiz + t.slice("$__RAIZ__".length);
  }
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
const formaCanonica = (p) => {
  if (p === null) return null;
  if (ehCaminhoFronteira(p)) return p;
  if (ehCaminhoFronteira(`${p}/`)) return `${p}/`;
  // Uma pasta-MAE (#223), e um glob no primeiro nome dentro dela (`.claude/*`, `.claude/h*`): sem
  // isto, so o texto `.claude` contava, e `~/proj/.claude`, `.claude/.` ou `cd .claude && rm -rf *`
  // passavam (leitura do 2f7235a). `.claude/commands/x.md` nao e a mae, e continua livre.
  // O glob so conta se puder casar um nome da fronteira: `.claude/*.md` nao apanha `hooks/` nem o
  // `settings.json`, e copiar os `.md` da pasta e trabalho normal (leitura do 355ae97).
  const q = p.replace(/\/$/, "");
  const mae = MAES.find((m) => q === m || (q.startsWith(`${m}/`) && globCasaFilho(m, q.slice(m.length + 1))));
  return mae ? `${mae}/` : null;
};

/** O primeiro nome de `resto` e um glob que casa um filho da fronteira dentro da mae `m`? */
function globCasaFilho(m, resto) {
  const nome = resto.split("/")[0];
  if (!/[*?[]/.test(nome)) return false;
  const re = new RegExp(`^${nome.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`);
  return CAMINHOS_FRONTEIRA.filter((f) => f.startsWith(`${m}/`)).some((f) => re.test(f.slice(m.length + 1).split("/")[0]));
}

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
//  O `|` de `>|` (escrever por cima do `noclobber`) e da redireccao, nao um pipe (#206). So com um `>`
//  NAO escapado: em `echo \>|rm -rf <f>` o `\>` e literal e o `|` e um pipe — sem isto o `rm` ficava
//  escondido atras do `echo` (leitura do a995596). Pela PARIDADE das barras: em `\\>|` a barra e
//  literal e o `>` e real. E o `>&|` do zsh tambem e uma redireccao (leitura do 81e5942).
export const SEPARADOR = /(?:&&|\|\||[;\n]|(?<!(?<!\\)(?:\\\\)*>&?)\|)+|(?<=(?:^|[;\n&|(])\s*)(?:do|then)(?![^\s;&|)])/g;

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
 *  $(rm -rf *)` passava. A aritmetica `$((...))` nao e comando e fica de fora — so quando fecha em
 *  `))` colados, como no bash: `$((rm x) )` e uma substituicao, e corre.
 *
 *  UMA passagem, com uma pilha, e sem recursao: a primeira versao era recursiva, e 8000 `$(`
 *  aninhados rebentavam a pilha — a excepcao caia no `catch` do hook, que sai com 0 (permite).
 *  Medido pela leitura do c004591. Parenteses por fechar vao ate ao fim do texto. */
export function substituicoes(t) {
  const fecho = new Map();
  const pilha = [];
  for (let k = 0; k < t.length; k++) {
    if (t[k] === "(") pilha.push(k);
    else if (t[k] === ")" && pilha.length) fecho.set(pilha.pop(), k);
  }
  const fim = (k) => fecho.get(k) ?? t.length;
  const fora = [];
  for (let k = 1; k < t.length; k++) {
    if (t[k] !== "(" || !"$<>".includes(t[k - 1])) continue;
    if (t[k - 1] === "$" && t[k + 1] === "(" && fim(k + 1) === fim(k) - 1) continue; // aritmetica
    fora.push(t.slice(k + 1, fim(k)));
  }
  return fora;
}

/** `2>/dev/null`, `>&2`, `2>&1`: redireccoes que nao escrevem ficheiro nenhum. Com FIM de palavra:
 *  `>&2x` e o `&>2x` do bash — cria o ficheiro `2x` — e o `&\d` sem ancora apagava-o como
 *  inofensivo (leitura do 024753a). Partilhado com o `soMudaDeDirectorio` do `fronteira.mjs`. */
export const REDIRECCAO_INOFENSIVA = /\d*[<>]{1,2}&?\s*(?:\/dev\/null|&\d+-?)(?=$|[\s;|&)<>])/g;

/** Fechos de bloco: nao sao comandos, e o marcador do directorio nao lhes vai. */
const FECHOS = new Set(["fi", "done", "esac", "}"]);

/** Verbos que NAO escrevem ficheiros, sem o marcador: com ele, a leitura de todos os dias depois
 *  de um `cd` para a fronteira era negada (`| sort | uniq -c`, `|| true`, `|| exit 1`). Medido pela
 *  leitura do commit. So entra um verbo que nao escreve ficheiros com NENHUMA flag.
 *
 *  O `sort` e o `uniq` NAO entram, e e deliberado: escrevem (`-o`, o 2.o operando), e uma allowlist
 *  das flags deles teve um buraco novo em cada uma de tres leituras seguidas — `--out=`, `--o`
 *  abreviado, `"-o"`, `uniq - <saida>`, `-tt -o`, `$O`. Depois de um `cd` para a fronteira, `| sort`
 *  e negado: e um falso positivo raro, e o `main` ja o negava com a barra final. */
const SEM_MARCADOR = new Set([
  ...FECHOS, "set", "export", "true", "false", ":", "exit", "return", "sleep", "wait", "break",
  "continue", "shift", "read", "tr", "cut", "column", "date", "pwd",
]);

/** O segmento leva o directorio — PODE escrever? Pelo verbo depois das atribuicoes e de `while`/
 *  `until`/`{`, que abrem e nao sao o comando. Uma substituicao leva-o SEMPRE: o que corre la
 *  dentro e julgado. Exportado: o `porqueAltera` usa o mesmo criterio nos interiores. */
export function levaMarcador(seg, toks) {
  if (/[$<>]\(/.test(seg)) return true;
  // Uma redireccao de SAIDA escreve, seja qual for o verbo: `$(true 1>.claude/settings.json)` era
  // descartado como interior inofensivo. As inofensivas (`2>/dev/null`, `>&2`) nao contam.
  if (/>/.test(seg.replace(REDIRECCAO_INOFENSIVA, " "))) return true;
  let i = 0;
  while (i < toks.length && (["while", "until", "{"].includes(toks[i]) || /^\w+=/.test(toks[i]))) i++;
  const v = toks[i];
  if (v === undefined || v.startsWith("#")) return false;
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
        // `>&` tambem abre um alvo: `>&1x` e o `&>1x` do bash, e escreve `1x` (leitura do 024753a). E o
        // `>|` (noclobber) e o `>!` do zsh, colados ao nome (leitura do a995596).
        out = seg.replace(/(^|[\s=(>]|>&?[&|!])([^\s=()<>|;&!]+)/g, (m, pre, tok, off) => {
          // Um alvo de redireccao nunca e o verbo, e resolve-se sempre: `> pre-commit` e um caminho.
          const redir = /[<>]&?[&|!]?\s*$/.test(seg.slice(0, off + pre.length));
          if (primeiro && !redir) {
            primeiro = false;
            return m;
          }
          // Um descritor (`2>&1`, `>&2-`) nao e ficheiro nenhum.
          if (pre === ">&" && /^\d+-?$|^-$/.test(tok)) return m;
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

/** O texto citado, como o shell o le. Corpos de heredoc e conteudo entre aspas sao TEXTO, nao
 *  argumentos — e o que separa "escrever um ficheiro que menciona a fronteira" de "escrever a
 *  fronteira". Mas tres coisas la dentro nao sao texto:
 *  - um CAMINHO entre aspas (`rm -rf ".claude"`, `> ".claude/settings.json"`) — `desaspa` (#206, #223);
 *  - o que o shell EXECUTA: `$(...)` e crases entre aspas duplas e num heredoc SEM aspas — `executados` (#229);
 *  - o RESTO DA LINHA do `<<`: `cat <<'EOF' > .claude/hooks/x.mjs` e a forma mais habitual de um
 *    agente escrever um ficheiro, e o `> <fronteira>` era apagado com o corpo (#223).
 *  Os heredocs saem primeiro: o texto deles pode ter apostrofos soltos. O delimitador pode ser
 *  `\EOF` (literal, como `'EOF'`) ou ter `.`/`-` (`'END-X'`), e um que nao casava deixava o corpo
 *  inteiro a ser lido como comando — e um apostrofo la dentro desemparelhava tudo o que vinha
 *  depois. Uma crase fora de aspas e um `$(...)`, e julga-se como tal (salvo um caminho sozinho). */
export const semCitacoes = (t) =>
  desaspa(
    t.replace(/<<-?[\t ]*(\\?)(['"]?)([^\s'"<>;&|()]+)\2([^\n]*)\n([\s\S]*?)^[\t ]*\3[\t ]*$/gm, (_m, esc, aspa, _tag, linha, corpo) =>
      ` <<HEREDOC ${linha}${esc || aspa ? "" : executados(corpo).map((x) => `\n(${x})`).join("")}`)
  ).replace(/`(?:[^`\\]|\\.)*`/g, (m) => executados(m).map((x) => ` $(${desaspa(x)}) `).join("") || ' "" ');

/** O indice do `)` que fecha o `$(` em `s[k]`, a ler as aspas de DENTRO como o shell: dentro de um
 *  `$(...)` abre-se um contexto novo, e `"$(echo ")"; rm <f>)"` nao fecha no `)` citado. */
function fimSubst(s, k) {
  let fundo = 0;
  for (let j = k + 2; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") j++;
    // `$'...'` tem escapes: `$'\''` nao abre aspas (leitura do a6abe1d).
    else if (c === "$" && s[j + 1] === "'") for (j += 2; j < s.length && s[j] !== "'"; j += s[j] === "\\" ? 2 : 1);
    else if (c === "'") j = s.indexOf("'", j + 1) < 0 ? s.length : s.indexOf("'", j + 1);
    else if (c === '"') j = fimAspasDuplas(s, j);
    else if (c === "$" && s[j + 1] === "(") j = fimSubst(s, j);
    else if (c === "(") fundo++;
    else if (c === ")" && fundo-- === 0) return j;
  }
  return s.length;
}

/** O indice da `"` que fecha a que esta em `s[k]` — saltando os `$(...)` e as crases de dentro, que
 *  tem aspas proprias: `"$(echo "x"; rm <f>)"` fechava no `"` de `"x"` e o `rm` ficava escondido. */
function fimAspasDuplas(s, k) {
  for (let j = k + 1; j < s.length; j++) {
    if (s[j] === "\\") j++;
    else if (s[j] === '"') return j;
    else if (s[j] === "$" && s[j + 1] === "(") j = fimSubst(s, j);
    else if (s[j] === "`") j = s.indexOf("`", j + 1) < 0 ? s.length : s.indexOf("`", j + 1);
  }
  return s.length;
}

/** O que o shell EXECUTA dentro de um texto: os `$(...)` e as crases, sem os escapados (#229). Uma
 *  crase que e so um CAMINHO (o markdown de uma mensagem de commit) nao e comando, e fica de fora.
 *
 *  Devolve a LISTA dos interiores. Os de texto citado (aspas duplas, heredoc sem aspas) saem em
 *  linhas proprias e julgam-se como comando seu — o `rm` de `gh ... --body "$(rm <f>)"` nega, mas o
 *  `gh` que so recebe o texto de `"$(cat <f>)"` deixa de ser julgado por isso (leitura do 193a9a9).
 *  Os de uma crase fora de aspas ficam no sitio, como um `$(...)`. */
function executados(s) {
  const fora = [];
  for (let k = 0; k < s.length; k++) {
    if (s[k] === "\\") { k++; continue; }
    if (s[k] === "$" && s[k + 1] === "(" && s[k + 2] !== "(") {
      const fim = fimSubst(s, k);
      fora.push(s.slice(k + 2, fim));
      k = fim;
    } else if (s[k] === "`") {
      let j = k + 1;
      while (j < s.length && s[j] !== "`") j += s[j] === "\\" ? 2 : 1;
      const dentro = s.slice(k + 1, j).trim();
      if (!/^[^\s;&|<>`$()]+$/.test(dentro)) fora.push(dentro);
      k = j;
    }
  }
  return fora;
}

/** As aspas percorridas como o shell, numa so passagem: uma string SIMPLES (sem espacos nem
 *  metacaracteres nem expansoes, salvo um `$HOME`/`$PWD` inicial) perde as aspas se for o alvo de
 *  uma redireccao ou tiver um caminho da fronteira; o resto citado e apagado, e os comentarios saltam.
 *
 *  Nao por regex: a versao com regex emparelhava a aspa que FECHA uma string com a que abre a
 *  seguinte (`echo "a cd ";>.claude/settings.json;"z"` escondia o `>`), e com o apagamento feito
 *  noutro passo as duas leituras discordavam — o `'` de `# it's` emparelhava com o de outro
 *  comentario e escondia um `rm`, e `'a\'` era lido com um escape que o shell nao tem. Linear: o
 *  alvo de redireccao vem dos dois ultimos caracteres visiveis. Com `|` dentro, uma string e um
 *  padrao (`grep -E ".claude/hooks|.githooks"`), e sem aspas o `|` partia o comando. */
function desaspa(t) {
  let out = "";
  let ultimo = "";
  let penultimo = "";
  const visto = (s) => {
    for (const ch of s) if (!/\s/.test(ch)) [penultimo, ultimo] = [ultimo, ch];
  };
  // O que correu dentro de aspas duplas sai no FIM do comando de fora — antes do proximo separador
  // ou do `)` da subshell —, e nao no meio dele: numa linha a meio, o resto do comando de fora ficava
  // sozinho a parecer um comando (`echo "$(git log)" <f>`), e depois do separador seguinte o `cd`
  // que viesse a seguir mudava o directorio em que o de dentro era julgado.
  let pendentes = [];
  const despeja = () => {
    // Como SUBSHELL, que e o que e: um `cd` la dentro nao muda o directorio de quem chamou, e
    // despejado como linha nua mudava-o para o resto do comando (leitura do a6abe1d).
    if (pendentes.length) out += `${pendentes.map((x) => `\n(${x})`).join("")}\n`;
    pendentes = [];
  };
  for (let k = 0; k < t.length; ) {
    const c = t[k];
    const antes = t[k - 1] ?? "";
    if (c === ";" || c === "\n" || c === ")" || (c === "|" && antes !== ">") || (c === "&" && !"<>".includes(antes) && t[k + 1] !== ">")) despeja();
    if (c === "\\") { out += t.slice(k, k + 2); visto(t.slice(k, k + 2)); k += 2; continue; }
    if (c === "#" && (k === 0 || /[\s;&|(]/.test(t[k - 1]))) { while (k < t.length && t[k] !== "\n") k++; continue; }
    // `$'...'` (ANSI-C) tem escapes, ao contrario das aspas simples: `$'x\' y'` nao fecha no `\'`.
    if (c === "$" && t[k + 1] === "'") {
      let j = k + 2;
      while (j < t.length && t[j] !== "'") j += t[j] === "\\" ? 2 : 1;
      out += ' "" ';
      visto('""');
      k = j + 1;
      continue;
    }
    if (c !== '"' && c !== "'") { out += c; visto(c); k++; continue; }
    const j = c === '"' ? fimAspasDuplas(t, k) : t.indexOf("'", k + 1) < 0 ? t.length : t.indexOf("'", k + 1);
    const dentro = t.slice(k + 1, j);
    const simples = /^(?:\$\{?(?:HOME|PWD)\}?)?[^\s"'$`\\;&|<>()]*$/.test(dentro);
    // `"$(pwd)/.claude/..."` e `"$(git rev-parse --show-toplevel)/..."` sao caminhos: a raiz ou o
    // directorio, escritos por um comando (pre-existente, apanhado pela leitura do 193a9a9).
    const raiz = dentro.match(/^\$\((pwd|git rev-parse --show-toplevel)\)(\/[^\s"'$`\\;&|<>()]*)$/);
    const alvo = "<>".includes(ultimo) || ("&|!".includes(ultimo) && "<>".includes(penultimo));
    const fronteira = (x) => alvo || /\.claude|\.githooks/.test(x);
    // Entre aspas DUPLAS, o que o shell executa sai a parte (#229); as simples nao expandem.
    const fica =
      simples && fronteira(dentro) ? dentro
        : raiz && fronteira(raiz[2]) ? `${raiz[1] === "pwd" ? "$PWD" : "$__RAIZ__"}${raiz[2]}`
          : ' "" ';
    // O de dentro le-se pelas MESMAS regras de aspas: tal como foi escrito, `"$(grep -E "a|b" <f>)"`
    // partia no `|` do padrao, e um `"` la dentro desemparelhava o resto.
    if (fica === ' "" ' && c === '"') pendentes.push(...executados(dentro).map(desaspa));
    out += fica;
    visto(fica);
    k = j + 1;
  }
  despeja();
  return out;
}
