/**
 * O que a fronteira E, e o verbo real de um segmento — {{PROJECT_NAME}}
 *
 * Um modulo-FOLHA: nao importa nada. Saiu do `fronteira.mjs` porque ele e o `caminhos.mjs` se
 * importavam um ao outro (#243): um `const` novo no topo de qualquer dos dois rebentava com
 * TDZ, e o erro caia no `catch` do hook — que PERMITE. Os dois leem daqui, e o ciclo deixou de
 * existir; o `tests-sem-ciclos.mjs` reprova se voltar.
 *
 * O que decide o que um comando faz a fronteira continua no `fronteira.mjs` (a `LEITURA`, o
 * `OPACO`, o `porqueAltera`). Aqui so os DADOS e a leitura do verbo, que nao dependem de nada —
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
 *  quatro copias e divergiam. Hoje so o `textos-publicos.mjs` a le; o `fronteira.mjs`, o `verbos-git.mjs` e o
 *  `guard-protected-branch.mjs` convergem no #336, com o corpus diferencial (la, mudar a lista troca negacoes por
 *  permissoes). O `--exec-path` so leva valor com `=` (sem ele o git imprime e sai: consumir o seguinte e inofensivo);
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

/** Os interpretadores que correm codigo, como alternativas de uma regex. Lidos pelo `fronteira.mjs` (as regex
 *  do piso) e pelo `posicao.mjs` (o nome base de uma palavra em posicao de comando, #336). */
export const NOMES_INTERPRETADOR = String.raw`node(?:js)?|ts-node|tsx|deno|bun|python3?(?:\.\d+)?|pypy3?|ruby|perl|php|lua|Rscript|osascript`;

/** Cabecas INERTES: correm o comando seguinte sem lhe mudar o sentido.
 *
 *  Esta lista e uma SEGUNDA COPIA da `WRAPPERS` do `guard-protected-branch.mjs`, e digo-o em
 *  vez de escrever "reutiliza": ali as formas nao sao exportadas, logo nao ha nada a reutilizar,
 *  e isto e um `TP8` assumido — uma cabeca acrescentada num ficheiro nao aparece no outro e nada
 *  o denuncia. Extrair para um modulo comum e trabalho proprio, e fica dito aqui em vez de
 *  ficar por dizer. As divergencias sao deliberadas, porque a POSTURA dos dois e oposta. Ali, um consumo a mais faz
 *  `continue` e o segmento e ignorado: fail-open limitado, porque aquele guard so se importa
 *  com o `git`. Aqui a `LEITURA` (em `fronteira.mjs`) e uma allowlist e **um token consumido a
 *  mais converte um `deny` num `allow`**.
 *
 *  1. As cabecas OPACAS (`eval`, `xargs`, `sh -c` e irmas) NAO entram. Sao tratadas pelo
 *     `OPACO`, e consumi-las faria julgar o verbo errado: em `ls <fronteira> | xargs rm`, quem
 *     apaga e o `xargs`, que nao tem o caminho escrito.
 *  2. Uma atribuicao NUNCA e cabeca — ver `resto()`. */
export const CABECAS = new Set([
  "sudo", "doas", "env", "command", "builtin", "time", "timeout", "nohup", "setsid", "stdbuf",
  "nice", "ionice", "unbuffer",
]);

/** Palavras de shell que nunca sao o comando. O `do`/`then` ja saem no `split`; `for`/`while`
 *  NAO entram, e e deliberado: o corpo do ciclo vive noutros segmentos, e julgar "o verbo do
 *  segmento seguinte" permitia `for f in <F>; do cat $f; rm $f; done` — o `cat` desarmava o
 *  `rm`. E a classe do ciclo, e tem slice propria. */
const PALAVRAS_SHELL = new Set(["if", "else", "elif", "!"]);

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
 * @returns {string} `RAZAO_OPACA` ou `RAZAO_FRONTEIRA`
 */
export function razaoDe(condicao) {
  const [rotulo, verbo] = condicao.split(/:(.*)/s);
  const opaca = OPACAS.has(rotulo) || (rotulo === "verbo-nao-e-leitura" && PALAVRAS_DE_BLOCO.has(verbo));
  const inline = rotulo === "codigo-inline" || (rotulo === "citado-mas-executado" && verbo === "inline");
  return (opaca ? RAZAO_OPACA : RAZAO_FRONTEIRA) + (inline ? NOTA_INLINE : "");
}

/** So nas negacoes de CODIGO INLINE (#336): o que so le tambem e negado, e de proposito — distinguir ler de
 *  escrever dentro do codigo era analisar JS com regex (decisao 3 do `/grill`). Dizer o caminho que funciona
 *  poupa a tentativa seguinte; num ciclo ou num `eval` a nota nao se aplica, e nao aparece. */
const NOTA_INLINE =
  " Um interpretador a correr codigo inline (`node -e`, `perl -e`, `python3 -c`...) que cite a fronteira e " +
  "negado mesmo que so LEIA: o hook nao distingue ler de escrever dentro do codigo. Para validar o JSON, " +
  "`jq empty <ficheiro>`.";
