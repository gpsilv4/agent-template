#!/usr/bin/env node
/**
 * Testes NEGATIVOS do registo de suites por descoberta (`lib/registo.mjs`).
 *
 * O que se afirma: cada caminho de recusa **recusa mesmo**, com a razao dita. Um registo
 * que falhasse aberto seria pior do que nao existir — daria a impressao de que a seleccao
 * do runner esta fechada quando nao esta, que e exactamente o defeito (`TP4`, invariante 2)
 * que este modulo veio corrigir.
 *
 * Cada caso monta a sua propria pasta com os seus proprios modulos (`TP3`: nada e herdado
 * do estado do repo) e corre um entry point sintetico num processo filho — `registo.mjs`
 * decide por `process.exit(1)`, logo o veredicto tem de ser lido de fora.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const REGISTO = resolve(AQUI, "..", "lib", "registo.mjs");
const RELATORIO = resolve(AQUI, "harness", "relatorio.mjs");
// As chaves e a marca importam-se da fonte, nao se reescrevem aqui (`TP8`).
const { ENV_ALVO, ENV_SO_DONO, MARCA_FIM_DO_DONO } = await import(resolve(AQUI, "..", "lib", "ordem-por-alvo.mjs"));

let passed = 0;
const falhas = [];

/** Monta uma pasta com os modulos dados e corre um entry point sintetico. */
function corre({ modulos = {}, entryPoint = "entry.mjs", conhecidos = ["entry.mjs", "outro.mjs"] }) {
  const dir = mkdtempSync(join(tmpdir(), "registo-test-"));
  try {
    for (const [nome, conteudo] of Object.entries(modulos)) {
      writeFileSync(join(dir, nome), conteudo);
    }
    // Os entry points conhecidos existem como FICHEIRO nesta pasta: a descoberta e por pasta,
    // e um modulo que declare um entry point que nao esta aqui nao e corrido por ninguem.
    for (const ep of conhecidos) {
      if (ep !== "entry.mjs") writeFileSync(join(dir, ep), "// entry point vizinho\n");
    }
    // O entry point conta os testes com um contador proprio: o que se mede aqui e o
    // contrato do registo, nao o harness dos guards.
    writeFileSync(
      join(dir, "entry.mjs"),
      `import { registaDescobertos } from ${JSON.stringify(REGISTO)};\n` +
        `globalThis.__n = 0;\n` +
        `const r = await registaDescobertos({\n` +
        `  dir: ${JSON.stringify(dir)},\n` +
        `  entryPoint: ${JSON.stringify(entryPoint)},\n` +
        `  conhecidos: ${JSON.stringify(conhecidos)},\n` +
        `  contagem: () => globalThis.__n,\n` +
        `});\n` +
        `console.log("REGISTADOS:" + r.registados.join(",") + "|OUTROS:" + r.deOutros.join(","));\n`
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
  const dir = mkdtempSync(join(tmpdir(), "registo-test-cru-"));
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

/** A ORDEM POR ALVO (#156). Entry point sintetico que usa o `relatorio.mjs` REAL — o
 *  `aoFimDoDono` e o `resumo()` de verdade, nao um stub: e o exit code dele que a prova do
 *  prefixo le, e um stub mediria outra coisa. Cada modulo imprime `CORREU:<nome>`. */
function correOrdem({ modulos, env = {}, entryPoint = "test-guards.mjs", aoFimDoDono = "resumo" }) {
  const dir = mkdtempSync(join(tmpdir(), "registo-test-ordem-"));
  try {
    for (const [nome, conteudo] of Object.entries(modulos)) writeFileSync(join(dir, nome), conteudo);
    writeFileSync(join(dir, "test-guards.mjs"), "// entry point vizinho\n");
    writeFileSync(
      join(dir, "entry.mjs"),
      `import { registaDescobertos } from ${JSON.stringify(REGISTO)};\n` +
        `import { contagem, resumo } from ${JSON.stringify(RELATORIO)};\n` +
        `const r = await registaDescobertos({ dir: ${JSON.stringify(dir)}, entryPoint: ${JSON.stringify(entryPoint)},\n` +
        `  conhecidos: ["test-guards.mjs", "entry.mjs"], contagem${aoFimDoDono ? `, aoFimDoDono: ${aoFimDoDono}` : ""} });\n` +
        `console.log("REGISTADOS:" + r.registados.join(","));\nresumo();\n`
    );
    const base = { ...process.env };
    for (const k of [ENV_ALVO, ENV_SO_DONO, "SWEEP_FAIL_FAST"]) delete base[k];
    try {
      return { code: 0, out: execFileSync(process.execPath, [join(dir, "entry.mjs")], { encoding: "utf8", env: { ...base, ...env } }) };
    } catch (err) {
      return { code: err.status ?? -1, out: (err.stdout || "") + (err.stderr || "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function testOrdem(nome, cenario, esperado) {
  const { code, out } = correOrdem(cenario);
  const problemas = [];
  if (code !== esperado.code) problemas.push(`exit ${code}, esperado ${esperado.code}`);
  for (const s of esperado.includes ?? []) if (!out.includes(s)) problemas.push(`output devia conter ${JSON.stringify(s)}`);
  for (const s of esperado.excludes ?? []) if (out.includes(s)) problemas.push(`output NAO devia conter ${JSON.stringify(s)}`);
  if (esperado.antes && !(out.indexOf(esperado.antes[0]) > -1 && out.indexOf(esperado.antes[0]) < out.indexOf(esperado.antes[1]))) {
    problemas.push(`${JSON.stringify(esperado.antes[0])} devia aparecer antes de ${JSON.stringify(esperado.antes[1])}`);
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
/** Modulo de teste que usa o relatorio real: `falha` decide se o seu unico teste falha. */
const MOD = (nome, { ep = "test-guards.mjs", falha = false, vazio = false } = {}) =>
  `import { passou, falhou } from ${JSON.stringify(RELATORIO)};\nexport const entryPoint = ${JSON.stringify(ep)};\n` +
  `export function registar() { console.log("CORREU:${nome}");${vazio ? "" : falha ? ` falhou("t-${nome}", ["x"], "");` : ` passou("t-${nome}");`} }\n`;

console.log("\n=== Registo por descoberta — testes negativos ===\n");

// --- Ordem por alvo (#156) -----------------------------------------------------
const AB = { "tests-a.mjs": MOD("a"), "tests-b.mjs": MOD("b") };
testOrdem("ordem por alvo: sem ENV_ALVO, ordem alfabetica e sem marca", { modulos: AB },
  { code: 0, includes: ["REGISTADOS:tests-a.mjs,tests-b.mjs"], excludes: [MARCA_FIM_DO_DONO] });
testOrdem("ordem por alvo: o dono corre PRIMEIRO, uma vez, e a marca vem logo depois dele", { modulos: AB, env: { [ENV_ALVO]: ".agent/x/b.mjs" } },
  { code: 0, includes: ["REGISTADOS:tests-b.mjs,tests-a.mjs", "2 passaram"], antes: ["CORREU:b", MARCA_FIM_DO_DONO] });
testOrdem("ordem por alvo: a marca vem ANTES dos outros modulos", { modulos: AB, env: { [ENV_ALVO]: ".agent/x/b.mjs" } },
  { code: 0, antes: [MARCA_FIM_DO_DONO, "CORREU:a"] });
testOrdem("ordem por alvo: entry point fora de ORDENA_POR_ALVO ignora o ENV_ALVO",
  { modulos: { "tests-a.mjs": MOD("a", { ep: "entry.mjs" }), "tests-b.mjs": MOD("b", { ep: "entry.mjs" }) }, entryPoint: "entry.mjs", env: { [ENV_ALVO]: ".agent/x/b.mjs" } },
  { code: 0, includes: ["REGISTADOS:tests-a.mjs,tests-b.mjs"], excludes: [MARCA_FIM_DO_DONO] });
testOrdem("ordem por alvo: nome PARECIDO nao e dono (tests-bb para b.mjs)", { modulos: { "tests-a.mjs": MOD("a"), "tests-bb.mjs": MOD("bb") }, env: { [ENV_ALVO]: ".agent/x/b.mjs" } },
  { code: 0, includes: ["REGISTADOS:tests-a.mjs,tests-bb.mjs"], excludes: [MARCA_FIM_DO_DONO] });
testOrdem("ordem por alvo: modulo com o nome do dono mas de OUTRO entry point nao e dono",
  { modulos: { "tests-a.mjs": MOD("a"), "tests-b.mjs": MOD("b", { ep: "entry.mjs" }) }, env: { [ENV_ALVO]: ".agent/x/b.mjs" } },
  { code: 0, excludes: [MARCA_FIM_DO_DONO, "CORREU:b"] });
testOrdem("SO_DONO: corre so o dono e sai pelo aoFimDoDono (exit 0, os outros nao correm)", { modulos: AB, env: { [ENV_ALVO]: ".agent/x/b.mjs", [ENV_SO_DONO]: "1" } },
  { code: 0, includes: ["CORREU:b", MARCA_FIM_DO_DONO, "1 passaram"], excludes: ["CORREU:a", "REGISTADOS:"] });
// O controlo do bloqueante 3 do plan-auditor: SEM fail-fast, um FAIL do dono tem de sair 1 — o
// registo nao sabe das falhas, quem decide e o resumo() real.
testOrdem("SO_DONO: um FAIL do dono sai 1, mesmo sem fail-fast",
  { modulos: { "tests-a.mjs": MOD("a"), "tests-b.mjs": MOD("b", { falha: true }) }, env: { [ENV_ALVO]: ".agent/x/b.mjs", [ENV_SO_DONO]: "1" } },
  { code: 1, includes: ["FAIL  t-b", MARCA_FIM_DO_DONO], excludes: ["CORREU:a"] });
testOrdem("SO_DONO sem aoFimDoDono reprova — o registo nao decide exit codes", { modulos: AB, aoFimDoDono: null, env: { [ENV_ALVO]: ".agent/x/b.mjs", [ENV_SO_DONO]: "1" } },
  { code: 1, includes: ["nao passou `aoFimDoDono`"], excludes: ["CORREU:"] });
testOrdem("SO_DONO com um aoFimDoDono que VOLTA reprova", { modulos: AB, aoFimDoDono: "() => {}", env: { [ENV_ALVO]: ".agent/x/b.mjs", [ENV_SO_DONO]: "1" } },
  { code: 1, includes: ["voltou sem sair"], excludes: ["CORREU:a"] });
testOrdem("dono que nao regista nenhum teste reprova ANTES da marca",
  { modulos: { "tests-a.mjs": MOD("a"), "tests-b.mjs": MOD("b", { vazio: true }) }, env: { [ENV_ALVO]: ".agent/x/b.mjs", [ENV_SO_DONO]: "1" } },
  { code: 1, includes: ["nao registou nenhum teste"], excludes: [MARCA_FIM_DO_DONO] });


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
  // O `excludes: ["tests-alheio.mjs"]` que aqui estava CONSAGRAVA o salto silencioso: afirmava
  // que um modulo de outro entry point nao devia aparecer em lado nenhum. Um leitor
  // independente apanhou-o — um modulo saltado tem de ser visivel, mesmo quando o salto e
  // legitimo, senao um erro de escrita no `entryPoint` desliga uma suite sem ninguem ver.
  { code: 0, includes: ["REGISTADOS:tests-a.mjs,tests-b.mjs|OUTROS:tests-alheio.mjs"] }
);

test(
  "um ficheiro que nao casa `tests-*.mjs` nao entra na descoberta",
  { modulos: { "tests-a.mjs": OK(), "helper.mjs": "export const x = 1;\n" } },
  { code: 0, includes: ["REGISTADOS:tests-a.mjs"] }
);

// --- Contrato da propria funcao: recusas ANTES de tocar no disco ----------------
// Sem estes tres casos, a varredura de mutacao reportava os `fatal(` correspondentes como
// sitios sem teste — e um deles (`nao consegui ler`) e o TP2 em pessoa.

testCru(
  "sem `contagem()` reprova (nao ha como medir o contributo de cada modulo)",
  '{ dir: ".", entryPoint: "x.mjs", conhecidos: ["x.mjs"] }',
  { code: 1, includes: ["precisa de `contagem()`"] }
);

testCru(
  "sem `entryPoint` reprova (nao saberia que modulos sao seus)",
  '{ dir: ".", contagem: () => 0, conhecidos: ["x.mjs"] }',
  { code: 1, includes: ["precisa de `entryPoint`"] }
);

testCru(
  "pasta ilegivel reprova a dizer que NAO LEU — nao 'nao ha nada' (TP2)",
  '{ dir: "/nao/existe/em/lado/nenhum", entryPoint: "x.mjs", contagem: () => 0, conhecidos: ["x.mjs"] }',
  { code: 1, includes: ["nao consegui ler"] }
);

test(
  "entryPoint que nao existe em NENHUM entry point reprova (era saltado em silencio)",
  { modulos: { "tests-a.mjs": OK(), "tests-erro.mjs": OK("naoexiste.mjs") }, conhecidos: ["entry.mjs", "outro.mjs"] },
  { code: 1, includes: ["nao e um entry point DESTA pasta"] }
);

test(
  "um modulo de OUTRO entry point conhecido e saltado, mas dito em voz alta",
  { modulos: { "tests-a.mjs": OK(), "tests-alheio.mjs": OK("outro.mjs") } },
  { code: 0, includes: ["REGISTADOS:tests-a.mjs|OUTROS:tests-alheio.mjs"] }
);

testCru(
  "sem `conhecidos` reprova — uma rede opcional nao e uma rede",
  '{ dir: ".", entryPoint: "x.mjs", contagem: () => 0 }',
  { code: 1, includes: ["precisa de `conhecidos`"] }
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
