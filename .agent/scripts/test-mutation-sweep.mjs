#!/usr/bin/env node
/**
 * Testes do Mutation Sweep — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS do `mutation-sweep.mjs`.
 *
 * PORQUE EXISTE: o varredor reprova qualquer verificador que nao tenha suite — e isentava-se
 * a si proprio por nao estar em `PARES`. O medidor estava sem medida. Se alguem o quebrasse
 * (um `sinal` mal escrito, o `falhou` que nunca se liga), ele passaria a dar cobertura
 * perfeita a suites que nao afirmam nada, e nada avisaria.
 *
 * COMO FUNCIONA: cada teste cria um sandbox com um verificador FALSO e uma suite FALSA de
 * comportamento conhecido, aponta o `PARES` do varredor para eles, e afirma o que o varredor
 * diz. Um par falso corre em milissegundos — varrer os verificadores reais aqui levaria
 * minutos e nao acrescentaria nada.
 *
 * Sem dependencias e sem package.json, como os outros scripts de `.agent/scripts/`.
 *
 *   node .agent/scripts/test-mutation-sweep.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SWEEP = join(ROOT, ".agent/scripts/mutation-sweep.mjs");

// --- O verificador falso -----------------------------------------------------
// Dois sitios de aviso. O `fake-test.mjs` abaixo so exercita o PRIMEIRO, logo a varredura
// tem de reportar 1/2 — e e isso que prova que ela deteta um aviso sem teste.
const FAKE_CHECK = `let avisos = 0;
const warn = (m) => { console.log("  WARN  " + m); avisos++; };
const alvo = process.argv[2] ?? "";
if (alvo.includes("mau")) warn("encontrei 'mau'");
if (alvo.includes("zzz")) warn("encontrei 'zzz'");
process.exit(avisos > 0 ? 1 : 0);
`;

// Suite falsa: exercita SO o primeiro sitio.
const FAKE_TEST = `import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
function corre(arg) {
  try { return { code: 0, out: execFileSync("node", [join(ROOT, ".agent/scripts/fake-check.mjs"), arg], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") }; }
}
const r = corre("isto e mau");
if (r.code === 0 || !r.out.includes("encontrei 'mau'")) { console.log("FALHOU"); process.exit(1); }
console.log("ok");
`;

function sandbox({ suite = ".agent/scripts/fake-test.mjs", sinal = "/(?<![\\w.$])warn\\(/", segundoSitio = true, baselineVermelha = false, semAlvo = false, opcional = false, doisNaMesmaLinha = false, verificadorSemPar = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sweep-test-"));
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });

  let check = FAKE_CHECK;
  if (!segundoSitio) check = check.replace('if (alvo.includes("zzz")) warn("encontrei \'zzz\'");\n', "");
  if (doisNaMesmaLinha) {
    // Duas chamadas de aviso na MESMA linha: `sitios` e indexado por linha e o `replace` nao
    // e global, logo a segunda herdava a cobertura da primeira sem nunca ser medida.
    //
    // A linha ambigua tem de ser a linha COBERTA (a do "mau"), nao a descoberta. Na primeira
    // versao deste teste ela era a do "zzz": desligar o `falhou` do LINHA AMBIGUA mantinha o
    // exit 1 porque a INCOMPLETA disparava — a assercao era satisfeita por outra verificacao,
    // que e exatamente o AP1. Assim, a unica razao de reprovar e a linha ambigua.
    check = check.replace(
      'if (alvo.includes("mau")) warn("encontrei \'mau\'");',
      'if (alvo.includes("mau")) { warn("encontrei \'mau\'"); warn("extra"); }'
    );
  }
  if (!semAlvo) writeFileSync(join(dir, ".agent/scripts/fake-check.mjs"), check);
  if (verificadorSemPar) {
    // Nome que casa a convencao `check-*.mjs` e ausente de `PARES`: e o cenario de alguem
    // acrescentar um verificador ao repo e esquecer o registo.
    writeFileSync(join(dir, ".agent/scripts/check-orfao.mjs"), 'const warn=(m)=>console.log(m);\nif(process.env.X)warn("a");\n');
  }

  writeFileSync(
    join(dir, ".agent/scripts/fake-test.mjs"),
    baselineVermelha ? 'console.log("sempre vermelha"); process.exit(1);\n' : FAKE_TEST
  );

  // Copiar o varredor e apontar o seu PARES para o par falso. Patch minimo: substituir o
  // array inteiro, para o teste nao depender do conteudo real de PARES.
  const src = readFileSync(SWEEP, "utf8");
  const inicio = src.indexOf("const PARES = [");
  const fim = src.indexOf("];", inicio) + 2;
  if (inicio === -1 || fim === 1) throw new Error("nao encontrei o array PARES no mutation-sweep.mjs");
  const paresFalso =
    "const PARES = [{ alvo: \".agent/scripts/fake-check.mjs\", suite: " +
    (suite === null ? "null" : JSON.stringify(suite)) +
    ", sinal: " + sinal + ", neutro: \"(() => {})(\"" + (opcional ? ", opcional: true" : "") + " }];";
  writeFileSync(join(dir, ".agent/scripts/mutation-sweep.mjs"), src.slice(0, inicio) + paresFalso + src.slice(fim));
  return dir;
}

function run(dir, args = []) {
  try {
    const out = execFileSync("node", [join(dir, ".agent/scripts/mutation-sweep.mjs"), ...args], {
      cwd: dir, encoding: "utf8", stdio: "pipe",
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

let passed = 0;
const failures = [];

function test(name, opts, args, expect) {
  const dir = sandbox(opts);
  try {
    const { code, out } = run(dir, args);
    const problems = [];
    if (code !== expect.code) problems.push(`exit ${code}, esperado ${expect.code}`);
    for (const s of expect.includes ?? []) if (!out.includes(s)) problems.push(`output devia conter "${s}"`);
    for (const s of expect.excludes ?? []) if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
    if (expect.extra) problems.push(...(expect.extra(dir, out) ?? []));
    if (problems.length) {
      failures.push({ name, problems, out });
      console.log(`  FAIL  ${name}`);
      for (const p of problems) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== Testes do Mutation Sweep ===\n");

// --- O que o varredor existe para fazer --------------------------------------
test("deteta um sitio de aviso que nenhum teste exercita", {}, [], {
  code: 1,
  includes: ["INCOMPLETA", "1/2 sitios cobertos", "encontrei 'zzz'", "VARREDURA NAO CONCLUSIVA"],
});

test("com todos os sitios cobertos, reporta OK e sai 0", { segundoSitio: false }, [], {
  code: 0,
  // Sem o segundo sitio o verificador falso tem 1 — e a suite exercita-o.
  includes: ["1/1 sitios", "cada aviso fica vermelho", "Cobertura de mutacao completa"],
  excludes: ["INCOMPLETA"],
});

// --- Os caminhos de reprovacao (um teste por sitio) --------------------------
test("verificador SEM suite reprova", { suite: null }, [], {
  code: 1,
  includes: ["SEM SUITE", "NENHUM teste", "VARREDURA NAO CONCLUSIVA"],
});

test("sinal que nao casa nada reprova (nao varre zero em silencio)", { sinal: "/nunca_casa_isto\\(/" }, [], {
  code: 1,
  includes: ["SINAL ERRADO", "atualizar PARES"],
});

test("baseline ja vermelha reprova antes de varrer", { baselineVermelha: true }, [], {
  code: 1,
  includes: ["BASELINE VERMELHA", "corrigir antes de varrer"],
});

test("--only sem correspondencia reprova e lista os alvos", {}, ["--only=nao-existe"], {
  code: 1,
  includes: ["nao casa nenhum alvo", "fake-check.mjs"],
});

// --- Alvo que desapareceu do disco (achado da Fase 4) ------------------------
// Assimetria que existia: um `sinal` desatualizado reprovava, um `alvo` desatualizado
// passava a dizer "Cobertura de mutacao completa". Renomear um verificador sem tocar em
// `PARES` deixava o gate verde — o cenario que a matriz de propagacao quer prevenir.
test("alvo que nao existe reprova (nao passa a dizer 'completa')", { semAlvo: true }, [], {
  code: 1,
  includes: ["ALVO AUSENTE", "sem atualizar PARES"],
  excludes: ["Cobertura de mutacao completa"],
});

test("alvo declarado opcional pode faltar sem reprovar", { semAlvo: true, opcional: true }, [], {
  code: 0,
  includes: ["declarado opcional", "Cobertura de mutacao completa"],
  excludes: ["ALVO AUSENTE"],
});

// --- `--list` nao pode engolir o veredicto (achado da Fase 4) -----------------
// Os testes cobriam cada flag isolada; a COMBINACAO saia 0 a reportar um problema.
test("--list com --only sem correspondencia continua a reprovar", {}, ["--list", "--only=nao-existe"], {
  code: 1,
  includes: ["nao casa nenhum alvo"],
});

test("--list com SEM SUITE continua a reprovar", { suite: null }, ["--list"], {
  code: 1,
  includes: ["SEM SUITE"],
});

// --- Duas chamadas de aviso na mesma linha (achado da propria varredura) -----
test("dois avisos na mesma linha reprovam em vez de herdar cobertura",
     { doisNaMesmaLinha: true, segundoSitio: false }, [], {
  code: 1,
  includes: ["LINHA AMBIGUA", "2 avisos na mesma linha", "separa-los para cada um ser medido"],
  // Sem INCOMPLETA no output, a LINHA AMBIGUA e a unica coisa que pode fazer o exit != 0.
  excludes: ["Cobertura de mutacao completa", "INCOMPLETA  .agent"],
});

// --- Verificador no disco e ausente de PARES (achado da Fase 4) --------------
// A documentacao afirmava, em quatro sitios, que a varredura reprovava um verificador sem
// suite. Nao reprovava: o ramo `SEM SUITE` so dispara para uma entrada de `PARES` com
// `suite` nula, o que exige que alguem a tenha acrescentado. Um `check-*.mjs` novo entrava
// no repo sem rede e a prosa garantia o contrario.
test("verificador no disco e ausente de PARES reprova", { verificadorSemPar: true }, ["--list"], {
  code: 1,
  includes: ["SEM PAR", "check-orfao.mjs", "sem rede nenhuma"],
});

test("com todos os verificadores registados, nao ha SEM PAR", {}, ["--list"], {
  code: 0,
  excludes: ["SEM PAR"],
});

// --- Contratos que nao se podem perder ---------------------------------------
test("--list conta sem correr a suite e sai 0", {}, ["--list"], {
  code: 0,
  includes: ["2 sitios"],
  excludes: ["Cobertura de mutacao completa", "INCOMPLETA"],
});

test("nao deixa o verificador mutado depois de correr", {}, [], {
  code: 1,
  extra: (dir) => {
    const c = readFileSync(join(dir, ".agent/scripts/fake-check.mjs"), "utf8");
    const p = [];
    if (c.includes("(() => {})(")) p.push("deixou o neutro injetado no verificador REAL");
    if (!c.includes('warn("encontrei \'zzz\'")')) p.push("o segundo sitio de aviso desapareceu do ficheiro");
    return p;
  },
});

test("--only com correspondencia varre so esse alvo", {}, ["--only=fake-check"], {
  code: 1,
  includes: ["fake-check.mjs", "1/2 sitios cobertos"],
});

// --- Resumo ------------------------------------------------------------------
console.log("");
console.log(`  ${passed} passaram, ${failures.length} falharam.`);
console.log("");
if (failures.length) {
  for (const { name, out } of failures) {
    console.log(`--- output de "${name}" ---`);
    console.log(out);
  }
  console.log("  Ha testes do mutation sweep a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do mutation sweep passaram.\n");
