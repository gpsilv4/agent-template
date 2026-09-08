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
 * Sai != 0 se algum teste falhar. Corre em cada push/PR no job `guard-tests` do ci.yml
 * (sem `package.json` e sem gate do `detect` — o template puro e exatamente o caso coberto).
 */

import { cpSync, mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from "fs";
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
    // `stdio` explicito: o ramo de erro concatenava stdout+stderr e o de sucesso so
    // devolvia stdout, logo um aviso em stderr com exit 0 era invisivel.
    const stdout = execFileSync(process.execPath, [join(dir, GUARD)], {
      stdio: ["ignore", "pipe", "pipe"],
      // `cwd` e relativo a sandbox. Uma versao anterior passava `cwd ?? dir` com um
      // `expect.cwd` sempre `undefined`, pelo que os testes de cwd corriam na raiz e
      // eram copias exatas do baseline — passavam com o defeito reintroduzido.
      cwd: cwd ? join(dir, cwd) : dir,
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
 * @param expect  {
 *   code,                 exit esperado (0 ou 1)
 *   includes?: string[],  afirmado contra as linhas WARN quando code=1, senao contra o output
 *   anyOut?: string[],    afirmado sempre contra o output inteiro (linhas OK/SKIP/NOTE)
 *   excludes?: string[],  nao pode aparecer em nenhum sitio do output
 *   cwd?: string,         subdiretorio da sandbox de onde correr o guard
 *   synthetic?: boolean,  partir da fixture limpa por construcao em vez da copia do repo
 * }
 * `mutate` pode devolver { includes?, excludes? } extra, para expectativas calculadas.
 */
function test(name, mutate, expect) {
  // `synthetic: true` parte da fixture limpa por construcao, em vez de uma copia do
  // repo. Necessario para testes cuja mutacao produz um aviso que o repo real pode ja
  // ter — nesse caso o aviso nao seria "novo" e o teste media o estado do repo.
  const dir = expect.synthetic ? syntheticSandbox() : sandbox();
  const base = expect.synthetic ? syntheticBaselineWarns : baselineWarns;
  try {
    // Um `throw` no setup abortava o processo a meio: os testes seguintes nunca corriam
    // e nao havia linha de resumo. O ficheiro irmao ja tinha esta guarda; este nao.
    let extra = {};
    if (mutate) {
      try {
        extra = mutate(dir) ?? {};
      } catch (err) {
        failures.push({ name, problems: [`setup rebentou: ${err.message}`], out: "" });
        console.log(`  FAIL  ${name}`);
        console.log(`          setup rebentou: ${err.message}`);
        return;
      }
    }
    const { code, out } = runGuard(dir, expect.cwd);
    const problems = [];
    if (!out.includes("=== Doc Guards ===")) {
      problems.push(`o guard nao produziu output (rebentou?): ${out.slice(0, 160)}`);
    }
    // Afirmacao por DIFERENCA face ao baseline, nao pelo exit code absoluto. Uma versao
    // anterior saltava os testes `code: 0` quando o repo tinha avisos — desligava 17 dos
    // 64 em silencio, com exit 0 e a dizer "todos passaram". Agora todos correm sempre.
    // INVARIANTE, verificada em cada corrida: o exit code tem de refletir os avisos.
    // Sem isto, trocar a ultima linha do guard por `process.exit(1)` dava 84/84 verde —
    // as assercoes diferenciais falam de mensagens e nao do veredicto.
    const temWarn = out.includes("  WARN  ");
    if (temWarn && code === 0) problems.push("imprimiu WARN mas saiu 0");
    if (!temWarn && code !== 0) problems.push(`nao imprimiu WARN mas saiu ${code}`);
    const novos = [...warnsOf(out)].filter((w) => !base.has(w));
    if (expect.code === 0) {
      if (novos.length) problems.push(`nao devia acrescentar avisos; acrescentou ${novos.length}: ${novos[0]}`);
    } else {
      if (novos.length === 0) problems.push("devia acrescentar pelo menos um aviso novo — nao acrescentou nenhum");
      if (code === 0) problems.push("devia sair != 0");
    }
    // CAUSA-RAIZ de quatro rondas de defeitos: `out.includes(...)` nao olha ao NIVEL da
    // linha. Um teste `code: 1` era satisfeito por uma linha `NOTE` com o mesmo texto, ou
    // pelo WARN de OUTRO guard que a mutacao tambem disparava — e sabotar o guard sob teste
    // ficava invisivel. Um teste que espera aviso afirma-se contra as linhas WARN e mais
    // nada; um que espera sucesso pode afirmar OK/SKIP/NOTE, logo usa o output inteiro.
    const alvo = expect.code === 0 ? out : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
    const ondeAlvo = expect.code === 0 ? "output" : "linhas WARN";
    for (const s of [...(expect.includes ?? []), ...(extra.includes ?? [])]) {
      if (!alvo.includes(s)) problems.push(`${ondeAlvo} devia conter "${s}"`);
    }
    // `anyOut`: para afirmar linhas que NAO sao WARN (OK/SKIP/NOTE) num teste que
    // ainda assim espera exit != 0.
    for (const s of expect.anyOut ?? []) {
      if (!out.includes(s)) problems.push(`output devia conter "${s}"`);
    }
    for (const s of [...(expect.excludes ?? []), ...(extra.excludes ?? [])]) {
      if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
    }
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
const patchSettings = (dir, fn) => {
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  fn(cfg);
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
};

/** Linhas de tabela com o caminho de cada workflow, para um CLAUDE.md sintetico nao
 *  disparar o Guard 7 (que exige todos os workflows listados). */
const listWorkflowRows = (dir) =>
  readdirSync(join(dir, ".agent/workflows"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `| ${f.slice(0, -3)} | \`.agent/workflows/${f}\` |`);
const dropLinesContaining = (dir, p, needle) =>
  writeF(dir, p, readF(dir, p).split("\n").filter((l) => !l.includes(needle)).join("\n"));

/** Repo minimo e LIMPO POR CONSTRUCAO, montado do zero — nao e copia do repo real.
 *  Existe porque as assercoes diferenciais nao conseguem afirmar o exit code: num
 *  baseline que ja avisa, "nao acrescentou avisos" e satisfeito por um guard que
 *  falha sempre. Aqui sabemos que o veredicto correcto e exit 0, logo podemos exigi-lo. */
function syntheticSandbox() {
  const dir = mkdtempSync(join(tmpdir(), "guard-synth-"));
  const w = (rel, body) => {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  };
  mkdirSync(join(dir, ".agent", "scripts"), { recursive: true });
  cpSync(join(ROOT, GUARD), join(dir, GUARD));

  for (const r of ["core-rules", "process-rules", "anti-patterns"]) {
    w(`.agent/rules/${r}.md`, `# ${r}\n\nConteudo minimo.\n`);
  }
  w(".agent/workflows/plan.md", "# /plan\n");
  w(".claude/commands/plan.md", "---\ndescription: x\n---\n\nLer `.agent/workflows/plan.md`.\n");
  w(".gemini/commands/plan.toml", 'description = "x"\nprompt = "Le .agent/workflows/plan.md"\n');
  w(".agent/context/session.md", "# Session\n");
  const entry = [
    "# Entry",
    "",
    "@.agent/rules/core-rules.md",
    "@.agent/rules/process-rules.md",
    "@.agent/rules/anti-patterns.md",
    // Importadas mas NAO criadas: e o estado do template antes do bootstrap, e da aos
    // guards 1 e 8 o `SKIP` que dois testes afirmam. SKIP nao e WARN, logo a fixture
    // continua limpa.
    "@.agent/rules/business-logic.md",
    "@.agent/rules/pages-architecture.md",
    "@.agent/context/session.md",
    "",
    "| Workflow | Ficheiro |",
    "|---|---|",
    "| Planear | `.agent/workflows/plan.md` |",
  ].join("\n") + "\n";
  w("CLAUDE.md", entry);
  w("GEMINI.md", entry.replace(/^@(.*)$/gm, "@[$1]"));
  w("AGENTS.md", "# Agents\n\nWorkflows: `plan`\n");
  w("src/docs/agent-guide.md", "# Guia\n\n| **`/plan`** | Planear |\n");
  w(".nvmrc", "24\n");
  w(".claude/settings.json", JSON.stringify({
    permissions: {
      // Deny e ask completos: a fixture tem de satisfazer a cobertura que o Guard 11
      // exige, senao deixa de estar "limpa por construcao".
      deny: ["Read(./.env)", "Read(./.env.*)", "Read(./**/.env)", "Read(./**/.env.*)", "Read(./**/*.pem)", "Read(./**/*.key)", "Read(./**/id_rsa*)", "Read(./**/.npmrc)", "Read(./**/credentials*)", "Read(./**/secrets/**)"],
      ask: ["Bash(git commit:*)", "Bash(git push:*)", "Bash(npm install:*)"],
      allow: ["Read(./.agent/**)", "Bash(npx tsc --noEmit)"],
    },
  }, null, 2));
  return dir;
}

console.log("\n=== Testes dos Doc Guards ===\n");

// A sandbox e uma COPIA do repo real. Em vez de assumir que o repo esta limpo (ou de
// saltar testes quando nao esta), captura-se o conjunto de WARN do baseline UMA vez e
// tudo se afirma por diferenca. Assim os 64 testes correm sempre e o veredicto e sobre
// o guard, nao sobre o estado do repo.
const warnsOf = (out) =>
  new Set(out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).map((l) => l.trim()));
let baselineWarns;
let syntheticBaselineWarns;
{
  const dir = sandbox();
  try {
    const base = runGuard(dir);
    if (!base.out.includes("=== Doc Guards ===")) {
      console.log("  ERRO  o guard nao produziu output no baseline — abortar:\n" + base.out);
      process.exit(1);
    }
    baselineWarns = warnsOf(base.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const synth = syntheticSandbox();
  try {
    const baseSynth = runGuard(synth);
    if (!baseSynth.out.includes("=== Doc Guards ===")) {
      console.log("  ERRO  o guard nao produziu output na fixture sintetica — abortar:\n" + baseSynth.out);
      process.exit(1);
    }
    syntheticBaselineWarns = warnsOf(baseSynth.out);
  } finally {
    rmSync(synth, { recursive: true, force: true });
  }
  if (baselineWarns.size > 0) {
    console.log(`  NOTA  o repo tem ${baselineWarns.size} aviso(s) no baseline dos doc guards.`);
    console.log("        Todos os testes correm: as assercoes sao por DIFERENCA face a esse baseline.");
    console.log("        Corre `node .agent/scripts/check-doc-versions.mjs` para os ver.\n");
  }
}

// --- Baseline -----------------------------------------------------------------
// Estes dois nao usam `test()`: correm contra a fixture sintetica, nao contra o repo.
{
  const dir = syntheticSandbox();
  try {
    const { code, out } = runGuard(dir);
    const problems = [];
    if (code !== 0) problems.push(`fixture limpa por construcao devia sair 0, saiu ${code}`);
    if (!out.includes("Todos os guards de documentacao passaram")) {
      problems.push("devia declarar que todos os guards passaram");
    }
    if (out.includes("  WARN  ")) problems.push(`nao devia haver WARN: ${out.split("\n").find((l) => l.includes("  WARN  "))}`);
    const name = "sintetico: repo limpo por construcao sai 0 e declara que passou";
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

{
  const dir = syntheticSandbox();
  try {
    // Uma unica quebra na fixture limpa: o exit code TEM de mudar.
    writeFileSync(join(dir, ".nvmrc"), "");
    const { code, out } = runGuard(dir);
    const name = "sintetico: uma quebra na fixture limpa muda o exit code";
    const problems = [];
    if (code === 0) problems.push("devia sair != 0");
    if (!out.includes("  WARN  ")) problems.push("devia imprimir WARN");
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

test("baseline: o guard produz veredicto e nao acrescenta avisos", null, {
  code: 0,
  // Nao afirma "todos passaram": isso seria afirmar o estado do REPO, e num projeto
  // derivado com drift ficaria vermelho por uma causa que nada tem a ver com o guard.
  includes: ["guard(s) executado(s)", "saltado(s)"],
});

// --- Independencia do cwd (o defeito mais grave: 0 guards + "todos passaram") --
const withDecoyNvmrc = (dir) => {
  mkdirSync(file(dir, "sub"), { recursive: true });
  writeF(dir, "sub/.nvmrc", "18\n"); // isca: com ROOT=cwd, era o unico guard a "correr"
};

test("cwd: correr DE UM SUBDIRETORIO nao desliga os guards", withDecoyNvmrc, {
  code: 0,
  cwd: "sub",
  includes: ["guard(s) executado(s)"],
});

test("cwd: a raiz vem do script, nao do cwd (le o .nvmrc certo)", withDecoyNvmrc, {
  code: 0,
  cwd: "sub",
  includes: ["guard(s) executado(s)", ".nvmrc = 24"],
  excludes: [".nvmrc = 18"],
});

// CONTROLO NEGATIVO PERMANENTE: reintroduz o defeito na copia da sandbox e exige que
// a suite o apanhe. Sem isto, os dois testes acima passavam com ROOT = process.cwd().
test("cwd: [controlo negativo] com ROOT = cwd, o guard TEM de falhar", (dir) => {
  withDecoyNvmrc(dir);
  const patched = readF(dir, GUARD).replace(
    /^const ROOT = .*$/m,
    "const ROOT = process.cwd();"
  );
  if (!patched.includes("const ROOT = process.cwd();")) {
    throw new Error("o patch do controlo negativo nao aplicou — a linha `const ROOT =` mudou de forma");
  }
  writeF(dir, GUARD, patched);
}, {
  code: 1,
  cwd: "sub",
  excludes: ["Todos os guards de documentacao passaram"],
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
  synthetic: true, // num projeto ja bootstrapped estas rules EXISTEM e nao ha SKIP
  includes: ["SKIP  .agent/rules/business-logic.md", "SKIP  .agent/rules/pages-architecture.md"],
});

// --- Guard 2: paridade CLAUDE/GEMINI ------------------------------------------
test("G2: divergencia de conteudo avisa", (dir) => {
  // Normalizar os dois primeiro: se o repo ja divergir no baseline, o aviso nao seria
  // "novo" e o teste media o estado do repo em vez do guard.
  // Listar TODOS os workflows: uma versao anterior listava um so e gerava 10 WARN de
  // ruido do Guard 7, que satisfaziam a assercao diferencial por acidente.
  const md = ["# Entry", "", "@.agent/rules/core-rules.md", "", "| W | F |", "|---|---|",
    ...listWorkflowRows(dir)].join("\n") + "\n";
  writeF(dir, "CLAUDE.md", md);
  writeF(dir, "GEMINI.md", md.replace("# Entry", "# Entry DIFERENTE"));
}, { code: 1, synthetic: true, includes: ["DIVERGEM"], excludes: ["nao listado na tabela"] });

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
  // Escrever a tabela COMPLETA primeiro: num projeto derivado que ja tenha removido
  // este workflow da tabela, o aviso estaria no baseline e passaria invisivel.
  const base = ["# Entry", "", "@.agent/rules/core-rules.md", "", "| W | F |", "|---|---|",
    ...listWorkflowRows(dir)].join("\n") + "\n";
  writeF(dir, "CLAUDE.md", base);
  writeF(dir, "GEMINI.md", base.replace(/^@(.*)$/gm, "@[$1]"));
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/debug.md");
}, { code: 1, includes: ['Workflow "debug" nao listado'] });

// --- Guard 8: @imports de CLAUDE.md resolvem ---------------------------------
test("G8: @import para ficheiro inexistente avisa", (dir) => {
  writeF(dir, "CLAUDE.md", readF(dir, "CLAUDE.md").replace("@.agent/rules/core-rules.md", "@.agent/rules/nao-existe.md"));
}, { code: 1, synthetic: true, includes: ["importa `@.agent/rules/nao-existe.md`", "NAO EXISTE"] });

test("G8: rule obrigatoria apagada e apanhada pelo import pendurado", (dir) => {
  rmSync(file(dir, ".agent/rules/process-rules.md"));
  // `includes: ["process-rules.md"]` era satisfeito pelo WARN do Guard 1 — o teste
  // passava mesmo com o aviso do Guard 8 removido. Exigir a mensagem do Guard 8.
  return { includes: ["importa `@.agent/rules/process-rules.md`"] };
}, { code: 1 });

test("G8: as duas rules do bootstrap dao SKIP, nao WARN", null, {
  code: 0,
  synthetic: true,
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
test("G11: deny de .env retirado por completo avisa", (dir) => {
  // Escrever primeiro um settings.json com o deny COMPLETO: num projeto derivado que
  // ja nao o tenha, o aviso estaria no baseline e a assercao diferencial nao o veria.
  writeF(dir, ".claude/settings.json", JSON.stringify({
    permissions: { deny: ["Read(./.env)", "Read(./**/.env)", "Read(./.env.*)", "Read(./**/.env.*)"], allow: [] },
  }, null, 2));
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  cfg.permissions.deny = [];
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
}, { code: 1, includes: ["nenhuma regra `deny` cobre a leitura de"] });

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

// --- Guard 11: formas de bypass que uma versao anterior aprovava ---------------
// Estas existem porque a primeira versao do Guard 11 so olhava para o `*` precedido de
// caractere de palavra. `Bash(*)`, `Bash` sem parenteses e `Bash(sh:*)` passavam todos.
test("G11: `Bash(*)` e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(*)"));
}, { code: 1, includes: ["Bash(*)", "wildcard sem delimitador"] });

test("G11: `Bash` sem parenteses (concessao maxima) e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash"));
}, { code: 1, includes: ["concede a ferramenta INTEIRA"] });

test("G11: `Bash(sh:*)` respeita a forma `:*` mas e execucao arbitraria", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(sh:*)"));
}, { code: 1, includes: ["receber argumentos livres"] });

test("G11: `Bash(node:*)` idem", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(node:*)"));
}, { code: 1, includes: ["receber argumentos livres"] });

test("G11: `Read(./**)` abrange o repo inteiro", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Read(./**)"));
}, { code: 1, includes: ["abrange o repo inteiro"] });

test("G11: `defaultMode: bypassPermissions` desliga tudo", (dir) => {
  patchSettings(dir, (c) => (c.permissions.defaultMode = "bypassPermissions"));
}, { code: 1, includes: ["desliga a fronteira de permissoes"] });

test("G11: `allow` que nao e array nao rebenta", (dir) => {
  patchSettings(dir, (c) => (c.permissions.allow = {}));
}, { code: 1, includes: ["devia ser um array"], excludes: ["is not iterable"] });

test("G11: deny mais ESTRITO nao e falso positivo", (dir) => {
  // Supersets estritos dos padroes do template: um por classe de secret.
  patchSettings(dir, (c) => (c.permissions.deny = [
    "Read(./.env*)", "Read(./**/.env*)", "Read(./**/*.pem)", "Read(./**/*.key)",
    "Read(./**/id_rsa*)", "Read(./**/.npmrc)", "Read(./**/credentials*)", "Read(./**/secrets/**)",
  ]));
}, { code: 0, excludes: ["nenhuma regra `deny` cobre"] });

