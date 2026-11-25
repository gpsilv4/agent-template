/**
 * O PISO da fronteira: o que se reconhece pelo TEXTO de um comando — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE A PARTE (#631): o `fronteira.mjs` chegou as 492 linhas, e o #606/#607 iam faze-lo crescer.
 * Saiu daqui o que se le sem decidir: os verbos que so LEEM (`LEITURA`), as regex do piso (o wrapper opaco,
 * a execucao adiada, o codigo inline, quem recebe codigo, o `git`/`find` que escrevem) e para onde escreve
 * uma invocacao do `git` (`saidasDoGit`). Movidos sem mudar o codigo (so os `export`), e sem nenhum veredicto mudado.
 *
 * O QUE ISTO NAO DECIDE: nada. Quem nega e o `julga` do `fronteira.mjs`, pela ordem dele; a posicao (quem
 * corre, quem recebe o stdin) le-se no `posicao.mjs` e no `recebe.mjs`, e so ACRESCENTA a isto.
 */
import { ATRIBUICAO_LARGA_SRC, ELEVAM, NOMES_INTERPRETADOR, NOMES_SHELL, SU } from "./fronteira-dados.mjs";

/** Para onde ESCREVE uma invocacao do `git`, alem do `>` (#237). O `git` esta na LEITURA, e estes
 *  sub-verbos e opcoes truncam ou criam ficheiros: `--output[=]`, o `-o`/`--output-directory` do
 *  `archive` e do `format-patch`, e o caminho de `bundle create`, `worktree add`, `merge-file`,
 *  `clone`, `init`, `submodule add` e `worktree move`; o `--separate-git-dir` e o `-f`/`--file` do
 *  `config`. Pelo POSICIONAL, nao por palavra solta: `git grep worktree` e `git log -S archive`
 *  sao leituras. Uma saida RELATIVA resolve-se contra os `-C <dir>`, como o git faz.
 *  @param {string[]} toks  o segmento ja sem cabecas, com o `git` (ou `/usr/bin/git`) a frente */
