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
 *
 * O QUE FICA DE FORA, dito: os caminhos escritos de outra maneira (`.cl''aude`, `"$PWD"/`, absolutos dentro do
 * codigo) — sao do `caminhos.mjs`, e nao da posicao; com a fronteira A VISTA, um wrapper fora de `EXECUTORES`;
 * o interpretador na ponta de um pipe com argumentos (`| node --input-type=module`) e o `sed`/`awk` que
 * escrevem, que sao os PRs (c) e (b) do #336. Passados `MAX_POSICOES`/`MAX_VOLTAS`, nega sem julgar.
 */
import { fimAspasDuplas, fimSubst } from "./caminhos.mjs";
import { CABECAS, NOMES_INTERPRETADOR, resto } from "./fronteira-dados.mjs";

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
 *   heredoc: {corpo: string, citado: boolean}|null, pipeDe: boolean, pipePara: boolean, dentro: boolean,
 *   dono?: object}[]} — o `dono` e o comando que contem a substituicao de onde o interior saiu (o `aJusante` le-o);
 *   as palavras partidas de chavetas levam `partida: true` (o `inlineDe` nao lhes da a isencao do script)
 *   pela ordem em que aparecem; os de dentro de uma substituicao vem DEPOIS do comando que a contem.
 *   O `redir` le-o o `cita` do `fronteira.mjs`. O `pipePara` e o `heredoc.corpo` ainda so os leem os testes: sao
 *   para o PR (c) do #336 (o heredoc como texto), e ficam aqui para o lexer ser um so.
 */
