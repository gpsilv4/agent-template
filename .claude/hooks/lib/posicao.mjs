/**
 * O comando lido por POSICAO: que palavra corre, o que e argumento, o que e so texto — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#336): a fronteira decidia por regex sobre o texto inteiro, e cada correccao abria um caso
 * novo. O `FLAG_INLINE` so conhecia `-e`/`-p`/`-c` soltos, e `node -pe`, `perl -le`, `python3 -Ic` e
 * `php -r` escreviam na fronteira com o hook a deixar. Saber de que comando e um grupo de flags, ou que um
 * `<<` esta dentro de aspas, pede o comando lido como a shell o le: as aspas, as substituicoes e os
 * heredocs NUMA so passagem. O `pedacosDe` (`caminhos.mjs`) nao chega: trabalha sobre o texto ja sem aspas.
 *
 * NAO E O TERCEIRO TOKENIZADOR POR DESCUIDO. O `palavras()` (`ambito-agente.mjs`) le o comando inteiro como
 * o prefixo de um `tools:`, sem separadores; o `palavrasPorSegmento()` (`verbos-git.mjs`) serve o guard dos
 * branches e nao conhece heredocs. Unifica-lo com este fica para o PR (c) do #336, com um teste de igualdade
 * — mexer nele aqui mexia no guard dos branches sem proveito para a fronteira.
 *
 * O QUE ISTO NAO DECIDE: nada. Diz o que esta em que posicao; o `fronteira.mjs` nega. As regex de la
 * continuam a ser o piso, e uma leitura errada daqui so pode negar a mais ou deixar um caso por fechar.
 */
import { fimAspasDuplas, fimSubst } from "./caminhos.mjs";
import { NOMES_INTERPRETADOR, resto } from "./fronteira-dados.mjs";

/** O fim do que abre em `s[k]` (`$(`, `<(`, `>(`): o `)` que fecha, lido como a shell. Um nome proprio para
 *  a varredura o poder mutar (`pares-hooks.mjs`), sem tocar no `fimSubst` partilhado. */
const fechaSubst = (s, k) => fimSubst(s, k);
/** O fim das aspas duplas que abrem em `s[k]`, saltando os `$(...)` e as crases de dentro. */
const fechaAspas = (s, k) => fimAspasDuplas(s, k);
/** A primeira linha, a partir de `ini`, que e SO a etiqueta: o fim do corpo de um heredoc. Tolera espacos a
 *  volta, como o `semCorposDeHeredoc`. Devolve o indice do fim dessa linha, ou o fim do texto. */
function fechaHeredoc(s, ini, tag) {
  for (let i = ini; i < s.length; ) {
    const fim = s.indexOf("\n", i) < 0 ? s.length : s.indexOf("\n", i);
    if (s.slice(i, fim).trim() === tag) return fim;
    i = fim + 1;
  }
  return s.length;
}

/**
 * Os comandos simples de um texto, cada um com as palavras que a shell lhe entrega.
 *
 * @param {string} texto o comando como o hook o recebe
 * @param {boolean} [dentro] se o texto e o interior de uma substituicao
 * @returns {{argv: {texto: string, cru: string, citada: boolean}[], redir: {op: string, alvo: string}[],
 *   heredoc: {corpo: string, citado: boolean}|null, pipeDe: boolean, pipePara: boolean, dentro: boolean}[]}
 *   pela ordem em que aparecem; os de dentro de uma substituicao vem DEPOIS do comando que a contem.
 */
