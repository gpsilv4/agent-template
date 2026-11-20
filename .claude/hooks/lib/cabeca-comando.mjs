/**
 * A CABECA de um comando (que palavra corre, e as atribuicoes antes dela) e o que muda o `node` — {{PROJECT_NAME}}
 *
 * O `textos-publicos.mjs` extrai o texto que um comando publica; isto le, de cada comando simples do lexer, a palavra
 * que CORRE (`cabeca`), se uma palavra tem uma expansao que so a shell resolve (`temExpansao`), se o comando define o
 * repo do `gh` (`defineGhRepo`), se muda o `node` de quem vem depois (`mudaONode`, que tira a isencao do
 * `commit-msg`, #511/#536/#545/#546), e se uma cabeca muda a pasta antes de uma palavra (`mudaAPasta`, #565).
 *
 * Vivia no `textos-publicos.mjs` ate ao #580, que o separou da extracao para os dois ficarem com folga do Guard 17
 * (os blocos vieram sem mudanca); o `mudaAPasta` e o comentario do `cabeca()` sao do #565.
 */
import { ATRIBUICAO_BASH, ATRIBUICAO_LARGA, CABECAS, depoisDeAtribuidora, nomeDaAtribuicao, nomeDoComando } from "./fronteira-dados.mjs";

