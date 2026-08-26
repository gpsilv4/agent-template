/**
 * Testes do Bundle Size Checker — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS: monta arvores `.next/` falsas e exige que o checker recuse
 * reportar um numero que nao conseguiu medir.
 *
 * O defeito que motivou isto: o checker tratava ficheiro ausente como 0 kB e
 * imprimia `Home 0.0 kB [OK]` com exit 0 — um build que nao produziu nada passava
 * como limpo. Um numero errado e pior do que numero nenhum.
 *
 * Sem dependencias e sem package.json, como os restantes scripts de `.agent/scripts/`.
 * Nao precisa de Next.js instalado: as fixtures sao ficheiros de texto e um
 * `build-manifest.json` escrito a mao.
 *
 * Uso:
 *   node .agent/scripts/test-bundle-sizes.mjs
 *
 * Sai != 0 se algum teste falhar. Opt-in no CI (descomentar em .github/workflows/ci.yml).
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, cpSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { tmpdir } from "os";
import { gzipSync } from "zlib";
import { randomBytes } from "crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKER = ".agent/scripts/check-bundle-sizes.mjs";

let passed = 0;
const failures = [];

/** Cria uma sandbox com o checker e uma arvore .next/ vazia. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "bundle-test-"));
  mkdirSync(join(dir, ".agent", "scripts"), { recursive: true });
  cpSync(join(ROOT, CHECKER), join(dir, CHECKER));
  mkdirSync(join(dir, ".next", "static", "chunks", "app"), { recursive: true });
  return dir;
}

/** Escreve um chunk com `bytes` de conteudo compressivel e devolve o tamanho gzipped. */
function chunk(dir, relPath, bytes, filler = "x") {
  const full = join(dir, ".next", relPath);
  mkdirSync(dirname(full), { recursive: true });
  const body = filler.repeat(bytes);
  writeFileSync(full, body);
  return gzipSync(Buffer.from(body)).length;
}

/** Reescreve o literal TARGETS na copia do checker (para exercitar varias rotas). */
function withTargets(dir, targets) {
  const p = join(dir, CHECKER);
  const src = readFileSync(p, "utf8");
  const body = Object.entries(targets)
    .map(([r, c]) => `  ${JSON.stringify(r)}: { name: ${JSON.stringify(c.name)}, target: ${c.target}, alarm: ${c.alarm} },`)
    .join("\n");
  const out = src.replace(/const TARGETS = \{[\s\S]*?\n\};/, `const TARGETS = {\n${body}\n};`);
  if (out === src) throw new Error("o patch de TARGETS nao aplicou — o literal mudou de forma");
  writeFileSync(p, out);
}

function manifest(dir, obj) {
  writeFileSync(join(dir, ".next", "build-manifest.json"), JSON.stringify(obj));
}

