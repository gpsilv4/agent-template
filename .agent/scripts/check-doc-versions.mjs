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

/** Le um ficheiro que TEM de ter conteudo. Vazio, so espacos ou so BOM avisa na hora e
 *  devolve `null`, para que os guards a jusante o tratem como ausente em vez de correrem
 *  sobre uma string vazia. Uma versao anterior acumulava os avisos e fazia flush num ponto
 *  fixo, pelo que qualquer chamada abaixo desse ponto ficava silenciosa; e `"   "` era
 *  truthy, activando guards que depois cuspiam avisos espurios. */
const blankPaths = new Set();
function readMeaningful(path) {
  const c = read(path);
  if (c === null) return null;
  if (c.replace(/^\uFEFF/, "").trim() === "") {
    warn(`${path} existe mas esta VAZIO — os guards que dependem dele nao tem o que verificar`);
    blankPaths.add(path);
    return null;
  }
  return c;
}
/** Mensagem honesta para um SKIP: distingue "nao existe" de "existe mas esta vazio". */
const why = (path) => (blankPaths.has(path) ? `${path} esta vazio` : `sem ${path}`);

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
  if (content.trim() === "") {
    warn(`${file} = ${bytes} bytes mas esta VAZIO — e uma rule importada em CLAUDE.md/GEMINI.md`);
    return bytes;
  }
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
const claude = readMeaningful("CLAUDE.md");
const gemini = readMeaningful("GEMINI.md");
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
  if (!pkgInvalid && !pkgVersion) {
    warn(`package.json sem campo "version" utilizavel — o Guard 3 nao tem com que comparar`);
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
      // Precedencia SemVer (spec §11). Uma versao anterior desta funcao usava
      // `split(/[-+]/, 2)` e comparacao de strings, o que dava tres bugs de uma vez:
      // `beta.10 < beta.9` (string), `1.2.3+build < 1.2.3` (build tratado como
      // pre-release) e `beta-9 == beta-2` (o split truncava o resto). Isso fazia o guard
      // BLOQUEAR um CHANGELOG correctamente ordenado.
      const parseV = (v) => {
        const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v);
        if (!m) return null;
        return { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split(".") : [] };
      };
      const cmp = (a, b) => {
        const pa = parseV(a);
        const pb = parseV(b);
        if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
        for (let i = 0; i < 3; i++) if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
        // Build metadata ja foi descartado: nao conta para precedencia (spec §10).
        if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
        if (pa.pre.length === 0) return 1;  // release > pre-release
        if (pb.pre.length === 0) return -1;
        for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
          const x = pa.pre[i];
          const y = pb.pre[i];
          if (x === undefined) return -1;   // menos identificadores = menor
          if (y === undefined) return 1;
          const nx = /^\d+$/.test(x);
          const ny = /^\d+$/.test(y);
          if (nx && ny) { if (+x !== +y) return +x - +y; continue; }
          if (nx !== ny) return nx ? -1 : 1; // numerico < alfanumerico
          if (x !== y) return x < y ? -1 : 1;
        }
        return 0;
      };
      const max = [...found].sort(cmp).at(-1);
      if (cmp(found[0], max) !== 0) {
        warn(`${CHANGELOG_PATH}: a entrada no topo e v${found[0]} mas a maior e v${max} — ordenar por versao decrescente`);
      }
      // Comparar por precedencia, nao por string: `1.2.3` e `1.2.3+build.5` sao a mesma
      // versao (spec §10), e a igualdade de string reportava-as como divergentes.
      const clean = pkgVersion.replace(/^v/, "");
      if (cmp(clean, max) === 0) ok(`CHANGELOG (v${max}) === package.json`);
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
  skip(`Guard 7 (workflows nas tabelas) — falta .agent/workflows/ ou ${why("CLAUDE.md")}`);
}

// --- Guard 8: os `@imports` de CLAUDE.md resolvem ---
// Um caminho com gralha era silencioso: o agente carregava menos contexto do que
// pensava, sem sinal nenhum. As duas rules geradas no bootstrap sao a excecao esperada.
const BOOTSTRAP_GENERATED = new Set([
  ".agent/rules/business-logic.md",
  ".agent/rules/pages-architecture.md",
]);
if (claude) {
  const imports = [...claude.matchAll(/^@(\S+)/gm)].map((m) => m[1]);
  if (imports.length === 0) {
    warn("CLAUDE.md sem nenhum `@import` — os ficheiros de regras/contexto nao serao carregados");
  } else {
    let broken = 0;
    let pending = 0;
    for (const path of imports) {
      if (read(path) !== null) continue;
      if (BOOTSTRAP_GENERATED.has(path)) {
        skip(`@${path} — gerado no bootstrap, ainda nao existe`);
        pending++;
      } else {
        warn(`CLAUDE.md importa \`@${path}\` mas o ficheiro NAO EXISTE`);
        broken++;
      }
    }
    // Contar so os que RESOLVEM: antes dizia "11 @imports resolvem" logo a seguir a
    // dois SKIP de imports que nao resolviam.
    if (broken === 0) ok(`${imports.length - pending} de ${imports.length} @imports de CLAUDE.md resolvem`);
  }
  guardsRun++;
} else {
  skip(`Guard 8 (@imports) — ${why("CLAUDE.md")}`);
}

