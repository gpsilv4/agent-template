/**
 * Guards de versoes: CHANGELOG e dependencias documentadas — {{PROJECT_NAME}}
 *
 * Extraido do `check-doc-versions.mjs` (911 linhas, contra a regra dos 500 que ele impoe).
 *
 * OS CORPOS ESTAO VERBATIM, indentacao original incluida: o refactor tem de ser auditavel
 * como um MOVIMENTO — o output do guard fica byte-a-byte igual — e nao como uma reescrita
 * onde um erro se esconde. Ver `guards/settings.mjs` para o mesmo raciocinio.
 *
 * Os avisos vivem aqui, logo este ficheiro esta em `PARES` no `mutation-sweep.mjs`.
 */

// No ficheiro original o `package.json` era lido UMA vez, no Guard 3, e o resultado ficava
// visivel aos guards de dependencias mais abaixo. Separar as duas funcoes rompeu essa
// partilha — e foi o critério do "output byte-a-byte identico" que a denunciou, com um
// `ReferenceError`. Este memo repoe a semantica de leitura unica sem reintroduzir a
// dependencia de ordem entre as funcoes.
let pkgRawMemo;
function pkgRawOnce(read) {
  if (pkgRawMemo === undefined) pkgRawMemo = read("package.json");
  return pkgRawMemo;
}

/** Guard 3: package.json version === ultima versao do CHANGELOG.
 *  @returns {number} guards executados */
export function guardChangelogVersion({ read, warn, ok, note, skip }) {
  let guardsRun = 0;

// --- Guard 3: package.json version === ultima versao do CHANGELOG ---
// So se aplica quando ja existe package.json. A partir dai, tudo o que falte e WARN:
// um CHANGELOG movido ou um package.json sem `version` desligavam este guard em silencio.
const CHANGELOG_PATH = "src/docs/CHANGELOG.md";
const pkgRaw = pkgRawOnce(read);
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


  return guardsRun;
}

/** Guards CONFIGURAVEIS: versoes de dependencias documentadas (opt-in via `CHECKS`).
 *  @returns {number} guards executados */
export function guardDependencyVersions({ read, warn, ok, skip }) {
  let guardsRun = 0;
  const pkgRaw = pkgRawOnce(read);

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

  return guardsRun;
}
