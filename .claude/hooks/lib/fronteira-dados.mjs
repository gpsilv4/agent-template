/**
 * O que a fronteira E, e o verbo real de um segmento — {{PROJECT_NAME}}
 *
 * Um modulo-FOLHA: nao importa nada. Saiu do `fronteira.mjs` porque ele e o `caminhos.mjs` se
 * importavam um ao outro (#243): um `const` novo no topo de qualquer dos dois rebentava com
 * TDZ, e o erro caia no `catch` do hook — que PERMITE. Os dois leem daqui, e o ciclo deixou de
 * existir; o `tests-sem-ciclos.mjs` reprova se voltar.
 *
 * O que decide o que um comando faz a fronteira continua no `fronteira.mjs` (o `porqueAltera`),
 * com o piso no `fronteira-piso.mjs` (a `LEITURA`, o `OPACO`, #631). Aqui so os DADOS e a leitura do verbo, que nao dependem de nada —
 * e as razoes que se mostram ao negar (`razaoDe`), que vieram para aqui para o `fronteira.mjs`
 * caber no limite do Guard 17 (#317); ele reexporta-as, e os importadores nao mudaram.
 */

/** Os caminhos que constituem a fronteira, **em forma de dados**.
 *
 *  Uma entrada terminada em `/` e um prefixo de pasta; as outras sao ficheiros exactos. Desta
 *  lista saem as DUAS leituras que a fronteira precisa — o regex que olha para o texto de um
 *  comando, e o predicado que olha para um caminho — em vez de cada uma ter a sua copia a
 *  concordar a mao (`TP8`). O `tests-fronteira.mjs` prende as duas uma a outra. */
export const CAMINHOS_FRONTEIRA = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/hooks/",
  ".githooks/",
];

/** Este caminho pertence a fronteira?
 *
 *  Existe para quem ja TEM um caminho — o `stop-verify.mjs` le-os do `git status` — em vez de
 *  ter de os procurar dentro do texto de um comando. Normaliza o `./` inicial e as barras do
 *  Windows, porque um caminho que chegue como `.\claude\hooks\x.mjs` e o mesmo ficheiro e
 *  responder "nao" a esse era falhar em silencio. */
