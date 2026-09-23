#!/usr/bin/env node
/**
 * Testes NEGATIVOS da maturidade do derivado — {{PROJECT_NAME}}
 *
 * O modulo sob teste leva o projeto simulado do **dia 1** ao **dia 100**: um anti-padrao
 * proprio, a configuracao preenchida, ficheiros grandes seus. Tres dos quatro achados de uma
 * ronda de revisao viviam so nesse estado.
 *
 * O QUE ESTA SUITE AFIRMA, e e por aqui que ela nao vira decorativa: cada uma das quatro
 * recusas (`fatal()`) fica **vermelha** quando o que ela vigia falha. Um modulo que monta
 * fixtures e falha ABERTO e pior do que nao existir — deixa a simulacao a medir o template por
 * estrear outra vez, em silencio, e a anunciar que mediu um derivado.
 *
 * Cada caso monta a sua propria copia em `tmpdir` e limpa-a (`TP3`): nada e herdado do repo,
 * senao os testes passavam aqui e falhavam em qualquer projeto derivado.
 *
 *   node .agent/scripts/tests/test-derivado-maduro.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { comHistoria, queConfigurou, comFicheirosGrandes } from "../lib/derivado-maduro.mjs";

let passed = 0;
const falhas = [];
const test = async (nome, fn) => {
  let p;
  try {
    p = (await fn()) ?? [];
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

/** O `fatal` do simulador, capturado em vez de executado. O verdadeiro sai do processo — aqui
 *  lanca, para o teste poder afirmar SOBRE a mensagem. Um teste que deixasse o `fatal` real
 *  correr matava a propria suite, e um que o substituisse por um no-op media o modulo a falhar
 *  ABERTO, que e o defeito. */
class Recusa extends Error {}
const espia = () => {
  const ditas = [];
  return {
    ditas,
    ok: (m) => ditas.push(`ok: ${m}`),
    fatal: (m) => {
      throw new Recusa(m);
    },
  };
};

/** Uma copia minima com o que os tres passos leem. `omitir` deixa um ficheiro DE FORA, que e
 *  como se monta cada controlo negativo; `corromper` troca-lhe o literal que o patch procura. */
const copia = ({ omitir = [], corromper = [] } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "derivado-maduro-teste-"));
  const escreve = (rel, txt) => {
    if (omitir.includes(rel)) return;
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, corromper.includes(rel) ? "// o literal mudou de forma\n" : txt);
  };
  escreve(".agent/rules/anti-patterns.md", "# Anti-Padroes\n\n## AP1 — ja existente\n");
  escreve(".agent/scripts/guards/versions.mjs", "const CHECKS = [\n];\n");
  escreve(".agent/scripts/check-doc-versions.mjs", "const BANNED = [\n];\n");
  escreve(".agent/scripts/config/bundles.mjs", "export const ALVOS_REPROVAM = true;\n");
  escreve(".agent/rules/process-rules.md", "Cada ticket passa por 6 fases.\n");
  escreve(
    ".agent/scripts/guards/sizes.mjs",
    "export const LIMITE = 500;\nexport const TETOS = {\n};\nexport const contaLinhas = (t) => t.replace(/\\n$/, '').split('\\n').length;\n"
  );
  return dir;
};
const limpa = (dir) => rmSync(dir, { recursive: true, force: true });
const le = (dir, rel) => readFileSync(join(dir, rel), "utf8");

console.log("\n=== Testes da maturidade do derivado ===\n");

