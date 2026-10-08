/**
 * As tabelas de verbos do `guard-protected-branch.mjs` — {{PROJECT_NAME}}
 *
 * Vivem a parte por uma razao medida, e nao por gosto: o hook passou as 500 linhas (o flag que
 * `core-rules.md` torna obrigatorio e que o **Guard 17** verifica com catraca), e destas
 * ~700 linhas estas 120 eram **dados** — a lista de verbos seguros, as chaves de `git config`
 * que executam codigo, e as formas que tornam inseguro um verbo seguro. Separar os dados do
 * motor deixa o hook abaixo do seu teto e torna obvio onde se acrescenta um verbo.
 *
 * NAO e um entry point: nao corre nada, nao decide nada. O hook importa estas tres tabelas.
 *
 * Ao acrescentar um verbo a `SEGUROS`, perguntar sempre a seguir: **este verbo tem uma FLAG
 * que o torna destrutivo?** Se tiver, a entrada em `FORMAS_INSEGURAS` e obrigatoria — foi
 * assim que `git switch -C main` (que faz o que o `reset --hard` faz) passou a ser negado.
 */

import { fimSubst } from "./caminhos.mjs";

/** Verbos que exigem uma FORMA para serem seguros (nao basta faltar-lhes a forma insegura).
 *
 *  Existe porque o `deploy.md`, o `CONTRIBUTING.md` e o `process-rules.md` mandam correr
 *  `git pull --ff-only` e `git push origin vX.Y.Z` (a tag) em `main` — e o `--tags` continua
 *  aceite (#277): negar isso punha o guard em contradicao
 *  com o procedimento de release documentado — e um falso positivo que bloqueia trabalho
 *  documentado custa tanto como um bypass.
 *
 *  Recebe `ctx` com `ehProtegido` e `refsApagados`, que vivem no hook: a lista de branches
 *  protegidos e o que cada projeto adapta no bootstrap. */
export const FORMA_EXIGIDA = {
  pull: (args) => args.includes("--ff-only"),
  push: (args, ctx) => {
    const ehProtegido = ctx?.ehProtegido ?? (() => true);
    // (a) So tags: e o procedimento de release, que corre em `main`.
    //
    // `--follow-tags` SAIU daqui: nao e `--tags`. Publica o refspec normal **mais** as tags
    // anotadas, logo publica o branch atual — medido com `--dry-run --porcelain` contra um
    // remoto real, a enviar um commit de `main` que ninguem reviu.
    const semFlags = args.filter((a) => !a.startsWith("-"));
    const soTags =
      args.includes("--tags") &&
      semFlags.length <= 1 && // no maximo o nome do remoto
      !args.some((a) => a.includes(":"));
    if (soTags) return true;
    // (a2) Uma tag de VERSAO nomeada: `git push origin v0.4.0`. Publicar uma tag nao pode
    // mover um branch, e as `process-rules` mandam faze-lo depois de mergear para `main`.
    // Medido ao marcar a v0.4.0 deste repo — o guard negava o seu proprio procedimento.
    //
    // Pela FORMA do ref, e nao perguntando ao git: o `seguro()` nao conhece o diretorio (por
    // desenho — o alvo so e resolvido depois), logo um `git tag --list` aqui correria no cwd
    // do HOOK e responderia sobre o repo errado. Perguntar ao sitio errado e pior que nada.
    //
    // O que torna isto seguro nao e "parece uma tag": e a exclusao dos nomes protegidos. Se
    // `v1.2.3` for um BRANCH, publica-se um branch nao protegido — ja permitido.
    const semVersao = /^v?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?$/;
    if (
      semFlags.length >= 2 &&
      !args.some((a) => a.includes(":") || a === "--delete" || a === "-d") &&
      semFlags.slice(1).every((r) => semVersao.test(r) && !ehProtegido(r))
    ) {
      return true;
    }
    // (b) O comando **so apaga**, e nenhum dos refs apagados e protegido. Um
    // `git push origin --delete fix/algo` estando em `main` nao toca no `main`.
    //
    // **So as remocoes sao julgadas pelo alvo**; para todo o resto vale o branch onde se
    // esta. `todosApagam` e a correcao de uma leitura independente: bastava UMA remocao nao
    // protegida para branquear o comando inteiro, logo `git push origin :fix/x main`
    // empurrava o `main`.
    const refs = semFlags.slice(1); // o primeiro posicional e o remoto
    const temDelete = args.some((a) => a === "--delete" || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(a));
    const todosApagam = refs.length > 0 && refs.every((r) => temDelete || r.startsWith(":"));
    if (!todosApagam) return false;
    return !(ctx?.refsApagados?.(args) ?? []).some((r) => ehProtegido(r));
  },
};

