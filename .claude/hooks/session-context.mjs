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

/** Caminhos de um `git status --porcelain -z`.
 *
 *  `-z` e obrigatorio, nao cosmetico: SEM ele o git **cita** os caminhos que tenham espacos
 *  ou bytes nao-ASCII (`?? ".agent/guards/caf\303\251.mjs"`), e o `slice(3)` entrega a aspa
 *  e os escapes octais ao matcher — nenhuma regra casa e a divida e sub-reportada em
 *  SILENCIO, que e o defeito que o `stop-verify` existe para evitar. Medido: 1 de 3 ficheiros
 *  vistos. E a segunda cara do `AP5` (o `.trim()` foi a primeira).
 *
 *  Com `-z` as entradas vem separadas por NUL e os caminhos crus. Renomeacoes e copias
 *  ocupam DUAS entradas (`R  novo\0antigo\0`): a segunda e um caminho nu, sem coluna de
 *  estado, logo um `slice(3)` cego comia-lhe 3 caracteres. Por isso sao consumidas ao par.
 *
 *  (Existe uma copia desta funcao em `stop-verify.mjs` — sao dois hooks independentes
 *  e o template evita acoplar um ao outro; se mudar aqui, mudar la.) */
function caminhosPorcelain(saida) {
  const entradas = saida.split("\0").filter(Boolean);
  const caminhos = [];
  for (let i = 0; i < entradas.length; i++) {
    const estado = entradas[i].slice(0, 2);
    caminhos.push(entradas[i].slice(3));
    // `R`/`C` trazem o caminho de origem como entrada seguinte, sem coluna de estado.
    if (estado[0] === "R" || estado[0] === "C") i++;
  }
  return caminhos;
}

const MAX_FICHEIROS = 12; // acima disto, so a contagem — a lista deixa de informar

function git(args) {
  // `.replace(/\n+$/)` e NAO `.trim()`: no `git status --porcelain` a coluna de estado do
  // ficheiro **nao staged** e um espaco (` M path`), logo `.trim()` come o espaco da PRIMEIRA
  // linha e desloca o caminho um caractere — `.agent/x` chegava como `agent/x`. Media-se: o
  // caminho aparecia sem o ponto e (no `stop-verify`) nao casava com regra nenhuma.
  // Apara so o que sobra no fim, e os DOIS separadores possiveis (`\n` nas saidas normais,
  // `\0` nas que usam `-z`). Nunca `.trim()` em bloco: era o `AP5`.
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

const PROTEGIDOS = new Set(["main", "master", "develop"]);
linhas.push(
  PROTEGIDOS.has(branch)
    ? `Branch: **${branch}** — e um branch PROTEGIDO. Antes de implementar, perguntar se se cria branch (ver "Regra de Branch"). O hook nega commit/push aqui.`
    : `Branch: **${branch}**`
);

// `--untracked-files=all`: sem ele o git colapsa diretorios nao rastreados e a contagem de
// "por commitar" fica errada — um ficheiro novo em pasta nova conta como 1 (a pasta).
const porcelain = tenta(() => git(["status", "--porcelain", "--untracked-files=all", "-z"]), "");
const sujos = porcelain ? caminhosPorcelain(porcelain) : [];
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
