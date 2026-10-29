/**
 * Harness dos testes do Test Surface Checker — {{PROJECT_NAME}}
 *
 * A fixture e um **repo git real** em `os.tmpdir()`: o verificador pergunta ao git o que mudou
 * desde a baseline, logo simular com ficheiros nao afirmaria nada.
 *
 * Extraido quando o `test-test-surface.mjs` passou o flag das 500 linhas. Mesmo desenho do
 * `test-harness.mjs`: o `resumo()` vive **aqui** porque `passed`/`falhas` sao deste modulo —
 * exportar contadores mutaveis daria bindings so-leitura e o resumo ficaria sempre a zero.
 *
 * NAO e um entry point: corre por importacao a partir do `test-test-surface.mjs`.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, cpSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join, sep } from "path";
// O modo fail-fast lido do MESMO sitio que o motor escreve (#157, `TP8`).
import { FAIL_FAST } from "./relatorio.mjs";
import { ISOLADO } from "./repo-descartavel.mjs";
import { TEST_GLOBS_DO_PROJETO, CONFIG_GLOBS_DO_PROJETO } from "../../config/superficie-de-teste.mjs";
import { ehDerivado } from "../../lib/derivado.mjs";
import { CONTAGENS } from "../../lib/surface-patterns.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CHECKER = join(ROOT, ".agent/scripts/check-test-surface.mjs");
/** Os modulos que o CHECKER importa, DERIVADOS dele e nao enumerados.
 *
 *  A versao anterior era uma lista a mao com uma instrucao ao lado — *"acrescentar aqui
 *  qualquer modulo novo que o verificador passe a importar"* — e a instrucao nao chegou: a
 *  lista envelheceu **duas** vezes. Da primeira, ao extrair as tabelas de padroes para
 *  `surface-patterns.mjs`, a sandbox deixou de resolver o import e **61 assercoes falharam de
 *  uma vez**; da segunda, ao extrair a resolucao da baseline. Nas duas, a mensagem foi
 *  `ERR_MODULE_NOT_FOUND` sobre um caminho dentro de uma pasta temporaria — nada que aponte
 *  para "a fixture esta incompleta", e das duas vezes o defeito foi procurado no verificador.
 *
 *  EM PROFUNDIDADE, e nao so um nivel: hoje nenhum dos dois modulos importa de `./`, mas o
 *  `lib/derivado-maduro.mjs` importa `patch.mjs` e `ficheiros.mjs` — o caso transitivo ja
 *  existe no repo e chega aqui a primeira extracao que o traga.
 *
 *  So imports RELATIVOS: `fs`, `path` e companhia resolvem-se sozinhos na sandbox. */
export function modulosImportadosPor(rel, raiz = ROOT, vistos = new Set()) {
  // `raiz` e parametro para o teste poder montar uma arvore sintetica. Sem isso, o unico teste
  // possivel era contra este repo — e um teste que le o repo nao distingue derivar de acertar
  // por acaso no que hoje la esta (`TP3`).
  if (vistos.has(rel)) return vistos;
  vistos.add(rel);
  const src = readFileSync(join(raiz, rel), "utf8");
  for (const m of src.matchAll(/^\s*import\s[^"']*from\s*["'](\.[^"']+)["']/gm)) {
    // O caminho e relativo ao ficheiro que importa, nunca a raiz: aritmetica sobre a string
    // funcionava para `./lib/x` e mentia para `../lib/x`.
    const alvo = join(dirname(rel), m[1]).split(sep).join("/");
    modulosImportadosPor(alvo, raiz, vistos);
  }
  return vistos;
}

/** O checker sai do conjunto: ele e copiado a parte, para o seu proprio caminho. */
export const CHECKER_MODULOS = [...modulosImportadosPor(".agent/scripts/check-test-surface.mjs")].filter(
  (f) => f !== ".agent/scripts/check-test-surface.mjs"
);

/** O git da FIXTURE e o do verificador, sem a configuracao de quem corre (#379): a do runner pode decidir quando
 *  o git empacota objetos, e os casos que apagam um objeto solto falhariam numa maquina e nao noutra (`TP3`).
 *  E PREVENTIVO, nao demonstrado: o log do flake so mostrava os nomes dos casos, e com a config por omissao um repo
 *  desta dimensao nunca se empacota sozinho. O que fica provado e a DETECCAO (`apagaObjetoSolto`). */
const git = (dir, args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, ...ISOLADO } }).trim();