/** Verbos permitidos num branch protegido: leitura, inspecao, e escrita local que nao cria
 *  commits, nao reescreve historia e nao publica. **Tudo o que nao esta aqui e negado.**
 *  `switch` esta ca dentro de proposito: e como se SAI de um branch protegido, e (ao
 *  contrario de `checkout`) nunca recebe caminhos — quem descarta ficheiros e o `restore`. */
export const SEGUROS = new Set([
  "status", "log", "diff", "show", "branch", "tag", "remote", "fetch", "switch", "stash",
  "rev-parse", "rev-list", "symbolic-ref", "merge-base", "describe", "blame", "shortlog",
  "ls-files", "ls-tree", "ls-remote", "cat-file", "grep", "reflog", "add", "config", "help",
  "version", "init", "clone", "worktree", "name-rev", "count-objects", "cherry", "whatchanged",
  "diff-tree", "diff-index", "diff-files", "check-ignore", "check-attr", "var", "show-ref",
  "show-branch", "for-each-ref", "verify-commit", "verify-tag", "fsck", "archive", "bundle",
  "format-patch", "range-diff", "annotate", "notes", "submodule",
  // Estes dois so passam na forma exigida (ver `FORMA_EXIGIDA` no hook).
  "pull", "push",
  // FORA de proposito: `difftool` (`-x <cmd>`) e `bisect` (`bisect run <cmd>`) correm comandos
  // arbitrarios; `gui`/`citool`/`instaweb`/`web--browse` abrem processos interativos.
  //
  // `checkout` TAMBEM fica de fora, e por uma razao que nao e obvia — escrita aqui porque ja
  // foi proposto acrescenta-lo, com boas intencoes. `git checkout <nome>` faz DUAS coisas
  // conforme o que `<nome>` seja: muda de ramo (inofensivo) ou **deita fora as alteracoes nao
  // commitadas** de um ficheiro com esse nome. Da forma do comando nao se distingue, e este
  // modulo nao resolve alvos por desenho — perguntar ao `git` aqui correria no cwd do HOOK e
  // responderia sobre o repo errado.
  //
  // Nao e hipotetico: um `git checkout <ficheiro>` reverteu, numa sessao, as alteracoes de um
  // dia inteiro. Quem quer mudar de ramo tem o `switch`, que ja esta em cima e nao tem esta
  // ambiguidade — e a mensagem de recusa do hook nomeia-o.
]);

/** Chaves de `git config` cuja ESCRITA e execucao de codigo ou desliga uma rede de
 *  seguranca. Nao e uma blocklist de comandos (que falharia aberta, `TP6`): e uma lista
 *  fechada de chaves que o proprio git documenta como executaveis. */
