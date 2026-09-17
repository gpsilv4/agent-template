#!/usr/bin/env node
/**
 * Testes NEGATIVOS do detector de codigo morto — {{PROJECT_NAME}}
 *
 * O que se afirma: **o que ele conta e CODIGO, nao texto**. E ai que a versao ingenua falha nos
 * dois sentidos — um nome citado num comentario faz um import morto passar por vivo, e um regex de
 * string mal aplicado faz um import vivo passar por morto.
 *
 * O segundo aconteceu: a primeira versao do `soCodigo()` aplicava o regex de string ao ficheiro
 * INTEIRO, e uma aspa solta num comentario consumia ate a aspa seguinte — **92% de um ficheiro
 * comido**, 27 126 caracteres reduzidos a 2 288, e quatro imports em uso dados como mortos. So
 * apareceu porque o numero nao batia com uma sonda independente. Se os dois tivessem concordado,
 * eu tinha acreditado nos dois.
 *
 * Cada caso monta o seu proprio repo sintetico (`TP3`: nada e herdado do estado deste).
 *
 *   node .agent/scripts/tests/test-codigo-morto.mjs
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(AQUI, "..", "..", "..");
const CHECKER = join(ROOT, ".agent/scripts/check-codigo-morto.mjs");

let passed = 0;
const falhas = [];

/** Monta um repo minimo com um ficheiro em `.agent/scripts/` e corre o verificador LA DENTRO.
 *
 *  O verificador resolve a raiz a partir do seu proprio caminho, logo tem de ser copiado para o
 *  sandbox — corre-lo daqui mediria ESTE repo. */