export function ehCaminhoFronteira(caminho) {
  if (typeof caminho !== "string" || caminho === "") return false;
  const p = caminho.split("\\").join("/").replace(/^\.\//, "");
  return CAMINHOS_FRONTEIRA.some((f) => (f.endsWith("/") ? p.startsWith(f) : p === f));
}

/** O mesmo conjunto, para procurar DENTRO do texto de um comando. Derivado da lista acima:
 *  escrito a mao ao lado dela, bastava acrescentar um caminho num sitio para o outro ficar a
 *  proteger menos, sem sinal nenhum.
 *
 *  Uma PASTA casa com ou sem a barra final (#185): sem ela, `rm -rf .claude/hooks` e
 *  `mv .claude/hooks /tmp/h` passavam — apagar a pasta inteira era o caso mais grave, e o regex so
 *  via `.claude/hooks/`. O fim do token tem de ser fim mesmo, para `.claude/hooks-old` nao contar.
 *  E o `>` tambem abre um caminho: `echo x >.claude/settings.json`, sem espaco, passava. Tal como o
 *  `|`, o `&` e o `!` de `>|`, `>&` e `>!` colados ao caminho (#206, leitura do a995596). */
//  E as pastas-MAE de uma entrada (#223), derivadas da lista: `rm -rf .claude` apaga os hooks, e
//  `.claude/{hooks,settings.json}` expande para eles. So o TOKEN inteiro (`.claude`, `.claude/`) ou
//  seguido de `{`: `.claude/commands/x.md` nao e fronteira, e escrever la e trabalho normal.
export const MAES = [...new Set(CAMINHOS_FRONTEIRA.flatMap((f) => {
  const partes = f.replace(/\/$/, "").split("/");
  return partes.slice(1).map((_, i) => partes.slice(0, i + 1).join("/"));
}))];
/** Um caminho como texto LITERAL numa regex: escapa todos os caracteres especiais, e nao so o `.`.
 *  Os caminhos de hoje so tem pontos, mas um caminho futuro com `+`, `(` ou `\` passava a ser um
 *  padrao e a fronteira deixava de casar o que devia (alerta do CodeQL, js/incomplete-sanitization).
 *  E a fonte `.agent/scripts/lib/regex-literal.mjs` (#400), COPIADA de proposito: este modulo e a folha da
 *  fronteira e nao importa de `.agent/scripts/` (camadas separadas; um import que falhasse caia no `catch` do hook,
 *  que PERMITE). O `tests-regex-literal.mjs` prende a copia ao texto da fonte. */
export const literalEmRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** As opcoes GLOBAIS do `git` (antes do verbo) que consomem a palavra seguinte, numa so lista (#397, `TP8`): eram
 *  quatro copias e divergiam. Hoje leem-na o `textos-publicos.mjs` e o `invocacoes-git.mjs` (o guard dos branches, desde o
 *  #579: a copia dele nao tinha duas flags, e um force-push passava); o `fronteira.mjs` e o `verbos-git.mjs` convergem no
 *  #336, com o corpus diferencial (la, mudar a lista troca negacoes por permissoes). O `--exec-path` so leva valor com `=` (sem ele o git imprime e sai: consumir o seguinte e inofensivo);
 *  o `--super-prefix` ja nao existe nos git recentes, e fica pelos antigos. */
export const GIT_GLOBAIS_COM_VALOR = ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env", "--attr-source"];
/** O texto NOMEIA a fronteira: so o nome das pastas de topo (`.claude`, `.githooks`), em qualquer sitio. Mais
 *  largo do que o `FRONTEIRA` de proposito — e o "isto fala da fronteira?" de quem decide o alcance, e nao "isto
 *  e um caminho dela". Derivado da lista: eram quatro copias escritas a mao em dois ficheiros (`TP8`). */
export const NOMEIA = new RegExp([...new Set(CAMINHOS_FRONTEIRA.map((f) => f.split("/")[0]))].map(literalEmRegex).join("|"));
/** A regex da fronteira para uma lista de caminhos e de pastas-mae. Uma FUNCAO para o teste a poder
 *  montar com um caminho que tenha caracteres especiais: os de hoje so tem `.`, e com eles um escape
 *  que so tratasse o `.` dava a mesma regex — nenhum teste o via. */
export const montaFronteira = (caminhos, maes) =>
  new RegExp(
    "(?:^|[\\s\"'`=(>|&!])(?:\\./)?(?:" +
      [
        ...caminhos.map((f) =>
          f.endsWith("/") ? `${literalEmRegex(f.slice(0, -1))}(?:/|(?=[\\s;|&)>"'\`]|$))` : literalEmRegex(f)
        ),
        ...maes.map((m) => `${literalEmRegex(m)}(?:/?(?=[\\s;|&)>"'\`]|$)|/\\{)`),
      ].join("|") +
      ")"
  );
export const FRONTEIRA = montaFronteira(CAMINHOS_FRONTEIRA, MAES);

/** Os interpretadores que correm codigo, como alternativas de uma regex. Lidos pelo `fronteira-piso.mjs` (as regex
 *  do piso) e pelo `posicao.mjs` (o nome base de uma palavra em posicao de comando, #336). */
export const NOMES_INTERPRETADOR = String.raw`node(?:js)?|ts-node|tsx|deno|bun|python3?(?:\.\d+)?|pypy3?|ruby|perl|php|lua|Rscript|osascript`;
/** Os nomes das shells, uma so vez: a familia e o nome do interpretador (`posicao.mjs`), e as shells do guard do branch
 *  (`invocacoes-git.mjs` e o heredoc do `guard-protected-branch.mjs`, desde o `/audit` da v0.64.0 — ate la tinham uma
 *  copia sem o `csh`/`tcsh`/`fish`, e `fish -c 'git push --force'` passava). A folha nao as tem nos
 *  `NOMES_INTERPRETADOR` (la o `RECEBE` le-as a parte, no `SHELL` do `fronteira-piso.mjs`). */
export const NOMES_SHELL = "sh|bash|zsh|dash|ksh|csh|tcsh|fish";
export const SHELLS = NOMES_SHELL.split("|");

/** O conteudo de um `$'...'` (ANSI-C) como a shell o entrega: `$'\x70'` e `p`. Uma so fonte: o lexer (`comandos.mjs`) e
 *  o `desaspa` da fronteira (`caminhos.mjs`, desde o `/audit` da v0.64.0 — ate la um `$'...'` era sempre apagado, e
 *  `rm -r $'.claude/hooks'` passava). */
export const ansiC = (s) => s.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_m, e) =>
  e[0] === "x" ? String.fromCharCode(parseInt(e.slice(1), 16))
    : /^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8))
      : ({ n: "\n", t: "\t", r: "\r", e: "\x1b", a: "\x07", b: "\b", f: "\f", v: "\v" })[e] ?? e);

