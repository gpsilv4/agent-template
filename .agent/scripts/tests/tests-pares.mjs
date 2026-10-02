/**
 * Testes de `lib/pares.mjs` — {{PROJECT_NAME}}
 *
 * O dono do modulo pela convencao do registo (`lib/X.mjs` -> `tests/tests-X.mjs`). O que se
 * mede aqui e a JUNCAO: os pares dos guards proprios do projeto vivem em
 * `config/guards-do-projeto.mjs`, que o `/upgrade` nunca substitui, e o `pares.mjs` (que ele
 * substitui) tem de os juntar aos do template (#176).
 *
 * NAO e um entry point: o `test-guards.mjs` descobre-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-pares.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-guards.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

export function registar() {
  // Uma copia do `pares.mjs` REAL, corrida DUAS vezes: com a config vazia e com um par proprio. A
  // diferenca tem de ser exactamente esse par. Comparar com o `PARES` deste repo era medir a config
  // de quem corre (`TP3`): num derivado com pares seus, o teste reprovava sem nada partido.
  const dir = mkdtempSync(join(tmpdir(), "pares-test-"));
  try {
    mkdirSync(join(dir, "lib"));
    mkdirSync(join(dir, "config"));
    copyFileSync(join(ROOT, ".agent/scripts/lib/pares.mjs"), join(dir, "lib/pares.mjs"));
    // Num processo filho: o registo chama `registar()` sem esperar, e um `await` aqui deixava o
    // resultado por registar — o teste passava sem ter medido nada.
    const alvosCom = (paresDoProjeto) => {
      writeFileSync(join(dir, "config/guards-do-projeto.mjs"), `export const GUARDS = [];\nexport const PARES_DO_PROJETO = [${paresDoProjeto}];\n`);
      return JSON.parse(
        execFileSync(process.execPath, ["--input-type=module", "-e",
          `const { PARES } = await import(${JSON.stringify(pathToFileURL(join(dir, "lib/pares.mjs")).href)} + "?" + Date.now()); console.log(JSON.stringify(PARES.map((x) => x.alvo)));`],
          { encoding: "utf8" })
      );
    };
    const base = alvosCom("");
    const comProprio = alvosCom('{ alvo: ".agent/scripts/guards/proprio.mjs", suite: ".agent/scripts/tests/test-guards.mjs", sinal: /warn\\(/, neutro: "(() => {})(" }');
    const p = [];
    if (!comProprio.includes(".agent/scripts/guards/proprio.mjs")) p.push("o par do projeto nao entrou em PARES");
    if (comProprio.length !== base.length + 1) p.push(`PARES tem ${comProprio.length}, esperado ${base.length + 1} (os do template mais o proprio)`);
    if (base.length === 0) p.push("sem nenhum par do template — a copia do pares.mjs nao foi lida");
    registarResultado("pares: um par declarado em config/guards-do-projeto.mjs entra na varredura", p);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
