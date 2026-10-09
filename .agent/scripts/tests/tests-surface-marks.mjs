/**
 * Testes das MARCAS de enfraquecimento — {{PROJECT_NAME}}
 *
 * As formas que **nao movem nenhuma contagem obvia**: neutralizar um step de CI, gatear uma
 * condicao, tornar o veredicto do runner inalcancavel. Sao as mais subtis, e por isso as mais
 * numerosas — juntas passavam o `test-test-surface.mjs` do flag das 500 linhas.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, DEPOIS_DO_IF } from "./harness/test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-marks.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
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
    // Uma chave irma LOGO DEPOIS do `if:`: o lookahead da continuacao tem de a deixar passar. Sem elas, um lookahead alargado passava a suite inteira (auditoria do #277).
    writeFileSync(join(dir, ".github/workflows/ci.yml"),
      `jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: ${cond}\n${DEPOIS_DO_IF}`);
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

  // A chave na LINHA DO `-` (#279): `- if: false` e YAML valido e escapava a `^([ \t]*)if:`. O
  // verificador troca o `-` por um espaco antes das MARCAS, logo a chave fica na mesma coluna.
  const naLinhaDoTraco = (dir, chave, crlf = false, wf = "ci.yml") => {
    const fim = (t) => (crlf ? t.replace(/\n/g, "\r\n") : t);
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, `.github/workflows/${wf}`), fim("jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n"));
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, `.github/workflows/${wf}`), fim(`jobs:\n  t:\n    steps:\n      - ${chave}\n        run: node a-test.mjs\n${DEPOIS_DO_IF}`));
    commit(dir, `gate ${chave}`);
    return ref;
  };
  test("`- if: false` (a chave na linha do `-`) E enfraquecimento", (dir) => naLinhaDoTraco(dir, "if: false"),
    { code: 1, includes: ["condicao `if:`"] });
  test("`- continue-on-error: true` E enfraquecimento", (dir) => naLinhaDoTraco(dir, "continue-on-error: true"),
    { code: 1, includes: ["`continue-on-error: true`"] });
  test("`- if: … == 'pull_request'` continua a ser a excecao", (dir) => naLinhaDoTraco(dir, "if: github.event_name == 'pull_request'"),
    { code: 0, excludes: ["condicao `if:`"] });
  test("`- if: … == 'pull_request'` + continuacao `&& false` E enfraquecimento",
    (dir) => naLinhaDoTraco(dir, "if: github.event_name == 'pull_request'\n          && false"),
    { code: 1, includes: ["condicao `if:`"] });
  // E num `.yaml` (o GitHub aceita as duas extensoes), e numa linha propria em CRLF.
  test("`- if: false` num workflow `.yaml` E enfraquecimento", (dir) => naLinhaDoTraco(dir, "if: false", false, "ci.yaml"),
    { code: 1, includes: ["condicao `if:`"] });
  test("CRLF: `if: … == 'pull_request'` numa linha propria NAO e enfraquecimento", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    const wf = (t) => writeFileSync(join(dir, ".github/workflows/ci.yml"), t.replace(/\n/g, "\r\n"));
    wf("jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    wf(`jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: github.event_name == 'pull_request'\n${DEPOIS_DO_IF}`);
    commit(dir, "gate");
    return ref;
  }, { code: 0, excludes: ["condicao `if:`"] });
  // A chave ENTRE ASPAS ou com espacos antes dos `:` (#279) — YAML valido, escapava as marcas.
  test("`\"if\": false` (chave entre aspas) E enfraquecimento", (dir) => naLinhaDoTraco(dir, '"if": false'),
    { code: 1, includes: ["condicao `if:`"] });
  test("`'continue-on-error': true` (chave entre plicas) E enfraquecimento", (dir) => naLinhaDoTraco(dir, "'continue-on-error': true"),
    { code: 1, includes: ["`continue-on-error: true`"] });
  test("`continue-on-error : true` (espaco antes dos `:`) E enfraquecimento", (dir) => naLinhaDoTraco(dir, "continue-on-error : true"),
    { code: 1, includes: ["`continue-on-error: true`"] });
  // Num SEGUNDO passo (a normalizacao e de todas as linhas, nao so da primeira).
  test("`- if: false` no SEGUNDO passo, depois de um gate legitimo, E enfraquecimento",
    (dir) => naLinhaDoTraco(dir, "if: github.event_name == 'pull_request'\n        run: node b-test.mjs\n      - \"if\": false"),
    { code: 1, includes: ["condicao `if:`"] });
  test("`if : false` (espaco antes dos `:`) E enfraquecimento", (dir) => naLinhaDoTraco(dir, "if : false"),
    { code: 1, includes: ["condicao `if:`"] });
  test("`\"if\": … == 'pull_request'` (chave entre aspas) continua a ser a excecao",
    (dir) => naLinhaDoTraco(dir, "\"if\": github.event_name == 'pull_request'"), { code: 0, excludes: ["condicao `if:`"] });
  // A normalizacao aplica-se aos DOIS lados: um `- continue-on-error` que ja estava na baseline nao
  // e novo. E so a YAML: num `.js`, uma linha `- if: false` dentro de uma string nao e um passo.
  test("`- continue-on-error: true` que JA estava na baseline nao e novo", (dir) => {
    naLinhaDoTraco(dir, "continue-on-error: true");
    const ref = git(dir, ["rev-parse", "HEAD"]); // a baseline JA tem o `- continue-on-error`
    const ci = join(dir, ".github/workflows/ci.yml");
    writeFileSync(ci, readFileSync(ci, "utf8") + "      - run: echo outro\n");
    commit(dir, "outro passo");
    return ref;
  }, { code: 0, excludes: ["continue-on-error"] });
  test("num `.js`, uma linha `- if: false` numa string NAO e uma marca", (dir) => {
    writeFileSync(join(dir, "tests/exemplo.test.js"),
      'test("soma", () => { expect(1 + 1).toBe(2); });\nconst yaml = `\n  - if: false\n`;\n');
    commit(dir, "um yaml numa string");
  }, { code: 0, excludes: ["condicao `if:`"] });
  // CRLF (#279): regressao. Com a flag `m`, o `$` do JS ja para antes do `\r`, logo estes passavam
  // antes da correcao — ficam para que uma mudanca futura das regex nao o parta.
  test("CRLF: `- if: … == 'pull_request'` legitimo NAO e enfraquecimento", (dir) => naLinhaDoTraco(dir, "if: github.event_name == 'pull_request'", true),
    { code: 0, excludes: ["condicao `if:`"] });
  test("CRLF: `- if: … == 'pull_request'` + continuacao `&& false` E enfraquecimento",
    (dir) => naLinhaDoTraco(dir, "if: github.event_name == 'pull_request'\n          && false", true),
    { code: 1, includes: ["condicao `if:`"] });

  test("`if: … == 'pull_request'` + continuacao `&& false` E enfraquecimento", (dir) => {
    return gatedPor(dir, "github.event_name == 'pull_request'\n          && false");
  }, { code: 1, includes: ["condicao `if:`"] });
  test("`if: … == 'pull_request'` + comentario MAIS indentado NAO e enfraquecimento", (dir) => {
    return gatedPor(dir, "github.event_name == 'pull_request'\n          # um comentario nao continua o escalar");
  }, { code: 0, excludes: ["condicao `if:`"] });
  test("`if: … == 'pull_request'` + linha em branco + continuacao `&& false` E enfraquecimento", (dir) => {
    return gatedPor(dir, "github.event_name == 'pull_request'\n\n          && false");
  }, { code: 1, includes: ["condicao `if:`"] });

  test("tornar o veredicto do runner inalcancavel e enfraquecimento", (dir) => {
    // `if (failures.length) {` -> `if (false) {`: o `process.exit(1)` fica **la** e portanto a
    // contagem dele nao se move. O que desaparece e a referencia a contagem de falhas.
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-harness.mjs"),
      "const failures = [];\nif (failures.length) {\n  process.exit(1);\n}\n");
    commit(dir, "harness");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-harness.mjs"),
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
    // TP4, invariante 2. A descoberta em disco (`lib/registo.mjs`) substituiu as chamadas
    // manuais a cada `tests-*.mjs`, mas a propria chamada a descoberta continua a ser uma
    // linha comentavel — e comenta-la faz o entry point correr so os testes inline, com
    // exit 0. `zero: true`: o que se afirma e que a descoberta existe em ALGUM sitio, nao
    // que o numero de entry points nunca desce.
    writeFileSync(join(dir, ".agent/scripts/tests/test-guards.mjs"),
      "await registaDescobertos({ dir, entryPoint: 'x', contagem });\nprocess.exit(1);\n");
    commit(dir, "entry point com descoberta");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/tests/test-guards.mjs"),
      "// await registaDescobertos({ dir, entryPoint: 'x', contagem });\nprocess.exit(1);\n");
    commit(dir, "desligar a descoberta");
    return ref;
  }, { code: 1, includes: ["registo de suites por descoberta"] });

  test("consolidar varios `process.exit(1)` num helper NAO e enfraquecimento", (dir) => {
    // Medido num projeto derivado: contar ocorrencias penalizava um refactor legitimo (tres
    // `console.log` + `process.exit(1)` passaram a um helper, 3 -> 1, e dava WARN). O
    // invariante e "tem de existir um caminho de saida != 0", nao "tem de haver os mesmos".
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-harness.mjs"),
      "if (a) { process.exit(1); }\nif (b) { process.exit(1); }\nif (c) { process.exit(1); }\n");
    commit(dir, "tres saidas");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-harness.mjs"),
      "const fatal = () => process.exit(1);\nif (a) fatal();\nif (b) fatal();\nif (c) fatal();\n");
    commit(dir, "consolidar num helper");
    return ref;
  }, { code: 0 });

  test("apagar o unico `process.exit(1)` E enfraquecimento", (dir) => {
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-harness.mjs"), "if (falhas.length) { process.exit(1); }\n");
    commit(dir, "com veredicto");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-harness.mjs"), "if (falhas.length) { console.log('ha falhas'); }\n");
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

  // --- MIGRACAO nao e apagamento ------------------------------------------------
  //
  // Integrar a reorganizacao que moveu as suites para `tests/` produzia **25 avisos de APAGADO
  // e exit 1** num consumidor, por uma mudanca de pasta que nao tirou um unico teste. O que a
  // salvava era acidental — a deteccao de renames do git apanhava 22 dos 25, e os tres que
  // tinham mudado demasiado ao migrar caiam abaixo do limiar de similaridade.
  //
  // O irmao ja tinha o conceito: o `simulate-upgrade.mjs` imprime "MIGRADO: o mesmo nome existe
  // noutra pasta". Medido num derivado real, na ronda 6.
  test("ficheiro MOVIDO de pasta e MIGRADO, nao apagado", (dir) => {
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude/hooks/vigia.mjs"), 'console.log("ola");\n');
    commit(dir, "hook novo");
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    // O conteudo muda BASTANTE, e e deliberado: com o ficheiro igual, o git emparelha os dois
    // por similaridade e o verificador nunca ve um apagamento — foi assim que 22 dos 25 casos
    // reais passaram despercebidos. Os que exercitam este ramo sao os que mudaram demasiado ao
    // migrar (imports reescritos, caminhos relativos novos) e cairam abaixo do limiar.
    mkdirSync(join(dir, ".claude/hooks/lib"), { recursive: true });
    writeFileSync(
      join(dir, ".claude/hooks/lib/vigia.mjs"),
      '// reescrito ao migrar: outros imports, outros caminhos\n' + 'const x = 1;\n'.repeat(40) + 'export default x;\n'
    );
    rmSync(join(dir, ".claude/hooks/vigia.mjs"));
    commit(dir, "mover o hook de pasta");
    return base;
  }, { code: 0, includes: ["MIGRADO para .claude/hooks/lib/vigia.mjs"] });

  // `git mv` com o conteudo IGUAL (#279): o git emparelha-o como renomeacao, e o `--name-only`
  // listava so o destino. Para fora da superficie, o teste deixava de correr sem aviso; para
  // outra pasta da superficie, continua a ser uma migracao.
  test("`git mv` de um teste para FORA da superficie e APAGADO", (dir, base) => {
    git(dir, ["mv", "tests/exemplo.test.js", "exemplo.test.js.off"]);
    commit(dir, "desligar por rename");
    return base;
  }, { code: 1, includes: ["tests/exemplo.test.js: ficheiro da superficie de teste APAGADO"] });
  // RENOMEADO dentro da superficie (#279): com `--no-renames` sozinho dava APAGADO — um PR real
  // deste repo (`tests-harness-self.mjs` -> `tests-test-harness.mjs`) chumbava.
  test("`git mv` de um teste para OUTRO NOME na superficie e MIGRADO", (dir, base) => {
    git(dir, ["mv", "tests/exemplo.test.js", "tests/soma.test.js"]);
    commit(dir, "renomear");
    return base;
  }, { code: 0, includes: ["MIGRADO para tests/soma.test.js (renomeado"] });
  // Mover E esvaziar no mesmo commit (#279): a origem entra no total com a baseline — perdido.
  // Sem par do git (o conteudo mudou todo): e o caminho do HOMONIMO noutra pasta, nao o da renomeacao
  // (esse esta no `tests-surface-migrado.mjs`).
  test("homonimo noutra pasta, ESVAZIADO no mesmo commit, e perdido", (dir, base) => {
    mkdirSync(join(dir, "tests/sub"), { recursive: true });
    git(dir, ["mv", "tests/exemplo.test.js", "tests/sub/exemplo.test.js"]);
    writeFileSync(join(dir, "tests/sub/exemplo.test.js"), "// vazio\n");
    commit(dir, "mover e esvaziar");
    return base;
  }, { code: 1, includes: ["tests/exemplo.test.js: casos de teste: 1 -> 0"] });
  test("`git mv` de um teste para OUTRA pasta da superficie continua MIGRADO", (dir, base) => {
    mkdirSync(join(dir, "tests/sub"), { recursive: true });
    git(dir, ["mv", "tests/exemplo.test.js", "tests/sub/exemplo.test.js"]);
    commit(dir, "mudar de pasta");
    return base;
  }, { code: 0, includes: ["MIGRADO para tests/sub/exemplo.test.js"] });

  // O CONTRA-CASO, e sem ele o de cima abria um buraco: apagar de verdade — sem nenhum ficheiro
  // do mesmo nome noutra pasta — tem de continuar a ser APAGADO com exit 1. E a diferenca entre
  // reconhecer uma migracao e deixar de ver apagamentos.
  test("apagado SEM homonimo noutra pasta continua APAGADO", (dir) => {
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude/hooks/sozinho.mjs"), 'console.log("ola");\n');
    commit(dir, "hook novo");
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    rmSync(join(dir, ".claude/hooks/sozinho.mjs"));
    commit(dir, "apagar mesmo");
    return base;
  }, { code: 1, includes: [".claude/hooks/sozinho.mjs", "APAGADO"] });

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
  // E a logica deles em `lib/` (#278): o `commit-msg` e um ponteiro, e quem decide e o modulo.
  test("modulo em .githooks/lib/ apagado e reportado", (dir) => {
    mkdirSync(join(dir, ".githooks/lib"), { recursive: true });
    writeFileSync(join(dir, ".githooks/lib/commit-msg.mjs"), "export const correr = () => process.exit(1);\n");
    commit(dir, "modulo do githook");
    const base = git(dir, ["rev-parse", "HEAD"]).trim();
    rmSync(join(dir, ".githooks/lib/commit-msg.mjs"));
    commit(dir, "apagar o modulo");
    return base;
  }, { code: 1, includes: [".githooks/lib/commit-msg.mjs", "APAGADO"] });

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
