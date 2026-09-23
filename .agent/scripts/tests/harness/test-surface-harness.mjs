/**
 * Harness dos testes do Test Surface Checker — {{PROJECT_NAME}}
 *
 * A fixture e um **repo git real** em `os.tmpdir()`: o verificador pergunta ao git o que mudou
 * desde a baseline, logo simular com ficheiros nao afirmaria nada.
 *
 * Extraido quando o `test-test-surface.mjs` passou o flag das 500 linhas. Mesmo desenho do
 * `test-harness.mjs`: o `resumo()` vive **aqui** porque `passed`/`falhas` sao deste modulo —
 * exportar contadores mutaveis daria bindings so-leitura e o resumo ficaria sempre a zero.
 *
 * NAO e um entry point: corre por importacao a partir do `test-test-surface.mjs`.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CHECKER = join(ROOT, ".agent/scripts/check-test-surface.mjs");
/** Modulos que o CHECKER importa e que a sandbox tem de levar consigo. Ao extrair as tabelas
 *  de padroes para `surface-patterns.mjs`, a sandbox deixou de resolver o import e as 61
 *  assercoes falharam de uma vez — nao por um defeito do verificador, mas por a fixture estar
 *  incompleta. Acrescentar aqui qualquer modulo novo que o verificador passe a importar. */
const CHECKER_MODULOS = [".agent/scripts/lib/surface-patterns.mjs", ".agent/scripts/lib/baseline-superficie.mjs"];

const git = (dir, args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** Repo com um teste "saudavel" commitado; devolve `{ dir, base }`. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "surface-test-"));
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  // As suites vivem em `tests/`: a pasta cria-se AQUI, uma vez, e nao em cada fixture que la
  // escreva. Espalhada pelas fixtures, bastava uma esquecer-se para o teste rebentar com um
  // ENOENT que fala do ficheiro e nao da pasta que falta.
  mkdirSync(join(dir, ".agent/scripts/tests/harness"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  copyFileSync(CHECKER, join(dir, ".agent/scripts/check-test-surface.mjs"));
  // A pasta do modulo tem de existir ANTES da copia: o `surface-patterns.mjs` mudou-se para
  // `lib/` e o `copyFileSync` nao cria diretorios — rebentava com um ENOENT que fala do ficheiro
  // de destino, nao da pasta que falta.
  for (const m of CHECKER_MODULOS) {
    mkdirSync(dirname(join(dir, m)), { recursive: true });
    copyFileSync(join(ROOT, m), join(dir, m));
  }
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
  // `base` vazio => corre SEM argumento, que e o unico modo em que a auto-deteccao da
  // baseline esta sob teste. Antes, um `mutate` que devolvesse `null` caia no `?? base` do
  // harness e o teste passava com a baseline explicita — verde sem afirmar nada.
  const args = [join(dir, ".agent/scripts/check-test-surface.mjs"), ...(base ? [base] : [])];
  try {
    return { code: 0, out: execFileSync("node", args, { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

let passed = 0;
const falhas = [];

/** Total de testes ja corridos. Usado pelo registo por descoberta para medir o
 *  contributo de cada modulo `tests-*.mjs`. */
export const contagem = () => passed + falhas.length;
/**
 * O VEREDICTO, isolado do que o produz — o mesmo desenho do `test-harness.mjs`, e pela mesma
 * razao: a varredura de mutacao mediu **0 de 3** sitios aqui. Desligar uma destas assercoes
 * so torna os 66 testes da superficie mais permissivos, e nada fica vermelho.
 *
 * Pura, pode ser chamada com entradas fabricadas — e e o que o `tests-surface-self.mjs` faz.
 */
export function avaliar({ code, out, expect }) {
  const problemas = [];
  if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
  // Afirmar contra as linhas WARN quando se espera reprovacao: um `includes` sobre o output
  // inteiro seria satisfeito por uma linha OK com o mesmo nome de ficheiro.
  const alvo = expect.code === 0 ? out : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
  for (const s of expect.includes ?? []) if (!alvo.includes(s)) problemas.push(`${expect.code === 0 ? "output" : "linhas WARN"} devia conter "${s}"`);
  for (const s of expect.excludes ?? []) if (out.includes(s)) problemas.push(`output NAO devia conter "${s}"`);
  return problemas;
}

/** Regista um resultado ja avaliado (usado pelos testes do proprio harness). */
export function registarResultado(nome, problemas, out) {
  if (problemas.length) {
    falhas.push({ nome, problemas, out });
    console.log(`  FAIL  ${nome}`);
    for (const p of problemas) console.log(`          ${p}`);
  } else {
    passed++;
    console.log(`  PASS  ${nome}`);
  }
}

function test(nome, mutate, expect) {
  const { dir, base } = sandbox();
  try {
    const ref = mutate ? mutate(dir, base) ?? base : base;
    const { code, out } = corre(dir, ref);
    const problemas = avaliar({ code, out, expect });
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "test-surface-harness.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

export { test, sandbox, commit, corre, git, ROOT, CHECKER };

/** Imprime o resumo e sai. Ver a nota no cabecalho sobre porque vive aqui. */
export function resumo() {
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
}
