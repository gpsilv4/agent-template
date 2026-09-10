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

/** Branches onde nao se comita nem se faz push diretamente. Adaptar no bootstrap. */
const PROTEGIDOS = new Set(["main", "master", "develop"]);

/** Verbos permitidos num branch protegido: leitura, inspecao, e escrita local que nao cria
 *  commits, nao reescreve historia e nao publica. **Tudo o que nao esta aqui e negado.**
 *  `switch` esta ca dentro de proposito: e como se SAI de um branch protegido, e (ao
 *  contrario de `checkout`) nunca recebe caminhos — quem descarta ficheiros e o `restore`. */
const SEGUROS = new Set([
  "status", "log", "diff", "show", "branch", "tag", "remote", "fetch", "switch", "stash",
  "rev-parse", "rev-list", "symbolic-ref", "merge-base", "describe", "blame", "shortlog",
  "ls-files", "ls-tree", "ls-remote", "cat-file", "grep", "reflog", "add", "config", "help",
  "version", "init", "clone", "worktree", "name-rev", "count-objects", "cherry", "whatchanged",
  "diff-tree", "diff-index", "diff-files", "check-ignore", "check-attr", "var", "show-ref",
  "show-branch", "for-each-ref", "verify-commit", "verify-tag", "fsck", "archive", "bundle",
  "format-patch", "range-diff", "annotate", "notes", "submodule",
  // Estes dois so passam na forma exigida (ver `FORMA_EXIGIDA`).
  "pull", "push",
  // FORA de proposito: `difftool` (`-x <cmd>`) e `bisect` (`bisect run <cmd>`) correm comandos
  // arbitrarios; `gui`/`citool`/`instaweb`/`web--browse` abrem processos interativos.
]);

/** Um verbo seguro pode ser destrutivo pela FLAG. Medido numa revisao independente:
 *  `git switch -C main`, `git checkout -B main`, `git branch -f master`, `git branch -D
 *  develop` e `git fetch . HEAD:master` passavam todos — e o primeiro faz o que o
 *  `reset --hard` faz, que a versao anterior negava. Cada entrada aqui e uma forma que torna
 *  inseguro um verbo que esta em `SEGUROS`. */
const FORMAS_INSEGURAS = {
  switch: /^(?:-C|--force|--discard-changes)$/,
  branch: /^(?:-f|--force|-[dD]|--delete|-[mMcC]|--move|--copy)$/,
  tag: /^(?:-d|--delete|-f|--force)$/,
  stash: /^(?:drop|clear|pop|apply)$/,
  reflog: /^(?:expire|delete)$/,
  remote: /^(?:remove|rm|set-url|rename|prune|add)$/,
  worktree: /^(?:remove|prune|move)$/,
  config: /^(?:--unset|--unset-all|--remove-section|--rename-section)$/,
  submodule: /^(?:update|deinit|add|sync|set-url)$/,
  notes: /^(?:add|append|edit|remove|prune|copy)$/,
  fetch: /:|^\+/, // refspec escreve refs locais: `git fetch . HEAD:master`
  add: /^(?:-i|--interactive|-p|--patch)$/, // interativos: um hook nao tem como responder
};

/** `checkout` so e seguro na forma que cria um branch NOVO (`-b`). O `-B` **reposiciona** um
 *  branch existente — entrava por engano na versao anterior. Sem `-b` pode descartar trabalho
 *  (`git checkout -- .`), e o verbo nao distingue branch de caminho. */
const CHECKOUT_CRIA = /(?<![\w-])-b(?![\w-])/;
const CHECKOUT_REPOSICIONA = /(?<![\w-])-B(?![\w-])/;

/** Verbos que exigem uma forma para serem seguros (nao basta faltar-lhes a forma insegura).
 *  Existe porque o `deploy.md`, o `CONTRIBUTING.md` e o `process-rules.md` deste repo mandam
 *  correr `git pull` e `git push origin --tags` em `main`: negar isso punha o guard em
 *  contradicao com o procedimento de release documentado — e um falso positivo que bloqueia
 *  trabalho documentado custa tanto como um bypass. */
