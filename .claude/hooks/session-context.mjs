#!/usr/bin/env node
/**
 * Hook `SessionStart`: injetar o estado real do repo — {{PROJECT_NAME}}
 *
 * **So-Claude Code.** Ligado em `.claude/settings.json`.
 *
 * PORQUE EXISTE: _"em que branch estou, e o que e que ja tenho por commitar"_ e a suposicao
 * errada mais comum de um agente — ele **infere** em vez de olhar, e infere mal. Isto
 * afirma-o de entrada. Nesta sessao, um agente destruiu trabalho por nao ter o branch e os
 * ficheiros por commitar presentes ao decidir um `git reset --hard`.
 *
 * DELIBERADAMENTE CURTO. Isto entra no contexto a **cada arranque de sessao**, e este
 * template tem orcamento de bytes nas rules precisamente porque contexto sempre-presente e
 * caro. So o que muda a decisao seguinte: branch, o que esta por commitar, e PRs abertos.
 * Nao lista ficheiros um a um nem despeja diffs.
 *
 * CONTRATO DE SAIDA: sai `0` sempre, e em silencio se algo falhar. Um hook de contexto que
 * rebenta impede a sessao de arrancar — o custo de nao ter o contexto e muito menor.
 */

import { execFileSync } from "child_process";

// O parser do `git status --porcelain -z` vive numa so copia (A3 do #195), partilhada com o
// `stop-verify.mjs`. Aqui so interessa o caminho.
import { caminhosPorcelain } from "./lib/porcelain.mjs";
import { ehProtegido, PROTEGIDOS_ESTADO } from "./lib/protegidos.mjs";

const MAX_FICHEIROS = 12; // acima disto, so a contagem — a lista deixa de informar

function git(args) {
  // `.replace(/\n+$/)` e NAO `.trim()`: no `git status --porcelain` a coluna de estado do
  // ficheiro **nao staged** e um espaco (` M path`), logo `.trim()` come o espaco da PRIMEIRA
  // linha e desloca o caminho um caractere — `.agent/x` chegava como `agent/x`. Media-se: o
  // caminho aparecia sem o ponto e (no `stop-verify`) nao casava com regra nenhuma.
  // Apara so o que sobra no fim, e os DOIS separadores possiveis (`\n` nas saidas normais,
  // `\0` nas que usam `-z`). Nunca `.trim()` em bloco: era o `TP5`.
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/[\n\0]+$/, "");
}

/** Silencioso por omissao: um passo que falha nao impede os outros de informar. */
function tenta(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const linhas = [];

const branch = tenta(() => git(["symbolic-ref", "--short", "HEAD"])) ?? tenta(() => `(detached em ${git(["rev-parse", "--short", "HEAD"])})`);
if (!branch) process.exit(0); // nao e um repo git: nada a dizer

// A mesma lista que o guard usa (#257): aqui estava uma segunda copia, que o upgrade substituia.
linhas.push(
  ehProtegido(branch)
    ? `Branch: **${branch}** — e um branch PROTEGIDO. Antes de implementar, perguntar se se cria branch (ver "Regra de Branch"). O hook nega commit/push aqui.`
    : `Branch: **${branch}**`
);
// Um `protegidos.json` que o projeto escreveu e nao se le (partido, um glob) cai no default — e o
// branch que ele queria proteger ficava de fora sem ninguem saber (#257).
if (PROTEGIDOS_ESTADO === "invalido") linhas.push("- `.claude/hooks/protegidos.json` **invalido** (partido, ou com um glob/nome vazio): a usar o default `main`/`master`/`develop`.");

// `--untracked-files=all`: sem ele o git colapsa diretorios nao rastreados e a contagem de
// "por commitar" fica errada — um ficheiro novo em pasta nova conta como 1 (a pasta).
const porcelain = tenta(() => git(["status", "--porcelain", "--untracked-files=all", "-z"]), "");
const sujos = porcelain ? caminhosPorcelain(porcelain).map((e) => e.caminho) : [];
if (sujos.length === 0) {
  linhas.push("Arvore de trabalho limpa.");
} else if (sujos.length <= MAX_FICHEIROS) {
  // `sujos` ja sao caminhos: o `caminhosPorcelain` tirou a coluna de estado. Um segundo
  // `slice(3)` aqui comia os primeiros 3 caracteres de cada caminho.
  linhas.push(`Por commitar (${sujos.length}): ${sujos.join(", ")}`);
} else {
  linhas.push(`Por commitar: **${sujos.length} ficheiros** — trabalho nao guardado. Cuidado com operacoes destrutivas (\`reset --hard\`, \`checkout --\`) antes de commitar.`);
}

const base = ["main", "master", "develop"].find((b) => tenta(() => git(["rev-parse", "--verify", `${b}^{commit}`])));
if (base && base !== branch) {
  const n = tenta(() => git(["rev-list", "--count", `${base}..HEAD`]));
  if (n && n !== "0") linhas.push(`Commits a frente de \`${base}\`: ${n} (nao publicados se nao houver push).`);
}

// PRs abertos: so se o `gh` existir e estiver autenticado. Nunca falhar por causa disto.
const prs = tenta(() =>
  execFileSync("gh", ["pr", "list", "--state", "open", "--limit", "5", "--json", "number,title,headRefName"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
);
if (prs) {
  const lista = tenta(() => JSON.parse(prs), []);
  if (lista.length) {
    linhas.push(`PRs abertos: ${lista.map((p) => `#${p.number} (${p.headRefName})`).join(", ")}`);
  }
}

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `Estado real do repo (hook \`SessionStart\`, nao inferido):\n- ${linhas.join("\n- ")}`,
    },
  })
);
process.exit(0);
