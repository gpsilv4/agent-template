/**
 * O LEXER do comando: os comandos simples de um texto, e as palavras que a shell entrega a cada um — {{PROJECT_NAME}}
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
 * Vivia no `posicao.mjs` ate ao #580, que o separou da leitura da POSICAO (que palavra corre, o que e argumento:
 * ficou la) para os dois ficarem com folga do Guard 17. Os blocos vieram sem mudanca.
 */
import { fimAspasDuplas, fimSubst } from "./caminhos.mjs";
import { ansiC } from "./fronteira-dados.mjs";

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
 *   O `redir` le-o o `cita` do `fronteira.mjs`, e o `recebeDe` do `recebe.mjs` (a here-string, #566), que tambem le se
 *   ha `heredoc` (nao o corpo). O `heredoc.corpo` le-o o `textos-publicos.mjs`; o `pipePara` ainda so os testes (e
 *   para o PR (c) do #336, o heredoc como texto, e fica aqui para o lexer ser um so).
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
      pal.texto += ansiC(texto.slice(i + 2, j));
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