function corre(ficheiros) {
  const dir = mkdtempSync(join(tmpdir(), "morto-test-"));
  try {
    mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
    for (const [rel, conteudo] of Object.entries(ficheiros)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), conteudo);
    }
    writeFileSync(join(dir, ".agent/scripts/check-codigo-morto.mjs"), execFileSync("cat", [CHECKER], { encoding: "utf8" }));
    try {
      return { code: 0, out: execFileSync(process.execPath, [join(dir, ".agent/scripts/check-codigo-morto.mjs")], { encoding: "utf8" }) };
    } catch (err) {
      return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function test(nome, ficheiros, esperado) {
  const { code, out } = corre(ficheiros);
  const p = [];
  if (code !== esperado.code) p.push(`exit ${code}, esperado ${esperado.code}`);
  for (const s of esperado.inclui ?? []) if (!out.includes(s)) p.push(`output devia conter "${s}"`);
  for (const s of esperado.exclui ?? []) if (out.includes(s)) p.push(`output NAO devia conter "${s}"`);
  if (p.length) {
    falhas.push({ nome, p, out });
    console.log(`  FAIL  ${nome}`);
    for (const x of p) console.log(`          ${x}`);
  } else {
    passed++;
    console.log(`  PASS  ${nome}`);
  }
}

console.log("\n=== Testes do detector de codigo morto ===\n");

// --- O que o detector existe para apanhar ------------------------------------
test(
  "import que ninguem usa e apanhado, com ficheiro e linha",
  { ".agent/scripts/x.mjs": 'import { readFileSync } from "fs";\nconsole.log("nada");\n' },
  { code: 1, inclui: ["MORTO", "x.mjs:1", "`readFileSync`", "nunca usado"] }
);

// O CONTRA-CASO que faz o de cima valer: um import EM USO nao pode ser acusado. Sem ele, um
// detector que acusasse tudo passava o teste anterior.
test(
  "import em uso NAO e apanhado",
  { ".agent/scripts/x.mjs": 'import { readFileSync } from "fs";\nreadFileSync("a");\n' },
  { code: 0, inclui: ["nenhum import por usar"], exclui: ["MORTO"] }
);

// --- Onde a versao ingenua falha: contar TEXTO em vez de codigo --------------
// Um nome so mencionado num comentario esta morto. Contar texto dava-o por vivo — e foi assim que
// a ronda 4 classificou `sandbox` e `GUARD` como falsos positivos quando estavam mesmo mortos.
test(
  "nome citado so num COMENTARIO continua morto",
  { ".agent/scripts/x.mjs": 'import { readFileSync } from "fs";\n// o readFileSync serve para ler\nconsole.log(1);\n' },
  { code: 1, inclui: ["`readFileSync`"] }
);

// Idem para strings. Este repo tem fixtures que sao strings com codigo la dentro, e um nome
// mencionado numa delas nao e uso NESTE ficheiro.
test(
  "nome citado so dentro de uma STRING continua morto",
  { ".agent/scripts/x.mjs": 'import { readFileSync } from "fs";\nconst f = "chamar readFileSync aqui";\nconsole.log(f);\n' },
  { code: 1, inclui: ["`readFileSync`"] }
);

// --- O defeito que custou 92% de um ficheiro --------------------------------
// A primeira versao aplicava o regex de string ao ficheiro INTEIRO. Uma aspa solta num comentario
// (uma apostrofe em prosa) consumia ate a aspa seguinte e apagava blocos de codigo real — quatro
// imports em uso dados como mortos.
//
// Com a leitura linha a linha, a aspa solta estraga ESSA linha e mais nenhuma.
test(
  "aspa solta num comentario NAO apaga o codigo que vem depois",
  {
    ".agent/scripts/x.mjs":
      'import { readFileSync } from "fs";\n' +
      "// esta linha tem uma apostrofe: nao e' possivel\n" +
      "// e mais uma linha de prosa\n" +
      'readFileSync("usado mesmo a serio");\n',
  },
  { code: 0, inclui: ["nenhum import por usar"], exclui: ["MORTO"] }
);

// --- O segundo defeito: as INTERPOLACOES sao codigo -------------------------
// Um nome dentro de `${...}` numa template string **e uso**. A versao que apagava a string
// inteira dava o `GUARD_MODULES` por morto quando ele aparecia em `${GUARD_MODULES}/versions.mjs`
// — e eu acreditei no detector, removi o import, e uma suite ficou vermelha.
//
// So se viu por a suite partir. Sem este caso, o detector volta a fazer o mesmo na primeira
// template string que alguem escreva.
test(
  "nome usado numa INTERPOLACAO de template string conta como uso",
  { ".agent/scripts/x.mjs": 'import { PASTA } from "./a.mjs";\nconst p = `${PASTA}/ficheiro.mjs`;\nconsole.log(p);\n' },
  { code: 0, exclui: ["MORTO"] }
);

// E o contra-caso: o TEXTO da template string continua a NAO ser uso. Sem ele, preservar as
// interpolacoes podia ter virado "preservar a string toda", e o primeiro defeito voltava.
test(
  "nome so no TEXTO de uma template string continua morto",
  { ".agent/scripts/x.mjs": 'import { PASTA } from "./a.mjs";\nconst p = `escrever PASTA aqui`;\nconsole.log(p);\n' },
  { code: 1, inclui: ["`PASTA`"] }
);

// --- Formas de import que nao podem enganar ---------------------------------
test(
  "`a as b`: conta o nome pelo qual o ficheiro o usa",
  { ".agent/scripts/x.mjs": 'import { readFileSync as ler } from "fs";\nler("a");\n' },
  { code: 0, exclui: ["MORTO"] }
);

test(
  "`a as b` por usar e apanhado pelo nome NOVO",
  { ".agent/scripts/x.mjs": 'import { readFileSync as ler } from "fs";\nconsole.log(1);\n' },
  { code: 1, inclui: ["`ler`"] }
);

// Um nome que e PREFIXO de outro nao pode passar por usado. Sem a fronteira `\b`, `ler` seria
// dado como vivo por causa de `lerTudo`.
test(
  "nome que e prefixo de outro nao passa por usado",
  { ".agent/scripts/x.mjs": 'import { ler } from "./a.mjs";\nfunction lerTudo() { return 1; }\nlerTudo();\n' },
  { code: 1, inclui: ["`ler`"] }
);

// --- Nao encontrar nada tem de o DIZER --------------------------------------
// Um projeto derivado pode ter removido a maquinaria. Zero ficheiros lido como zero problemas e o
// `TP2`, e este repo tem a varredura de mutacao inteira por causa disso.
//
// O caso mede-se pelo RELATORIO e nao por um sandbox sem `.mjs`: o proprio verificador tem de la
// estar para correr, logo "sem ficheiros" nunca acontece por esta via. O que se afirma e que o
// numero varrido aparece — um "nenhum import por usar" sem dizer sobre QUANTOS ficheiros seria a
// frase de sucesso a esconder que nao mediu nada.
test(
  "o sucesso diz sobre QUANTOS ficheiros foi medido",
  { ".agent/scripts/x.mjs": "export const a = 1;\n" },
  { code: 0, inclui: ["ficheiros varridos", "nenhum import por usar"] }
);

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  for (const { nome, out } of falhas) {
    console.log(`\n--- output de "${nome}" ---`);
    console.log(out);
  }
  console.log("\n  Ha testes do detector de codigo morto a falhar.\n");
  process.exit(1);
}
console.log("\n  Todos os testes do detector de codigo morto passaram.\n");
process.exit(0);
