/**
 * O que um comando PUBLICA: os textos de um `gh` e de um `git tag`/`git commit`, lidos por posicao — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#375b): o `commit-msg` so ve uma mensagem de commit, e o `check-textos-publicos.mjs` so ve o
 * que JA esta publicado. Um titulo de PR, um comentario, o corpo de um squash (`gh pr merge --body`, que fica no
 * `main` para sempre, `TP14`) ou as notas de uma release (o corpo da tag anotada: o `commit-msg` nao corre num
 * `git tag`) saiam sem passar por ninguem. Este modulo diz que textos o comando vai publicar; o hook
 * `guard-textos-publicos.mjs` procura neles os nomes da lista.
 *
 * E PURO: recebe o comando, a pasta, a home e um `ler(caminho)`; o hook da-lhe o disco. Nao decide nada sobre nomes.
 *
 * O QUE NAO LE O TEXTO, e por isso fica em `porLer` (o hook NEGA, `TP2`/`TP6`): um valor com uma expansao que nao
 * se resolve sem correr a shell (`"$BODY"`, `"$(gerador)"`); o stdin que nao e um heredoc (um pipe, um `<<<`); um
 * ficheiro que nao se le (ou que nao e um ficheiro regular), ou relativo depois de um `cd` que nao se resolve. A
 * UNICA expansao resolvida e a forma literal `"$(cat <<'X' ... X)"`, lida do PROPRIO valor pela etiqueta: o lexer
 * fecha um `$(` no primeiro `)`, e um `1)` no corpo escondia o resto dele (leitura independente do #375b).
 * As mensagens do `porLer` dizem a origem e o tipo, nunca o valor: o valor pode ter o nome.
 *
 * UM FICHEIRO ESCRITO NO MESMO TEXTO tambem fica em `porLer` (#396): o hook e um `PreToolUse` e le o disco ANTES de o
 * comando correr, logo `cat > f <<'EOF' ... EOF && gh pr create --body-file f` era verificado com o `f` VELHO. Conta
 * uma escrita (uma redireccao de escrita; um argumento de um comando que nao esta em `LEITORES`; tudo debaixo da
 * pasta de destino de um verbo de `COPIAM`) que venha ANTES do comando que le, no MESMO pipeline, numa redireccao dele proprio, dentro
 * de um `$(...)`, ou num texto com um ciclo (ai a ordem nao vale). Uma redireccao para um alvo que nao se resolve
 * conta como escrita do ficheiro. Nao se tenta ler o texto novo: a razao diz para escrever numa chamada e publicar
 * noutra. Limites, ditos: o `git` e o `gh` contam como leitores (um `git checkout -- f` antes passa); um caminho so
 * dentro de codigo inline (`node -e "...f..."`), num argumento com uma expansao (`cp a "$F"`), colado a uma flag
 * curta (`sort -of`, `curl -of`), ou relativo depois de um `cd` que nao se resolve nao se ve; um `&` (fundo) conta
 * como sequencia. E nega a mais, de proposito: um alvo `'$F'` entre plicas conta como expansao (o lexer da o alvo
 * sem aspas), e um `2>"$X"` no proprio comando que publica conta como escrita de tudo (o lexer nao guarda o
 * descritor). A licao (`PreToolUse` que le do disco o que o proprio comando muda) nao cabe no catalogo dos `TP`,
 * cheio: fica aqui.
 *
 * O ALVO EXTERNO (`alvoExterno`): o comando publica noutro repo (`-R`, `GH_REPO`, um `gh api repos/<o>/<r>`, `git -C`,
 * um `cd`). Num repo DESLIGADO o hook arma na mesma: desligar e para os nomes legitimos do proprio repo privado, e um
 * `gh issue create -R <repo-publico>` corrido de la publicava-os.
 *
 * O QUE FICA DE FORA, dito: uma invocacao que nao e esta forma (`/usr/bin/env -S gh`, um alias, `sh -c '...'`,
 * `curl` a API) — o hook e uma barreira contra o descuido, nao contra quem a queira contornar (`CLAUDE.md`).
 * E o texto que o `gh` le de um editor (`gh pr create` sem `--body`): esse nao esta no comando.
 */
