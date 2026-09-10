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
 * O DETALHE QUE O TORNA CORRETO: o branch alvo deriva do `cwd` do payload **e de todos os
 * `-C <dir>` e `cd <dir>` do comando**. Ler so o texto do comando deixava passar um `cd sub`
 * numa chamada e um `git commit` na seguinte — o hook via dois comandos inofensivos.
 *
 * CONTRATO DE SAIDA: sai `0` em tudo excepto na negacao explicita. Um hook avariado **nunca**
 * bloqueia trabalho legitimo; um hook que rebenta a decidir para todos e pior que nao existir.
 */

import { execFileSync } from "child_process";
import { readFileSync } from "fs";

/** Branches onde nao se comita nem se faz push diretamente. Adaptar no bootstrap. */
const PROTEGIDOS = new Set(["main", "master", "develop"]);

/** Verbos que alteram a historia ou o remoto. */
const DESTRUTIVO = /\bgit\b[^\n;|&]*\b(commit|push|merge|rebase|reset\s+--hard)\b/;
/** Force-push e negado em QUALQUER branch. */
const FORCE = /\bgit\b[^\n;|&]*\bpush\b[^\n;|&]*(--force(?!-with-lease)|(?<![\w-])-f(?![\w-]))/;

function ler() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

/** Diretorios que o comando visita: o `cwd` do payload mais cada `-C` e cada `cd`. */
function diretorios(cmd, cwd) {
  const dirs = cwd ? [cwd] : [];
  for (const m of cmd.matchAll(/-C\s+("[^"]+"|'[^']+'|\S+)/g)) dirs.push(m[1].replace(/^["']|["']$/g, ""));
  for (const m of cmd.matchAll(/(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|\S+)/g)) dirs.push(m[1].replace(/^["']|["']$/g, ""));
  return [...new Set(dirs)];
}

function branchDe(dir) {
  try {
    return execFileSync("git", ["-C", dir, "symbolic-ref", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
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

  // Um heredoc que MENCIONA o comando nao o executa. Cortar o corpo dos heredocs antes de
  // decidir, senao uma mensagem de commit que cite `git push --force` era negada.
  const semHeredoc = cmd.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?^\s*\2\s*$/gm, "");

  if (FORCE.test(semHeredoc)) {
    negar("Force-push negado em qualquer branch. Se e mesmo necessario, usa --force-with-lease e faz o push a mao, fora do agente.");
  }
  if (!DESTRUTIVO.test(semHeredoc)) process.exit(0);

  for (const dir of diretorios(semHeredoc, payload?.cwd)) {
    const br = branchDe(dir);
    if (br && PROTEGIDOS.has(br)) {
      negar(
        `\`${br}\` e um branch protegido (${dir}). Cria um branch primeiro — ver "Regra de Branch" em .agent/rules/process-rules.md. ` +
          `Para desligar esta protecao: /hooks, ou remove a entrada de .claude/settings.json.`
      );
    }
  }
} catch {
  // Sair 0 de proposito: um hook avariado nao pode bloquear trabalho legitimo.
}
process.exit(0);
