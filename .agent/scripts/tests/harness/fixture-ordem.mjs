/**
 * Fixture da ORDEM POR ALVO para o `test-mutation-sweep` (#156) — {{PROJECT_NAME}}
 *
 * Monta, numa sandbox do `test-sweep-harness.mjs`, uma suite FALSA chamada `test-guards.mjs` que
 * cumpre o protocolo do motor: le o `ENV_ALVO`, corre o modulo dono primeiro, imprime a
 * `MARCA_FIM_DO_DONO`, e com o `ENV_SO_DONO` sai depois do dono. As constantes vem do
 * `lib/ordem-por-alvo.mjs` real, copiado para a sandbox — nunca reescritas aqui (`TP8`).
 *
 * PORQUE NAO USA O `registo.mjs` REAL: ele tem sitios de recusa, e a fixture tem o seu proprio
 * `pares.mjs` sintetico — a descoberta reprovava-a com `SEM PAR` (medido: 14 testes vermelhos).
 * O que se mede aqui e o MOTOR perante uma suite que cumpre o protocolo; o registo tem a sua
 * propria suite (`test-registo.mjs`).
 *
 * As variantes, cada uma com o veredicto que o motor tem de dar:
 *   - `foraDoDono`: o sitio `zzz` so e morto por um modulo de FORA do dono -> confirmacao na
 *     ordem normal, e conta como coberto.
 *   - `dependente`: o dono so fica verde se outro modulo correr antes -> `ORDEM DEPENDENTE`.
 *   - `diverge`: um modulo de fora so falha quando corre DEPOIS do dono -> na ordem nova o `zzz`
 *     parece coberto, na normal nao: `ORDEM MUDOU O VEREDICTO`, e vale a normal.
 *
 * NAO e um entry point: o `test-sweep-harness.mjs` importa-o.
 */
import { mkdirSync, writeFileSync, copyFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** A suite falsa. Um runner minimo: `t(nome, ok)` regista, e com `SWEEP_FAIL_FAST` sai no primeiro
 *  `FAIL` — a mesma forma de saida das suites reais (`  FAIL  <nome>`). */
const ENTRY = `import { readdirSync, readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { ENV_ALVO, ENV_SO_DONO, MARCA_FIM_DO_DONO, EH_MODULO_DE_TESTE, donoDe } from "../lib/ordem-por-alvo.mjs";
const AQUI = dirname(fileURLToPath(import.meta.url));
let falhas = 0;
globalThis.t = (nome, ok) => {
  if (ok) return void console.log("  PASS  " + nome);
  console.log("  FAIL  " + nome);
  falhas++;
  if (process.env.SWEEP_FAIL_FAST === "1") process.exit(1);
};
const nomes = readdirSync(AQUI).filter((n) => EH_MODULO_DE_TESTE.test(n)).sort();
const dono = process.env[ENV_ALVO] ? donoDe(process.env[ENV_ALVO], nomes) : null;
const ordem = dono ? [dono, ...nomes.filter((n) => n !== dono)] : nomes;
for (const n of ordem) {
  (await import(pathToFileURL(join(AQUI, n)).href)).registar();
  if (n === dono) {
    console.log(MARCA_FIM_DO_DONO);
    if (process.env[ENV_SO_DONO] === "1") process.exit(falhas ? 1 : 0);
  }
}
process.exit(falhas ? 1 : 0);
`;

/** Corre o verificador falso e diz se avisou com `marca`. */
const avisa = (marca) =>
  `const { execFileSync } = await import("child_process");\n` +
  `const { fileURLToPath } = await import("url");\nconst { dirname, resolve, join } = await import("path");\n` +
  `const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");\n` +
  `const avisou = (arg) => { try { execFileSync("node", [join(ROOT, ".agent/scripts/fake-check.mjs"), arg]); return false; } ` +
  `catch (e) { return String(e.stdout).includes(${JSON.stringify(marca)}); } };\n`;

const modulo = (corpo) => `export const entryPoint = "test-guards.mjs";\n${corpo}`;

export function montaOrdem(dir, variante) {
  const tests = join(dir, ".agent/scripts/tests");
  mkdirSync(tests, { recursive: true });
  mkdirSync(join(dir, ".agent/scripts/lib"), { recursive: true });
  copyFileSync(join(ROOT, ".agent/scripts/lib/ordem-por-alvo.mjs"), join(dir, ".agent/scripts/lib/ordem-por-alvo.mjs"));
  writeFileSync(join(tests, "test-guards.mjs"), ENTRY);
  // O DONO do alvo `.agent/scripts/fake-check.mjs`, pela convencao: mata o sitio `mau`.
  const exigePreparado = variante === "dependente" ? "  t(\"dono: preparado\", globalThis.preparado === true);\n" : "";
  writeFileSync(join(tests, "tests-fake-check.mjs"), modulo(avisa("encontrei 'mau'") +
    `export function registar() {\n${exigePreparado}  t("dono: avisa no mau", avisou("isto e mau"));\n  globalThis.donoCorreu = true;\n}\n`));
  if (variante === "foraDoDono") {
    writeFileSync(join(tests, "tests-outro.mjs"), modulo(avisa("encontrei 'zzz'") +
      `export function registar() { t("fora: avisa no zzz", avisou("zzz")); }\n`));
  }
  if (variante === "dependente") {
    // `tests-a-...` ordena ANTES do dono: na ordem normal prepara-o; sozinho, o dono nao fica verde.
    writeFileSync(join(tests, "tests-a-prepara.mjs"), modulo(`export function registar() { globalThis.preparado = true; t("prepara", true); }\n`));
  }
  if (variante === "diverge") {
    // Ordena ANTES do dono na ordem normal (onde passa); na ordem nova corre DEPOIS dele e falha.
    writeFileSync(join(tests, "tests-a-depois.mjs"), modulo(`export function registar() { t("fora: so passa antes do dono", globalThis.donoCorreu !== true); }\n`));
  }
}