import { isAbsolute, resolve, sep } from "path";
import { comandos } from "./posicao.mjs";
import { CABECAS } from "./fronteira-dados.mjs";

/** As flags de texto e de ficheiro (`-`, ou um caminho) dos subcomandos que publicam, POR GRUPO: a mesma letra muda
 *  de sentido (o `-d` e o `--draft` do `gh pr create`, o `-m` o `--merge` do `gh pr merge`, o `--comment` do `gh pr
 *  review` um modo sem valor — lidos como texto, engoliam a flag seguinte). Um subcomando fora de `subs` nao publica. */
const TEXTO = ["--title", "-t", "--body", "-b", "--notes", "-n", "--subject"];
const FICHEIRO = ["--body-file", "-F", "--notes-file"];
const FECHO = { texto: [...TEXTO, "--comment", "-c"], ficheiro: FICHEIRO };
const GH = {
  issue: { subs: ["create", "edit", "comment", "close", "reopen"] },
  pr: { subs: ["create", "edit", "comment", "review", "merge", "close", "reopen"] },
  release: { subs: ["create", "edit"] },
  repo: { subs: ["create", "edit"], flags: { texto: ["--description", "-d", "--homepage", "-h"], ficheiro: [] } },
  label: { subs: ["create", "edit"], flags: { texto: ["--description", "-d"], ficheiro: [] } },
  // O `gist` publica os FICHEIROS posicionais: o `-f` (o nome no gist) leva valor, e nao e texto a ler.
  gist: { subs: ["create", "edit"], flags: { texto: ["--desc", "-d"], ficheiro: [], comValor: ["--filename", "-f"] }, posicionais: true },
};
/** O `gh api`: `-f k=v` e texto, `-F k=@caminho` le um ficheiro, `--input` tambem. Com `-X GET`, nao publica. */
const API = { campo: ["-f", "--raw-field", "-F", "--field"], ficheiro: ["--input"], comValor: ["-X", "--method", "-H", "--header", "-q", "--jq", "-t", "--template", "--hostname"] };
const GIT = { texto: ["-m", "--message"], ficheiro: ["-F", "--file"] };
/** As opcoes globais do `git` que levam um valor a seguir; as tres primeiras mudam o REPO do comando. */
const GIT_COM_VALOR = ["-C", "--git-dir", "--work-tree", "-c", "--namespace", "--exec-path"];
/** As palavras de controlo que o lexer deixa no inicio do comando seguinte (`for ...; do gh ...`). */
const CONTROLO = new Set(["do", "then", "else", "elif", "{", "if", "while", "until", "!", "exec", "coproc"]);
/** O stdin escrito como ficheiro: o mesmo que `-`. Outro `/dev/fd/N` nao se sabe o que e. */
const STDIN = /^(?:\/dev\/stdin|\/dev\/fd\/0|\/proc\/self\/fd\/0)$/;
/** Os comandos que so LEEM os argumentos (#396): fora daqui, um argumento que e o ficheiro lido conta como escrita.
 *  Local e curta de proposito: a `LEITURA` do `fronteira.mjs` tem `sed`/`awk`/`node`, que escrevem. */
const LEITORES = new Set(["cat", "head", "tail", "wc", "grep", "rg", "diff", "cmp", "ls", "stat", "file", "test", "[", "[[",
  "md5", "md5sum", "shasum", "sha256sum", "less", "more", "realpath", "dirname", "basename", "echo", "printf", "gh", "git",
  "cd", "pushd", "popd"]);
/** Os que copiam PARA uma pasta: ai a pasta do ficheiro lido tambem conta (`cp x /tmp/` escreve `/tmp/x`). */
const COPIAM = new Set(["cp", "mv", "install", "ln", "rsync"]);
/** As redireccoes que escrevem; e os alvos que nao sao ficheiros (um descritor, o `/dev/null`, o `-` que fecha). */
const ESCREVE = new Set([">", ">>", ">|", ">!", "&>", "&>>", "<>", ">&"]);
const NAO_E_FICHEIRO = /^(?:\d+-?|-|\/dev\/null)$/;
const CICLO = new Set(["for", "while", "until", "select"]);

