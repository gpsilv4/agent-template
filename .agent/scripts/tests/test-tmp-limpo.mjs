#!/usr/bin/env node
/**
 * Testes NEGATIVOS da limpeza de copias em `tmpdir` — {{PROJECT_NAME}}
 *
 * O que se afirma: a limpeza apaga o que ficou de uma corrida MORTA, e **nao toca** no que
 * pertence a uma corrida VIVA. O segundo lado e o que torna isto seguro, e nao e teorico —
 * duas sessoes do agente correram a mesma medicao ao mesmo tempo, cada uma com a sua copia de
 * 33 MB. Uma limpeza cega apagava a copia de trabalho de uma corrida a decorrer: deixava de
 * ser limpeza e passava a ser uma forma nova de partir coisas.
 *
 * Cada caso monta a sua propria `base` (`TP3`: nada e herdado do `tmpdir()` do sistema, senao
 * outra corrida em paralelo pintava isto de vermelho sem haver defeito).
 *
 *   node .agent/scripts/tests/test-tmp-limpo.mjs
 */
import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { criaTmp, limpaTmpsAntigos, limpaFixturesDeTeste, processoVivo, PREFIXOS_DE_TESTE } from "../lib/tmp-limpo.mjs";
import { readFileSync, readdirSync as lerPasta } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

let passed = 0;
const falhas = [];
const test = (nome, fn) => {
  let p;
  try {
    p = fn() ?? [];
  } catch (err) {
    p = [`rebentou: ${err.message}`];
  }
  if (p.length === 0) {
    passed++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas.push([nome, p]);
    console.log(`  FAIL  ${nome}`);
    for (const m of p) console.log(`          ${m}`);
  }
};

/** Uma copia de mentira na forma que o `criaTmp` produz: `prefixo<pid>-XXXXXX`. Com `pid: null`
 *  sai sem dono legivel no nome, que e como ficaram as copias de versoes anteriores a este
 *  modulo. */
const comDono = (base, prefixo, pid) => {
  const d = join(base, pid === null ? `${prefixo}legado` : `${prefixo}${pid}-aAbB`);
  mkdirSync(d, { recursive: true });
  return d;
};

/** Um PID que seguramente nao existe. O 2^22 esta acima do `pid_max` de Linux e macOS, logo
 *  nunca foi atribuido — inventar um numero baixo podia calhar num processo real. */
const PID_MORTO = 4194304;

console.log("\n=== Testes da limpeza de copias em tmpdir ===\n");

test("o PID deste processo conta como VIVO", () =>
  processoVivo(process.pid) ? [] : ["o proprio processo foi dado como morto"]);

test("um PID impossivel conta como morto", () =>
  processoVivo(PID_MORTO) ? ["deu como vivo um pid que nao existe"] : []);

// Sem este ramo, uma entrada estranha no ficheiro punha a limpeza a tratar tudo como vivo (e
// nao limpava nada) ou como morto (e apagava tudo). Nenhum dos dois e aceitavel em silencio.
test("um PID ilegivel nao conta como vivo", () => {
  const p = [];
  for (const v of [NaN, 0, -1, 1.5]) if (processoVivo(v)) p.push(`${v} deu como vivo`);
  return p;
});

