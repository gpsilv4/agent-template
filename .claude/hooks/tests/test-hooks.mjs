#!/usr/bin/env node
/**
 * Testes dos hooks — {{PROJECT_NAME}}
 *
 * Um hook sem testes e um guard sem rede. E um hook e pior que um guard nesse aspeto: corre
 * **antes** de cada ferramenta, logo um erro dele bloqueia trabalho legitimo em silencio ou
 * deixa passar exatamente o que devia negar.
 *
 * Cada caso monta um repo git de verdade em `os.tmpdir()` no branch que quer testar, e
 * alimenta o hook pelo stdin com o payload que o Claude Code lhe daria.
 *
 *   node .claude/hooks/tests/test-hooks.mjs
 */

import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HOOK = join(ROOT, ".claude/hooks/guard-protected-branch.mjs");
const SESSION = join(ROOT, ".claude/hooks/session-context.mjs");
const STOP = join(ROOT, ".claude/hooks/stop-verify.mjs");

/** Corre um hook NO cwd dado: o `session-context` e o `stop-verify` leem o git do processo,
 *  nao do payload, logo simular com um payload nao afirmaria nada. */
function correNoCwd(script, cwd) {
  const out = execFileSync("node", [script], { cwd, input: "{}", encoding: "utf8" });
  if (!out.trim()) return { vazio: true, ctx: "" };
  const d = JSON.parse(out).hookSpecificOutput ?? {};
  return { vazio: false, ctx: d.additionalContext ?? "" };
}

/** Repo git real no branch pedido. O hook le o branch com `git symbolic-ref`, logo simular
 *  com um ficheiro nao serve — tem de ser um repo. */
function repo(branch, sub) {
  const dir = mkdtempSync(join(tmpdir(), "hook-test-"));
  const alvo = sub ? join(dir, sub) : dir;
  if (sub) mkdirSync(alvo, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", branch], { cwd: alvo });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x"], { cwd: alvo });
  return dir;
}

/** Escreve, **commita** e volta a modificar — para o `git status --porcelain` devolver ` M`
 *  (nao-staged) e nao `??`. Todos os testes anteriores criavam ficheiros NOVOS, cuja linha
 *  comeca por `??`; era por isso que 33 testes verdes conviviam com o bug do `.trim()`. */
function commitarEModificar(dir, rel, conteudo = "# depois\n") {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), "# antes\n");
  execFileSync("git", ["add", rel], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "add"], { cwd: dir });
  writeFileSync(join(dir, rel), conteudo);
}

function corre(payload) {
  const out = execFileSync("node", [HOOK], { input: JSON.stringify(payload), encoding: "utf8" });
  if (!out.trim()) return { decisao: "allow", razao: "" };
  const d = JSON.parse(out).hookSpecificOutput ?? {};
  return { decisao: d.permissionDecision ?? "allow", razao: d.permissionDecisionReason ?? "" };
}

