#!/usr/bin/env node
/**
 * Testes do Test Surface Checker — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS do `check-test-surface.mjs`: por cada forma de enfraquecer a superficie de
 * teste, quebra-a de proposito e exige que o verificador reprove.
 *
 * A fixture e um **repo git real** em `os.tmpdir()` — o verificador pergunta ao git o que
 * mudou desde a baseline, logo simular com ficheiros nao afirmaria nada.
 *
 *   node .agent/scripts/test-test-surface.mjs
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKER = join(ROOT, ".agent/scripts/check-test-surface.mjs");

const git = (dir, args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** Repo com um teste "saudavel" commitado; devolve `{ dir, base }`. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "surface-test-"));
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  copyFileSync(CHECKER, join(dir, ".agent/scripts/check-test-surface.mjs"));
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test("soma", () => { expect(1 + 1).toBe(2); });\n');
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
  return { dir, base: git(dir, ["rev-parse", "HEAD"]) };
}

function commit(dir, msg) {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", msg]);
}

function corre(dir, base) {
  // `base` vazio => corre SEM argumento, que e o unico modo em que a auto-deteccao da
  // baseline esta sob teste. Antes, um `mutate` que devolvesse `null` caia no `?? base` do
  // harness e o teste passava com a baseline explicita — verde sem afirmar nada.
  const args = [join(dir, ".agent/scripts/check-test-surface.mjs"), ...(base ? [base] : [])];
  try {
    return { code: 0, out: execFileSync("node", args, { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

let passed = 0;
const falhas = [];
function test(nome, mutate, expect) {
  const { dir, base } = sandbox();
  try {
    const ref = mutate ? mutate(dir, base) ?? base : base;
    const { code, out } = corre(dir, ref);
    const problemas = [];
    if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
    // Afirmar contra as linhas WARN quando se espera reprovacao: um `includes` sobre o output
    // inteiro seria satisfeito por uma linha OK com o mesmo nome de ficheiro.
    const alvo = expect.code === 0 ? out : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
    for (const s of expect.includes ?? []) if (!alvo.includes(s)) problemas.push(`${expect.code === 0 ? "output" : "linhas WARN"} devia conter "${s}"`);
    for (const s of expect.excludes ?? []) if (out.includes(s)) problemas.push(`output NAO devia conter "${s}"`);
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
}

console.log("\n=== Testes do Test Surface Checker ===\n");

test("baseline: superficie intacta passa", null, {
  code: 0,
  includes: ["Superficie de teste nao enfraquecida"],
  excludes: ["  WARN  "],
});

for (const [nome, conteudo, marca] of [
  ["it.skip", 'test.skip("soma", () => {});\n', "seleccao/desativacao de teste"],
  ["describe.only", 'describe.only("x", () => { test("soma", () => {}); });\n', "seleccao/desativacao de teste"],
  ["xit", 'xit("soma", () => {});\n', "teste desativado (x-prefixo)"],
  ["skip() sem argumento", 'test("soma", () => { return test.skip(); });\n', "skip()/only() sem argumento"],
]) {
  test(`deteta ${nome} acrescentado a um teste`, (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"), conteudo);
    commit(dir, "enfraquecer");
  }, { code: 1, includes: ["tests/exemplo.test.js", marca] });
}

test("deteta @pytest.mark.skip", (dir) => {
  writeFileSync(join(dir, "tests/test_x.py"), "import pytest\n\n@pytest.mark.skip\ndef test_soma():\n    assert 1 + 1 == 2\n");
  commit(dir, "py");
}, { code: 1, includes: ["tests/test_x.py", "marca pytest"] });

test("deteta alteracao a configuracao do runner (estreitar o include)", (dir) => {
  writeFileSync(join(dir, "vitest.config.ts"), 'export default { test: { include: ["tests/so-este.test.js"] } };\n');
  commit(dir, "config");
}, { code: 1, includes: ["vitest.config.ts", "configuracao do runner alterada"] });

test("alteracao a codigo de producao NAO e enfraquecimento", (dir) => {
  mkdirSync(join(dir, "src"), { recursive: true });
  // `.skip(` em codigo de producao — paginacao — nao pode dar falso positivo: as marcas
  // procuram-se **so** na superficie congelada.
  writeFileSync(join(dir, "src/repo.js"), "export const pagina = (q, n) => q.skip(n * 10).limit(10);\n");
  commit(dir, "prod");
}, { code: 0, includes: ["superficie de teste intacta"], excludes: ["  WARN  "] });

test("teste alterado SEM marcas de enfraquecimento passa", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test("soma", () => { expect(2 + 2).toBe(4); });\n');
  commit(dir, "reforcar");
}, { code: 0, includes: ["sem marcas de enfraquecimento"], excludes: ["  WARN  "] });

test("marca que JA existia na baseline nao conta como nova", (dir, base) => {
  // A marca entra na baseline; depois muda-se outra coisa no mesmo ficheiro.
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test.skip("soma", () => {});\n');
  commit(dir, "com skip");
  const novaBase = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test.skip("soma", () => { expect(1).toBe(1); });\n');
  commit(dir, "editar outra coisa");
  return novaBase;
}, { code: 0, includes: ["sem marcas de enfraquecimento"], excludes: ["  WARN  "] });

test("deteta um ficheiro de teste APAGADO (a forma mais brutal)", (dir) => {
  rmSync(join(dir, "tests/exemplo.test.js"));
  commit(dir, "apagar o teste");
}, { code: 1, includes: ["tests/exemplo.test.js", "APAGADO"] });

test("baseline que nao resolve REPROVA (nao pode dar OK)", () => "ref-que-nao-existe-123", {
  code: 1,
  includes: ["nao resolve"],
  excludes: ["Superficie de teste nao enfraquecida"],
});

// --- Os globs tem de ver as suites que ESTE repo nomeia pelo prefixo ----------
// Medido antes da correcao: quase todas as suites deste repo eram invisiveis aos globs, e
// apagar todas dava "superficie de teste intacta" com exit 0. (A fracao exata nao se escreve
// — foi escrita errada tres vezes; conta-se com `git ls-files`.)

test("glob: suite nomeada pelo prefixo (test-x.mjs) esta na superficie", (dir) => {
  writeFileSync(join(dir, ".agent/scripts/test-guards.mjs"), 'test("a", () => { expect(1).toBe(1); });\n');
  commit(dir, "add suite com nome de prefixo");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  rmSync(join(dir, ".agent/scripts/test-guards.mjs"));
  return ref;
}, { code: 1, includes: ["test-guards.mjs", "APAGADO"] });

test("glob: suite nomeada tests-x.mjs (plural) tambem", (dir) => {
  writeFileSync(join(dir, ".agent/scripts/tests-settings.mjs"), 'test("a", () => { expect(1).toBe(1); });\n');
  commit(dir, "add suite plural");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  rmSync(join(dir, ".agent/scripts/tests-settings.mjs"));
  return ref;
}, { code: 1, includes: ["tests-settings.mjs", "APAGADO"] });

// --- Esvaziar nao deixa marca de `skip` para tras (invariante 5 do AP4) -------

test("contagem: casos de teste apagados sem nenhuma marca reprovam", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"), "// suite esvaziada, sem skip nenhum\n");
  commit(dir, "esvaziar");
}, { code: 1, includes: ["casos de teste: 1 -> 0", "assercoes (expect/assert): 1 -> 0"] });

test("contagem: acrescentar testes NAO e enfraquecimento", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test("a", () => { expect(1).toBe(1); });\ntest("b", () => { expect(2).toBe(2); });\n');
  commit(dir, "mais testes");
}, { code: 0 });

// --- Medir a arvore de trabalho: "correr antes de commit" tem de medir algo ---
// Com `${base}..HEAD` o verificador ignorava tudo o que nao estivesse commitado, ou seja
// exatamente o que se estava a preparar para commitar.

test("arvore: enfraquecer SEM commitar e detetado", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test.skip("soma", () => { expect(1 + 1).toBe(2); });\n');
  // de proposito sem commit
}, { code: 1, includes: ["seleccao/desativacao de teste"] });

test("arvore: apagar um teste SEM commitar e detetado", (dir) => {
  rmSync(join(dir, "tests/exemplo.test.js"));
  // de proposito sem commit
}, { code: 1, includes: ["APAGADO"] });

// --- O dia 1 de um projeto DERIVADO ------------------------------------------
// Um clone tem o branch de trabalho e `origin/main`, mas nao `main` LOCAL. Sem os candidatos
// remote-tracking o verificador nao conseguia medir e saia `!= 0` em todo o projeto derivado
// — verde no template, vermelho no consumidor. E o `AP3`.

test("derivado: sem main LOCAL mas com origin/main, consegue medir", (dir) => {
  // Simular um clone: renomear o branch e criar o ref remoto a apontar para a baseline.
  const sha = git(dir, ["rev-parse", "HEAD"]);
  git(dir, ["branch", "-m", "main", "fix/algo"]);
  git(dir, ["update-ref", "refs/remotes/origin/main", sha]);
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test.skip("soma", () => { expect(1 + 1).toBe(2); });\n');
  commit(dir, "enfraquecer");
  return ""; // string vazia => corre SEM argumento: e a auto-deteccao que esta sob teste
}, { code: 1, includes: ["seleccao/desativacao de teste"] });

// --- Uma marca dentro de aspas e dados, nao uma diretiva ---------------------
// Medido num projeto derivado: a suite DESTE verificador tem `test.skip(...)` dentro de
// fixtures, e o gate sinalizava-a a si propria — exit 1 em trabalho legitimo.

test("marca dentro de uma STRING nao e enfraquecimento", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test("soma", () => { expect(1 + 1).toBe(2); });\n' +
    'test("fixture", () => { const fonte = \'test.skip("x", () => {});\'; expect(fonte).toBeTruthy(); });\n');
  commit(dir, "fixture com a marca em string");
}, { code: 0 });

test("marca FORA das aspas continua a ser apanhada", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test.skip("soma", () => { expect(1 + 1).toBe(2); });\n');
  commit(dir, "skip a serio");
}, { code: 1, includes: ["seleccao/desativacao de teste"] });

test("marca depois de aspas ESCAPADAS nao e enfraquecimento", (dir) => {
  // Um `\\"` dentro de uma string desalinha um emparelhamento ingenuo e expoe a marca
  // seguinte. Foi assim que a suite deste verificador se sinalizou a si mesma.
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test("soma", () => { expect(1).toBe(1); });\n' +
    'const doc = "escreve \\"test.skip(\\" para desativar";\n');
  commit(dir, "fixture com aspas escapadas");
}, { code: 0 });

// --- "Nao consegui medir" tem de REPROVAR, nao dar OK ------------------------
// A varredura de mutacao apontou estes dois sitios como descobertos: um verificador que nao
// sabe responder e o caso mais perigoso, porque o exit 0 parece uma aprovacao.

test("nao consegue medir: sem branch principal nem origin/ REPROVA", (dir) => {
  git(dir, ["branch", "-m", "main", "trabalho"]);
  return ""; // corre sem baseline: e a auto-deteccao que falha
}, { code: 1, includes: ["nao encontrei um branch principal"] });

test("nao consegue medir: index corrompido REPROVA em vez de dar OK", (dir, base) => {
  // O `rev-parse` nao le o index, logo a baseline resolve; o `git diff` le, e falha. E a
  // unica forma deterministica de separar "a baseline nao resolve" de "nao consigo listar".
  writeFileSync(join(dir, ".git/index"), "isto nao e um index valido");
  return base;
}, { code: 1, includes: ["nao conseguiu listar as alteracoes"] });

// --- O vocabulario de assercao DESTE repo, e a configuracao que o seleciona --------
// Duas provas de uma segunda leitura independente. A primeira era o defeito mais caro: a
// contagem de assercoes media `expect(`/`assert(`, que aparecem **zero vezes** nas 10 suites
// deste repo, logo esvaziar 55 `includes: [...]` passava com exit 0.

test("assercao: esvaziar um includes: [...] faz a contagem descer", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test("a", null, { code: 1, includes: ["x"] });\ntest("b", null, { code: 1, includes: ["y"] });\n');
  commit(dir, "suite com assercoes em dados");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test("a", null, { code: 1, includes: [] });\ntest("b", null, { code: 1, includes: [] });\n');
  commit(dir, "esvaziar as assercoes");
  return ref;
}, { code: 1, includes: ["assercoes (includes/excludes): 2 -> 0"] });

test("config: apagar um step de teste do CI faz a contagem descer", (dir) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"),
    "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n      - run: node b-test.mjs\n");
  commit(dir, "ci com dois steps");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"),
    "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
  commit(dir, "apagar um step");
  return ref;
}, { code: 1, includes: ["steps de teste no CI: 2 -> 1"] });

test("config: apagar um par da varredura faz a contagem descer", (dir) => {
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  writeFileSync(join(dir, ".agent/scripts/mutation-sweep.mjs"),
    'const PARES = [\n  { alvo: "a.mjs" },\n  { alvo: "b.mjs" },\n];\n');
  commit(dir, "dois pares");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".agent/scripts/mutation-sweep.mjs"), 'const PARES = [\n  { alvo: "a.mjs" },\n];\n');
  commit(dir, "um par");
  return ref;
}, { code: 1, includes: ["pares alvo/suite da varredura: 2 -> 1"] });

test("nao consegue medir: detached HEAD diz o que se passa, nao culpa a baseline", (dir) => {
  git(dir, ["checkout", "-q", "--detach", "HEAD"]);
  return ""; // sem baseline: e a auto-deteccao que tem de explicar-se
}, { code: 1, includes: ["detached"] });

// --- Um workflow que nao corre testes nao e configuracao de runner -----------
// Medido num projeto derivado: com todos os `.github/workflows/*.yml` em `CONFIG_GLOBS`,
// mexer no `dependabot-auto-merge.yml` ou no `e2e.yml` dava WARN e exit 1. Dois falsos
// positivos a fechar o gate por ficheiros que nao selecionam teste nenhum.

test("workflow do CI sem steps de teste nao pede confirmacao", (dir) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/deploy.yml"), "jobs:\n  d:\n    steps:\n      - run: echo deploy\n");
  commit(dir, "workflow sem testes");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/deploy.yml"), "jobs:\n  d:\n    steps:\n      - run: echo outra coisa\n");
  commit(dir, "mexer nele");
  return ref;
}, { code: 0 });

test("workflow COM steps de teste continua a ser medido por contagem", (dir) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"),
    "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n      - run: node b-test.mjs\n");
  commit(dir, "ci com dois steps");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
  commit(dir, "apagar um");
  return ref;
}, { code: 1, includes: ["steps de teste no CI: 2 -> 1"] });

// --- As formas que nao movem nenhuma contagem obvia ---------------------------
// Achados de uma terceira leitura independente. Todos passavam com exit 0.

test("neutralizar um step do CI com `|| true` e enfraquecimento", (dir) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
  commit(dir, "ci");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs || true\n");
  commit(dir, "neutralizar");
  return ref;
}, { code: 1, includes: ["|| true"] });

test("`continue-on-error: true` num step e enfraquecimento", (dir) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
  commit(dir, "ci");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"),
    "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        continue-on-error: true\n");
  commit(dir, "continue-on-error");
  return ref;
}, { code: 1, includes: ["continue-on-error"] });

test("uma condicao `if:` qualquer num step e enfraquecimento", (dir) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
  commit(dir, "ci");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"),
    "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: false\n");
  commit(dir, "gate");
  return ref;
}, { code: 1, includes: ["condicao `if:`"] });

// O CONTROLO que faltava, e e ele que prova a excecao: sem este caso, ela pode estar escrita
// e nao excluir nada — foi exactamente o que aconteceu. Duas falhas empilhadas mantiveram-na
// morta (o `\s*` a recuar a largura zero, e o `semStrings` a apagar o literal citado) e a
// varredura de mutacao nao as via, porque uma entrada de tabela nao e um sitio de aviso.
test("`if: github.event_name == 'pull_request'` NAO e enfraquecimento", (dir) => {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
  commit(dir, "ci");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"),
    "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: github.event_name == 'pull_request'\n");
  commit(dir, "gate por evento");
  return ref;
}, { code: 0, excludes: ["condicao `if:`"] });

test("tornar o veredicto do runner inalcancavel e enfraquecimento", (dir) => {
  // `if (failures.length) {` -> `if (false) {`: o `process.exit(1)` fica **la** e portanto a
  // contagem dele nao se move. O que desaparece e a referencia a contagem de falhas.
  writeFileSync(join(dir, ".agent/scripts/test-harness.mjs"),
    "const failures = [];\nif (failures.length) {\n  process.exit(1);\n}\n");
  commit(dir, "harness");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".agent/scripts/test-harness.mjs"),
    "const failures = [];\nif (false) {\n  process.exit(1);\n}\n");
  commit(dir, "desligar o veredicto");
  return ref;
}, { code: 1, includes: ["condicao literalmente falsa", "contagem de falhas: 1 -> 0"] });

test("despromover um warn a note num guard e enfraquecimento", (dir) => {
  mkdirSync(join(dir, ".agent/scripts/guards"), { recursive: true });
  writeFileSync(join(dir, ".agent/scripts/guards/x.mjs"), 'warn("a");\nwarn("b");\n');
  commit(dir, "guard com dois avisos");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".agent/scripts/guards/x.mjs"), 'warn("a");\nnote("b");\n');
  commit(dir, "despromover um");
  return ref;
}, { code: 1, includes: ["sitios de aviso: 2 -> 1"] });

// --- O AP2 aplicado ao proprio verificador -----------------------------------
test("TEST_GLOBS que nao casam nada na baseline REPROVAM, em vez de dizer intacta", (dir) => {
  const p = join(dir, ".agent/scripts/check-test-surface.mjs");
  const s = readFileSync(p, "utf8");
  const i = s.indexOf("const TEST_GLOBS = [");
  const j = s.indexOf("];", i);
  writeFileSync(p, s.slice(0, i) + "const TEST_GLOBS = [/__nunca_casa__/" + s.slice(j));
}, { code: 1, includes: ["nao casam nenhum ficheiro de teste"] });

test("nao consegue medir: arvore da baseline ausente REPROVA", (dir) => {
  // O commit resolve (`rev-parse --verify` le o objeto commit) mas o `ls-tree` precisa da
  // ARVORE. Apagar o objeto solto da arvore separa "nao ha superficie" de "nao consegui
  // ler" — a distincao que o `AP2` exige.
  const tree = git(dir, ["rev-parse", "HEAD^{tree}"]);
  rmSync(join(dir, ".git/objects", tree.slice(0, 2), tree.slice(2)), { force: true });
  return "HEAD";
}, { code: 1, includes: ["nao conseguiu listar os ficheiros da baseline"] });

// --- `pyproject.toml` traz muito mais que a selecao de testes ----------------
// Medido: com ele em `CONFIG_GLOBS`, um bump de versao ou de dependencias dava exit 1 em
// qualquer projeto Python — a mesma classe de falso positivo que ja se removeu para os
// workflows do `.github/`.

test("pyproject: bump de versao/deps NAO e enfraquecimento", (dir) => {
  writeFileSync(join(dir, "pyproject.toml"),
    '[project]\nname = "x"\nversion = "0.1.0"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n');
  commit(dir, "pyproject");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "pyproject.toml"),
    '[project]\nname = "x"\nversion = "0.2.0"\ndependencies = ["httpx"]\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n');
  commit(dir, "bump");
  return ref;
}, { code: 0 });

test("pyproject: estreitar o testpaths E enfraquecimento", (dir) => {
  writeFileSync(join(dir, "pyproject.toml"),
    '[tool.pytest.ini_options]\ntestpaths = ["tests"]\naddopts = "-ra"\n');
  commit(dir, "pyproject");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "pyproject.toml"), '[tool.pytest.ini_options]\naddopts = "-ra"\n');
  commit(dir, "estreitar");
  return ref;
}, { code: 1, includes: ["selecao de testes do pytest: 2 -> 1"] });

// --- Os quatro que faltavam da terceira leitura -------------------------------

test("untracked: um config novo que estreita a selecao NAO escapa", (dir) => {
  // `git diff` nao lista nao-rastreados, logo isto passava sem aviso enquanto nao fosse ao
  // `git add` — e a afirmacao "compara com a arvore de trabalho" so valia para rastreados.
  writeFileSync(join(dir, "vitest.config.ts"), 'export default { test: { include: ["tests/so-um.test.js"] } };\n');
  // de proposito SEM git add
}, { code: 1, includes: ["vitest.config.ts"] });

test("blob da baseline ausente REPROVA (e nao trata o ficheiro como novo)", (dir) => {
  // Apagar o objeto do blob: o `git diff` tambem precisa dele para comparar, logo falha
  // primeiro — e o que se afirma e que o verificador **reprova por nao conseguir medir**, em
  // vez de tratar o ficheiro como novo e dar exit 0 sobre uma suite esvaziada.
  const blob = git(dir, ["rev-parse", "HEAD:tests/exemplo.test.js"]);
  rmSync(join(dir, ".git/objects", blob.slice(0, 2), blob.slice(2)), { force: true });
  writeFileSync(join(dir, "tests/exemplo.test.js"), 'test("soma", () => { expect(1).toBe(1); });\n');
  return "HEAD";
}, { code: 1, includes: ["nao conseguiu listar as alteracoes"] });

test("skipIf do vitest e apanhado (o \\b falhava antes do If)", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test.skipIf(true)("soma", () => { expect(1 + 1).toBe(2); });\n');
  commit(dir, "skipIf");
}, { code: 1, includes: ["skipIf"] });

test("tabela `each` esvaziada faz a contagem descer", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test.each([[1], [2]])("caso %i", (n) => { expect(n).toBeTruthy(); });\n');
  commit(dir, "each com tabela");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    'test.each([])("caso %i", (n) => { expect(n).toBeTruthy(); });\n');
  commit(dir, "esvaziar a tabela");
  return ref;
}, { code: 1, includes: ["tabelas `each` nao vazias: 1 -> 0"] });

test("apostrofo num comentario nao dessincroniza a contagem", (dir) => {
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    "// nota: don't skip isto\ntest(\"a\", () => { expect(1).toBe(1); });\ntest(\"b\", () => { expect(2).toBe(2); });\n");
  commit(dir, "com comentario");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "tests/exemplo.test.js"),
    "// nota: don't skip isto, e nao mexer\ntest(\"a\", () => { expect(1).toBe(1); });\ntest(\"b\", () => { expect(2).toBe(2); });\n");
  commit(dir, "editar o comentario");
  return ref;
}, { code: 0 });

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