// --- Guard 9: workflows listados em AGENTS.md e agent-guide.md ---
// O Guard 7 cobre so o par CLAUDE/GEMINI. Estes dois ficheiros duplicam a mesma lista
// e nao tinham rede nenhuma. Os nomes sao delimitados por backticks nos dois formatos,
// o que da a fronteira exata (`review` nao casa com `design-review`).
const agentsMd = readMeaningful("AGENTS.md");
if (workflows && agentsMd) {
  let missing = 0;
  for (const w of workflows) {
    if (!agentsMd.includes(`\`${w}\``)) {
      warn(`Workflow "${w}" nao listado em AGENTS.md (esperado o token \`${w}\`)`);
      missing++;
    }
  }
  if (missing === 0) ok(`workflows listados em AGENTS.md (${workflows.length})`);
  guardsRun++;
} else {
  skip(`Guard 9a — ${why("AGENTS.md")}`);
}

const agentGuide = readMeaningful("src/docs/agent-guide.md");
if (workflows && agentGuide) {
  let missing = 0;
  for (const w of workflows) {
    if (!agentGuide.includes(`\`/${w}\``)) {
      warn(`Workflow "${w}" nao listado em src/docs/agent-guide.md (esperado \`/${w}\`)`);
      missing++;
    }
  }
  if (missing === 0) ok(`workflows listados em agent-guide.md (${workflows.length})`);
  guardsRun++;
} else {
  skip(`Guard 9b — ${why("src/docs/agent-guide.md")}`);
}

// --- Guard 10: cada wrapper aponta para o SEU workflow ---
// O Guard 6 valida existencia; este valida conteudo. Um wrapper vazio, ou a apontar
// para o workflow errado, passava — e core-rules.md exige ponteiros finos, verificavel.
if (workflows && (claudeCmds || geminiCmds)) {
  let bad = 0;
  const checkPointer = (file, w, label) => {
    const content = read(file);
    if (content === null) return; // ausencia ja e apanhada pelo Guard 6
    if (!content.includes(`.agent/workflows/${w}.md`)) {
      warn(`Wrapper ${label} nao aponta para \`.agent/workflows/${w}.md\` — ponteiro fino em falta`);
      bad++;
    }
  };
  for (const w of workflows) {
    if (claudeCmds?.includes(w)) checkPointer(`.claude/commands/${w}.md`, w, `.claude/commands/${w}.md`);
    if (geminiCmds?.includes(w)) checkPointer(`.gemini/commands/${w}.toml`, w, `.gemini/commands/${w}.toml`);
  }
  if (bad === 0) ok("wrappers apontam para o workflow correspondente");
  guardsRun++;
} else {
  skip("Guard 10 (conteudo dos wrappers) — sem pastas de wrappers");
}