// --- 3c: o anti-padrao proprio ---------------------------------------------------
await test("comHistoria: escolhe o proximo ID livre do prefixo do PROJETO", async () => {
  const dir = copia();
  try {
    const e = espia();
    comHistoria({ dir, ok: e.ok });
    const c = le(dir, ".agent/rules/anti-patterns.md");
    const p = [];
    if (!/## AP2\b/.test(c)) p.push("nao acrescentou o AP2 (o proximo livre depois do AP1)");
    if (/## AP1 — Entrada propria/.test(c)) p.push("reutilizou o AP1, que ja estava ocupado");
    return p;
  } finally {
    limpa(dir);
  }
});

// O CONTRA-CASO do de cima: sem nenhum `AP` definido comeca no PRIMEIRO numero. Sem ele, um
// modulo que escrevesse sempre "AP2" passava no teste anterior.
await test("comHistoria: sem nenhum AP definido comeca no primeiro numero", async () => {
  const dir = copia();
  try {
    writeFileSync(join(dir, ".agent/rules/anti-patterns.md"), "# Anti-Padroes\n");
    comHistoria({ dir, ok: espia().ok });
    return /## AP1\b/.test(le(dir, ".agent/rules/anti-patterns.md")) ? [] : ["nao comecou no AP1"];
  } finally {
    limpa(dir);
  }
});

// Ficheiro ausente NAO e recusa aqui, e e deliberado: um projeto pode nao ter o catalogo.
// Sem este caso, alguem "arrumava" o `if (c !== null)` para um `fatal` e partia esse projeto.
await test("comHistoria: catalogo ausente e silencio, nao recusa", async () => {
  const dir = copia({ omitir: [".agent/rules/anti-patterns.md"] });
  try {
    const e = espia();
    comHistoria({ dir, ok: e.ok });
    return e.ditas.length === 0 ? [] : [`devia ficar calado, disse: ${e.ditas.join(" | ")}`];
  } finally {
    limpa(dir);
  }
});

// --- 3d: a configuracao preenchida -----------------------------------------------
await test("queConfigurou: preenche as quatro decisoes do projeto", async () => {
  const dir = copia();
  try {
    queConfigurou({ dir, ...espia() });
    const p = [];
    if (!/framework-do-projeto/.test(le(dir, ".agent/scripts/guards/versions.mjs"))) p.push("CHECKS por preencher");
    if (!/NomeAntigoDoProjeto/.test(le(dir, ".agent/scripts/check-doc-versions.mjs"))) p.push("BANNED por preencher");
    if (!/ALVOS_REPROVAM = false/.test(le(dir, ".agent/scripts/config/bundles.mjs"))) p.push("gate dos bundles por suspender");
    if (/passa por 6 fases/.test(le(dir, ".agent/rules/process-rules.md"))) p.push("prosa por reescrever");
    return p;
  } finally {
    limpa(dir);
  }
});

// RECUSA 1 de 4.
await test("queConfigurou: RECUSA quando o ficheiro a configurar nao existe", async () => {
  const dir = copia({ omitir: [".agent/scripts/config/bundles.mjs"] });
  try {
    queConfigurou({ dir, ...espia() });
    return ["passou sem o ficheiro — a simulacao media o template por estrear em silencio"];
  } catch (err) {
    return err instanceof Recusa && /nao existe na copia/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// RECUSA 2 de 4. E a que mais provavelmente dispara na vida real: o literal muda de forma num
// ticket qualquer, e sem esta recusa a simulacao passava a medir menos, verde.
await test("queConfigurou: RECUSA quando o literal mudou de forma", async () => {
  const dir = copia({ corromper: [".agent/scripts/guards/versions.mjs"] });
  try {
    queConfigurou({ dir, ...espia() });
    return ["passou com o literal mudado — o patch nao aplicou e ninguem soube"];
  } catch (err) {
    return err instanceof Recusa && /o literal mudou de forma/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// --- 3e: os ficheiros grandes do projeto -----------------------------------------
await test("comFicheirosGrandes: congela o ficheiro do projeto nos TETOS", async () => {
  const dir = copia();
  try {
    await comFicheirosGrandes({ dir, ...espia() });
    const c = le(dir, ".agent/scripts/guards/sizes.mjs");
    const p = [];
    if (!/check-dominio\.mjs/.test(c)) p.push("nao congelou o ficheiro do projeto");
    if (!/: 54[12]\b/.test(c)) p.push(`contagem inesperada em TETOS: ${c.match(/: (\d+)/)?.[1]}`);
    // ACRESCENTA e nao substitui: os TETOS do template tem de sobreviver.
    if (!/export const TETOS = \{/.test(c)) p.push("destruiu o bloco TETOS em vez de lhe acrescentar");
    return p;
  } finally {
    limpa(dir);
  }
});

// RECUSA 3 de 4.
await test("comFicheirosGrandes: RECUSA quando o guard dos tamanhos nao existe", async () => {
  const dir = copia({ omitir: [".agent/scripts/guards/sizes.mjs"] });
  try {
    await comFicheirosGrandes({ dir, ...espia() });
    return ["passou sem o guard — nao ha catraca nenhuma a medir"];
  } catch (err) {
    return err instanceof Recusa && /nao existe na copia/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

// RECUSA 4 de 4.
await test("comFicheirosGrandes: RECUSA quando os TETOS mudaram de forma", async () => {
  const dir = copia();
  try {
    writeFileSync(
      join(dir, ".agent/scripts/guards/sizes.mjs"),
      "export const OUTROS_NOME = {\n};\nexport const contaLinhas = (t) => t.replace(/\\n$/, '').split('\\n').length;\n"
    );
    await comFicheirosGrandes({ dir, ...espia() });
    return ["passou sem reescrever os TETOS — o derivado ficava sem os seus ficheiros grandes"];
  } catch (err) {
    return err instanceof Recusa && /nao consegui reescrever os TETOS/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  } finally {
    limpa(dir);
  }
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n  Um construtor de fixtures que falhe ABERTO da por medido um derivado que nunca existiu.\n");
  process.exit(1);
}
console.log("\n  Todos os testes da maturidade do derivado passaram.\n");
process.exit(0);
