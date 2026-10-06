/**
 * A fronteira nao se reescreve a si propria — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `deny` do `.claude/settings.json` cobre `Edit`/`Write` e **nao cobre
 * `Bash`**. Um `sed -i`, um `>`, um `node -e`, um `mv`, um `rm`, um `chmod` ou um `git rm`
 * sobre `.claude/settings.json`, `.claude/hooks/` ou `.githooks/` reescreviam a fronteira sem
 * passar por nenhuma das duas ferramentas — e o `BOOTSTRAP.md` vendia essa linha como "sem
 * ela, o agente alarga as proprias permissoes". Vendia mais do que entregava.
 *
 * DESENHO: **allowlist dos verbos de leitura**, nao blocklist dos de escrita (`TP6`). As
 * formas de escrever um ficheiro em shell nao sao enumeraveis — redireccao, `tee`, `sed -i`,
 * `perl -i`, `mv`, `cp`, `dd`, `install`, um interpretador qualquer. As de LER sao poucas.
 *
 * TRES FALSOS POSITIVOS, TODOS MEDIDOS AO USAR A PROPRIA VERIFICACAO, no mesmo dia em que
 * nasceu — e e por isso que este ficheiro existe a parte, com testes proprios:
 *   1. negava `for s in a b; do node .claude/hooks/tests/test-hooks.mjs; done`, porque olhava
 *      para o primeiro verbo da LINHA e nao do segmento. Correr a suite dos hooks e trabalho
 *      normal;
 *   2. um `|` dentro de aspas (`grep 'a\|b' .claude/hooks/x`) partia o comando e produzia um
 *      segmento cujo "verbo" era um pedaco do padrao de procura;
 *   3. negava escrever um ficheiro noutro sitio cujo CONTEUDO mencionava a fronteira — um
 *      heredoc a documentar esta mesma regra.
 *
 * O principio que sai dai: um caminho **citado** e texto; so um caminho em posicao de
 * ARGUMENTO e um alvo. Um guard que nega trabalho normal e contornado, e ai deixa de
 * proteger o que interessa.
 *
 * O caminho que fica deliberadamente aberto e a ferramenta `Edit`: o `settings.json` esta em
 * `deny` e os hooks em `ask`, logo a alteracao legitima passa por uma aprovacao humana.
 */

import { levaMarcador, normalizaCaminhos, pedacosDe, REDIRECCAO_INOFENSIVA, semCitacoes, substituicoes } from "./caminhos.mjs";
// O hook pede o contexto aqui, como antes; a normalizacao de caminhos vive em `caminhos.mjs`.
export { contextoFronteira } from "./caminhos.mjs";

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
const FRONTEIRA = new RegExp(
  "(?:^|[\\s\"'`=(>|&!])(?:\\./)?(?:" +
    [
      ...CAMINHOS_FRONTEIRA.map((f) =>
        f.endsWith("/") ? `${f.slice(0, -1).replace(/[.]/g, "\\.")}(?:/|(?=[\\s;|&)>"'\`]|$))` : f.replace(/[.]/g, "\\.")
      ),
      ...MAES.map((m) => `${m.replace(/[.]/g, "\\.")}(?:/?(?=[\\s;|&)>"'\`]|$)|/\\{)`),
    ].join("|") +
    ")"
);

/** Este segmento so muda de directorio? Pelo verbo REAL, depois das cabecas (`if cd X`, `builtin
 *  cd X`) — e SEM redireccao nem substituicao: `cd /tmp > <fronteira>` trunca o ficheiro, e o
 *  `$(...)`/crase de `cd $(rm <fronteira>)` corre (a terceira leitura do #185 apanhou os dois). */