/** O nome do comando de uma palavra com o EQUALS do zsh (#567): `=git` corre o `/usr/bin/git`. Tira um `=` inicial seguido
 *  de algo que nao e `=` nem espaco, e depois o caminho. E a SEGUNDA leitura: quem a usa junta-a a do `main` (nega se
 *  qualquer negar) — trocar uma pela outra herdava os buracos do `git` que o `main` negava por acaso (o N1 do plano). */
export const nomeDoComando = (t) => t.replace(/^=(?=[^=\s])/, "").replace(/^.*\//, "");
/** O texto tem uma palavra que comeca por `=` (e so entao a leitura do EQUALS corre: sem ela, o veredicto E a razao sao
 *  os do `main`, sem nada a dobrar). */
export const temEquals = (texto) => /(?:^|[\s;&|(){}`$])=[^=\s]/.test(texto);

/** Quem corre o stdin numa SHELL sem se chamar shell (#566), uma so vez: o `SHELL_ELEVADA` do piso (`fronteira-piso.mjs`)
 *  e o `recebeDe` (`recebe.mjs`) montam-se daqui. Os que ELEVAM com uma flag (`sudo -s`, `doas -i`) e os que sao uma
 *  shell de login por si (`su`, `runuser`). */
export const ELEVAM = ["sudo", "doas"];
export const SU = ["su", "runuser"];
/** A flag CURTA do `sudo`/`doas` que abre uma shell: `s`/`i` MINUSCULOS num grupo (`-s`, `-i`, `-Es`; o `-S` le a
 *  password). Uma so fonte (#600): o `eleva`/`elevaSemValor` (`recebe.mjs`) e o heredoc do guard do branch. */
export const ELEVA_CURTA_SRC = "-[A-Za-z]*[si][A-Za-z]*";
/** O `--login` do `sudo` e os prefixos unicos dele (o `getopt_long` aceita-os: `--lo`, `--log`, `--logi`; o `--l` e
 *  ambiguo com o `--list`). Uma so fonte (#600): o `mudaAPasta` (`cabeca-comando.mjs`), o `eleva` (`recebe.mjs`) e o
 *  heredoc do guard do branch. */
export const SUDO_LOGIN_SRC = "lo(?:g(?:i(?:n)?)?)?";
/** O `--shell` do `sudo` e os prefixos unicos (`--sh`, `--she`, `--shel`; o `--s` e ambiguo com o `--set-home`). */
export const SUDO_SHELL_SRC = "sh(?:e(?:l(?:l)?)?)?";

/** Cabecas INERTES: correm o comando seguinte sem lhe mudar o sentido.
 *
 *  Esta lista e uma SEGUNDA COPIA da `WRAPPERS` do guard dos branches (`invocacoes-git.mjs` desde o #580), e digo-o em
 *  vez de escrever "reutiliza": ali as formas nao sao exportadas, logo nao ha nada a reutilizar,
 *  e isto e um `TP8` assumido — uma cabeca acrescentada num ficheiro nao aparece no outro e nada
 *  o denuncia. Extrair para um modulo comum e trabalho proprio, e fica dito aqui em vez de
 *  ficar por dizer. As divergencias sao deliberadas, porque a POSTURA dos dois e oposta. Ali, um consumo a mais faz
 *  `continue` e o segmento e ignorado: fail-open limitado, porque aquele guard so se importa
 *  com o `git`. Aqui a `LEITURA` (em `fronteira-piso.mjs`) e uma allowlist e **um token consumido a
 *  mais converte um `deny` num `allow`**.
 *
 *  1. As cabecas OPACAS (`eval`, `xargs`, `sh -c` e irmas) NAO entram. Sao tratadas pelo
 *     `OPACO`, e consumi-las faria julgar o verbo errado: em `ls <fronteira> | xargs rm`, quem
 *     apaga e o `xargs`, que nao tem o caminho escrito.
 *  2. Uma atribuicao NUNCA e cabeca — ver `resto()`.
 *  3. O `su`/`runuser` NAO entram (#600). Nos `WRAPPERS` do `invocacoes-git.mjs` entraram, para o ciclo chegar ao git
 *     do `-c`. Aqui sao lidos a parte (o
 *     `inlineDe` em `posicao.mjs`, e o `recebeDe` em `recebe.mjs`): consumi-los fazia do utilizador ou do valor do `-c` o verbo. */
export const CABECAS = new Set([
  "sudo", "doas", "env", "command", "builtin", "time", "timeout", "nohup", "setsid", "stdbuf",
  "nice", "ionice", "unbuffer",
]);

/** Os modificadores do zsh que poem um comando a correr e nao levam argumentos (#606): `noglob git commit`, `- git push`
 *  correm o `git`. Uma so lista, lida por todos: o `resto()` (aqui), os `WRAPPERS` do guard do branch
 *  (`invocacoes-git.mjs`), o seguimento do `cd` dele (`guard-protected-branch.mjs`) e a cabeca dos textos publicos
 *  (`cabeca-comando.mjs`). O `builtin`/`command`/`exec` ja se liam. O `repeat N` leva uma contagem, e NAO entra aqui nem
 *  nas `CABECAS` (que os textos publicos leem): o `resto()` consome-o a parte, e o guard do branch tem a `contagem()` (#640). */
export const MODIFICADORES_ZSH = ["noglob", "nocorrect", "-"];
/** Palavras de shell que nunca sao o comando (e os modificadores de cima). O `do`/`then` ja saem no `split`; `for`/`while`
 *  NAO entram, e e deliberado: o corpo do ciclo vive noutros segmentos, e julgar "o verbo do
 *  segmento seguinte" permitia `for f in <F>; do cat $f; rm $f; done` — o `cat` desarmava o
 *  `rm`. E a classe do ciclo, e tem slice propria. */
const PALAVRAS_SHELL = new Set(["if", "else", "elif", "!", ...MODIFICADORES_ZSH]);

/** As palavras-chave que, essas sim, chegam como "verbo" (#307): um ciclo ou bloco nao escreve
 *  por si, so esconde o que corre dentro. So as que chegam — as de cima o `resto()` consome, e
 *  `do`/`then` partem o segmento. Nao servem para DECIDIR (ver acima): so para escolher a razao. */
export const PALAVRAS_DE_BLOCO = new Set(["for", "while", "until", "select", "case", "done", "fi", "esac", "{", "}"]);

/** As que nao levam comando no proprio segmento (`for x in <palavras>`): o resto e texto. O `case`
 *  leva-o no primeiro braco (`case $x in a) rm <f>`), e fica aqui de proposito: o padrao e o
 *  comando nao se separam sem um parser, e na duvida a razao e a de opacidade. */
const SEM_COMANDO = new Set(["for", "select", "case"]);

/** Os verbos que ESCREVEM de certeza: so com um deles a vista um bloco leva a razao de escrita.
 *  Fechada de proposito — um verbo que nao esteja aqui (`read`, `cd`, `sleep`, uma atribuicao)
 *  deixa a razao de opacidade, que e a que diz "nao consegui provar". */
const ESCREVE = new Set([
  "rm", "rmdir", "unlink", "mv", "cp", "ln", "install", "rsync", "chmod", "chown", "touch",
  "truncate", "dd", "tee", "mkdir",
]);

/** O verbo que escreve num segmento de bloco, depois das palavras-chave e das cabecas
 *  (`{ rm`, `while ! sudo rm` -> `rm`); `null` se nao corre nada (`for x in ...`, `} > f`) ou se
 *  o que corre nao e uma escrita certa (`{ sudo cat <f>`).
 * @param {string[]} toks os tokens do segmento, sem cabecas (`resto()`)
 * @returns {string|null} */
export function escritaDoBloco(toks) {
  let i = 0;
  while (i < toks.length && PALAVRAS_DE_BLOCO.has(toks[i])) {
    if (SEM_COMANDO.has(toks[i])) return null;
    i++;
  }
  const v = (resto(toks.slice(i).join(" "))[0] ?? "").replace(/^.*\//, "");
  return ESCREVE.has(v) ? v : null;
}

/** Valor de uma cabeca: `timeout 5`, `timeout 60`. A cicatriz esta escrita no guard vizinho —
 *  sem isto, o `5` de `timeout 5 git rm` parava o consumo e o verbo real nao era alcancado. */
const VALOR_DE_CABECA = /^\d+[smhd]?$/;

/** Flags que consomem o argumento SEGUINTE, **por cabeca**.
 *
 *  Nomeadas, e nao "toda a flag consome um valor": essa foi a primeira versao e **comia o verbo
 *  real** — `stdbuf -o0 tee <alvo>` engolia o `tee` e o alvo passava a ser lido como verbo.
 *
 *  Uma flag que nao esteja aqui consome ZERO tokens. O seguinte passa a ser julgado como verbo
 *  e, se for um valor (`KILL`), nao esta na `LEITURA` e nega. **O erro cai para o lado fechado**,
 *  que e a unica direccao aceitavel num allowlist. */
const FLAGS_COM_VALOR = {
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  nice: new Set(["-n"]),
  ionice: new Set(["-c", "-n", "-p"]),
  sudo: new Set(["-u", "-g", "-p", "-C", "-U", "-h", "-r", "-t"]),
  doas: new Set(["-u", "-C"]),
  env: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]),
  stdbuf: new Set(["-i", "-o", "-e"]),
  time: new Set(["-o", "-f"]),
  // As cabecas SEM flags-com-valor nao tem entrada: o `?.` abaixo ja trata o `undefined`, e
  // cinco `new Set([])` eram cinco ramos que nenhuma mutacao matava (`TP7`).
};

/** As ATRIBUICOES, em duas definicoes, uma por DIRECAO de falha (#546). Eram oito leitores com quatro formas, e
 *  cada um falhava numa (`X+=y`, `X[0]=y`, `env A-B=1`). Uma so definicao nao serve: estreitar o `\w+=` do guard
 *  do branch para a forma do bash abria `env 1X=y git commit` (1.a leitura do plano).
 *
 *  A LARGA: qualquer palavra com `=` antes do primeiro espaco, que nao comece por `-` (uma flag) — o `env` aceita
 *  qualquer `NOME=valor`. Para quem PROCURA algo perigoso mais a frente (o `git`, o `GIT_PAGER`, o interpretador):
 *  saltar a mais e falhar fechado. A fonte sem o `^` serve as regex montadas por texto (`RECEBE_CODIGO`). */
export const ATRIBUICAO_LARGA_SRC = String.raw`[^\s=-][^\s=]*=`;
export const ATRIBUICAO_LARGA = new RegExp(`^${ATRIBUICAO_LARGA_SRC}`);
/** A do BASH: `X=y`, `X+=y`, `X[i]=y`, `X[i]+=y` (#545, #546), a forma que a shell aceita como atribuicao. Para quem
 *  decide pelo verbo que SOBRA numa allowlist: saltar uma palavra que o bash corre como comando abria. */
export const ATRIBUICAO_BASH = /^[A-Za-z_]\w*(?:\[[^\]\s]*\])?\+?=/;
/** A do BASH so com um indice LITERAL numerico (`X[0]=1`): um indice com nomes e aritmetica, e o bash avalia-a — num
 *  `X[Y]=1` solto corre uma substituicao escondida no valor de `Y` (M3 do `/audit` da v0.63.6, medido no bash 3.2).
 *  Para quem salta palavras antes de uma allowlist: o `X[Y]=1` fica como verbo, e e julgado. O preco, aceite: um
 *  `n[$i]=v`, `X[-1]=v` ou `m[chave]=v` depois de um `cd` para a fronteira tambem fica como verbo, e e negado.
 *  Fecha so ESTA forma: o mesmo payload numa variavel lida num contexto aritmetico (por exemplo `${A[Y]}`, `$((Y))`,
 *  `[[ Y -eq 0 ]]`, `read X[Y]`, `${S:Y}`) continua fora do alcance de um hook que le texto. Corre no bash (medido no
 *  3.2.57), nao no zsh 5.9 desta maquina: um CONTORNO, registado no `ABERTO` do `tests-fronteira-inventario.mjs` (#576)
 *  — uma barreira contra o descuido, nao contra quem a contorna. */
export const ATRIBUICAO_BASH_LITERAL = /^[A-Za-z_]\w*(?:\[\d*\])?\+?=/;
/** O nome de uma atribuicao, ou de um argumento de `export`/`declare`: `PATH[0]+=x` da `PATH`, `NODE_OPTIONS+` da
 *  `NODE_OPTIONS`. Uma palavra sem essa forma fica como esta. */
export const nomeDaAtribuicao = (t) => /^[A-Za-z_]\w*(?=\[|\+|=|$)/.exec(t)?.[0] ?? t;
/** A palavra `i` de um argv (`{texto}`) vem depois de um `env`/`sudo`, que aceitam a LARGA (`A-B=1`) como atribuicao,
 *  so com atribuicoes e flags pelo meio (`env -u FOO A-B=1`)? O `doas` nao aceita; fora disto o bash corre-a (#546). */
export function depoisDeAtribuidora(argv, i) {
  for (let k = i - 1; k >= 0; k--) {
    if (["env", "sudo"].includes(argv[k].texto.replace(/^.*\//, ""))) return true;
    // Outra cabeca pelo meio (`env -i nice A-B=1`): o `nice` corre o `A-B=1` como comando (6.a leitura do diff).
    if (CABECAS.has(argv[k].texto.replace(/^.*\//, ""))) return false;
    if (!ATRIBUICAO_LARGA.test(argv[k].texto) && !/^-/.test(argv[k].texto) && !/^-/.test(argv[k - 1]?.texto ?? "")) return false;
  }
  return false;
}

/** O segmento sem as cabecas inertes — os tokens a partir do VERBO REAL.
 *
 *  @param {string} segmento um segmento que toca a fronteira
 *  @returns {string[]} os tokens restantes; `[]` se o segmento era so cabecas */
export function resto(segmento) {
  let toks = segmento.trim().split(/\s+/).filter(Boolean);
  let cabeca = null;
  for (;;) {
    if (toks.length === 0) return [];
    const t = toks[0];
    const base = t.replace(/^.*\//, "");
    if (PALAVRAS_SHELL.has(t)) {
      toks = toks.slice(1);
      continue;
    }
    // #640: o `repeat N` do zsh, pelo token EXATO e sem mexer na `cabeca`, so com um numero literal a partir de 1 — e antes de
    // um `cd`/`pushd`/`popd`, so com `1` (o `repeat 2 cd ..` muda o directorio duas vezes; o `repeat 0 cd` nao o corre, a
    // decisao 3). Com outra contagem o verbo fica `repeat`, e nega como antes: a lista fechada (a decisao 2).
    if (t === "repeat" && /^[1-9]\d*$/.test(toks[1] ?? "")) {
      // O verbo que corre de facto, saltando as palavras de shell, as cabecas e outros `repeat <n>`: `repeat 2 builtin pushd`
      // e `repeat 2 repeat 1 pushd` correm o `pushd` duas vezes (o 2.o leitor do #640). Linear, e nao pelo `resto()`
      // recursivo: uma cadeia de `repeat 2` relia o resto a cada nivel.
      let j = 2;
      while (toks[j] !== undefined && (PALAVRAS_SHELL.has(toks[j]) || CABECAS.has(toks[j].replace(/^.*\//, ""))
        || (toks[j] === "repeat" && /^\d+$/.test(toks[j + 1] ?? "") && j++))) j++;
      const verbo = toks[j] ?? "";
      if (toks[1] === "1" || !/^(?:cd|pushd|popd)$/.test(verbo.replace(/^.*\//, ""))) {
        toks = toks.slice(2);
        continue;
      }
    }
    // Um token com `=` NUNCA e cabeca. Sem esta guarda, `LD_PRELOAD=/tmp/x/env cat <alvo>` era
    // consumido como se fosse `env`, porque o **basename do VALOR** acaba no nome de uma cabeca
    // — e o comando passava. Hoje as atribuicoes falham FECHADO para todos os nomes, por
    // acidente do `basename`, e este ticket nao compra esse acidente por uma lista de nomes:
    // medido que `PATH=`, `NODE_PATH=`, `LESSOPEN=` e `AWKPATH=` ficariam de fora dela.
    // ... e so pelo NOME NU ou de um caminho de sistema. `basename` sozinho aceitava
    // `/tmp/evil/env cat <alvo>` como se fosse o `env`: qualquer binario que alguem ponha num
    // caminho seu passava a ser uma cabeca inerte. E a MESMA causa que a guarda do `=` acima
    // trata, e ficou sem guarda nenhuma — apanhada pelo leitor independente (Fase 4).
    const caminhoDeSistema = !t.includes("/") || /^\/(?:usr\/)?(?:local\/)?s?bin\//.test(t);
    if (!t.includes("=") && caminhoDeSistema && CABECAS.has(base)) {
      cabeca = base;
      toks = toks.slice(1);
      continue;
    }
    if (cabeca && /^-/.test(t)) {
      // Consome-se UM token de valor, nunca uma cadeia — e **nunca um que toque a fronteira**:
      // `env -u <alvo> cat /tmp/y` fazia o `-u` engolir o alvo, e o que sobrava (`cat /tmp/y`)
      // era uma leitura inocente de outro ficheiro.
      const leva =
        FLAGS_COM_VALOR[cabeca]?.has(t) && toks.length > 1 && !FRONTEIRA.test(` ${toks[1]}`);
      toks = toks.slice(leva ? 2 : 1);
      continue;
    }
    if (cabeca && VALOR_DE_CABECA.test(t)) {
      toks = toks.slice(1);
      continue;
    }
    return toks;
  }
}

// --- A MENSAGEM da negacao ---------------------------------------------------------
// Saiu do `fronteira.mjs` quando ele passou as ~400 linhas (#317): sao dados e a escolha da
// razao, sem nada da decisao — o `fronteira.mjs` reexporta-os, logo quem os importa nao mudou.

/** A razao, escrita uma vez e usada pelo hook e pelos testes. */
export const RAZAO_FRONTEIRA =
  "A configuracao de fronteira (`.claude/settings.json`, `.claude/settings.local.json`, " +
  "`.claude/hooks/`, `.githooks/`) nao " +
  "se altera por `Bash`. O `deny` do settings so cobre `Edit`/`Write`, logo esta verificacao " +
  "existe para fechar o resto — um agente que reescreva a propria fronteira deixa a sessao " +
  "seguinte sem nenhuma. Editar com a ferramenta `Edit` (que pede aprovacao para os hooks e " +
  "recusa o settings), ou a mao, fora do agente.";

/** A razao quando o hook NAO PROVOU uma escrita: so nao conseguiu provar que o comando so le
 *  (#307). A mesma negacao com a razao de escrita, a um `for` que corria a suite dos hooks, dizia
 *  que o comando alterava a fronteira — e nao alterava nada. Uma razao errada empurra a desligar o
 *  hook; a certa diz o que fazer. */
export const RAZAO_OPACA =
  "O hook nao consegue provar que este comando so LE a configuracao de fronteira " +
  "(`.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/`, `.githooks/`): " +
  "e uma composicao opaca — um " +
  "ciclo ou bloco de shell, codigo inline, `eval`/`sh -c`, execucao adiada, um caminho citado " +
  "que o comando executa, ou um comando complexo demais para analisar. Na duvida nega, porque " +
  "escrever ali por `Bash` deixava a sessao seguinte sem fronteira. Se so le: partir em comandos " +
  "simples, um por chamada e com o caminho a vista (a suite dos hooks e " +
  "`node .claude/hooks/tests/test-hooks.mjs`). Mover o comando para um script para o hook nao o " +
  "ver e o que esta verificacao existe para travar. Se escreve: a ferramenta `Edit` (que pede " +
  "aprovacao para os hooks e recusa o settings), ou a mao, fora do agente.";

/** As condicoes em que a negacao vem de nao se conseguir ver, e nao de uma escrita vista.
 *  O `git-que-executa` fica de fora de proposito: o tecto e o executor aninhado tambem negam sem
 *  abrir, mas o rotulo nao separa esses ramos do que viu uma escrita — e na duvida a razao de
 *  escrita e a que nao aconselha a reescrever o comando. */
const OPACAS = new Set([
  "erro-ao-analisar", "citado-mas-executado", "execucao-adiada", "substituicoes-demais",
  "codigo-inline", "wrapper-opaco", "recebe-codigo",
]);

/**
 * A razao para a condicao que negou. So a MENSAGEM muda — o veredicto e o mesmo.
 * @param {string} condicao o rotulo de `porqueAltera()`
 * @param {boolean} [crase] o comando tem uma crase que o shell executa (`executaCrase`): leva a `NOTA_CRASE` (#568)
 * @returns {string} `RAZAO_OPACA` ou `RAZAO_FRONTEIRA`
 */
export function razaoDe(condicao, crase = false) {
  const [rotulo, verbo] = condicao.split(/:(.*)/s);
  const opaca = OPACAS.has(rotulo) || (rotulo === "verbo-nao-e-leitura" && PALAVRAS_DE_BLOCO.has(verbo));
  const inline = rotulo === "codigo-inline" || (rotulo === "citado-mas-executado" && verbo === "inline");
  return (opaca ? RAZAO_OPACA : RAZAO_FRONTEIRA) + (inline ? NOTA_INLINE : "") + (crase ? NOTA_CRASE : "");
}

/** So quando o comando tem uma crase que o shell executa (#568): a crase com "so um caminho" deixou de ser isenta, e a
 *  mensagem com `` `.claude/hooks` `` entre aspas duplas nega. Dizer o que funciona poupa a tentativa seguinte. Aparece
 *  tambem quando a negacao veio de outra parte do comando (`rm <f> && echo `date``): e uma nota, e julgar o comando duas
 *  vezes para a afinar nao compensa (decidido no #568). */
const NOTA_CRASE =
  " Nota: a crase EXECUTA, tambem entre aspas duplas e num heredoc sem aspas — `` `.claude/hooks` `` corre o " +
  "caminho. Para um caminho num texto, usar plicas, `-F <ficheiro>` ou `<<'EOF'`.";

/** So nas negacoes de CODIGO INLINE (#336): o que so le tambem e negado, e de proposito — distinguir ler de
 *  escrever dentro do codigo era analisar JS com regex (decisao 3 do `/grill`). Dizer o caminho que funciona
 *  poupa a tentativa seguinte; num ciclo ou num `eval` a nota nao se aplica, e nao aparece. */
const NOTA_INLINE =
  " Um interpretador a correr codigo inline (`node -e`, `perl -e`, `python3 -c`...) que cite a fronteira e " +
  "negado mesmo que so LEIA: o hook nao distingue ler de escrever dentro do codigo. Para validar o JSON, " +
  "`jq empty <ficheiro>`.";
