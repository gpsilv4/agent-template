/**
 * A guarda de entry point partilhada (`lib/eh-main.mjs`, #373), e as CLIs que decidem um veredicto corridas
 * ATRAVES de um symlink.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * Com a comparacao crua `import.meta.url === pathToFileURL(argv[1])`, uma CLI corrida atras de um symlink saia
 * 0 sem fazer nada (`TP2`): no passo das suites em paralelo, um verde sem suite nenhuma. O symlink e do proprio
 * teste, logo o caso reprova sem a correcao em qualquer sistema, e nao so no macOS (`/var` -> `/private/var`).
 * Cada caso afirma o que a CLI FEZ (um marcador, uma recusa com a mensagem), e nao o exit: com a guarda velha o
 * exit ja era 0.
 */
import { fileURLToPath, pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehMain } from "../lib/eh-main.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-eh-main.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const LIB = join(ROOT, ".agent/scripts/lib");

/** Corre `node <link>/lib/<cli> ...args` com `cwd`, onde `<link>` e um symlink para a pasta `lib/` REAL. */
function correPorSymlink(dir, cli, args, cwd = dir) {
  symlinkSync(LIB, join(dir, "link"), "dir");
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, "link", cli), ...args], { cwd, encoding: "utf8", stdio: "pipe", env: { ...process.env, GITHUB_ACTIONS: "" } }) };
  } catch (err) {
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** Um tmpdir proprio por caso, apagado no fim. */
function comDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "eh-main-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function registar() {
  // --- A funcao -------------------------------------------------------------------------------------
  const aqui = import.meta.url;
  const esteFicheiro = fileURLToPath(aqui);
  registarResultado("eh-main: o proprio ficheiro e o principal, outro nao, e um `argv[1]` inexistente nao lanca (#373)", [
    ...(ehMain(aqui, esteFicheiro) ? [] : ["o proprio ficheiro nao foi reconhecido"]),
    ...(ehMain(aqui, join(LIB, "eh-main.mjs")) ? ["outro ficheiro foi reconhecido como o principal"] : []),
    ...(ehMain(aqui, "/nao/existe/x.mjs") ? ["um `argv[1]` inexistente foi reconhecido"] : []),
    ...(ehMain(aqui, "") ? ["um `argv[1]` vazio foi reconhecido"] : []),
  ]);
  registarResultado("eh-main: atraves de um symlink, o mesmo ficheiro continua a ser o principal (#373)", comDir((dir) => {
    symlinkSync(LIB, join(dir, "link"), "dir");
    return ehMain(pathToFileURL(join(LIB, "eh-main.mjs")).href, join(dir, "link", "eh-main.mjs")) ? [] : ["o caminho com symlink nao foi reconhecido"];
  }));

  // --- As CLIs, corridas atras de um symlink ----------------------------------------------------------
  // O runner das suites: uma suite FALSA no `cwd` (o runner le as suites relativas ao `cwd`) imprime um marcador.
  registarResultado("eh-main: o runner das suites, atras de um symlink, corre a suite (#373)", comDir((dir) => {
    mkdirSync(join(dir, ".agent/scripts/tests"), { recursive: true });
    writeFileSync(join(dir, ".agent/scripts/tests/test-x.mjs"), 'console.log("MARCADOR-DA-SUITE");\n');
    const r = correPorSymlink(dir, "suites-em-paralelo.mjs", ["--", "node", ".agent/scripts/tests/test-x.mjs"]);
    return r.out.includes("MARCADOR-DA-SUITE") && /1 suite\(s\)/.test(r.out) ? [] : [`a suite nao correu (exit ${r.code}): ${r.out.trim().slice(0, 160)}`];
  }));
  // A conferencia dos shards: relatorios que REPROVAM, e tem de reprovar (com a guarda velha saia 0 calada).
  registarResultado("eh-main: a conferencia dos shards, atras de um symlink, reprova o que tem de reprovar (#373)", comDir((dir) => {
    const pasta = join(dir, "varredura");
    mkdirSync(pasta);
    const r = correPorSymlink(dir, "varredura-shards.mjs", [pasta, "completa"]);
    return r.code !== 0 && r.out.includes("nenhum relatorio de shard") ? [] : [`esperava a recusa "nenhum relatorio de shard", saiu ${r.code}: ${r.out.trim().slice(0, 160)}`];
  }));
}
