/**
 * Quem RECEBE codigo pelo stdin, lido por POSICAO — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE A PARTE (#631): vivia no `posicao.mjs` (#566, #600), que chegou as 483 linhas, e o #606/#607 iam
 * faze-lo crescer. Le o comando pelas mesmas pecas da posicao (`verboEm`, `posicoes`, as chavetas, o EQUALS), que
 * importa de la: este modulo depende do `posicao.mjs`, e nunca o contrario (sem ciclo, `tests-sem-ciclos.mjs`).
 * Movido sem mudar o codigo (so o sitio de duas referencias nos comentarios), e sem nenhum veredicto mudado.
 *
 * NUM `/upgrade`: o `fronteira.mjs`, o `fronteira-piso.mjs`, o `posicao.mjs` e este atualizam-se JUNTOS. Um deles antigo
 * ao lado dos outros novos parte um import, e o guard do branch rebenta (e um hook avariado PERMITE); o `test-hooks.mjs`
 * do §3 do `upgrade.md` apanha-o.
 *
 * O QUE ISTO NAO DECIDE: nada. Diz se um comando corre o stdin como codigo; o `fronteira.mjs` nega.
 */
import { comandos } from "./comandos.mjs";
import { CABECAS, ELEVA_CURTA_SRC, ELEVAM, NOMES_INTERPRETADOR, NOMES_SHELL, nomeDoComando, SU, SUDO_LOGIN_SRC, SUDO_SHELL_SRC } from "./fronteira-dados.mjs";
import { comAsDuas, EXECUTORES, expande, JANELA, MAX_PALAVRAS, nomeBase, posicoes, semChavetas, verboEm } from "./posicao.mjs";

// --- Quem RECEBE codigo pelo stdin, por posicao (#566) --------------------------------------------------------

/** Os nomes EXATOS de quem corre o stdin como codigo — os do piso (`RECEBE` no `fronteira-piso.mjs`), sem o sufixo largo
 *  do `EH_INTERPRETADOR`: `node-gyp` e `php-cs-fixer` nao sao o `node` nem o `php`. */
const RECEBE_NOME = new RegExp(`^(?:${NOMES_INTERPRETADOR}|${NOMES_SHELL})$`);
const SO_SHELL = new RegExp(`^(?:${NOMES_SHELL})$`);
/** O argumento que diz "o script e o stdin", depois de colapsar `//` e `/./` (`/dev//stdin`): `-`, `/dev/stdin`, um
 *  `/dev/fd/N` ou `/proc/self/fd/N` (`bash 3<&0 /dev/fd/3`) — ou uma palavra que expande (`/dev/std?n`): nao se sabe. */
const STDIN = /^(?:-|\/dev\/stdin|\/dev\/fd\/\d+|\/proc\/self\/fd\/\d+)$/;
//  E uma substituicao de processo (`bash <(cat)`): o `cat` le o stdin do pipe, e a shell corre-o.
const ehStdin = (w) => expande(w) || w.cru.startsWith("<(") || STDIN.test(w.texto.replace(/\/(?:\.?\/)+/g, "/"));
/** O `-c` do `su` corre um comando; sem ele, o `su` e uma shell que le o stdin. EXATO: um `-lc` ou um `--co` nao conta, e
 *  o `su` le-se como shell (falha fechado; com prefixos, `| su --co ls` passava a deixar). */
const SU_COMANDO = /^(?:-c|--command|--session-command)(?:=|$)/;
/** As longas do `su`/`runuser` que levam VALOR, e os prefixos unicos: `--whitelist-environment`, `--shell`, `--group`,
 *  `--supp-group`, `--user`. Um `-c` logo a seguir e o valor delas, e nao o comando (#600, (b)). */
//  Os prefixos de UMA letra tambem, quando sao unicos (`--w`, `--g`, `--u`: a leitura focada do #600); o `--s` nao (e
//  ambiguo entre `--shell`, `--session-command` e `--supp-group`, e o `su` falha sem correr nada).
const SU_LONGA_COM_VALOR = /^--(?:w|sh|g|su|u)[\w-]*$/;
/** Os valores dos `-c` de um `su` cujos argumentos comecam em `de`; ou `null` — o `su` le o stdin numa shell, e nega:
 *  - sem nenhum `-c`;
 *  - com uma forma NAO exata do `-c` (`-lc`, `-cV`, `--co`, `--se`): o `getopt` aceita-as, e o ultimo `-c` ganha, logo
 *    `su -c ls -lc bash` corre o `bash` (as duas leituras do #600). Falha fechado, em vez de as ler.
 *  Para no `--`: o que vem depois e da SHELL (`su root -- /dev/stdin -c ls` corre o stdin), e um `-c` la nao conta. Uma
 *  letra de VALOR (`w s g G u`) so salta a palavra seguinte se for a ultima do grupo (`-w x`, `-lw x`; o `-ws` ja a leva).
 *  Um `-c` sem valor da `""`, que nao corre nada. */
