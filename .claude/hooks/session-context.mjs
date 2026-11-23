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
import { existsSync, readFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";

const MAX_FICHEIROS = 12; // acima disto, so a contagem — a lista deixa de informar

/**
 * A REDE DE ARRANQUE (#589): um hook ligado no `settings.json` VAZIO ou EM FALTA, ou um ficheiro que ele importa (o
 * fecho dos imports relativos, tambem as libs de `.agent/scripts/lib/`) vazio ou em falta. Um hook vazio sai `0`, e um
 * que importe uma lib vazia sai `1`: no Claude Code so o `2` bloqueia, logo os dois desligam a fronteira CALADOS (uma
 * copia por redireccionamento do `$TPL` deixou seis no derivado A). O `SessionStart` nao bloqueia — mas diz.
 * Corre PRIMEIRO e so com `fs`/`path`: as libs do projeto podem ser elas as vazias. Fica de fora, dito: um ficheiro
 * TRUNCADO (nao vazio), e este proprio hook vazio. Devolve as linhas do aviso, ou nada.
 */
function fronteiraDesligada() {
  const raiz = process.env.CLAUDE_PROJECT_DIR || tenta(() => git(["rev-parse", "--show-toplevel"]));
  if (!raiz) return [];
  const ligados = new Set();
  // So a chave `hooks`, como o Guard 11b: o `allow` tambem nomeia hooks (`Bash(node .claude/hooks/x.mjs)`), e um hook
  // tirado com a entrada do `allow` deixada dava "em falta" a cada sessao (o leitor do #589). Um JSON partido: calado.
  // Ancorado em `.claude/hooks/`: um `.githooks/x.mjs` tambem contem "hooks/".
  for (const s of [".claude/settings.json", ".claude/settings.local.json"]) {
    const hooks = JSON.stringify(tenta(() => JSON.parse(readFileSync(join(raiz, s), "utf8")).hooks, null) ?? {});
    for (const m of hooks.matchAll(/\.claude\/hooks\/([\w-]+\.mjs)/g)) ligados.add(join(raiz, ".claude/hooks", m[1]));
  }
  const vistos = new Set(), vazios = [], faltam = [];
  const visita = (f) => {
    if (vistos.has(f) || vistos.size > 300) return;
    vistos.add(f);
    if (!existsSync(f)) return void faltam.push(f);
    const t = tenta(() => readFileSync(f, "utf8"));
    if (t === null) return;
    if (!t.trim()) return void vazios.push(f);
    for (const m of t.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["'](\.\.?\/[^"']+)["']/gm)) visita(resolve(dirname(f), m[1]));
  };
  for (const f of ligados) visita(f);
  if (!vazios.length && !faltam.length) return [];
  const nomes = (fs) => fs.map((f) => `\`${relative(raiz, f)}\``).join(", ");
  return [
    `**FRONTEIRA DESLIGADA** (#589): ${[vazios.length ? `vazio(s): ${nomes(vazios)}` : "", faltam.length ? `em falta: ${nomes(faltam)}` : ""].filter(Boolean).join("; ")}. ` +
      "Um hook vazio sai 0, e um que importe um ficheiro vazio ou em falta sai 1 — no Claude Code so o 2 bloqueia, logo nenhum nega nada. " +
      "Repor pelo git (`git status`, `git restore <f>`) antes de continuar.",
  ];
}


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

const linhas = tenta(fronteiraDesligada, []);

// O parser do `git status --porcelain -z` vive numa so copia (A3 do #195), partilhada com o
// `stop-verify.mjs`. Aqui so interessa o caminho. Por `import()`, e depois da rede (#589): um import ESTATICO de uma
// lib vazia rebentava este hook, e a sessao ficava sem o contexto e sem o aviso. O `import("...")` literal e o que a
// rede segue — um helper com o caminho num argumento escondia-lhe estas duas libs (medido).
const { caminhosPorcelain } = (await import("./lib/porcelain.mjs").catch(() => null)) ?? {};
const { ehProtegido, PROTEGIDOS_ESTADO } = (await import("./lib/protegidos.mjs").catch(() => null)) ?? {};

const branch = tenta(() => git(["symbolic-ref", "--short", "HEAD"])) ?? tenta(() => `(detached em ${git(["rev-parse", "--short", "HEAD"])})`);
// Nao e um repo git: nada a dizer — salvo a fronteira desligada, que se diz na mesma.
if (!branch && !linhas.length) process.exit(0);

// A mesma lista que o guard usa (#257): aqui estava uma segunda copia, que o upgrade substituia.
// Sem a lib (vazia, #589), o branch diz-se na mesma; o aviso de cima ja diz porque falta o resto.
if (branch) linhas.push(
  typeof ehProtegido === "function" && ehProtegido(branch)
    ? `Branch: **${branch}** — e um branch PROTEGIDO. Antes de implementar, perguntar se se cria branch (ver "Regra de Branch"). O hook nega commit/push aqui.`
    : `Branch: **${branch}**`
);
// Um `protegidos.json` que o projeto escreveu e nao se le (partido, um glob) cai no default — e o
// branch que ele queria proteger ficava de fora sem ninguem saber (#257).
if (PROTEGIDOS_ESTADO === "invalido") linhas.push("- `.claude/hooks/protegidos.json` **invalido** (partido, ou com um glob/nome vazio): a usar o default `main`/`master`/`develop`.");

// `--untracked-files=all`: sem ele o git colapsa diretorios nao rastreados e a contagem de
// "por commitar" fica errada — um ficheiro novo em pasta nova conta como 1 (a pasta).
const porcelain = typeof caminhosPorcelain === "function" && branch ? tenta(() => git(["status", "--porcelain", "--untracked-files=all", "-z"]), "") : null;
const sujos = porcelain ? caminhosPorcelain(porcelain).map((e) => e.caminho) : [];
if (porcelain === null) {
  // Sem a lib (#589) ou sem repo: calado sobre a arvore — "limpa" seria uma afirmacao que nao se mediu.
} else if (sujos.length === 0) {
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
