#!/usr/bin/env node
/**
 * Testes do Test Surface Checker — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS do `check-test-surface.mjs`: por cada forma de enfraquecer a superficie de
 * teste, quebra-a de proposito e exige que o verificador reprove.
 *
 * A fixture e um **repo git real** em `os.tmpdir()` — o verificador pergunta ao git o que
 * mudou desde a baseline, logo simular com ficheiros nao afirmaria nada.
 *
 *   node .agent/scripts/test-test-surface.mjs
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKER = join(ROOT, ".agent/scripts/check-test-surface.mjs");

const git = (dir, args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** Repo com um teste "saudavel" commitado; devolve `{ dir, base }`. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "surface-test-"));
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  copyFileSync(CHECKER, join(dir, ".agent/scripts/check-test-surface.mjs"));
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test("soma", () => { expect(1 + 1).toBe(2); });\n');
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
  return { dir, base: git(dir, ["rev-parse", "HEAD"]) };
}

function commit(dir, msg) {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", msg]);
}

function corre(dir, base) {
  try {
    return { code: 0, out: execFileSync("node", [join(dir, ".agent/scripts/check-test-surface.mjs"), base], { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

let passed = 0;
const falhas = [];
function test(nome, mutate, expect) {
  const { dir, base } = sandbox();
  try {
    const ref = mutate ? mutate(dir, base) ?? base : base;
    const { code, out } = corre(dir, ref);
    const problemas = [];
    if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
    // Afirmar contra as linhas WARN quando se espera reprovacao: um `includes` sobre o output
    // inteiro seria satisfeito por uma linha OK com o mesmo nome de ficheiro.
    const alvo = expect.code === 0 ? out : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
    for (const s of expect.includes ?? []) if (!alvo.includes(s)) problemas.push(`${expect.code === 0 ? "output" : "linhas WARN"} devia conter "${s}"`);
    for (const s of expect.excludes ?? []) if (out.includes(s)) problemas.push(`output NAO devia conter "${s}"`);
    if (problemas.length) {
      falhas.push({ nome, problemas, out });
      console.log(`  FAIL  ${nome}`);
      for (const p of problemas) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${nome}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== Testes do Test Surface Checker ===\n");

test("baseline: superficie intacta passa", null, {
  code: 0,
  includes: ["Superficie de teste nao enfraquecida"],
  excludes: ["  WARN  "],
});

for (const [nome, conteudo, marca] of [
  ["it.skip", 'test.skip("soma", () => {});\n', "seleccao/desativacao de teste"],
  ["describe.only", 'describe.only("x", () => { test("soma", () => {}); });\n', "seleccao/desativacao de teste"],
  ["xit", 'xit("soma", () => {});\n', "teste desativado (x-prefixo)"],
  ["skip() sem argumento", 'test("soma", () => { return test.skip(); });\n', "skip()/only() sem argumento"],
]) {
  test(`deteta ${nome} acrescentado a um teste`, (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"), conteudo);
    commit(dir, "enfraquecer");
  }, { code: 1, includes: ["tests/exemplo.test.js", marca] });
}

test("deteta @pytest.mark.skip", (dir) => {
  writeFileSync(join(dir, "tests/test_x.py"), "import pytest\n\n@pytest.mark.skip\ndef test_soma():\n    assert 1 + 1 == 2\n");
  commit(dir, "py");
}, { code: 1, includes: ["tests/test_x.py", "marca pytest"] });

test("deteta alteracao a configuracao do runner (estreitar o include)", (dir) => {
  writeFileSync(join(dir, "vitest.config.ts"), 'export default { test: { include: ["tests/so-este.test.js"] } };\n');
  commit(dir, "config");
}, { code: 1, includes: ["vitest.config.ts", "configuracao do runner alterada"] });

test("alteracao a codigo de producao NAO e enfraquecimento", (dir) => {
  mkdirSync(join(dir, "src"), { recursive: true });
  // `.skip(` em codigo de producao — paginacao — nao pode dar falso positivo: as marcas
  // procuram-se **so** na superficie congelada.
  writeFileSync(join(dir, "src/repo.js"), "export const pagina = (q, n) => q.skip(n * 10).limit(10);\n");
  commit(dir, "prod");
}, { code: 0, includes: ["superficie de teste intacta"], excludes: ["  WARN  "] });

test("teste alterado SEM marcas de enfraquecimento passa", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test("soma", () => { expect(2 + 2).toBe(4); });\n');
  commit(dir, "reforcar");
}, { code: 0, includes: ["sem marcas de enfraquecimento"], excludes: ["  WARN  "] });

test("marca que JA existia na baseline nao conta como nova", (dir, base) => {
  // A marca entra na baseline; depois muda-se outra coisa no mesmo ficheiro.
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test.skip("soma", () => {});\n');
  commit(dir, "com skip");
  const novaBase = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test.skip("soma", () => { expect(1).toBe(1); });\n');
  commit(dir, "editar outra coisa");
  return novaBase;
}, { code: 0, includes: ["sem marcas de enfraquecimento"], excludes: ["  WARN  "] });

test("deteta um ficheiro de teste APAGADO (a forma mais brutal)", (dir) => {
  rmSync(join(dir, "tests/exemplo.test.js"));
  commit(dir, "apagar o teste");
}, { code: 1, includes: ["tests/exemplo.test.js", "APAGADO"] });

test("baseline que nao resolve REPROVA (nao pode dar OK)", () => "ref-que-nao-existe-123", {
  code: 1,
  includes: ["nao resolve"],
  excludes: ["Superficie de teste nao enfraquecida"],
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
console.log("");
if (falhas.length) {
  for (const { nome, out } of falhas) {
    console.log(`--- output de "${nome}" ---`);
    console.log(out);
  }
  console.log("  Ha testes do test-surface checker a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do test-surface checker passaram.\n");
