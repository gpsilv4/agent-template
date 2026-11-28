/**
 * O hook com PRAZO nos testes (#650): `harness/hook-com-prazo.mjs`.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * Os casos usam hooks FALSOS (um que responde, um que nunca responde dentro do prazo e sai sozinho mais tarde — para um
 * mutante sem prazo ficar VERMELHO e nao pendurar a suite, um que sai com erro), numa pasta temporaria que se apaga
 * tambem num `exit` a meio (o modo fail-fast sai de dentro de um caso).
 */
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { chamaComPrazo, CODIGO_PENDUROU, decisaoDoGuard } from "./harness/hook-com-prazo.mjs";
import { PROVA_DE_FALHA } from "../lib/varredura-paralela.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-hook-com-prazo.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const HARNESS = pathToFileURL(join(import.meta.dirname, "harness/hook-com-prazo.mjs")).href;

/** Corre um programa (ESM) num processo a parte e devolve o codigo e a saida (stdout + stderr). */
const corre = (prog) => {
  try {
    return { codigo: 0, saida: execFileSync(process.execPath, ["--input-type=module", "-e", prog], { encoding: "utf8", timeout: 20_000 }) };
  } catch (err) {
    return { codigo: err.status ?? -1, saida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

/** O que uma suite que encontrou um hook pendurado tem de deixar: o 3, a linha PENDUROU, e NENHUMA linha que a varredura
 *  leia como um FAIL (`PROVA_DE_FALHA`) — que entao a conta como REBENTOU, e nunca como o mutante apanhado. */
const comoPendurou = ({ codigo, saida }) => [
  ...(codigo === CODIGO_PENDUROU ? [] : [`saiu com ${codigo}, esperado ${CODIGO_PENDUROU}`]),
  ...(/PENDUROU: o hook parado\.mjs nao respondeu/.test(saida) ? [] : ["sem a linha PENDUROU"]),
  ...(PROVA_DE_FALHA.test(saida) ? ["tem uma linha FAIL: a varredura conta-a como o mutante apanhado (verde falso)"] : []),
];

export function registar() {
  const d = mkdtempSync(join(tmpdir(), "hook-com-prazo-"));
  const limpa = () => rmSync(d, { recursive: true, force: true });
  process.once("exit", limpa);
  try {
    const responde = join(d, "responde.mjs");
    // O que nao responde fica 3 s parado e SAI sozinho: com prazo, e "pendurou" em ~0,5 s; sem prazo, volta aos 3 s como um
    // hook normal — e o caso fica vermelho em vez de pendurar.
    const parado = join(d, "parado.mjs");
    const erro = join(d, "erro.mjs");
    writeFileSync(responde, `import { readFileSync } from "fs";\nprocess.stdout.write("ok:" + readFileSync(0, "utf8"));\n`);
    writeFileSync(parado, `setTimeout(() => process.exit(0), 3000);\n`);
    writeFileSync(erro, `process.stderr.write("rebentei");\nprocess.exit(1);\n`);

    registarResultado("hook com prazo (#650): um hook que responde devolve o resultado, e nao pendurou", (() => {
      const r = chamaComPrazo(responde, "x", { prazoMs: 10_000 });
      return [...(r.pendurou ? ["deu pendurou"] : []), ...(r.stdout === "ok:x" ? [] : [`stdout ${JSON.stringify(r.stdout)}`])];
    })());
    registarResultado("hook com prazo (#650): um hook que nao responde dentro do prazo e 'pendurou', e cedo", (() => {
      const t0 = Date.now();
      const r = chamaComPrazo(parado, "x", { prazoMs: 500 });
      const ms = Date.now() - t0;
      return [...(r.pendurou ? [] : ["nao deu pendurou"]), ...(ms < 2500 ? [] : [`levou ${ms} ms: o prazo nao cortou`])];
    })());
    // A LIGACAO real: o `decisaoDoGuard` (o `corre` da `test-hooks`) com um hook pendurado sai com 3 — e nunca lanca (um
    // `throw` dentro de um `test()` era um FAIL, e a varredura contava-o como o mutante apanhado).
    registarResultado("hook com prazo (#650): o decisaoDoGuard com um hook pendurado sai com 3 e PENDUROU, sem linha FAIL", comoPendurou(corre(
      `import { decisaoDoGuard } from ${JSON.stringify(HARNESS)};\n` +
      `try { decisaoDoGuard(${JSON.stringify(parado)}, { tool_input: { command: "o comando" } }, { prazoMs: 500 }); } catch (e) { console.log("lancou: " + e.message); }\n` +
      `console.log("voltou com um pendurado");\n`)));
    // O eco do comando sem quebras de linha, tambem a U+2028 (que o `JSON.stringify` nao escapa): senao um `<U+2028>  FAIL`
    // no comando fazia da linha PENDUROU um FAIL.
    registarResultado("hook com prazo (#650): um comando com U+2028 antes de FAIL nao faz da linha PENDUROU um FAIL", comoPendurou(corre(
      `import { decisaoDoGuard } from ${JSON.stringify(HARNESS)};\n` +
      `decisaoDoGuard(${JSON.stringify(parado)}, { tool_input: { command: "x\\u2028  FAIL apanhado" } }, { prazoMs: 500 });\n`)));
    // Um guard que sai com erro continua a LANCAR, como no `execFileSync` de antes (e nao a ser lido como um "allow").
    registarResultado("hook com prazo (#650): um guard que sai com erro lanca, com o stderr na mensagem", (() => {
      try {
        decisaoDoGuard(erro, { tool_input: { command: "x" } }, { prazoMs: 10_000 });
        return ["nao lancou: um guard que rebentou passava a allow"];
      } catch (e) {
        return /o guard saiu 1: rebentei/.test(e.message) ? [] : [`mensagem ${JSON.stringify(e.message)}`];
      }
    })());
  } finally {
    limpa();
    process.removeListener("exit", limpa);
  }
}