// --- Guard 11: bypasses por PREFIXO e nomes de ferramenta fora da lista -------
// Todos estes passavam a verde quando o guard testava a FORMA da regra em vez da
// propriedade ("o argumento fica constrangido?").
for (const rule of [
  "Bash(/bin/sh:*)",        // prefixo derrota um `^` ancorado
  "Bash(/bin/bash -c:*)",   // interpretador + flag = execucao arbitraria
  "Bash(/usr/bin/env sh:*)",// wrapper `env` a esconder o interpretador
  "Bash(npm:*)",            // npm exec -- qualquer coisa
  "Bash(npx:*)",
  "Bash(git:*)",            // git -c core.pager='sh -c ...'
  "Bash(find:*)",           // find -exec
  "Bash(awk:*)",            // awk 'BEGIN{system(...)}'
  "Bash(docker:*)",
  "Bash ",                  // sem trim, era um nome de ferramenta nu
  "Grep",                   // fora da lista hardcoded de 6 nomes
  "NotebookEdit",           // ferramenta de ESCRITA fora da lista
  "mcp__servidor__tool",    // ferramentas MCP nao eram olhadas
  "Read(./*)",              // raiz inteira
  // Ronda 4: cada uma passava por uma razao diferente.
  "Bash(env -i sh:*)",      // remover o wrapper deixava a FLAG como head
  "Bash(sudo -u root sh:*)",// o head passava a ser `root`, argumento do wrapper
  "Bash(nice -n 0 bash:*)",
  "Bash(xargs -I{} sh:*)",
  "Bash(BASH -c:*)",        // comparacao case-sensitive
  "Bash(/bin/SH -c:*)",
  "Bash(git log; sh:*)",    // metacaracteres de shell nunca eram olhados
  "Bash(git log|sh:*)",
  "Bash(cd / && sh:*)",
  "Bash(sh)",               // comando fixo: shell interactiva
  "Bash(rm -rf ~)",         // comando fixo destrutivo
  "Read(~/**)",             // home inteira, inclui ~/.ssh
  "Read(/Users/**)",        // caminho absoluto
  "Read(../**)",            // sai do repo
  "Write(~/.ssh/**)",
  "WebFetch(*)",            // ferramenta com parenteses fora de Bash/ficheiro
  "Task(*)",
  "mcp__srv__tool(*)",
]) {
  test(`G11: \`${rule}\` e apanhado`, (dir) => {
    patchSettings(dir, (c) => c.permissions.allow.push(rule));
    // Afirmar que foi ESTA regra a ser marcada. Sem isto o teste passava com o guard a
    // avisar por qualquer outra razao — vermelho, mas nao na assercao certa.
    // `.trim()`: o guard reporta a regra normalizada (o caso `"Bash "` perde o espaco).
    return { includes: [rule.trim()] };
  }, { code: 1 });
}

