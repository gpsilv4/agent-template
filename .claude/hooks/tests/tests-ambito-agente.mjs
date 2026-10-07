/**
 * O ambito do Bash de um subagente (`lib/ambito-agente.mjs` e `guard-subagent-bash.mjs`) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `tools: Bash(git diff:*)` do `code-reviewer` nao restringia nada (S-01 do #195).
 * Afirma-se o contrato da funcao (o que o frontmatter diz, o que cabe) e o hook de ponta a ponta,
 * com um projeto montado numa sandbox — nunca os agentes deste repo (`TP3`).
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ambitoBash, cabeNoAmbito, agenteChamado, razaoAmbito, palavras, composto } from "../lib/ambito-agente.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-ambito-agente.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "..", "guard-subagent-bash.mjs");
const agente = (nome, tools) => `---\nname: ${nome}\ndescription: x\n${tools === null ? "" : `tools: ${tools}\n`}---\n\ncorpo\n`;

/** Corre o hook com um projeto de agentes na sandbox. */
function correHook(agentes, payload) {
  const raiz = mkdtempSync(join(tmpdir(), "hook-ambito-"));
  try {
    mkdirSync(join(raiz, ".claude/agents"), { recursive: true });
    for (const [f, md] of Object.entries(agentes)) writeFileSync(join(raiz, ".claude/agents", f), md);
    const out = execFileSync("node", [HOOK], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    });
    if (!out.trim()) return { decisao: "allow", razao: "" };
    const d = JSON.parse(out).hookSpecificOutput ?? {};
    return { decisao: d.permissionDecision ?? "allow", razao: d.permissionDecisionReason ?? "" };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

const LEITOR = { "leitor.md": agente("leitor", "Read, Grep, Bash(git diff:*)") };
/** Regras de prefixo, como o `ambitoBash` as devolve. */
const P = (...t) => t.map((texto) => ({ texto, prefixo: true }));
const DIFF = P("git diff");
const pede = (cmd, tipo = "leitor") => ({ agent_type: tipo, agent_id: "a1", tool_input: { command: cmd } });

export function registar({ test, eq, contem }) {
  // --- o frontmatter -----------------------------------------------------------------
  test("ambito: `Bash` nu e livre", () => {
    eq(ambitoBash(agente("x", "Read, Bash")).livre, true, "o `debugger` corre o que quiser, de proposito");
  });

  test("ambito: sem `tools:` herda tudo, e nao ha nada a impor", () => {
    eq(ambitoBash(agente("x", null)).livre, true, "sem `tools:` o agente nao declarou restricao");
  });

  test("ambito: `Bash(prefixo:*)` restringe ao prefixo", () => {
    eq(JSON.stringify(ambitoBash(agente("x", "Read, Bash(git diff:*), Bash(git log:*)"))),
      JSON.stringify({ livre: false, regras: [...P("git diff"), ...P("git log")] }), "os prefixos saem sem o `:*`");
  });

  test("ambito: `tools:` sem Bash nenhum restringe a nada", () => {
    eq(JSON.stringify(ambitoBash(agente("x", "Read, Grep, Glob"))), JSON.stringify({ livre: false, regras: [] }),
      "um agente que nao declara Bash nao corre Bash");
  });

  test("ambito: a forma em lista do YAML tambem se le", () => {
    const md = "---\nname: x\ntools:\n  - Read\n  - Bash(git diff:*)\n---\n";
    eq(JSON.stringify(ambitoBash(md)), JSON.stringify({ livre: false, regras: DIFF }), "`tools:` em lista");
  });

  // --- o que cabe --------------------------------------------------------------------
  test("ambito: o prefixo com argumentos cabe, e sozinho tambem", () => {
    eq(cabeNoAmbito("git diff --stat main...HEAD", DIFF), true, "com argumentos");
    eq(cabeNoAmbito("git diff", DIFF), true, "sozinho");
  });

  test("ambito: fronteira de palavra — `git diffx` e `git -C x diff` nao cabem", () => {
    eq(cabeNoAmbito("git diffx", DIFF), false, "outro verbo com o mesmo inicio");
    eq(cabeNoAmbito("git -C /x diff", DIFF), false, "o prefixo e o texto, nao o verbo");
  });

  for (const cmd of ["git diff; rm -rf x", "git diff && sed -i s/a/b/ f", "git diff | sh", "git diff > f", "git diff $(rm x)", "git diff `rm x`", "git diff\nrm x", "git diff & rm x"]) {
    test(`ambito: composto nega mesmo com o prefixo a frente — ${JSON.stringify(cmd)}`, () => {
      eq(cabeNoAmbito(cmd, DIFF), false, "falha fechada");
    });
  }

  // --- as formas que a leitura independente encontrou mal lidas -----------------------
  test("ambito: a forma em fluxo do YAML (`[A, B]`) tambem se le", () => {
    eq(ambitoBash(agente("x", "[Read, Bash]")).livre, true, "`Bash` nu dentro de `[ ]`");
    eq(JSON.stringify(ambitoBash(agente("x", "[Read, Bash(git diff:*)]"))), JSON.stringify({ livre: false, regras: DIFF }), "o `]` nao cola ao item");
  });

  test("ambito: `Bash(x *)` e prefixo, e `Bash(x)` e exacto", () => {
    eq(JSON.stringify(ambitoBash(agente("x", "Bash(git diff *)"))), JSON.stringify({ livre: false, regras: DIFF }), "a forma com espaco");
    const exacto = ambitoBash(agente("x", "Bash(git status)"));
    eq(cabeNoAmbito("git status", exacto.regras), true, "o comando exacto cabe");
    eq(cabeNoAmbito("git status --porcelain", exacto.regras), false, "sem wildcard nao leva argumentos");
  });

  test("ambito: `tools:` vazio e o mesmo que nao o ter", () => {
    eq(ambitoBash(agente("x", "")).livre, true, "nao declarou restricao");
  });

  test("ambito: linha em branco na lista, comentario, aspas, CRLF e BOM", () => {
    eq(JSON.stringify(ambitoBash("---\nname: x\ntools:\n\n  - Read\n  - \"Bash(git diff:*)\"\n---\n")), JSON.stringify({ livre: false, regras: DIFF }), "linha em branco e aspas");
    eq(ambitoBash(agente("x", "Read, Bash # o debugger corre o que quiser")).livre, true, "o comentario nao cola ao `Bash`");
    eq(JSON.stringify(ambitoBash("---\r\nname: x\r\ntools: Read, Bash(git diff:*)\r\n---\r\n")), JSON.stringify({ livre: false, regras: DIFF }), "CRLF");
    eq(agenteChamado("x", [["x.md", `\uFEFF${agente("x", "Read")}`]]) !== null, true, "um BOM nao esconde o agente");
  });

  test("ambito: `--output` e `--ext-diff` nao cabem, mesmo com o prefixo", () => {
    eq(cabeNoAmbito("git diff --output=/tmp/x", DIFF), false, "escreve num ficheiro");
    eq(cabeNoAmbito("git diff --output /tmp/x", DIFF), false, "na forma separada");
    eq(cabeNoAmbito("git diff --ext-diff", DIFF), false, "corre um programa");
  });

  test("ambito: `--output` entre aspas ou com escape tambem nao cabe (#237)", () => {
    eq(cabeNoAmbito('git diff "--output=/tmp/x"', DIFF), false, "a shell tira as aspas");
    eq(cabeNoAmbito("git diff '--output=/tmp/x'", DIFF), false, "aspas simples");
    eq(cabeNoAmbito("git diff --output\\=/tmp/x", DIFF), false, "com escape");
  });

  test("ambito: as opcoes do ugrep que executam ou escrevem nao cabem (#237)", () => {
    const G = P("grep");
    eq(cabeNoAmbito("grep --filter='*:touch x' -r a .", G), false, "`--filter` corre um comando");
    eq(cabeNoAmbito("grep --filter-magic-label=x -r a .", G), false, "`--filter-magic-label`");
    eq(cabeNoAmbito("grep --save-config", G), false, "`--save-config` escreve um ficheiro");
    eq(cabeNoAmbito("grep -rn TODO .agent", G), true, "um grep normal continua a caber");
  });

  test("ambito: as formas que a shell entrega como `--output` nao cabem (segunda leitura do #237)", () => {
    for (const c of ["git diff --output''=/tmp/x", 'git diff --"output=/tmp/x"', 'git diff --out"put"=/tmp/x', "git diff \\-\\-output=/tmp/x"]) {
      eq(cabeNoAmbito(c, DIFF), false, `"${c}" chega ao git como --output`);
    }
  });

  test("ambito: uma aspa escapada nao esconde um `--output` sem aspas (regressao do #237)", () => {
    eq(cabeNoAmbito("git log --grep=can\\'t --output=/tmp/x --format='%h'", P("git log")), false, "aspa simples escapada");
    eq(cabeNoAmbito('git log --grep="a\\"b" --output=/tmp/x --format="%h"', P("git log")), false, "aspa dupla escapada");
    eq(cabeNoAmbito("grep -rn can\\'t . --filter='*:touch /tmp/p'", P("grep")), false, "o `--filter` do ugrep");
  });

  // #238: o `|` entre aspas e um padrao, nao um pipe. Os greps de detecao do catalogo de
  // anti-padroes usam-no, e o `/review` manda o leitor independente corre-los.
  test("ambito: um `|`, `<`, `>` ou `&` ENTRE ASPAS nao compoe (#238)", () => {
    const GG = [...P("git grep"), ...P("grep")];
    for (const c of [
      'git grep -nE "inalcancavel|codigo morto" -- .agent .claude',
      "git grep -nE '\\|\\s*grep\\s+-[a-zA-Z]*q' -- '*.yml' '*.sh' '*.mjs'",
      "git grep -nE '(-m|--message|--body) \"[^\"]*`'",
      "grep -rn 'a<b>c&d' .agent",
      "grep a\\|b f",
    ]) eq(cabeNoAmbito(c, GG), true, `"${c}" e um padrao`);
  });

  test("ambito: fora de aspas, e a crase ou o `$(` entre aspas duplas, continuam a compor (#238)", () => {
    for (const c of ["grep a f; rm y", "grep a f | sh", "grep a f > o", 'grep "$(rm y)" f', 'grep "a`rm y`" f', "grep `rm y` f", 'grep "a f', "grep 'a f"]) {
      eq(composto(c), true, `"${c}" compoe ou nao fecha`);
    }
    eq(composto("grep '$(rm y)' f"), false, "entre aspas simples o `$(` e texto");
  });

  // Da leitura independente do #238, todos medidos a passar pelo hook antes desta correccao.
  test("ambito: `git grep -O<cmd>` executa e nao cabe, agrupado ou abreviado (#238)", () => {
    const GG = P("git grep");
    for (const c of ['git grep -O"echo x" -e y -- f', 'git grep -nO"echo x" -e y', "git grep --open-files-in-pager=echo -e y", "git grep --open=echo -e y", "git grep --op=echo y"]) {
      eq(cabeNoAmbito(c, GG), false, `"${c}" corre um comando`);
    }
    eq(cabeNoAmbito('git grep -nE "Opcao|-O" -- .agent', GG), true, "um `-O` dentro do padrao citado nao e a opcao");
  });

  test("ambito: `$'...'` e o `(` do zsh compoem fora de aspas (#238)", () => {
    eq(composto("grep -c $'\\'' /dev/null ; echo x #'"), true, "`\\'` dentro de `$'...'` desalinhava as aspas");
    eq(composto('grep $"x" f'), true, "`$\"...\"`, por simetria");
    eq(composto("grep -H x =(echo x)"), true, "o `=(cmd)` do zsh");
    eq(composto("grep x *(e:'rm y':)"), true, "qualificador de glob do zsh");
    eq(composto("git grep -nE 'cpSync\\(|x' -- f"), false, "o `(` entre aspas e um padrao");
  });

  // Da segunda leitura do #238: as quatro escreveram um ficheiro pelo hook antes desta correccao.
  test("ambito: expansoes do zsh que escondem uma opcao ou correm um comando nao cabem (#238)", () => {
    const D = P("git diff");
    for (const c of [
      'grep "${(e):-\\$(touch /tmp/p)}" /dev/null',
      "git diff $X--output=/tmp/p --stat",
      "git diff ${X}--output=/tmp/p",
      "git diff --stat {--output=/tmp/p,HEAD}",
      "git diff --out\\\nput=/tmp/p --stat",
      'grep "$HOME" f',
    ]) eq(cabeNoAmbito(c, [...D, ...P("grep")]), false, `"${c}" e expandido pela shell`);
    eq(cabeNoAmbito("grep -n '$x' f", P("grep")), true, "um `$` entre aspas simples e texto");
  });

  test("ambito: `palavras` parte como a shell", () => {
    eq(JSON.stringify(palavras(`a "b c" 'd e' f\\ g --o"ut"='x y'`)), JSON.stringify(["a", "b c", "d e", "f g", "--out=x y"]), "aspas, escapes e colagem");
  });

  test("ambito: um padrao de pesquisa citado com ` --output` dentro continua a caber (#237)", () => {
    eq(cabeNoAmbito('grep -rn "git diff --output" .agent', P("grep")), true, "e um padrao, nao uma opcao");
    eq(cabeNoAmbito("git log --grep 'x --filter y'", P("git log")), true, "idem, dentro de outra opcao");
  });

  test("ambito: o agente encontra-se pelo `name:`, nao pelo nome do ficheiro", () => {
    eq(agenteChamado("leitor", [["outro-nome.md", agente("leitor", "Read")]]) !== null, true, "pelo `name:`");
    eq(agenteChamado("nao-existe", [["a.md", agente("leitor", "Read")]]), null, "um agente que o projeto nao define");
  });

  test("ambito: a razao nomeia o agente e os prefixos", () => {
    const r = razaoAmbito("leitor", "node x.mjs", agente("leitor", "Bash(git diff:*)"));
    contem(r ?? "", "`leitor`");
    contem(r ?? "", "`git diff ...`");
  });

  // --- o hook, de ponta a ponta ------------------------------------------------------
  test("hook: o subagente restrito nao corre o que nao declara", () => {
    const r = correHook(LEITOR, pede("node .agent/scripts/tests/test-guards.mjs"));
    eq(r.decisao, "deny", "o caso medido no S-01");
    contem(r.razao, "`git diff ...`");
  });

  test("hook: o subagente restrito corre o que declara", () => {
    eq(correHook(LEITOR, pede("git diff --stat main...HEAD")).decisao, "allow", "dentro do ambito");
  });

  test("hook: o agente principal (sem `agent_type`) nao e julgado", () => {
    eq(correHook(LEITOR, { tool_input: { command: "node x.mjs" } }).decisao, "allow", "o hook so olha para subagentes");
  });

  test("hook: um subagente com `Bash` nu corre o que quiser", () => {
    eq(correHook({ "dbg.md": agente("dbg", "Read, Bash") }, pede("node x.mjs; rm y", "dbg")).decisao, "allow", "livre");
  });

  test("hook: um subagente que o projeto nao define nao e julgado", () => {
    eq(correHook(LEITOR, pede("node x.mjs", "general-purpose")).decisao, "allow", "fora do projeto");
  });

  test("hook: payload que nao e JSON permite (um hook avariado nao bloqueia)", () => {
    const out = execFileSync("node", [HOOK], { input: "nao e json", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: tmpdir() } });
    eq(out.trim(), "", "sem decisao, permite");
  });

  test("hook: sem `.claude/agents/` permite", () => {
    eq(correHook({}, pede("node x.mjs")).decisao, "allow", "nenhum agente definido");
  });

  test("hook: um subagente sem Bash declarado nao corre Bash", () => {
    const r = correHook({ "aud.md": agente("aud", "Read, Grep") }, pede("ls", "aud"));
    eq(r.decisao, "deny", "nao declara Bash");
    contem(r.razao, "nao declara Bash");
  });
}
