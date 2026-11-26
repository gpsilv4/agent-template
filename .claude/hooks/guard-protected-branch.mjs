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
 * `WRAPPERS` (`lib/invocacoes-git.mjs`), que **e** uma blocklist. Passam `flock l git commit`, `sg grupo -c "git commit"` (#607) e
 * `ssh host git commit` (o `GIT_PAGER=...` e o `-c core.pager=...` que executam fecharam no #253:
 * negam em branch protegido, salvo um paginador simples). Fechar isto exigiria negar qualquer `git` em qualquer posicao e recuperar depois os
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
import { isMainThread, workerData } from "worker_threads";
// A analise corre neste ficheiro num worker com PRAZO; o principal so espera (lib/resposta, #227).
import { comPrazo, negar } from "./lib/resposta.mjs";
// As tabelas de verbos vivem a parte: sao DADOS, e mante-las aqui punha o hook acima do teto
// do Guard 17 (que so deixa encolher). Acrescentar um verbo faz-se la.
import { SEGUROS, FORMAS_INSEGURAS, FORMA_EXIGIDA, valoresQueExecutam, executaAlgo } from "./lib/verbos-git.mjs";
import { porqueAltera, contextoFronteira, executaCrase, razaoDe } from "./lib/fronteira.mjs";
// O RECONHECIMENTO de uma invocacao do `git` (os segmentos, os wrappers, as flags globais ate ao verbo) vive a
// parte desde o #580; aqui fica a DECISAO.
import { invocacoes, limpo, ultimoComando } from "./lib/invocacoes-git.mjs";
import { ELEVA_CURTA_SRC, ELEVAM, MODIFICADORES_ZSH, SHELLS, SU, SUDO_LOGIN_SRC, SUDO_SHELL_SRC, temEquals } from "./lib/fronteira-dados.mjs";

// Os branches protegidos sao do PROJETO (`.claude/hooks/protegidos.json`, #257); a leitura, o
// default e a comparacao normalizada vivem em `lib/protegidos.mjs`.
import { ehProtegido } from "./lib/protegidos.mjs";

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

/** Flags de SUB-COMANDO que consomem o argumento seguinte. Sem esta lista, o valor de uma
 *  flag era lido como sub-verbo e o sub-verbo verdadeiro escapava (`git notes --ref x
 *  remove`). So precisa de cobrir os sub-comandos que tem entrada em `SUBVERBOS_INSEGUROS`. */
const SUBVERBO_FLAGS_COM_VALOR = new Set([
  "--ref", "-m", "--message", "-F", "--file", "-C", "--reuse-message", "-c", "--reedit-message",
  "-n", "--expire", "--expire-unreachable", "--format", "--pretty",
]);

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

/** O que pode vir antes de um `cd` que ainda o corre (#606): os modificadores do zsh (a lista unica) e o `builtin`/`command`.
 *  Sem isto, `noglob cd <repo em main> && git commit` lancado de um branch de feature julgava o branch da feature (o 1.o
 *  leitor do #606); o `builtin cd`/`command cd` ja tinham a mesma falha. O `repeat <contagem> cd` fica para o issue do `repeat`. */
const ANTES_DO_CD = String.raw`(?:(?:${[...MODIFICADORES_ZSH, "builtin", "command"].join("|")})\s+)*`;

/** Diretorios que o comando visita: o `cwd` do payload mais cada `-C`, `--git-dir`, `cd` e
 *  `pushd`. Sem nenhuma pista, o `cwd` do proprio hook — nunca lista vazia, que PERMITIA. */
function diretorios(cmd, cwd) {
  const dirs = [];
  // #227: `\S+` levava o `;` de `cd <repo>; git commit` (fuga). Para nos separadores, aceita escapes.
  for (const m of cmd.matchAll(/(?:-C|--git-dir=?|--work-tree=?)\s*("[^"]+"|'[^']+'|\S+)/g)) dirs.push(limpo(m[1]));
  for (const m of cmd.matchAll(new RegExp(String.raw`(?:(?:^|[;&|({\n])\s*|\b(?:then|do|else)\s+)${ANTES_DO_CD}(?:cd|pushd)\s+(?:(?:-[PLe@]+|--)\s+)*("[^"]+"|'[^']+'|(?:\\.|[^\s;&|()<>\\])+)`, "g"))) dirs.push(limpo(m[1]));
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
    const opcoes = { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, killSignal: "SIGKILL" };
    return execFileSync("git", ["-C", dir, "symbolic-ref", "--short", "HEAD"], opcoes).replace(/\n+$/, "");
  } catch (err) {
    // Um `git` que nao responde e DESCONHECIDO, e nega (#227): sem tecto, um HEAD num FIFO prendia o worker.
    if (err?.signal) negar(`O \`git\` nao respondeu em 5 s em ${dir}: impossivel verificar o branch.`);
    return null; // nao e repo, ou detached — nao decidimos com base nisso
  }
}

const MAX_COMANDO = 100_000;
const MAX_DIRETORIOS = 50; // cada directorio distinto e um `git`: 9k eram 44 s (leitura do #226)

try {
  const payload = isMainThread ? await comPrazo(import.meta.url) : workerData;
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== "string" || !cmd.trim()) process.exit(0);
  // Grande demais para verificar (#224): um hook que excede o timeout PERMITE (docs do Claude Code).
  if (cmd.length > MAX_COMANDO) negar(`Comando com mais de ${MAX_COMANDO} caracteres: grande demais para verificar. Conteudo grande vai por ficheiro (ferramenta Write).`);

  // Corpos de heredoc saem: uma mensagem de commit que cite `push --force` nao e um push.
  // As aspas NAO saem — retira-las em bloco foi o que fez `eval "git commit"` escapar. Aqui
  // sao retiradas token a token, o que desmonta a ofuscacao em vez de a esconder.
  //
  // MAS o corpo so e "texto" se quem o recebe for o `git`. Quando o destinatario e uma
  // SHELL (`bash -s <<EOF ... EOF`), o corpo sao COMANDOS que correm — e remove-lo apagava
  // a analise inteira. Dois bypasses medidos. O corpo desses e guardado e varrido como
  // segmento proprio, em vez de descartado.
  const corposExecutaveis = [];
  // O EQUALS do zsh (#567): a 2.a leitura so corre com uma palavra que comeca por `=` — sem ela, tudo como no `main`.
  const comEquals = temEquals(cmd);
  const texto = cmd.replace(
    // `[\t ]`, nao `\s` (#224): o `\s` casa o `\n`, e um `<<TAG` sem terminador era quadratico.
    /^([^\n]*?)<<-?[\t ]*(['"]?)(\w+)\2([\s\S]*?)^[\t ]*\3[\t ]*$/gm,
    (_todo, preambulo, _q, _tag, corpo) => {
      // O preambulo e o que esta ANTES do `<<` na mesma linha: e ele que diz quem recebe.
      // Quem recebe o corpo pode estar ANTES do `<<` (`bash -s <<EOF`) ou **depois do
      // terminador** (`cat <<EOF | bash`). A versao anterior so olhava para o preambulo, e a
      // segunda forma passava — e a vizinha da que tinha sido corrigida.
      // Com o EQUALS do zsh (#567), `=bash` e a shell: a 2.a leitura aceita o `=` antes do nome.
      // E quem le o stdin numa shell sem se chamar shell (#600): o `su`/`runuser`, e o `sudo`/`doas` com uma flag que eleva
      // (`-s`, `-i`, `-Es`, `--shell`, `--login` e os prefixos). `su - root <<EOF` e `sudo -s <<EOF` passavam.
      // As novas tambem depois de um caminho ou de um separador (`/bin/su - <<EOF`, `true;su <<EOF`): so acrescenta varreduras.
      // As shells sao as da lista unica (`SHELLS`; ate ao `/audit` da v0.64.0 faltavam o `csh`/`tcsh`/`fish`), e tambem por
      // caminho (`/bin/bash <<EOF`, #605). Nega a mais, dito: um ARGUMENTO cujo ultimo nome e uma shell (`cat docs/sh <<EOF`).
      // As novas leem-se SEM o texto entre aspas, e as flags do `sudo`/`doas` SEGUIDAS a ele (cada uma com um valor no
      // maximo): `gh pr create --title "... su -c ..." --body "$(cat <<'EOF'` e `doas git commit -s -F - <<EOF` (o `-s` e do
      // git) varriam o corpo — a mensagem de um PR que fala de `su` e de force-push era negada (a leitura focada do #600).
      const semAspas = (t) => limpo(t.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, " "));
      // O fim do nome aceita um separador colado (`| bash)`, `| bash;`), e o caminho e `(?:[^\s/]*/)*` (linear, e nao `\S*/`).
      const ehShell = (t, equals) => new RegExp(`(?:^|[\\s|]|\\|&)${equals ? "=?" : ""}(?:[^\\s/]*/)*(?:${SHELLS.join("|")})(?:[\\s;&|)]|$)`).test(limpo(t)) ||
        new RegExp(`(?:^|[\\s|;&(/])${equals ? "=?" : ""}(?:${SU.join("|")})(?:\\s|$)`).test(semAspas(t)) ||
        new RegExp(`(?:^|[\\s|;&(/])${equals ? "=?" : ""}(?:${ELEVAM.join("|")})(?:\\s+-\\S*(?:\\s+[^-\\s]\\S*)?)*?\\s+(?:${ELEVA_CURTA_SRC}|--(?:${SUDO_SHELL_SRC}|${SUDO_LOGIN_SRC}))(?:\\s|$)`).test(semAspas(t));
      // Em `cat <<EOF | bash`, o `| bash` fica no RESTO DA LINHA do `<<` — que o regex captura
      // como inicio do corpo, nao depois do terminador. E ai que se procura.
      const restoDaLinha = corpo.split("\n")[0] ?? "";
      // As DUAS leituras (#567): varre-se se QUALQUER delas o pedir. So a nova (o `=git` visto no preambulo) deixava de
      // varrer `=git stripspace <<EOF | bash` com um force-push no corpo — o `main` varria-o (o N1 do plano).
      // Um git que corre DENTRO de um wrapper opaco do preambulo (`su root -c 'git status; bash' <<EOF`, o mesmo com `sh -c`)
      // nao faz do corpo texto (#600): so conta o que o preambulo corre a vista. Sem isto, por o `su` nos `WRAPPERS` fazia do
      // `git status` uma invocacao, e o corpo — com um force-push — deixava de se varrer. Nega a mais, dito: o corpo de
      // `sh -c 'git commit -F -' <<EOF` passa a varrer-se, e uma mensagem com uma linha `git push --force` e negada.
      // Quem recebe o corpo e o ULTIMO comando do preambulo, ou a shell a jusante no resto da linha (#605): um git ANTES dele
      // (`git stripspace | bash <<EOF`, `git log; bash <<EOF`) ou a montante do pipe (`git stripspace <<EOF | bash`) nao faz
      // do corpo texto. So um git que RECEBE o corpo o faz (`git commit -F - <<EOF`, tambem depois de um `bash -c 'x' &&`).
      const quem = ultimoComando(preambulo);
      const aVista = (equals) => invocacoes(quem, { equals }).filter((inv) => !inv.viaWrapperOpaco);
      // A shell ve-se no `quem` OU no preambulo inteiro (o do `main`): o `quem` so decide se um git a vista RECEBE o corpo.
      // So com o `quem`, `while read l; do bash -s; done <<EOF` deixava de varrer (o `quem` e o `done`; os dois leitores).
      const pede = (equals) => (aVista(equals).length === 0 && (ehShell(quem, equals) || ehShell(preambulo, equals))) || ehShell(restoDaLinha, equals);
      if (pede(false) || (comEquals && pede(true))) {
        corposExecutaveis.push(corpo);
      }
      return preambulo;
    }
  );

  // A fronteira nao se reescreve a si propria. A logica vive em `lib/fronteira.mjs`, que agora
  // diz QUAL das condicoes negou — reconstruir o comando depois nao chega (#101). E a razao
  // segue a condicao: escrita vista, ou leitura que nao se conseguiu provar (#307).
  // Com o comando CRU, e nao o `texto` de cima (auditoria do #317): esse corte e do git, e com ele
  // `cat <<'EOF' > .claude/hooks/x.mjs` chegava aqui como `cat` — o `porqueAltera` trata os heredocs ele proprio.
  { const porque = porqueAltera(cmd, contextoFronteira(payload?.cwd)); if (porque) negar(`${razaoDe(porque, executaCrase(cmd))}\n\n(condicao: ${porque})`); }

  // As invocacoes das DUAS leituras, por UNIAO e sem repetidas (#567): todas as decisoes abaixo sao "existe uma invocacao
  // perigosa", logo juntar so nega mais. Sem `=` no comando nao se deduplica: a lista e a do `main`, byte a byte (com as
  // repetidas que ele tinha). Com `=`, a da leitura do `main` vem primeiro, e a do EQUALS so acrescenta as que faltam.
  const leitura = (equals) => [...invocacoes(texto, { equals }), ...corposExecutaveis.flatMap((c) => invocacoes(c, { equals }))];
  const chave = (inv) => JSON.stringify([inv.seg, inv.verbo, inv.args]);
  // Fica a 1.a de cada chave (a do `main`): um `Map` guardava a posicao da 1.a e o valor da ULTIMA. Um falso positivo dito:
  // um `=x` noutro sitio liga a 2.a leitura, e o `"=git" commit` citado passa a ler-se como `git commit` — so nega a mais.
  const vistas = new Set();
  const invs = !comEquals ? leitura(false) : [...leitura(false), ...leitura(true)].filter((inv) => !vistas.has(chave(inv)) && vistas.add(chave(inv)));
  if (!invs.length) process.exit(0); // nada de git em posicao de comando

  for (const inv of invs) {
    if (eForce(inv)) {
      negar(
        "Force-push negado em qualquer branch. Se e mesmo necessario, usa --force-with-lease " +
          "e faz o push a mao, fora do agente."
      );
    }
  }

  // Uma opcao que faz o git EXECUTAR um comando (#253) nao e segura em branch protegido, seja qual
  // for o verbo — so os paginadores passam. Antes negava por acidente (o valor partia o token).
  // Dentro de um wrapper opaco (`sh -c 'git ... log'`, `eval "git ..."`), o comando do git e UMA palavra citada, e o
  // `valoresQueExecutam` nao encontra o `git`: le-se tambem sem as aspas (o `limpo`), por uniao (#579 — com o verbo lido
  // certo, uma chave que executa dada pela variavel de ambiente, dentro de um `sh -c '...'`, passava a deixar; o leitor
  // adversarial. Os casos estao no modulo de testes do #579).
  const executa = (inv) => [inv.seg, ...(inv.viaWrapperOpaco ? [limpo(inv.seg)] : [])]
    .some((s) => valoresQueExecutam(s).some(({ valor }) => executaAlgo(valor)));
  const perigosas = invs.filter((inv) => !seguro(inv) || executa(inv));
  if (!perigosas.length) process.exit(0);

  const dirs = diretorios(texto, payload?.cwd);
  if (dirs.length > MAX_DIRETORIOS) negar(`O comando muda para mais de ${MAX_DIRETORIOS} directorios: demasiados para verificar o branch de cada um. Partir o comando.`);
  for (const dir of dirs) {
    const br = branchDe(dir);
    if (ehProtegido(br)) {
      const v = perigosas.map((p) => `${p.verbo ?? "(nao identificado)"}${seguro(p) ? " (com uma opcao que faz o git executar)" : ""}`).join(", ");
      negar(
        // A saida de MUDAR faltava, e custou: quem corria `git checkout main` era mandado CRIAR.
        `\`${br}\` e um branch protegido (${dir}) e \`git ${v}\` nao esta nos verbos seguros. ` +
          `MUDAR de branch: \`git switch <ramo>\`. CRIAR: \`git switch -c <nome>\` — ver "Regra de ` +
          `Branch" em .agent/rules/process-rules.md. O \`checkout\` fica de fora de proposito: o ` +
          `porque, e onde se acrescenta um verbo, em lib/verbos-git.mjs. Desligar: \`/hooks\`.`
      );
    }
  }
} catch {
  // Sair 0 de proposito: um hook avariado nao pode bloquear trabalho legitimo.
}
process.exit(0);