/**
 * Apaga o objeto SOLTO `sha` do repo da fixture, para fingir uma baseline ilegivel, e confirma que desapareceu.
 * Um `rmSync` com `force` sobre um objeto que o git empacotou nao apaga nada e nao o diz: o caso via a baseline
 * legivel e falhava sem defeito (#379). Aqui a fixture diz que e ela que esta invalida, e nao o verificador.
 */
function apagaObjetoSolto(dir, sha) {
  rmSync(join(dir, ".git/objects", sha.slice(0, 2), sha.slice(2)), { force: true });
  let existe = true;
  try {
    execFileSync("git", ["cat-file", "-e", sha], { cwd: dir, stdio: "ignore", env: { ...process.env, ...ISOLADO } });
  } catch (err) {
    // So o exit 1 e "o objeto nao existe"; o 128 (repo partido, sha invalido) e outra coisa, e falhava aberto.
    if (err.status !== 1) throw err;
    existe = false;
  }
  if (existe) throw new Error(`fixture invalida: o objeto ${sha.slice(0, 12)} nao estava solto (o git empacotou-o) — o caso nao mediria nada`);
}

/** O repo-modelo, montado UMA vez por processo e copiado para cada teste (#308). Montar de raiz
 *  custava ~66 ms por teste (quatro processos git), copiar ~8 ms — e a varredura de mutacao corre
 *  esta suite uma vez por mutante. O mesmo prefixo das fixtures: um modelo de uma corrida morta a
 *  meio e apanhado pelo `limpaTmpsAntigos`, como elas. */
let modelo = null;

/** Repo com um teste "saudavel" commitado; devolve `{ dir, base }`. Uma COPIA do modelo, `.git`
 *  incluido: o teste muta-a a vontade, e o modelo fica intacto para o seguinte. */
function sandbox() {
  if (!modelo) {
    modelo = montaModelo();
    process.on("exit", () => rmSync(modelo.dir, { recursive: true, force: true }));
  }
  const dir = mkdtempSync(join(tmpdir(), "surface-test-"));
  cpSync(modelo.dir, dir, { recursive: true });
  return { dir, base: modelo.base };
}