export const CHAVES_PERIGOSAS = new RegExp(
  "^(?:" +
    [
      // Chaves nomeadas que executam um comando.
      "core\\.(?:hooksPath|pager|editor|askpass|sshCommand|fsmonitor|gitProxy|alternateRefsCommand)",
      "sequence\\.editor", "http\\.proxy", "ssh\\.variant", "init\\.templateDir",
      "uploadpack\\.packObjectsHook", "instaweb\\.httpd",
      // Familias inteiras. A versao anterior tinha `credential.helper` LITERAL e deixava
      // passar `credential.<url>.helper`, que e a forma documentada e a mais usada. O mesmo
      // para `diff.external` vs `diff.<driver>.command`. Generalizar por SUFIXO fecha a
      // familia em vez de perseguir nomes um a um.
      "credential(?:\\..+)?\\.helper",
      "(?:diff|merge)\\..+\\.(?:command|driver|textconv)",
      "diff\\.external",
      "filter\\..+\\.(?:clean|smudge|process)",
      "gpg(?:\\..+)?\\.program",
      "(?:pager|man|browser|trailer|guitool)\\..+",
      "alias\\..+", "protocol\\..+\\.allow", "url\\..+\\.insteadOf",
      "include\\.path", "includeIf\\..+\\.path",
      // Rede final: qualquer chave que TERMINE num sufixo de execucao. E o que apanha o
      // proximo nome que o git inventar, em vez de esperar por outra auditoria.
      ".*\\.(?:cmd|command|program|driver|helper|hook|hooksPath)",
    ].join("|") +
    ")$",
  "i"
);

/** Variaveis de ambiente cujo valor o git EXECUTA como comando, postas a frente do `git`. As
 *  `GIT_CONFIG_*` injectam configuracao: o valor julga-se como comando, por precaucao. */
const ENV_QUE_EXECUTA = /^(?:GIT_PAGER|PAGER|GIT_EDITOR|EDITOR|VISUAL|GIT_SEQUENCE_EDITOR|GIT_SSH_COMMAND|GIT_SSH|GIT_EXTERNAL_DIFF|GIT_ASKPASS|SSH_ASKPASS|GIT_PROXY_COMMAND|GIT_CONFIG_PARAMETERS|GIT_CONFIG_VALUE_\d+)=/;

/** As chaves cujo VALOR e um comando — nao as de `CHAVES_PERIGOSAS` todas: essas sao as de
 *  ESCRITA perigosa, e incluem caminhos (`core.hooksPath`, `include.path`), URLs (`http.proxy`,
 *  `url.*.insteadOf`) e booleanos. Julgar `core.hooksPath=.githooks` como comando negava a forma
 *  de ligar o hook de commit deste repo (2.a leitura do #253). */
const CHAVES_QUE_EXECUTAM = new RegExp(
  "^(?:core\\.(?:pager|editor|askpass|sshCommand|fsmonitor|gitProxy|alternateRefsCommand)|sequence\\.editor|" +
    "uploadpack\\.packObjectsHook|instaweb\\.httpd|credential(?:\\..+)?\\.helper|(?:diff|merge)\\..+\\.(?:command|driver|textconv)|" +
    "diff\\.external|filter\\..+\\.(?:clean|smudge|process)|gpg(?:\\..+)?\\.program|(?:pager|man|browser|guitool)\\..+|" +
    "alias\\..+|.*\\.(?:cmd|command|program|driver|helper))$",
  "i"
);

/** Opcoes LONGAS cujo valor e um comando, POR VERBO (o `--index` do `apply` nao e o `--index-filter`
 *  do `filter-branch`); `*` vale para todos. O git aceita um PREFIXO unico (`--exe`, `--upload`):
 *  casa-se o nome dado como prefixo destes, com pelo menos tres letras. */
const LONGAS_QUE_EXECUTAM = {
  "*": ["exec", "upload-pack", "receive-pack"],
  difftool: ["extcmd"],
  instaweb: ["httpd"],
  grep: ["open-files-in-pager"],
  "filter-branch": ["tree-filter", "index-filter", "msg-filter", "env-filter", "commit-filter", "parent-filter", "tag-name-filter"],
};
/** E as CURTAS, por verbo — separadas (`-x cmd`) ou coladas (`-xcmd`). */
const CURTA_QUE_EXECUTA = { rebase: "x", clone: "u", difftool: "x" };
/** Cabecas que correm o `git` sem mudar o que ele faz: as atribuicoes a frente delas contam. */
const CABECA_DO_GIT = /^(?:env|command|builtin|exec|sudo|nice|nohup|time|timeout|stdbuf|-[\w-]*|\d+[smhd]?)$/;