test("G11: entrada do allow que nao e string e apanhada", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push({ tool: "Bash", args: "*" }));
}, { code: 1, includes: ["nao e string"] });

// E o simetrico: concessoes ESTREITAS e legitimas nao podem ser falsos positivos.
for (const rule of [
  "Bash(node .agent/scripts/check-doc-versions.mjs:*)", // interpretador com alvo FIXO
  "Bash(npm run lint:*)",                               // prefixo de 3 tokens
  "Bash(git log:*)",
  "Read(./.agent/**)",
  // Ronda 4: comandos fixos nao tem argumentos livres, logo sao seguros.
  "Bash(npx tsc --noEmit)",
  "Bash(git status)",
  "Glob(**/*.ts)",
  // Read-only com um so token: NOTE, nao WARN — nao pode travar o gate.
  "Bash(ls:*)",
  "Bash(cat:*)",
]) {
  test(`G11: \`${rule}\` NAO e falso positivo`, (dir) => {
    patchSettings(dir, (c) => c.permissions.allow.push(rule));
  }, { code: 0 });
}

// Ramos acrescentados na ronda 5 — descobertos pela varredura de mutacao, que revelou
// que eu os tinha escrito sem teste (o proprio AP1 a acontecer).
test("G11: caminho fora do projeto e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(cat ~/.ssh/id_rsa)"));
}, { code: 1, synthetic: true, includes: ["fora do projeto"] });

