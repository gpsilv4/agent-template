/**
 * Testes dos Doc Guards — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS: para cada guard, quebra-se deliberadamente o que ele promete
 * verificar e afirma-se que avisa E sai != 0. Um guard que passa quando devia falhar
 * e pior que guard nenhum, porque produz confianca infundada — foi exatamente assim
 * que dois guards deste ficheiro ficaram anos sem apanhar nada.
 *
 * Sem dependencias e sem package.json (o template nao traz nenhum, por desenho):
 * corre com `node`, como os restantes scripts de `.agent/scripts/`.
 *
 * Cada teste corre numa COPIA em tmp, nunca no repo. O guard ancora-se a raiz
 * derivada da sua propria localizacao, logo copiar o script para a sandbox faz com
 * que ele valide a sandbox — e por isso que os testes conseguem mutar os inputs.
 *
 * Uso:
 *   node .agent/scripts/test-guards.mjs
 *
 * Sai != 0 se algum teste falhar. Opt-in no CI (descomentar em .github/workflows/ci.yml).
 */

import { cpSync, mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { tmpdir } from "os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUARD = ".agent/scripts/check-doc-versions.mjs";

// Conjunto minimo que os guards leem. Copiado a cada teste para isolar mutacoes.
const FIXTURE_PATHS = [
  ".agent/rules",
  ".agent/workflows",
  ".agent/context",
  ".agent/scripts",
  ".claude/commands",
  ".claude/settings.json",
  ".gemini/commands",
  "CLAUDE.md",
  "GEMINI.md",
  "AGENTS.md",
  ".nvmrc",
  "src/docs/CHANGELOG.md",
  "src/docs/agent-guide.md",
];

let passed = 0;
const failures = [];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "guard-test-"));
  for (const p of FIXTURE_PATHS) {
    const src = join(ROOT, p);
    if (!existsSync(src)) continue;
    const dest = join(dir, p);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
  return dir;
}

function runGuard(dir, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [join(dir, GUARD)], {
      cwd: cwd ?? dir,
      encoding: "utf8",
    });
    return { code: 0, out: stdout };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

/**
 * @param name    descricao do cenario
 * @param mutate  (dir) => void — a quebra a aplicar; omitir para o baseline
 * @param expect  { code, includes?: string[], excludes?: string[], cwd?: string }
 */
function test(name, mutate, expect) {
  const dir = sandbox();
  try {
    if (mutate) mutate(dir);
    const { code, out } = runGuard(dir, expect.cwd);
    const problems = [];
    if (code !== expect.code) problems.push(`exit esperado ${expect.code}, obtido ${code}`);
    for (const s of expect.includes ?? []) if (!out.includes(s)) problems.push(`output devia conter "${s}"`);
    for (const s of expect.excludes ?? []) if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
    if (problems.length) {
      failures.push({ name, problems, out });
      console.log(`  FAIL  ${name}`);
      for (const p of problems) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Helpers de mutacao
const file = (dir, p) => join(dir, p);
const readF = (dir, p) => readFileSync(file(dir, p), "utf8");
const writeF = (dir, p, s) => writeFileSync(file(dir, p), s);
const dropLinesContaining = (dir, p, needle) =>
  writeF(dir, p, readF(dir, p).split("\n").filter((l) => !l.includes(needle)).join("\n"));

console.log("\n=== Testes dos Doc Guards ===\n");

// --- Baseline -----------------------------------------------------------------
test("baseline: repo intacto passa", null, {
  code: 0,
  includes: ["Todos os guards de documentacao passaram", "guard(s) executado(s)"],
});

// --- Independencia do cwd (o defeito mais grave: 0 guards + "todos passaram") --
test("cwd: correr de um subdiretorio nao desliga os guards", (dir) => {
  mkdirSync(file(dir, "sub"), { recursive: true });
  writeF(dir, "sub/.nvmrc", "18\n"); // isca: antes, este .nvmrc era o unico guard a "correr"
}, {
  code: 0,
  includes: ["12 guard(s) executado(s)"],
  cwd: undefined, // substituido abaixo
});
test("cwd: raiz e derivada do script, nao do cwd", (dir) => {
  mkdirSync(file(dir, "sub"), { recursive: true });
  writeF(dir, "sub/.nvmrc", "18\n");
}, {
  code: 0,
  includes: ["12 guard(s) executado(s)", ".nvmrc = 24"],
  excludes: [".nvmrc = 18"],
});

// --- Guard 1: orcamento de bytes e rules obrigatorias -------------------------
test("G1: rule acima do maximo de bytes avisa", (dir) => {
  appendFileSync(file(dir, ".agent/rules/core-rules.md"), "x".repeat(5000));
}, { code: 1, includes: ["core-rules.md", "bytes >"] });

test("G1: rule obrigatoria ausente avisa (nao passa em silencio)", (dir) => {
  rmSync(file(dir, ".agent/rules/anti-patterns.md"));
}, { code: 1, includes: ["anti-patterns.md NAO EXISTE"] });

test("G1: rules geradas no bootstrap dao SKIP visivel", null, {
  code: 0,
  includes: ["SKIP  .agent/rules/business-logic.md", "SKIP  .agent/rules/pages-architecture.md"],
});

// --- Guard 2: paridade CLAUDE/GEMINI ------------------------------------------
test("G2: divergencia de conteudo avisa", (dir) => {
  writeF(dir, "GEMINI.md", readF(dir, "GEMINI.md").replace("Fronteiras", "FRONTEIRAS-ALTERADO"));
}, { code: 1, includes: ["DIVERGEM"] });

test("G2: par incompleto avisa", (dir) => {
  rmSync(file(dir, "GEMINI.md"));
}, { code: 1, includes: ["nao o par"] });

// --- Guard 3: versoes ---------------------------------------------------------
test("G3: sem package.json da SKIP visivel", null, {
  code: 0,
  includes: ["SKIP  Guard 3"],
});

test("G3: versao divergente avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## [v1.0.0] - Antiga\n");
}, { code: 1, includes: ["!= maior versao do CHANGELOG"] });

test("G3: CHANGELOG ausente com package.json presente avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  rmSync(file(dir, "src/docs/CHANGELOG.md"));
}, { code: 1, includes: ["CHANGELOG.md nao encontrado"] });

