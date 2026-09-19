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
 *   node .agent/scripts/tests/test-mapa-suites.mjs
 */
import { SUITES, regraDe, comandoDe, verificadoresDe } from "../lib/mapa-suites.mjs";
import { PARES } from "../lib/pares.mjs";
import { readFileSync, readdirSync, existsSync } from "fs";

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
  return r?.verifica.includes(".agent/scripts/tests/test-guards.mjs") ? [] : [`casou ${JSON.stringify(r?.verifica)}`];
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
  const fs = porVerificador.get(".agent/scripts/tests/test-guards.mjs") ?? [];
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

// O `pares.mjs` decide o que a varredura mede de todo: uma entrada perdida ali nao da vermelho
// nenhum — a varredura mede menos e reporta 100% sobre isso. Ele caia na regra generica de
// `lib/` e ia para a suite do registo, que nao lhe toca. A licao estava escrita tres linhas
// acima, aplicada a UM ficheiro.
//
// Derivado e nao escrito a mao: a suite certa e a que MENCIONA o ficheiro. Uma suite que nao
// fala do que verifica nao o verifica.
test("cada modulo de `lib/` vai para uma suite que fala dele", () => {
  const problemas = [];
  // DERIVADO do disco, nao escrito a mao: a lista fixa envelhecia no primeiro modulo novo, e
  // envelheceu — o `lib/varredura-paralela.mjs` entrou e ficou a cair na regra generica, que o
  // mandava para a suite do registo. E a mesma classe que este ficheiro existe para apanhar.
  for (const rel of readdirSync(".agent/scripts/lib").filter((n) => n.endsWith(".mjs")).map((n) => `lib/${n}`)) {
    const r = regraDe(`.agent/scripts/${rel}`);
    if (r === null) {
      problemas.push(`${rel}: nenhuma regra`);
      continue;
    }
    const nome = rel.split("/").pop().replace(".mjs", "");
    const fala = r.verifica.some((v) => {
      try {
        return readFileSync(v, "utf8").toLowerCase().includes(nome.toLowerCase());
      } catch {
        return false;
      }
    });
    if (!fala) problemas.push(`${rel} -> ${r.verifica.join(", ")}, que nao o menciona`);
  }
  return problemas;
});

// Editar um modulo `tests-*.mjs` nao gerava obrigacao de verificacao nenhuma — nenhum casava
// regra. Baixa gravidade (o CI descobre-os), mas o aviso local existia para todos menos para
// eles. E a regra tem de mandar ao entry point que o PROPRIO modulo declara, nao a um qualquer.
// LISTA o disco e pergunta ao mapa PELO CAMINHO QUE LISTOU. Nunca por um reconstruido.
//
// A versao anterior varria `.agent/scripts/` a procura de `tests-*.mjs` — e a migracao para
// `tests/` levou-os todos, logo o ciclo corria sobre lista VAZIA e o teste passava. O `TP2` do
// proprio template, dentro do teste que devia apanhar isto. E tinha um segundo erro na mesma
// funcao: montava um caminho de `harness/` para um modulo `tests-`, ou seja perguntaria pelo
// sitio errado mesmo que tivesse items.
//
// A guarda contra o vazio nao e zelo: e o que distingue "todos passam" de "nao olhei para
// nenhum", e sem ela este teste ficou verde durante cinco releases com o mapa partido.
test("cada modulo `tests-*.mjs` vai para o entry point que declara", () => {
  const dir = ".agent/scripts/tests";
  const modulos = readdirSync(dir).filter((n) => /^tests-[\w-]+\.mjs$/.test(n));
  if (modulos.length === 0) return [`nenhum modulo tests-*.mjs em ${dir} — o teste mediria o vazio`];
  const problemas = [];
  for (const f of modulos) {
    const caminho = `${dir}/${f}`;
    const declarado = readFileSync(caminho, "utf8").match(/entryPoint = "([^"]+)"/)?.[1];
    if (!declarado) {
      problemas.push(`${f}: nao declara entryPoint`);
      continue;
    }
    const r = regraDe(caminho);
    if (r === null) problemas.push(`${caminho}: nenhuma regra no mapa`);
    else if (!r.verifica.some((v) => v.endsWith(declarado))) {
      problemas.push(`${f} declara ${declarado} mas o mapa manda ${r.verifica.join(", ")}`);
    }
  }
  return problemas;
});

