/**
 * O PLANO do CI (`lib/plano-ci.mjs`, #347 C1): a decisao "a varredura aplica-se?" e a rede a volta dela.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`. E o DONO do alvo na
 * varredura (`tests-<alvo>.mjs`).
 *
 * Quatro coisas, porque cada uma falha de forma diferente:
 *   - a CLI: `true`/`false`, o ficheiro vazio, e as tres recusas (nunca "false" por nao ter lido);
 *   - o DESVIO face a descoberta da varredura: cada pasta que o `alvosNoDisco` pede, e cada alvo/suite do
 *     `PARES` do template, cai nos prefixos — uma pasta nova na descoberta sem o plano reprova;
 *   - a SOMBRA contra si propria: a regex do `sweep` e a dos `Simuladores` no `ci.yml` real decidem igual ao
 *     plano, num conjunto de caminhos de prova (comparar o texto falhava: o JS escapa a `/`);
 *   - o plano e copiado SOZINHO da base: so pode importar `node:*`.
 * Cada verificacao recebe o que le por parametro, para o seu controlo negativo injectar o caso sintetico.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { PREFIXOS_MAQUINARIA, aplicaVarredura, caminhosDe } from "../lib/plano-ci.mjs";
import { alvosNoDisco } from "../lib/alvos-no-disco.mjs";
import { PARES } from "../lib/pares.mjs";
import { PARES_DO_PROJETO } from "../config/guards-do-projeto.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-plano-ci.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const PLANO = join(ROOT, ".agent/scripts/lib/plano-ci.mjs");

/** Os caminhos que a descoberta devolve com um `listarDir` de STUB: cada pasta pedida da nomes ficticios, logo
 *  uma pasta nova entra mesmo vazia no disco. Devolve os que ficam FORA do plano. */
export function foraDaDescoberta(descobre) {
  const ficticios = ["check-x.mjs", "simulate-x.mjs", "x.mjs"];
  return descobre(() => ficticios).filter((c) => !aplicaVarredura([c]));
}

/** As regex do `grep -qE '...'` que decidem a varredura no `ci.yml` (o `sweep` e os `Simuladores`). */
export const regexDoCi = (ci) => [...ci.matchAll(/grep -qE '([^']+)' <<<"\$tocados"/g)].map((m) => m[1]);

/** Os caminhos de prova: um debaixo de cada prefixo, e os quase-acertos. */
// E caminhos de FORA plausiveis (leitura 2 do C1): um `grep` alargado (`|\.github/`, `|scripts/`) nao divergia nos outros.
const PROVA = [".agent/scripts/a.mjs", ".claude/hooks/a.mjs", ".githooks/a", ".agent/scriptsx/a", "x/.agent/scripts/a", ".claude/hook/a", ".githooksx/a", ".agent/a", "README.md", "src/docs/a.md", ".github/workflows/ci.yml", "scripts/check-x.mjs", ".claude/agents/a.md"];
/** Os problemas de comparar cada regex do `ci.yml` com o plano, pelo comportamento. Menos de duas e um
 *  problema: sem nenhuma, a comparacao passava sem comparar nada (`TP2`). */
