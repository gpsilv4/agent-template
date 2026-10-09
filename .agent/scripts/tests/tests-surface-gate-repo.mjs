/**
 * Testes da excecao do `if:` com o nome DESTE repo — {{PROJECT_NAME}}
 *
 * O `codeql.yml` do template (#277) tem um job so para este repositorio
 * (`if: github.repository == '<este repo>'`), sempre verdadeiro aqui e inerte nas copias. O
 * `check-test-surface` aceita-o so nos ficheiros SO DO TEMPLATE, so com o nome deste repo, e so
 * sem cauda nem continuacao. Remover um desses ficheiros so deixa de ser APAGADO num derivado.
 *
 * Saiu do `tests-surface-marks.mjs` quando ele chegou perto das 500 linhas.
 *
 * NAO e um entry point: o `test-test-surface.mjs` importa e chama `registar()`.
 */
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, DEPOIS_DO_IF } from "./harness/test-surface-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-gate-repo.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

export function registar() {
  // A segunda excecao (#277): um job so para ESTE repositorio (`github.repository == 'dono/repo'`)
  // e sempre verdadeiro aqui — o `codeql.yml` do template usa-a para ficar inerte nas copias. O
  // nome DESTE repo vem do `origin` (fixado aqui, para o teste nao depender do ambiente do CI).
  // Cada forma leva o seu par: outro nome, `!=` e uma cauda tem de continuar a contar.
  // So no ficheiro SO DO TEMPLATE (`codeql.yml`): no `ci.yml`, que os derivados herdam, o mesmo
  // `if:` desligava os testes em cada copia — o par negativo abaixo e o que o prova.
  const gatedNoRepo = (dir, cond, wf = "codeql.yml", origin = "https://github.com/dono/repo.git") => {
    if (origin) git(dir, ["remote", "add", "origin", origin]);
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, `.github/workflows/${wf}`), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, wf);
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, `.github/workflows/${wf}`), `jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: ${cond}\n${DEPOIS_DO_IF}`);
    commit(dir, `gate ${cond}`);
    return ref;
  };
  test("no `codeql.yml`, `if: github.repository == '<este repo>'` NAO e enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'");
  }, { code: 0, excludes: ["condicao `if:`"] });
  test("no `codeql.yml`, `if: ${{ github.repository == '<este repo>' }}` NAO e enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "${{ github.repository == 'dono/repo' }}");
  }, { code: 0, excludes: ["condicao `if:`"] });
  test("no `ci.yml` (herdado pelos derivados), o MESMO `if:` E enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'", "ci.yml");
  }, { code: 1, includes: ["condicao `if:`"] });
  test("`if: github.repository == '<OUTRO repo>'` E enfraquecimento (desligava o passo aqui)", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'outro/repo'");
  }, { code: 1, includes: ["condicao `if:`"] });
  test("`if: github.repository != '<este repo>'` E enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "github.repository != 'dono/repo'");
  }, { code: 1, includes: ["condicao `if:`"] });
  test("`if: github.repository == '<este repo>' && false` E enfraquecimento (a cauda conta)", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo' && false");
  }, { code: 1, includes: ["condicao `if:`"] });
  // A CONTINUACAO: o YAML junta ao escalar a linha seguinte mais indentada (`&& false`).
  test("`if: github.repository == '<este repo>'` + continuacao `&& false` E enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'\n          && false");
  }, { code: 1, includes: ["condicao `if:`"] });
  // Os ficheiros so do template saem de cada derivado pelo BOOTSTRAP: remove-los nao e APAGADO.
  // O `codeql.yml` do TEMPLATE (o cabecalho `SO DO TEMPLATE`) num derivado (a marca), no proprio
  // template (o `BOOTSTRAP.md`, que o bootstrap apaga), e o do PROJETO (o "Advanced setup").
  const comCodeql = (dir, cabecalho) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/codeql.yml"), `${cabecalho}jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n`);
    commit(dir, "codeql");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    rmSync(join(dir, ".github/workflows/codeql.yml"));
    return ref;
  };
  test("num derivado, remover o `codeql.yml` (so do template) NAO e APAGADO", (dir) => {
    const ref = comCodeql(dir, "# CodeQL. **SO DO TEMPLATE.**\n");
    writeFileSync(join(dir, ".agent/.template-version"), "v0.0.0\n"); // a marca do bootstrap
    commit(dir, "bootstrap remove o codeql");
    return ref;
  }, { code: 0, includes: ["so do template"], excludes: ["APAGADO"] });
  test("no PROPRIO template (com o BOOTSTRAP, sem a marca), remover o `codeql.yml` continua APAGADO", (dir) => {
    const ref = comCodeql(dir, "# CodeQL. **SO DO TEMPLATE.**\n");
    writeFileSync(join(dir, ".agent/BOOTSTRAP.md"), "# Bootstrap\n");
    commit(dir, "apagar o codeql no template");
    return ref;
  }, { code: 1, includes: ["APAGADO"] });
  // O cabecalho sozinho nao chega: o proprio `check-test-surface.mjs`, que todo o derivado herda,
  // cita "SO DO TEMPLATE". So os ficheiros da lista `SO_DO_TEMPLATE` podem sair sem APAGADO.
  test("num derivado, um ficheiro HERDADO que cita `SO DO TEMPLATE` continua APAGADO", (dir) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), "# os jobs SO DO TEMPLATE saem no bootstrap\njobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    rmSync(join(dir, ".github/workflows/ci.yml"));
    writeFileSync(join(dir, ".agent/.template-version"), "v0.0.0\n");
    commit(dir, "apagar o ci");
    return ref;
  }, { code: 1, includes: ["APAGADO"], excludes: ["so do template"] });
  test("num derivado, remover o `codeql.yml` do PROJETO (o \"Advanced setup\", sem o cabecalho) continua APAGADO", (dir) => {
    const ref = comCodeql(dir, "# CodeQL do projeto\n");
    writeFileSync(join(dir, ".agent/.template-version"), "v0.0.0\n");
    commit(dir, "apagar o codeql do projeto");
    return ref;
  }, { code: 1, includes: ["APAGADO"], excludes: ["so do template"] });
  test("remover o `ci.yml` (herdado) continua APAGADO", (dir) => {
    const ref = gatedNoRepo(dir, "github.repository == 'dono/repo'", "ci.yml");
    rmSync(join(dir, ".github/workflows/ci.yml"));
    commit(dir, "apagar o ci");
    return ref;
  }, { code: 1, includes: ["APAGADO"] });
  test("`if: github.repository == '<este repo>'` + linha em branco + continuacao `&& false` E enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'\n\n          && false");
  }, { code: 1, includes: ["condicao `if:`"] });
  test("`if: \"github.repository == '<este repo>'\"  # nota` (aspas, comentario na cauda) NAO e enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "\"github.repository == 'dono/repo'\"  # nota\n          # comentario mais indentado");
  }, { code: 0, excludes: ["condicao `if:`"] });
  test("o `origin` ganha ao `GITHUB_REPOSITORY`", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'");
  }, { code: 0, excludes: ["condicao `if:`"] }, { env: { GITHUB_REPOSITORY: "outro/x" } });
  test("um `origin` fora do GitHub cai no `GITHUB_REPOSITORY`", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'", "codeql.yml", "https://gitlab.com/a/b.git");
  }, { code: 0, excludes: ["condicao `if:`"] }, { env: { GITHUB_REPOSITORY: "dono/repo" } });
  // DE ONDE vem o nome deste repo: o `origin` (`https` ou `git@`, com ou sem `.git`), senao o
  // `GITHUB_REPOSITORY` do CI; sem nenhum, a excecao nao se aplica (falha fechada).
  test("sem `origin`, o nome vem do `GITHUB_REPOSITORY` (o CI)", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'", "codeql.yml", null);
  }, { code: 0, excludes: ["condicao `if:`"] }, { env: { GITHUB_REPOSITORY: "dono/repo" } });
  test("sem `origin` nem `GITHUB_REPOSITORY`, o `if:` CONTA (falha fechada)", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'", "codeql.yml", null);
  }, { code: 1, includes: ["condicao `if:`"] });
  test("`origin` em `git@github.com:dono/repo` (sem `.git`) da o nome", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'", "codeql.yml", "git@github.com:dono/repo");
  }, { code: 0, excludes: ["condicao `if:`"] });
  // Um `.` no nome e literal: sem o escape, `dono/a.b` casava `dono/aXb` — outro repo.
  test("o `.` do nome deste repo e literal (`'dono/aXb'` nao e `dono/a.b`)", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/aXb'", "codeql.yml", "https://github.com/dono/a.b.git");
  }, { code: 1, includes: ["condicao `if:`"] });
  // O `==` do GitHub Actions ignora a caixa, logo o NOME tambem; o contexto fica exato.
  test("o nome deste repo noutra caixa (`'Dono/Repo'`) NAO e enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'Dono/Repo'");
  }, { code: 0, excludes: ["condicao `if:`"] });
  test("`GITHUB.REPOSITORY` noutra caixa nao e a excecao: conta (falha fechada)", (dir) => {
    return gatedNoRepo(dir, "GITHUB.REPOSITORY == 'dono/repo'");
  }, { code: 1, includes: ["condicao `if:`"] });

  // --- Da segunda passagem da auditoria do #277 ----------------------------------
  // A excecao "removido" e so para o que e SO DO TEMPLATE: num derivado, um ficheiro herdado
  // apagado continua APAGADO (sem este par, aplicar a excecao a todos os ficheiros passava).
  test("num derivado, remover o `ci.yml` (herdado) continua APAGADO", (dir) => {
    const ref = gatedNoRepo(dir, "github.repository == 'dono/repo'", "ci.yml");
    writeFileSync(join(dir, ".agent/.template-version"), "v0.0.0\n");
    rmSync(join(dir, ".github/workflows/ci.yml"));
    commit(dir, "derivado apaga o ci");
    return ref;
  }, { code: 1, includes: ["APAGADO"], excludes: ["so do template"] });
  // A baseline JA com o gate (o estado normal depois do merge): muda-lo para outro repo, ou
  // acrescentar-lhe uma continuacao, tem de contar — a neutralizacao aplica-se aos DOIS lados.
  const jaComGate = (dir, depois) => {
    gatedNoRepo(dir, "github.repository == 'dono/repo'");
    const ref = git(dir, ["rev-parse", "HEAD"]); // a baseline e o commit QUE JA TEM o gate
    writeFileSync(join(dir, ".github/workflows/codeql.yml"),
      `jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n        if: ${depois}\n${DEPOIS_DO_IF}`);
    commit(dir, "mudar o gate");
    return ref;
  };
  test("baseline ja com o gate: trocar para OUTRO repo E enfraquecimento", (dir) => {
    return jaComGate(dir, "github.repository == 'outro/repo'");
  }, { code: 1, includes: ["condicao `if:`"] });
  test("baseline ja com o gate: acrescentar a continuacao `&& false` E enfraquecimento", (dir) => {
    return jaComGate(dir, "github.repository == 'dono/repo'\n          && false");
  }, { code: 1, includes: ["condicao `if:`"] });
  test("DOIS jobs com o gate deste repo: nenhum conta", (dir) => {
    return gatedNoRepo(dir, `github.repository == 'dono/repo'\n${DEPOIS_DO_IF}      - run: node b-test.mjs\n        if: github.repository == 'dono/repo'`);
  }, { code: 0, excludes: ["condicao `if:`"] });
  // Mover um passo de teste do `ci.yml` para o `codeql.yml` (#279): neste repo nada se perde, mas
  // o `codeql.yml` sai de cada derivado. Nao e "movido, nao perdido". O caminho inverso passa.
  const doisPassos = "      - run: node a-test.mjs\n      - run: node b-test.mjs\n";
  const passo = (dir, ci, codeql) => {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), `jobs:\n  t:\n    steps:\n${ci}`);
    writeFileSync(join(dir, ".github/workflows/codeql.yml"), `# **SO DO TEMPLATE.**\njobs:\n  t:\n    steps:\n${codeql}`);
  };
  test("passo de teste movido do `ci.yml` para o `codeql.yml` (so do template) E perdido", (dir) => {
    passo(dir, doisPassos, "      - run: echo x\n");
    commit(dir, "dois passos no ci");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    passo(dir, "      - run: node a-test.mjs\n", "      - run: echo x\n      - run: node b-test.mjs\n");
    commit(dir, "mover para o codeql");
    return ref;
  }, { code: 1, includes: ["steps de verificacao no CI"], excludes: ["movido, nao perdido"] });
  test("passo de teste movido do `codeql.yml` para o `ci.yml` continua \"movido, nao perdido\"", (dir) => {
    passo(dir, "      - run: node a-test.mjs\n", "      - run: echo x\n      - run: node b-test.mjs\n");
    commit(dir, "um passo no codeql");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    passo(dir, doisPassos, "      - run: echo x\n");
    commit(dir, "trazer para o ci");
    return ref;
  }, { code: 0, includes: ["movido, nao perdido"] });
  // Com DOIS passos contados no `codeql.yml`, mover UM para o `ci.yml` continua "movido" (#279): do
  // lado "agora" o ficheiro so do template conta o que ainda tem (o minimo), e nao zero.
  test("dois passos no `codeql.yml`, um movido para o `ci.yml`: \"movido, nao perdido\"", (dir) => {
    passo(dir, "      - run: node a-test.mjs\n", "      - run: node b-test.mjs\n      - run: node c-test.mjs\n");
    commit(dir, "dois passos no codeql");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    passo(dir, "      - run: node a-test.mjs\n      - run: node b-test.mjs\n", "      - run: node c-test.mjs\n");
    commit(dir, "trazer um para o ci");
    return ref;
  }, { code: 0, includes: ["movido, nao perdido"] });
  test("CRLF: `if: github.repository == '<este repo>'` + continuacao `&& false` E enfraquecimento", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'\r\n          && false\r");
  }, { code: 1, includes: ["condicao `if:`"] });
  // So o lado "agora": excluir o `codeql.yml` dos DOIS lados escondia um passo apagado dele.
  test("APAGAR um passo de teste do `codeql.yml` E perdido", (dir) => {
    passo(dir, "      - run: node a-test.mjs\n", "      - run: echo x\n      - run: node b-test.mjs\n");
    commit(dir, "um passo no codeql");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    passo(dir, "      - run: node a-test.mjs\n", "      - run: echo x\n");
    commit(dir, "apagar o passo do codeql");
    return ref;
  }, { code: 1, includes: ["steps de verificacao no CI"], excludes: ["movido, nao perdido"] });

  // A forma `- if:` (#279) tambem na excecao do repo: a chave na linha do `-`.
  const repoNaLinhaDoTraco = (dir, cond) => {
    git(dir, ["remote", "add", "origin", "https://github.com/dono/repo.git"]);
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/codeql.yml"), "jobs:\n  t:\n    steps:\n      - run: node a-test.mjs\n");
    commit(dir, "codeql");
    const ref = git(dir, ["rev-parse", "HEAD"]);
    writeFileSync(join(dir, ".github/workflows/codeql.yml"), `jobs:\n  t:\n    steps:\n      - if: ${cond}\n        run: node a-test.mjs\n${DEPOIS_DO_IF}`);
    commit(dir, "gate");
    return ref;
  };
  test("`- if: github.repository == '<este repo>'` no `codeql.yml` continua a ser a excecao",
    (dir) => repoNaLinhaDoTraco(dir, "github.repository == 'dono/repo'"), { code: 0, excludes: ["condicao `if:`"] });
  test("`- if: github.repository == '<este repo>'` + continuacao `&& false` E enfraquecimento",
    (dir) => repoNaLinhaDoTraco(dir, "github.repository == 'dono/repo'\n          && false"), { code: 1, includes: ["condicao `if:`"] });
  test("`origin` com o host noutra caixa (`GitHub.com`) da o nome", (dir) => {
    return gatedNoRepo(dir, "github.repository == 'dono/repo'", "codeql.yml", "https://GitHub.com/dono/repo.git");
  }, { code: 0, excludes: ["condicao `if:`"] });
}