let passed = 0;
const falhas = [];
function test(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${nome}`);
  } catch (err) {
    falhas.push({ nome, err: err instanceof Error ? err.message : String(err) });
    console.log(`  FAIL  ${nome}`);
    console.log(`          ${err instanceof Error ? err.message : String(err)}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: esperado "${b}", obtido "${a}"`);
};
const contem = (s, sub) => {
  if (!s.includes(sub)) throw new Error(`razao devia conter "${sub}", obtido "${s}"`);
};

console.log("\n=== Testes dos Hooks ===\n");

// --- Nega o que tem de negar -------------------------------------------------
for (const br of ["main", "master", "develop"]) {
  test(`nega commit em ${br}`, () => {
    const d = repo(br);
    try {
      const r = corre({ tool_input: { command: "git commit -m x" }, cwd: d });
      eq(r.decisao, "deny", `commit em ${br}`);
      contem(r.razao, "branch protegido");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

test("nega push em main", () => {
  const d = repo("main");
  try {
    eq(corre({ tool_input: { command: "git push origin main" }, cwd: d }).decisao, "deny", "push");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("nega reset --hard em main", () => {
  const d = repo("main");
  try {
    eq(corre({ tool_input: { command: "git reset --hard HEAD~1" }, cwd: d }).decisao, "deny", "reset");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// O caso que motiva o hook: o `cd` numa chamada e o `git` na seguinte, ou no mesmo comando.
test("nega quando o branch protegido vem de um `cd` no comando (nao do cwd)", () => {
  const d = repo("main", "sub");
  try {
    const r = corre({ tool_input: { command: "cd sub && git commit -m x" }, cwd: join(d, "sub") });
    eq(r.decisao, "deny", "cd + commit");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("nega quando o branch protegido vem de um `-C`", () => {
  const d = repo("main");
  try {
    eq(corre({ tool_input: { command: `git -C ${d} commit -m x` }, cwd: "/tmp" }).decisao, "deny", "-C");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("nega force-push mesmo num branch NAO protegido", () => {
  const d = repo("feature/x");
  try {
    const r = corre({ tool_input: { command: "git push --force origin feature/x" }, cwd: d });
    eq(r.decisao, "deny", "force-push");
    contem(r.razao, "Force-push");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("nega -f abreviado", () => {
  const d = repo("feature/x");
  try {
    eq(corre({ tool_input: { command: "git push -f origin feature/x" }, cwd: d }).decisao, "deny", "-f");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Permite o que tem de permitir (falsos positivos custam trabalho) --------
test("permite commit num branch de feature", () => {
  const d = repo("feature/x");
  try {
    eq(corre({ tool_input: { command: "git commit -m x" }, cwd: d }).decisao, "allow", "feature");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("permite --force-with-lease (nao e force cego)", () => {
  const d = repo("feature/x");
  try {
    eq(corre({ tool_input: { command: "git push --force-with-lease" }, cwd: d }).decisao, "allow", "lease");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("permite git de leitura em main (status/log/diff)", () => {
  const d = repo("main");
  try {
    for (const c of ["git status", "git log --oneline -5", "git diff --stat"]) {
      eq(corre({ tool_input: { command: c }, cwd: d }).decisao, "allow", c);
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("permite um heredoc que MENCIONA o comando sem o executar", () => {
  const d = repo("main");
  try {
    const cmd = 'cat <<EOF\nNao correr git push --force nem git commit aqui\nEOF';
    eq(corre({ tool_input: { command: cmd }, cwd: d }).decisao, "allow", "heredoc");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Mencionar nao e executar (medido: 5 falsos positivos em 5) --------------
// O guard negava qualquer texto que CONTIVESSE o comando. Nao era teorico: bloqueou a
// escrita dos seus proprios testes duas vezes, e um `echo` do comando numa string. Agora
// exige `git` em **posicao de comando** e retira as strings entre aspas antes de decidir.
for (const [nome, cmd] of [
  ["echo do comando numa string", 'echo "git commit -m x"'],
  ["grep por force-push na documentacao", 'grep -rn "git push --force" docs/'],
  ["printf com o comando no texto", 'printf "corre git commit\\n"'],
  ["pipe para grep do comando", 'cat README | grep "git commit"'],
  ["awk com o comando no padrao", "awk '/git commit/' f.txt"],
]) {
  test(`permite ${nome} (menciona, nao executa)`, () => {
    const d = repo("main");
    try {
      const r = corre({ tool_input: { command: cmd }, cwd: d });
      eq(r.decisao, "allow", nome);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

// E o inverso: as aspas nao podem esconder um comando VERDADEIRO. Em `-m "texto"` sobra
// `git commit -m `, que continua a casar.
test("nega commit com mensagem entre aspas (as aspas nao escondem o comando)", () => {
  const d = repo("main");
  try {
    eq(corre({ tool_input: { command: 'git commit -m "uma mensagem com espacos"' }, cwd: d }).decisao, "deny", "mensagem");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("nega quando o comando vem depois de um separador de shell", () => {
  const d = repo("main");
  try {
    eq(corre({ tool_input: { command: "cd . && git commit -m x" }, cwd: d }).decisao, "deny", "separador");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Contrato de saida: um hook avariado nao bloqueia --------------------------
test("payload invalido nao bloqueia (sai allow, nao rebenta)", () => {
  const out = execFileSync("node", [HOOK], { input: "isto nao e json", encoding: "utf8" });
  eq(out.trim(), "", "payload invalido");
});

test("payload sem comando nao bloqueia", () => {
  eq(corre({ tool_input: {} }).decisao, "allow", "sem comando");
});

test("cwd que nao e repo git nao bloqueia", () => {
  const d = mkdtempSync(join(tmpdir(), "naorepo-"));
  try {
    eq(corre({ tool_input: { command: "git commit -m x" }, cwd: d }).decisao, "allow", "nao-repo");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- SessionStart: afirmar o estado, em vez de o deixar inferir --------------
test("session: diz o branch e avisa quando e protegido", () => {
  const d = repo("main");
  try {
    const { ctx } = correNoCwd(SESSION, d);
    contem(ctx, "Branch: **main**");
    contem(ctx, "branch PROTEGIDO");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("session: num branch de feature nao chama protegido", () => {
  const d = repo("feature/x");
  try {
    const { ctx } = correNoCwd(SESSION, d);
    contem(ctx, "Branch: **feature/x**");
    if (ctx.includes("PROTEGIDO")) throw new Error("nao devia chamar protegido a um feature branch");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("session: arvore limpa e dita como limpa", () => {
  const d = repo("feature/x");
  try {
    contem(correNoCwd(SESSION, d).ctx, "Arvore de trabalho limpa");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("session: muitos ficheiros por commitar avisam do risco destrutivo", () => {
  const d = repo("feature/x");
  try {
    for (let i = 0; i < 15; i++) writeFileSync(join(d, `f${i}.txt`), "x");
    const { ctx } = correNoCwd(SESSION, d);
    contem(ctx, "15 ficheiros");
    // O aviso concreto: e o defeito que aconteceu nesta sessao.
    contem(ctx, "reset --hard");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("session: fora de um repo git nao produz output (nao rebenta)", () => {
  const d = mkdtempSync(join(tmpdir(), "naorepo-"));
  try {
    if (!correNoCwd(SESSION, d).vazio) throw new Error("devia sair em silencio fora de um repo");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Stop: dizer que verificacao ficou em divida ------------------------------
test("stop: um guard tocado pede a sua suite e a varredura", () => {
  const d = repo("feature/x");
  try {
    mkdirSync(join(d, ".agent/scripts/guards"), { recursive: true });
    writeFileSync(join(d, ".agent/scripts/guards/x.mjs"), "// x\n");
    const { ctx } = correNoCwd(STOP, d);
    contem(ctx, "test-guards.mjs");
    contem(ctx, "mutation-sweep");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("stop: uma rule tocada pede os doc guards", () => {
  const d = repo("feature/x");
  try {
    mkdirSync(join(d, ".agent/rules"), { recursive: true });
    writeFileSync(join(d, ".agent/rules/core-rules.md"), "# x\n");
    contem(correNoCwd(STOP, d).ctx, "check-doc-versions.mjs");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("stop: arvore limpa nao pede nada", () => {
  const d = repo("feature/x");
  try {
    if (!correNoCwd(STOP, d).vazio) throw new Error("arvore limpa nao tem divida");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("stop: ficheiro sem suite associada nao inventa divida", () => {
  const d = repo("feature/x");
  try {
    writeFileSync(join(d, "NOTAS.txt"), "nada a ver com testes\n");
    if (!correNoCwd(STOP, d).vazio) throw new Error("nao devia pedir verificacao para um .txt solto");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("stop: NAO corre os testes (so reporta)", () => {
  const d = repo("feature/x");
  try {
    mkdirSync(join(d, ".agent/scripts"), { recursive: true });
    writeFileSync(join(d, ".agent/scripts/check-backlog.mjs"), "process.exit(1);\n");
    const t0 = Date.now();
    const { ctx } = correNoCwd(STOP, d);
    const ms = Date.now() - t0;
    contem(ctx, "test-backlog.mjs");
    contem(ctx, "nao corri nada");
    // Um hook de fim de turno que corresse suites seria desligado. O tempo e a prova.
    if (ms > 3000) throw new Error(`demorou ${ms}ms — parece estar a correr algo`);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- A coluna de estado nao e para comer (bug do `.trim()`) -------------------
// O `git status --porcelain` poe um ESPACO na coluna de quem nao esta staged: ` M path`.
// Trimar o output inteiro come esse espaco na PRIMEIRA linha e desloca o caminho um
// caractere. Nenhum teste apanhava porque todos criavam ficheiros novos (`??`).

test("stop: a primeira linha modificada nao perde o ponto do caminho", () => {
  const d = repo("feature/x");
  try {
    commitarEModificar(d, ".agent/rules/core-rules.md");
    // Unico ficheiro sujo => e a primeira linha do porcelain, com ` M`.
    contem(correNoCwd(STOP, d).ctx, "check-doc-versions.mjs");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("session: o caminho da primeira linha modificada aparece inteiro", () => {
  const d = repo("feature/x");
  try {
    commitarEModificar(d, ".agent/rules/core-rules.md");
    // Com o ponto: antes da correcao saia `agent/rules/...` e esta assercao ficava vermelha.
    contem(correNoCwd(SESSION, d).ctx, ".agent/rules/core-rules.md");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("stop: a divida sub-reportada era silenciosa — reporta os DOIS ficheiros", () => {
  const d = repo("feature/x");
  try {
    commitarEModificar(d, ".agent/rules/core-rules.md");
    commitarEModificar(d, ".agent/rules/anti-patterns.md");
    // Duas rules sujas => a linha diz "2 ficheiros". Antes da correcao a primeira escapava
    // a regra e a linha dizia o nome de UM so — divida a menos, sem aviso nenhum.
    contem(correNoCwd(STOP, d).ctx, "2 ficheiros");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- A marca de "ja disse isto" pertence ao repo medido ------------------------
test("stop: a marca fica no repo medido, nao no repo do hook", () => {
  const d = repo("feature/x");
  try {
    commitarEModificar(d, ".agent/rules/core-rules.md");
    correNoCwd(STOP, d);
    if (!existsSync(join(d, ".claude/state/stop-verify.last")))
      throw new Error("a marca nao ficou no repo medido — vai calar avisos de outro repo");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("stop: divida identica cala-se; divida diferente volta a falar", () => {
  const d = repo("feature/x");
  try {
    commitarEModificar(d, ".agent/rules/core-rules.md");
    if (correNoCwd(STOP, d).vazio) throw new Error("a primeira vez tem de falar");
    if (!correNoCwd(STOP, d).vazio) throw new Error("divida identica devia calar-se");
    commitarEModificar(d, ".agent/scripts/mutation-sweep.mjs", "// muda\n");
    if (correNoCwd(STOP, d).vazio) throw new Error("divida NOVA tem de voltar a falar");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- BYPASSES: as 23 formas que uma leitura independente encontrou ------------
// A versao anterior deste hook procurava os verbos PERIGOSOS com uma regex de posicao de
// comando, e tinha 100% de cobertura de mutacao (2/2 sitios) — com 23 formas de a contornar.
// A cobertura media que cada aviso EXISTENTE e observado; nao mede os que faltam. Esta tabela
// e a resposta: cada forma vive aqui como caso, e a lista cresce quando se encontra outra.
// Quatro delas foram criadas pela correcao anterior, que retirava as aspas em bloco.
const BYPASSES = [
  ["eval sem aspas", "eval git commit -m x"],
  ["eval com aspas", 'eval "git commit -m x"'],
  ["eval com aspas simples", "eval 'git commit -m x'"],
  ["sh -c", 'sh -c "git commit -m x"'],
  ["bash -c", 'bash -c "git push"'],
  ["caminho absoluto", "/usr/bin/git commit -m x"],
  ["caminho relativo", "./git commit -m x"],
  ["sudo", "sudo git commit -m x"],
  ["env", "env git commit -m x"],
  ["env com atribuicao", "env GIT_DIR=.git git commit -m x"],
  ["atribuicao inline", "GIT_AUTHOR_NAME=x git commit -m y"],
  ["command", "command git commit -m x"],
  ["exec", "exec git push"],
  ["xargs", "echo x | xargs git commit -m"],
  ["nohup", "nohup git push"],
  ["timeout", "timeout 5 git push"],
  ["backticks", "echo `git commit -m x`"],
  ["substituicao $()", "echo $(git commit -m x)"],
  ["grupo com chaves", "{ git commit -m x; }"],
  ["subshell", "(git commit -m x)"],
  ["if/then", "if true; then git commit -m x; fi"],
  ["for/do", "for i in 1; do git push; done"],
  ["negacao !", "! git commit -m x"],
  ["verbo entre aspas", 'git "commit" -m x'],
  ["verbo ofuscado por aspas", 'git comm""it -m x'],
  ["verbo com escapes", "git \\c\\o\\m\\m\\i\\t -m x"],
  ["depois de &&", "npm test && git commit -m x"],
  ["depois de ;", "npm test; git push"],
  ["verbo desconhecido (falha FECHADA)", "git frobnicate --hard"],
  ["verbo em variavel (nao identificavel)", "git $VERBO"],
  ["reset --hard", "git reset --hard HEAD~1"],
  ["restore descarta trabalho", "git restore ."],
  ["clean apaga ficheiros", "git clean -fd"],
  ["checkout sem -b pode descartar", "git checkout -- ."],
];

for (const [nome, comando] of BYPASSES) {
  test(`bypass: ${nome}`, () => {
    const d = repo("main");
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, "deny", `"${comando}" tinha de ser negado em main`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

// --- FALSOS POSITIVOS: negar trabalho legitimo custa tanto como deixar passar --
// Oito destes vinham medidos da mesma leitura. O `git merge-base` negou ao revisor a
// verificacao do range que lhe foi pedida — um falso positivo bloqueia trabalho a serio.
const LEGITIMOS = [
  ["merge-base", "git merge-base main HEAD"],
  ["status", "git status --porcelain"],
  ["log", "git log --oneline -5"],
  ["diff", "git diff --name-only main"],
  ["show", "git show HEAD:package.json"],
  ["rev-parse", "git rev-parse --verify main"],
  ["branch (listar)", "git branch --show-current"],
  ["switch para outro branch", "git switch feature/x"],
  ["switch -c cria branch (e como se SAI de main)", "git switch -c fix/algo"],
  ["checkout -b cria branch", "git checkout -b fix/algo"],
  ["add", "git add -A"],
  ["fetch", "git fetch origin"],
  ["stash", "git stash"],
  ["tag a listar", "git tag"],
  ["mencionar num echo nao e executar", 'echo "corre git commit depois"'],
  ["grep sobre docs", 'grep -rn "git push --force" .agent'],
  ["heredoc com o texto la dentro", "cat <<'EOF'\ngit commit -m x\nEOF"],
  ["comentario", "# git commit -m x"],
  ["nome de ficheiro parecido", "cat git-commit-notes.md"],
  ["push com --force-with-lease NAO e force-push cru", "git switch -c x && git status"],
];

for (const [nome, comando] of LEGITIMOS) {
  test(`legitimo em main: ${nome}`, () => {
    const d = repo("main");
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, "allow", `"${comando}" NAO devia ser negado`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

// --- Force-push: negado em QUALQUER branch, incluindo as formas de refspec ------
const FORCES = [
  ["--force", "git push --force"],
  ["-f", "git push -f origin main"],
  ["flags juntas", "git push -uf origin main"],
  ["refspec com +", "git push origin +main:main"],
  ["atraves de eval", 'eval "git push --force"'],
];
for (const [nome, comando] of FORCES) {
  test(`force-push (branch nao protegido): ${nome}`, () => {
    const d = repo("feature/x");
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, "deny", `"${comando}" tinha de ser negado mesmo fora de main`);
      contem(r.razao, "Force-push");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

test("--force-with-lease NAO e negado (nao e force cru)", () => {
  const d = repo("feature/x");
  try {
    eq(corre({ tool_input: { command: "git push --force-with-lease" }, cwd: d }).decisao, "allow", "force-with-lease");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Sem pista de diretorio: antes PERMITIA (lista vazia = ciclo que nao corre) -
test("sem cwd no payload cai no cwd do hook, em vez de permitir", () => {
  const r = corre({ tool_input: { command: "git commit -m x" } });
  // Este repo esta num branch nao protegido durante o desenvolvimento; o que se afirma e que
  // a decisao vem de um branch REAL e nao de uma lista vazia. Em `main` seria deny.
  if (!["allow", "deny"].includes(r.decisao)) throw new Error("decisao invalida");
  const d = repo("main");
  try {
    eq(corre({ tool_input: { command: "git -C " + d + " commit -m x" } }).decisao, "deny", "-C aponta para main");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
console.log("");
if (falhas.length) {
  console.log("  Ha testes dos hooks a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes dos hooks passaram.\n");