// --- Guard 11: sanidade do .claude/settings.json ---
// E a fronteira de seguranca do projeto e nao tinha rede nenhuma: um `allow` demasiado
// largo passava CI sem sinal. Nao substitui revisao humana — apanha as regressoes obvias.
const SETTINGS_PATH = ".claude/settings.json";
const settingsRaw = read(SETTINGS_PATH);
if (settingsRaw === null) {
  skip(`Guard 11 (${SETTINGS_PATH}) — ficheiro ausente (projeto pode nao usar Claude Code)`);
} else {
  let settings = null;
  try {
    settings = JSON.parse(settingsRaw);
  } catch (err) {
    warn(`${SETTINGS_PATH} nao e JSON valido (${err instanceof Error ? err.message : String(err)})`);
  }
  if (settings) {
    const perms = settings.permissions ?? {};
    const asList = (v, name) => {
      if (v === undefined) return [];
      if (Array.isArray(v)) return v;
      warn(`${SETTINGS_PATH}: \`permissions.${name}\` devia ser um array`);
      return [];
    };
    const denyRaw = asList(perms.deny, "deny");
    const allow = asList(perms.allow, "allow");
    let issues = 0;
    const flag = (msg) => {
      warn(`${SETTINGS_PATH}: ${msg}`);
      issues++;
    };
    // Filtrar DEPOIS de `flag` existir: uma versao anterior usava `warn` aqui, logo
    // `issues` ficava 0 e o guard imprimia o WARN e o OK ao mesmo tempo.
    const deny = denyRaw.filter((r) => {
      if (typeof r === "string") return true;
      flag(`entrada do \`deny\` que nao e string (${JSON.stringify(r)})`);
      return false;
    });

    // Cobertura do deny de secrets: verificar que ALGUM padrao cobre cada caminho tipico,
    // em vez de exigir os 4 literais. Um projeto com `Read(./**/.env*)` (superset estrito)
    // era reportado como tendo o deny em falta.
    const denyCovers = (target) =>
      deny.some((rule) => {
        const m = /^Read\((.*)\)$/.exec(rule);
        if (!m) return false;
        // Traducao glob->regex numa passagem unica. Fazer os `replace` em cadeia era
        // um bug: o `.*` inserido pelo passo do `**` continha um `*` que o passo
        // seguinte voltava a reescrever, produzindo `(?:.[^/]*/)?` — que nao casa com
        // caminhos aninhados, e o guard reportava um deny correcto como estando em falta.
        const glob = m[1].replace(/^\.\//, "");
        let rxSrc = "";
        for (let i = 0; i < glob.length; i++) {
          if (glob[i] === "*" && glob[i + 1] === "*") {
            if (glob[i + 2] === "/") { rxSrc += "(?:[^/]+/)*"; i += 2; }
            else { rxSrc += ".*"; i += 1; }
          } else if (glob[i] === "*") {
            rxSrc += "[^/]*";
          } else {
            rxSrc += glob[i].replace(/[.+^${}()|[\]\\?]/, "\\$&");
          }
        }
        const rx = new RegExp(`^${rxSrc}$`);
        return rx.test(target);
      });
    for (const target of [".env", ".env.local", ".env.production", "a/b/.env", "a/.env.local"]) {
      if (!denyCovers(target)) flag(`nenhuma regra \`deny\` cobre a leitura de \`${target}\` (nota: o tradutor de glob nao expande braces \`{a,b}\`)`);
    }

    // Um `allow` demasiado largo anula o deny ao lado. Casos que ja foram reais aqui:
    // `Bash(npm run lint*)` cobria `npm run lint-and-deploy`; `Bash(node .agent/scripts/*)`
    // cobria qualquer ficheiro nesse caminho; `Bash(*)` e `Bash(rm -rf *)` abriam tudo; e
    // `Bash` sem parenteses e a concessao maxima possivel.
    // A propriedade que interessa nao e a FORMA da regra — e se o argumento fica
    // constrangido. Uma versao anterior testava a forma e por isso aprovava
    // `Bash(/bin/sh:*)` (prefixo derrota o `^`), `Bash(npm:*)` (npm exec e arbitrario),
    // `Bash ` (sem trim), `Grep`/`NotebookEdit`/`mcp__*` (fora da lista hardcoded), e
    // ao mesmo tempo marcava como perigosa a concessao estreita e legitima
    // `Bash(node .agent/scripts/x.mjs:*)`.
    // O que interessa e se o argumento fica constrangido. Formas que versoes anteriores
    // aprovaram, cada uma por uma razao diferente:
    //   `Bash(sh:*)`            -> apanhado
    //   `Bash(/bin/sh:*)`       -> prefixo derrotava um `^` ancorado
    //   `Bash(env -i sh:*)`     -> remover o wrapper deixava a FLAG como head
    //   `Bash(BASH -c:*)`       -> comparacao case-sensitive
    //   `Bash(git log; sh:*)`   -> metacaracteres de shell nunca eram olhados
    //   `Read(~/**)`            -> so padroes feitos de `*` e `/` eram vistos
    //   `WebFetch(*)`           -> so os nomes NUS eram cobertos
    const WRAPPERS = new Set(["env", "command", "nohup", "nice", "time", "sudo", "doas", "xargs", "exec", "setsid", "stdbuf"]);
    const RISKY = new Set([
      "sh", "bash", "zsh", "fish", "dash", "csh", "ksh", "tcsh",
      "node", "deno", "bun", "python", "python3", "ruby", "perl", "php", "osascript", "lua",
      "eval", "npm", "npx", "pnpm", "yarn", "make", "git", "find", "awk", "sed", "xargs",
      "rm", "mv", "dd", "chmod", "chown", "curl", "wget", "nc", "ncat", "ssh", "scp",
      "docker", "kubectl", "security", "defaults", "launchctl", "systemctl", "sudo", "doas",
    ]);
    // `;` `&&` `||` `|` backtick `$(` `>` `<` `\n` — encadeiam um segundo comando.
    const SHELL_META = /[;|&`\n]|\$\(|>|</;
    // Comandos que, mesmo com argumentos fixos, nao devem ser pre-aprovados.
    const DESTRUCTIVE = new Set(["rm", "dd", "mv", "chmod", "chown", "mkfs", "shutdown", "reboot", "killall"]);
    const baseName = (tok) => tok.split("/").pop().toLowerCase();

    for (const raw of allow) {
      if (typeof raw !== "string") {
        flag(`entrada do \`allow\` que nao e string (${JSON.stringify(raw)}) — ignorada em silencio pelo motor`);
        continue;
      }
      const rule = raw.trim();

      // Nome de ferramenta sem `(...)`: concede a ferramenta INTEIRA.
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(rule)) {
        flag(`\`${rule}\` sem \`(...)\` concede a ferramenta INTEIRA — enumerar os comandos/caminhos exatos`);
        continue;
      }

      const parsed = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(rule);
      if (!parsed) {
        flag(`\`${rule}\` nao tem a forma \`Ferramenta(padrao)\` — o motor pode ignora-la`);
        continue;
      }
      const [, tool, bodyRaw] = parsed;
      const body = bodyRaw.trim();

      if (tool === "Bash") {
        if (SHELL_META.test(body)) {
          flag(`\`${rule}\` contem metacaracteres de shell — encadeia um segundo comando`);
          continue;
        }
        const suffix = /^(.*[^*]):\*$/.exec(body);
        if (body.includes("*") && !suffix) {
          flag(`\`${rule}\` tem wildcard sem delimitador — enumerar os comandos exatos`);
          continue;
        }
        // Procurar um comando perigoso em QUALQUER posicao do prefixo fixo, nao so na
        // primeira. Descartar apenas o head nao bastava: em `sudo -u root sh:*` o loop
        // consumia `sudo` e `-u`, e o head passava a ser `root` — o argumento do wrapper.
        const fixed = suffix ? suffix[1] : body;
        const tokens = fixed.split(/\s+/).filter(Boolean);
        const riskyAt = tokens.findIndex((t) => RISKY.has(baseName(t)));
        const head = riskyAt === -1 ? "" : baseName(tokens[riskyAt]);
        const next = riskyAt === -1 ? undefined : tokens[riskyAt + 1];
        if (!suffix) {
          // Comando FIXO: nao ha argumentos livres, logo `npx tsc --noEmit` e seguro.
          // So interessam dois casos: um interpretador sozinho (shell interactiva) ou
          // um comando destrutivo pre-aprovado.
          if (riskyAt !== -1 && (next === undefined || DESTRUCTIVE.has(head))) {
            flag(`\`${rule}\` pre-aprova \`${head}\` — shell interactiva ou comando destrutivo`);
          }
          continue;
        }
        if (riskyAt !== -1) {
          // Com `:*` ha argumentos livres: so aceitavel se o comando perigoso vier
          // seguido de um alvo FIXO (`node caminho/script.mjs:*`, `npm run lint:*`).
          const alvoFixo = next && !next.startsWith("-") && !next.includes("*");
          if (!alvoFixo) {
            flag(`\`${rule}\` deixa \`${head}\` receber argumentos livres — equivale a execucao arbitraria`);
            continue;
          }
        }
        if (tokens.length === 1) {
          // Comando desconhecido com um so token: largo, mas nao necessariamente perigoso
          // (`ls:*`, `cat:*`). NOTE em vez de WARN — nao trava o gate.
          note(`${SETTINGS_PATH}: \`${rule}\` pre-aprova quaisquer argumentos de \`${baseName(tokens[0])}\` — considerar fixar mais`);
        }
        continue;
      }

      if (["Read", "Edit", "Write", "Glob", "Grep"].includes(tool)) {
        const pat = body.replace(/^\.\//, "");
        if (pat.startsWith("~") || pat.startsWith("/") || pat.split("/").includes("..")) {
          flag(`\`${rule}\` sai do projeto (\`~\`, caminho absoluto ou \`..\`) — restringir ao repo`);
        } else if (/^[*/]+$/.test(pat)) {
          flag(`\`${rule}\` abrange o repo inteiro — restringir a um subcaminho`);
        }
        continue;
      }

      // Qualquer outra ferramenta (WebFetch, Task, mcp__*): um padrao de puro wildcard
      // e concessao total.
      if (/^[*/]*\*[*/]*$/.test(body)) {
        flag(`\`${rule}\` concede \`${tool}\` sem restricao — enumerar os alvos permitidos`);
      }
    }

    // `bypassPermissions` anula tudo o que esta acima.
    const mode = perms.defaultMode;
    if (mode && !["default", "acceptEdits", "plan"].includes(mode)) {
      flag(`\`defaultMode: "${mode}"\` desliga a fronteira de permissoes deste ficheiro`);
    }

    if (issues === 0) ok(`${SETTINGS_PATH} (deny de secrets cobre .env*, allow sem concessoes largas)`);
  }
  guardsRun++;
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