export function saidasDoGit(toks) {
  if ((toks[0] ?? "").replace(/^.*\//, "") !== "git") return [];
  const t = toks.slice(1).map((x) => x.replace(/["']/g, "").replace(/\\=/g, "="));
  const dirs = []; // os `-C`: o git muda para la ANTES de abrir a saida
  let i = 0; // as opcoes globais, e as que levam valor (leitura independente do #237)
  while (i < t.length && t[i].startsWith("-")) {
    if (t[i] === "-C") dirs.push(t[i + 1] ?? "");
    i += /^-[Cc]$|^--(?:git-dir|work-tree|namespace|config-env|attr-source|exec-path)$/.test(t[i]) ? 2 : 1;
  }
  const verbo = t[i] ?? "";
  const args = t.slice(i + 1);
  const saidas = [];
  // `--out=` abreviado: o `archive` aceita prefixos de opcao longa (o `diff` e o `format-patch` nao).
  const longa = verbo === "archive" ? /^--(?:o|ou|out|outp|outpu|output)(?:=(.*))?$/ : /^--(?:output|output-directory)(?:=(.*))?$/;
  args.forEach((a, k) => {
    const m =
      longa.exec(a) ??
      /^--(?:separate-git-dir|output-directory|export-marks)(?:=(.*))?$/.exec(a) ??
      (/^(?:archive|format-patch|index-pack)$/.test(verbo) ? /^-[A-Za-z]*o(.*)$/.exec(a) : null) ?? // `-vo <f>` agrupado
      (verbo === "config" ? /^(?:-f|--file)(?:=(.*))?$/.exec(a) : null);
    if (m) saidas.push(m[1] || args[k + 1] || "");
  });
  // Todos os posicionais, e nao "o segundo": `-b <ramo>`, `-L <rotulo>` levam valor. Um URL ou um
  // nome de ramo nunca e um caminho da fronteira, logo conta-los nao nega nada a mais.
  const pos = args.filter((a) => !a.startsWith("-"));
  if ((verbo === "bundle" && pos[0] === "create") || (/^(?:worktree|submodule)$/.test(verbo) && /^(?:add|move)$/.test(pos[0]))) saidas.push(...pos.slice(1));
  if (/^(?:merge-file|init|clone)$/.test(verbo)) saidas.push(...(pos.length ? pos : ["."]));
  const base = dirs.filter(Boolean).join("/");
  return saidas.filter(Boolean).map((s) => (base && !s.startsWith("/") ? `${base}/${s}` : s));
}

/** Verbos que apenas LEEM. Tudo o que nao esta aqui e tratado como escrita. */
export const LEITURA = new Set([
  "cat", "bat", "less", "more", "head", "tail", "wc", "grep", "rg", "egrep", "fgrep", "awk",
  "sed", "jq", "diff", "cmp", "md5", "md5sum", "shasum", "sha256sum", "file", "stat", "ls",
  "find", "realpath", "dirname", "basename", "node", "test", "[", "[[", "wl-copy", "pbcopy", "echo", "printf",
  "du", "tree",
  // `git` le e encena; o destrutivo dele ja e tratado pela lista SEGUROS do hook. Sem ele,
  // `git diff .claude/settings.json` era negado — e e precisamente o que se quer poder correr.
  "git",
]);

/** Wrappers que executam o que lhes chega em texto: ai o conteudo citado **e** comando. */
//  O `trap` tambem: `trap "rm <fronteira>" EXIT` corre o texto citado a saida (leitura do 024753a).
//  E o `env -S`/`--split-string` (leitura 1 do #336): corre o valor como um comando, e `env -S 'rm <f>'` passava.
export const OPACO = /\b(?:eval|xargs|trap)\b|\b(?:sh|bash|zsh|dash|ksh)\b[^\n]*\s-c\b|\benv\b[^\n]*\s(?:-[A-Za-z]*S|--split-string)/;

/** Execucao ADIADA: uma funcao definida, ou um `trap`, corre o corpo noutro sitio — depois de um
 *  `cd` para a fronteira, ou com o nome de um verbo isento (`true(){ rm -rf *; }; cd <f> && true`).
 *  O verbo escrito deixa de dizer o que corre; num comando que toque a fronteira, nega. */
//  Em POSICAO DE COMANDO: `grep -n function <f>` e um argumento, e era negado. O `alias` e a mesma
//  classe (#223): `alias cat='rm -rf'; cat <f>` sombreia uma leitura — tambem com `\alias`,
//  `builtin alias` ou `command alias` (as cabecas consomem-se, e o `\` impedia o casamento).
export const ADIADA = /(?:^|[;&|({\n]|\b(?:then|do|else)\s)\s*(?:function\s+\S+|trap\s|(?:\\|(?:builtin|command)\s+)?alias\s|[\w.:-]+\s*\(\s*\))/;

/** Interpretadores a correr codigo INLINE. Correr um FICHEIRO e leitura; `-e` escreve. */
// Uma so isencao, e ESTRITA (#317): quando o token IMEDIATAMENTE a seguir ao interpretador e um ficheiro
// de script, o `-e`/`-c` que vier depois e do SCRIPT (`node eslint.js -c <config>` era negado). Qualquer
// opcao antes do script mantem a regra antiga: uma primeira versao tentava saber que opcoes levam valor
// (`-r x.js`, `--import`) e um leitor mostrou cinco formas de passar codigo inline por ela
// (`--import=x.mjs -e`, `--title x.js -e`, dois espacos...). Na duvida, o lado fechado.
// E o script so com caracteres que o shell entrega TAL COMO ESTAO — lista fechada, nao "tudo menos `-`":
// `perl \-Ix.pl -e`, `node $X.js -e` e `node [-]-title?x.js -e` pareciam um script na regex e chegavam ao
// interpretador como opcao (segunda leitura do #317).
// UMA lista de nomes, lida de duas formas (#317). Com uma FLAG inline a seguir (`node -e`), por `\b`, como sempre:
// apanha `python3-intel64`, `node.exe`, `/usr/bin/node` (a auditoria mediu que o nome estrito afrouxava estes).
// A RECEBER codigo (heredoc, pipe), pelo nome INTEIRO: ai `\b` casava o `node` de `/tmp/node-notes.md`.
// Os NOMES vivem na folha desde o #336: o `posicao.mjs` le-os tambem, e duas copias divergiam (`TP8`).
const INTERPRETADOR = String.raw`\b(?:${NOMES_INTERPRETADOR})\b`;
const NOME = (n) => String.raw`(?<![\w.-])(?:${n})(?![\w.-])`;
// As SHELLS tambem leem codigo de stdin e de heredoc (`bash <<EOF`, `echo ... | sh`) — e nenhuma regra as via.
const SHELL = NOME(NOMES_SHELL);
const FLAG_INLINE = String.raw`[^\n]*\s(?:-e|-p|--eval|--print|-c)\b`;
const SCRIPT_A_SEGUIR = String.raw`\s+[\w./][\w./@+-]*\.(?:[cm]?js|ts|py|rb|pl|php)(?=\s|$)`;
export const CODIGO_INLINE = new RegExp(`${INTERPRETADOR}(?!${SCRIPT_A_SEGUIR})${FLAG_INLINE}`);
// A mesma, SEM a isencao: o `alvo` ja passou pelo `normalizaCaminhos`, que troca `~/`, `$HOME/` e `$PWD/`
// pelo caminho canonico — e `HOME=--title=; node ~/<raiz>/.claude/hooks/a.js -e` ficava com cara de script
// (terceira leitura do #317). A isencao so vale se o texto TAL COMO FOI ESCRITO tambem a mostrar.
export const INLINE_SEM_ISENCAO = new RegExp(`${INTERPRETADOR}${FLAG_INLINE}`);
// Quem RECEBE codigo que nao esta num ficheiro (#317, item 24): um interpretador ou uma shell com um heredoc ou
// uma here-string (`node <<EOF`, `bash <<<'...'`), ou a ponta de um pipe sem argumentos (`echo ... | bash`,
// `cat <<EOF | python3`). Le-se sobre o `semCitacoes` (o heredoc vira `<<HEREDOC`): o que so MENCIONA um
// interpretador numa mensagem nao corre nada. Estreito de proposito — a regra geral ("interpretador sem
// script") negava `node --test | grep "<fronteira>"`. As letras agrupadas, o `php -r` e o `data:` decidem-se
// por posicao (`posicao.mjs`, #336); o heredoc lido como texto e o PR (c) do #336.
const RECEBE = `(?:${NOME(NOMES_INTERPRETADOR)}|${SHELL})`;
// Os nomes em constantes, e nao `${ELEVAM.join("|")}` dentro da template string: o `check-codigo-morto` nao ve esse
// uso, e dava o import por morto (#599).
const ELEVAM_SRC = ELEVAM.join("|");
const SU_SRC = SU.join("|");
const SHELL_ELEVADA = String.raw`(?:(?:${ELEVAM_SRC})(?:\s+-\S+)*\s+-[A-Za-z]*[si]\b|(?<![\w.-])(?:${SU_SRC})(?![\w.-]))`;
// As quatro formas: (1) quem recebe um heredoc/here-string, salvo com um SCRIPT logo a seguir (`node x.mjs <<EOF`
// passa dados a um ficheiro, e correr um ficheiro e leitura); (2) um heredoc que segue por um pipe para quem o
// corre; (3) a ponta de um pipe (`|`, `|&`) sem mais do que flags e redireccoes (`| bash -s`, `| node --`); (4) um
// COMANDO que e uma variavel ou uma substituicao a receber o heredoc (`$N <<EOF`): nao se sabe quem e.
export const RECEBE_CODIGO = new RegExp(
  [
    `${RECEBE}(?!${SCRIPT_A_SEGUIR})[^\\n|;&]*<<`,
    `<<HEREDOC[^\\n]*\\|[^\\n]*${RECEBE}(?!${SCRIPT_A_SEGUIR})`,
    `\\|&?\\s*${RECEBE}(?:\\s+-[\\w-]*)*\\s*(?:$|[;&|)#]|\\d*>)`,
    // O comando-variavel tambem com uma CABECA (`sudo $SHELL <<EOF`, `env -i $X <<EOF`), e o `source`/`.` de um
    // heredoc (`source /dev/stdin <<EOF`): correm o corpo na shell actual (2.a auditoria do #317).
    // As atribuicoes pela LARGA (#546): o `env` aceita qualquer `NOME=valor` (`env X+=1 $C <<EOF`, `env A-B=1 ...`).
    `(?:^|[;&|(]\\s*)(?:(?:sudo|env|exec|nohup|command|time|nice)\\s+(?:-\\S+\\s+|${ATRIBUICAO_LARGA_SRC}\\S*\\s+)*)?\\$[^\\s<]*\\)?\\s*<<`,
    `(?:^|[;&|(]\\s*)(?:source|\\.)\\s[^\\n|;&]*<<`,
    // Quem corre o stdin numa SHELL sem se chamar shell: `sudo -s`/`-i`, `doas -s`, `su`, `runuser` — com um
    // heredoc ou na ponta de um pipe (leitura final do #317: `sudo -s <<\EOF` com um `eval` passava).
    `(?:^|[;&|(]\\s*)${SHELL_ELEVADA}[^\\n|;&]*<<`,
    `\\|&?\\s*${SHELL_ELEVADA}(?:\\s+-[\\w-]*)*\\s*(?:$|[;&|)#]|\\d*>)`,
  ].join("|"),
  "m"
);
// Os sub-verbos do `git` e as flags do `find` que escrevem: um sitio so, lidos pelo teste do segmento e
// pelo do bloco (`{ git rm <f>; }`) — duas copias da lista divergiam ao primeiro sub-verbo novo.
export const GIT_QUE_ESCREVE = String.raw`\s(?:rm|mv|restore|checkout|clean|stash)\b`;
export const FIND_QUE_ESCREVE = /\s-(?:delete|fprint[f0]?|fls)\b/;
