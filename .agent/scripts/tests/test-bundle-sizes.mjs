/**
 * Testes do Bundle Size Checker — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS: monta arvores `.next/` falsas e exige que o checker recuse
 * reportar um numero que nao conseguiu medir.
 *
 * O defeito que motivou isto: o checker tratava ficheiro ausente como 0 kB e
 * imprimia `Home 0.0 kB [OK]` com exit 0 — um build que nao produziu nada passava
 * como limpo. Um numero errado e pior do que numero nenhum.
 *
 * Sem dependencias e sem package.json, como os restantes scripts de `.agent/scripts/`.
 * Nao precisa de Next.js instalado: as fixtures sao ficheiros de texto e um
 * `build-manifest.json` escrito a mao.
 *
 * Uso:
 *   node .agent/scripts/tests/test-bundle-sizes.mjs
 *
 * Sai != 0 se algum teste falhar. Corre em cada push/PR no job `guard-tests` do ci.yml.
 */

import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
// Os construtores de fixture vivem no harness: a catraca do Guard 17 exigiu a divisao antes
// de deixar a suite crescer mais. Ver `test-bundle-harness.mjs`.
import {
  ROOT,
  CHECKER,
  sandbox,
  chunk,
  withTargets,
  suspenderAlvos,
  ligarAlvos,
  manifestoRsc,
  manifest,
} from "./harness/test-bundle-harness.mjs";

// Os contadores sao da SUITE, nao do harness: quem monta fixtures nao conta veredictos.
let passed = 0;
const failures = [];
import { join } from "path";
import { gzipSync } from "zlib";
import { randomBytes } from "crypto";