function valoresDoC(argv, de) {
  const vs = [];
  for (let k = de; k < argv.length; k++) {
    const t = argv[k].texto;
    if (t === "--") break;
    if (SU_COMANDO.test(t)) {
      const igual = t.indexOf("=");
      vs.push(igual >= 0 ? t.slice(igual + 1) : (argv[++k]?.texto ?? ""));
      continue;
    }
    if (/^--(?:c|se)/.test(t)) return null;
    if (t.startsWith("--")) {
      if (SU_LONGA_COM_VALOR.test(t)) k++;
      continue;
    }
    const grupo = /^-([A-Za-z]+)/.exec(t)?.[1] ?? "";
    const i = grupo.search(/[cwsgGu]/);
    if (i < 0) continue;
    if (grupo[i] === "c") return null;
    if (i === grupo.length - 1 && grupo.length === t.length - 1) k++;
  }
  return vs.length ? vs : null;
}
/** Os valores dos `-c` correm um comando que RECEBE o stdin (`| su -c bash`, `| su -c 'true; bash'`)? Todos os comandos
 *  de topo deles herdam o stdin. UM nivel so (o precedente do `julga`): um `su`/`runuser` dentro de um valor recebe sempre.
 *  O TECTO: a soma das palavras de todos os valores, no `MAX_PALAVRAS` — cada valor paga um `recebeDe`, e 40 valores
 *  longos levavam 108 s (medido). Passado o tecto, nao se sabe quem corre: nega. */
//  O resultado guarda-se por lista de valores: o recomeco (b) do `recebeEm` volta a chegar ao mesmo `su` ate `JANELA`
//  vezes por leitura, e cada volta pagava os mesmos `recebeDe` (o leitor adversarial do #600).
const julgados = new Map();
function valoresRecebem(vs) {
  const chave = JSON.stringify(vs);
  if (julgados.has(chave)) return julgados.get(chave);
  if (julgados.size > 256) julgados.clear();
  const cs = vs.flatMap((v) => comandos(v));
  // O nome tambem com o EQUALS do zsh (`=su`), para o nivel ficar UM (sem ele, recursava e terminava na mesma).
  const r = cs.reduce((n, c) => n + c.argv.length, 0) > MAX_PALAVRAS ||
    cs.some((c) => c.argv.some((w) => SU.includes(nomeDoComando(w.texto))) || recebeDe({ ...c, pipeDe: true }));
  julgados.set(chave, r);
  return r;
}
/** Os `su`/`runuser` entre `primeiro` e `ultimo` (indices em `argv`) correm o stdin como codigo? Um sem `-c` a seguir (so
 *  o ULTIMO o pode ser: um `-c` depois dele esta depois de todos), ou um valor que o recebe — julgados UMA vez, os que vem
 *  depois do 1.o (um superconjunto: falha fechado), e nao uma vez por cada `su` (quadratico). */
const suRecebe = (argv, primeiro, ultimo = primeiro) =>
  valoresDoC(argv, ultimo + 1) === null || valoresRecebem(valoresDoC(argv, primeiro + 1) ?? []);
/** Uma flag (o `-` sozinho e o stdin, nao uma flag); numa SHELL tambem com `+` (`bash +x`: desliga uma opcao). */
const ehFlag = (w, shell) => (w.texto.startsWith("-") ? w.texto !== "-" : shell && /^\+[A-Za-z]+$/.test(w.texto));
/** Os argumentos de quem corre o stdin (`argv` desde `de`) dizem que o script E o stdin? So flags, ou o 1.o posicional
 *  e o stdin, ou (shell) um `-s` antes dele (`bash -s -- arg`). Um script a seguir e leitura. Por INDICE, e nao por uma
 *  fatia: copiar o argv por cada posicao fazia o custo quadratico (a 2.a leitura adversarial do #566). */
function leStdin(argv, de, shell) {
  for (let k = de; k < argv.length; k++) {
    if (!ehFlag(argv[k], shell)) return ehStdin(argv[k]);
    if (shell && /^-[A-Za-z]*s[A-Za-z]*$/.test(argv[k].texto)) return true;
  }
  return true;
}
/** Uma flag do `sudo`/`doas` que abre uma shell: `s`/`i` MINUSCULOS num grupo (`-s`, `-i`, `-Es`), ou a forma longa — e
 *  os prefixos unicos dela (#600: `--sh`, `--lo`; o `getopt_long` aceita-os). */
