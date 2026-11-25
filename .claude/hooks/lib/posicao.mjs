/**
 * O comando lido por POSICAO: que palavra corre, o que e argumento, o que e so texto — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#336): a fronteira decidia por regex sobre o texto inteiro, e cada correccao abria um caso
 * novo. Saber de que comando e um grupo de flags (`node -pe`, `perl -le`) pede o comando lido como a shell o le:
 * isso e o LEXER (`comandos.mjs`, separado daqui no #580). Este modulo le-o por POSICAO.
 *
 * O QUE ISTO NAO DECIDE: nada. Diz o que esta em que posicao; o `fronteira.mjs` nega. As regex do
 * `fronteira-piso.mjs` continuam a ser o piso, e uma leitura errada daqui so pode negar a mais ou deixar um caso por fechar.
 *
 * O QUE FICA DE FORA, dito: os caminhos escritos de outra maneira (`.cl''aude`, `"$PWD"/`, absolutos dentro do
 * codigo) — sao do `caminhos.mjs`, e nao da posicao; com a fronteira A VISTA, um wrapper fora de `EXECUTORES`;
 * o interpretador na ponta de um pipe com argumentos (`| node --input-type=module`) e o `sed`/`awk` que
 * escrevem, que sao os PRs (c) e (b) do #336. Passados `MAX_POSICOES`/`MAX_VOLTAS`, nega sem julgar.
 */
import { comandos } from "./comandos.mjs";
import { ATRIBUICAO_BASH, ATRIBUICAO_LARGA, CABECAS, depoisDeAtribuidora, NOMES_INTERPRETADOR, NOMES_SHELL, resto, SU } from "./fronteira-dados.mjs";

// --- Quem corre codigo INLINE, por posicao ------------------------------------------------------

/** As letras de codigo inline de cada FAMILIA de interpretador, e as opcoes LONGAS que levam codigo alem de
 *  `--eval`/`--print`. Fechada: uma letra que nao esteja aqui nao conta, e o piso (as regex do `fronteira-piso.mjs`)
 *  continua a apanhar o que apanhava. O `--run` so e do `php`: no `node` corre um script do `package.json`.
 *
 *  SEM letras que levam valor, de proposito. Uma versao parava o grupo nelas, para `perl -MTime::HiRes` nao
 *  contar como `-e`, e duas leituras acharam QUATRO afrouxamentos: `perl -de`, `ruby -We`/`-Kue` e o `-M` do
 *  perl, cujo valor tambem e codigo (`-MFile::Temp;unlink(...)`). Esse falso positivo fica, como no b5eb0fb. */
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
/** O `su`/`runuser` com `-c` (#600): fora da tabela, porque o nome e EXATO (`/^su/` apanhava `sudo` e `sum`). O `-c`
 *  num grupo (`-lc`) e colado ao valor (`-cCMD`) contam pela regra das letras; as longas, por prefixo, no `lerCom`. */
