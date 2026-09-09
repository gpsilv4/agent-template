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

import { cpSync, mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve, join } from "path";
import { tmpdir } from "os";

// NAO e um entry point. Corrido diretamente, este ficheiro imprimia o cabecalho de uma
// suite e saia 0 sem executar uma unica assercao — um ficheiro chamado `tests-*.mjs` que
// "passa" sem correr nada e a forma canonica do AP2 ("zero resultados lido como zero
// problemas"). Achado do leitor independente (Fase 4).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    `test-harness.mjs nao e um entry point: nao corre testes por si.\n` +
      "Correr `node .agent/scripts/test-guards.mjs`, que importa este modulo e chama registar()."
  );
  process.exit(1);
}


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GUARD = ".agent/scripts/check-doc-versions.mjs";
// Modulos que o GUARD importa. Copiar a pasta INTEIRA, e nao ficheiro a ficheiro: ao
// extrair o Guard 11 para `guards/settings.mjs`, o sandbox sintetico deixou de resolver o
// import e a suite abortou. Com a pasta, extrair mais modulos nao volta a quebrar isto.
const GUARD_MODULES = ".agent/scripts/guards";

// Conjunto minimo que os guards leem. Copiado a cada teste para isolar mutacoes.
const FIXTURE_PATHS = [
  ".agent/rules",
  ".agent/workflows",
  // O `BOOTSTRAP.md` nao estava aqui, logo qualquer guard que o leia ficava sem teste — foi
  // o que aconteceu ao 12d (contagem de guards numerados), que o cita.
  ".agent/BOOTSTRAP.md",
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
  if (existsSync(join(ROOT, GUARD_MODULES))) {
    cpSync(join(ROOT, GUARD_MODULES), join(dir, GUARD_MODULES), { recursive: true });
  }

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


/** Registar um resultado sem passar pelo `test()` — para os blocos da baseline, que
 *  montam a fixture a mao. Os contadores sao deste modulo: exportá-los daria bindings
 *  so-leitura e quem incrementasse de fora rebentava com `passed is not defined`. */
export function registarResultado(name, problems, out) {
  if (problems.length) {
    failures.push({ name, problems, out });
    console.log(`  FAIL  ${name}`);
    for (const p of problems) console.log(`          ${p}`);
  } else {
    passed++;
    console.log(`  PASS  ${name}`);
  }
}

export { test, sandbox, syntheticSandbox, runGuard, file, readF, writeF, patchSettings,
         listWorkflowRows, dropLinesContaining, GUARD, GUARD_MODULES, ROOT };

/** Imprime o resumo e sai. Vive aqui porque `passed`/`failures` sao deste modulo — exportar
 *  contadores mutaveis daria bindings so-leitura e o resumo ficaria sempre a zero. */
export function resumo() {
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

}