const ELEVA_LONGA = new RegExp(`^--(?:${SUDO_SHELL_SRC}|${SUDO_LOGIN_SRC})$`);
const ELEVA_CURTA = new RegExp(`^${ELEVA_CURTA_SRC}$`);
const eleva = (w) => ELEVA_CURTA.test(w.texto) || ELEVA_LONGA.test(w.texto);
/** As palavras de `argv` desde `de` ate a cabeca seguinte, exclusive: as flags que pertencem a cabeca anterior. */
const ateCabeca = (argv, de) => {
  const fim = argv.findIndex((w, k) => k >= de && CABECAS.has(nomeBase(w)));
  return argv.slice(de, fim < 0 ? argv.length : fim);
};

/**
 * Este comando RECEBE o stdin (um pipe, um heredoc, uma here-string) e corre-o como codigo? Com uma cabeca, um
 * executor ou um grupo antes: `| env bash`, `| caffeinate -i bash`, `| (bash)`, `nohup su <<EOF`, `timeout 5 $X <<<x`.
 * Le-se por POSICAO (o `verboEm`, as `posicoes`), com os tectos de la: passado um, nega. O piso (`RECEBE_CODIGO`)
 * continua no `fronteira-piso.mjs`; isto so acrescenta.
 *
 * O `su -c V`/`runuser -c V` (#600): os comandos de `V` herdam o stdin, e julgam-se (`| su -c bash`); um `-c` que e o
 * valor de outra opcao (`su -w -c root`) nao conta. Os `-c` em grupo e os prefixos (`-lc`, `--co`) NAO contam aqui: o
 * `su` le-se como shell, e nega (o `inlineDe` ja os nega antes, com a fronteira no comando).
 * Fica de fora, dito: um grupo depois de uma palavra (`| time (bash)`)
 * e um heredoc dado a `{ }`/`( )` — o lexer (#601); os interpretadores fora da lista (`tclsh`, #602); uma substituicao
 * a jusante (`| echo "$(bash)"`), o `find -exec bash \;`, o `source /dev/stdin` com uma cabeca, `/dev/../dev/stdin` e o
 * `=(cat)` do zsh (#603); e o PR (c) do #336: o stdin por redireccao (`bash < f`), os comandos depois do 1.o num bloco,
 * as flags de interpretador que levam valor (`| bash -o pipefail`), `| deno run -`, `| caffeinate $SHELL`,
 * `| timeout 1.5 bash` e os nomes com sufixo (`| node.exe`).
 * Nega a mais, dito (so num comando que ja toca a fronteira): depois de um executor, uma palavra com nome de shell ou
 * de interpretador em qualquer posicao (`| flock /tmp/l grep bash`, `| npm ls node`), e um `su`/`runuser` sem `-c` ou
 * um `sudo`/`doas` que eleva em qualquer posicao (`| caffeinate sudo -s grep x`); uma cabeca com uma flag antes de um
 * comando cujo argumento tem um desses nomes, ou expande (`| env -i grep bash`, `| env -i grep "$P"`: a flag pode
 * levar valor); o `su` com argumentos a seguir ao utilizador, e o `-c` agrupado (`su -lc`); `| command -v bash`; o
 * verbo que expande com `-s` (`| "$GREP" -s x`); e um script que expande ou e um `<(...)` (`| node "$F"`). Do #600: os
 * valores dos `-c` depois do 1.o `su` de um executor (um superconjunto); os valores acima do `MAX_PALAVRAS`; e o `doas`
 * com os prefixos do `sudo` (`doas --sh`: o `doas` nao tem longas, e falha sem correr nada).
 * @param {ReturnType<typeof comandos>[number]} cmd
 */
export function recebeDe(cmd) {
  if (!(cmd.pipeDe || cmd.heredoc || cmd.redir.some((r) => r.op === "<<<"))) return false;
  const argv = semChavetas(cmd.argv);
  // O TECTO de palavras: o `verboEm` e quadratico nas atribuicoes LARGAS (`depoisDeAtribuidora`), e o recomeco (b)
  // repete-o — 44 s a 36k caracteres (`env A-B=1 ...`, medido na 3.a leitura adversarial), e um hook que passa o prazo
  // PERMITE. No ramo a vista isto corre em TODOS os comandos: passado o tecto, nao se sabe quem corre, e nega.
  if (argv.length > MAX_PALAVRAS) return true;
  return comAsDuas(argv, (a) => recebeEm(a, true, JANELA) || recebeEm(a, false, JANELA));
}

/** A flag de um `sudo`/`doas` que eleva e NAO leva valor: o grupo eleva e a ULTIMA letra nao leva valor (`-s`, `-Es`,
 *  `-sE`), ou a forma longa. O `-su eu` acaba num `u`, que leva o `eu` (a 3.a leitura adversarial: o `eleva` sozinho
 *  fechava o recomeco (b) nele); e so "acabar em `s`/`i`" negava `| sudo -sE python3 -m json.tool` (a leitura focada).
 *  As letras que levam valor sao as do `sudo` (`-u -g -p -C -U -h -r -t -D -T -R`). */
