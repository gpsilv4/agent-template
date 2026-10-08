#!/usr/bin/env node
/**
 * Testes dos Doc Guards — {{PROJECT_NAME}}
 *
 * Entry point das suites dos doc guards. O harness (sandbox, sandbox sintetico, `test()`)
 * vive em `test-harness.mjs`; os blocos maiores foram para modulos que espelham a divisao
 * do verificador (`tests-settings.mjs`, `tests-derived-counts.mjs`).
 *
 * Correr APOS qualquer alteracao a `check-doc-versions.mjs` ou a `guards/*.mjs`: um guard
 * que passa quando devia falhar produz confianca infundada. E depois a varredura de
 * mutacao (`mutation-sweep.mjs`), porque esta suite ficar verde nao prova que afirma algo.
 *
 *   node .agent/scripts/tests/test-guards.mjs
 */

import { rmSync, writeFileSync } from "fs";
import { join } from "path";
import { test, syntheticSandbox, runGuard, resumo, registarResultado, contagem } from "./harness/test-harness.mjs";
import { registaDescobertos, resumoDescoberta, ENTRY_POINTS } from "../lib/registo.mjs";
// Esta suite tambem e o entry point de modulos que NAO importa directamente — descobre-os em
// disco. O `tests-agentes.mjs` exercita o `lib/agentes.mjs` (o parser do `tools:`, #238), e o
// `tests-alcance.mjs` e um deles, e e quem exercita o `lib/alcance.mjs`: quem mexer
// nesse modulo corre ESTE comando. O `tests-pares.mjs` exercita o `lib/pares.mjs` e o
// `lib/pares-hooks.mjs` que ele junta (#243). Fica escrito porque o mapa de suites exige que a suite
// **fale** do modulo que verifica, e a descoberta, sendo automatica, nao o nomeia em lado nenhum.
import { fileURLToPath } from "url";
import { dirname } from "path";

// TP4: modulos DESCOBERTOS em disco. No TOPO (#156): o dono do alvo corre antes da baseline.
const descoberta = await registaDescobertos({
  dir: dirname(fileURLToPath(import.meta.url)),
  entryPoint: "test-guards.mjs",
  contagem,
  // A lista vive em `lib/registo.mjs`: tinha tres copias a concordar a mao (`TP8`).
  conhecidos: ENTRY_POINTS,
  aoFimDoDono: resumo,
});
console.log(resumoDescoberta(descoberta.registados, descoberta.deOutros));

// --- Baseline -----------------------------------------------------------------
// Estes dois nao usam `test()`: correm contra a fixture sintetica, nao contra o repo.
{
  const dir = syntheticSandbox();
  try {
    const { code, out } = runGuard(dir);
    const problems = [];
    if (code !== 0) problems.push(`fixture limpa por construcao devia sair 0, saiu ${code}`);
    if (!out.includes("Todos os guards de documentacao passaram")) {
      problems.push("devia declarar que todos os guards passaram");
    }
    if (out.includes("  WARN  ")) problems.push(`nao devia haver WARN: ${out.split("\n").find((l) => l.includes("  WARN  "))}`);
    const name = "sintetico: repo limpo por construcao sai 0 e declara que passou";
    registarResultado(name, problems, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = syntheticSandbox();
  try {
    // Uma unica quebra na fixture limpa: o exit code TEM de mudar.
    writeFileSync(join(dir, ".nvmrc"), "");
    const { code, out } = runGuard(dir);
    const name = "sintetico: uma quebra na fixture limpa muda o exit code";
    const problems = [];
    if (code === 0) problems.push("devia sair != 0");
    if (!out.includes("  WARN  ")) problems.push("devia imprimir WARN");
    registarResultado(name, problems, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("baseline: o guard produz veredicto e nao acrescenta avisos", null, {
  code: 0,
  // Nao afirma "todos passaram": isso seria afirmar o estado do REPO, e num projeto
  // derivado com drift ficaria vermelho por uma causa que nada tem a ver com o guard.
  includes: ["guard(s) executado(s)", "saltado(s)"],
});

// --- Guard 3: versoes --- no `tests-versions.mjs`, o modulo DONO do guard (#156).

// --- Os guards que vivem DENTRO do `check-doc-versions.mjs` (2, 4-10, o cwd, CRLF, ...) estao no
// `tests-check-doc-versions.mjs`, o modulo DONO dele (#171): inline, corriam DEPOIS de todos os
// modulos, e os 17 mutantes do orquestrador pagavam ~270 testes antes de chegar a quem os mata.

resumo();