function run(dir) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, CHECKER)], { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

function test(name, build, expect) {
  const dir = sandbox();
  try {
    // build() pode devolver { includes, excludes } extra — usado quando a
    // expectativa e um numero calculado a partir das fixtures.
    const extra = build(dir) ?? {};
    const { code, out } = run(dir);
    const problems = [];
    const includes = [...(expect.includes ?? []), ...(extra.includes ?? [])];
    const excludes = [...(expect.excludes ?? []), ...(extra.excludes ?? [])];
    if (code !== expect.code) problems.push(`exit esperado ${expect.code}, obtido ${code}`);
    for (const s of includes) if (!out.includes(s)) problems.push(`output devia conter "${s}"`);
    for (const s of excludes) if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
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

console.log("\n=== Testes do Bundle Size Checker ===\n");

// --- Integridade da medicao -------------------------------------------------

test("ficheiro do manifest ausente do disco FALHA (era 0.0 kB [OK])", (dir) => {
  manifest(dir, { rootMainFiles: ["static/chunks/falta-1.js", "static/chunks/falta-2.js"], pages: {} });
}, {
  code: 1,
  includes: ["AUSENTES do disco", "static/chunks/falta-1.js", "static/chunks/falta-2.js"],
  excludes: ["Todas as paginas dentro dos targets"],
});

test("rota sem chunks proprios FALHA em vez de reportar so a baseline", (dir) => {
  chunk(dir, "static/chunks/shared.js", 50_000);
  manifest(dir, { rootMainFiles: ["static/chunks/shared.js"], pages: {} });
}, {
  code: 1,
  includes: ["nao foi possivel resolver os chunks proprios", "apenas a baseline partilhada", "[?]"],
  excludes: ["[OK]"],
});

test("manifest truncado da mensagem accionavel, nao stack trace", (dir) => {
  writeFileSync(join(dir, ".next", "build-manifest.json"), '{ "rootMainFiles": [');
}, {
  code: 1,
  includes: ["nao e JSON valido", "build interrompido"],
  excludes: ["at JSON.parse"],
});

test("sem .next/build-manifest.json pede o build", () => {}, {
  code: 1,
  includes: ["nao encontrado", "npm run build"],
});

// --- Contagem ---------------------------------------------------------------

test("chunk duplicado na lista da pagina e contado UMA vez", (dir) => {
  const shared = chunk(dir, "static/chunks/shared.js", 10_000, "s");
  const vendor = chunk(dir, "static/chunks/app/page-vendor.js", 900_000, "v");
  manifest(dir, {
    rootMainFiles: ["static/chunks/shared.js"],
    pages: { "app/page": ["static/chunks/app/page-vendor.js", "static/chunks/app/page-vendor.js"] },
  });
  // O ficheiro esta em static/chunks/app/ e comeca por "page-", logo e apanhado
  // pela lista da pagina E pelo varrimento de diretorio. So o `seen` impede a
  // contagem dupla. Asserir o NUMERO — afirmar so "[OK]" passaria com o defeito.
  return {
    includes: [`${((shared + vendor) / 1024).toFixed(1)} kB`],
    excludes: [`${((shared + vendor * 2) / 1024).toFixed(1)} kB`],
  };
}, { code: 0 });

test("chunk proprio da rota e somado a baseline", (dir) => {
  chunk(dir, "static/chunks/shared.js", 10_000, "s");
  chunk(dir, "static/chunks/app/page-abc.js", 20_000, "p");
  manifest(dir, { rootMainFiles: ["static/chunks/shared.js"], pages: {} });
}, {
  code: 0,
  includes: ["[OK]"],
  excludes: ["nao foi possivel resolver"],
});

test("chunk de layout entra na baseline partilhada", (dir) => {
  chunk(dir, "static/chunks/app/layout-xyz.js", 30_000, "l");
  chunk(dir, "static/chunks/app/page-abc.js", 10_000, "p");
  manifest(dir, { rootMainFiles: [], pages: {} });
}, {
  code: 0,
  excludes: ["Shared (framework + layout): 0.0 kB"],
});

// --- Contagem entre rotas (First Load JS e POR ROTA) -------------------------

test("chunk partilhado por DUAS rotas conta nas duas", (dir) => {
  const shared = chunk(dir, "static/chunks/shared.js", 10_000, "s");
  const common = chunk(dir, "static/chunks/common-ab.js", 500_000, "c");
  chunk(dir, "static/chunks/app/page-a.js", 1_000, "a");
  chunk(dir, "static/chunks/app/rotab/page-b.js", 1_000, "b");
  manifest(dir, {
    rootMainFiles: ["static/chunks/shared.js"],
    pages: {
      "app/page": ["static/chunks/common-ab.js"],
      "app/rotab/page": ["static/chunks/common-ab.js"],
    },
  });
  withTargets(dir, {
    "/": { name: "RotaA", target: 160, alarm: 180 },
    "/rotab": { name: "RotaB", target: 160, alarm: 180 },
  });
  // Um `seen` partilhado entre rotas dava o chunk comum so a primeira, e a segunda
  // reportava ~80% a menos com [OK]. As duas tem de mostrar o MESMO valor.
  const expected = ((shared + common + gzipSync(Buffer.from("a".repeat(1_000))).length) / 1024).toFixed(1);
  const expectedB = ((shared + common + gzipSync(Buffer.from("b".repeat(1_000))).length) / 1024).toFixed(1);
  return { includes: [`RotaA${" ".repeat(18)}${expected.padStart(7)} kB`, `RotaB${" ".repeat(18)}${expectedB.padStart(7)} kB`] };
}, { code: 0 });

test("layout tambem listado em rootMainFiles NAO duplica a baseline", (dir) => {
  const layout = chunk(dir, "static/chunks/app/layout-xyz.js", 600_000, "l");
  chunk(dir, "static/chunks/app/page-abc.js", 1_000, "p");
  manifest(dir, { rootMainFiles: ["static/chunks/app/layout-xyz.js"], pages: {} });
  // Antes, o varrimento de layouts nao consultava o `seen`: a baseline vinha a dobrar.
  return {
    includes: [`Shared (framework + layout): ${(layout / 1024).toFixed(1)} kB`],
    excludes: [`Shared (framework + layout): ${((layout * 2) / 1024).toFixed(1)} kB`],
  };
}, { code: 0 });

// --- Targets ----------------------------------------------------------------

test("bundle acima do alarme FALHA", (dir) => {
  // Bytes CRIPTOGRAFICAMENTE aleatorios. Uma primeira versao usava
  // `(i * 2654435761) % 256`, que e um ciclo perfeito de 256 bytes — o gzip
  // esmagava-o para 1.8 kB e o teste media compressao, nao o alarme.
  mkdirSync(join(dir, ".next", "static", "chunks", "app"), { recursive: true });
  writeFileSync(join(dir, ".next", "static", "chunks", "app", "page-big.js"), randomBytes(400_000));
  manifest(dir, { rootMainFiles: [], pages: {} });
}, {
  code: 1,
  includes: ["[ALARM]", "excedem o limite de alarme", "imports sincronos"],
});

// --- Resumo -----------------------------------------------------------------

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
console.log("\nTodos os testes do bundle checker passaram.\n");
process.exit(0);