const FAMILIA_SU = [null, "c", []];
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
/** Uma posicao que um executor ou o `qualquer` acrescentam: um interpretador, ou o `su`/`runuser` pelo nome exato (#600). */
const ehInterpretadorOuSu = (base) => EH_INTERPRETADOR.test(base) || SU.includes(base);
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
export const EXECUTORES = new Set([
  "npx", "bunx", "bun", "pnpm", "yarn", "npm", "uv", "poetry", "pipenv", "conda", "nvm", "cross-env", "arch",
  "caffeinate", "flock", "strace", "nix", "direnv", "watch", "parallel", "rlwrap", "xcrun", "chronic", "script",
  ...CABECAS,
]);
export const nomeBase = (w) => (w?.texto ?? "").replace(/^.*\//, "");
/** O argv como o zsh o le com o EQUALS (#567: `=bash` corre o `/usr/bin/bash`): cada palavra cujo `=` inicial esta FORA
 *  de aspas perde-o — pelo CRU, e nao pelo `citada` (verdadeiro com qualquer parte citada): `="bash"`, `=ba''sh` e `=b\ash`
 *  correm o bash (medido no zsh), e so o `"=bash"` e literal. Devolve o MESMO array se nenhuma mudou. */
function argvSemEquals(argv) {
  const novo = argv.map((w) => (/^=[^=\s]/.test(w.cru) && w.texto.startsWith("=") ? { ...w, texto: w.texto.slice(1) } : w));
  return novo.some((w, k) => w !== argv[k]) ? novo : argv;
}
/** `fn` com o argv do `main` e, se alguma palavra perde o `=`, tambem com o do EQUALS — o 1.o resultado nao nulo. As duas
 *  leituras juntam-se por OU, e nunca se troca uma pela outra: a do `main` fica intacta, logo nao se herda nenhum buraco
 *  dela. Tirar o `=` a PALAVRA, e nao so ao nome, deixa o `resto()` consumir as cabecas (`| =sudo -s`, `=env -i bash`). */
export function comAsDuas(argv, fn) {
  const r = fn(argv);
  const sem = argvSemEquals(argv);
  return r || sem === argv ? r : fn(sem);
}
/** Quantas palavras o `resto()` ve de cada vez: as cabecas de um comando real sao poucas, e sem tecto o
 *  `verboEm` por cada `{`/`-exec` era cubico — 11 s a 4000 caracteres, no processo do hook (auditoria do PR a). */
export const JANELA = 32;
/** Os TECTOS que falham fechado: um comando com mais posicoes (`{`, `-exec`) ou mais voltas de cabecas do que
 *  isto nao e trabalho de ninguem, e julga-lo custava segundos (`{ x env A=1` encadeado: 277 s a 64k
 *  caracteres, auditoria do PR a). Passado o tecto nao se sabe quem corre, e conta como um comando-variavel. */
export const MAX_POSICOES = 32;
/** As palavras de um comando que RECEBE o stdin acima das quais o `recebeDe` nega sem julgar (#566): o custo dele e
 *  quadratico no pior caso, e um comando real a ponta de um pipe tem poucas. */
export const MAX_PALAVRAS = 8 * 32;
const MAX_VOLTAS = 64;

/** O indice da palavra que CORRE, depois das atribuicoes, das palavras-chave, do `exec` e das cabecas inertes.
 *  Ate estabilizar: `env X=1 node` tem uma atribuicao DEPOIS de uma cabeca. `-1` passado o `MAX_VOLTAS`. Com `novo`
 *  falso, as atribuicoes sao as do `main` antes do #546 (`lerArgv` corre as duas leituras). */
export function verboEm(argv, de = 0, novo = true) {
  let i = de;
  for (let volta = 0; ; volta++) {
    if (volta > MAX_VOLTAS) return -1;
    const ini = i;
    // As palavras-chave, as atribuicoes e o `exec` com as flags dele (`-c`, `-l`, `-a <nome>`), num ciclo SO:
    // um `resto()` por cada `exec` seguido era o que fazia 4000 caracteres custarem segundos. As atribuicoes: a do
    // BASH sempre (`X=$HOME`, `X+=1`, `X[0]=1`: o nome nunca expande, o valor nao conta); a LARGA (`A-B=1`) SO depois
    // de uma cabeca que a aceita como atribuicao (`env`, `sudo`), e se o NOME nao expande (`$N=`). Fora disso o bash
    // corre-a como COMANDO (`./x=/npx`, `./n=/node`, `"X+=/perl"`): as quatro leituras do diff do #546.
    for (;;) {
      const t = argv[i]?.texto;
      if (t === undefined) break;
      const atribuicao = novo
        ? ATRIBUICAO_BASH.test(t) || (ATRIBUICAO_LARGA.test(t) && depoisDeAtribuidora(argv, i) && !expande({ ...argv[i], cru: argv[i].cru.split("=")[0] }))
        : /^[A-Za-z_]\w*=/.test(t);
      if (CHAVES.has(t) || atribuicao) i++;
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
export const expande = (w) => !/^\[\[?$/.test(w.cru) && /[$`*?]|\[.+\]|\{[^}]*,/.test(w.cru.replace(/'[^']*'/g, ""));

/** As posicoes onde um interpretador pode estar: a do verbo, a seguir a um `{` (`function f { node ...`), a
 *  seguir ao `-exec` do `find`, e o primeiro interpretador (ou nome que expande) depois de um executor. Com
 *  `qualquer`, todas as palavras nao citadas com nome de interpretador. `null` passado o `MAX_POSICOES`. */
export function posicoes(argv, v, qualquer, novo) {
  if (argv.filter((w) => w.texto === "{" || /^-(?:exec|execdir|ok|okdir)$/.test(w.texto)).length > MAX_POSICOES) return null;
  let estourou = false;
  const verbo = (k) => {
    const r = verboEm(argv, k, novo);
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
    argv.forEach((w, k) => k > v && ehInterpretadorOuSu(nomeBase(w)) && ps.push(k));
    ps.push(argv.findIndex((w, k) => k > v && expande(w)));
  }
  if (qualquer) argv.forEach((w, k) => !w.citada && ehInterpretadorOuSu(nomeBase(w)) && ps.push(k));
  return estourou ? null : [...new Set(ps)].filter((p) => p >= 0 && p < argv.length);
}

/** As chavetas de uma palavra inteira (`{node,-pe,CODE}`) sao palavras SEPARADAS depois da expansao, como no
 *  bash; dentro de uma so palavra, as flags ficavam escondidas. So a forma simples, sem chavetas aninhadas. */
//  A que nao se parte (o codigo tem `{`/`}`) fica com o cru `$`: expande, e no verbo conta como comando-variavel.
export const semChavetas = (argv) =>
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
  return comAsDuas(cmd.argv, (argv) => inlineDeUma(argv === cmd.argv ? cmd : { ...cmd, argv }, qualquer));
}

/** O `inlineDe` com uma das leituras do nome (a do `main`, ou a do EQUALS: `comAsDuas`). */
function inlineDeUma(cmd, qualquer) {
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
  // As DUAS leituras do verbo (#546): a do `main` e a que salta `X+=1`/`env A-B=1`. Nega se qualquer negar: o que o
  // `main` negava continua negado por construcao (quatro leituras do diff acharam um bypass em cada remendo).
  return lerCom(argv, qualquer, true) ?? lerCom(argv, qualquer, false);
}

/** O `lerArgv` depois do `env -S`, com uma das leituras do verbo. */
function lerCom(argv, qualquer, novo) {
  const v = verboEm(argv, 0, novo);
  const ps = v < 0 ? null : posicoes(argv, v, qualquer, novo);
  if (ps === null) return "variavel";
  for (const p of ps) {
    const w = argv[p];
    const base = nomeBase(w);
    // No VERBO, um nome que expande e sempre comando-variavel, mesmo com cara de interpretador: `$P/node` com
    // `P='perl -I'` corre o perl (leitura da 3.a passagem). Noutra posicao, so se nao tiver cara de interpretador.
    const variavel = expande(w) && (p === v || !EH_INTERPRETADOR.test(base));
    // O `su`/`runuser` com `-c` (#600): corre o comando numa shell, como o `sh -c`. Pelo nome EXATO, e fora do
    // `NOMES_INTERPRETADOR` — la entrava no piso (`RECEBE`, `CODIGO_INLINE`), que casa o nome dentro de outras palavras.
    const su = !variavel && SU.includes(base);
    const familia = su ? FAMILIA_SU : familiaDe(base);
    if (!variavel && !su && !(EH_INTERPRETADOR.test(base) && familia)) continue;
    const [letras, longas] = variavel ? [TODAS, TODAS_LONGAS] : [familia[1], familia[2]];
    // Uma SHELL com `-c` tem sinal proprio: e opaca (corre um comando, e nao codigo de um interpretador), e a razao
    // dela nao leva a nota do `jq`. O `su -c` tambem.
    const shell = !variavel && (familia === FAMILIA_SHELL || su);
    const sinal = (s) => (variavel ? "variavel" : shell ? "shell" : s);
    // As chavetas que nao se partiram (`semChavetas`) tem o codigo DENTRO da palavra: nao ha argumentos a ler.
    // E as que nem chegaram a partir-se (`''{perl,-e,...}`, `${x}{node,-pe,...}`): chavetas com virgula no cru.
    if (variavel && (w.cru === "$" || /\{[^}]*,/.test(w.cru.replace(/'[^']*'/g, "")))) return "variavel";
    // O `data:` numa atribuicao a frente: `NODE_OPTIONS='--import=data:...' node x.js`.
    if (argv.slice(0, p).some((x) => /^NODE_OPTIONS\+?=.*data:/.test(x.texto))) return sinal("data");
    const args = argv.slice(p + 1);
    // Um pedaco de chavetas (`{node,x.js}`) nao e um script ESCRITO: a isencao e so para o que a shell entrega tal qual.
    // No `su` nao ha isencao: o 1.o argumento e o utilizador, e nao um script.
    if (!variavel && !su && args[0] && !args[0].partida && (shell ? SCRIPT_SHELL : SCRIPT).test(args[0].cru)) continue;
    if (!variavel && /^deno/.test(base) && args.find((x) => !x.texto.startsWith("-"))?.texto === "eval") return "deno";
    for (const x of args) {
      const longa = /^--([\w-]+)(?:=|$)/.exec(x.texto)?.[1];
      if (longa && ["eval", "print", ...longas].includes(longa)) return sinal("letra");
      // As longas do `su` por PREFIXO unico (o `getopt_long`): `--c…` e o `--command`, `--se…` o `--session-command`.
      if (su && longa && /^(?:c|se)/.test(longa)) return sinal("letra");
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

// --- Quem RECEBE codigo pelo stdin (#566, #600) vive no `recebe.mjs` desde o #631: le-se com as pecas daqui. ---

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