/**
 * A palavra tem uma expansao que so a shell resolve? Fora de plicas: `$nome`, `${`, `$(`, `$?`... e as crases. DENTRO
 * de aspas duplas uma plica e um caracter (`"Here's $(cat f)"` expande); num `corpo` de heredoc tambem.
 */
export function temExpansao(cru, corpo = false) {
  let duplas = false;
  for (let i = 0; i < cru.length; i++) {
    const c = cru[i];
    if (c === "\\") { i++; continue; }
    if (c === '"' && !corpo) { duplas = !duplas; continue; }
    if (c === "'" && !duplas && !corpo) { const j = cru.indexOf("'", i + 1); if (j < 0) return false; i = j; continue; }
    if (c === "`") return true;
    if (c === "$" && /[A-Za-z_{(@*#?!$0-9-]/.test(cru[i + 1] ?? "")) return true;
  }
  return false;
}

/** O indice da palavra que CORRE (e as atribuicoes antes dela): salta `X=y`, as cabecas (`env`, `timeout 5`) e as
 *  palavras de controlo (`do`, `then`, `!`). */
function cabeca(ws) {
  const atribuicoes = [];
  let i = 0;
  while (i < ws.length) {
    const t = ws[i].texto;
    if (/^[A-Za-z_]\w*=/.test(t)) { atribuicoes.push(t.split("=")[0]); i++; continue; }
    if (CONTROLO.has(t)) { i++; continue; }
    if (CABECAS.has(t.replace(/^.*\//, ""))) {
      i++;
      while (i < ws.length && (/^-/.test(ws[i].texto) || /^\d+[smhd]?$/.test(ws[i].texto))) i++;
      continue;
    }
    return { i, atribuicoes };
  }
  return { i: -1, atribuicoes };
}

/**
 * Os pares `[flag, palavra-do-valor]` de `ws` (desde `ini`) para as flags de `nomes`, e os indices que eles e os
 * `comValor` consumiram. Le `--f v`, `--f=v`, `-f v`, `-fv` e um GRUPO curto (`-am msg`, `-aF/tmp/x`, `-dt titulo`):
 * a letra que leva valor fica com o resto da palavra, ou com a palavra seguinte se for a ultima do grupo.
 */
function valores(ws, ini, nomes, comValor = []) {
  const out = [];
  const usados = new Set();
  const curtas = new Set([...nomes, ...comValor].filter((f) => /^-[A-Za-z]$/.test(f)).map((f) => f[1]));
  for (let i = ini; i < ws.length; i++) {
    const t = ws[i].texto;
    if (t === "--") break;
    const longa = [...nomes, ...comValor].find((f) => f.startsWith("--") && (t === f || t.startsWith(`${f}=`)));
    if (longa) {
      usados.add(i);
      const w = t === longa ? ws[++i] : { texto: t.slice(longa.length + 1), cru: ws[i].cru.slice(longa.length + 1) };
      if (w) { usados.add(i); if (nomes.includes(longa)) out.push([longa, w]); }
      continue;
    }
    if (!/^-[A-Za-z]/.test(t)) continue;
    for (let k = 1; k < t.length; k++) {
      if (!curtas.has(t[k])) continue;
      const f = `-${t[k]}`;
      usados.add(i);
      const w = k + 1 < t.length ? { texto: t.slice(k + 1), cru: ws[i].cru.slice(k + 1) } : ws[++i];
      if (w) { usados.add(i); if (nomes.includes(f)) out.push([f, w]); }
      break;
    }
  }
  return { pares: out, usados };
}

/** O corpo da forma literal `"$(cat <<'X' ... X)"`, lido do proprio valor pela etiqueta, ou `null` se nao e essa forma.
 *  `citado`: a etiqueta tem aspas (o corpo nao expande). Com `<<-`, os tabs do inicio saem, como na shell. */
function corpoDeCat(cru) {
  const m = /^"\$\(\s*cat\s+<<(-?)\s*(['"]?)([A-Za-z_]\w*)\2[ \t]*\n([\s\S]*?)\n[ \t]*\3[ \t]*\n?[ \t]*\)"$/.exec(cru);
  if (!m) return null;
  return { corpo: m[1] ? m[4].replace(/^\t+/gm, "") : m[4], citado: m[2] !== "" };
}

/**
 * Os textos que `texto` publica: `{ publica, alvoExterno, textos: [{origem, texto}], porLer: [motivo] }`. `publica` e
 * verdade se ha UM subcomando destes com uma flag de texto (sem isso o hook nem le a lista).
 * @param {string} texto  o comando
 * @param {{ cwd: string, home?: string, ler: (caminho: string) => string }} ctx
 */
export function textosDoComando(texto, { cwd, home, ler }) {
  const cmds = comandos(texto);
  const out = { publica: false, alvoExterno: false, textos: [], porLer: [] };
  let dir = cwd;
  // #396: o que cada comando pode ESCREVER (`p: null` = um alvo que nao se resolve), e os ficheiros que o hook leu.
  const escritas = [];
  const lidos = [];
  // O pipeline de cada comando (os de um pipeline correm juntos) e a ordem; num ciclo a ordem nao vale.
  const pipeline = new Map();
  cmds.filter((c) => !c.dentro).forEach((c, k, fora) => pipeline.set(c, k > 0 && c.pipeDe ? pipeline.get(fora[k - 1]) : k));
  // Um ciclo pode vir depois de uma palavra de controlo (`then for`, `{ while`): ve-se nas palavras ate a que corre.
  const emCiclo = cmds.some((c) => { const { i } = cabeca(c.argv); return c.argv.slice(0, i < 0 ? c.argv.length : i + 1).some((w) => CICLO.has(w.texto)); });
  // Um interior (`$(...)`) vem no fim da lista do lexer: a sua ordem e o seu pipeline sao os do comando que o contem.
  const dono = (c) => (c.dentro && c.dono && cmds.includes(c.dono) ? dono(c.dono) : c);
  let mudouDir = false;
  /** As escritas de `cmd`, com a pasta em vigor nesse ponto. Um interior corre onde esta, mas e lido no fim: depois
   *  de um `cd`, o seu caminho relativo nao se sabe. */
  const escreve = (cmd, ws, h) => {
    const base = cmd.dentro && mudouDir ? null : dir;
    for (const r of cmd.redir) {
      if (!ESCREVE.has(r.op) || NAO_E_FICHEIRO.test(r.alvo)) continue;
      escritas.push({ p: temExpansao(r.alvo) ? null : caminho(r.alvo, base), pasta: false, cmd });
    }
    const nome = h < 0 ? "" : ws[h].texto.replace(/^.*\//, "");
    if (h < 0 || LEITORES.has(nome)) return;
    const args = ws.slice(h + 1);
    args.forEach((w, k) => {
      // `dd of=f` e `--x=f` (o valor colado a flag); a PASTA de um verbo de `COPIAM` e o ultimo argumento ou o `-t`.
      const igual = /^--[\w-]+=/.exec(w.texto);
      const t = nome === "dd" && w.texto.startsWith("of=") ? w.texto.slice(3) : igual ? w.texto.slice(igual[0].length) : w.texto;
      if ((/^-/.test(t) && !igual) || !t || temExpansao(w.cru)) return;
      const p = caminho(t, base);
      const destino = k === args.length - 1 || /^(?:-t|--target-directory)$/.test(args[k - 1]?.texto ?? "") || igual?.[0] === "--target-directory=";
      // Um interior depois de um `cd` nao sabe a pasta: conta como escrita de tudo, como uma redireccao que nao se resolve.
      if (p !== null || cmd.dentro) escritas.push({ p, pasta: COPIAM.has(nome) && destino, cmd });
    });
  };
  /** Um caminho escrito, resolvido e NORMALIZADO (`/tmp/` e `/tmp/./x` sao `/tmp` e `/tmp/x`): `~`, absoluto, ou
   *  relativo a `base` (`null`: nao se sabe a pasta). */
  const caminho = (t, base) => {
    if ((t === "~" || t.startsWith("~/")) && home) return resolve(home + t.slice(1));
    if (isAbsolute(t)) return resolve(t);
    return base === null ? null : resolve(base, t);
  };
  /** O conteudo de um valor-ficheiro (ou do stdin), ou um motivo para `porLer`. */
  const doFicheiro = (cmd, w, base, origem) => {
    if (w.texto === "-" || STDIN.test(w.texto)) {
      if (cmd.heredoc && (cmd.heredoc.citado || !temExpansao(cmd.heredoc.corpo, true))) return out.textos.push({ origem, texto: cmd.heredoc.corpo });
      return out.porLer.push(`${origem}: o texto vem do stdin${cmd.pipeDe ? " (um pipe)" : ""}, e nao esta no comando`);
    }
    if (temExpansao(w.cru)) return out.porLer.push(`${origem}: o caminho do ficheiro tem uma expansao`);
    const p = caminho(w.texto, base);
    if (p === null) return out.porLer.push(`${origem}: um caminho relativo depois de um \`cd\` que nao se resolve`);
    try {
      const texto = ler(p);
      lidos.push({ p, origem, cmd });
      return out.textos.push({ origem, texto });
    } catch {
      return out.porLer.push(`${origem}: nao consegui ler o ficheiro (em falta, ou nao e um ficheiro regular)`);
    }
  };
  /** Um valor-texto: literal, a forma `"$(cat <<'X' ... X)"`, ou um motivo para `porLer`. */
  const doTexto = (w, origem) => {
    if (!temExpansao(w.cru)) return out.textos.push({ origem, texto: w.texto });
    const cat = corpoDeCat(w.cru);
    if (cat && (cat.citado || !temExpansao(cat.corpo, true))) return out.textos.push({ origem, texto: cat.corpo });
    return out.porLer.push(`${origem}: o valor tem uma expansao que so a shell resolve`);
  };

  for (const cmd of cmds) {
    const ws = cmd.argv;
    const { i: h, atribuicoes } = cabeca(ws);
    escreve(cmd, ws, h);
    if (h < 0) continue;
    const nome = ws[h].texto.replace(/^.*\//, "");
    // O `cd` muda a pasta dos caminhos relativos que vem a seguir, e o repo: com uma expansao (ou `-`), nao se sabe qual.
    if (nome === "cd" || nome === "pushd") {
      if (cmd.dentro) continue;
      out.alvoExterno = true;
      mudouDir = true;
      const alvo = ws[h + 1];
      dir = !alvo ? home ?? null : temExpansao(alvo.cru) || alvo.texto === "-" ? null : caminho(alvo.texto, dir);
      continue;
    }
    if (nome === "gh") {
      if (atribuicoes.includes("GH_REPO")) out.alvoExterno = true;
      let i = h + 1;
      while (i < ws.length && /^-/.test(ws[i].texto)) i += ws[i].texto === "-R" || ws[i].texto === "--repo" ? 2 : 1;
      const grupo = ws[i]?.texto;
      if (ws.slice(h + 1).some((w) => w.texto === "-R" || w.texto === "--repo" || w.texto.startsWith("--repo="))) out.alvoExterno = true;
      if (grupo === "api") {
        const { pares: metodo } = valores(ws, i + 1, ["-X", "--method"]);
        if (metodo.some(([, w]) => /^get$/i.test(w.texto))) continue;
        const rota = ws.slice(i + 1).find((w) => !/^-/.test(w.texto) && /^\/?repos\//.test(w.texto));
        if (rota && !rota.texto.includes("{owner}")) out.alvoExterno = true;
        for (const [f, w] of valores(ws, i + 1, API.campo, API.comValor).pares) {
          out.publica = true;
          const eq = w.texto.indexOf("=");
          const v = { texto: w.texto.slice(eq + 1), cru: w.cru.slice(w.cru.indexOf("=") + 1) };
          const origem = `gh api ${f} ${w.texto.slice(0, eq)}`;
          if ((f === "-F" || f === "--field") && v.texto.startsWith("@")) doFicheiro(cmd, { texto: v.texto.slice(1), cru: v.cru.replace(/^(["']?)@/, "$1") }, dir, origem);
          else doTexto(v, origem);
        }
        for (const [f, w] of valores(ws, i + 1, API.ficheiro, API.comValor).pares) { out.publica = true; doFicheiro(cmd, w, dir, `gh api ${f}`); }
        continue;
      }
      const def = GH[grupo];
      if (!def) continue;
      // O subcomando: a primeira palavra que nao e flag depois do grupo (o cobra aceita `gh issue -R o/r close`).
      let j = i + 1;
      while (j < ws.length && /^-/.test(ws[j].texto)) j += ws[j].texto === "-R" || ws[j].texto === "--repo" ? 2 : 1;
      const sub = ws[j]?.texto;
      if (!def.subs.includes(sub)) continue;
      const flags = def.flags ?? (/^(?:close|reopen)$/.test(sub) ? FECHO : { texto: TEXTO, ficheiro: FICHEIRO });
      const origem = (f) => `gh ${grupo} ${sub} ${f}`;
      const t = valores(ws, j + 1, flags.texto, [...flags.ficheiro, ...(flags.comValor ?? []), "-R", "--repo"]);
      const fi = valores(ws, j + 1, flags.ficheiro, [...flags.texto, ...(flags.comValor ?? []), "-R", "--repo"]);
      for (const [f, w] of t.pares) { out.publica = true; doTexto(w, origem(f)); }
      for (const [f, w] of fi.pares) { out.publica = true; doFicheiro(cmd, w, dir, origem(f)); }
      if (def.posicionais) {
        for (let k = j + 1; k < ws.length; k++) {
          if (t.usados.has(k) || fi.usados.has(k) || /^-./.test(ws[k].texto)) continue;
          out.publica = true;
          doFicheiro(cmd, ws[k], dir, `gh ${grupo} ${sub} (ficheiro)`);
        }
      }
      continue;
    }
    if (nome === "git") {
      let i = h + 1;
      let base = dir;
      while (i < ws.length && /^-/.test(ws[i].texto)) {
        const opt = ws[i].texto;
        if (opt === "-C" || opt === "--git-dir" || opt === "--work-tree" || /^--(?:git-dir|work-tree)=/.test(opt)) out.alvoExterno = true;
        if (opt === "-C") base = !ws[i + 1] || temExpansao(ws[i + 1].cru) ? null : caminho(ws[i + 1].texto, base);
        i += GIT_COM_VALOR.includes(opt) ? 2 : 1;
      }
      const sub = ws[i]?.texto;
      if (sub !== "tag" && sub !== "commit") continue;
      const comValor = sub === "tag" ? ["-u", "--local-user"] : ["-C", "-c", "--author", "--date", "--fixup", "--squash"];
      for (const [f, w] of valores(ws, i + 1, GIT.texto, [...GIT.ficheiro, ...comValor]).pares) { out.publica = true; doTexto(w, `git ${sub} ${f}`); }
      for (const [f, w] of valores(ws, i + 1, GIT.ficheiro, [...GIT.texto, ...comValor]).pares) { out.publica = true; doFicheiro(cmd, w, base, `git ${sub} ${f}`); }
    }
  }
  const ordem = (c) => cmds.indexOf(dono(c));
  for (const l of lidos) {
    const antes = (e) => e.cmd.dentro || emCiclo || ordem(e.cmd) < ordem(l.cmd) || pipeline.get(dono(e.cmd)) === pipeline.get(dono(l.cmd));
    // Numa PASTA de copia (`cp -r d /tmp`), tudo o que esta debaixo dela conta.
    const mesmo = (e) => e.p === null || e.p === l.p || (e.pasta && l.p.startsWith(e.p.endsWith(sep) ? e.p : e.p + sep));
    if (escritas.some((e) => antes(e) && mesmo(e)))
      out.porLer.push(`${l.origem}: o ficheiro e escrito neste mesmo comando, e o hook le-o ANTES de o comando correr — escrever o ficheiro numa chamada e publicar noutra`);
  }
  return out;
}