test("G11: comando fixo destrutivo e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(rm -rf /tmp/x)"));
}, { code: 1, synthetic: true, includes: ["shell interactiva ou comando destrutivo"] });

test("G11: allow que cai dentro de um prefixo em ask e contradicao", (dir) => {
  patchSettings(dir, (c) => {
    c.permissions.ask = ["Bash(git push:*)"];
    c.permissions.allow.push("Bash(git push origin:*)");
  });
}, { code: 1, synthetic: true, includes: ["cai dentro de", "contradicao"] });

test("CHECKS: versao de dependencia desatualizada na doc avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.0.0", dependencies: { next: "16.2.2" } }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CL\n\n## [v1.0.0] - Atual\n");
  writeF(dir, ".agent/rules/core-rules.md", "# core\n\nStack: Next.js 15.0.0\n");
  const g = readF(dir, GUARD).replace(
    "const CHECKS = [\n",
    'const CHECKS = [\n  { name: "Next.js", pkg: "next", pattern: /Next\\.js\\s+(\\d+(?:\\.\\d+(?:\\.\\d+)?)?)/g, files: [".agent/rules/core-rules.md"] },\n'
  );
  writeF(dir, GUARD, g);
}, { code: 1, synthetic: true, includes: ["documentado 15.0.0", "atual 16.2.2"] });

