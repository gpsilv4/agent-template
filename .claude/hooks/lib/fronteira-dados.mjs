/**
 * O que a fronteira E, e o verbo real de um segmento — {{PROJECT_NAME}}
 *
 * Um modulo-FOLHA: nao importa nada. Saiu do `fronteira.mjs` porque ele e o `caminhos.mjs` se
 * importavam um ao outro (#243): um `const` novo no topo de qualquer dos dois rebentava com
 * TDZ, e o erro caia no `catch` do hook — que PERMITE. Os dois leem daqui, e o ciclo deixou de
 * existir; o `tests-sem-ciclos.mjs` reprova se voltar.
 *
 * O que decide o que um comando faz a fronteira continua no `fronteira.mjs` (a `LEITURA`, o
 * `OPACO`, o `porqueAltera`). Aqui so os DADOS e a leitura do verbo, que nao dependem de nada.
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
export const FRONTEIRA = new RegExp(
  "(?:^|[\\s\"'`=(>|&!])(?:\\./)?(?:" +
    [
      ...CAMINHOS_FRONTEIRA.map((f) =>
        f.endsWith("/") ? `${f.slice(0, -1).replace(/[.]/g, "\\.")}(?:/|(?=[\\s;|&)>"'\`]|$))` : f.replace(/[.]/g, "\\.")
      ),
      ...MAES.map((m) => `${m.replace(/[.]/g, "\\.")}(?:/?(?=[\\s;|&)>"'\`]|$)|/\\{)`),
    ].join("|") +
    ")"
);

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
const CABECAS = new Set([
  "sudo", "doas", "env", "command", "builtin", "time", "timeout", "nohup", "setsid", "stdbuf",
  "nice", "ionice", "unbuffer",
]);

/** Palavras de shell que nunca sao o comando. O `do`/`then` ja saem no `split`; `for`/`while`
 *  NAO entram, e e deliberado: o corpo do ciclo vive noutros segmentos, e julgar "o verbo do
 *  segmento seguinte" permitia `for f in <F>; do cat $f; rm $f; done` — o `cat` desarmava o
 *  `rm`. E a classe do ciclo, e tem slice propria. */
const PALAVRAS_SHELL = new Set(["if", "else", "elif", "!"]);

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
