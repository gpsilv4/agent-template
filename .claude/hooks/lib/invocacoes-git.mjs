/**
 * As invocacoes do `git` de um comando, cada uma com o seu verbo — {{PROJECT_NAME}}
 *
 * O guard dos branches (`guard-protected-branch.mjs`) decide; isto so RECONHECE: parte o comando em comandos
 * simples (`segmentos`), consome os wrappers, as palavras de shell, as flags e as atribuicoes ate ao `git`, e
 * salta as flags globais ate ao verbo (`invocacoes`). Um verbo que nao se determina vem `null`, e o guard conta-o
 * como NAO seguro.
 *
 * Vivia no `guard-protected-branch.mjs` ate ao #580, que o separou da decisao para os dois ficarem com folga do
 * Guard 17. Os blocos vieram sem mudanca, menos o `export` do `limpo` e do `invocacoes` (o guard usa-os).
 */
import { ATRIBUICAO_LARGA, nomeDoComando } from "./fronteira-dados.mjs";

/** Wrappers que se consomem antes do comando verdadeiro. Esta lista e a que substitui a
 *  regex de posicao de comando: cada entrada em falta era um bypass. */
const WRAPPERS = new Set([
  "sudo", "env", "eval", "command", "builtin", "exec", "time", "nohup", "setsid", "stdbuf",
  "nice", "ionice", "xargs", "timeout", "doas", "script", "unbuffer", "watch", "sh", "bash",
  "zsh", "dash", "ksh",
  // #600: o `su`/`runuser` (com `-c`, um comando numa shell). Fora daqui, o ciclo parava neles e o git do `-c` nao se via.
  "su", "runuser",
]);
/** Depois de um `su`/`runuser` (#600): o `-c` colado ao valor (`-c'git push'` da `-cgit`; `-lcgit`) e o `--command=V`
 *  (e os prefixos, `--co=V`, `--se=V`) partem-se em flag + valor. PREGUICOSO, no 1.o `c` do grupo. */
const SU_C_COLADO = /^(-[A-Za-z]*?c)(.+)$/;
const SU_C_LONGO = /^(--(?:c|se)[\w-]*)=(.+)$/;

/** Palavras-chave de shell: nunca sao o comando, logo saltam-se. Sem elas, `if ...; then
 *  git commit`, `for ...; do git push` e `! git commit` escapavam — tres dos bypasses. */
const PALAVRAS_SHELL = new Set([
  "if", "then", "else", "elif", "fi", "do", "done", "while", "until", "for", "in", "case",
  "esac", "select", "function", "!", "[[", "[", "coproc",
]);

/** Valor de opcao de um wrapper: `timeout 5`, `nice -n 0`, `watch -n 2`. Sem isto o `5` do
 *  `timeout 5 git push` parava o consumo e a invocacao passava por nao-git. */
const VALOR_DE_WRAPPER = /^\d+[smhd]?$/;

/** Flags globais do `git` que consomem o argumento seguinte. */
const GIT_FLAGS_COM_VALOR = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"]);

/** Um token sem aspas nem escapes: `'git'`, `"git"` e `g\i\t` sao todos `git`. E o que
 *  desmonta a ofuscacao por aspas (`git comm""it`) sem precisar de a prever. */
