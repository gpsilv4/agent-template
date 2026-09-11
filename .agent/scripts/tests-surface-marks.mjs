/**
 * Testes das MARCAS de enfraquecimento — {{PROJECT_NAME}}
 *
 * As formas que **nao movem nenhuma contagem obvia**: neutralizar um step de CI, gatear uma
 * condicao, tornar o veredicto do runner inalcancavel. Sao as mais subtis, e por isso as mais
 * numerosas — juntas passavam o `test-test-surface.mjs` do flag das 500 linhas.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync } from "fs";
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
}