const FORMA_EXIGIDA = {
  pull: (args) => args.includes("--ff-only"),
  push: (args) =>
    (args.includes("--tags") || args.includes("--follow-tags")) &&
    args.filter((a) => !a.startsWith("-")).length <= 1 && // no maximo o nome do remoto
    !args.some((a) => a.includes(":")),
};

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
const limpo = (t) => t.replace(/["'\\]/g, "");

/** Parte o comando em comandos simples. Todo o separador de shell conta — incluindo
 *  `$(`, backticks, `{`/`}` e `!`, que eram bypasses na versao anterior. */
function segmentos(texto) {
  return texto
    .replace(/\$\(/g, "\n")
    .replace(/[;&|()`{}\n<>]+/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** As invocacoes de `git` de um comando, cada uma com o seu verbo (ou `null` se nao se
 *  conseguir determinar — e um `null` conta como NAO seguro). */
function invocacoes(texto) {
  const out = [];
  for (const seg of segmentos(texto)) {
    let toks = seg.split(/\s+/).map(limpo).filter(Boolean);
    // Consumir wrappers, palavras-chave de shell, flags e atribuicoes ate ao comando real.
    let viuWrapper = false;
    for (;;) {
      const t = toks[0];
      if (!t) break;
      if (/^\w+=/.test(t) || t.startsWith("-")) { toks = toks.slice(1); continue; }
      if (PALAVRAS_SHELL.has(t)) { toks = toks.slice(1); continue; }
      const base = t.replace(/^.*\//, "");
      if (WRAPPERS.has(base)) { toks = toks.slice(1); viuWrapper = true; continue; }
      if (viuWrapper && VALOR_DE_WRAPPER.test(t)) { toks = toks.slice(1); continue; }
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
    out.push({ verbo: i < toks.length ? toks[i] : null, args: toks.slice(i + 1), seg });
  }
  return out;
}

/** Force-push: `--force`, `-f`, ou um refspec com `+` a frente (`git push origin +main`). */
function eForce(inv) {
  if (inv.verbo !== "push") return false;
  return inv.args.some(
    (a) =>
      a === "--force" ||
      a.startsWith("--force=") ||
      /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) ||
      /^\+.+/.test(a) ||
      // Apagar um branch remoto destroi tanto como um force-push, e escapava: `:main`,
      // `--delete main`, e `--mirror` (forca todos os refs e apaga os que faltam localmente).
      a === "--mirror" ||
      a === "--delete" ||
      a === "-d" ||
      /^:.+/.test(a)
  );
}

/** Sem verbo identificavel: `git`, `git --version`, `git --help` nao fazem nada e negar isso
 *  e ruido; qualquer outra coisa (`git $VERBO`) **nao** e segura — e a parte que falha fechada. */
function semVerboEInofensivo(inv) {
  const resto = inv.seg.replace(/^[\s\S]*?(?:^|\/|\s)git(?![\w.-])/, "").trim();
  return resto === "" || /^(?:--version|--help|-h)$/.test(resto);
}

function seguro(inv) {
  if (inv.verbo === null) return semVerboEInofensivo(inv);
  if (inv.verbo === "checkout") return CHECKOUT_CRIA.test(inv.seg) && !CHECKOUT_REPOSICIONA.test(inv.seg);
  if (!SEGUROS.has(inv.verbo)) return false;
  const exigida = FORMA_EXIGIDA[inv.verbo];
  if (exigida) return exigida(inv.args);
  const insegura = FORMAS_INSEGURAS[inv.verbo];
  return !(insegura && inv.args.some((a) => insegura.test(a)));
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
  const texto = cmd.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?^\s*\2\s*$/gm, "");

  const invs = invocacoes(texto);
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
    if (br && PROTEGIDOS.has(br)) {
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
