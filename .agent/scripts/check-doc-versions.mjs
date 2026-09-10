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
import { guardSettings } from "./guards/settings.mjs";
import { guardChangelogVersion, guardDependencyVersions } from "./guards/versions.mjs";
import { guardDerivedCounts } from "./guards/derived-counts.mjs";
import { guardPlaceholders } from "./guards/placeholders.mjs";

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
  // Normalizar CRLF antes de medir: um clone com `core.autocrlf=true` acrescenta um byte por
  // linha, e `process-rules.md` mudava de OK para NOTE so por isso — o gate passava a depender
  // da plataforma de quem o corre em vez do conteudo. Este e o numero que o agente carrega.
  const bytes = Buffer.byteLength(content.replace(/\r\n/g, "\n"), "utf8");
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

// --- Guard 1b: orcamento das rules NAO carregadas ---
// O Guard 1 orcamenta so as rules importadas. As de referencia (`sync-docs`, `ticket-method`,
// `scripts-guide`) nao tinham limite NENHUM — e uma delas chegou aos 16 KB sem nada avisar,
// apesar de ser reaberta por inteiro a cada ticket `M`/`L`.
//
// Os limiares nao sao os mesmos de proposito: uma rule carregada entra no contexto a **cada
// sessao**; uma de referencia entra **por ticket**, logo pode ser maior. Mas passar do tamanho
// de uma rule carregada e sinal de que a referencia esta a virar manual — e a partir de 20 KB
// deixa de ser lida e passa a ser consultada por `grep`, o que e outra coisa.
// O gate esta a 14000 e nao a 20000 por uma razao medida: o pico historico de uma rule de
// referencia neste repo e **14259 bytes** (`ticket-method.md`, commit `92b745d`), e com o
// gate em 20000 passava com um NOTE e exit `0` — o guard nao apanhava aquilo para que foi
// criado. A 14000 reprova-o por 259 bytes.
//
// (Uma versao anterior deste comentario dizia 16239 bytes. Uma leitura independente varreu o
// historico: esse tamanho nunca existiu num ficheiro commitado. Um numero escrito a mao a
// justificar um limiar e o `AP1` aplicado a um comentario.)
//
// O NOTE esta a 12500 e nao a 12000 porque o tamanho de trabalho de uma referencia aqui e
// ~12 KB (o `ticket-method.md` vive nos 11958): com o NOTE em 12000 a proxima frase que se
// acrescentasse a esse ficheiro produzia ruido. Acima de 20000 a mensagem e mais dura; o
// gate e o mesmo.
const REF_NOTE_BYTES = 12500;
const REF_MAX_BYTES = 14000;
const REF_ABANDONO_BYTES = 20000;
const CARREGADAS = new Set([...REQUIRED_RULES, ...BOOTSTRAP_RULES]);
const refs = (listDir(".agent/rules", ".md") || []).filter((f) => !CARREGADAS.has(`${f}.md`));
if (refs.length === 0) {
  skip("Guard 1b — nao ha rules de referencia em .agent/rules");
} else {
  for (const nome of refs) {
    const file = `.agent/rules/${nome}.md`;
    const c = read(file);
    if (c === null) continue;
    const bytes = Buffer.byteLength(c.replace(/\r\n/g, "\n"), "utf8");
    if (bytes > REF_ABANDONO_BYTES) {
      warn(`${file} = ${bytes} bytes > ${REF_ABANDONO_BYTES} — a este tamanho deixa de ser lida e passa a ser consultada por grep, que e outra coisa; separar instrucoes de evidencia (a evidencia e para src/docs/)`);
    } else if (bytes > REF_MAX_BYTES) {
      warn(`${file} = ${bytes} bytes > ${REF_MAX_BYTES} — referencia grande demais para ser reaberta a cada ticket; separar instrucoes de evidencia (a evidencia e para src/docs/)`);
    } else if (bytes > REF_NOTE_BYTES) {
      note(`${file} = ${bytes} bytes (maior que uma rule carregada; considerar separar)`);
    } else {
      ok(`${file} = ${bytes} bytes (referencia)`);
    }
  }
  guardsRun++;
}

