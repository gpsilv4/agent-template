#!/usr/bin/env node
/**
 * Hook: negar git destrutivo num branch protegido — {{PROJECT_NAME}}
 *
 * **So-Claude Code.** Ligado em `.claude/settings.json` (`PreToolUse` / `Bash`). As outras
 * ferramentas ignoram esta pasta; para elas a regra vive em prosa em `process-rules.md`
 * ("Regra de Branch") e o CI e a rede final.
 *
 * PORQUE EXISTE: o `CLAUDE.md` deste template diz "prosa nao e garantia". O modelo pode
 * esquecer uma regra do `CLAUDE.md`; um hook nao esquece. Isto fecha o caso mais caro de
 * esquecimento — commit ou push direto no branch principal, e force-push em qualquer sitio.
 *
 * ALLOWLIST, NAO BLOCKLIST. A primeira versao procurava os verbos PERIGOSOS
 * (`commit|push|merge|rebase|reset --hard`) com uma regex de posicao de comando. Uma leitura
 * independente encontrou 23 formas de a contornar, e a medicao completa deu **28** — `eval
 * git commit`, `sh -c "..."`,
 * backticks, `/usr/bin/git`, `xargs git`, `{ }`, `if`, `!`, e quatro criadas pela propria
 * correcao anterior (retirar as aspas fazia `eval "git commit"` escapar). A licao nao e que
 * faltavam padroes: e que a lista de formas perigosas **nao tem fim**, logo uma blocklist
 * falha ABERTA. A lista de verbos **seguros** e finita e enumeravel, logo o VERBO passa a
 * falhar fechado: num branch protegido, o verbo que nao se reconhece como seguro e negado.
 *
 * O QUE CONTINUA A FALHAR ABERTO, e nao vale a pena esconder: para chegar ao verbo e preciso
 * primeiro reconhecer que o segmento e uma invocacao do `git`, e isso depende da lista
 * `WRAPPERS`, que **e** uma blocklist. Passam `flock l git commit`, `su - u -c "git commit"`,
 * `ssh host git commit`, `GIT_PAGER='git commit' git log` e `git -c core.pager='git commit'
 * log`. Fechar isto exigiria negar qualquer `git` em qualquer posicao e recuperar depois os
 * `echo`/`grep` legitimos — mais falsos positivos do que valor, para um modelo de ameaca que
 * e a distracao. **So o verbo falha fechado**; a posicao de comando, nao.
 *
 * O QUE ISTO NAO E: nao e uma fronteira de seguranca. O modelo de ameaca e a **distracao** —
 * quem esquece que esta em `main` escreve `git commit -m "..."` na forma simples. Quem quiser
 * contornar consegue (`eval "$VAR"`, um script noutro ficheiro), e nao vale a pena finge-lo.
 * E uma barreira contra o descuido.
 *
 * O DETALHE QUE O TORNA CORRETO: o branch alvo deriva do `cwd` do payload **e de todos os
 * `-C <dir>`, `--git-dir`, `cd <dir>` e `pushd <dir>` do comando**. Ler so o texto do comando
 * deixava passar um `cd sub` numa chamada e um `git commit` na seguinte. Sem nenhuma pista de
 * diretorio, cai no `cwd` do proprio hook — antes devolvia lista vazia e **permitia**.
 *
 * CONTRATO DE SAIDA: sai `0` em tudo excepto na negacao explicita. Um hook avariado **nunca**
 * bloqueia trabalho legitimo; um hook que rebenta a decidir para todos e pior que nao existir.
 */

import { execFileSync } from "child_process";
import { readFileSync } from "fs";
// As tabelas de verbos vivem a parte: sao DADOS, e mante-las aqui punha o hook acima do teto
// do Guard 17 (que so deixa encolher). Acrescentar um verbo faz-se la.
import { SEGUROS, FORMAS_INSEGURAS, FORMA_EXIGIDA } from "./lib/verbos-git.mjs";
import { alteraFronteira, RAZAO_FRONTEIRA } from "./lib/fronteira.mjs";

