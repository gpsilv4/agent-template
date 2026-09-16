#!/usr/bin/env node
/**
 * Testes do mapa "caminho tocado -> o que o verifica" (`lib/mapa-suites.mjs`).
 *
 * O que se afirma: o mapa **responde**, e quando nao responde **diz**. Um mapa de cobertura
 * com buracos calados e pior do que nao ter mapa nenhum — tem o aspecto de cobertura.
 *
 * Dois consumidores dependem dele: o `stop-verify.mjs` (que diz a quem trabalha o que ficou
 * em divida) e o `mutation-sweep.mjs --diff` (que decide o que varrer). Se este mapa mentir,
 * os dois mentem juntos, e no mesmo sentido — o de medir menos do que dizem.
 *
 *   node .agent/scripts/test-mapa-suites.mjs
 */
import { SUITES, regraDe, comandoDe, verificadoresDe } from "./lib/mapa-suites.mjs";
import { PARES } from "./lib/pares.mjs";

let passed = 0;
const falhas = [];
const test = (nome, fn) => {
  let problemas;
  try {
    problemas = fn() ?? [];
  } catch (err) {
    problemas = [`rebentou: ${err.message}`];
  }
  if (problemas.length === 0) {
    passed++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`  FAIL  ${nome}`);
    for (const p of problemas) console.log(`          ${p}`);
  }
};

console.log("\n=== Testes do mapa de suites ===\n");

// A ORDEM da tabela e a semantica: `guards/` tem de casar antes de qualquer regra mais larga
// sobre `.agent/scripts/`. Se alguem reordenar, um ficheiro passa a ser verificado pela suite
// errada — e nada no ecra o diria.
test("a primeira regra que casa e a que vale (a ordem e semantica)", () => {
  const r = regraDe(".agent/scripts/guards/sizes.mjs");
  return r?.verifica.includes(".agent/scripts/test-guards.mjs") ? [] : [`casou ${JSON.stringify(r?.verifica)}`];
});

// O comando e DERIVADO. Escrito a mao ao lado do que verifica, eram dois campos a ter de
// concordar sem nada a verifica-los — o `TP1` que motivou esta extraccao.
test("o comando e derivado do que a regra declara", () => {
  const r = { verifica: [".agent/scripts/test-x.mjs"], only: "x" };
  const esperado = "node .agent/scripts/test-x.mjs && node .agent/scripts/mutation-sweep.mjs --only=x";
  return comandoDe(r) === esperado ? [] : [`saiu ${JSON.stringify(comandoDe(r))}`];
});

test("sem `only`, o comando nao inventa uma varredura", () => {
  const c = comandoDe({ verifica: [".agent/scripts/test-x.mjs"] });
  return c.includes("mutation-sweep") ? [`nao devia chamar a varredura: ${c}`] : [];
});

// O que NAO casa tem de vir a superficie. Engolir e transformar uma lacuna do mapa em
// silencio, e e essa a unica forma de ela ser corrigida algum dia.
test("ficheiro sem regra sai em `semRegra`, nao desaparece", () => {
  const { porVerificador, semRegra } = verificadoresDe(["nao/mapeado/de/todo.txt"]);
  const p = [];
  if (porVerificador.size !== 0) p.push("nao devia ter verificador nenhum");
  if (!semRegra.includes("nao/mapeado/de/todo.txt")) p.push("o ficheiro sem regra desapareceu");
  return p;
});

test("cada verificador traz os ficheiros que o motivam", () => {
  const { porVerificador } = verificadoresDe([".agent/scripts/guards/a.mjs", ".agent/scripts/guards/b.mjs"]);
  const fs = porVerificador.get(".agent/scripts/test-guards.mjs") ?? [];
  return fs.length === 2 ? [] : [`motivos: ${JSON.stringify(fs)}`];
});

// O CONTRA-CASO do anterior: sem ele, um mapa que devolvesse SEMPRE todos os verificadores
// passava os dois testes de cima.
test("um ficheiro so leva ao SEU verificador, nao a todos", () => {
  const { porVerificador } = verificadoresDe([".githooks/commit-msg"]);
  const chaves = [...porVerificador.keys()];
  return chaves.length === 1 && chaves[0].endsWith("test-commit-msg.mjs") ? [] : [`levou a ${JSON.stringify(chaves)}`];
});

// A LIGACAO ao `PARES`, que e o que o `--diff` usa: toda a suite nomeada por uma regra tem de
// ser uma suite que existe do outro lado, ou um alvo indirecto nunca e seleccionado. Derivado
// dos dois lados e nao escrito a mao — uma lista aqui envelhecia a primeira suite nova.
test("as suites do mapa que o PARES conhece resolvem para alvos reais", () => {
  const doPares = new Set(PARES.map((p) => p.suite).filter(Boolean));
  const doMapa = new Set(SUITES.flatMap((s) => s.verifica).filter((v) => /\/tests?[-\w]*\.mjs$/.test(v)));
  // Nem toda a regra aponta para uma suite do `PARES` (algumas apontam para `check-*.mjs`), e
  // isso e legitimo. O que NAO pode acontecer e o `PARES` ter uma suite que o mapa ignora: ai
  // mexer no ficheiro que ela verifica nunca seleccionaria o alvo.
  const orfas = [...doPares].filter((s) => !doMapa.has(s));
  return orfas.length === 0 ? [] : [`suites do PARES sem regra no mapa: ${orfas.join(", ")}`];
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n  Um mapa que mente faz os DOIS consumidores medirem menos do que dizem.\n");
  process.exit(1);
}
console.log("\n  Todos os testes do mapa de suites passaram.\n");
process.exit(0);