test("copia de um processo MORTO e apagada", () => {
  const base = mkdtempSync(join(tmpdir(), "t-limpo-"));
  try {
    comDono(base, "alvo-", PID_MORTO);
    const n = limpaTmpsAntigos("alvo-", base);
    const restou = readdirSync(base);
    if (n !== 1) return [`devia ter apagado 1, apagou ${n}`];
    return restou.length === 0 ? [] : [`ficou para tras: ${restou.join(", ")}`];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// O CONTRA-CASO, e e o que torna a limpeza segura. Sem ele, o teste de cima era satisfeito por
// uma funcao que apagasse TUDO — e ai duas corridas em paralelo destruiam-se uma a outra.
test("copia de um processo VIVO nao e tocada", () => {
  const base = mkdtempSync(join(tmpdir(), "t-limpo-"));
  try {
    comDono(base, "alvo-", process.pid);
    const n = limpaTmpsAntigos("alvo-", base);
    const restou = readdirSync(base);
    if (n !== 0) return [`apagou ${n} copia(s) de uma corrida viva`];
    return restou.some((n) => n.startsWith("alvo-")) ? [] : ["a copia da corrida viva desapareceu"];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// O prefixo nao e decorativo: cada script limpa o SEU. Sem isto, correr o simulador apagava as
// copias da varredura que estivesse a decorrer ao lado.
test("copias de OUTRO prefixo nao sao tocadas", () => {
  const base = mkdtempSync(join(tmpdir(), "t-limpo-"));
  try {
    comDono(base, "alvo-", PID_MORTO);
    comDono(base, "outro-", PID_MORTO);
    limpaTmpsAntigos("alvo-", base);
    return readdirSync(base).some((n) => n.startsWith("outro-")) ? [] : ["apagou uma copia de outro prefixo"];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// A fresta entre o `mkdtemp` e a escrita do PID, e as copias de versoes anteriores a este
// modulo. Apagar uma copia sem dono DE IMEDIATO fechava a fresta em cima de quem esta a nascer.
test("copia RECENTE sem dono declarado nao e tocada", () => {
  const base = mkdtempSync(join(tmpdir(), "t-limpo-"));
  try {
    comDono(base, "alvo-", null);
    const n = limpaTmpsAntigos("alvo-", base);
    return n === 0 && readdirSync(base).some((n) => n.startsWith("alvo-")) ? [] : ["apagou uma copia acabada de criar"];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// E o outro lado do mesmo ramo: uma copia sem dono e VELHA e residuo de uma versao anterior, e
// fica para sempre se ninguem a apagar. Sem este caso, o ramo da idade nunca era exercitado.
test("copia ANTIGA sem dono declarado e apagada", () => {
  const base = mkdtempSync(join(tmpdir(), "t-limpo-"));
  try {
    const d = comDono(base, "alvo-", null);
    const ontem = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(d, ontem, ontem);
    const n = limpaTmpsAntigos("alvo-", base);
    return n === 1 && readdirSync(base).length === 0 ? [] : [`apagou ${n}, restou ${readdirSync(base).join(", ")}`];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// O dono vai no NOME, e a copia sai VAZIA. A primeira versao escrevia um `.dono-pid` la dentro,
// e isso desligou um caminho de recusa do simulador em silencio: ele deteta "o archive saiu
// vazio" com `readdirSync(dir).length === 0`, e essa condicao deixou de poder acontecer. So
// apareceu porque tres suites ficaram vermelhas. Uma marca de gestao nao pertence ao que esta a
// ser medido — e este teste prende as duas metades.
test("`criaTmp` poe o dono no NOME e deixa a copia intacta", () => {
  const dir = criaTmp("t-limpo-criado-");
  try {
    const p = [];
    const dentro = readdirSync(dir);
    if (dentro.length !== 0) p.push(`escreveu dentro da copia: ${dentro.join(", ")}`);
    if (!dir.includes(`t-limpo-criado-${process.pid}-`)) p.push(`o pid nao esta no nome: ${dir}`);
    return p;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Uma limpeza que rebente impede a corrida que ela devia servir. O objectivo dela e o disco,
// nunca o veredicto.
test("base inexistente nao rebenta, devolve 0", () => {
  // O caminho e UNICO e so depois se apaga, em vez de ser um nome fixo. Um caminho fixo e
  // partilhado entre corridas — e o Guard 19 reprova-o, e bem: duas corridas em paralelo
  // passariam a falar da mesma pasta. Aqui o que se mede e a ausencia, nao o nome.
  const naoExiste = mkdtempSync(join(tmpdir(), "t-limpo-ausente-"));
  rmSync(naoExiste, { recursive: true, force: true });
  return limpaTmpsAntigos("alvo-", naoExiste) === 0 ? [] : ["devia devolver 0 em silencio"];
});

// --- a lista dos prefixos de teste nao pode envelhecer --------------------------
//
// A `PREFIXOS_DE_TESTE` e mantida A MAO, e uma lista a mao envelhece em silencio (`TP8`) — foi
// exactamente assim que 1580 fixtures ocuparam 2,5 GB. Este caso varre `tests/` em DISCO e
// exige que cada prefixo que la aparece esteja coberto. A lista continua a mao; a divergencia
// e que nao passa.
test("todo o prefixo de fixture na maquinaria esta coberto pela lista", () => {
  const AQUI = dirname(fileURLToPath(import.meta.url));
  const RAIZ = join(AQUI, "..", "..", "..");

  // AS DUAS pastas de testes da maquinaria, e nao so a propria.
  //
  // A primeira versao fazia `anda(AQUI)` — varria `.agent/scripts/tests/` e mais nada. A suite
  // dos hooks vive noutra pasta, cria `hook-test-` com `mkdtempSync` cru, e esse prefixo nunca
  // esteve na lista: este teste, que existe PARA a lista nao envelhecer, nao tinha como o ver.
  // Prova encontrada em disco: uma `hook-test-*` de 16/Set ainda la tres dias depois.
  //
  // E a forma do `TP9` — uma regra que so olha para onde foi escrita da primeira vez.
  const RAIZES = [join(RAIZ, ".agent/scripts/tests"), join(RAIZ, ".claude/hooks/tests")];

  const ficheiros = [];
  const ausentes = [];
  const anda = (d) => {
    let entradas;
    try {
      entradas = lerPasta(d, { withFileTypes: true });
    } catch {
      return false; // nao existe: quem chama decide se isso e legitimo
    }
    for (const e of entradas) {
      if (e.isDirectory()) anda(`${d}/${e.name}`);
      else if (e.name.endsWith(".mjs")) ficheiros.push(`${d}/${e.name}`);
    }
    return true;
  };
  // Um derivado pode ter removido a camada so-Claude — isso e legitimo e nao e defeito. O que
  // NAO pode acontecer e as duas faltarem e o teste passar a medir o vazio.
  for (const r of RAIZES) if (anda(r) === false) ausentes.push(r);
  if (ausentes.length === RAIZES.length) {
    return [`nenhuma pasta de testes existe (${ausentes.join(", ")}) — o teste mediria o vazio`];
  }

  // As plicas e as crases saem ANTES de procurar. Uma fixture que escreve codigo de exemplo tem
  // `mkdtempSync(join(tmpdir(), "prefixo-"))` dentro de uma string — e isso e texto, nao uma
  // pasta que alguem crie. Sem isto o teste reprovava por um prefixo que nunca existe em disco,
  // e a saida barata teria sido inscrever na lista um prefixo imaginario.
  const semTexto = (src) =>
    src
      .split("\n")
      .map((l) => l.replace(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""'))
      .join("\n");

  const emFalta = new Set();
  for (const p of ficheiros) {
    for (const m of semTexto(readFileSync(p, "utf8")).matchAll(/mkdtempSync\(join\(tmpdir\(\),\s*"([^"]+)"/g)) {
      if (!PREFIXOS_DE_TESTE.some((pre) => m[1].startsWith(pre))) emFalta.add(m[1]);
    }
  }
  if (ficheiros.length === 0) return ["nao varri ficheiro nenhum — o teste nao esta a medir nada"];
  return emFalta.size === 0 ? [] : [`prefixos sem cobertura: ${[...emFalta].join(", ")}`];
});

// E a varredura em si, sobre uma base propria: apanha as VELHAS de qualquer prefixo da lista.
test("limpaFixturesDeTeste varre todos os prefixos da lista", () => {
  const base = mkdtempSync(join(tmpdir(), "t-limpo-"));
  try {
    const ontem = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (const p of ["sweep-test-", "guard-test-", "backlog-test-"]) {
      const d = comDono(base, p, null);
      utimesSync(d, ontem, ontem);
    }
    const n = limpaFixturesDeTeste(base);
    const restou = lerPasta(base);
    if (n !== 3) return [`devia ter apagado 3, apagou ${n}`];
    return restou.length === 0 ? [] : [`ficou: ${restou.join(", ")}`];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n  Uma limpeza que apague o que esta em uso e pior do que nao limpar nada.\n");
  process.exit(1);
}
console.log("\n  Todos os testes da limpeza de tmpdir passaram.\n");
process.exit(0);
