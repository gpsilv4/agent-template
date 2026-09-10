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
 * independente encontrou **23 formas de a contornar** — `eval git commit`, `sh -c "..."`,
 * backticks, `/usr/bin/git`, `xargs git`, `{ }`, `if`, `!`, e quatro criadas pela propria
 * correcao anterior (retirar as aspas fazia `eval "git commit"` escapar). A licao nao e que
 * faltavam padroes: e que a lista de formas perigosas **nao tem fim**, logo uma blocklist
 * falha ABERTA. A lista de verbos **seguros** e finita e enumeravel, logo esta versao falha
 * FECHADA: num branch protegido, o que nao se reconhece como seguro e negado.
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
  "version", "init", "clone", "worktree", "bisect", "name-rev", "count-objects", "cherry",
  "whatchanged", "diff-tree", "diff-index", "check-ignore", "check-attr", "var", "show-ref",
  "for-each-ref", "verify-commit", "verify-tag", "fsck", "archive", "bundle", "format-patch",
  "shortlog", "range-diff", "difftool", "annotate", "citool", "gui", "instaweb", "web--browse",
]);

/** `checkout` so e seguro na forma que CRIA um branch: sem `-b`/`-B` pode descartar
 *  trabalho (`git checkout -- .`), e o verbo nao distingue branch de caminho. */
const CHECKOUT_CRIA = /(?<![\w-])-[bB](?![\w-])/;

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
  return inv.args.some((a) => a === "--force" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+.+/.test(a)) ||
    inv.args.some((a) => a.startsWith("--force=") );
}

const seguro = (inv) =>
  inv.verbo !== null &&
  (SEGUROS.has(inv.verbo) || (inv.verbo === "checkout" && CHECKOUT_CRIA.test(inv.seg)));

/** Diretorios que o comando visita: o `cwd` do payload mais cada `-C`, `--git-dir`, `cd` e
 *  `pushd`. Sem nenhuma pista, o `cwd` do proprio hook — nunca lista vazia, que PERMITIA. */
function diretorios(cmd, cwd) {
  const dirs = [];
  for (const m of cmd.matchAll(/(?:-C|--git-dir=?|--work-tree=?)\s*("[^"]+"|'[^']+'|\S+)/g)) dirs.push(limpo(m[1]));
  for (const m of cmd.matchAll(/(?:^|[;&|(\n]\s*)(?:cd|pushd)\s+("[^"]+"|'[^']+'|\S+)/g)) dirs.push(limpo(m[1]));
  if (cwd) dirs.push(cwd);
  if (!dirs.length) dirs.push(process.cwd());
  return [...new Set(dirs.filter((d) => d && !d.startsWith("-")))];
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