/** Branches onde nao se comita nem se faz push diretamente. Adaptar no bootstrap. */
const PROTEGIDOS_LISTA = ["main", "master", "develop"];
/** Comparacao NORMALIZADA, nao igualdade exacta de `Set`. Num filesystem case-insensitive
 *  (APFS/macOS e NTFS, ambos por defeito) `refs/heads/MAIN` e o mesmo ficheiro que
 *  `refs/heads/main` — logo um `symbolic-ref` para `MAIN` punha o git a reportar um branch
 *  que a lista nao reconhecia, e tudo passava a ser permitido. Medido: `main` avancou.
 *  Tambem se corta `refs/heads/` a frente, que e como o branch aparece em algumas formas. */
const PROTEGIDOS = new Set(PROTEGIDOS_LISTA.map((b) => b.toLowerCase()));
const ehProtegido = (br) =>
  typeof br === "string" && PROTEGIDOS.has(br.replace(/^refs\/heads\//, "").toLowerCase());

/** Sub-verbos destrutivos. Comparados **so contra o primeiro argumento**, porque os
 *  sub-verbos do git sao posicionais: comparar contra qualquer argumento negava
 *  `git stash push -m "apply later"` (a palavra `apply` na mensagem),
 *  `git remote add upstream <url>`, `git remote prune origin` e
 *  `git submodule update --init` — quatro falsos positivos medidos. E `stash apply`,
 *  `remote add`, `remote prune`, `submodule update` e `notes add` saem da lista: restauram ou
 *  acrescentam, nao destroem. */
const SUBVERBOS_INSEGUROS = {
  stash: /^(?:drop|clear)$/,
  reflog: /^(?:expire|delete)$/,
  remote: /^(?:remove|rm|set-url|rename)$/,
  worktree: /^(?:remove|move)$/,
  // `foreach` corre um comando arbitrario em cada submodulo (`git submodule foreach 'git
  // push origin main'`) — a mesma classe que o `difftool -x` e o `bisect run`, que ja
  // estavam fora de `SEGUROS`. Medido a passar.
  submodule: /^(?:deinit|set-url|foreach)$/,
  notes: /^(?:remove|prune)$/,
};

/** Flags agrupadas (`-Df`) e aderentes (`-Cmain`) expandidas, para as comparacoes acima
 *  poderem ser por igualdade. Sem isto `git branch -Df old`, `git switch -Cmain` e
 *  `git tag -df v1` escapavam — e o `switch -C` e precisamente o caso que a lista existe
 *  para fechar. O parse-options do git aceita as duas formas. */
function normalizaFlags(args) {
  const out = [];
  for (const a of args) {
    if (a.startsWith("--")) { out.push(a); continue; }
    const agrupadas = /^-([a-zA-Z]{2,})$/.exec(a);
    if (agrupadas) { for (const c of agrupadas[1]) out.push("-" + c); continue; }
    const aderente = /^-([a-zA-Z])(.+)$/.exec(a);
    if (aderente) { out.push("-" + aderente[1]); out.push(aderente[2]); continue; }
    out.push(a);
  }
  return out;
}

// A tabela `FORMA_EXIGIDA` vive em `lib/verbos-git.mjs`: e politica (que formas de `pull` e
// `push` sao aceitaveis num branch protegido), nao motor. O hook injecta-lhe o `ehProtegido`
// e o `refsApagados`, que dependem da lista de branches que cada projeto adapta no bootstrap.

/** Wrappers que se consomem antes do comando verdadeiro. Esta lista e a que substitui a
 *  regex de posicao de comando: cada entrada em falta era um bypass. */
const WRAPPERS = new Set([
  "sudo", "env", "eval", "command", "builtin", "exec", "time", "nohup", "setsid", "stdbuf",
  "nice", "ionice", "xargs", "timeout", "doas", "script", "unbuffer", "watch", "sh", "bash",
  "zsh", "dash", "ksh",
]);

/** Palavras-chave de shell: nunca sao o comando, logo saltam-se. Sem elas, `if ...; then
 *  git commit`, `for ...; do git push` e `! git commit` escapavam — tres dos bypasses. */
const PALAVRAS_SHELL = new Set([
  "if", "then", "else", "elif", "fi", "do", "done", "while", "until", "for", "in", "case",
  "esac", "select", "function", "!", "[[", "[", "coproc",
]);

/** Valor de opcao de um wrapper: `timeout 5`, `nice -n 0`, `watch -n 2`. Sem isto o `5` do
 *  `timeout 5 git push` parava o consumo e a invocacao passava por nao-git. */
const VALOR_DE_WRAPPER = /^\d+[smhd]?$/;

/** Flags de SUB-COMANDO que consomem o argumento seguinte. Sem esta lista, o valor de uma
 *  flag era lido como sub-verbo e o sub-verbo verdadeiro escapava (`git notes --ref x
 *  remove`). So precisa de cobrir os sub-comandos que tem entrada em `SUBVERBOS_INSEGUROS`. */
const SUBVERBO_FLAGS_COM_VALOR = new Set([
  "--ref", "-m", "--message", "-F", "--file", "-C", "--reuse-message", "-c", "--reedit-message",
  "-n", "--expire", "--expire-unreachable", "--format", "--pretty",
]);

/** Flags globais do `git` que consomem o argumento seguinte. */
const GIT_FLAGS_COM_VALOR = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"]);

function ler() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

/** Um token sem aspas nem escapes: `'git'`, `"git"` e `g\i\t` sao todos `git`. E o que
 *  desmonta a ofuscacao por aspas (`git comm""it`) sem precisar de a prever. */
const limpo = (t) => t.replace(/\$(?=["'])/g, "").replace(/["'\\]/g, "");

/** Parte o comando em comandos simples. Todo o separador de shell conta — incluindo
 *  `$(`, backticks, `{`/`}` e `!`, que eram bypasses na versao anterior. */
/** Token opaco que substitui uma substituicao de comando ou uma redireção. Nao e um
 *  separador: se `$(` virasse newline, `git $(echo commit) -m x` produzia o segmento `git`
 *  sozinho, o verbo ficava nulo e o comando era declarado inofensivo — bypass medido. Como
 *  token, o verbo passa a ser DESCONHECIDO e falha fechado. */
const OPACO = "\u0000opaco\u0000";

/** O indice `i` cai dentro de um par de aspas ainda aberto? Varre do inicio, porque o estado
 *  de aspas nao e local. Uma barra invertida escapa o caractere seguinte. */
/** A primeira palavra do texto e um wrapper que volta a interpretar o que recebe? Se sim, o
 *  que esta dentro de aspas E codigo e tem de partir; se nao, e um argumento literal. */
function comandoOpaco(txt) {
  const primeira = (txt.trim().split(/\s+/)[0] ?? "").replace(/["'\\]/g, "").replace(/^.*\//, "");
  return WRAPPERS_OPACOS.has(primeira);
}

function dentroDeAspas(txt, i) {
  let aspa = null;
  for (let k = 0; k < i; k++) {
    const c = txt[k];
    if (c === "\\") { k++; continue; }
    if (aspa) { if (c === aspa) aspa = null; }
    else if (c === "'" || c === '"') aspa = c;
  }
  return aspa !== null;
}

function segmentos(texto) {
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
  const partir = (x) =>
    x
      // Redireções: `>out.txt git commit` e forma valida de shell, e partir no `>` fazia o
      // segmento comecar em `out.txt` — nao havia invocacao nenhuma. O destino e consumido.
      //
      // O alvo NAO pode ser `\S*`: `\S` nao para nos separadores, logo `2>&1; git commit`
      // era consumido INTEIRO (incluindo o `;`) e os dois comandos fundiam-se num so, cujo
      // verbo era `make`/`npm`. Cinco bypasses medidos, entre eles um `push --force`. O alvo
      // de uma redireção nunca contem um separador de shell — enumera-los aqui e o que
      // impede o consumo de atravessar a fronteira do comando.
      .replace(/\d?[<>]{1,2}&?\s*[^\s;&|(){}<>]*/g, " ")
      // Separadores. `;`, `&`, `|` e newline partem SEMPRE, mesmo dentro de aspas: e o que
      // mantem `eval "a; git commit"` negado, e falhar fechado ali vale mais do que a
      // precisao. Mas `(`/`)`/`{`/`}` **so partem fora de aspas** — tratá-los como separador
      // dentro de uma string fazia `echo "(git push --force)"` e
      // `python3 -c "print('git push --force')"` serem NEGADOS, sem branch nenhum onde
      // passassem (o force-push e avaliado antes do branch). Medido: bloqueou duas chamadas
      // legitimas de um revisor. Negar trabalho legitimo custa tanto como deixar passar.
      // `;`, `&`, `|` e newline partem sempre — EXCEPTO dentro de aspas quando o comando que
      // as abre nao e um wrapper opaco. `eval "a; git commit"` tem de partir (o shell volta a
      // interpretar a string); `echo "a; git push --force"` e
      // `rg "build && git push --force" docs/` nao — ali o texto e um ARGUMENTO, nunca corre,
      // e nega-los bloqueia trabalho de leitura. Medido tres vezes numa so sessao, incluindo
      // um `grep` cuja string de pesquisa citava um comando.
      .replace(/[;&|\n]+/g, (m, i, txt) => (dentroDeAspas(txt, i) && !comandoOpaco(txt) ? m : "\n"))
      .replace(/[(){}]/g, (m, i, txt) => (dentroDeAspas(txt, i) ? m : "\n"))
      .split("\n")
      .map((seg) => seg.trim())
      .filter(Boolean);
  return [...partir(t), ...internos.flatMap(partir)];
}


/** As invocacoes de `git` de um comando, cada uma com o seu verbo (ou `null` se nao se
 *  conseguir determinar — e um `null` conta como NAO seguro). */
function invocacoes(texto) {
  const out = [];
  for (const seg of segmentos(texto)) {
    let toks = seg.split(/\s+/).map(limpo).filter(Boolean);
    // Consumir wrappers, palavras-chave de shell, flags e atribuicoes ate ao comando real.
    let viuWrapper = false;
    let viuWrapperOpaco = false;
    let anteriorEraFlag = false;
    for (;;) {
      const t = toks[0];
      if (!t) break;
      const base = t.replace(/^.*\//, "");
      // Chegar ao `git` para SEMPRE o consumo. Sem esta linha primeiro, o salto do valor de
      // flag comia o proprio `git`: `sh -c "git commit"`, `bash -c "git push"` e
      // `env GIT_DIR=.git git commit` deixaram de ser detetados — tres regressoes que a
      // tabela de bypasses apanhou no momento em que eu as introduzi.
      if (base === "git") break;
      if (/^\w+=/.test(t) || t.startsWith("-")) { toks = toks.slice(1); anteriorEraFlag = true; continue; }
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
        if (WRAPPERS_OPACOS.has(base)) viuWrapperOpaco = true;
        anteriorEraFlag = false;
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
    if (toks[0].replace(/^.*\//, "") !== "git") continue; // nao e uma invocacao do git
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

/** Force-push: `--force`, `-f`, ou um refspec com `+` a frente (`git push origin +main`). */
/** Force-push e o que o iguala. `--force`, `-f`, refspec com `+` e `--mirror` sao sempre
 *  destrutivos. **Apagar um ref so conta se o alvo for um branch PROTEGIDO**: `git push
 *  origin --delete fix/algo` num branch ja mergeado e rotina — e e o que as regras deste
 *  repo mandam fazer depois de um merge. A primeira versao negava qualquer `--delete`, e a
 *  primeira coisa que bloqueou foi eu a limpar um branch mergeado. */
function eForce(inv) {
  if (inv.verbo !== "push") return false;
  const args = inv.args;
  if (
    args.some(
      (a) =>
        a === "--force" ||
        a.startsWith("--force=") ||
        /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) ||
        /^\+.+/.test(a) ||
        // `--mirror` forca todos os refs e apaga os que faltam localmente: nao ha alvo unico
        // a inspecionar, logo nega sempre.
        a === "--mirror"
    )
  ) {
    return true;
  }
  return refsApagados(args).some((r) => ehProtegido(r));
}

/** Refs que um `git push` apagaria: `--delete` (**global**: apaga TODOS os refs listados,
 *  esteja a flag onde estiver) ou uma refspec `:<ref>`.
 *
 *  Duas correcoes de uma leitura independente: a versao anterior recolhia so os argumentos
 *  DEPOIS da flag — logo `git push origin main --delete fix/x` lia apenas `fix/x` e apagava o
 *  `main` remoto sem ser negado — e comparava `args[i] === "-d"` por igualdade, logo
 *  `git push -dv origin main` escapava **em qualquer branch**, furando a unica garantia
 *  branch-independente deste hook. */
function refsApagados(args) {
  const temDelete = args.some((a) => a === "--delete" || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(a));
  const posicionais = args.filter((a) => !a.startsWith("-"));
  const out = [];
  // Com `--delete`, os refs sao todos os posicionais menos o primeiro (o remoto).
  if (temDelete) out.push(...posicionais.slice(1));
  for (const a of args) {
    const m = /^:(.+)$/.exec(a);
    if (m) out.push(m[1]);
  }
  // Um ref pode vir como `src:dst` — verificam-se **os dois lados**, em vez de guardar so o
  // texto depois do ultimo `:`, que deixava `--delete main:x` passar como `x`.
  return out.flatMap((r) => r.split(":")).filter(Boolean).map((r) => r.replace(/^refs\/heads\//, ""));
}


/** Sem verbo identificavel: `git`, `git --version`, `git --help` nao fazem nada e negar isso
 *  e ruido; qualquer outra coisa (`git $VERBO`) **nao** e segura — e a parte que falha fechada. */
/** Wrappers cujo comando NAO esta visivel no texto: vem do stdin (`xargs`) ou de uma string
 *  que o shell volta a interpretar (`eval`, `sh -c`). Para estes, o que se ve nao e o que
 *  corre, logo falha fechado. Os outros (`env`, `timeout`, `sudo`, `command`, `nice`) passam
 *  o comando como ARGUMENTOS — o texto e fiavel e `env git --version` nao esconde nada. */
const WRAPPERS_OPACOS = new Set(["xargs", "eval", "sh", "bash", "zsh", "dash", "ksh", "ssh", "su", "doas"]);

function semVerboEInofensivo(inv) {
  // `echo commit | xargs git` chega aqui sem verbo — o verbo vem do stdin, logo nao ha nada
  // de inofensivo nisso. Mas `env git --version` e `timeout 5 git --version` eram negados
  // pela mesma regra, e negar `git --version` nao protege nada: so treina quem o le a
  // contornar o guarda. A distincao e se o wrapper esconde o comando ou nao.
  if (inv.viaWrapperOpaco) return false;
  const resto = inv.seg.replace(/^[\s\S]*?(?:^|\/|\s)git(?![\w.-])/, "").trim();
  return resto === "" || /^(?:--version|--help|-h)$/.test(resto);
}

function seguro(inv) {
  if (inv.verbo === null) return semVerboEInofensivo(inv);
  if (inv.verbo === "checkout") {
    // So e seguro na forma que CRIA um branch novo (`-b`). O `-B` **reposiciona** um branch
    // existente — entrava por engano numa versao anterior. E sem `-b` nenhum, o verbo pode
    // descartar trabalho (`git checkout -- .`), porque nao distingue branch de caminho.
    //
    // Pelas flags normalizadas e nao por regex sobre o texto: `git checkout -bfeature` (forma
    // aderente, que o git aceita) era lido como "sem -b" e negado — falso positivo medido.
    // (Esteve presa a duas constantes `CHECKOUT_*` mortas: uma razao longe da decisao que
    // explica nao e documentacao, e ruido que envelhece sem ninguem notar.)
    const flags = normalizaFlags(inv.args);
    return flags.includes("-b") && !flags.includes("-B");
  }
  // Verbos de INSPECAO pura: nao escrevem nada, em nenhuma forma. `command -v git`,
  // `env git --version`, `timeout 5 git --version` eram NEGADOS porque `viaWrapper` fecha a
  // porta a tudo — e negar `git --version` nao protege nada. Estes passam mesmo via wrapper.
  const INSPECAO_PURA = /^(?:--version|version|--help|help)$/;
  if (INSPECAO_PURA.test(inv.verbo) && !inv.viaWrapperOpaco) return true;
  if (!SEGUROS.has(inv.verbo)) return false;
  const exigida = FORMA_EXIGIDA[inv.verbo];
  if (exigida) return exigida(inv.args, { ehProtegido, refsApagados });
  // Sub-verbo: o primeiro argumento POSICIONAL (nao-flag). Comparar so com `args[0]` fazia
  // QUALQUER flag anular a tabela inteira — `git stash -q drop`, `git reflog --verbose
  // expire`, `git remote -v remove origin` passavam todos. Cinco bypasses medidos.
  // Continua a nao apanhar falsos positivos: em `git stash push -m "apply later"` o primeiro
  // posicional e `push`, nao a palavra `apply` da mensagem.
  const subverbo = SUBVERBOS_INSEGUROS[inv.verbo];
  if (subverbo) {
    // O PRIMEIRO posicional, saltando o valor das flags que consomem um argumento. Sem
    // isso, `git notes --ref x remove` dava `x` como primeiro posicional e o `remove`
    // escapava — medido. E so o primeiro: percorrer todos faria de `git stash push -m
    // "drop this"` um falso positivo, porque `drop` e um token da mensagem.
    let posicional;
    for (let i = 0; i < inv.args.length; i++) {
      const a = inv.args[i];
      if (a.startsWith("-")) {
        if (SUBVERBO_FLAGS_COM_VALOR.has(a)) i++; // `--ref x`: o `x` e valor, nao sub-verbo
        continue;
      }
      posicional = a;
      break;
    }
    if (posicional !== undefined && subverbo.test(posicional)) return false;
  }
  // Flags: com as agrupadas e aderentes expandidas, para comparar por igualdade.
  const insegura = FORMAS_INSEGURAS[inv.verbo];
  if (!insegura) return true;
  // `ctx`: para as formas julgadas pelo ALVO e nao pela flag (hoje, `branch`).
  if (typeof insegura === "function") return !insegura(inv.args, { ehProtegido, normalizaFlags });
  return !normalizaFlags(inv.args).some((a) => insegura.test(a));
}

/** Diretorios que o comando visita: o `cwd` do payload mais cada `-C`, `--git-dir`, `cd` e
 *  `pushd`. Sem nenhuma pista, o `cwd` do proprio hook — nunca lista vazia, que PERMITIA. */
function diretorios(cmd, cwd) {
  const dirs = [];
  for (const m of cmd.matchAll(/(?:-C|--git-dir=?|--work-tree=?)\s*("[^"]+"|'[^']+'|\S+)/g)) dirs.push(limpo(m[1]));
  for (const m of cmd.matchAll(/(?:^|[;&|(\n]\s*)(?:cd|pushd)\s+("[^"]+"|'[^']+'|\S+)/g)) dirs.push(limpo(m[1]));
  if (cwd) dirs.push(cwd);
  // O filtro corre ANTES do fallback: com ele depois, um comando cuja unica pista de
  // diretorio comece por `-` (`git commit -C -m x`) e sem `cwd` no payload dava lista vazia
  // e PERMITIA — o mesmo defeito que o fallback existe para fechar, mais estreito.
  const validos = dirs.filter((d) => d && !d.startsWith("-"));
  if (!validos.length) validos.push(process.cwd());
  return [...new Set(validos)];
}

function branchDe(dir) {
  try {
    return execFileSync("git", ["-C", dir, "symbolic-ref", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).replace(/\n+$/, "");
  } catch {
    return null; // nao e repo, ou detached — nao decidimos com base nisso
  }
}

/** Nega, no formato que o Claude Code entende. */
function negar(razao) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: razao,
      },
    })
  );
  process.exit(0);
}

try {
  const payload = ler();
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== "string" || !cmd.trim()) process.exit(0);

  // Corpos de heredoc saem: uma mensagem de commit que cite `push --force` nao e um push.
  // As aspas NAO saem — retira-las em bloco foi o que fez `eval "git commit"` escapar. Aqui
  // sao retiradas token a token, o que desmonta a ofuscacao em vez de a esconder.
  //
  // MAS o corpo so e "texto" se quem o recebe for o `git`. Quando o destinatario e uma
  // SHELL (`bash -s <<EOF ... EOF`), o corpo sao COMANDOS que correm — e remove-lo apagava
  // a analise inteira. Dois bypasses medidos. O corpo desses e guardado e varrido como
  // segmento proprio, em vez de descartado.
  const corposExecutaveis = [];
  const texto = cmd.replace(
    /^([^\n]*?)<<-?\s*(['"]?)(\w+)\2([\s\S]*?)^\s*\3\s*$/gm,
    (_todo, preambulo, _q, _tag, corpo) => {
      // O preambulo e o que esta ANTES do `<<` na mesma linha: e ele que diz quem recebe.
      // Quem recebe o corpo pode estar ANTES do `<<` (`bash -s <<EOF`) ou **depois do
      // terminador** (`cat <<EOF | bash`). A versao anterior so olhava para o preambulo, e a
      // segunda forma passava — e a vizinha da que tinha sido corrigida.
      const ehShell = (t) => /(?:^|[\s|])(?:sh|bash|zsh|dash|ksh)(?:\s|$)/.test(limpo(t));
      // Em `cat <<EOF | bash`, o `| bash` fica no RESTO DA LINHA do `<<` — que o regex captura
      // como inicio do corpo, nao depois do terminador. E ai que se procura.
      const restoDaLinha = corpo.split("\n")[0] ?? "";
      if (invocacoes(preambulo).length === 0 && (ehShell(preambulo) || ehShell(restoDaLinha))) {
        corposExecutaveis.push(corpo);
      }
      return preambulo;
    }
  );

  // A fronteira nao se reescreve a si propria. A logica (e os tres falsos positivos que a
  // moldaram) vive em `lib/fronteira.mjs`.
  if (alteraFronteira(texto)) negar(RAZAO_FRONTEIRA);

  const invs = [...invocacoes(texto), ...corposExecutaveis.flatMap((c) => invocacoes(c))];
  if (!invs.length) process.exit(0); // nada de git em posicao de comando

  for (const inv of invs) {
    if (eForce(inv)) {
      negar(
        "Force-push negado em qualquer branch. Se e mesmo necessario, usa --force-with-lease " +
          "e faz o push a mao, fora do agente."
      );
    }
  }

  const perigosas = invs.filter((inv) => !seguro(inv));
  if (!perigosas.length) process.exit(0);

  for (const dir of diretorios(texto, payload?.cwd)) {
    const br = branchDe(dir);
    if (ehProtegido(br)) {
      const v = perigosas.map((p) => p.verbo ?? "(nao identificado)").join(", ");
      negar(
        `\`${br}\` e um branch protegido (${dir}) e \`git ${v}\` nao esta na lista de verbos ` +
          `seguros. Cria um branch primeiro (\`git switch -c <nome>\`) — ver "Regra de Branch" ` +
          `em .agent/rules/process-rules.md. Se o verbo e inofensivo e devia passar, ` +
          `acrescenta-o a SEGUROS em .claude/hooks/guard-protected-branch.mjs. ` +
          `Para desligar a protecao: /hooks, ou remove a entrada de .claude/settings.json.`
      );
    }
  }
} catch {
  // Sair 0 de proposito: um hook avariado nao pode bloquear trabalho legitimo.
}
process.exit(0);
