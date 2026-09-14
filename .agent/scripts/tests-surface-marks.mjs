/**
 * Testes das MARCAS de enfraquecimento — {{PROJECT_NAME}}
 *
 * As formas que **nao movem nenhuma contagem obvia**: neutralizar um step de CI, gatear uma
 * condicao, tornar o veredicto do runner inalcancavel. Sao as mais subtis, e por isso as mais
 * numerosas — juntas passavam o `test-test-surface.mjs` do flag das 500 linhas.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git } from "./test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-marks.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Obrigatorio: dois entry points partilham
 *  a pasta `.agent/scripts/`, e a descoberta em disco precisa de saber de quem e
 *  cada modulo. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
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

  // O CONTROLO do controlo: a excecao tem de excluir **so** o gating em `pull_request`. Gated a
  // `push`, o step deixa de correr em PRs — e isso E enfraquecimento. A primeira correcao desta
  // entrada ancorava em `github.event_name` e excluia os dois, porque no texto normalizado
  // `'pull_request'` e `'push'` sao a mesma string; foi o que obrigou a flag `cru`.
  test("`if: github.event_name == 'push'` E enfraquecimento (deixa de correr em PRs)", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".github/workflows/ci.yml"),
      "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: github.event_name == 'push'\n");
    commit(dir, "gated a push");
    return ref;
  }, { code: 1, includes: ["condicao `if:`"] });

  // As duas formas SEM espacos a volta do `==`. As expressoes do GitHub Actions nao exigem
  // espacos, e a excecao exigia exactamente um de cada lado — logo um `ci.yml` legitimo levava
  // WARN e exit 1. O par tem de andar junto: o caso do `push` e o que impede a "correcao" obvia
  // do falso positivo (alargar o lookahead para `github\.event_name` sozinho), que foi
  // exactamente a correcao errada de uma ronda anterior.
  test("`if: github.event_name=='pull_request'` (sem espacos) NAO e enfraquecimento", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".github/workflows/ci.yml"),
      "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: github.event_name=='pull_request'\n");
    commit(dir, "gate por evento, sem espacos");
    return ref;
  }, { code: 0, excludes: ["condicao `if:`"] });

  test("`if: github.event_name=='push'` (sem espacos) E enfraquecimento", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".github/workflows/ci.yml"),
      "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: github.event_name=='push'\n");
    commit(dir, "gated a push, sem espacos");
    return ref;
  }, { code: 1, includes: ["condicao `if:`"] });

  // As formas COM WRAPPER: `${{ … }}` (a mais idiomatica de GHA) e o escalar YAML entre aspas.
  // Cada forma leva o seu par: a variante `pull_request` tem de ser excluida e a variante `push`
  // tem de contar. Sem o par, alargar o lookahead "resolve" o falso positivo desligando tambem
  // a deteccao — e um lookahead mais permissivo e exactamente onde isso passa despercebido.
  //
  // Fabrica os dois commits e devolve a baseline. So o texto do `if:` varia, logo o que o teste
  // mede e a excecao e nada mais.
  const gatedPor = (dir, cond) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".github/workflows/ci.yml"),
      `jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: ${cond}\n`);
    commit(dir, `gate ${cond}`);
    return ref;
  };

  test("`if: ${{ … == 'pull_request' }}` NAO e enfraquecimento", (dir) => {
    return gatedPor(dir, "${{ github.event_name == 'pull_request' }}");
  }, { code: 0, excludes: ["condicao `if:`"] });

  test("`if: ${{ … == 'push' }}` E enfraquecimento", (dir) => {
    return gatedPor(dir, "${{ github.event_name == 'push' }}");
  }, { code: 1, includes: ["condicao `if:`"] });

  test("`if: \"… == 'pull_request'\"` (escalar YAML entre aspas) NAO e enfraquecimento", (dir) => {
    return gatedPor(dir, `"github.event_name == 'pull_request'"`);
  }, { code: 0, excludes: ["condicao `if:`"] });

  test("`if: \"… == 'push'\"` (escalar YAML entre aspas) E enfraquecimento", (dir) => {
    return gatedPor(dir, `"github.event_name == 'push'"`);
  }, { code: 1, includes: ["condicao `if:`"] });

  // Negar o evento nao e gating a PRs: o step deixa de correr precisamente onde interessa.
  test("`if: ${{ … != 'pull_request' }}` E enfraquecimento", (dir) => {
    return gatedPor(dir, "${{ github.event_name != 'pull_request' }}");
  }, { code: 1, includes: ["condicao `if:`"] });

  // A CAUDA. Escrever o gate legitimo e colar-lhe `&& false` e a forma mais barata de desligar
  // um step sem tocar em nenhum ficheiro de teste: le-se como o caso que a excecao autoriza. O
  // composto legitimo (`&& matrix.node == 20`) conta pela mesma regra e de proposito — reduz
  // onde o step corre num PR, e a excecao existe so para o caso em que nada se perde.
  test("`if: … == 'pull_request' && false` E enfraquecimento (a cauda conta)", (dir) => {
    return gatedPor(dir, "github.event_name == 'pull_request' && false");
  }, { code: 1, includes: ["condicao `if:`"] });

  test("`if: ${{ … == 'pull_request' && false }}` E enfraquecimento", (dir) => {
    return gatedPor(dir, "${{ github.event_name == 'pull_request' && false }}");
  }, { code: 1, includes: ["condicao `if:`"] });

  test("`if: … == 'pull_request' && matrix.node == 20` E enfraquecimento", (dir) => {
    return gatedPor(dir, "github.event_name == 'pull_request' && matrix.node == 20");
  }, { code: 1, includes: ["condicao `if:`"] });

  // E o controlo do controlo: ancorar o fim nao pode transformar um comentario YAML — que nao
  // muda condicao nenhuma — num falso positivo.
  test("`if: … == 'pull_request'  # comentario` NAO e enfraquecimento", (dir) => {
    return gatedPor(dir, "github.event_name == 'pull_request'  # so em PRs");
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

  test("assercao VACUA (`includes: [\"\"]`) conta como enfraquecimento", (dir) => {
    // A chave-mestra. `[^\\]]` exigia array nao-vazio e `[""]` e nao-vazio: trocar cada
    // assercao por `[""]` deixava 196/196 e 227/227 verdes com **tudo** vacuo
    // (`.includes("")` e sempre verdadeiro) e as contagens intactas. Com ela aberta, qualquer
    // outro enfraquecimento ficava barato de esconder.
    writeFileSync(join(dir, "tests/a.test.js"),
      'test("a", null, { includes: ["mensagem real"] });\ntest("b", null, { includes: ["outra"] });\n');
    commit(dir, "assercoes reais");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "tests/a.test.js"),
      'test("a", null, { includes: [""] });\ntest("b", null, { includes: [""] });\n');
    commit(dir, "esvaziar por dentro");
    return ref;
  }, { code: 1, includes: ["assercoes (includes/excludes): 2 -> 0"] });

  test("apagar um step que APLICA um guard no CI e enfraquecimento", (dir) => {
    // `\\S*test` so via os steps que TESTAM; apagar o `check-doc-versions` do `ci.yml`
    // — que e o que APLICA os guards — passava sem a superficie reagir.
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"),
      "jobs:\n  g:\n    steps:\n      - run: node a-test.mjs\n      - run: node check-doc-versions.mjs\n");
    commit(dir, "ci com teste e guard aplicado");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".github/workflows/ci.yml"),
      "jobs:\n  g:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "apagar o guard aplicado");
    return ref;
  }, { code: 1, includes: ["steps de verificacao no CI: 2 -> 1"] });

  test("apagar o registo de suites por descoberta e enfraquecimento", (dir) => {
    // AP4, invariante 2. A descoberta em disco (`lib/registo.mjs`) substituiu as chamadas
    // manuais a cada `tests-*.mjs`, mas a propria chamada a descoberta continua a ser uma
    // linha comentavel — e comenta-la faz o entry point correr so os testes inline, com
    // exit 0. `zero: true`: o que se afirma e que a descoberta existe em ALGUM sitio, nao
    // que o numero de entry points nunca desce.
    writeFileSync(join(dir, ".agent/scripts/test-guards.mjs"),
      "await registaDescobertos({ dir, entryPoint: 'x', contagem });\nprocess.exit(1);\n");
    commit(dir, "entry point com descoberta");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/test-guards.mjs"),
      "// await registaDescobertos({ dir, entryPoint: 'x', contagem });\nprocess.exit(1);\n");
    commit(dir, "desligar a descoberta");
    return ref;
  }, { code: 1, includes: ["registo de suites por descoberta"] });

  test("consolidar varios `process.exit(1)` num helper NAO e enfraquecimento", (dir) => {
    // Medido num projeto derivado: contar ocorrencias penalizava um refactor legitimo (tres
    // `console.log` + `process.exit(1)` passaram a um helper, 3 -> 1, e dava WARN). O
    // invariante e "tem de existir um caminho de saida != 0", nao "tem de haver os mesmos".
    writeFileSync(join(dir, ".agent/scripts/test-harness.mjs"),
      "if (a) { process.exit(1); }\nif (b) { process.exit(1); }\nif (c) { process.exit(1); }\n");
    commit(dir, "tres saidas");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/test-harness.mjs"),
      "const fatal = () => process.exit(1);\nif (a) fatal();\nif (b) fatal();\nif (c) fatal();\n");
    commit(dir, "consolidar num helper");
    return ref;
  }, { code: 0 });

  test("apagar o unico `process.exit(1)` E enfraquecimento", (dir) => {
    writeFileSync(join(dir, ".agent/scripts/test-harness.mjs"), "if (falhas.length) { process.exit(1); }\n");
    commit(dir, "com veredicto");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/test-harness.mjs"), "if (falhas.length) { console.log('ha falhas'); }\n");
    commit(dir, "sem veredicto");
    return ref;
  }, { code: 1, includes: ["veredicto do runner"] });

  test("despromover um warn a note num guard e enfraquecimento", (dir) => {
    mkdirSync(join(dir, ".agent/scripts/guards"), { recursive: true });
    writeFileSync(join(dir, ".agent/scripts/guards/x.mjs"), 'warn("a");\nwarn("b");\n');
    commit(dir, "guard com dois avisos");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/guards/x.mjs"), 'warn("a");\nnote("b");\n');
    commit(dir, "despromover um");
    return ref;
  }, { code: 1, includes: ["sitios de aviso: 2 -> 1"] });
  // --- Os HOOKS estao na superficie congelada --------------------------------
  // Ficavam de fora: os globs de teste so apanham `.claude/hooks/tests/` (a pasta `tests/`),
  // logo as suites dos hooks estavam vigiadas e os hooks que elas testam nao. Apagar o
  // `guard-protected-branch.mjs` — o unico sitio que NEGA um commit em branch protegido —
  // nao produzia uma palavra.
  test("hook apagado e reportado (esta na superficie congelada)", (dir) => {
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude/hooks/guardiao.mjs"), 'console.log("ola");\n');
    commit(dir, "hook novo");
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    rmSync(join(dir, ".claude/hooks/guardiao.mjs"));
    commit(dir, "apagar o hook");
    return base;
  }, { code: 1, includes: [".claude/hooks/guardiao.mjs", "APAGADO"] });

  // E o `.githooks/`, que nao tem extensao por onde ser apanhado por um glob de sufixo.
  test("hook do git apagado e reportado", (dir) => {
    mkdirSync(join(dir, ".githooks"), { recursive: true });
    writeFileSync(join(dir, ".githooks/pre-push"), '#!/bin/sh\nexit 0\n');
    commit(dir, "githook novo");
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    rmSync(join(dir, ".githooks/pre-push"));
    commit(dir, "apagar o githook");
    return base;
  }, { code: 1, includes: [".githooks/pre-push", "APAGADO"] });

  // `.claude/hooks/lib/` esteve fora da superficie enquanto `.agent/scripts/lib/` ja estava
  // dentro: a lacuna foi fechada de um lado e deixada aberta do outro. Medido no CI —
  // extrair a verificacao de fronteira para `lib/fronteira.mjs` leu-se como PERDA de 6 casos
  // no ficheiro de origem, porque o destino nao contava para o total.
  test("modulo em .claude/hooks/lib/ apagado e reportado", (dir) => {
    mkdirSync(join(dir, ".claude/hooks/lib"), { recursive: true });
    writeFileSync(join(dir, ".claude/hooks/lib/aux.mjs"), 'export const f = (x) => /a/.test(x);\n');
    commit(dir, "modulo novo em hooks/lib");
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    rmSync(join(dir, ".claude/hooks/lib/aux.mjs"));
    commit(dir, "apagar o modulo");
    return base;
  }, { code: 1, includes: [".claude/hooks/lib/aux.mjs", "APAGADO"] });

  // A contagem propria dos hooks: reduzir as decisoes de negacao e enfraquecer a rede sem
  // tocar em nenhum teste — o equivalente, do lado do enforcement, a apagar um `warn(`.
  test("decisoes de negacao a descer sao reportadas", (dir) => {
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude/hooks/nega.mjs"),
      'const a = { permissionDecision: "deny" };\nconst b = { permissionDecision: "deny" };\nconsole.log(a, b);\n');
    commit(dir, "hook com duas negacoes");
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, ".claude/hooks/nega.mjs"),
      'const a = { permissionDecision: "deny" };\nconsole.log(a);\n');
    commit(dir, "uma negacao a menos");
    return base;
  }, { code: 1, includes: ["decisoes de negacao dos hooks", "2 -> 1"] });

}
