#!/usr/bin/env node
/**
 * Testes do simulador de projeto derivado — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS da logica **propria** do `simulate-derived.mjs`: o que copia, o que
 * substitui, o que gera, e — sobretudo — recusar-se a dar OK quando nao mediu nada.
 *
 * O veredicto sobre os verificadores nao e testado aqui: e o exit code deles, e cada um ja tem
 * a sua suite. O que se testa e o arnes.
 *
 * A fixture e um repo MINIMO montado do zero, com stubs no lugar dos verificadores — logo cada
 * caso corre em milissegundos em vez dos ~50s da simulacao a serio. O simulador ancora a raiz
 * a sua propria localizacao, logo copia-lo para a fixture faz com que ele simule a fixture: e
 * o mesmo truque do `test-harness.mjs`.
 *
 *   node .agent/scripts/test-simulate-derived.mjs
 *
 * Sai `!= 0` se algum teste falhar. Corre no job `guard-tests` do `ci.yml`.
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIMULADOR = join(ROOT, ".agent/scripts/simulate-derived.mjs");

/** Os caminhos que o simulador tenta correr. Derivados do PROPRIO simulador, e nao escritos a
 *  mao: uma lista fixa aqui envelhecia no primeiro comando que o simulador acrescentasse, e os
 *  testes passavam a medir stubs que ele ja nao chama. */
const COMANDOS = [...
  execFileSync("node", ["-e", `
    const s = require("fs").readFileSync(${JSON.stringify(SIMULADOR)}, "utf8");
    const bloco = s.split("const COMANDOS = [")[1].split("];")[0];
    process.stdout.write([...bloco.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join("\\n"));
  `], { encoding: "utf8" }).split("\n").filter(Boolean)];

if (COMANDOS.length === 0) {
  console.error("nao consegui derivar a lista de comandos do simulador — o formato mudou?");
  process.exit(1);
}

let passed = 0;
const falhas = [];

/** Repo minimo, limpo por construcao: um placeholder para substituir, uma seccao 2.2 no
 *  BOOTSTRAP para derivar, e um stub por cada comando que o simulador chama. */
function fixture({ stubFalha = null, sobraPlaceholder = false, bootstrapQuebrado = false, semStubs = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sim-test-"));
  const w = (rel, body) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  };

  w(".agent/BOOTSTRAP.md", bootstrapQuebrado
    ? "# Bootstrap\n\nSem a seccao que o simulador procura.\n"
    : "# Bootstrap\n\n### 2.2 Ficheiros a GERAR do zero\n\n| Ficheiro |\n|---|\n" +
      "| `.agent/rules/business-logic.md` |\n\n### 2.3 Outra coisa\n\nTexto.\n");

  // O placeholder e construido, nao escrito: o bootstrap substitui placeholders tambem em
  // `.mjs`, logo um literal aqui seria reescrito num projeto derivado e a fixture deixava de
  // ter o que o teste precisa.
  const ph = "{" + "{" + "PROJECT_NAME" + "}" + "}";
  // O `README.md` esta na lista dos que DOCUMENTAM placeholders, logo nao serve de cobaia:
  // uma rule serve, e e onde um placeholder esquecido de facto engana o agente.
  w(".agent/rules/core-rules.md", `# ${ph}\n\nTexto.\n`);
  w("README.md", "# Readme\n");
  // `sobraPlaceholder` simula a lacuna real: um placeholder num tipo de ficheiro que a
  // substituicao **nao** cobre. O `.txt` nao esta em nenhuma das listas — e e essa a forma do
  // defeito que isto apanhou de verdade: o `.githooks/commit-msg`, que nao tem extensao.
  if (sobraPlaceholder) w("NOTAS.txt", `Projeto: ${ph}\n`);

  w(".agent/rules/anti-patterns.md",
    "# Anti-Padroes\n\n<!-- Exemplo a remover no bootstrap.\n\n## AP1 — exemplo\n\n-->\n\n## AP1 — real\n");

  for (const [i, c] of semStubs ? [] : COMANDOS.entries()) {
    const falha = stubFalha !== null && c.includes(stubFalha);
    w(c, `#!/usr/bin/env node\nconsole.log("  ${i} passaram, ${falha ? 1 : 0} falharam.");\n` +
         `process.exit(${falha ? 1 : 0});\n`);
  }

  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  copyFileSync(SIMULADOR, join(dir, ".agent/scripts/simulate-derived.mjs"));
  return dir;
}