// --- Ficheiros em branco: "existe mas vazio" != "ausente" ---------------------
test("blank: AGENTS.md vazio nao passa a verde", (dir) => {
  writeF(dir, "AGENTS.md", "");
}, { code: 1, includes: ["AGENTS.md existe mas esta VAZIO"], excludes: ["Todos os guards de documentacao passaram"] });

test("blank: agent-guide.md vazio nao passa a verde", (dir) => {
  writeF(dir, "src/docs/agent-guide.md", "");
}, { code: 1, includes: ["agent-guide.md existe mas esta VAZIO"] });

test("blank: rule obrigatoria a 0 bytes nao recebe OK", (dir) => {
  writeF(dir, ".agent/rules/core-rules.md", "");
}, { code: 1, includes: ["core-rules.md = 0 bytes mas esta VAZIO"] });

test("blank: CLAUDE.md so com espacos e tratado como vazio", (dir) => {
  writeF(dir, "CLAUDE.md", "   \n\t\n  ");
}, { code: 1, includes: ["CLAUDE.md existe mas esta VAZIO"], excludes: ["nao listado na tabela"] });

test("blank: a mensagem de SKIP nao mente sobre a causa", (dir) => {
  writeF(dir, "CLAUDE.md", "");
}, { code: 1, anyOut: ["CLAUDE.md esta vazio"], excludes: ["Guard 8 (@imports) — sem CLAUDE.md"] });