export function comandos(texto, dentro = false) {
  const out = [];
  const interiores = [];
  const novo = (pipeDe = false) => ({ argv: [], redir: [], heredoc: null, pipeDe, pipePara: false, dentro });
  let cmd = novo();
  let pal = null; // a palavra em curso: { texto, ini, citada }
  let redirPendente = null; // o operador de redireccao a espera do alvo
  const heredocs = []; // os `<<` desta linha, a espera do corpo na linha seguinte

  const fechaPalavra = (fim) => {
    if (pal === null) return;
    const w = { texto: pal.texto, cru: texto.slice(pal.ini, fim), citada: pal.citada };
    if (redirPendente) {
      if (redirPendente.startsWith("<<") && redirPendente !== "<<<") {
        heredocs.push({ cmd, tag: w.texto, citado: w.citada || w.cru.includes("\\") });
      } else cmd.redir.push({ op: redirPendente, alvo: w.texto });
      redirPendente = null;
    } else cmd.argv.push(w);
    pal = null;
  };
  const fechaComando = (pipePara = false) => {
    cmd.pipePara = pipePara;
    if (cmd.argv.length || cmd.redir.length || cmd.heredoc) out.push(cmd);
    cmd = novo(pipePara);
  };
  const abre = (i) => (pal ??= { texto: "", ini: i, citada: false });

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const prox = texto[i + 1] ?? "";
    // `\`+newline e continuacao de linha; `\x` e o `x` literal.
    if (c === "\\") {
      if (prox === "\n") { i++; continue; }
      abre(i);
      pal.texto += prox;
      pal.citada = true;
      i++;
      continue;
    }
    if (c === "'") {
      abre(i);
      const j = texto.indexOf("'", i + 1) < 0 ? texto.length : texto.indexOf("'", i + 1);
      pal.texto += texto.slice(i + 1, j);
      pal.citada = true;
      i = j;
      continue;
    }
    // `$'...'` (ANSI-C) tem escapes: `$'\''` nao fecha no `\'`.
    if (c === "$" && prox === "'") {
      abre(i);
      let j = i + 2;
      while (j < texto.length && texto[j] !== "'") j += texto[j] === "\\" ? 2 : 1;
      // Descodificado como a shell o entrega: `node -$'\x70e'` e `node -pe` (leitura 1 do PR a).
      pal.texto += texto.slice(i + 2, j).replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_m, e) =>
        e[0] === "x" ? String.fromCharCode(parseInt(e.slice(1), 16))
          : /^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8))
            : ({ n: "\n", t: "\t", r: "\r", e: "\x1b", a: "\x07", b: "\b", f: "\f", v: "\v" })[e] ?? e);
      pal.citada = true;
      i = j;
      continue;
    }
    if (c === '"') {
      abre(i);
      const j = fechaAspas(texto, i);
      const dentroAspas = texto.slice(i + 1, j);
      pal.texto += dentroAspas.replace(/\\(["\\$`])/g, "$1");
      pal.citada = true;
      // O que corre dentro de aspas duplas: os `$(...)` e as crases.
      for (let k = 0; k < dentroAspas.length; k++) {
        if (dentroAspas[k] === "\\") { k++; continue; }
        if (dentroAspas[k] === "$" && dentroAspas[k + 1] === "(" && dentroAspas[k + 2] !== "(") {
          const f = fechaSubst(dentroAspas, k);
          interiores.push(dentroAspas.slice(k + 2, f));
          k = f;
        } else if (dentroAspas[k] === "`") {
          let f = k + 1;
          while (f < dentroAspas.length && dentroAspas[f] !== "`") f += dentroAspas[f] === "\\" ? 2 : 1;
          interiores.push(dentroAspas.slice(k + 1, f));
          k = f;
        }
      }
      i = j;
      continue;
    }
    // Substituicoes fora de aspas: `$(...)`, `<(...)`, `>(...)`. O `$((...))` aritmetico nao corre nada.
    if ((c === "$" || ((c === "<" || c === ">") && pal === null)) && prox === "(") {
      abre(i);
      const j = fechaSubst(texto, i);
      if (!(c === "$" && texto[i + 2] === "(")) interiores.push(texto.slice(i + 2, j));
      pal.texto += texto.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "`") {
      abre(i);
      let j = i + 1;
      while (j < texto.length && texto[j] !== "`") j += texto[j] === "\\" ? 2 : 1;
      interiores.push(texto.slice(i + 1, j));
      pal.texto += texto.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "#" && pal === null) {
      while (i + 1 < texto.length && texto[i + 1] !== "\n") i++;
      continue;
    }
    if (c === " " || c === "\t") { fechaPalavra(i); continue; }
    if (c === "\n") {
      fechaPalavra(i);
      fechaComando();
      // Os corpos dos heredocs desta linha comecam aqui, um a seguir ao outro.
      let ini = i + 1;
      for (const h of heredocs.splice(0)) {
        const fim = fechaHeredoc(texto, ini, h.tag);
        const corpo = texto.slice(ini, Math.max(ini, texto.lastIndexOf("\n", fim - 1)));
        // Com dois na mesma linha (`a <<X <<Y`), o stdin e o ULTIMO, como na shell.
        h.cmd.heredoc = { corpo, citado: h.citado };
        // Num corpo sem aspas na etiqueta, os `$(...)` correm: julgam-se como comandos seus. Lido como uma string
        // entre aspas duplas (que e como a shell o expande), e so os INTERIORES contam — o texto nao e comando.
        if (!h.citado) out.push(...comandos(`"${corpo.replace(/"/g, "'")}"`).filter((x) => x.dentro));
        ini = fim + 1;
      }
      i = ini - 1;
      continue;
    }
    if (c === ";" || c === "(" || c === ")") { fechaPalavra(i); fechaComando(); if (c === ";" && prox === ";") i++; continue; }
    if (c === "&") {
      if (prox === ">") { fechaPalavra(i); redirPendente = prox === ">" && texto[i + 2] === ">" ? "&>>" : "&>"; i += redirPendente.length - 1; continue; }
      fechaPalavra(i);
      fechaComando();
      if (prox === "&") i++;
      continue;
    }
    if (c === "|") {
      fechaPalavra(i);
      if (prox === "|") { fechaComando(); i++; continue; }
      fechaComando(true);
      if (prox === "&") i++;
      continue;
    }
    if (c === "<" || c === ">") {
      // O descritor colado a frente (`2>`) e parte do operador, nao uma palavra.
      if (pal !== null && /^\d+$/.test(pal.texto) && !pal.citada) pal = null;
      else fechaPalavra(i);
      const op = /^(?:<<<|<<-|<<|<>|<&|>>|>&|>\||>!|<|>)/.exec(texto.slice(i))[0];
      redirPendente = op;
      i += op.length - 1;
      continue;
    }
    abre(i);
    pal.texto += c;
  }
  fechaPalavra(texto.length);
  fechaComando();
  for (const sub of interiores) out.push(...comandos(sub, true));
  return out;
}

// --- Quem corre codigo INLINE, por posicao ------------------------------------------------------

/** As letras de codigo inline de cada FAMILIA de interpretador, e as opcoes LONGAS que levam codigo alem de
 *  `--eval`/`--print`. Fechada: uma letra que nao esteja aqui nao conta, e o piso (as regex do `fronteira.mjs`)
 *  continua a apanhar o que apanhava. O `--run` so e do `php`: no `node` corre um script do `package.json`. */
const LETRAS = [
  [/^(?:node(?:js)?|bun|tsx|ts-node)/, "epc", []],
  [/^perl/, "eE", []],
  [/^(?:python|pypy)/, "c", []],
  [/^ruby/, "e", []],
  [/^php/, "rBRE", ["run", "process-begin", "process-code", "process-end"]],
  [/^(?:lua|Rscript|osascript)/, "e", []],
  [/^deno/, "", []],
];
/** Para um comando que e uma VARIAVEL ou uma substituicao: nao se sabe quem corre, e conta qualquer letra. */
const TODAS = [...new Set(LETRAS.map(([, l]) => l).join(""))].join("");
const TODAS_LONGAS = LETRAS.flatMap(([, , longas]) => longas);
/** O nome de um interpretador, pelo NOME BASE, com sufixo: `python3.12`, `python3-intel64`, `node.exe`, e a
 *  versao COLADA (`perl5.34` no macOS, `php8.2` e `lua5.4` no Debian) ou com `@` (`npx -p node@20 node@20`). */
const EH_INTERPRETADOR = new RegExp(`^(?:${NOMES_INTERPRETADOR})(?:[-.@\\d][\\w.@-]*)?$`);
/** O script logo a seguir ao interpretador, ESCRITO tal como a shell o entrega (sem aspas, `$`, `\`, glob):
 *  ai o `-e` que vier depois e do script. A mesma isencao estrita do `SCRIPT_A_SEGUIR` (#317). */
const SCRIPT = /^[\w./][\w./@+-]*\.(?:[cm]?js|ts|py|rb|pl|php)$/;
/** Palavras de shell que poem um comando a correr a seguir e nunca sao o comando. So AQUI: o `resto()` e
 *  partilhado e nao as consome de proposito (`fronteira-dados.mjs`, `PALAVRAS_SHELL`). O `time` NAO esta: e
 *  uma cabeca do `resto()`, que lhe conhece as flags (`time -p`); tira-lo antes escondia-as. */
const CHAVES = new Set(["do", "then", "else", "elif", "{", "coproc", "if", "while", "until", "!"]);
/** Os que correm um programa nomeado mais a frente, com opcoes proprias pelo meio (`npx -p x node`, `uv run
 *  --with x python`, `npm exec -- node`). Depois deles conta a primeira palavra com nome de interpretador. */
const EXECUTORES = /^(?:npx|bunx|bun|pnpm|yarn|npm|uv|poetry|pipenv|conda|nvm|cross-env|arch|caffeinate|flock|strace|nix|direnv|watch|parallel)$/;
const nomeBase = (w) => (w?.texto ?? "").replace(/^.*\//, "");

/** O indice da palavra que CORRE, depois das atribuicoes, das palavras-chave, do `exec` e das cabecas inertes.
 *  Ate estabilizar: `env X=1 node` tem uma atribuicao DEPOIS de uma cabeca. */
function verboEm(argv, de = 0) {
  let i = de;
  for (;;) {
    const ini = i;
    while (i < argv.length && (CHAVES.has(argv[i].texto) || /^[A-Za-z_]\w*=/.test(argv[i].texto))) i++;
    // O `exec` e as flags dele (`-c`, `-l`, `-a <nome>`).
    if (argv[i]?.texto === "exec") {
      i++;
      while (/^-[cla]+$/.test(argv[i]?.texto ?? "")) i += argv[i].texto.includes("a") ? 2 : 1;
    }
    // O `resto()` e o mesmo das cabecas da fronteira; cada palavra entra como UM token (as que tem espacos
    // ou estao vazias, por um marcador), e o que ele consumiu e o que falta no fim.
    const toks = argv.slice(i).map((w, k) => (w.texto === "" || /\s/.test(w.texto) ? `\u0000${k}` : w.texto));
    i = argv.length - resto(toks.join(" ")).length;
    if (i === ini) return i;
  }
}

/** As posicoes onde um interpretador pode estar: a do verbo, a seguir a um `{` (`function f { node ...`), a
 *  seguir ao `-exec` do `find`, e o primeiro interpretador depois de um executor. */
function posicoes(argv, v) {
  const ps = [v];
  argv.forEach((w, k) => w.texto === "{" && k > v && ps.push(verboEm(argv, k + 1)));
  if (nomeBase(argv[v]) === "find") argv.forEach((w, k) => /^-(?:exec|execdir|ok|okdir)$/.test(w.texto) && ps.push(verboEm(argv, k + 1)));
  if (EXECUTORES.test(nomeBase(argv[v]))) ps.push(argv.findIndex((w, k) => k > v && EH_INTERPRETADOR.test(nomeBase(w))));
  return ps.filter((p) => p >= 0 && p < argv.length);
}

/** Uma palavra cujo NOME a shell so conhece ao expandir: uma variavel, uma substituicao, um glob, chavetas
 *  (`$N`, `/usr/bin/$X`, `nod?`, `{node,}`). Fora o `[`/`[[`, que sao o `test`. */
const expande = (w) => !/^\[\[?$/.test(w.cru) && /[$`*?]|\[.+\]|\{[^}]*,/.test(w.cru.replace(/'[^']*'/g, ""));

/**
 * Este comando corre codigo INLINE num interpretador? E de que maneira.
 *
 * @param {{argv: {texto: string, cru: string}[]}} cmd um comando de `comandos()`
 * @returns {"letra"|"data"|"deno"|"variavel"|null} o sinal que o denuncia, ou `null`
 */
export function inlineDe(cmd) {
  const { argv } = cmd;
  // O `env -S '<comando>'` corre o valor como um comando: le-se como tal — separado (`-S x`) ou colado
  // (`-S'x'`, `--split-string=x`). Pela palavra `env` antes do `-S`, e nao pelo verbo: o `resto()` consome
  // o `env` E o valor do `-S`. (O `OPACO` nega o `env -S` de qualquer comando; isto so da o rotulo.)
  const env = argv.findIndex((w) => nomeBase(w) === "env");
  const s = argv.findIndex((w, k) => k > env && /^(?:-S|--split-string(?:=|$))/.test(w.texto));
  if (env >= 0 && s > env) {
    const colado = argv[s].texto.replace(/^(?:--split-string=?|-S)/, "");
    const de = comandos(colado || argv[s + 1]?.texto || "").map(inlineDe).find(Boolean);
    if (de) return de;
  }
  const v = verboEm(argv);
  for (const p of posicoes(argv, v)) {
    const w = argv[p];
    const base = nomeBase(w);
    const variavel = p === v && expande(w);
    const familia = LETRAS.find(([re]) => re.test(base));
    if (!variavel && !(EH_INTERPRETADOR.test(base) && familia)) continue;
    const [letras, longas] = variavel ? [TODAS, TODAS_LONGAS] : [familia[1], familia[2]];
    const sinal = (s) => (variavel ? "variavel" : s);
    // O `data:` numa atribuicao a frente: `NODE_OPTIONS='--import=data:...' node x.js`.
    if (argv.slice(0, p).some((x) => /^NODE_OPTIONS=.*data:/.test(x.texto))) return sinal("data");
    const resto = argv.slice(p + 1);
    if (!variavel && resto[0] && SCRIPT.test(resto[0].cru)) continue;
    if (!variavel && /^deno/.test(base) && resto.find((x) => !x.texto.startsWith("-"))?.texto === "eval") return "deno";
    for (const x of resto) {
      const longa = /^--([\w-]+)(?:=|$)/.exec(x.texto)?.[1];
      if (longa && ["eval", "print", ...longas].includes(longa)) return sinal("letra");
      if (/^(?:--?[\w-]+=)?data:/.test(x.texto)) return sinal("data");
      if (x.texto.startsWith("--")) continue;
      // As letras a cabeca do grupo, depois de digitos (`perl -0777ne`); e uma flag que a shell so conhece ao
      // expandir (`perl -l$E`), que conta como letra porque nao se sabe qual e.
      const grupo = /^-\d*([A-Za-z]+)/.exec(x.texto);
      if (grupo && [...grupo[1]].some((l) => letras.includes(l))) return sinal("letra");
      if (x.texto.startsWith("-") && /\$/.test(x.cru.replace(/'[^']*'/g, ""))) return sinal("letra");
    }
  }
  return null;
}