export function regexQueDivergem(ci) {
  const rs = regexDoCi(ci);
  // Quantas se esperam vem do ci.yml, e nao de um 2 fixo (TP15): o BOOTSTRAP remove o job `simulators` num
  // derivado, e la ha so a do `sweep`. Com o job, as duas; sem nenhuma, reprova na mesma (zero nao compara nada).
  const esperadas = 1 + (/^  simulators:[ \t]*(?:#.*)?$/m.test(ci) ? 1 : 0);
  if (rs.length < esperadas) return [`o ci.yml tem ${rs.length} regex de \`grep -qE ... <<<"$tocados"\`, e esperava pelo menos ${esperadas} (o \`sweep\`${esperadas > 1 ? " e os `Simuladores`" : ""})`];
  return rs.flatMap((r) => PROVA.filter((c) => new RegExp(r).test(c) !== PREFIXOS_MAQUINARIA.test(c)).map((c) => `a regex '${r}' do ci.yml e o plano decidem diferente em ${c}`));
}

/** Os imports do plano que nao sao `node:*` (estatico e dinamico). */
export const importsNaoNode = (src) => [...src.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((m) => !m.startsWith("node:"));

/** Corre a CLI do plano sobre um ficheiro com `conteudo` (ou sem argumento, com `null`). */
function cli(conteudo, { semArgumento = false, ilegivel = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "plano-ci-test-"));
  try {
    const f = join(dir, "tocados.txt");
    if (conteudo !== null) writeFileSync(f, conteudo);
    const args = semArgumento ? [PLANO] : [PLANO, ilegivel ? join(dir, "nao-existe") : f];
    try {
      return { code: 0, out: execFileSync("node", args, { stdio: "pipe" }).toString().trim() };
    } catch (err) {
      return { code: err.status, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** O plano copiado SOZINHO para uma pasta e corrido ATRAVES de um symlink para ela, como o portao o corre de
 *  `$RUNNER_TEMP` e o teste da sombra do `tmpdir()` do macOS (`/var` aponta para `/private/var`, #366). O
 *  symlink e do proprio teste: sem a correcao reprova em qualquer sistema, e nao so no macOS. */
function cliPorSymlink(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), "plano-ci-test-link-"));
  try {
    const real = join(dir, "real");
    mkdirSync(real);
    copyFileSync(PLANO, join(real, "plano-ci.mjs"));
    symlinkSync(real, join(dir, "link"), "dir");
    writeFileSync(join(dir, "tocados.txt"), conteudo);
    try {
      return { code: 0, out: execFileSync("node", [join(dir, "link", "plano-ci.mjs"), join(dir, "tocados.txt")], { stdio: "pipe" }).toString().trim() };
    } catch (err) {
      return { code: err.status, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const espera = (r, code, out) => (r.code === code && (out === null || r.out === out) ? [] : [`esperava exit ${code}${out === null ? "" : ` e "${out}"`}, veio ${r.code}: ${JSON.stringify(r.out)}`]);
/** Uma recusa, pela SUA mensagem: so o exit 2 deixava passar uma recusa desligada que caia na seguinte (as duas leituras do C1). */
const recusaCom = (r, trecho) => (r.code === 2 && r.out.includes(trecho) ? [] : [`esperava exit 2 com "${trecho}", veio ${r.code}: ${JSON.stringify(r.out)}`]);

export function registar() {
  // --- A CLI ---------------------------------------------------------------------------------------
  registarResultado("plano: maquinaria tocada da `true` (#347)", espera(cli(".agent/scripts/x.mjs\nREADME.md\n"), 0, "true"));
  registarResultado("plano: so docs da `false` (#347)", espera(cli("README.md\nsrc/docs/a.md\n.github/workflows/ci.yml\n"), 0, "false"));
  registarResultado("plano: um ficheiro VAZIO (um PR sem diff) da `false`, sem recusa (#347)", espera(cli(""), 0, "false"));
  registarResultado("plano: uma linha vazia no meio recusa (#347)", recusaCom(cli("a\n\nb\n"), "linha vazia no meio"));
  registarResultado("plano: sem argumento recusa (#347)", recusaCom(cli(null, { semArgumento: true }), "falta o ficheiro"));
  registarResultado("plano: um ficheiro ilegivel recusa (#347)", recusaCom(cli(null, { ilegivel: true }), "nao consegui ler"));
  registarResultado("plano: corrido atraves de um symlink, responde na mesma (#366)", espera(cliPorSymlink(".agent/scripts/x.mjs\n"), 0, "true"));
  registarResultado("plano: caminhosDe aceita o `\\n` final e so ele (#347)", [
    ...(JSON.stringify(caminhosDe("a\nb\n").caminhos) === '["a","b"]' ? [] : ["o `\\n` final nao foi aceite"]),
    ...(caminhosDe("a\n\n").erro ? [] : ["uma linha vazia antes do fim passou"]),
  ]);

  // --- O desvio face a descoberta da varredura ----------------------------------------------------------
  registarResultado("plano: cada caminho que a descoberta da varredura devolve cai nos prefixos (#347)", foraDaDescoberta(alvosNoDisco).map((c) => `fora do plano: ${c}`));
  registarResultado("plano: uma descoberta com uma pasta fora dos prefixos reprova (controlo, #347)", foraDaDescoberta((listar) => listar("scripts").map((f) => `scripts/${f}`)).length > 0 ? [] : ["a pasta `scripts` passou"]);
  const doProjeto = new Set(PARES_DO_PROJETO);
  const doTemplate = PARES.filter((p) => !doProjeto.has(p));
  registarResultado("plano: cada alvo e suite do PARES do template cai nos prefixos (#347)", doTemplate.flatMap((p) => [p.alvo, p.suite]).filter((c) => c && !aplicaVarredura([c])).map((c) => `fora do plano: ${c}`));
  // Os do PROJETO: uma NOTA, e nao um vermelho — o derivado nao tem onde estender os prefixos (vivem num ficheiro
  // do template), e reprovar deixava-o vermelho no `/upgrade` por um buraco que ja existia (2.a passagem, R2-bis).
  const foraDoProjeto = (pares) => pares.flatMap((p) => [p.alvo, p.suite]).filter((c) => c && !aplicaVarredura([c]));
  for (const c of foraDoProjeto(PARES_DO_PROJETO)) console.log(`  NOTE  plano: ${c} (do PARES do projeto) fica fora dos prefixos — a varredura nunca corre num PR que so toque nele`);
  registarResultado("plano: um alvo do projeto fora dos prefixos e nomeado, sem reprovar (#347)", foraDoProjeto([{ alvo: "scripts/check-x.mjs", suite: ".agent/scripts/tests/test-x.mjs" }]).join() === "scripts/check-x.mjs" ? [] : ["o alvo do projeto em `scripts/` nao foi nomeado"]);

  // --- A sombra contra si propria: o `ci.yml` real ----------------------------------------------------
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  registarResultado("plano: as regex do `sweep` e dos `Simuladores` decidem igual ao plano (#347)", regexQueDivergem(ci));
  // Um DERIVADO (o BOOTSTRAP remove o job `simulators`) tem so a regex do `sweep`, e passa (TP15). Os dois casos
  // correm nos DOIS mundos (a TP15 outra vez, na leitura deste PR): com o job, tira-se; sem ele, o `ci` ja e o
  // derivado, e o controlo ACRESCENTA um job `simulators` sem a regex.
  {
    const temSimuladores = /^  simulators:[ \t]*(?:#.*)?$/m.test(ci);
    const semSimuladores = temSimuladores ? ci.replace(/^  simulators:[\s\S]*?(?=^  [\w-]+:[ \t]*(?:#.*)?$)/m, "") : ci;
    const simuladoresSemRegex = temSimuladores
      ? ci.replace(/(^  simulators:[\s\S]*?)grep -qE '[^']+' <<<"\$tocados"/m, "$1true")
      : ci.replace(/^jobs:[ \t]*\n/m, "jobs:\n  simulators:\n    steps:\n      - run: true\n");
    registarResultado("plano: num derivado sem o job `simulators`, a regex do `sweep` chega (TP15, #347)", [
      ...(/^  simulators:[ \t]*(?:#.*)?$/m.test(semSimuladores) ? ["nao consegui tirar o job `simulators`"] : []),
      ...regexQueDivergem(semSimuladores),
    ]);
    registarResultado("plano: com o job `simulators` e sem a regex dele, reprova (controlo, TP15)", simuladoresSemRegex !== ci && regexQueDivergem(simuladoresSemRegex).length > 0 ? [] : ["o job `simulators` sem a regex passou"]);
    // No TEMPLATE o job tem de la estar (leitura do PR): renomea-lo baixava a exigencia para 1 regex em silencio.
    if (!ehDerivado((rel) => leOuNull(join(ROOT, rel))))
      registarResultado("plano: no template, o job `simulators` existe e a sua regex e exigida (TP15)", temSimuladores ? [] : ["o ci.yml do template nao tem o job `simulators`"]);
  }
  // Cada controlo exige que o `replace` MUDOU o texto (#372 A8, `TP15`): num derivado com o `grep` escrito doutra
  // forma, o `ci` ficava igual e o controlo reprovava pela razao errada (ou passava sem comparar nada).
  const mutado = (de, para) => { const m = ci.replace(de, para); return m === ci ? null : m; };
  for (const [nome, para, falha] of [
    ["um prefixo mudado so num sitio do ci.yml reprova (controlo, #347)", "|\\.githook/)'", "a regex mudada passou"],
    ["um `grep` alargado a `.github/` no ci.yml reprova (controlo, #347)", "|\\.githooks/|\\.github/)'", "o grep alargado passou"],
  ]) {
    const m = mutado("|\\.githooks/)'", para);
    registarResultado(`plano: ${nome}`, m === null ? ["o controlo nao mudou o ci.yml: o `grep` nao tem a forma esperada"] : regexQueDivergem(m).length > 0 ? [] : [falha]);
  }
  registarResultado("plano: um ci.yml sem as regex reprova, e nao passa sem comparar (#347)", regexQueDivergem("jobs: {}\n").length > 0 ? [] : ["zero regex passou"]);

  // --- O plano e copiado SOZINHO da base -----------------------------------------------------------------
  registarResultado("plano: o plano-ci.mjs so importa `node:*` (#347)", importsNaoNode(readFileSync(PLANO, "utf8")).map((m) => `importa ${m}: copiado sozinho da base, nao correria`));
  registarResultado("plano: um import relativo reprova (controlo, #347)", importsNaoNode('import { x } from "./x.mjs";\nconst y = await import("../y.mjs");\nimport "./efeito.mjs";\n').length === 3 ? [] : ["os imports relativos nao foram vistos"]);
}