// --- Ramos que nao tinham teste nenhum ---------------------------------------
// Descobertos sabotando cada `warn(`/`flag(` do guard um a um: estes quatro podiam ser
// neutralizados com a suite a dar 109/109 verde.
test("G2: nenhum entry point existe avisa", (dir) => {
  rmSync(file(dir, "CLAUDE.md"));
  rmSync(file(dir, "GEMINI.md"));
}, { code: 1, synthetic: true, includes: ["nao encontrados — sao os entry points"] });

test("G6: .agent/workflows/ ausente avisa", (dir) => {
  rmSync(file(dir, ".agent/workflows"), { recursive: true });
}, { code: 1, synthetic: true, includes: [".agent/workflows/ nao encontrado"] });

test("G11: entrada do deny que nao e string e apanhada", (dir) => {
  patchSettings(dir, (c) => c.permissions.deny.push({ pattern: "Read(./.env)" }));
}, { code: 1, synthetic: true, includes: ["do `deny` que nao e string"] });

test("G11: regra sem a forma Ferramenta(padrao) e apanhada", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(sh:*"));
}, { code: 1, synthetic: true, includes: ["nao tem a forma"] });

// --- Guard 3: precedencia SemVer ---------------------------------------------
const withPkg = (dir, version, changelog) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version }));
  writeF(dir, "src/docs/CHANGELOG.md", changelog);
};

