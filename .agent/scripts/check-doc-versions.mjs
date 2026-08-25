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
 *   5. .nvmrc existe e tem uma versao plausivel.
 *   6. Paridade workflows <-> wrappers (.claude/commands + .gemini/commands): cada workflow
 *      tem os dois wrappers e vice-versa — apanha "adicionei um workflow e esqueci o wrapper".
 *   7. Cada workflow esta listado na tabela de CLAUDE.md/GEMINI.md — apanha drift da lista.
 *
 * E guards CONFIGURAVEIS (opcional): versoes de dependencias documentadas vs package.json (config em CHECKS).
 *
 * DOIS PRINCIPIOS, aprendidos de defeitos reais:
 *   a) Caminhos ancorados a RAIZ DO REPO, nao ao cwd. Antes, correr o script de um
 *      subdiretorio desligava todos os guards e imprimia "todos passaram" com exit 0.
 *   b) Skip e SEMPRE visivel. Um guard que nao corre imprime `SKIP`; nunca desaparece.
 *      "Nao havia nada para verificar" nao pode ser indistinguivel de "verifiquei e esta bem".
 *
 * Uso:
 *   node .agent/scripts/check-doc-versions.mjs
 *
 * Sai com codigo != 0 se houver warnings (pode funcionar como gate no CI).
 * Testes: node .agent/scripts/test-guards.mjs
 * Correr antes de commit e apos merge de Dependabot PRs. Opt-in no CI (descomentar em .github/workflows/ci.yml).
 */

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

// --- Ancoragem a raiz do repo -------------------------------------------------
// Este ficheiro vive em <raiz>/.agent/scripts/, logo a raiz esta dois niveis acima.
// Sem isto, todos os caminhos abaixo eram relativos ao cwd e o script "passava"
// sem verificar nada quando corrido de qualquer outro diretorio.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function listDir(path, ext) {
  try {
    return readdirSync(join(ROOT, path))
      .filter((f) => f.endsWith(ext))
      .map((f) => f.slice(0, -ext.length))
      .sort();
  } catch {
    return null; // pasta inexistente
  }
}

function read(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch {
    return null; // ficheiro inexistente (distinto de ficheiro vazio, que devolve "")
  }
}

let hasWarnings = false;
let guardsRun = 0;
let guardsSkipped = 0;
const warn = (msg) => {
  console.log(`  WARN  ${msg}`);
  hasWarnings = true;
};
const ok = (msg) => console.log(`  OK    ${msg}`);
const note = (msg) => console.log(`  NOTE  ${msg}`);
const skip = (msg) => {
  console.log(`  SKIP  ${msg}`);
  guardsSkipped++;
};

console.log("\n=== Doc Guards ===\n");
console.log(`  raiz: ${ROOT}\n`);

// --- Guard 1: orcamento de bytes das rules sempre-carregadas ---
// Duas listas distintas: a ausencia de uma rule OBRIGATORIA e um defeito (o `@import`
// em CLAUDE.md fica pendurado); a das duas geradas no bootstrap e esperada.
const REQUIRED_RULES = ["core-rules.md", "process-rules.md", "anti-patterns.md"];
const BOOTSTRAP_RULES = ["business-logic.md", "pages-architecture.md"];
const RULES_WARN_BYTES = 11500;
const RULES_MAX_BYTES = 12000;

function checkRuleBytes(file) {
  const content = read(file);
  if (content === null) return null;
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > RULES_MAX_BYTES) {
    warn(`${file} = ${bytes} bytes > ${RULES_MAX_BYTES} — condensar; mover detalhe para src/docs/ ou ficheiro nao-carregado`);
  } else if (bytes > RULES_WARN_BYTES) {
    note(`${file} = ${bytes} bytes (perto do limite ${RULES_MAX_BYTES})`);
  } else {
    ok(`${file} = ${bytes} bytes`);
  }
  return bytes;
}

for (const f of REQUIRED_RULES) {
  const file = `.agent/rules/${f}`;
  if (checkRuleBytes(file) === null) {
    warn(`${file} NAO EXISTE — e uma rule obrigatoria e esta importada em CLAUDE.md/GEMINI.md`);
  }
  guardsRun++;
}
for (const f of BOOTSTRAP_RULES) {
  const file = `.agent/rules/${f}`;
  if (checkRuleBytes(file) === null) skip(`${file} — gerado no bootstrap, ainda nao existe`);
  else guardsRun++;
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
  guardsRun++;
} else if (claude !== null || gemini !== null) {
  warn("Existe CLAUDE.md ou GEMINI.md mas nao o par — ambos devem existir");
  guardsRun++;
} else {
  warn("CLAUDE.md e GEMINI.md nao encontrados — sao os entry points do projeto");
  guardsRun++;
}