// --- Guard 1c: o TOTAL carregado a cada sessao ---
// O Guard 1 orcamenta ficheiro a ficheiro e o 1b as referencias. Ninguem orcamentava a
// **soma** — e e a soma que o agente paga a cada sessao. Medido quando este guard nasceu:
// 39803 bytes (~10k tokens) entre o `CLAUDE.md` e os seus `@imports`, com o
// `anti-patterns.md` a ter subido de 6840 para 10339 numa unica sessao. Cinco ficheiros
// podem estar todos abaixo de 12000 e a soma crescer sem nada avisar.
//
// A lista de ficheiros vem dos `@imports` do proprio `CLAUDE.md`, e nao escrita a mao:
// acrescentar um import passa automaticamente a contar.
const CARREGADO_NOTE = 44000;
const CARREGADO_MAX = 52000;
{
  const raiz = read("CLAUDE.md");
  if (raiz === null) {
    skip("Guard 1c — sem CLAUDE.md");
  } else {
    const bytesDe = (c) => Buffer.byteLength(c.replace(/\r\n/g, "\n"), "utf8");
    let total = bytesDe(raiz);
    const ausentes = [];
    for (const m of raiz.matchAll(/^@(\S+)/gm)) {
      const c = read(m[1]);
      if (c === null) ausentes.push(m[1]);
      else total += bytesDe(c);
    }
    const nota = ausentes.length ? ` (${ausentes.length} import(s) gerado(s) no bootstrap ainda ausente(s))` : "";
    if (total > CARREGADO_MAX) {
      warn(`contexto carregado = ${total} bytes > ${CARREGADO_MAX}${nota} — arquivar historico inerte ou mover evidencia para src/docs/`);
    } else if (total > CARREGADO_NOTE) {
      note(`contexto carregado = ${total} bytes (perto do limite ${CARREGADO_MAX})${nota}`);
    } else {
      ok(`contexto carregado = ${total} bytes${nota}`);
    }
    guardsRun++;
  }
}


// --- Guard 1d: as Fronteiras copiadas nos ponteiros finos ---
// O `.cursor/rules/*.mdc` e o `.github/copilot-instructions.md` sao ponteiros para o
// `AGENTS.md`. Mas **nao esta verificado** que o Cursor e o Copilot SIGAM um ponteiro em
// markdown — o Claude Code segue `@imports` porque e uma funcionalidade dele; os outros podem
// simplesmente ler o ficheiro que lhes e dado. Se nao seguirem, esses agentes recebiam um mapa
// de pastas e **zero regras**.
//
// A resposta e nao depender disso: as Fronteiras estao copiadas nos dois ficheiros. Copia
// significa divergencia, logo este guard compara-as com a do `CLAUDE.md`. A duplicacao aqui e
// **forcada** (cada tool le so o seu ficheiro), e a regra do repo para duplicacao forcada e
// verifica-la, nao proibi-la — a mesma logica dos contadores do backlog.
{
  const fronteirasDe = (c) => {
    const m = /^## Fronteiras \(prioridade maxima\)\n\n([\s\S]*?)\n\n>/m.exec(c.replace(/\r\n/g, "\n"));
    return m ? m[1].trim() : null;
  };
  const raiz = read("CLAUDE.md");
  const base = raiz === null ? null : fronteirasDe(raiz);
  const PONTEIROS = [".cursor/rules/project.mdc", ".github/copilot-instructions.md"];
  if (base === null) {
    skip("Guard 1d — sem CLAUDE.md ou sem bloco de Fronteiras para comparar");
  } else {
    let vistos = 0;
    for (const f of PONTEIROS) {
      const c = read(f);
      if (c === null) {
        skip(`${f} — ponteiro ausente (o tool correspondente nao esta configurado)`);
        continue;
      }
      const copia = fronteirasDe(c);
      if (copia === null) {
        warn(`${f} nao tem o bloco "## Fronteiras" — um tool que nao siga o ponteiro para AGENTS.md fica sem regra nenhuma`);
      } else if (copia !== base) {
        warn(`${f}: as Fronteiras divergem do CLAUDE.md — a copia envelheceu`);
      } else {
        ok(`${f} = Fronteiras iguais ao CLAUDE.md`);
      }
      vistos++;
    }
    if (vistos === 0) skip("Guard 1d — nenhum ponteiro fino presente");
    else guardsRun++;
  }
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
// Extraido para `guards/versions.mjs`.
guardsRun += guardChangelogVersion({ read, warn, ok, note, skip });
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
// Extraido para `guards/settings.mjs` (eram 266 linhas). Os avisos vivem la, logo esse
// ficheiro esta registado em `PARES` no mutation-sweep.mjs.
guardsRun += guardSettings({ read, warn, ok, note, skip });

// --- Guards 12 e 12c: contagens citadas em prosa como dados DERIVADOS ---
// Extraidos para `guards/derived-counts.mjs`.
guardsRun += guardDerivedCounts({ read, readMeaningful, warn, ok, skip, why, listDir });
// --- Guard 13: placeholders esquecidos apos o bootstrap ---
// A unica verificacao que TODO projeto derivado precisa e a unica que era manual (um
// `git grep` na checklist do BOOTSTRAP). Extraida para `guards/placeholders.mjs`.
guardsRun += guardPlaceholders({ read, warn, ok, skip, listDir });

// --- Guards CONFIGURAVEIS: versoes de dependencias documentadas ---
// Extraidos para `guards/versions.mjs`. Configurar o `CHECKS` la.
guardsRun += guardDependencyVersions({ read, warn, ok, skip });

console.log("");
console.log(`  ${guardsRun} guard(s) executado(s), ${guardsSkipped} saltado(s).`);
if (hasWarnings) {
  console.log("\nWARNING: ha divergencias/avisos de documentacao. Corrigir antes de commit.\n");
} else {
  console.log("\nTodos os guards de documentacao passaram.\n");
}
// Exit != 0 em caso de warning para poder funcionar como gate no CI.
process.exit(hasWarnings ? 1 : 0);