//  Sem contar as redireccoes INOFENSIVAS (`2>/dev/null`, `>&2`): `cd X 2>/dev/null && cat y` e leitura.
const soMudaDeDirectorio = (s) =>
  !/[<>`]|\$\(/.test(s.replace(REDIRECCAO_INOFENSIVA, " ")) &&
  ["cd", "pushd", "popd"].includes((resto(s.replace(/[()]/g, " "))[0] ?? "").replace(/^.*\//, ""));

/** Verbos que apenas LEEM. Tudo o que nao esta aqui e tratado como escrita. */
const LEITURA = new Set([
  "cat", "bat", "less", "more", "head", "tail", "wc", "grep", "rg", "egrep", "fgrep", "awk",
  "sed", "jq", "diff", "cmp", "md5", "md5sum", "shasum", "sha256sum", "file", "stat", "ls",
  "find", "realpath", "dirname", "basename", "node", "test", "[", "[[", "wl-copy", "pbcopy", "echo", "printf",
  "du", "tree",
  // `git` le e encena; o destrutivo dele ja e tratado pela lista SEGUROS do hook. Sem ele,
  // `git diff .claude/settings.json` era negado — e e precisamente o que se quer poder correr.
  "git",
]);

// O texto citado — o que e texto, o que e caminho e o que o shell executa — le-se em
// `lib/caminhos.mjs` (`semCitacoes`). Saiu daqui quando este ficheiro chegou as 500 linhas (#229).

/** Wrappers que executam o que lhes chega em texto: ai o conteudo citado **e** comando. */
//  O `trap` tambem: `trap "rm <fronteira>" EXIT` corre o texto citado a saida (leitura do 024753a).
const OPACO = /\b(?:eval|xargs|trap)\b|\b(?:sh|bash|zsh|dash|ksh)\b[^\n]*\s-c\b/;

/** Execucao ADIADA: uma funcao definida, ou um `trap`, corre o corpo noutro sitio — depois de um
 *  `cd` para a fronteira, ou com o nome de um verbo isento (`true(){ rm -rf *; }; cd <f> && true`).
 *  O verbo escrito deixa de dizer o que corre; num comando que toque a fronteira, nega. */
//  Em POSICAO DE COMANDO: `grep -n function <f>` e um argumento, e era negado. O `alias` e a mesma
//  classe (#223): `alias cat='rm -rf'; cat <f>` sombreia uma leitura — tambem com `\alias`,
//  `builtin alias` ou `command alias` (as cabecas consomem-se, e o `\` impedia o casamento).
const ADIADA = /(?:^|[;&|({\n]|\b(?:then|do|else)\s)\s*(?:function\s+\S+|trap\s|(?:\\|(?:builtin|command)\s+)?alias\s|[\w.:-]+\s*\(\s*\))/;

/** Interpretadores a correr codigo INLINE. Correr um FICHEIRO e leitura; `-e` escreve. */
const CODIGO_INLINE = /\b(?:node|deno|bun|python3?|ruby|perl|php)\b[^\n]*\s(?:-e|-p|--eval|--print|-c)\b/;

/** Cabecas INERTES: correm o comando seguinte sem lhe mudar o sentido.
 *
 *  Esta lista e uma SEGUNDA COPIA da `WRAPPERS` do `guard-protected-branch.mjs`, e digo-o em
 *  vez de escrever "reutiliza": ali as formas nao sao exportadas, logo nao ha nada a reutilizar,
 *  e isto e um `TP8` assumido — uma cabeca acrescentada num ficheiro nao aparece no outro e nada
 *  o denuncia. Extrair para um modulo comum e trabalho proprio, e fica dito aqui em vez de
 *  ficar por dizer. As divergencias sao deliberadas, porque a POSTURA dos dois e oposta. Ali, um consumo a mais faz
 *  `continue` e o segmento e ignorado: fail-open limitado, porque aquele guard so se importa
 *  com o `git`. Aqui a `LEITURA` e uma allowlist e **um token consumido a mais converte um
 *  `deny` num `allow`**.
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

/** Marca um sitio de RECUSA. Devolve o rotulo tal e qual — nao faz nada.
 *
 *  PORQUE EXISTE, e nao e arrumacao: a varredura de mutacao desliga um sitio de recusa de cada
 *  vez e exige que a suite fique vermelha. Ela sabe fazer isso a **chamadas** (11 dos 13 sinais
 *  do `pares.mjs` sao chamadas; um e uma atribuicao), e as recusas deste ficheiro eram sete
 *  `return` em tres sintaxes diferentes — string literal, template literal e um ternario. Um
 *  regex que apanhasse as tres sem apanhar o `return null` era fragil, e uma lista de rotulos
 *  escrita a mao ao lado do codigo seria um `TP8` a espera de acontecer.
 *
 *  Com esta funcao, o sinal e `nega(` — a mesma forma que a ferramenta ja entende. O ficheiro
 *  passa a ter a forma que ela le, em vez de lhe ensinarmos sintaxe nova.
 *
 *  Ha precedente escrito no repo: a `avaliar()` do `test-harness.mjs` foi extraida como funcao
 *  pura **precisamente** para a varredura a poder cobrir, depois de medir 0/9 nesse ficheiro.
 *  O cabecalho dela di-lo. Esta e a mesma troca: uma linha de producao por uma rede. */
const nega = (rotulo) => rotulo;

/**
 * PORQUE e que este comando seria negado — o mesmo veredicto de `alteraFronteira()`, com o
 * nome da condicao que o produziu.
 *
 * PORQUE EXISTE: a decisao combina OITO condicoes com alcances diferentes (umas por segmento,
 * outras sobre o comando inteiro), e bastava uma disparar para o comando ser negado com uma
 * razao generica. Quem levava com a negacao nao sabia qual — e das quatro negacoes de LEITURA
 * medidas numa sessao real, duas ficaram por explicar por nao haver forma de as diagnosticar.
 * Duas delas bloquearam passos que o proprio processo exige: correr a suite dos hooks, e
 * publicar um comentario sobre o assunto.
 *
 * Um agente que nao perceba a negacao ou desliga o hook — e perde a proteccao toda — ou salta a
 * verificacao. Nenhum dos dois e o que o hook quer, e os dois sao mais provaveis do que
 * investigar.
 *
 * Nasceu (#101) so para dizer PORQUE, sem mudar o que e negado. Desde o #185 decide tambem o que
 * a fronteira casa: os caminhos escritos de outra maneira normalizam-se antes (`normalizaCaminhos`).
 *
 * @param {string} texto o comando completo
 * @param {{raiz?: string, cwd?: string, prefixo?: string, home?: string}} [ctx] onde o comando corre
 *   (`contextoFronteira()`). Sem ele, os caminhos relativos resolvem-se contra a raiz e os
 *   absolutos ficam por resolver — e o que os testes usam, com valores fixos quando precisam.
 * @returns {string|null} o rotulo da condicao que nega, ou `null` se o comando passa
 */
export function porqueAltera(texto, ctx = {}) {
  // Uma excepcao a analisar NEGA. Sem isto caia no `catch` do hook, que sai com 0 — e permitia o
  // comando inteiro, o `git push --force` incluido (8000 `$(` aninhados, leitura do c004591).
  try {
    return julga(texto, ctx);
  } catch {
    return nega("erro-ao-analisar");
  }
}

/** Substituicoes a mais num comando que toca a fronteira: nega sem as abrir. Nenhum comando de
 *  trabalho chega perto, e abrir cada uma custa o texto que a envolve — milhares aninhadas sao
 *  segundos, e um hook lento e um hook que se desliga. */
const MAX_SUBSTITUICOES = 64;

function julga(texto, ctx) {
  const visivel = normalizaCaminhos(semCitacoes(texto), ctx);
  const opaco = OPACO.test(texto);
  const inline = CODIGO_INLINE.test(texto);

  // A fronteira so aparece DENTRO de aspas ou de um heredoc: e texto. Excepto quando o
  // comando executa esse texto (`eval`, `sh -c`) ou o passa a um interpretador (`node -e`),
  // que foi como o `node -e "...writeFileSync('.claude/settings.json')..."` se escondia.
  if (!FRONTEIRA.test(visivel)) {
    if (!FRONTEIRA.test(texto)) return null;
    // A crase EXECUTA fora de aspas simples e de heredoc: `` cd `rm -rf <fronteira>` `` passava. So um
    // CAMINHO SOZINHO (o markdown de uma mensagem de commit) fica isento — `` `<f>; rm -rf <f>` `` nao.
    const crases = (texto.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?^[\t ]*\2[\t ]*$/gm, " ")
      .replace(/'(?:[^'\\]|\\.)*'/g, " ").match(/`[^`]*`/g) ?? []).some((c) => {
      const dentro = c.slice(1, -1).trim();
      return FRONTEIRA.test(` ${dentro}`) && !/^[^\s;&|<>`$()]+$/.test(dentro);
    });
    return opaco || inline || crases ? nega("citado-mas-executado") : null;
  }

  // Por SEGMENTO, e com as citacoes ja removidas — senao um `|` dentro de aspas parte o
  // comando e o "verbo" do segmento seguinte e um pedaco do padrao de procura.
  // Antes do `tocam`: o segmento do `cd` sai dele, e e o `cd` que leva o corpo para a fronteira.
  if (ADIADA.test(visivel)) return nega("execucao-adiada");
  const segmentos = pedacosDe(visivel).pedacos.filter((p) => typeof p !== "string").map(([a, b]) => visivel.slice(a, b));
  // Um `cd`/`pushd`/`popd` so muda de directorio: o que corre DEPOIS ja e julgado com o directorio
  // novo (`normalizaCaminhos`, #185). Contado aqui, era o primeiro segmento a tocar e, quando o
  // verbo so se julgava no primeiro, `cd .claude/hooks && cp x y.mjs` passava pelo `cd`.
  const tocam = segmentos.filter((s) => FRONTEIRA.test(s) && !soMudaDeDirectorio(s));
  if (tocam.length === 0) return null;

  const alvo = tocam.join("\n");

  // UMA SO NORMALIZACAO, e este e o ponto do ticket. Com duas — `basename` no verbo, texto cru
  // nas regex ancoradas — `sudo /usr/bin/git rm <alvo>` passava: o verbo era `git` (que esta na
  // LEITURA) e o `^git` via `/usr/bin/git`. Um corpus GERADO contou **270** comandos assim, e
  // sao UM defeito multiplicado por {cabecas consumidas} x {formas de invocar por caminho}.
  // O corpus escrito a mao contara 5, porque tinha as duas metades em grupos separados e nunca
  // o produto das duas.
  // Os parenteses de uma subshell nao sao parte do verbo: `(cd X && ...)` dava o verbo `(cd`.
  // E o que corre DENTRO de cada `$(...)`/`<(...)` de um segmento que toca e julgado como um
  // segmento seu: `cat <f> $(rm -rf <f>)` passava pelo `cat` (ja no `main`). Pelo criterio do
  // marcador: um interior que nao escreve (`$(ls | sort)`, `$(date)`) nao conta.
  if ((alvo.match(/[$<>]\(/g) ?? []).length > MAX_SUBSTITUICOES) return nega("substituicoes-demais");
  const interiores = tocam
    .flatMap(substituicoes)
    .flatMap((i) => pedacosDe(i).pedacos.filter((p) => typeof p !== "string").map(([a, b]) => i.slice(a, b)))
    .map((s) => [s, resto(s.replace(/[()]/g, " "))])
    .filter(([s, toks]) => toks.length && levaMarcador(s, toks));
  const semCabeca = [...tocam.map((s) => resto(s.replace(/[()]/g, " "))), ...interiores.map(([, toks]) => toks)];
  const normaliza = (toks) =>
    toks.length === 0 ? "" : [toks[0].replace(/^.*\//, ""), ...toks.slice(1)].join(" ");
  const restoTexto = semCabeca.map(normaliza).join("\n");
  // O verbo de CADA segmento que toca, e nao so o do primeiro: `cat <f>; rm <f>` passava pela leitura
  // a frente, e o #185, ao fazer tocar mais leituras (a pasta sem barra, os caminhos reescritos),
  // alargou isso a `ls .claude/hooks; rm -rf .claude/hooks/`. O primeiro que nao le e o que nega.
  // A barra FINAL sai antes do nome base: `D=.claude/` (a pasta-mae reescrita) dava um rotulo vazio.
  const verbo = (t) => (t[0] ?? "").replace(/\/+$/, "").replace(/^.*\//, "");
  const primeiro = semCabeca.map(verbo).find((v) => !LEITURA.has(v)) ?? verbo(semCabeca[0]);
  const editaNoSitio = /\b(?:sed|perl|ruby|python3?)\b[^\n]*\s-[a-zA-Z]*i\b/.test(alvo);
  // O `inline` avalia-se sobre os segmentos que TOCAM a fronteira, e nao sobre o comando
  // inteiro. Duas leituras legitimas eram negadas por causa do alcance largo, as duas medidas
  // numa sessao real e diagnosticadas so porque a parte 1 (#101) pos o rotulo na mensagem:
  //
  //   `node <ficheiro>; grep -c x y`  — o `-c` do GREP era lido como sendo do `node`, porque
  //     o regex corre sobre a linha toda. As flags sao comuns: `grep -c`, `sort -c`, `cp -p`,
  //     `git log -p`.
  //   `cat <fronteira>; node -e "..."` — um interpretador inline noutro segmento, que nao toca
  //     a fronteira nenhuma, negava o `cat`.
  //
  // O `opaco` NAO se alinha, e a assimetria e deliberada. Com `|`, o segmento que toca a
  // fronteira **alimenta** o consumidor a jusante: em `ls <fronteira> | xargs rm`, quem apaga
  // e o `xargs`, que nao tem o caminho escrito. Alinhar os dois passava esse comando a
  // PERMITIDO — apagava a pasta dos hooks inteira. Foi uma leitura independente a dar o
  // contra-exemplo, e os casos dele sao os primeiros do `tests-fronteira-alcance.mjs`.
  const inlineNoAlvo = CODIGO_INLINE.test(alvo);
  // Uma allowlist por BINARIO e grossa quando o binario tem sub-verbos que apagam: `git rm`,
  // `git restore` e `git checkout --` passavam por `git` estar na lista. Medido ao remover um
  // hook obsoleto, minutos depois de escrever esta verificacao.
  // Contra o `restoTexto` e nao contra o `alvo`: a ancora `^git` tem de ver o verbo, nao a
  // cabeca. E com `/m`, porque o `restoTexto` junta TODOS os segmentos que tocam — o que fecha,
  // de caminho, `cat .claude/settings.json && git rm <alvo>`, onde uma leitura a frente
  // desarmava o verbo.
  const gitQueEscreve = /^git\b[^\n]*\s(?:rm|mv|restore|checkout|clean|stash)\b/m.test(restoTexto.trim());
  // O `find` esta na LEITURA e destroi — e, ao contrario do `git`, nao tinha verificacao de
  // sub-verbo nenhuma. O espelho correcto NAO e "`-exec` nega": isso negava
  // `find <f> -name '*.mjs' -exec grep -l X {} +`, que e leitura pura e trabalho normal, e um
  // guard que nega trabalho normal e contornado. O sub-verbo julga-se contra a MESMA `LEITURA`.
  //
  // Linha a linha, e nao um `/gm` ancorado: com `^find` e `g`, so o PRIMEIRO `-exec` de cada
  // linha era capturado, e `find <alvo> -exec grep -l X {} + -exec rm {} +` passava. E o mesmo
  // anti-padrao que a linha acima fecha para o `git` — uma leitura a frente a desarmar a
  // escrita — e reintroduzi-lo aqui no mesmo commit seria comico.
  //
  // E sobre o comando VISIVEL inteiro, nao sobre os segmentos: o `;` e separador no `split`,
  // logo `find <alvo> -exec grep -l X {} \; -exec rm {} \;` ficava com o segundo `-exec` fora
  // do `restoTexto` e passava. A forma `\;` e a mais portavel das duas, e reabria exactamente o
  // padrao — uma leitura a frente a desarmar a escrita — que a linha acima fecha para o `git`.
  // Apanhado pelo leitor independente (Fase 4) depois de eu escrever no comentario que
  // reintroduzi-lo "seria comico".
  const findQueEscreve =
    semCabeca.some((toks) => toks[0]?.replace(/^.*\//, "") === "find") &&
    (/\s-(?:delete|fprint[f0]?|fls)\b/.test(visivel) ||
      [...visivel.matchAll(/\s-(?:exec|execdir|ok|okdir)\s+(\S+)/g)].some((m) => {
        const sub = m[1].replace(/^.*\//, "");
        // O sub-verbo julga-se pela MESMA allowlist — mas `git` e `node` estao nela e escrevem
        // com sub-verbo proprio. `find <alvo> -exec git rm {} +` passava por `git` ser leitura.
        if (!LEITURA.has(sub)) return true;
        const resto = m.input.slice(m.index + m[0].length);
        return sub === "git"
          ? /^\s*(?:rm|mv|restore|checkout|clean|stash|config|apply|reset)\b/.test(resto)
          : sub === "node" && /^\s*(?:-e|-p|--eval|--print|-r|--require)\b/.test(resto);
      }));
  // Com DESCRITOR (#206): `2> <fronteira>`, `1>`, `2>>` e `>|` escrevem. O `[^>\d]` antigo existia para
  // nao confundir o `2>&1` — que continua a nao casar, porque depois do `&` vem um digito e nao um caminho.
  // O `>!` e o `>|` do zsh (o shell do Bash tool) tambem escrevem por cima do `noclobber`, e o
  // `>&!`/`>>&|` tambem (leitura do 81e5942).
  const redireciona = /(?:^|[^>])>{1,2}&?[|!]?&?\s*(?:\.\/)?(?:\.claude|\.githooks)\//.test(alvo) || /\btee\b/.test(alvo);

  // A ORDEM E A DA DECISAO, nao a de importancia: quem le quer saber o que disparou PRIMEIRO,
  // porque e essa a condicao a relaxar se a negacao for indevida. Varias podem ser verdade ao
  // mesmo tempo, e reporta-las todas dava uma lista sem accao.
  if (!LEITURA.has(primeiro)) return nega(`verbo-nao-e-leitura:${primeiro}`);
  if (editaNoSitio) return nega("edita-no-sitio");
  if (inlineNoAlvo) return nega("codigo-inline");
  if (opaco) return nega("wrapper-opaco");
  if (redireciona) return nega("redireciona");
  if (gitQueEscreve) return nega("git-que-escreve");
  if (findQueEscreve) return nega("find-que-escreve");
  return null;
}

/**
 * @param {string} texto o comando completo
 * @returns {boolean} true se o comando ESCREVE na fronteira e deve ser negado
 */
export const alteraFronteira = (texto, ctx) => porqueAltera(texto, ctx) !== null;

/** A razao, escrita uma vez e usada pelo hook e pelos testes. */
export const RAZAO_FRONTEIRA =
  "A configuracao de fronteira (`.claude/settings.json`, `.claude/hooks/`, `.githooks/`) nao " +
  "se altera por `Bash`. O `deny` do settings so cobre `Edit`/`Write`, logo esta verificacao " +
  "existe para fechar o resto — um agente que reescreva a propria fronteira deixa a sessao " +
  "seguinte sem nenhuma. Editar com a ferramenta `Edit` (que pede aprovacao para os hooks e " +
  "recusa o settings), ou a mao, fora do agente.";