export const limpo = (t) => t.replace(/\$(?=["'])/g, "").replace(/["'\\]/g, "");

/** Token opaco que substitui uma substituicao de comando ou uma redireção. Nao e um
 *  separador: se `$(` virasse newline, `git $(echo commit) -m x` produzia o segmento `git`
 *  sozinho, o verbo ficava nulo e o comando era declarado inofensivo — bypass medido. Como
 *  token, o verbo passa a ser DESCONHECIDO e falha fechado. */
const OPACO = "\u0000opaco\u0000";

/** A primeira palavra do texto e um wrapper que volta a interpretar o que recebe? Se sim, o
 *  que esta dentro de aspas E codigo e tem de partir; se nao, e um argumento literal. */
function comandoOpaco(txt, equals = false) {
  const primeira = (txt.trim().split(/\s+/)[0] ?? "").replace(/["'\\]/g, "");
  return WRAPPERS_OPACOS.has(equals ? nomeDoComando(primeira) : primeira.replace(/^.*\//, ""));
}

/** Para cada indice: cai dentro de um par de aspas aberto? UMA passagem (#224): perguntar indice a
 *  indice relia do inicio, e 200k parenteses eram 60 s — e um hook que excede o timeout PERMITE. */
function zonasCitadas(txt) {
  const z = new Uint8Array(txt.length + 1);
  let aspa = null;
  for (let k = 0; k < txt.length; k++) {
    z[k] = aspa !== null;
    const c = txt[k];
    if (c === "\\") { z[k + 1] = z[k]; k++; continue; } // a barra escapa o seguinte
    if (aspa) { if (c === aspa) aspa = null; } else if (c === "'" || c === '"') aspa = c;
  }
  return z;
}

/** Parte o comando em comandos simples. Todo o separador de shell conta — incluindo
 *  `$(`, backticks, `{`/`}` e `!`, que eram bypasses na versao anterior. */
function segmentos(texto, equals = false) {
  // Uma substituicao de comando e DUAS coisas ao mesmo tempo, e a versao anterior tratou-a
  // como uma so:
  //   - o **interior** e um comando que corre (`echo $(git commit)` faz um commit), logo tem
  //     de ser varrido como segmento proprio;
  //   - a **posicao** onde o resultado aterra fica desconhecida (`git $(echo commit) -m x`),
  //     logo o verbo la e opaco e tem de falhar fechado.
  // Tratar `$(` como separador dava a primeira e perdia a segunda; troca-lo por um token
  // opaco dava a segunda e perdia a primeira. Ambas as versoes tiveram bypasses medidos.
  const internos = [];
  let t = texto;
  for (const re of [/\$\(([^)]*)\)/g, /`([^`]*)`/g]) {
    t = t.replace(re, (_, dentro) => {
      internos.push(dentro);
      return ` ${OPACO} `;
    });
  }
  const partir = (x0) => {
    const x = x0
      // Redireções: `>out.txt git commit` e forma valida de shell, e partir no `>` fazia o
      // segmento comecar em `out.txt` — nao havia invocacao nenhuma. O destino e consumido.
      //
      // O alvo NAO pode ser `\S*`: `\S` nao para nos separadores, logo `2>&1; git commit`
      // era consumido INTEIRO (incluindo o `;`) e os dois comandos fundiam-se num so, cujo
      // verbo era `make`/`npm`. Cinco bypasses medidos, entre eles um `push --force`. O alvo
      // de uma redireção nunca contem um separador de shell — enumera-los aqui e o que
      // impede o consumo de atravessar a fronteira do comando.
      .replace(/\d?[<>]{1,2}&?\s*[^\s;&|(){}<>]*/g, " ");
    const [z1, opaco] = [zonasCitadas(x), comandoOpaco(x, equals)]; // uma vez por texto, nao por separador
    const y = x
      // Separadores. `;`, `&`, `|` e newline partem sempre — EXCEPTO dentro de aspas quando o
      // comando nao e um wrapper opaco: `eval "a; git commit"` parte (o shell reinterpreta a
      // string); `echo "a; git push --force"` e `rg "build && git push --force" docs/` nao — o
      // texto e um ARGUMENTO, e nega-los bloqueava leitura (medido tres vezes numa sessao).
      // `(`/`)`/`{`/`}` so partem fora de aspas: `echo "(git push --force)"` e
      // `python3 -c "print('git push --force')"` eram NEGADOS (medido: dois de um revisor).
      .replace(/[;&|\n]+/g, (m, i) => (z1[i] && !opaco ? m : "\n"));
    const z2 = zonasCitadas(y);
    return y.replace(/[(){}]/g, (m, i) => (z2[i] ? m : "\n")).split("\n").map((seg) => seg.trim()).filter(Boolean);
  };
  return [...partir(t), ...internos.flatMap(partir)];
}

/** As invocacoes de `git` de um comando, cada uma com o seu verbo (ou `null` se nao se
 *  conseguir determinar — e um `null` conta como NAO seguro).
 *  `equals` (#567): le o nome com o EQUALS do zsh (`=git`, `=sudo`, `=sh`). E a SEGUNDA leitura — quem a pede junta-a a
 *  do `main` (o guard faz a uniao): trocar uma pela outra herdava os buracos do `git` que o `main` negava por acaso. */
export function invocacoes(texto, { equals = false } = {}) {
  const nome = (t) => (equals ? nomeDoComando(t) : t.replace(/^.*\//, ""));
  const out = [];
  for (const seg of segmentos(texto, equals)) {
    let toks = seg.split(/\s+/).map(limpo).filter(Boolean);
    // Consumir wrappers, palavras-chave de shell, flags e atribuicoes ate ao comando real.
    let viuWrapper = false;
    let viuWrapperOpaco = false;
    let anteriorEraFlag = false;
    // #600: depois de um `su`/`runuser`, e se o UTILIZADOR (uma palavra so, que nao e flag nem valor dela) ja saiu.
    let depoisDeSu = false;
    let utilizador = false;
    for (;;) {
      if (depoisDeSu && toks[0]) {
        const m = SU_C_COLADO.exec(toks[0]) ?? SU_C_LONGO.exec(toks[0]);
        if (m) toks = [m[1], m[2], ...toks.slice(1)];
      }
      const t = toks[0];
      if (!t) break;
      const base = nome(t);
      // Chegar ao `git` para SEMPRE o consumo. Sem esta linha primeiro, o salto do valor de
      // flag comia o proprio `git`: `sh -c "git commit"`, `bash -c "git push"` e
      // `env GIT_DIR=.git git commit` deixaram de ser detetados — tres regressoes que a
      // tabela de bypasses apanhou no momento em que eu as introduzi.
      if (base === "git") break;
      if (ATRIBUICAO_LARGA.test(t) || t.startsWith("-")) { toks = toks.slice(1); anteriorEraFlag = true; continue; }
      // O VALOR de uma atribuicao com espacos: `GIT_AUTHOR_DATE="2020-01-01 00:00" git commit`
      // parte-se em tokens e o `00:00` nao e atribuicao, nem flag, nem wrapper — o ciclo
      // quebrava ali e a invocacao do git nunca era vista. Medido a passar, e nao e ofuscacao:
      // e a forma normal de escrever. Depois de uma atribuicao, o token seguinte so continua o
      // valor se **nao** houver `=` nele e ainda nao tivermos chegado ao `git`.
      if (anteriorEraFlag && !t.includes("=") && !WRAPPERS.has(base) && !PALAVRAS_SHELL.has(t)) {
        toks = toks.slice(1);
        // Repor: consome-se **um** token de valor, nao uma cadeia. Sem isto, `sudo -u me echo
        // git commit` engolia tambem o `echo` e passava a ser lido como uma invocacao do git —
        // um falso positivo que a tabela `LEGITIMOS` apanhou no momento em que o introduzi.
        anteriorEraFlag = false;
        continue;
      }
      if (PALAVRAS_SHELL.has(t)) { toks = toks.slice(1); anteriorEraFlag = false; continue; }
      if (WRAPPERS.has(base)) {
        toks = toks.slice(1);
        viuWrapper = true;
        if (WRAPPERS_OPACOS.has(base) || OPACOS_SO_NA_INVOCACAO.has(base)) viuWrapperOpaco = true;
        if (base === "su" || base === "runuser") [depoisDeSu, utilizador] = [true, false];
        anteriorEraFlag = false;
        continue;
      }
      // O utilizador do `su root -c '...'`: uma palavra, depois do valor das flags (`su -g wheel root -c`).
      if (depoisDeSu && !utilizador && !anteriorEraFlag) {
        toks = toks.slice(1);
        utilizador = true;
        continue;
      }
      // O valor de uma opcao de wrapper nem sempre e um numero: `sudo -u me git commit`,
      // `env -u VAR git commit`, `timeout -s KILL 5 git push`, `xargs -d '\n' git commit`.
      // A versao anterior so aceitava `\d+[smhd]?`, logo o token parava o varrimento e a
      // invocacao nunca era vista — quatro bypasses medidos. Depois de uma flag consumida,
      // o token seguinte e o valor dela.
      if (viuWrapper && (anteriorEraFlag || VALOR_DE_WRAPPER.test(t))) {
        toks = toks.slice(1);
        anteriorEraFlag = false;
        continue;
      }
      break;
    }
    if (!toks.length) continue;
    if (nome(toks[0]) !== "git") continue; // nao e uma invocacao do git
    // Saltar as flags globais do git ate ao verbo.
    let i = 1;
    while (i < toks.length && toks[i].startsWith("-")) {
      const f = toks[i].split("=")[0];
      i += GIT_FLAGS_COM_VALOR.has(f) && !toks[i].includes("=") ? 2 : 1;
    }
    out.push({ verbo: i < toks.length ? toks[i] : null, args: toks.slice(i + 1), seg, viaWrapper: viuWrapper, viaWrapperOpaco: viuWrapperOpaco });
  }
  return out;
}

/** Wrappers cujo comando NAO esta visivel no texto: vem do stdin (`xargs`) ou de uma string
 *  que o shell volta a interpretar (`eval`, `sh -c`). Para estes, o que se ve nao e o que
 *  corre, logo falha fechado. Os outros (`env`, `timeout`, `sudo`, `command`, `nice`) passam
 *  o comando como ARGUMENTOS — o texto e fiavel e `env git --version` nao esconde nada. */
const WRAPPERS_OPACOS = new Set(["xargs", "eval", "sh", "bash", "zsh", "dash", "ksh", "ssh", "su", "doas"]);
/** O `runuser` corre o `-c` numa shell (#600), e a invocacao conta como vinda de um wrapper opaco — mas NAO entra no
 *  `WRAPPERS_OPACOS`: o `comandoOpaco` decide pela 1.a palavra do texto INTEIRO, e com o `runuser` la o `;` citado de um git
 *  SEGUINTE partia (`runuser -u me true; git push -o "a;b" origin x --force` passava a deixar: o leitor adversarial do
 *  #600; o buraco do `su`, que ja la estava, e o #605). */
const OPACOS_SO_NA_INVOCACAO = new Set(["runuser"]);