/** As palavras de cada SEGMENTO, como a shell as entrega: as aspas citam, e `;`, `&`, `|`, `(`,
 *  `)` e a mudanca de linha fora delas separam. O `palavras()` do `ambito-agente.mjs` nao parte em
 *  separadores, e `true;git -c ...` escondia o `git` (1.a leitura do #253). */
export function palavrasPorSegmento(c) {
  const segs = [[]];
  const interiores = []; // o `$(...)`/crase dentro de aspas duplas CORRE: os segmentos dele contam
  let cur = null;
  let q = null;
  const fecha = () => { if (cur !== null) segs[segs.length - 1].push(cur); cur = null; };
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    // `\`+newline e continuacao de linha: a shell tira o par (3.a leitura do #253).
    if (ch === "\\" && c[i + 1] === "\n" && q !== "'") { i++; continue; }
    if (q === "'") { if (ch === "'") q = null; else cur += ch; continue; }
    if (q === '"') {
      if (ch === '"') q = null;
      else if (ch === "\\" && /["\\$`]/.test(c[i + 1] ?? "")) cur += c[++i];
      else {
        const abre = ch === "$" && c[i + 1] === "(" ? "$(" : ch === "`" ? "`" : null;
        if (abre) {
          // O fecho le as aspas de DENTRO (`fimSubst`, a do `caminhos.mjs`): contar parenteses fechava
          // num `)` citado. E o interior SALTA-SE depois de lido: varrido de novo com as aspas de fora,
          // uma aspa impar la dentro dessincronizava o resto (4.a leitura do #253).
          const fim = abre === "$(" ? fimSubst(c, i) : c.indexOf("`", i + 1) < 0 ? c.length : c.indexOf("`", i + 1);
          interiores.push(...palavrasPorSegmento(c.slice(i + abre.length, fim)));
          cur += c.slice(i, fim + 1);
          i = fim;
          continue;
        }
        cur += ch;
      }
      continue;
    }
    if (/[;&|()\n]/.test(ch)) { fecha(); if (segs[segs.length - 1].length) segs.push([]); continue; }
    if (/\s/.test(ch)) { fecha(); continue; }
    cur ??= "";
    if (ch === "'" || ch === '"') q = ch;
    else if (ch === "\\") cur += c[++i] ?? "";
    else cur += ch;
  }
  fecha();
  return [...segs, ...interiores].filter((s) => s.length);
}

/**
 * O que uma invocacao do `git` vai EXECUTAR alem do verbo (#253), como COMANDOS a julgar.
 *
 * PORQUE EXISTE: a fronteira le um caminho entre aspas como texto, e o git executa-o.
 * `git -c core.pager='rm <f>' log`, `GIT_PAGER='rm <f>' git log`, `git archive --exec='rm <f>'` e
 * `git grep -O'rm <f>'` apagavam a fronteira num branch de feature (medido: vinte formas passavam).
 *
 * O `comando` e o VALOR seguido do resto da invocacao: o git acrescenta argumentos ao que executa
 * (um alias `!rm` recebe os do comando, o `grep -Orm` os ficheiros encontrados), e julgar o valor
 * sozinho deixava passar `git -c alias.x='!rm' x <f>` (1.a leitura). A mais, num pager, so torna
 * o julgamento mais largo — e uma leitura continua leitura (`cat <f> log`).
 *
 * Fica de fora, de proposito: o que corre da CONFIGURACAO do repo (`--textconv`,
 * `--show-signature`, `--ext-diff` sem `-c`), que nao e texto do comando — escreve-la nao e
 * escrever na fronteira; e o que vem de OUTRA variavel (`--config-env`, `export X=...; git`): um
 * CONTORNO, em `ABERTO` no `tests-fronteira-inventario.mjs`.
 *
 * @param {string} c o comando completo
 * @returns {{valor: string, comando: string}[]} o que o git executaria; `[]` se nada
 */
export function valoresQueExecutam(c) {
  const out = [];
  for (const ps of palavrasPorSegmento(c)) {
    const i = ps.findIndex((p) => p.replace(/^.*\//, "") === "git");
    if (i < 0) continue;
    // O resto vai RE-CITADO: sem as aspas, a mensagem de `git commit -m "... <f> ..."` virava
    // argumentos e o caminho dela, um alvo (3.a leitura). Um booleano ou o vazio nao sao comandos
    // (`pager.log=false`, `GIT_EDITOR=true`, `GIT_PAGER=`).
    const cita = (w) => (/^[\w./:=@%+,~-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`);
    const junta = (valor, k) => {
      if (/^(?:true|false|yes|no|on|off|[01])?$/i.test(valor.trim())) return;
      out.push({ valor, comando: [valor, ...ps.slice(k).map(cita)].join(" ") });
    };
    // As atribuicoes a frente do `git`, mesmo atras de uma cabeca e das flags dela
    // (`GIT_PAGER=x env -u FOO git log`): o valor de uma flag (`FOO`) nao para a procura.
    for (let k = i - 1; k >= 0 && (/^\w+=/.test(ps[k]) || CABECA_DO_GIT.test(ps[k]) || /^-/.test(ps[k - 1] ?? "")); k--) {
      if (!ENV_QUE_EXECUTA.test(ps[k])) continue;
      const valor = ps[k].slice(ps[k].indexOf("=") + 1);
      if (!/^GIT_CONFIG_PARAMETERS=/.test(ps[k])) { junta(valor, i + 1); continue; }
      // `'core.pager=cmd'` (antigo) ou `'core.pager'='cmd'` (desde o git 2.31): o comando e o valor.
      for (const m of valor.matchAll(/'([^']*)'(?:='([^']*)')?/g)) junta(m[2] ?? m[1].slice(m[1].indexOf("=") + 1), i + 1);
    }
    // As opcoes GLOBAIS ate ao verbo. So aqui o `-c` e configuracao: depois do verbo e outra coisa
    // (`git grep -c`, `git branch -c`). O git nao aceita `-c` colado (`-ckey=v`: medido).
    let j = i + 1;
    for (; j < ps.length && ps[j].startsWith("-"); j++) {
      if (ps[j] !== "-c") {
        if (/^-C$|^--(?:git-dir|work-tree|namespace|exec-path|super-prefix|config-env|attr-source)$/.test(ps[j])) j++;
        continue;
      }
      const cfg = ps[++j] ?? "";
      const igual = cfg.indexOf("=");
      if (igual <= 0 || !CHAVES_QUE_EXECUTAM.test(cfg.slice(0, igual))) continue;
      const valor = cfg.slice(igual + 1);
      // Um alias sem `!` e um sub-verbo do git: julga-se como `git <valor>`.
      junta(/^alias\./i.test(cfg) && !valor.startsWith("!") ? `git ${valor}` : valor.replace(/^!/, ""), j + 1);
    }
    const verbo = ps[j];
    for (let k = j + 1; k < ps.length; k++) {
      const a = ps[k];
      // Duas letras chegam no `grep` (`--op`, como no `ambito-agente.mjs`); nos outros, tres.
      const longa = new RegExp(`^--([\\w-]{${verbo === "grep" ? 2 : 3},})(?:=([\\s\\S]*))?$`).exec(a);
      const curta = CURTA_QUE_EXECUTA[verbo];
      if (verbo === "bisect" && a === "run") { junta(ps.slice(k + 1).join(" "), ps.length); break; }
      if (verbo === "submodule" && a === "foreach") { junta(ps.slice(k + 1).join(" "), ps.length); break; }
      if (longa && [...LONGAS_QUE_EXECUTAM["*"], ...(LONGAS_QUE_EXECUTAM[verbo] ?? [])].some((n) => n.startsWith(longa[1]))) {
        // O `grep --open-files-in-pager` sem valor usa o paginador por omissao: nao consome o padrao.
        if (longa[2] !== undefined) junta(longa[2], k + 1);
        else if (!(verbo === "grep" && "open-files-in-pager".startsWith(longa[1]))) junta(ps[k + 1] ?? "", (k += 1) + 1);
      } else if (curta && new RegExp(`^-[a-zA-Z]*?${curta}`).test(a)) {
        // Agrupada (`-ix`, `-qu`): o valor e o resto do token depois da letra, ou a palavra seguinte.
        const resto = a.slice(a.indexOf(curta, 1) + 1);
        junta(resto || ps[k + 1] || "", resto ? k + 1 : (k += 1) + 1);
      } else if (verbo === "grep" && /^-[a-zA-Z]/.test(a)) {
        // As curtas agrupadas, como o parse-options do git as le: `-e`, `-f`, `-A`/`-B`/`-C`, `-m`
        // levam o RESTO do token, e o `O` so conta se vier antes delas (`-eTODO` e um padrao).
        const m = /^-[^efABCmO]*O(.*)$/.exec(a);
        if (m && m[1]) junta(m[1], k + 1);
      }
    }
  }
  return out;
}

/** O que o git executaria pode mexer no branch? Num branch protegido conta o que invoca o `git`
 *  (`GIT_PAGER='git commit -am x' git log`) ou compoe na shell — nao um paginador, um editor ou
 *  um `ssh -i <chave>`, que eram falsos positivos (2.a leitura do #253). */
export const executaAlgo = (valor) => /[;&|`$<>()]/.test(valor) || /(?:^|[\s/])git(?:\s|$)/.test(valor);

/** Um verbo seguro pode ser destrutivo pela FLAG. Medido numa revisao independente:
 *  `git switch -C main`, `git checkout -B main`, `git branch -f master`, `git branch -D
 *  develop` e `git fetch . HEAD:master` passavam todos — e o primeiro faz o que o
 *  `reset --hard` faz, que a versao anterior negava. Cada entrada aqui e uma forma que torna
 *  inseguro um verbo que esta em `SEGUROS`. */
export const FORMAS_INSEGURAS = {
  switch: /^(?:-C|--force|--discard-changes)$/,
  // `-c`/`-C` COPIAM um branch (`git branch -c antigo novo`) — nao destroem nada e sao a
  // forma normal de duplicar. Ficam de fora; `-m`/`-M` (mover/renomear) continuam, porque
  // renomear um branch protegido fa-lo desaparecer.
  //
  // Julgado pelo ALVO e nao pela flag — a mesma regra que o `push --delete` ja seguia, e a
  // incoerencia que faltava fechar: `git push origin --delete fix/x` passava, `git branch -d
  // fix/x` nao. Um derivado real bateu nisto logo a seguir a mergear um PR, a fazer a limpeza
  // que as `process-rules` mandam fazer.
  //
  // Porque nao a correcao mais obvia (tirar so o `-d`, que "o git ja protege"): ela deixaria
  // passar `git branch -d develop` — o git apaga-o de facto quando esta mergeado, e `develop`
  // e um branch PROTEGIDO. Julgar pelo alvo destrava a limpeza legitima **e** fecha esse caso.
  //
  // Sem alvo nomeado (`git branch -d` sozinho, ou so com flags) nao ha o que julgar: nega-se,
  // que e o lado seguro do erro.
  branch: (args, ctx) => {
    // Pelas flags NORMALIZADAS: `git branch -Df old` agrupa duas flags num token e nenhuma
    // casa por igualdade. A versao anterior desta regra era uma regex aplicada ao resultado
    // de `normalizaFlags`; ao passar a predicado, a normalizacao tinha de vir com ela — e
    // sem isso o proprio teste do `-Df` ficou vermelho, que e o que ele existe para fazer.
    const flags = ctx?.normalizaFlags?.(args) ?? args;
    const destrutiva = flags.some((a) => /^(?:-f|--force|-[dD]|--delete|-[mM]|--move)$/.test(a));
    if (!destrutiva) return false;
    const alvos = args.filter((a) => !a.startsWith("-"));
    if (alvos.length === 0) return true;
    return alvos.some((a) => ctx?.ehProtegido?.(a) ?? true);
  },
  tag: /^(?:-d|--delete|-f|--force)$/,
  // `symbolic-ref` LE o HEAD com um argumento e ESCREVE-O com dois. E a forma que permitia
  // `git symbolic-ref HEAD refs/heads/MAIN` seguido de `git commit` — medido a fazer `main`
  // avancar com o guarda a dizer `allow` nos dois passos, porque `PROTEGIDOS` comparava por
  // igualdade exacta e num filesystem case-insensitive `MAIN` **e** `main`.
  // Como predicado: `git symbolic-ref HEAD` (leitura) passa; com valor, ou com `-d`, nao.
  "symbolic-ref": (args) => {
    if (args.some((a) => /^(?:-d|--delete)$/.test(a))) return true;
    return args.filter((a) => !a.startsWith("-")).length >= 2;
  },
  // `config` e um verbo de LEITURA seguro, mas escrever certas chaves e execucao de codigo
  // ou desligar a propria rede: `core.hooksPath /dev/null` mata o `.githooks/commit-msg`
  // (a rede anti-atribuicao-a-IA deste repo), e `core.pager`/`credential.helper`/
  // `core.editor` sao sinks que um `git log` inocente dispara. Medidos a passar.
  // Como PREDICADO e nao regex: e preciso distinguir a leitura (`git config --get x`, que
  // continua a passar) da escrita, e isso depende de haver um VALOR a seguir a chave.
  config: (args) => {
    const flagsDestrutivas = /^(?:--unset|--unset-all|--remove-section|--rename-section|--replace-all|-e|--edit)$/;
    if (args.some((a) => flagsDestrutivas.test(a))) return true;
    // As flags que CONSOMEM o argumento seguinte: sem as saltar, o valor de `--file` virava
    // `posicionais[0]` e `CHAVES_PERIGOSAS` testava `.git/config` em vez da chave. Medido a
    // escrever `core.hooksPath` de facto — a mesma chave que a tabela ja dava por fechada.
    const FLAGS_COM_VALOR = /^(?:--file|-f|--blob|--default|--type|-t)$/;
    const posicionais = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("-")) {
        if (FLAGS_COM_VALOR.test(args[i])) i++;
        continue;
      }
      posicionais.push(args[i]);
    }
    if (posicionais.length === 0) return false;

    // O git 2.46 acrescentou sub-comandos (`git config set|unset|get|list|edit ...`). A
    // versao anterior lia `posicionais[0]` como a CHAVE, logo na forma nova a "chave" era
    // `set` e nao casava nada: `git config set core.hooksPath /dev/null` passava e desligava
    // o `.githooks/commit-msg` de facto. Medido com git 2.50 por uma leitura independente —
    // era o caso que o comentario acima dizia estar fechado.
    const SUBCOMANDOS = /^(?:set|unset|get|list|edit|replace-all|add|remove-section|rename-section)$/;
    let campos = posicionais;
    if (SUBCOMANDOS.test(campos[0])) {
      // `unset`/`edit` sao destrutivos por si, como as flags equivalentes.
      if (/^(?:unset|edit|remove-section|rename-section)$/.test(campos[0])) return true;
      campos = campos.slice(1);
    }
    // Uma escrita tem chave E valor; `git config core.pager` sozinho apenas le.
    if (campos.length < 2) return false;
    return CHAVES_PERIGOSAS.test(campos[0]);
  },
  add: /^(?:-i|--interactive|-p|--patch)$/, // interativos: um hook nao tem como responder
  // `fetch` com refspec escreve refs locais (`git fetch . HEAD:master`). Como PREDICADO e nao
  // regex, para excluir primeiro os `:` que sao de URL — senao `git fetch https://x/y main` e
  // `git fetch git@host:o/r.git` eram negados, tres falsos positivos medidos.
  // `+refs/heads/main:refs/remotes/origin/main` escreve um ref REMOTE-TRACKING, que e o que
  // um fetch normal faz — nao toca em `refs/heads/`. Negar isto bloqueava um fetch explicito,
  // que e trabalho legitimo e frequente.
  fetch: (args) =>
    args.some(
      (a) =>
        !/:refs\/remotes\//.test(a) &&
        !/^[a-z][a-z0-9+.-]*:\/\//i.test(a) && !/^[^/\s]+@[^:\s]+:/.test(a) && (a.includes(":") || a.startsWith("+"))
    ),
};