test("G3: package.json sem campo version avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x" }));
}, { code: 1, includes: ['sem campo "version"'] });

test("G3: package.json invalido avisa", (dir) => {
  writeF(dir, "package.json", "{ not json,, }");
}, { code: 1, includes: ["package.json invalido"] });

test("G3: heading sem brackets e aceito (## v1.2.3)", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## v1.2.3 - Atual\n");
}, { code: 0, includes: ["=== package.json"] });

test("G3: headings sem nenhuma versao valida avisa formato", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## Release de Marco\n\n## Outra\n");
}, { code: 1, includes: ["formato invalido"] });

test("G3: CHANGELOG em ordem ascendente avisa ordenacao", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "2.0.0" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## [v1.0.0] - Velha\n\n## [v2.0.0] - Nova\n");
}, { code: 1, includes: ["ordenar por versao decrescente"] });

// --- Guard 4: termos banidos (o bug do lastIndex) -----------------------------
// Injeta uma entrada em BANNED com um termo presente em CLAUDE.md E GEMINI.md.
// Com o regex /g reutilizado, o 2o ficheiro era silenciosamente ignorado.
test("G4: termo banido e apanhado em TODOS os ficheiros, nao so no primeiro", (dir) => {
  const g = readF(dir, GUARD).replace(
    "const BANNED = [\n",
    'const BANNED = [\n  { re: /Fronteiras/g, msg: "termo de teste" },\n'
  );
  writeF(dir, GUARD, g);
}, { code: 1, includes: ["CLAUDE.md:", "GEMINI.md:", "termo de teste"] });

test("G4: lista BANNED vazia da SKIP visivel", null, {
  code: 0,
  includes: ["SKIP  Guard 4"],
});

// --- Guard 5: .nvmrc ----------------------------------------------------------
test("G5: .nvmrc ausente avisa", (dir) => {
  rmSync(file(dir, ".nvmrc"));
}, { code: 1, includes: [".nvmrc nao encontrado"] });

test("G5: .nvmrc vazio avisa (era reportado como ausente)", (dir) => {
  writeF(dir, ".nvmrc", "");
}, { code: 1, includes: [".nvmrc esta vazio"] });

test("G5: .nvmrc com conteudo invalido avisa", (dir) => {
  writeF(dir, ".nvmrc", "not-a-version\n");
}, { code: 1, includes: ["nao parece uma versao Node valida"] });

test("G5: lts/* e aceito", (dir) => {
  writeF(dir, ".nvmrc", "lts/*\n");
}, { code: 0, includes: [".nvmrc = lts/*"] });

// --- Guard 6: paridade workflows <-> wrappers ---------------------------------
test("G6: wrapper em falta avisa", (dir) => {
  rmSync(file(dir, ".gemini/commands/review.toml"));
}, { code: 1, includes: ['Workflow "review" sem wrapper em .gemini/commands'] });

test("G6: wrapper orfao avisa", (dir) => {
  writeF(dir, ".claude/commands/orphan.md", "---\ndescription: x\n---\n");
}, { code: 1, includes: ['Wrapper "orphan"'] });

test("G6: workflow novo sem wrappers avisa nos dois", (dir) => {
  writeF(dir, ".agent/workflows/brand-new.md", "# /brand-new\n");
}, { code: 1, includes: [".claude/commands", ".gemini/commands"] });

test("G6: pasta de wrappers ausente da SKIP visivel (nao desaparece)", (dir) => {
  rmSync(file(dir, ".gemini/commands"), { recursive: true });
}, { code: 0, includes: ["SKIP  .gemini/commands"] });

// --- Guard 7: workflows nas tabelas de entrada -------------------------------
// Regressao dos dois workflows que o match por substring exemptava para sempre:
// "review.md" era satisfeito por "design-review.md", e "plan.md" por
// "implementation_plan.md" (importado em CLAUDE.md).
test("G7: /review removido da tabela avisa (mascarado por design-review.md)", (dir) => {
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/review.md");
}, { code: 1, includes: ['Workflow "review" nao listado'] });

