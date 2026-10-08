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
    copyFileSync(join(ROOT, ".agent/scripts/lib/pares-hooks.mjs"), join(dir, "lib/pares-hooks.mjs"));
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
    // Os pares dos hooks vivem em `pares-hooks.mjs` (#243): entram TODOS, juntos, pela ordem deles e
    // NO SITIO onde estavam (entre os mesmos vizinhos) — a varredura corre pela ordem da tabela.
    {
      const dosHooks = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
        `const { PARES_DOS_HOOKS } = await import(${JSON.stringify(pathToFileURL(join(dir, "lib/pares-hooks.mjs")).href)}); console.log(JSON.stringify(PARES_DOS_HOOKS.map((x) => x.alvo)));`],
        { encoding: "utf8" }));
      const i = base.indexOf(dosHooks[0]);
      const [antes, depois] = [base[i - 1], base[i + dosHooks.length]];
      registarResultado("pares: os pares de pares-hooks.mjs entram todos, contiguos, pela ordem e no mesmo sitio", [
        ...(dosHooks.length > 0 ? [] : ["pares-hooks.mjs sem pares — a copia nao foi lida"]),
        ...(i >= 0 && JSON.stringify(base.slice(i, i + dosHooks.length)) === JSON.stringify(dosHooks) ? [] : ["os pares dos hooks nao estao todos, juntos e pela ordem, em PARES"]),
        ...(antes === ".agent/scripts/lib/baseline-superficie.mjs" && depois === ".agent/scripts/check-bundle-sizes.mjs" ? [] : [`o bloco dos hooks mudou de sitio: entre ${antes} e ${depois}`]),
      ]);
    }

    // Sem a config, recusa a dizer QUAL ficheiro falta e o que fazer (#243): o `ERR_MODULE_NOT_FOUND`
    // cru nao dizia que a varredura precisa dele. Uma config PARTIDA continua a rebentar com o erro dela.
    const importa = () => {
      try {
        execFileSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(join(dir, "lib/pares.mjs")).href)} + "?" + Date.now());`],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return "";
      } catch (err) {
        return String(err.stderr);
      }
    };
    writeFileSync(join(dir, "config/guards-do-projeto.mjs"), "export const PARES_DO_PROJETO = [;\n");
    const partida = importa();
    // Uma config que importa um modulo apagado: o erro e DELE, e a config existe — nao e "falta".
    writeFileSync(join(dir, "config/guards-do-projeto.mjs"), 'import "./inexistente.mjs";\nexport const PARES_DO_PROJETO = [];\n');
    const dependencia = importa();
    rmSync(join(dir, "config/guards-do-projeto.mjs"));
    const falta = importa();
    registarResultado("pares: sem config/guards-do-projeto.mjs recusa a dizer o que falta; partida ou com um import em falta, o erro e o dela", [
      ...(falta.includes("falta .agent/scripts/config/guards-do-projeto.mjs") ? [] : [`sem a config: ${falta.split("\n").find((l) => /Error/.test(l)) ?? "(importou)"}`]),
      ...(/SyntaxError/.test(partida) && !partida.includes("falta .agent/scripts") ? [] : [`config partida: ${partida.split("\n").find((l) => /Error/.test(l)) ?? "(importou)"}`]),
      ...(/inexistente\.mjs/.test(dependencia) && !dependencia.includes("falta .agent/scripts") ? [] : [`dependencia da config em falta: ${dependencia.split("\n").find((l) => /Error/.test(l)) ?? "(importou)"}`]),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