// --- Guard 3: package.json version === ultima versao do CHANGELOG ---
// So se aplica quando ja existe package.json. A partir dai, tudo o que falte e WARN:
// um CHANGELOG movido ou um package.json sem `version` desligavam este guard em silencio.
const CHANGELOG_PATH = "src/docs/CHANGELOG.md";
const pkgRaw = read("package.json");
if (pkgRaw === null) {
  skip("Guard 3 (versoes) — sem package.json (template ainda sem app)");
} else {
  let pkgVersion = null;
  let pkgInvalid = false;
  try {
    pkgVersion = JSON.parse(pkgRaw).version ?? null;
  } catch {
    pkgInvalid = true;
    warn("package.json invalido — nao foi possivel ler version");
  }
  const changelog = read(CHANGELOG_PATH);
  if (!pkgInvalid && pkgVersion === null) {
    warn(`package.json sem campo "version" — o Guard 3 nao tem com que comparar`);
  }
  if (changelog === null) {
    warn(`${CHANGELOG_PATH} nao encontrado — core-rules.md exige-o atualizado antes de cada commit`);
  } else if (pkgVersion) {
    // Ignorar exemplos dentro de comentarios HTML (ex: o `## [v0.1.0]` de exemplo no template).
    const clNoComments = changelog.replace(/<!--[\s\S]*?-->/g, "");
    // Aceita `## [v1.2.3]`, `## v1.2.3` e `## 1.2.3`, com sufixos SemVer (pre-release/build).
    const SEMVER = /^##\s*\[?v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)\]?/gm;
    const found = [...clNoComments.matchAll(SEMVER)].map((m) => m[1]);
    const headings = [...clNoComments.matchAll(/^##\s+\S/gm)].length;
    if (found.length === 0) {
      if (headings > 0) {
        warn(`${CHANGELOG_PATH} tem ${headings} heading(s) "##" mas nenhum no formato "## [vX.Y.Z] - Descricao" — formato invalido`);
      } else {
        note(`${CHANGELOG_PATH} ainda sem entrada de versao (template) — nada a comparar`);
      }
    } else {
      // Nao assumir que o topo e a versao mais alta: comparar contra o maximo e
      // avisar se a ordenacao estiver invertida (um CHANGELOG ascendente dava falso positivo).
      const cmp = (a, b) => {
        const pa = a.split(/[.\-+]/).map(Number);
        const pb = b.split(/[.\-+]/).map(Number);
        for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        return 0;
      };
      const max = [...found].sort(cmp).at(-1);
      if (found[0] !== max) {
        warn(`${CHANGELOG_PATH}: a entrada no topo e v${found[0]} mas a maior e v${max} — ordenar por versao decrescente`);
      }
      const clean = pkgVersion.replace(/^v/, "");
      if (clean === max) ok(`CHANGELOG (v${max}) === package.json`);
      else warn(`package.json (${pkgVersion}) != maior versao do CHANGELOG (v${max}) — atualizar o CHANGELOG antes do commit`);
    }
  }
  guardsRun++;
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
if (BANNED.length === 0) {
  skip("Guard 4 (termos banidos) — lista BANNED vazia");
} else {
  for (const file of LIVING_DOCS) {
    const content = read(file);
    if (content === null) {
      skip(`Guard 4 em ${file} — ficheiro nao encontrado`);
      continue;
    }
    const lines = content.split("\n");
    for (const { re, msg } of BANNED) {
      // Regex NOVA por ficheiro: reutilizar um objeto com flag /g faz `.test()`
      // avancar `lastIndex` e perder matches nos ficheiros seguintes.
      const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      lines.forEach((line, i) => {
        rx.lastIndex = 0;
        if (rx.test(line)) warn(`${file}:${i + 1}: termo obsoleto encontrado — ${msg}`);
      });
    }
  }
  guardsRun++;
}

// --- Guard 5: .nvmrc existe e tem conteudo plausivel ---
// `read()` devolve "" para ficheiro vazio e null para inexistente — distinguir os dois,
// e validar o conteudo: um .nvmrc invalido quebra `node-version-file` nos 3 jobs de CI.
const nvmrc = read(".nvmrc");
if (nvmrc === null) {
  warn(".nvmrc nao encontrado — e a fonte unica da versao Node (CI le-a via node-version-file)");
} else {
  const v = nvmrc.trim();
  if (v === "") warn(".nvmrc esta vazio — `node-version-file` vai falhar no CI");
  else if (!/^(v?\d+(\.\d+)*|lts\/\*|lts\/[a-z]+|node)$/i.test(v)) warn(`.nvmrc = "${v}" — nao parece uma versao Node valida`);
  else ok(`.nvmrc = ${v}`);
}
guardsRun++;

// --- Guard 6: paridade workflows <-> wrappers (.claude/commands + .gemini/commands) ---
// So corre se as pastas de wrappers existirem (um projeto pode optar por nao as usar),
// mas a ausencia e SKIP visivel: antes, apagar uma pasta era indistinguivel do opt-out.
// Assume wrappers FLAT (sem subpastas de namespacing); ficheiros nao-comando nessas pastas
// contam como wrappers. Se usares namespacing/helpers, ajusta este guard.
const workflows = listDir(".agent/workflows", ".md");
const claudeCmds = listDir(".claude/commands", ".md");
const geminiCmds = listDir(".gemini/commands", ".toml");
if (!workflows) {
  warn(".agent/workflows/ nao encontrado — e a fonte unica dos comandos");
  guardsRun++;
} else {
  if (!claudeCmds) skip(".claude/commands — pasta ausente (opt-out?)");
  if (!geminiCmds) skip(".gemini/commands — pasta ausente (opt-out?)");
  if (claudeCmds || geminiCmds) {
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
    guardsRun++;
  }
}

// --- Guard 7: cada workflow esta listado na tabela de CLAUDE.md (== GEMINI.md via Guard 2) ---
// Fecha o drift da lista de workflows: o Guard 6 apanha wrappers em falta, este apanha
// um workflow adicionado mas esquecido na tabela dos ficheiros de entrada.
//
// Procura o CAMINHO COMPLETO, nao o nome do ficheiro. Com match por substring,
// "review.md" era satisfeito por "design-review.md" e "plan.md" por
// "implementation_plan.md" (importado em CLAUDE.md) — os dois workflows mais usados
// do fluxo ficavam permanentemente exemptos deste guard.
if (workflows && claude) {
  let missing = 0;
  for (const w of workflows) {
    if (!claude.includes(`.agent/workflows/${w}.md`)) {
      warn(`Workflow "${w}" nao listado na tabela de CLAUDE.md/GEMINI.md (esperado o caminho \`.agent/workflows/${w}.md\`)`);
      missing++;
    }
  }
  if (missing === 0) ok(`workflows listados nas tabelas de entrada (${workflows.length})`);
  guardsRun++;
} else {
  skip("Guard 7 (workflows nas tabelas) — falta .agent/workflows/ ou CLAUDE.md");
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
if (CHECKS.length === 0) {
  skip("Guards de versoes de dependencias — lista CHECKS vazia (opt-in)");
} else if (!pkgParsed) {
  skip("Guards de versoes de dependencias — sem package.json legivel");
} else {
  const pkg = pkgParsed;
  for (const check of CHECKS) {
    const dep = pkg.dependencies?.[check.pkg] || pkg.devDependencies?.[check.pkg];
    if (!dep) {
      skip(`${check.name} — nao esta no package.json`);
      continue;
    }
    const actual = cleanVersion(dep);
    for (const file of check.files) {
      const content = read(file);
      if (content === null) {
        skip(`${file} — nao encontrado`);
        continue;
      }
      const rx = new RegExp(check.pattern.source, check.pattern.flags.includes("g") ? check.pattern.flags : check.pattern.flags + "g");
      const matches = [...content.matchAll(rx)];
      if (matches.length === 0) {
        ok(`${check.name} — sem referencia de versao em ${file}`);
        continue;
      }
      for (const match of matches) {
        if (isOutdated(match[1], actual)) warn(`${check.name} em ${file}: documentado ${match[1]}, atual ${actual}`);
        else ok(`${check.name} = ${match[1]} (bate com ${actual})`);
      }
    }
    guardsRun++;
  }
}

console.log("");
console.log(`  ${guardsRun} guard(s) executado(s), ${guardsSkipped} saltado(s).`);
if (hasWarnings) {
  console.log("\nWARNING: ha divergencias/avisos de documentacao. Corrigir antes de commit.\n");
} else {
  console.log("\nTodos os guards de documentacao passaram.\n");
}
// Exit != 0 em caso de warning para poder funcionar como gate no CI.
process.exit(hasWarnings ? 1 : 0);