test("G7: /plan removido da tabela avisa (mascarado por implementation_plan.md)", (dir) => {
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/plan.md");
}, { code: 1, includes: ['Workflow "plan" nao listado'] });

test("G7: /design-review removido da tabela avisa", (dir) => {
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/design-review.md");
}, { code: 1, includes: ['Workflow "design-review" nao listado'] });

test("G7: workflow sem colisao de nome continua a ser apanhado", (dir) => {
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/debug.md");
}, { code: 1, includes: ['Workflow "debug" nao listado'] });

// --- Guard 8: @imports de CLAUDE.md resolvem ---------------------------------
test("G8: @import para ficheiro inexistente avisa", (dir) => {
  writeF(dir, "CLAUDE.md", readF(dir, "CLAUDE.md").replace("@.agent/rules/core-rules.md", "@.agent/rules/nao-existe.md"));
}, { code: 1, includes: ["importa `@.agent/rules/nao-existe.md`", "NAO EXISTE"] });

test("G8: rule obrigatoria apagada e apanhada pelo import pendurado", (dir) => {
  rmSync(file(dir, ".agent/rules/process-rules.md"));
}, { code: 1, includes: ["process-rules.md"] });

test("G8: as duas rules do bootstrap dao SKIP, nao WARN", null, {
  code: 0,
  includes: ["SKIP  @.agent/rules/business-logic.md"],
});

test("G8: CLAUDE.md sem imports avisa", (dir) => {
  writeF(dir, "CLAUDE.md", readF(dir, "CLAUDE.md").split("\n").filter((l) => !l.startsWith("@")).join("\n"));
}, { code: 1, includes: ["sem nenhum `@import`"] });

// --- Guard 9: AGENTS.md e agent-guide.md -------------------------------------
test("G9a: workflow removido do AGENTS.md avisa", (dir) => {
  writeF(dir, "AGENTS.md", readF(dir, "AGENTS.md").replace("`market-scan`", "`removido`"));
}, { code: 1, includes: ['Workflow "market-scan" nao listado em AGENTS.md'] });

test("G9a: /review removido nao e mascarado por design-review", (dir) => {
  writeF(dir, "AGENTS.md", readF(dir, "AGENTS.md").replace("`review` · ", ""));
}, { code: 1, includes: ['Workflow "review" nao listado em AGENTS.md'] });

test("G9b: workflow removido do agent-guide.md avisa", (dir) => {
  dropLinesContaining(dir, "src/docs/agent-guide.md", "`/refactor`");
}, { code: 1, includes: ['Workflow "refactor" nao listado em src/docs/agent-guide.md'] });

// --- Guard 10: conteudo dos wrappers -----------------------------------------
test("G10: wrapper a apontar para o workflow ERRADO avisa", (dir) => {
  writeF(dir, ".claude/commands/review.md", "---\ndescription: x\n---\n\nLer `.agent/workflows/deploy.md`.\n");
}, { code: 1, includes: [".claude/commands/review.md nao aponta"] });

test("G10: wrapper vazio avisa", (dir) => {
  writeF(dir, ".gemini/commands/debug.toml", "");
}, { code: 1, includes: [".gemini/commands/debug.toml nao aponta"] });

// --- Guard 11: sanidade do settings.json -------------------------------------
test("G11: deny de .env removido avisa", (dir) => {
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  cfg.permissions.deny = cfg.permissions.deny.filter((r) => r !== "Read(./.env)");
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
}, { code: 1, includes: ["falta `Read(./.env)` no deny"] });

test("G11: wildcard sem delimitador no allow avisa", (dir) => {
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  cfg.permissions.allow.push("Bash(node .agent/scripts/*)", "Bash(npm run lint*)");
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
}, { code: 1, includes: ["Bash(node .agent/scripts/*)", "Bash(npm run lint*)", "wildcard sem delimitador"] });

test("G11: `:*` e delimitador valido, nao avisa", (dir) => {
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  cfg.permissions.allow.push("Bash(git log:*)");
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
}, { code: 0, excludes: ["wildcard sem delimitador"] });

test("G11: settings.json invalido avisa", (dir) => {
  writeF(dir, ".claude/settings.json", "{ nope,, }");
}, { code: 1, includes: ["nao e JSON valido"] });

test("G11: settings.json ausente da SKIP visivel", (dir) => {
  rmSync(file(dir, ".claude/settings.json"));
}, { code: 0, includes: ["SKIP  Guard 11"] });

// --- Resumo ------------------------------------------------------------------
console.log("");
console.log(`  ${passed} passaram, ${failures.length} falharam.`);
if (failures.length) {
  console.log("\n--- Detalhe das falhas ---");
  for (const f of failures) {
    console.log(`\n[${f.name}]`);
    for (const p of f.problems) console.log(`  ${p}`);
    console.log(f.out.split("\n").map((l) => `    | ${l}`).join("\n"));
  }
  console.log("");
  process.exit(1);
}
console.log("\nTodos os testes dos guards passaram.\n");
process.exit(0);