test("G3: `version` vazia nao desliga o guard em silencio", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "" }));
}, { code: 1, includes: ['sem campo "version" utilizavel'] });

test("G3: beta.10 > beta.9 (numerico, nao string)", (dir) => {
  withPkg(dir, "1.2.3-beta.10", "# CL\n\n## [v1.2.3-beta.10] - Nova\n\n## [v1.2.3-beta.9] - Velha\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: build metadata nao conta para precedencia", (dir) => {
  withPkg(dir, "1.2.3", "# CL\n\n## [v1.2.3+build.5] - Atual\n\n## [v1.2.2] - Velha\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: pre-release com hifen no identificador nao empata", (dir) => {
  withPkg(dir, "1.2.3-beta-9", "# CL\n\n## [v1.2.3-beta-9] - Nova\n\n## [v1.2.3-beta-2] - Velha\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: build metadata nao torna a ordenacao invalida", (dir) => {
  // O topo e a entrada seguinte sao a MESMA versao por precedencia (spec §10) e
  // diferentes por string. A verificacao de ordenacao comparava strings e avisava.
  withPkg(dir, "1.2.3", "# CL\n\n## [v1.2.3] - Atual\n\n## [v1.2.3+build.5] - Rebuild\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: ordem ERRADA em pre-releases numericos e apanhada", (dir) => {
  withPkg(dir, "1.2.3-rc.10", "# CL\n\n## [v1.2.3-rc.2] - Topo errado\n\n## [v1.2.3-rc.10] - Maior\n");
}, { code: 1, includes: ["ordenar por versao decrescente"] });

// --- Guard 8: a contagem tem de excluir os que nao resolvem ------------------
test("G8: conta so os imports que RESOLVEM", (dir) => {
  // CLAUDE.md sintetico: 2 imports validos + 1 gerado no bootstrap (SKIP esperado).
  // Colar ao numero de imports do ficheiro real punha este teste vermelho num projeto
  // derivado, com um nome que nao descreve a causa.
  const md = [
    "# Entry",
    "",
    "@.agent/rules/core-rules.md",
    "@.agent/rules/process-rules.md",
    "@.agent/rules/business-logic.md",
    "",
    "| W | F |",
    "|---|---|",
    ...listWorkflowRows(dir),
  ].join("\n") + "\n";
  writeF(dir, "CLAUDE.md", md);
  writeF(dir, "GEMINI.md", md.replace(/^@(.*)$/gm, "@[$1]"));
}, {
  code: 0,
  synthetic: true, // a contagem depende de `business-logic.md` nao existir
  includes: ["2 de 3 @imports"],
});

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