function test(nome, opcoes, expect) {
  const dir = fixture(opcoes);
  try {
    let code = 0;
    let out = "";
    try {
      out = execFileSync("node", [join(dir, ".agent/scripts/simulate-derived.mjs"), ...(expect.args ?? [])], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      code = e.status ?? -1;
      out = (e.stdout ?? "") + (e.stderr ?? "");
    }
    const problemas = [];
    if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
    // Quando se espera reprovacao, afirma-se contra as linhas WARN e nada mais: um `includes`
    // sobre o output inteiro seria satisfeito por uma linha OK com o mesmo texto (`AP1`).
    const alvo = expect.code === 0
      ? out
      : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
    for (const s of expect.includes ?? []) {
      if (!alvo.includes(s)) problemas.push(`${expect.code === 0 ? "output" : "linhas WARN"} devia conter "${s}"`);
    }
    for (const s of expect.excludes ?? []) {
      if (out.includes(s)) problemas.push(`output NAO devia conter "${s}"`);
    }
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

console.log("\n=== Testes do simulador de projeto derivado ===\n");

// --- O caminho feliz, e o que ele tem de declarar -------------------------------
test("fixture sa: corre tudo e declara quantas verificacoes passaram", {}, {
  code: 0,
  includes: [`${COMANDOS.length} verificacao(oes) verdes num projeto derivado`],
  excludes: ["  WARN  "],
});

// --- Um verificador que falha no DERIVADO tem de reprovar a simulacao -----------
// E a razao de existir do script: um defeito que so aparece depois do bootstrap.
test("um verificador a falhar reprova a simulacao, e e nomeado", { stubFalha: COMANDOS[0] }, {
  code: 1,
  includes: [COMANDOS[0], "exit 1"],
});

// --- "Nao consegui medir" tem de REPROVAR, nao dar OK (AP2) ---------------------
// A primeira versao deste teste afirmava "zero placeholders substituidos reprova". Era
// inalcancavel: o proprio simulador tem um placeholder no cabecalho, logo a contagem nunca e
// zero — e o ramo do script que ele testava so dispararia num projeto ja bootstrapado, onde
// zero e o estado CORRECTO. O que se mede agora e o invariante que interessa: nao sobrar
// nenhum placeholder na copia.
test("um placeholder que sobra na copia reprova", { sobraPlaceholder: true }, {
  code: 1,
  includes: ["sobraram placeholders", "NOTAS.txt"],
});

// O controlo do controlo: sem a sobra, nao pode haver falso positivo.
test("sem sobras, a varredura de placeholders nao acusa nada", {}, {
  code: 0,
  excludes: ["sobraram placeholders"],
});

// O ramo mais facil de esquecer: todos os comandos ausentes. Sem o `fatal`, o script chegava
// ao fim a contar avisos em vez de dizer que nao mediu nada — e a diferenca importa, porque
// "falharam" e "nao correram" pedem accoes diferentes a quem le. E o `AP2`.
test("nenhum comando a correr reprova a dizer que nao mediu", { semStubs: true }, {
  code: 1,
  includes: ["nao mediu nada"],
});

test("BOOTSTRAP sem a seccao 2.2 reprova, em vez de gerar nada em silencio", { bootstrapQuebrado: true }, {
  code: 1,
  includes: ["nenhuma rule gerada"],
});

test("`--only` que nao selecciona nada reprova", {}, {
  code: 1,
  args: ["--only=nao-existe-nenhum"],
  includes: ["nao seleccionou nenhum comando"],
});

// --- O passo 2.8: o unico destrutivo que o simulador aplica --------------------
test("o exemplo comentado do anti-patterns.md e removido (passo 2.8)", {}, {
  code: 0,
  includes: ["exemplo comentado do anti-patterns.md removido"],
});

// --- `--only` valido continua a correr o que selecciona ------------------------
test("`--only` valido corre so o seleccionado", {}, {
  code: 0,
  args: [`--only=${COMANDOS[0].split("/").pop().replace(".mjs", "")}`],
  includes: ["1 verificacao(oes) verdes"],
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
console.log("");
if (falhas.length) {
  for (const { nome, out } of falhas) {
    console.log(`--- output de "${nome}" ---`);
    console.log(out);
  }
  console.log("  Ha testes do simulador a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do simulador passaram.\n");