/** As palavras de controlo que o lexer deixa no inicio do comando seguinte (`for ...; do gh ...`). */
const CONTROLO = new Set(["do", "then", "else", "elif", "{", "if", "while", "until", "!", "exec", "coproc"]);

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
 *  palavras de controlo (`do`, `then`, `!`).
 *
 *  NAO salta o VALOR de uma flag de cabeca (`env -u FOO gh`: o verbo lido e o `FOO`) — e de proposito: este indice decide
 *  as allowlists (os `LEITORES`, a isencao do `commit-msg`, o `nodeMudado`), e saltar a mais la abria (#565, 1.a leitura).
 *  O `gh`/`git` escondido atras de um valor ve-se a parte: o `textosDoComando` despacha TODA a palavra com esse nome. */
export function cabeca(ws, equals = false) {
  const atribuicoes = [];
  let i = 0;
  let depoisDeCabeca = false;
  while (i < ws.length) {
    const t = ws[i].texto;
    // O verbo a seguir decide pelos `LEITORES` (uma allowlist): saltar uma palavra que o bash corre como comando abria.
    // Salta-se a do `main` (pelo texto: nada que ele via deixa de se ver); a do bash SEM aspas (`X[0]=1`; um `"X[0]=1"
    // cat` corre o `"X[0]=1"`, 4.a leitura do diff) so na posicao da shell ou depois de um `env`/`sudo` (um `nohup X[0]=1`
    // corre-o, 6.a); e a LARGA depois de um `env`/`sudo` (`env A-B=1 gh`, 5.a leitura).
    const atribuidora = depoisDeAtribuidora(ws, i);
    const atribuicao = /^[A-Za-z_]\w*\+?=/.test(t) || (ATRIBUICAO_BASH.test(ws[i].cru) && (!depoisDeCabeca || atribuidora)) || (atribuidora && ATRIBUICAO_LARGA.test(t));
    if (atribuicao) { atribuicoes.push(nomeDaAtribuicao(t)); i++; continue; }
    if (CONTROLO.has(t)) { i++; continue; }
    // Com `equals` (#567), tambem a cabeca `=sudo`/`=env`: so a 2.a leitura das escritas o pede, e ela so ACRESCENTA.
    const nomeDaCabeca = equals ? nomeDoComando(t) : t.replace(/^.*\//, "");
    if (CABECAS.has(nomeDaCabeca)) {
      depoisDeCabeca = true;
      i++;
      while (i < ws.length && (/^-/.test(ws[i].texto) || /^\d+[smhd]?$/.test(ws[i].texto))) i++;
      continue;
    }
    return { i, atribuicoes };
  }
  return { i: -1, atribuicoes };
}

/** Uma cabeca ANTES do indice `k` muda a pasta de quem corre (#565): o `env -C`/`--chdir` (tambem colado, `-Cx`, num
 *  grupo, `-iC`, e abreviado, `--chd`: o `getopt_long` aceita-o) e o `sudo -D`/`--chdir`/`-i`/`--login` (a HOME do
 *  alvo). Um `-F f` relativo desse `gh`/`git` le-se noutra pasta do que a do hook. Falha fechado: depois de um `env` ou de
 *  um `sudo` (qualquer um, mesmo que outra cabeca venha pelo meio, `env -u sudo -C /o`), as duas regras valem. Fica de
 *  fora, dito: o `sudo -R`/`--chroot` (muda a raiz, e tambem os absolutos; pede o `sudoers`). */
export function mudaAPasta(ws, k) {
  const vistas = new Set();
  for (let j = 0; j < k; j++) {
    const t = ws[j].texto;
    const base = t.replace(/^.*\//, "");
    if (CABECAS.has(base)) { vistas.add(base); continue; }
    // #567: com o EQUALS do zsh, `=env -C`/`=sudo -D` tambem mudam a pasta (so arma mais: o relativo vai para o "nao li").
    if (CABECAS.has(nomeDoComando(t))) { vistas.add(nomeDoComando(t)); continue; }
    if (vistas.has("env") && (/^-[^-]*C/.test(t) || /^--c(?:h(?:d(?:i(?:r)?)?)?)?(?:=|$)/.test(t))) return true;
    if (vistas.has("sudo") && (/^-[^-]*[Di]/.test(t) || /^--(?:chd(?:i(?:r)?)?|lo(?:g(?:i(?:n)?)?)?)(?:=|$)/.test(t))) return true;
  }
  return false;
}

/** As palavras que DEFINEM uma variavel com os argumentos (`export GH_REPO=x`). */
const DEFINEM = new Set(["export", "declare", "typeset", "local", "readonly", "env"]);
/** Um `GH_REPO=` na posicao de atribuicao, ou como argumento de `DEFINEM` — nunca dentro de um texto
 *  (`--body "GH_REPO=x funciona?"`). O vazio (`GH_REPO= gh ...`) tambem conta, como antes do #399: zero negar->deixar. */
export function defineGhRepo(ws) {
  // As atribuicoes que o `cabeca()` recolhe passam as `CABECAS` (`sudo`, `time`, `timeout 60 env ...`), como no `main`.
  if (cabeca(ws).atribuicoes.includes("GH_REPO")) return true;
  // Com o `+=` (#545), como no `mudaONode`: `export GH_REPO+=o/r` tambem define o repo.
  const k = ws.findIndex((w) => /^GH_REPO\+?=/.test(w.texto));
  // Depois de um `export`/`declare`, tudo e um argumento dele (`export FOO GH_REPO=x`); antes, so prefixos.
  const d = ws.findIndex((w, i) => i < k && DEFINEM.has(w.texto.replace(/^.*\//, "")));
  return k >= 0 && ws.slice(0, d >= 0 ? d : k).every((w) => ATRIBUICAO_BASH.test(w.texto) || /^-/.test(w.texto) || CONTROLO.has(w.texto));
}

/** As variaveis que mudam o que um `node` corre (#536): o `NODE_OPTIONS=--import` corre outro codigo antes do script, um
 *  `PATH` com outra pasta a frente traz outro `node`, e os outros `NODE_*` mudam onde ele procura os modulos. E (#546) o
 *  `path` do zsh (ligado ao `PATH`), as bibliotecas que o carregador poe a frente (`DYLD_*`, `LD_*`), e as tabelas do
 *  zsh que definem um comando (`functions[node]=`, `aliases`, `commands`) — por falhar fechado, qualquer chave. */
const MUDA_NOMES = "NODE_[A-Z0-9_]*|PATH|path|fpath|FPATH|DYLD_\\w+|LD_\\w+|functions|aliases|galiases|commands";
const MUDA_O_NODE = new RegExp(`^(?:${MUDA_NOMES})$`);
/** `${NOME=x}`, `${NOME:=x}`, o `${NOME::=x}` do zsh e com indice (`${PATH[0]:=x}`) atribuem numa expansao (#546). */
const ATRIBUI_NA_EXPANSAO = new RegExp(`\\$\\{(?:${MUDA_NOMES})(?:\\[[^\\]]*\\])?:{0,2}=`);
/** Os verbos que poem uma variavel SEM a escrever como atribuicao, ou correm o que nao se le (#546). */
const LEEM_PARA = new Set(["read", "mapfile", "readarray"]);
const CORREM_TEXTO = new Set(["eval", "source", ".", "trap", "emulate"]);
/** O nome de um argumento (antes do `=`) so se sabe ao expandir (`export "$N=x"`, `read "$N"`): falha fechado (#546). */
const nomeExpande = (w) => ((n) => temExpansao(n) || /[{}*?]/.test(n))(w.cru.split("=")[0]); // e as chavetas e os globs
const REFERENCIAS = new Set(["declare", "typeset", "local"]);
/** O comando muda o `node` de quem vem depois (#536): uma dessas variaveis numa atribuicao (solta, ou como argumento de
 *  `export`/`declare`/`env`), ou uma funcao chamada `node`. Na posicao de atribuicao, e nunca dentro de um texto — a
 *  mesma forma do `defineGhRepo`. E (#546) as formas que mudam o `node` sem uma atribuicao a vista: falhar fechado. */
export function mudaONode(ws) {
  if (cabeca(ws).atribuicoes.some((a) => MUDA_O_NODE.test(a))) return true;
  // `function node { ... }` (a forma `node() {` ve-se em `textosDoComando`: o lexer tira o `()`, e sobra um `node`
  // sozinho seguido de um `{`).
  if (ws[0]?.texto === "function" && ws[1]?.texto === "node") return true;
  if (semAtribuicaoAVista(ws)) return true;
  // Um `export NODE_OPTIONS` SEM `=` (#545): exporta o valor que a variavel ja tinha, posto por outro verbo antes. Um
  // argumento de `DEFINEM` com um destes nomes conta, com `=` ou sem ele — falhar fechado.
  const { i: h } = cabeca(ws);
  if (h >= 0 && DEFINEM.has(ws[h].texto.replace(/^.*\//, "")) && ws.slice(h + 1).some((w) => MUDA_O_NODE.test(nomeDaAtribuicao(w.texto)) || nomeExpande(w))) return true;
  // Com o `+=` (#545): `export NODE_OPTIONS+=--import=...` acrescenta, e muda o `node` na mesma.
  const k = ws.findIndex((w) => MUDA_O_NODE.test(nomeDaAtribuicao(w.texto)) && w.texto.includes("="));
  const d = ws.findIndex((w, i) => i < k && DEFINEM.has(w.texto.replace(/^.*\//, "")));
  return k >= 0 && ws.slice(0, d >= 0 ? d : k).every((w) => ATRIBUICAO_BASH.test(w.texto) || /^-/.test(w.texto) || CONTROLO.has(w.texto));
}

/** As formas que mudam o `node` SEM uma atribuicao a vista (#546): o `printf -v`/`print -v`, o `read`/`mapfile`/
 *  `readarray` de um desses nomes (com indice, ou por expandir); uma referencia (`declare -n`, `-gn`), seja qual for o
 *  alvo, porque `declare -n R; R=NODE_OPTIONS` esconde-o; um `for`/`select`/`foreach` sobre um deles (o `PATH` esta
 *  sempre exportado); o `${NOME:=}`; o `hash -p`/`hash node=`; um `alias node=`; e o que corre texto que nao se le
 *  (`eval`, `source`, `.`, `trap`, `emulate`), so na posicao de verbo (um `ls .` nao conta). Limites ditos no
 *  cabecalho de `LEITORES_POR_SCRIPT` (`textos-publicos.mjs`). */
function semAtribuicaoAVista(ws) {
  // No inicio do comando (ou depois de uma palavra de controlo): um `echo for path` nao e um ciclo.
  if (ws.some((w, k) => ["for", "select", "foreach"].includes(w.texto) && (k === 0 || CONTROLO.has(ws[k - 1].texto)) && MUDA_O_NODE.test(ws[k + 1]?.texto ?? ""))) return true;
  if (ws.some((w) => ATRIBUI_NA_EXPANSAO.test(w.cru))) return true;
  let { i: h } = cabeca(ws);
  // Os modificadores do zsh (`noglob eval`, `nocorrect source`) nao sao o verbo.
  while (h >= 0 && ["noglob", "nocorrect", "-"].includes(ws[h]?.texto)) h = h + 1 < ws.length ? h + 1 : -1;
  if (h < 0) return false;
  const verbo = ws[h].texto.replace(/^.*\//, "");
  const args = ws.slice(h + 1).map((w) => w.texto);
  // O nome do `-v` (o `print -v`/`-rv` e do zsh), com indice (`PATH[0]`) ou por expandir (`"$N"`).
  const mudaV = (k, nome) => MUDA_O_NODE.test(nomeDaAtribuicao(nome)) || (ws[h + 1 + k] && temExpansao(ws[h + 1 + k].cru));
  // Os nomes do `read`/`mapfile`: sem o valor das flags que o levam (`read -p "$x: " v`), que dependem do verbo.
  const comValor = verbo === "read" ? /^-[A-Za-z]*[uptdnN]$/ : /^-[A-Za-z]*[dnOsuCc]$/;
  // Um destes nomes conta mesmo como valor de flag (`read -t PATH` do zsh, onde o `-t` nao leva valor): falhar fechado.
  const nomesLidos = ws.slice(h + 1).filter((w, k, a) => !comValor.test(a[k - 1]?.texto ?? "") || MUDA_O_NODE.test(nomeDaAtribuicao(w.texto)));
  // Uma verificacao por linha, na forma `if (...) return true;`: e o sinal do par da varredura (`pares-hooks.mjs`).
  if (CORREM_TEXTO.has(ws[h].texto)) return true;
  if ((verbo === "printf" || verbo === "print") && args.some((a, k) => (/^-[A-Za-z]*v$/.test(a) && mudaV(k + 1, args[k + 1] ?? "")) || (/^-v./.test(a) && mudaV(k, a.slice(2))))) return true;
  if (LEEM_PARA.has(verbo) && verbo !== "read" && args.some((a) => /^-[A-Za-z]*C/.test(a))) return true;
  if (LEEM_PARA.has(verbo) && nomesLidos.some((w) => MUDA_O_NODE.test(nomeDaAtribuicao(w.texto)) || nomeExpande(w))) return true;
  if (REFERENCIAS.has(verbo) && args.some((a) => /^-[A-Za-z]*n/.test(a))) return true;
  if (verbo === "hash" && args.some((a) => /^-[A-Za-z]*p/.test(a) || /^node=/.test(a))) return true;
  if (verbo === "alias" && args.some((a) => /^node=/.test(a))) return true;
  if (verbo === "enable" && args.some((a) => /^-[A-Za-z]*f/.test(a))) return true;
  return false;
}