export function comandos(texto, dentro = false) {
  const out = [];
  const interiores = [];
  // As subshells abertas a seguir a um pipe: TODOS os comandos de `a | (b; c)` recebem o stdin do `a`, e nao so o
  // primeiro (leitura da 2.a passagem: `| (:; perl -lne unlink)` passava). Antes do `novo()`, que o le.
  const subPipe = [];
  const novo = (pipeDe = false) => ({ argv: [], redir: [], heredoc: null, pipeDe: pipeDe || subPipe.includes(true), pipePara: false, dentro });
  let cmd = novo();
  // Um interior guarda o comando que o CONTEM (`dono`): o `$(perl -lne unlink)` de `ls <f> | echo "$(...)"` le o
  // mesmo stdin, e o `aJusante` inclui-o quando inclui o dono (leitura da 3.a passagem).
  const guarda = (...ss) => interiores.push(...ss.map((s) => ({ s, dono: cmd })));
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
  // Um comando VAZIO passa o `pipeDe` ao seguinte: em `a | (b)` e `a |\n b`, o `(` e a mudanca de linha
  // fecham um comando sem palavras, e o `b` continua a receber o stdin do `a`.
  const fechaComando = (pipePara = false) => {
    cmd.pipePara = pipePara;
    const vazio = !(cmd.argv.length || cmd.redir.length || cmd.heredoc);
    if (!vazio) out.push(cmd);
    cmd = novo(pipePara || (vazio && cmd.pipeDe));
  };
  /** O `$((` em `s[k]` e ARITMETICO so se o `(` de dentro fecha mesmo antes do `)` de fora: `$((1<<2))` e;
   *  `$((node -pe x); true)` e uma substituicao com uma subshell, e corre (bash e zsh, auditoria do PR a). */
  const aritmetica = (s, k, fim) => s[k + 2] === "(" && fechaSubst(s, k + 1) === fim - 1;
  /** O que CORRE dentro de um texto que nao e comando (aspas duplas, aritmetica): os `$(...)` e as crases. Na
   *  aritmetica entra-se de novo: `$(( $(node -pe x) ))` corre o `node` (leitura da 2.a passagem). */
  const correDentro = (s) => {
    const achados = [];
    for (let k = 0; k < s.length; k++) {
      if (s[k] === "\\") { k++; continue; }
      if (s[k] === "$" && s[k + 1] === "(") {
        const f = fechaSubst(s, k);
        if (aritmetica(s, k, f)) achados.push(...correDentro(s.slice(k + 3, f - 1)));
        else achados.push(s.slice(k + 2, f));
        k = f;
      } else if (s[k] === "`") {
        let f = k + 1;
        while (f < s.length && s[f] !== "`") f += s[f] === "\\" ? 2 : 1;
        achados.push(s.slice(k + 1, f));
        k = f;
      }
    }
    return achados;
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
      // O `\`+newline dentro de aspas duplas tambem e continuacao de linha: `"no\<nl>de"` e `node`.
      pal.texto += dentroAspas.replace(/\\([\n"\\$`])/g, (_m, ch) => (ch === "\n" ? "" : ch));
      pal.citada = true;
      guarda(...correDentro(dentroAspas));
      i = j;
      continue;
    }
    // Substituicoes fora de aspas: `$(...)`, `<(...)`, `>(...)`. O `$((...))` aritmetico nao corre nada.
    if ((c === "$" || ((c === "<" || c === ">") && pal === null)) && prox === "(") {
      abre(i);
      const j = fechaSubst(texto, i);
      if (c === "$" && aritmetica(texto, i, j)) guarda(...correDentro(texto.slice(i + 3, j - 1)));
      else guarda(texto.slice(i + 2, j));
      pal.texto += texto.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "`") {
      abre(i);
      let j = i + 1;
      while (j < texto.length && texto[j] !== "`") j += texto[j] === "\\" ? 2 : 1;
      guarda(texto.slice(i + 1, j));
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
        // Sem a etiqueta de fecho, a shell corre na mesma o corpo ate ao fim — a ultima linha incluida.
        const ultima = texto.lastIndexOf("\n", fim - 1) + 1;
        const achou = ultima >= ini && texto.slice(ultima, fim).trim() === h.tag;
        const corpo = achou ? texto.slice(ini, Math.max(ini, ultima - 1)) : texto.slice(ini);
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
    if (c === "(") {
      fechaPalavra(i);
      subPipe.push(!(cmd.argv.length || cmd.redir.length || cmd.heredoc) && cmd.pipeDe);
      fechaComando();
      continue;
    }
    if (c === ")") { fechaPalavra(i); subPipe.pop(); fechaComando(); continue; }
    if (c === ";") { fechaPalavra(i); fechaComando(); if (prox === ";") i++; continue; }
    if (c === "&") {
      if (prox === ">") { fechaPalavra(i); redirPendente = texto[i + 2] === ">" ? "&>>" : "&>"; i += redirPendente.length - 1; continue; }
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
  for (const { s, dono } of interiores) out.push(...comandos(s, true).map((c) => (c.dono ? c : Object.assign(c, { dono }))));
  return out;
}

// --- Quem corre codigo INLINE, por posicao ------------------------------------------------------

/** As letras de codigo inline de cada FAMILIA de interpretador, e as opcoes LONGAS que levam codigo alem de
 *  `--eval`/`--print`. Fechada: uma letra que nao esteja aqui nao conta, e o piso (as regex do `fronteira.mjs`)
 *  continua a apanhar o que apanhava. O `--run` so e do `php`: no `node` corre um script do `package.json`.
 *
 *  SEM letras que levam valor, de proposito. Uma versao parava o grupo nelas, para `perl -MTime::HiRes` nao
 *  contar como `-e`, e duas leituras acharam QUATRO afrouxamentos: `perl -de`, `ruby -We`/`-Kue` e o `-M` do
 *  perl, cujo valor tambem e codigo (`-MFile::Temp;unlink(...)`). Esse falso positivo fica, como no b5eb0fb. */
/** Os nomes das shells, uma so vez: a familia e o nome do interpretador leem-nos daqui. A folha nao as tem nos
 *  `NOMES_INTERPRETADOR` (la o `RECEBE` le-as a parte, no `SHELL` do `fronteira.mjs`). */
export const NOMES_SHELL = "sh|bash|zsh|dash|ksh|csh|tcsh|fish";
const LETRAS = [
  [/^(?:node(?:js)?|bun|tsx|ts-node)/, "epc", []],
  [/^perl/, "eE", []],
  [/^(?:python|pypy)/, "c", []],
  [/^ruby/, "e", []],
  [/^php/, "rBRE", ["run", "process-begin", "process-code", "process-end"]],
  [/^(?:lua|Rscript|osascript)/, "e", []],
  [/^deno/, "", []],
  // As SHELLS com `-c` (leitura da 4.a passagem): o `OPACO` so as via pelo nome escrito por inteiro e com um espaco
  // antes do `-c`, e `{bash,-c} '<escrita>'` e `b''ash -c '<escrita>'` passavam — no `main` e no b5eb0fb.
  [new RegExp(`^(?:${NOMES_SHELL})`), "c", []],
];
/** A familia das shells: a ultima da tabela. O `inlineDe` da-lhe um sinal proprio ("shell"). */
const FAMILIA_SHELL = LETRAS[LETRAS.length - 1];
/** A familia de um nome base, ou `null`. Exportada para o teste que prende esta tabela aos
 *  `NOMES_INTERPRETADOR` da folha: um nome novo la sem familia aqui ficava sem cobertura, sem sinal (`TP8`). */
export const familiaDe = (base) => LETRAS.find(([re]) => re.test(base)) ?? null;
/** Para um comando que e uma VARIAVEL ou uma substituicao: nao se sabe quem corre, e conta qualquer letra. */
const TODAS = [...new Set(LETRAS.map(([, l]) => l).join(""))].join("");
const TODAS_LONGAS = LETRAS.flatMap(([, , longas]) => longas);
/** O nome de um interpretador, pelo NOME BASE, com QUALQUER sufixo depois de `-`, `.`, `@` ou um digito:
 *  `python3.12`, `python3-intel64`, `python3-dbg`, `ts-node-esm`, `node.exe`, `perl5.34`, `php8.2`, `node@20`.
 *  Largo de proposito: estreita-lo para tirar o `node-gyp` deixava de fora interpretadores reais (leitura da 2.a
 *  passagem), e o `node-gyp -e` ja e negado pelo piso (o `\bnode\b` da regex de antes). */
const EH_INTERPRETADOR = new RegExp(`^(?:${NOMES_INTERPRETADOR}|${NOMES_SHELL})(?:[-.@\\d][\\w.@-]*)?$`);
/** O script logo a seguir ao interpretador, ESCRITO tal como a shell o entrega (sem aspas, `$`, `\`, glob):
 *  ai o `-e` que vier depois e do script. A mesma isencao estrita do `SCRIPT_A_SEGUIR` (#317). O `.sh` so isenta
 *  uma SHELL: para as outras familias `perl x.sh -le '...'` era negado no b5eb0fb, e continua. */
const SCRIPT = /^[\w./][\w./@+-]*\.(?:[cm]?js|ts|py|rb|pl|php)$/;
const SCRIPT_SHELL = /^[\w./][\w./@+-]*\.(?:sh|bash|zsh)$/;
/** Palavras de shell que poem um comando a correr a seguir e nunca sao o comando. O `resto()` partilhado ja
 *  consome `if`/`else`/`elif`/`!` (`PALAVRAS_SHELL` da folha); as outras so se consomem AQUI, porque la nao
 *  consumi-las e deliberado (`fronteira-dados.mjs`). O `time` NAO esta: e uma cabeca do `resto()`, que lhe
 *  conhece as flags (`time -p`); tira-lo antes escondia-as. */
const CHAVES = new Set(["do", "then", "else", "elif", "{", "coproc", "if", "while", "until", "!"]);
/** Os que correm um programa nomeado mais a frente, com opcoes proprias pelo meio (`npx -p x node`, `uv run
 *  --with x python`, `script -q /dev/null node`). Depois deles conta a primeira palavra com nome de
 *  interpretador, ou que a shell so conhece ao expandir. Uma lista fechada: um wrapper fora dela so se ve no
 *  ramo citado, onde qualquer palavra conta (`inlineDe`, `qualquer`). As CABECAS chamadas por um caminho que nao
 *  e de sistema (`/opt/homebrew/bin/env`) tambem: o `resto()` nao as consome, e o verbo fica a ser elas. */
const EXECUTORES = new Set([
  "npx", "bunx", "bun", "pnpm", "yarn", "npm", "uv", "poetry", "pipenv", "conda", "nvm", "cross-env", "arch",
  "caffeinate", "flock", "strace", "nix", "direnv", "watch", "parallel", "rlwrap", "xcrun", "chronic", "script",
  ...CABECAS,
]);
const nomeBase = (w) => (w?.texto ?? "").replace(/^.*\//, "");
/** Quantas palavras o `resto()` ve de cada vez: as cabecas de um comando real sao poucas, e sem tecto o
 *  `verboEm` por cada `{`/`-exec` era cubico — 11 s a 4000 caracteres, no processo do hook (auditoria do PR a). */
const JANELA = 32;
/** Os TECTOS que falham fechado: um comando com mais posicoes (`{`, `-exec`) ou mais voltas de cabecas do que
 *  isto nao e trabalho de ninguem, e julga-lo custava segundos (`{ x env A=1` encadeado: 277 s a 64k
 *  caracteres, auditoria do PR a). Passado o tecto nao se sabe quem corre, e conta como um comando-variavel. */
export const MAX_POSICOES = 32;
const MAX_VOLTAS = 64;

/** O indice da palavra que CORRE, depois das atribuicoes, das palavras-chave, do `exec` e das cabecas inertes.
 *  Ate estabilizar: `env X=1 node` tem uma atribuicao DEPOIS de uma cabeca. `-1` passado o `MAX_VOLTAS`. */
function verboEm(argv, de = 0) {
  let i = de;
  for (let volta = 0; ; volta++) {
    if (volta > MAX_VOLTAS) return -1;
    const ini = i;
    // As palavras-chave, as atribuicoes e o `exec` com as flags dele (`-c`, `-l`, `-a <nome>`), num ciclo SO:
    // um `resto()` por cada `exec` seguido era o que fazia 4000 caracteres custarem segundos.
    for (;;) {
      const t = argv[i]?.texto;
      if (t === undefined) break;
      if (CHAVES.has(t) || /^[A-Za-z_]\w*=/.test(t)) i++;
      else if (t === "exec") {
        i++;
        while (/^-[cla]+$/.test(argv[i]?.texto ?? "")) i += argv[i].texto.includes("a") ? 2 : 1;
      } else break;
    }
    // O `resto()` e o mesmo das cabecas da fronteira; cada palavra entra como UM token (as que tem espacos
    // ou estao vazias, por um marcador), e o que ele consumiu e o que falta no fim da janela.
    // Uma janela CHEIA consumida inteira e uma cadeia de cabecas que o `resto()` nao viu acabar: o estado da cabeca
    // (que flags levam valor) perdia-se na fronteira, e o verbo passava a ser uma flag. Nao se sabe: -1.
    const janela = argv.slice(i, i + JANELA);
    const toks = janela.map((w, k) => (w.texto === "" || /\s/.test(w.texto) ? `\u0000${k}` : w.texto));
    const sobra = resto(toks.join(" ")).length;
    if (janela.length === JANELA && sobra === 0) return -1;
    i += janela.length - sobra;
    if (i === ini) return i;
  }
}

/** Uma palavra cujo NOME a shell so conhece ao expandir: uma variavel, uma substituicao, um glob, chavetas
 *  (`$N`, `/usr/bin/$X`, `nod?`, `{node,}`). Fora o `[`/`[[`, que sao o `test`. */
const expande = (w) => !/^\[\[?$/.test(w.cru) && /[$`*?]|\[.+\]|\{[^}]*,/.test(w.cru.replace(/'[^']*'/g, ""));

/** As posicoes onde um interpretador pode estar: a do verbo, a seguir a um `{` (`function f { node ...`), a
 *  seguir ao `-exec` do `find`, e o primeiro interpretador (ou nome que expande) depois de um executor. Com
 *  `qualquer`, todas as palavras nao citadas com nome de interpretador. `null` passado o `MAX_POSICOES`. */
function posicoes(argv, v, qualquer) {
  if (argv.filter((w) => w.texto === "{" || /^-(?:exec|execdir|ok|okdir)$/.test(w.texto)).length > MAX_POSICOES) return null;
  let estourou = false;
  const verbo = (k) => {
    const r = verboEm(argv, k);
    if (r < 0) estourou = true;
    return r;
  };
  const ps = [v];
  argv.forEach((w, k) => w.texto === "{" && k > v && ps.push(verbo(k + 1)));
  if (nomeBase(argv[v]) === "find") argv.forEach((w, k) => /^-(?:exec|execdir|ok|okdir)$/.test(w.texto) && ps.push(verbo(k + 1)));
  // As DUAS: o primeiro interpretador E a primeira palavra que expande. So uma delas deixava a outra sem posicao —
  // `cross-env A=$HOME NODE_OPTIONS=...data:... node x.js` perdia o `node` para o `A=$HOME` (leitura da 4.a passagem).
  //  E TODAS as palavras com nome de interpretador, e nao so a primeira: `flock /tmp/sh.lock node -e ...` dava a
  //  posicao ao `sh.lock` (uma shell) e o `node` deixava de contar (leitura da 5.a passagem).
  if (EXECUTORES.has(nomeBase(argv[v]))) {
    argv.forEach((w, k) => k > v && EH_INTERPRETADOR.test(nomeBase(w)) && ps.push(k));
    ps.push(argv.findIndex((w, k) => k > v && expande(w)));
  }
  if (qualquer) argv.forEach((w, k) => !w.citada && EH_INTERPRETADOR.test(nomeBase(w)) && ps.push(k));
  return estourou ? null : [...new Set(ps)].filter((p) => p >= 0 && p < argv.length);
}

/** As chavetas de uma palavra inteira (`{node,-pe,CODE}`) sao palavras SEPARADAS depois da expansao, como no
 *  bash; dentro de uma so palavra, as flags ficavam escondidas. So a forma simples, sem chavetas aninhadas. */
//  A que nao se parte (o codigo tem `{`/`}`) fica com o cru `$`: expande, e no verbo conta como comando-variavel.
const semChavetas = (argv) =>
  argv.flatMap((w) =>
    !/^\{[^'"{}]*,/.test(w.cru) ? [w]
      : /^\{[^{}]*\}$/.test(w.texto)
        ? w.texto.slice(1, -1).split(",").filter(Boolean).map((t) => ({ texto: t, cru: t, citada: false, partida: true }))
        : [{ texto: w.texto, cru: "$", citada: false }]);

/**
 * Este comando corre codigo INLINE num interpretador? E de que maneira.
 *
 * @param {{argv: {texto: string, cru: string, citada: boolean}[]}} cmd um comando de `comandos()`
 * @param {boolean} [qualquer] se conta QUALQUER palavra nao citada com nome de interpretador, e nao so as
 *   posicoes conhecidas — o que o ramo citado do `fronteira.mjs` pede, onde a fronteira so esta dentro de aspas
 * @returns {"letra"|"data"|"deno"|"variavel"|"shell"|null} o sinal que o denuncia, ou `null`
 */
export function inlineDe(cmd, qualquer = false) {
  // As DUAS leituras, com as chavetas partidas e por partir, e nega se qualquer delas negar. Partir e uma
  // aproximacao (a shell tira os pedacos vazios, o zsh nem sempre expande): a palavra inteira continua a dar o
  // "variavel" que dava antes, e `{,node} -pe ...` nao fica com o pedaco vazio como verbo (leitura da 6.a passagem).
  const partido = semChavetas(cmd.argv);
  return lerArgv(partido, qualquer) ?? (partido.length === cmd.argv.length && partido.every((w, k) => w === cmd.argv[k]) ? null : lerArgv(cmd.argv, qualquer));
}

/** O `inlineDe` sobre um argv ja preparado. */
function lerArgv(argv, qualquer) {
  // O `env -S '<comando>'` corre o valor como um comando: le-se como tal — separado (`-S x`) ou colado
  // (`-S'x'`, `--split-string=x`). Pela palavra `env` antes do `-S`, e nao pelo verbo: o `resto()` consome
  // o `env` E o valor do `-S`. (O `OPACO` nega o `env -S` de qualquer comando; isto so da o rotulo.)
  const env = argv.findIndex((w) => nomeBase(w) === "env");
  const s = argv.findIndex((w, k) => k > env && /^(?:-S|--split-string(?:=|$))/.test(w.texto));
  if (env >= 0 && s > env) {
    const colado = argv[s].texto.replace(/^(?:--split-string=?|-S)/, "");
    const de = comandos(colado || argv[s + 1]?.texto || "").map((c) => inlineDe(c, qualquer)).find(Boolean);
    if (de) return de;
  }
  const v = verboEm(argv);
  const ps = v < 0 ? null : posicoes(argv, v, qualquer);
  if (ps === null) return "variavel";
  for (const p of ps) {
    const w = argv[p];
    const base = nomeBase(w);
    // No VERBO, um nome que expande e sempre comando-variavel, mesmo com cara de interpretador: `$P/node` com
    // `P='perl -I'` corre o perl (leitura da 3.a passagem). Noutra posicao, so se nao tiver cara de interpretador.
    const variavel = expande(w) && (p === v || !EH_INTERPRETADOR.test(base));
    const familia = familiaDe(base);
    if (!variavel && !(EH_INTERPRETADOR.test(base) && familia)) continue;
    const [letras, longas] = variavel ? [TODAS, TODAS_LONGAS] : [familia[1], familia[2]];
    // Uma SHELL com `-c` tem sinal proprio: e opaca (corre um comando, e nao codigo de um interpretador), e a razao
    // dela nao leva a nota do `jq`.
    const shell = !variavel && familia === FAMILIA_SHELL;
    const sinal = (s) => (variavel ? "variavel" : shell ? "shell" : s);
    // As chavetas que nao se partiram (`semChavetas`) tem o codigo DENTRO da palavra: nao ha argumentos a ler.
    // E as que nem chegaram a partir-se (`''{perl,-e,...}`, `${x}{node,-pe,...}`): chavetas com virgula no cru.
    if (variavel && (w.cru === "$" || /\{[^}]*,/.test(w.cru.replace(/'[^']*'/g, "")))) return "variavel";
    // O `data:` numa atribuicao a frente: `NODE_OPTIONS='--import=data:...' node x.js`.
    if (argv.slice(0, p).some((x) => /^NODE_OPTIONS=.*data:/.test(x.texto))) return sinal("data");
    const args = argv.slice(p + 1);
    // Um pedaco de chavetas (`{node,x.js}`) nao e um script ESCRITO: a isencao e so para o que a shell entrega tal qual.
    if (!variavel && args[0] && !args[0].partida && (shell ? SCRIPT_SHELL : SCRIPT).test(args[0].cru)) continue;
    if (!variavel && /^deno/.test(base) && args.find((x) => !x.texto.startsWith("-"))?.texto === "eval") return "deno";
    for (const x of args) {
      const longa = /^--([\w-]+)(?:=|$)/.exec(x.texto)?.[1];
      if (longa && ["eval", "print", ...longas].includes(longa)) return sinal("letra");
      if (/^(?:--?[\w-]+=)?data:/.test(x.texto)) return sinal("data");
      if (x.texto.startsWith("--")) continue;
      // As letras E os digitos a cabeca de cada grupo (`perl -0777ne`, `perl -l0e`), em cada pedaco da palavra
      // (`perl '-w -E' ...`, e uma quebra de linha: `python3 "-c<NL>..."`, leitura da 3.a passagem). Um
      // superconjunto do que o b5eb0fb lia. E uma flag que a shell so conhece ao expandir (`perl -l$E`).
      for (const pedaco of x.texto.split(/\s+/)) {
        const grupo = /^-([\dA-Za-z]+)/.exec(pedaco)?.[1] ?? "";
        if ([...grupo].some((l) => letras.includes(l))) return sinal("letra");
      }
      if (x.texto.startsWith("-") && /\$/.test(x.cru.replace(/'[^']*'/g, ""))) return sinal("letra");
    }
  }
  return null;
}

/** Os comandos que CITAM a fronteira, e os que lhes ficam a jusante por pipe — incluindo o bloco inteiro de um
 *  `| while read l; do ...; done` (ou `{ ...; }`, `if`), cujo corpo vive noutros comandos: o caminho chega pelo
 *  stdin, e o codigo nao o cita (as leituras do PR a do #336).
 * @param {ReturnType<typeof comandos>} cmds
 * @param {(c: ReturnType<typeof comandos>[number]) => boolean} cita
 */
export function aJusante(cmds, cita) {
  const ABRE = /^(?:while|until|for|if|select|case|\{)$/;
  const FECHA = /^(?:done|fi|esac|\})$/;
  let corrente = false;
  let fundo = 0;
  const incluidos = new Set();
  return cmds.filter((c) => {
    // O interior de uma substituicao vai com o comando que o contem — e conta por si, como qualquer outro.
    const fica = topo(c) || (c.dono !== undefined && incluidos.has(c.dono));
    if (fica) incluidos.add(c);
    return fica;
  });
  function topo(c) {
    // A palavra em posicao de comando, depois do `do`/`then`: so ai `done`/`fi` fecham — `echo done` e texto.
    const k = c.argv.findIndex((w) => !/^(?:do|then|else|elif)$/.test(w.texto));
    const primeira = c.argv[k]?.texto ?? "";
    const abre = ABRE.test(c.argv[0]?.texto ?? "") || ABRE.test(primeira);
    if (fundo > 0) {
      fundo += (abre ? 1 : 0) - (FECHA.test(primeira) ? 1 : 0);
      return true;
    }
    corrente = cita(c) || (c.pipeDe && corrente);
    if (corrente && c.pipeDe && abre) fundo = 1;
    return corrente;
  }
}
