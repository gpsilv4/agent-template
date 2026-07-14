/**
 * Doc Guards — {{PROJECT_NAME}}
 *
 * Guards de consistencia de documentacao que correm SEMPRE (sem config):
 *   1. Orcamento de bytes das rules sempre-carregadas (`.agent/rules/*`) — o contexto
 *      do agente e finito; rules que incham degradam foco e custam tokens a cada sessao.
 *   2. Paridade CLAUDE.md === GEMINI.md (normalizando a diferenca de sintaxe `@[...]`) —
 *      sao espelhos; tocar so num e erro recorrente.
 *   3. Versao do `package.json` === ultima entrada de `src/docs/CHANGELOG.md`.
 *   4. Scanner de termos obsoletos/banidos nos docs vivos (config em BANNED).
 *   5. .nvmrc existe.
 *   6. Paridade workflows <-> wrappers (.claude/commands + .gemini/commands): cada workflow
 *      tem os dois wrappers e vice-versa — apanha "adicionei um workflow e esqueci o wrapper".
 *
 * E guards CONFIGURAVEIS (opcional): versoes de dependencias documentadas vs package.json (config em CHECKS).
 *
 * Uso:
 *   node .agent/scripts/check-doc-versions.mjs
 *
 * Sai com codigo != 0 se houver warnings (pode funcionar como gate no CI).
 * Correr antes de commit e apos merge de Dependabot PRs. Opt-in no CI (descomentar em .github/workflows/ci.yml).
 */

import { readFileSync, readdirSync } from "fs";

function listDir(path, ext) {
  try {
    return readdirSync(path)
      .filter((f) => f.endsWith(ext))
      .map((f) => f.slice(0, -ext.length))
      .sort();
  } catch {
    return null; // pasta inexistente
  }
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

let hasWarnings = false;
const warn = (msg) => {
  console.log(`  WARN  ${msg}`);
  hasWarnings = true;
};
const ok = (msg) => console.log(`  OK    ${msg}`);

console.log("\n=== Doc Guards ===\n");

// --- Guard 1: orcamento de bytes das rules sempre-carregadas ---
const RULES_FILES = [
  "core-rules.md",
  "process-rules.md",
  "anti-patterns.md",
  "business-logic.md",
  "pages-architecture.md",
].map((f) => `.agent/rules/${f}`);
const RULES_WARN_BYTES = 11500;
const RULES_MAX_BYTES = 12000;

for (const file of RULES_FILES) {
  const content = read(file);
  if (content === null) continue; // business-logic/pages-architecture sao gerados pela IA
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > RULES_MAX_BYTES) {
    warn(`${file} = ${bytes} bytes > ${RULES_MAX_BYTES} — condensar; mover detalhe para src/docs/ ou ficheiro nao-carregado`);
  } else if (bytes > RULES_WARN_BYTES) {
    console.log(`  NOTE  ${file} = ${bytes} bytes (perto do limite ${RULES_MAX_BYTES})`);
  } else {
    ok(`${file} = ${bytes} bytes`);
  }
}

// --- Guard 2: CLAUDE.md === GEMINI.md (normalizando sintaxe de import) ---
// Gemini usa `@[path]`, Claude/Cursor usa `@path`. Normalizar antes de comparar
// para apanhar drift de CONTEUDO sem falsos positivos na diferenca de sintaxe.
const claude = read("CLAUDE.md");
const gemini = read("GEMINI.md");
if (claude !== null && gemini !== null) {
  // Normaliza a sintaxe de import (@[x] -> @x) e colapsa espacamento/padding
  // (as celulas @[...] sao mais largas, logo o alinhamento das tabelas difere de forma cosmetica).
  const normalize = (s) =>
    s
      .replace(/@\[([^\]]+)\]/g, "@$1")
      .split("\n")
      .map((l) => {
        const c = l.replace(/[ \t]+/g, " ").trimEnd();
        // Linhas separadoras de tabela (| --- | :--: |): colapsar traços para o nº nao importar
        return /^\|[\s:|-]+\|?$/.test(c.trim()) ? c.replace(/-+/g, "-") : c;
      })
      .join("\n");
  if (normalize(claude) === normalize(gemini)) {
    ok("CLAUDE.md === GEMINI.md (modulo sintaxe @[...])");
  } else {
    warn("CLAUDE.md e GEMINI.md DIVERGEM (alem da sintaxe @[...]) — sao espelhos, sincroniza-os");
  }
} else if (claude !== null || gemini !== null) {
  warn("Existe CLAUDE.md ou GEMINI.md mas nao o par — ambos devem existir");
}