function montaModelo() {
  const dir = mkdtempSync(join(tmpdir(), "surface-test-"));
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  // As suites vivem em `tests/`: a pasta cria-se AQUI, uma vez, e nao em cada fixture que la
  // escreva. Espalhada pelas fixtures, bastava uma esquecer-se para o teste rebentar com um
  // ENOENT que fala do ficheiro e nao da pasta que falta.
  mkdirSync(join(dir, ".agent/scripts/tests/harness"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  copyFileSync(CHECKER, join(dir, ".agent/scripts/check-test-surface.mjs"));
  // A pasta do modulo tem de existir ANTES da copia: o `surface-patterns.mjs` mudou-se para
  // `lib/` e o `copyFileSync` nao cria diretorios — rebentava com um ENOENT que fala do ficheiro
  // de destino, nao da pasta que falta.
  for (const m of CHECKER_MODULOS) {
    mkdirSync(dirname(join(dir, m)), { recursive: true });
    copyFileSync(join(ROOT, m), join(dir, m));
  }
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test("soma", () => { expect(1 + 1).toBe(2); });\n');
  git(dir, ["init", "-q", "-b", "main"]);
  // Nada se empacota sozinho (#379): os casos que apagam um objeto solto precisam dele solto. O `maintenance.auto`
  // tambem, porque o `gc.auto` so desliga a tarefa `gc` da manutencao automatica.
  git(dir, ["config", "gc.auto", "0"]);
  git(dir, ["config", "maintenance.auto", "false"]);
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
  return { dir, base: git(dir, ["rev-parse", "HEAD"]) };
}

function commit(dir, msg) {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", msg]);
}

function corre(dir, base, env = {}) {
  // `base` vazio => corre SEM argumento, que e o unico modo em que a auto-deteccao da
  // baseline esta sob teste. Antes, um `mutate` que devolvesse `null` caia no `?? base` do
  // harness e o teste passava com a baseline explicita — verde sem afirmar nada.
  const args = [join(dir, ".agent/scripts/check-test-surface.mjs"), ...(base ? [base] : [])];
  try {
    // O `GITHUB_REPOSITORY` sai do ambiente (o CI define-o, a maquina local nao): um teste que
    // dependa dele declara-o em `env`, e da o mesmo resultado nos dois sitios (#277).
    // E a config git GLOBAL tambem: um `url.*.insteadOf` reescrevia o `origin` que o verificador le.
    const herdado = { ...process.env };
    delete herdado.GITHUB_REPOSITORY;
    return { code: 0, out: execFileSync("node", args, { cwd: dir, encoding: "utf8", env: { ...herdado, ...ISOLADO, ...env } }) };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

let passed = 0;
const falhas = [];

/** Total de testes ja corridos. Usado pelo registo por descoberta para medir o
 *  contributo de cada modulo `tests-*.mjs`. */
export const contagem = () => passed + falhas.length;
/**
 * O VEREDICTO, isolado do que o produz — o mesmo desenho do `test-harness.mjs`, e pela mesma
 * razao: a varredura de mutacao mediu **0 de 3** sitios aqui. Desligar uma destas assercoes
 * so torna os 66 testes da superficie mais permissivos, e nada fica vermelho.
 *
 * Pura, pode ser chamada com entradas fabricadas — e e o que o `tests-surface-self.mjs` faz.
 */
export function avaliar({ code, out, expect }) {
  const problemas = [];
  if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
  // Afirmar contra as linhas WARN quando se espera reprovacao: um `includes` sobre o output
  // inteiro seria satisfeito por uma linha OK com o mesmo nome de ficheiro.
  const alvo = expect.code === 0 ? out : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
  for (const s of expect.includes ?? []) if (!alvo.includes(s)) problemas.push(`${expect.code === 0 ? "output" : "linhas WARN"} devia conter "${s}"`);
  for (const s of expect.excludes ?? []) if (out.includes(s)) problemas.push(`output NAO devia conter "${s}"`);
  return problemas;
}

/** Regista um resultado ja avaliado (usado pelos testes do proprio harness). */
export function registarResultado(nome, problemas, out) {
  if (problemas.length) {
    falhas.push({ nome, problemas, out });
    console.log(`  FAIL  ${nome}`);
    for (const p of problemas) console.log(`          ${p}`);
    if (FAIL_FAST) resumo();
  } else {
    passed++;
    console.log(`  PASS  ${nome}`);
  }
}

function test(nome, mutate, expect, { env } = {}) {
  const { dir, base } = sandbox();
  try {
    let problemas;
    let out = "";
    // Um `throw` no `mutate` (a fixture que se declara invalida, #379) e um FAIL com o nome do caso, e a suite
    // continua: sem o `catch`, rebentava a suite inteira, sem `resumo()` nem a linha `FAIL` que a varredura procura.
    try {
      const ref = mutate ? mutate(dir, base) ?? base : base;
      const r = corre(dir, ref, env);
      out = r.out;
      problemas = avaliar({ code: r.code, out, expect });
    } catch (err) {
      problemas = [`setup rebentou: ${err instanceof Error ? err.message : String(err)}`];
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
  // FAIL-FAST (#157): fora do `try`, DEPOIS do `finally` — sair la dentro deixava a sandbox.
  if (FAIL_FAST && falhas.length) resumo();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "test-surface-harness.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/**
 * Regista os testes de UM glob por omissao da `config/superficie-de-teste.mjs` — so se la estiver.
 *
 * A config e do PROJETO: cada derivado adapta-a, e o `/upgrade` nunca a substitui. Um teste fixo
 * para um glob do template reprovava num derivado que o tivesse mudado (`TP3`). Por isso o glob
 * chaveia-se pelo TEXTO: presente, correm os testes; ausente num DERIVADO, SKIP visivel (o teste
 * passa a ser dele, e nada o verifica — a linha SKIP e o unico aviso); ausente no TEMPLATE, FAIL,
 * porque um default em falta e defeito. A primeira versao saltava sempre, e desligar um glob (que
 * lhe muda o texto) lia-se como "adaptado": 7 de 8 a descoberto, com a suite verde (#183).
 */
function seOGlobExistir(glob, nome, regista) {
  return seExistir([...TEST_GLOBS_DO_PROJETO, ...CONFIG_GLOBS_DO_PROJETO].map(String).includes(glob), nome, regista, {
    skip: `glob ${glob} adaptado pelo projeto: o teste e dele (tests-surface-*.mjs)`,
    falta: `o glob por omissao ${glob} saiu da config do TEMPLATE — repor, ou mudar este teste com ele`,
  });
}

/**
 * O mesmo para UMA entrada das `CONTAGENS` (#359): a constante e do projeto (o `/upgrade` preserva a de um
 * derivado que a mudou), mas os `tests-surface-*.mjs` sao do template e chegam-lhe. Chaveia so pela `msg`, e
 * nao pela regex: presente, os casos correm contra a regex que o projeto TIVER. Chavear tambem pela regex (a
 * primeira versao) tornava a varredura vacua — o neutro dela muda a regex, e a guarda reprovava (template) ou
 * saltava (derivado: o mutante sobrevivia) antes de qualquer caso de comportamento correr (as duas leituras).
 * O custo, assumido: um derivado que ADAPTE a regex muda-lhe tambem a `msg`, e os casos daqui passam a SKIP.
 */
function seAContagemExistir(msg, nome, regista, { contagens = CONTAGENS, ...deps } = {}) {
  return seExistir(contagens.some((c) => c.msg === msg), nome, regista, {
    skip: `a entrada "${msg}" das CONTAGENS foi adaptada pelo projeto: o teste e dele (tests-surface-*.mjs)`,
    falta: `a entrada "${msg}" saiu das CONTAGENS do TEMPLATE — repor, ou mudar este teste com ela`,
  }, deps);
}

/** Os tres ramos das duas guardas acima. Devolve o ramo, para os testes do proprio harness; as dependencias
 *  injetam-se pela mesma razao. */
function seExistir(presente, nome, regista, textos, {
  ler = (rel) => { try { return readFileSync(join(ROOT, rel), "utf8"); } catch { return null; } },
  derivado = ehDerivado, falha = registarResultado, log = console.log,
} = {}) {
  if (presente) { regista(); return "corre"; }
  if (derivado(ler)) { log(`  SKIP  ${nome} — ${textos.skip}`); return "skip"; }
  falha(nome, [textos.falta]);
  return "falta";
}

/** Uma chave irma LOGO DEPOIS de um `if:` nas fixtures: o lookahead da continuacao YAML tem de a
 *  deixar passar. Sem ela, um lookahead alargado passava a suite inteira (auditoria do #277). */
const DEPOIS_DO_IF = "        with:\n          a: b\n";

export { test, sandbox, commit, corre, git, apagaObjetoSolto, ROOT, CHECKER, seOGlobExistir, seAContagemExistir, DEPOIS_DO_IF };

/** Imprime o resumo e sai. Ver a nota no cabecalho sobre porque vive aqui. */
export function resumo() {
  console.log("");
  console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
  console.log("");
  if (falhas.length) {
    for (const { nome, out } of falhas) {
      console.log(`--- output de "${nome}" ---`);
      console.log(out);
    }
    console.log("  Ha testes do test-surface checker a falhar.\n");
    process.exit(1);
  }
  console.log("  Todos os testes do test-surface checker passaram.\n");
}
