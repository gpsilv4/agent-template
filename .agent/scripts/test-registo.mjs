#!/usr/bin/env node
/**
 * Testes NEGATIVOS do registo de suites por descoberta (`lib/registo.mjs`).
 *
 * O que se afirma: cada caminho de recusa **recusa mesmo**, com a razao dita. Um registo
 * que falhasse aberto seria pior do que nao existir — daria a impressao de que a seleccao
 * do runner esta fechada quando nao esta, que e exactamente o defeito (`AP4`, invariante 2)
 * que este modulo veio corrigir.
 *
 * Cada caso monta a sua propria pasta com os seus proprios modulos (`AP3`: nada e herdado
 * do estado do repo) e corre um entry point sintetico num processo filho — `registo.mjs`
 * decide por `process.exit(1)`, logo o veredicto tem de ser lido de fora.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const REGISTO = resolve(AQUI, "lib", "registo.mjs");

let passed = 0;
const falhas = [];

/** Monta uma pasta com os modulos dados e corre um entry point sintetico. */
function corre({ modulos = {}, entryPoint = "entry.mjs" }) {
  const dir = mkdtempSync(join(tmpdir(), "registo-"));
  try {
    for (const [nome, conteudo] of Object.entries(modulos)) {
      writeFileSync(join(dir, nome), conteudo);
    }
    // O entry point conta os testes com um contador proprio: o que se mede aqui e o
    // contrato do registo, nao o harness dos guards.
    writeFileSync(
      join(dir, "entry.mjs"),
      `import { registaDescobertos } from ${JSON.stringify(REGISTO)};\n` +
        `globalThis.__n = 0;\n` +
        `const registados = await registaDescobertos({\n` +
        `  dir: ${JSON.stringify(dir)},\n` +
        `  entryPoint: ${JSON.stringify(entryPoint)},\n` +
        `  contagem: () => globalThis.__n,\n` +
        `});\n` +
        `console.log("REGISTADOS:" + registados.join(","));\n`
    );
    try {
      const out = execFileSync(process.execPath, [join(dir, "entry.mjs")], { encoding: "utf8" });
      return { code: 0, out };
    } catch (err) {
      return { code: err.status ?? -1, out: (err.stdout || "") + (err.stderr || "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Corre um entry point com argumentos a mao — para os caminhos de recusa que acontecem
 *  ANTES da descoberta (contrato da propria funcao) e para uma pasta ilegivel. */
function correCru(corpoArgs) {
  const dir = mkdtempSync(join(tmpdir(), "registo-cru-"));
  try {
    writeFileSync(
      join(dir, "entry.mjs"),
      `import { registaDescobertos } from ${JSON.stringify(REGISTO)};\n` +
        `await registaDescobertos(${corpoArgs});\n` +
        `console.log("PASSOU-SEM-RECUSAR");\n`
    );
    try {
      const out = execFileSync(process.execPath, [join(dir, "entry.mjs")], { encoding: "utf8" });
      return { code: 0, out };
    } catch (err) {
      return { code: err.status ?? -1, out: (err.stdout || "") + (err.stderr || "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testCru(nome, corpoArgs, esperado) {
  const { code, out } = correCru(corpoArgs);
  const problemas = [];
  if (code !== esperado.code) problemas.push(`exit ${code}, esperado ${esperado.code}`);
  for (const s of esperado.includes ?? []) {
    if (!out.includes(s)) problemas.push(`output devia conter ${JSON.stringify(s)}`);
  }
  if (out.includes("PASSOU-SEM-RECUSAR")) problemas.push("devia ter recusado e nao recusou");
  if (problemas.length) {
    falhas.push({ nome, problemas, out });
    console.log(`  FAIL  ${nome}`);
    for (const p of problemas) console.log(`          ${p}`);
  } else {
    passed++;
    console.log(`  PASS  ${nome}`);
  }
}

function test(nome, cenario, esperado) {
  const { code, out } = corre(cenario);
  const problemas = [];
  if (code !== esperado.code) problemas.push(`exit ${code}, esperado ${esperado.code}`);
  for (const s of esperado.includes ?? []) {
    if (!out.includes(s)) problemas.push(`output devia conter ${JSON.stringify(s)}`);
  }
  for (const s of esperado.excludes ?? []) {
    if (out.includes(s)) problemas.push(`output NAO devia conter ${JSON.stringify(s)}`);
  }
  if (problemas.length) {
    falhas.push({ nome, problemas, out });
    console.log(`  FAIL  ${nome}`);
    for (const p of problemas) console.log(`          ${p}`);
  } else {
    passed++;
    console.log(`  PASS  ${nome}`);
  }
}

console.log("\n=== Registo por descoberta — testes negativos ===\n");

// Um modulo valido: declara o entry point e regista um "teste".
const OK = (ep = "entry.mjs") =>
  `export const entryPoint = ${JSON.stringify(ep)};\n` + `export function registar() { globalThis.__n++; }\n`;

test(
  "pasta sem nenhum tests-*.mjs reprova, em vez de correr zero em silencio",
  { modulos: {} },
  { code: 1, includes: ["nao descobri nenhum"] }
);

test(
  "modulo sem `entryPoint` reprova (nao pode ser ignorado pelos dois entry points)",
  { modulos: { "tests-x.mjs": "export function registar() { globalThis.__n++; }\n" } },
  { code: 1, includes: ["nao exporta `entryPoint`"] }
);

test(
  "modulo sem `registar()` reprova",
  { modulos: { "tests-x.mjs": 'export const entryPoint = "entry.mjs";\n' } },
  { code: 1, includes: ["nao exporta `registar()`"] }
);

test(
  "modulo que nao regista nenhum teste reprova",
  {
    modulos: {
      "tests-x.mjs": 'export const entryPoint = "entry.mjs";\nexport function registar() {}\n',
    },
  },
  { code: 1, includes: ["nao registou nenhum teste"] }
);

test(
  "modulos todos de OUTRO entry point reprovam, em vez de passar a zero",
  { modulos: { "tests-x.mjs": OK("outro.mjs") } },
  { code: 1, includes: ["declara `entryPoint:"] }
);

test(
  "modulo que nao importa reprova a dizer porque",
  { modulos: { "tests-x.mjs": "import { nada } from './nao-existe.mjs';\n" } },
  { code: 1, includes: ["nao importa"] }
);

test(
  "caminho feliz: regista os modulos do seu entry point e ignora os dos outros",
  {
    modulos: {
      "tests-a.mjs": OK(),
      "tests-b.mjs": OK(),
      "tests-alheio.mjs": OK("outro.mjs"),
    },
  },
  { code: 0, includes: ["REGISTADOS:tests-a.mjs,tests-b.mjs"], excludes: ["tests-alheio.mjs"] }
);

test(
  "um ficheiro que nao casa `tests-*.mjs` nao entra na descoberta",
  { modulos: { "tests-a.mjs": OK(), "helper.mjs": "export const x = 1;\n" } },
  { code: 0, includes: ["REGISTADOS:tests-a.mjs"] }
);

// --- Contrato da propria funcao: recusas ANTES de tocar no disco ----------------
// Sem estes tres casos, a varredura de mutacao reportava os `fatal(` correspondentes como
// sitios sem teste — e um deles (`nao consegui ler`) e o AP2 em pessoa.

testCru(
  "sem `contagem()` reprova (nao ha como medir o contributo de cada modulo)",
  '{ dir: ".", entryPoint: "x.mjs" }',
  { code: 1, includes: ["precisa de `contagem()`"] }
);

testCru(
  "sem `entryPoint` reprova (nao saberia que modulos sao seus)",
  '{ dir: ".", contagem: () => 0 }',
  { code: 1, includes: ["precisa de `entryPoint`"] }
);

testCru(
  "pasta ilegivel reprova a dizer que NAO LEU — nao 'nao ha nada' (AP2)",
  '{ dir: "/nao/existe/em/lado/nenhum", entryPoint: "x.mjs", contagem: () => 0 }',
  { code: 1, includes: ["nao consegui ler"] }
);

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n--- Detalhe das falhas ---");
  for (const f of falhas) {
    console.log(`\n[${f.nome}]`);
    for (const p of f.problemas) console.log(`  ${p}`);
    console.log(f.out.split("\n").map((l) => `    | ${l}`).join("\n"));
  }
  process.exit(1);
}
console.log("\n  Todos os testes do registo por descoberta passaram.\n");
process.exit(0);