// Um HARNESS decide o veredicto de toda a suite que o usa — e por isso um sem regra e o mesmo
// buraco que o `pares.mjs` tinha: mexer nele nao gera obrigacao de verificacao nenhuma. Ja
// aconteceu duas vezes (o `pares.mjs`, e o harness do simulador de `/upgrade` no dia em que
// nasceu). Esta e a terceira vez que a mesma classe aparece, logo passa a ter teste.
// Este listava BEM e perguntava MAL: `regraDe(".agent/scripts/${f}")`, o caminho anterior a
// migracao. E o mapa tinha as regras com esse mesmo caminho antigo — **os dois errados da mesma
// maneira, logo concordavam**, e o ficheiro real ficava descoberto.
//
// E o `TP8` na forma mais cara: nao e uma copia que envelheceu, sao duas leituras do mesmo facto
// a validarem-se uma a outra. Por isso a pergunta passa a usar o caminho LISTADO.
test("todo o harness casa uma regra no mapa", () => {
  const dir = ".agent/scripts/tests/harness";
  const harnesses = readdirSync(dir).filter((n) => n.endsWith(".mjs"));
  if (harnesses.length === 0) return [`nenhum harness em ${dir} — o teste mediria o vazio`];
  return harnesses.flatMap((f) => (regraDe(`${dir}/${f}`) === null ? [`${dir}/${f}: nenhuma regra no mapa`] : []));
});

// A rede que apanha a proxima migracao: TODO o ficheiro de `tests/` casa regra. Os dois testes
// acima olham para familias (`tests-*`, harnesses); este nao deixa nada de fora, e teria
// apanhado o buraco de 28 em 32 no dia em que ele nasceu.
test("todo o ficheiro de tests/ casa uma regra no mapa", () => {
  const problemas = [];
  let total = 0;
  for (const dir of [".agent/scripts/tests", ".agent/scripts/tests/harness"]) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
      total++;
      if (regraDe(`${dir}/${f}`) === null) problemas.push(`${dir}/${f}`);
    }
  }
  if (total === 0) return ["nao listei ficheiro nenhum — o teste mediria o vazio"];
  return problemas.length ? [`${problemas.length} de ${total} sem regra: ${problemas.slice(0, 5).join(", ")}`] : [];
});

// Os guards de documentacao varrem pastas INTEIRAS (`listDir("src/docs", ".md")`), nao uma lista
// de nomes. Um `.md` novo nessas pastas entra no alcance deles no momento em que existe — mas nao
// gerava obrigacao nenhuma de os correr. Estavam de fora o `src/docs/` completo e o
// `.agent/BOOTSTRAP.md`, que TRES guards leem (12, 13 e 15).
//
// Apanhado pelo `--diff`, que disse `sem regra no mapa` ao ver o `upgrade-why.md` tocado. Escrito
// aqui por descoberta em disco e nao por lista, para que o proximo ficheiro seja apanhado sozinho.
test("todo o .md que os guards varrem casa uma regra no mapa", () => {
  const alvos = [
    ...(existsSync("src/docs") ? readdirSync("src/docs").filter((n) => n.endsWith(".md")).map((n) => `src/docs/${n}`) : []),
    ...readdirSync(".agent").filter((n) => n.endsWith(".md")).map((n) => `.agent/${n}`),
  ];
  if (alvos.length === 0) return ["nenhum .md encontrado — o teste mediria o vazio"];
  return alvos.flatMap((f) => (regraDe(f) === null ? [`${f}: nenhuma regra no mapa`] : []));
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n  Um mapa que mente faz os DOIS consumidores medirem menos do que dizem.\n");
  process.exit(1);
}
console.log("\n  Todos os testes do mapa de suites passaram.\n");
process.exit(0);