//  EXATO, e sem o `eleva` (#600): com os prefixos, `| sudo --lo grep bash` deixava de recomecar (o `--lo` acaba num `o`,
//  que "nao leva valor") e passava a deixar — a 2.a leitura do plano. Os prefixos ficam no `eleva`, que so acrescenta.
const elevaSemValor = (w) => (ELEVA_CURTA.test(w.texto) && !/[ugpCUhrtDTR]$/.test(w.texto)) || /^--(?:shell|login)$/.test(w.texto);

/** O `recebeDe` sobre um argv, com uma das leituras do verbo (#546). `valores`: quantas palavras ainda se podem tirar
 *  como o VALOR de uma flag desconhecida (o recomeco (b)); passado o `JANELA`, nao se sabe quem corre: nega. */
function recebeEm(argv, novo, valores, usadas = new Set()) {
  const v = verboEm(argv, 0, novo);
  if (v < 0) return true;
  // Sem verbo: so cabecas. Uma shell elevada se um `sudo`/`doas` leva, ANTES da cabeca seguinte, uma flag com `s`/`i`
  // MINUSCULOS (`-s`, `-i`, `-Es`; o `-S` le a password) ou `--shell`/`--login`: `env -i sudo` nao conta pelo `-i`.
  if (v >= argv.length) return argv.some((w, k) => ELEVAM.includes(nomeBase(w)) && ateCabeca(argv, k + 1).some(eleva));
  const base = nomeBase(argv[v]);
  if (SU.includes(base)) return suRecebe(argv, v);
  // Uma palavra que EXPANDE no verbo (`| $SHELL /dev/stdin`, `| $PAGER`): nao se sabe quem e — le-se como uma shell.
  if (expande(argv[v])) return leStdin(argv, v + 1, true);
  const ps = posicoes(argv, v, false, novo);
  if (ps === null) return true;
  // Os nomes EXATOS: as posicoes de um executor trazem tambem os nomes largos e a 1.a palavra que expande — os largos
  // nao sao quem se pensa (`| node-gyp`), e a que expande depois de um executor fica de fora (`| caffeinate $SHELL`).
  if (ps.some((p) => RECEBE_NOME.test(nomeBase(argv[p])) && leStdin(argv, p + 1, SO_SHELL.test(nomeBase(argv[p]))))) return true;
  // (a) O `su`/`sudo -s` que um executor corre (`| caffeinate su`, `| caffeinate sudo -s`): em QUALQUER posicao a seguir,
  // como os nomes de shell — uma varredura linear, sem recursao (so o 1.o deixava `| caffeinate sudo caffeinate su` e
  // `| flock /tmp/sudo su`; um por cada era cubico). O `su` com um `-c` depois corre o stdin so se o valor o recebe (#600).
  if (EXECUTORES.has(base)) {
    const sus = argv.flatMap((w, k) => (k > v && SU.includes(nomeBase(w)) ? [k] : []));
    const corre = (sus.length > 0 && suRecebe(argv, sus[0], sus[sus.length - 1])) ||
      argv.some((w, k) => k > v && ELEVAM.includes(nomeBase(w)) && ateCabeca(argv, k + 1).some(eleva));
    if (corre) return true;
  }
  // (b) Uma flag de cabeca que o `resto()` nao sabe que leva valor fez do VALOR o verbo (`| sudo --user eu bash`): tira-se
  // so o valor e recomeca-se COM a cabeca e as flags (`| sudo -i --user root`, `| sudo --user eu -- bash`). Uma flag leva
  // UM valor: a mesma nao volta a dar outro (`| sudo -s grep x` nao vira `sudo -s`). A posicao dela nao muda: tira-se
  // so o que esta DEPOIS.
  // E a flag que ELEVA de um `sudo`/`doas` (`-s`, `-i`, `--login`) nunca leva valor: `| sudo -s rm -rf /tmp/x` nao vira
  // `sudo -s -rf`. So a do `sudo`/`doas` (a cabeca mais proxima antes dela): o `-i` do `env` e outra coisa.
  const dono = argv.slice(0, v - 1).reverse().find((w) => CABECAS.has(nomeBase(w)));
  const daElevacao = v > 0 && dono !== undefined && ELEVAM.includes(nomeBase(dono)) && elevaSemValor(argv[v - 1]);
  if (v > 0 && argv[v - 1].texto.startsWith("-") && !daElevacao && !usadas.has(v - 1) && dono !== undefined) {
    return valores <= 0 || recebeEm(argv.filter((_, k) => k !== v), novo, valores - 1, new Set([...usadas, v - 1]));
  }
  return false;
}