// --- Guard 3: package.json version === ultima versao do CHANGELOG ---
const pkgRaw = read("package.json");
const changelog = read("src/docs/CHANGELOG.md");
if (pkgRaw && changelog) {
  let pkgVersion = null;
  try {
    pkgVersion = JSON.parse(pkgRaw).version ?? null;
  } catch {
    warn("package.json invalido — nao foi possivel ler version");
  }
  // Ignorar exemplos dentro de comentarios HTML (ex: o `## [v0.1.0]` de exemplo no template).
  const clNoComments = changelog.replace(/<!--[\s\S]*?-->/g, "");
  // Aceita sufixos SemVer (pre-release/build): 1.2.3, 1.2.3-beta.1, 1.2.3+build
  const m = clNoComments.match(/^##\s*\[v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)\]/m);
  const clVersion = m ? m[1] : null;
  if (pkgVersion && clVersion) {
    if (pkgVersion.replace(/^v/, "") === clVersion) ok(`CHANGELOG topo (v${clVersion}) === package.json`);
    else warn(`package.json (${pkgVersion}) != topo do CHANGELOG (v${clVersion}) — atualizar o CHANGELOG antes do commit`);
  } else if (pkgVersion && !clVersion) {
    console.log("  NOTE  CHANGELOG ainda sem entrada de versao (template) — nada a comparar");
  }
}

// --- Guard 4: termos obsoletos/banidos nos docs vivos ---
// Adicionar entradas conforme forem renomeados ficheiros/termos ou mudarem contagens.
// Exclui historico (*-archive.md, CHANGELOG.md).
const BANNED = [
  // { re: /nome-antigo-do-ficheiro/g, msg: "renomeado para nome-novo" },
];
const LIVING_DOCS = [
  "README.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".agent/rules/core-rules.md",
  ".agent/rules/process-rules.md",
  ".agent/rules/anti-patterns.md",
];
if (BANNED.length > 0) {
  for (const file of LIVING_DOCS) {
    const content = read(file);
    if (content === null) continue;
    for (const { re, msg } of BANNED) {
      if (re.test(content)) warn(`${file}: termo obsoleto encontrado — ${msg}`);
    }
  }
}

// --- Guard 5: .nvmrc existe ---
const nvmrc = read(".nvmrc");
if (nvmrc) ok(`.nvmrc = ${nvmrc.trim()}`);
else warn(".nvmrc nao encontrado");

// --- Guard 6: paridade workflows <-> wrappers (.claude/commands + .gemini/commands) ---
// So corre se as pastas de wrappers existirem (um projeto pode optar por nao as usar).
// Assume wrappers FLAT (sem subpastas de namespacing); ficheiros nao-comando nessas pastas
// contam como wrappers. Se usares namespacing/helpers, ajusta este guard.
const workflows = listDir(".agent/workflows", ".md");
const claudeCmds = listDir(".claude/commands", ".md");
const geminiCmds = listDir(".gemini/commands", ".toml");
if (workflows && (claudeCmds || geminiCmds)) {
  const wf = new Set(workflows);
  const checkSet = (cmds, label) => {
    if (!cmds) return;
    for (const w of workflows) if (!cmds.includes(w)) warn(`Workflow "${w}" sem wrapper em ${label}`);
    for (const c of cmds) if (!wf.has(c)) warn(`Wrapper "${c}" em ${label} sem workflow correspondente em .agent/workflows/`);
  };
  checkSet(claudeCmds, ".claude/commands");
  checkSet(geminiCmds, ".gemini/commands");
  if (claudeCmds && geminiCmds && claudeCmds.join() === geminiCmds.join() && claudeCmds.join() === workflows.join()) {
    ok(`workflows <-> wrappers em paridade (${workflows.length})`);
  }
}

// --- Guards CONFIGURAVEIS: versoes de dependencias documentadas ---
// pattern: regex que captura a versao no markdown (ex: "Next.js 16.2.2")
const CHECKS = [
  // { name: "Next.js", pkg: "next", pattern: /Next\.js\s+(\d+(?:\.\d+(?:\.\d+)?)?)/g, files: [".agent/rules/core-rules.md"] },
];

function cleanVersion(raw) {
  return raw.replace(/^[\^~>=<\s]*/g, "");
}
function parts(v) {
  const m = cleanVersion(v).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return { major: +m[1], minor: m[2] != null ? +m[2] : null, patch: m[3] != null ? +m[3] : null };
}
function isOutdated(documented, actual) {
  const d = parts(documented), a = parts(actual);
  if (!d || !a) return false;
  if (d.minor === null) return d.major !== a.major;
  if (d.patch === null) return d.major !== a.major || d.minor !== a.minor;
  return d.major !== a.major || d.minor !== a.minor || d.patch !== a.patch;
}

let pkgParsed = null;
if (pkgRaw) {
  try {
    pkgParsed = JSON.parse(pkgRaw);
  } catch {
    /* Guard 3 ja avisou sobre package.json invalido */
  }
}
if (CHECKS.length > 0 && pkgParsed) {
  const pkg = pkgParsed;
  for (const check of CHECKS) {
    const dep = pkg.dependencies?.[check.pkg] || pkg.devDependencies?.[check.pkg];
    if (!dep) {
      console.log(`  SKIP  ${check.name} — nao esta no package.json`);
      continue;
    }
    const actual = cleanVersion(dep);
    for (const file of check.files) {
      const content = read(file);
      if (content === null) {
        console.log(`  SKIP  ${file} — nao encontrado`);
        continue;
      }
      const matches = [...content.matchAll(check.pattern)];
      if (matches.length === 0) {
        ok(`${check.name} — sem referencia de versao em ${file}`);
        continue;
      }
      for (const match of matches) {
        if (isOutdated(match[1], actual)) warn(`${check.name} em ${file}: documentado ${match[1]}, atual ${actual}`);
        else ok(`${check.name} = ${match[1]} (bate com ${actual})`);
      }
    }
  }
}

console.log("");
if (hasWarnings) {
  console.log("WARNING: ha divergencias/avisos de documentacao. Corrigir antes de commit.\n");
} else {
  console.log("Todos os guards de documentacao passaram.\n");
}
// Exit != 0 em caso de warning para poder funcionar como gate no CI.
process.exit(hasWarnings ? 1 : 0);