function run(dir, cwd) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, CHECKER)], { cwd: cwd ? join(dir, cwd) : dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

function test(name, build, expect) {
  const dir = sandbox();
  try {
    // build() pode devolver { includes, excludes } extra — usado quando a
    // expectativa e um numero calculado a partir das fixtures.
    // Um `throw` aqui (ex: o patch de TARGETS a nao aplicar) abortava o processo a meio
    // e os testes seguintes nunca corriam, sem sequer linha de resumo.
    let extra;
    try {
      extra = build(dir) ?? {};
    } catch (err) {
      failures.push({ name, problems: [`setup rebentou: ${err.message}`], out: "" });
      console.log(`  FAIL  ${name}`);
      console.log(`          setup rebentou: ${err.message}`);
      return;
    }
    const { code, out } = run(dir, expect.cwd);
    const problems = [];
    const includes = [...(expect.includes ?? []), ...(extra.includes ?? [])];
    const excludes = [...(expect.excludes ?? []), ...(extra.excludes ?? [])];
    for (const [route, want] of Object.entries(extra.numbers ?? {})) {
      // Escapar: uma rota com `(`, `.` ou `/` (route group) partia o regex.
      const esc = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp(`${esc}\\s+([\\d.]+) kB`).exec(out);
      if (!m) problems.push(`nao encontrei uma linha de medicao para "${route}"`);
      else if (m[1] !== want) problems.push(`${route}: esperado ${want} kB, medido ${m[1]} kB`);
    }
    if (code !== expect.code) problems.push(`exit esperado ${expect.code}, obtido ${code}`);
    for (const s of includes) if (!out.includes(s)) problems.push(`output devia conter "${s}"`);
    for (const s of excludes) if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
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

console.log("\n=== Testes do Bundle Size Checker ===\n");

// --- Integridade da medicao -------------------------------------------------

test("ficheiro do manifest ausente do disco FALHA (era 0.0 kB [OK])", (dir) => {
  manifest(dir, { rootMainFiles: ["static/chunks/falta-1.js", "static/chunks/falta-2.js"], pages: {} });
}, {
  code: 1,
  includes: ["AUSENTES do disco", "static/chunks/falta-1.js", "static/chunks/falta-2.js"],
  excludes: ["Todas as paginas dentro dos targets"],
});

test("rota sem chunks proprios FALHA em vez de reportar so a baseline", (dir) => {
  chunk(dir, "static/chunks/shared.js", 50_000);
  manifest(dir, { rootMainFiles: ["static/chunks/shared.js"], pages: {} });
}, {
  code: 1,
  includes: ["nao foi possivel resolver os chunks proprios", "apenas a baseline partilhada", "[?]"],
  excludes: ["[OK]"],
});

test("manifest truncado da mensagem accionavel, nao stack trace", (dir) => {
  writeFileSync(join(dir, ".next", "build-manifest.json"), '{ "rootMainFiles": [');
}, {
  code: 1,
  includes: ["nao e JSON valido", "build interrompido"],
  excludes: ["at JSON.parse"],
});

test("sem .next/build-manifest.json pede o build", () => {}, {
  code: 1,
  includes: ["nao encontrado", "npm run build"],
});

// --- Contagem ---------------------------------------------------------------

test("chunk duplicado na lista da pagina e contado UMA vez", (dir) => {
  const shared = chunk(dir, "static/chunks/shared.js", 10_000, "s");
  const vendor = chunk(dir, "static/chunks/app/page-vendor.js", 900_000, "v");
  manifest(dir, {
    rootMainFiles: ["static/chunks/shared.js"],
    pages: { "app/page": ["static/chunks/app/page-vendor.js", "static/chunks/app/page-vendor.js"] },
  });
  // O ficheiro esta em static/chunks/app/ e comeca por "page-", logo e apanhado
  // pela lista da pagina E pelo varrimento de diretorio. So o `seen` impede a
  // contagem dupla. Asserir o NUMERO — afirmar so "[OK]" passaria com o defeito.
  return {
    includes: [`${((shared + vendor) / 1024).toFixed(1)} kB`],
    excludes: [`${((shared + vendor * 2) / 1024).toFixed(1)} kB`],
  };
}, { code: 0 });

test("chunk proprio da rota e somado a baseline", (dir) => {
  chunk(dir, "static/chunks/shared.js", 10_000, "s");
  chunk(dir, "static/chunks/app/page-abc.js", 20_000, "p");
  manifest(dir, { rootMainFiles: ["static/chunks/shared.js"], pages: {} });
}, {
  code: 0,
  includes: ["[OK]"],
  excludes: ["nao foi possivel resolver"],
});

test("chunk de layout entra na baseline partilhada", (dir) => {
  chunk(dir, "static/chunks/app/layout-xyz.js", 30_000, "l");
  chunk(dir, "static/chunks/app/page-abc.js", 10_000, "p");
  manifest(dir, { rootMainFiles: [], pages: {} });
}, {
  code: 0,
  excludes: ["Shared (framework + layout): 0.0 kB"],
});

// --- Contagem entre rotas (First Load JS e POR ROTA) -------------------------

test("chunk partilhado por DUAS rotas conta nas duas", (dir) => {
  const shared = chunk(dir, "static/chunks/shared.js", 10_000, "s");
  const common = chunk(dir, "static/chunks/common-ab.js", 500_000, "c");
  chunk(dir, "static/chunks/app/page-a.js", 1_000, "a");
  chunk(dir, "static/chunks/app/rotab/page-b.js", 1_000, "b");
  manifest(dir, {
    rootMainFiles: ["static/chunks/shared.js"],
    pages: {
      "app/page": ["static/chunks/common-ab.js"],
      "app/rotab/page": ["static/chunks/common-ab.js"],
    },
  });
  withTargets(dir, {
    "/": { name: "RotaA", target: 160, alarm: 180 },
    "/rotab": { name: "RotaB", target: 160, alarm: 180 },
  });
  // Um `seen` partilhado entre rotas dava o chunk comum so a primeira, e a segunda
  // reportava ~80% a menos com [OK]. As duas tem de mostrar o MESMO valor.
  const expected = ((shared + common + gzipSync(Buffer.from("a".repeat(1_000))).length) / 1024).toFixed(1);
  const expectedB = ((shared + common + gzipSync(Buffer.from("b".repeat(1_000))).length) / 1024).toFixed(1);
  // Extrair o NUMERO em vez de afirmar a linha formatada: uma alteracao ao padEnd()
  // do checker fazia este teste de CONTAGEM ficar vermelho por ALINHAMENTO.
  return { numbers: { RotaA: expected, RotaB: expectedB } };
}, { code: 0 });

test("layout tambem listado em rootMainFiles NAO duplica a baseline", (dir) => {
  const layout = chunk(dir, "static/chunks/app/layout-xyz.js", 600_000, "l");
  chunk(dir, "static/chunks/app/page-abc.js", 1_000, "p");
  manifest(dir, { rootMainFiles: ["static/chunks/app/layout-xyz.js"], pages: {} });
  // Antes, o varrimento de layouts nao consultava o `seen`: a baseline vinha a dobrar.
  return {
    includes: [`Shared (framework + layout): ${(layout / 1024).toFixed(1)} kB`],
    excludes: [`Shared (framework + layout): ${((layout * 2) / 1024).toFixed(1)} kB`],
  };
}, { code: 0 });

// --- Ancoragem a raiz do repo ------------------------------------------------
// O checker recebeu a mesma ancoragem que o check-doc-versions.mjs, mas sem teste:
// era possivel troca-la por `process.cwd()` e a suite continuar 10/10 verde.
const anchorFixture = (dir) => {
  chunk(dir, "static/chunks/shared.js", 10_000, "s");
  chunk(dir, "static/chunks/app/page-abc.js", 20_000, "p");
  manifest(dir, { rootMainFiles: ["static/chunks/shared.js"], pages: {} });
  mkdirSync(join(dir, "sub"), { recursive: true }); // subdiretorio sem .next/
};

test("ancoragem: correr de um subdiretorio continua a medir", anchorFixture, {
  code: 0, cwd: "sub", includes: ["[OK]"], excludes: ["nao encontrado"],
});

test("ancoragem: [controlo negativo] com ROOT = cwd, TEM de falhar", (dir) => {
  anchorFixture(dir);
  const patched = readFileSync(join(dir, CHECKER), "utf8").replace(
    /^const ROOT = .*$/m, "const ROOT = process.cwd();"
  );
  if (!patched.includes("const ROOT = process.cwd();")) {
    throw new Error("o patch do controlo negativo nao aplicou");
  }
  writeFileSync(join(dir, CHECKER), patched);
}, { code: 1, cwd: "sub", includes: ["nao encontrado"] });

// --- Confinamento a .next/ ---------------------------------------------------
// Regressao introduzida pelo `keyOf`: `resolve(NEXT_DIR, "/fora/x")` sai do `.next/`,
// e o checker media um ficheiro que nao faz parte do bundle. Antes recusava-o.
test("caminho ABSOLUTO no manifest e recusado, nao medido", (dir) => {
  chunk(dir, "static/chunks/real.js", 1_000, "r");
  const fora = join(dir, "FORA-DO-NEXT.txt");
  writeFileSync(fora, "F".repeat(300_000));
  manifest(dir, { rootMainFiles: ["static/chunks/real.js", fora], pages: {} });
}, {
  code: 1,
  includes: ["FORA de .next/", "FORA-DO-NEXT.txt"],
  excludes: ["Todas as paginas dentro dos targets"],
});

test("`../` no manifest e recusado", (dir) => {
  writeFileSync(join(dir, "FORA.txt"), "F".repeat(1_000));
  manifest(dir, { rootMainFiles: ["../FORA.txt"], pages: {} });
}, { code: 1, includes: ["FORA de .next/", "../FORA.txt"] });

test("rota cujo diretorio escapa do .next/ e recusada", (dir) => {
  mkdirSync(join(dir, "FORA", "x"), { recursive: true });
  writeFileSync(join(dir, "FORA", "x", "page-evil.js"), "E".repeat(400_000));
  manifest(dir, { rootMainFiles: [], pages: {} });
  // O confinamento tinha sido aplicado ao addFiles e nao ao varrimento de diretorio,
  // que e o unico caminho que conta chunks proprios no App Router.
  // Quatro niveis: o varrimento parte de `.next/static/chunks/app`, logo `../../` ainda
  // cai DENTRO do `.next/`. Sao precisos quatro para chegar a raiz da sandbox.
  withTargets(dir, { "/../../../../FORA/x": { name: "Escapada", target: 160, alarm: 180 } });
}, { code: 1, includes: ["FORA de .next/"], excludes: ["[OK]"] });

// --- Chaves equivalentes ------------------------------------------------------
test("`./x.js` e `x.js` sao o mesmo ficheiro, nao dois", (dir) => {
  const layout = chunk(dir, "static/chunks/app/layout-xyz.js", 600_000, "l");
  chunk(dir, "static/chunks/app/page-abc.js", 1_000, "p");
  // O manifest escreve com "./", o varrimento de diretorio sem — o `seen` comparava
  // as strings cruas e contava a baseline a dobrar.
  manifest(dir, { rootMainFiles: ["./static/chunks/app/layout-xyz.js"], pages: {} });
  return {
    includes: [`Shared (framework + layout): ${(layout / 1024).toFixed(1)} kB`],
    excludes: [`Shared (framework + layout): ${((layout * 2) / 1024).toFixed(1)} kB`],
  };
}, { code: 0 });

// --- Targets ----------------------------------------------------------------

test("bundle acima do alarme FALHA", (dir) => {
  // DECLARA a posicao do gate em vez de a herdar do repo: num derivado que o tenha
  // suspenso — o interruptor existe para isso — este teste media outra coisa (`TP3`).
  ligarAlvos(dir);
  // Bytes CRIPTOGRAFICAMENTE aleatorios. Uma primeira versao usava
  // `(i * 2654435761) % 256`, que e um ciclo perfeito de 256 bytes — o gzip
  // esmagava-o para 1.8 kB e o teste media compressao, nao o alarme.
  mkdirSync(join(dir, ".next", "static", "chunks", "app"), { recursive: true });
  writeFileSync(join(dir, ".next", "static", "chunks", "app", "page-big.js"), randomBytes(400_000));
  manifest(dir, { rootMainFiles: [], pages: {} });
}, {
  code: 1,
  includes: ["[ALARM]", "excedem o limite de alarme", "imports sincronos"],
});

// --- O manifesto RSC: a fonte por rota no Next moderno -----------------------
// PORQUE: o varrimento de `.next/static/chunks/app/<rota>/` era "o unico caminho" e no Next 16
// essa pasta NAO existe. Medido num derivado real: dez rotas, o mesmo valor, dez `[OK]` — o
// verificador nunca mediu rota nenhuma, e o numero era plausivel.

// O limiar deriva do tamanho MEDIDO: assim o teste falha se o chunk da rota nao for contado
// (fica abaixo e da `[OK]`) e falha se a rota nem sequer resolver (da `[?]`). Sem o resolvedor
// RSC, esta rota nao tem chunks proprios em lado nenhum — era exactamente o caso do Next 16.
test("RSC: os chunks da rota sao contados a partir do manifesto", (dir) => {
  ligarAlvos(dir);
  chunk(dir, "static/chunks/base.js", 1000);
  const n = chunk(dir, "static/chunks/rota-abc.js", 80_000);
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  manifestoRsc(dir, "/", [["/_next/static/chunks/rota-abc.js"]]);
  // alarme a metade do chunk da rota: so dispara se ele for de facto contado.
  withTargets(dir, { "/": { name: "Home", target: n / 2048, alarm: n / 2048 } });
}, { code: 1, includes: ["[ALARM]"], excludes: ["[?]"] });

// A ARMADILHA: a chave de uma rota dinamica leva `[` e `]`. Uma regex com `\[[^\]]+\]` para
// no `]` de `[id]` e a rota fica por resolver com o manifesto ali ao lado.
test("RSC: rota DINAMICA (chave com parenteses rectos) resolve na mesma", (dir) => {
  withTargets(dir, { "/resultados/[id]": { name: "Resultado", target: 200, alarm: 250 } });
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  chunk(dir, "static/chunks/base.js", 1000);
  chunk(dir, "static/chunks/din.js", 3000);
  manifestoRsc(dir, "/resultados/[id]", [["/_next/static/chunks/din.js"]]);
}, { code: 0, includes: ["[OK]"], excludes: ["[?]"] });

// "Nao consegui ler" != "esta rota nao tem chunks" (`TP2`). Um manifesto ilegivel tem de
// deixar a rota por resolver — que ja reprova — e nunca dar zero com `[OK]`.
test("RSC: manifesto ilegivel deixa a rota por resolver, nao a zero", (dir) => {
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  chunk(dir, "static/chunks/base.js", 1000);
  manifestoRsc(dir, "/", [], { corpo: "{ isto nao e json" });
}, { code: 1, includes: ["[?]"] });

test("RSC: chunk citado no manifesto mas AUSENTE do disco reprova", (dir) => {
  chunk(dir, "static/chunks/base.js", 1000);
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  manifestoRsc(dir, "/", [["/_next/static/chunks/nao-existe.js"]]);
}, { code: 1, includes: ["AUSENTES do disco", "static/chunks/nao-existe.js"] });

// O mesmo chunk em dois modulos do manifesto conta UMA vez — o First Load e por rota, e um
// ficheiro carregado duas vezes nao pesa a dobrar.
// O First Load e por rota: um ficheiro carregado por dois modulos nao pesa a dobrar. O
// alarme fica entre 1x e 2x — passa se contar uma vez, reprova se contar duas.
test("RSC: o mesmo chunk em dois modulos conta uma vez", (dir) => {
  chunk(dir, "static/chunks/base.js", 1000);
  const n = chunk(dir, "static/chunks/partilhado.js", 80_000);
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  manifestoRsc(dir, "/", [["/_next/static/chunks/partilhado.js"], ["/_next/static/chunks/partilhado.js"]]);
  withTargets(dir, { "/": { name: "Home", target: (n * 1.5) / 1024, alarm: (n * 1.5) / 1024 } });
}, { code: 0, includes: ["[OK]"], excludes: ["[ALARM]", "[?]"] });

// O confinamento a `.next/` tem de valer TAMBEM pelo caminho RSC. Os testes que ja existiam
// cobriam o manifesto e o varrimento de diretorio; este caminho e novo e um manifesto e um
// ficheiro gerado — se alguem lhe puser um `../`, o verificador media ficheiros de fora e
// reportava um numero que nao e o bundle.
test("RSC: chunk que SAI do .next/ e reportado, nao contado", (dir) => {
  chunk(dir, "static/chunks/base.js", 1000);
  writeFileSync(join(dir, "FORA-RSC.txt"), "F".repeat(50_000));
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  manifestoRsc(dir, "/", [["/_next/../FORA-RSC.txt"]]);
}, { code: 1, includes: ["FORA de .next/"] });

// --- Os polyfills na baseline ------------------------------------------------
// E UM ficheiro, carregado em TODAS as paginas, e media 38,7 kB num derivado real — 20% do
// First Load. Nao tem nada a ver com a versao do Next: era uma omissao pura.
test("polyfillFiles entram na baseline", (dir) => {
  ligarAlvos(dir);
  chunk(dir, "static/chunks/base.js", 1000);
  const n = chunk(dir, "static/chunks/poly.js", 80_000);
  chunk(dir, "static/chunks/app/page-x.js", 100);
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"], polyfillFiles: ["static/chunks/poly.js"] });
  // alarme a metade do polyfill: so dispara se ele entrar na baseline.
  withTargets(dir, { "/": { name: "Home", target: n / 2048, alarm: n / 2048 } });
}, { code: 1, includes: ["[ALARM]"] });

// --- O interruptor do gate: os DOIS lados, e o que ele NAO suspende ----------
// Existe porque, quando um projeto liga a medicao a serio, os alvos que la estavam foram
// escritos contra um numero que nao era medicao (1,4x a 2,0x acima, medido num derivado real).
// Sem estes testes, o interruptor era uma afirmacao em prosa — que e o defeito que este repo
// persegue em todo o lado.

test("gate LIGADO: exceder o alarme reprova", (dir) => {
  ligarAlvos(dir);
  chunk(dir, "static/chunks/base.js", 1000);
  const n = chunk(dir, "static/chunks/app/page-x.js", 80_000);
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  withTargets(dir, { "/": { name: "Home", target: n / 2048, alarm: n / 2048 } });
}, { code: 1, includes: ["[ALARM]"] });

test("gate SUSPENSO: exceder o alarme avisa mas nao reprova", (dir) => {
  chunk(dir, "static/chunks/base.js", 1000);
  const n = chunk(dir, "static/chunks/app/page-x.js", 80_000);
  manifest(dir, { rootMainFiles: ["static/chunks/base.js"] });
  withTargets(dir, { "/": { name: "Home", target: n / 2048, alarm: n / 2048 } });
  suspenderAlvos(dir);
  // O `[ALARM]` continua a aparecer: suspende-se o VEREDICTO, nao o diagnostico. Um gate
  // suspenso que tambem calasse a mensagem seria indistinguivel de nao ter gate nenhum.
}, { code: 0, includes: ["[ALARM]"] });

// A terceira assercao, e a que interessa mais: **nao conseguir medir continua a reprovar**,
// mesmo com o gate suspenso. O interruptor cobre o juizo sobre o TAMANHO e mais nada — se
// cobrisse a integridade da medicao, seria um `|| true` com outro nome.
test("gate SUSPENSO: uma rota por resolver continua a reprovar", (dir) => {
  chunk(dir, "static/chunks/shared.js", 50_000);
  manifest(dir, { rootMainFiles: ["static/chunks/shared.js"], pages: {} });
  suspenderAlvos(dir);
}, { code: 1, includes: ["nao foi possivel resolver os chunks proprios", "[?]"] });

test("gate SUSPENSO: ficheiro ausente do disco continua a reprovar", (dir) => {
  manifest(dir, { rootMainFiles: ["static/chunks/falta.js"], pages: {} });
  suspenderAlvos(dir);
}, { code: 1, includes: ["AUSENTES do disco"] });

// --- A ligacao entre a fixture e o que o checker LE --------------------------
// Estes dois substituem os `throw` que o #67 tornou obsoletos. Antes, a fixture FATIAVA o
// literal dentro do ficheiro da logica, e cada patch trazia a sua guarda de "o literal mudou de
// forma — o patch mediria a versao errada". Com a config escrita num ficheiro proprio esse modo
// de falha desapareceu... e foi substituido por outro, da mesma familia e igualmente silencioso:
//
//   o `porConfig()` escreve `.agent/scripts/config/bundles.mjs` na sandbox. Se o checker deixar
//   de a importar — alguem volta a por a configuracao inline — ou renomear o que importa, a
//   fixture passa a escrever um ficheiro que NINGUEM LE. Os 27 testes continuam verdes, a medir
//   a configuracao errada.
//
// O `check-test-surface` apontou a descida das assercoes e obrigou a esta pergunta. A resposta
// nao foi baixar o numero: foi traduzir o invariante velho para o desenho novo.
test("o checker IMPORTA a config — senao a fixture nao e lida por ninguem", () => {
  const src = readFileSync(join(ROOT, CHECKER), "utf8");
  if (!/from\s+["']\.\/config\/bundles\.mjs["']/.test(src)) {
    throw new Error("o check-bundle-sizes.mjs ja nao importa ./config/bundles.mjs — a fixture deixaria de ser lida");
  }
// A assercao deste teste esta no SETUP, nao no output: a sandbox fica vazia e o checker sai 1 a
// pedir o build, como em qualquer outro teste sem manifest. O que se mede e o `throw` acima.
}, { code: 1, includes: ["nao encontrado", "npm run build"] });

test("o checker importa os NOMES que a fixture escreve", () => {
  const src = readFileSync(join(ROOT, CHECKER), "utf8");
  const importa = src.match(/import\s*\{([^}]+)\}\s*from\s+["']\.\/config\/bundles\.mjs["']/)?.[1] ?? "";
  const faltam = ["TARGETS", "ALVOS_REPROVAM"].filter((n) => !new RegExp(`\\b${n}\\b`).test(importa));
  if (faltam.length) {
    throw new Error(`o checker ja nao importa ${faltam.join(", ")} — o porConfig() escreveria nomes que ninguem le`);
  }
// A assercao deste teste esta no SETUP, nao no output: a sandbox fica vazia e o checker sai 1 a
// pedir o build, como em qualquer outro teste sem manifest. O que se mede e o `throw` acima.
}, { code: 1, includes: ["nao encontrado", "npm run build"] });

// --- Resumo -----------------------------------------------------------------

console.log("");
console.log(`  ${passed} passaram, ${failures.length} falharam.`);
if (failures.length) {
  console.log("\n--- Detalhe das falhas ---");
  for (const f of failures) {
    console.log(`\n[${f.name}]`);
    for (const p of f.problems) console.log(`  ${p}`);
    console.log(f.out.split("\n").map((l) => `    | ${l}`).join("\n"));
  }
  console.log("");
  process.exit(1);
}
console.log("\nTodos os testes do bundle checker passaram.\n");
process.exit(0);
