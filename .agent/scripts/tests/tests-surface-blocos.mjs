/**
 * Testes da contagem de steps em BLOCO (`run: |`) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#153): a contagem "steps de verificacao no CI" so via `run: node ...` na mesma
 * linha. Os dois steps do `ci.yml` real escritos em bloco — a varredura de mutacao e o
 * `commit-msg` — podiam ser apagados com o verificador verde (medido: 21 -> 21). A entrada nova
 * em `lib/surface-patterns.mjs` conta-os; aqui prende-se cada forma que ela tem de casar, e
 * cada uma que NAO pode casar (o cabecalho do `mutation-sweep.mjs` exige-o: uma entrada de
 * tabela de padroes nao e um sitio de aviso, e a varredura nao a ve).
 *
 * NAO e um entry point: o `test-test-surface.mjs` descobre-o e chama `registar()`.
 */
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, registarResultado } from "./harness/test-surface-harness.mjs";
import { CONTAGENS } from "../lib/surface-patterns.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-surface-blocos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-test-surface.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-test-surface.mjs";

/** A MESMA msg da forma de uma linha, de proposito: e uma so entrada (ver o comentario dela). */
const MSG = "steps de verificacao no CI";

/** Um `ci.yml` com os steps dados, cada um ja indentado como corpo de `steps:`. */
const ci = (...steps) => "jobs:\n  t:\n    steps:\n" + steps.join("");
const bloco = (nome, ...linhas) =>
  `      - name: ${nome}\n        run: |\n` + linhas.map((l) => `          ${l}\n`).join("");

/** Baseline com `antes`, commit com `depois`; devolve o ref da baseline. */
function muda(dir, antes, depois) {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"), antes);
  commit(dir, "baseline");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"), depois);
  commit(dir, "alteracao");
  return ref;
}

export function registar() {
  // --- O que TEM de contar ---------------------------------------------------
  const sweep = bloco("sweep", "set -euo pipefail", "node .agent/scripts/mutation-sweep.mjs");
  const hook = bloco("msgs", 'while read -r m; do', '  node .githooks/commit-msg "$m"', "done");

  test("bloco `run: |`: apagar o step da varredura faz a contagem descer", (dir) =>
    muda(dir, ci(sweep, hook), ci(hook)), { code: 1, includes: [`${MSG}: 2 -> 1`] });

  test("bloco `run: |`: apagar o step do commit-msg (`.githooks/`) faz a contagem descer", (dir) =>
    muda(dir, ci(sweep, hook), ci(sweep)), { code: 1, includes: [`${MSG}: 2 -> 1`] });

  test("bloco `run: >` (folded) tambem conta", (dir) =>
    muda(dir,
      ci(sweep, "      - name: f\n        run: >\n          node a-check.mjs\n"),
      ci(sweep)),
    { code: 1, includes: [`${MSG}: 2 -> 1`] });

  test("bloco `run: |`: `node` dentro de um `if ...; then` conta", (dir) =>
    muda(dir,
      ci(sweep, bloco("cond", 'if [ -n "$x" ]; then', "  node b-test.mjs", "fi")),
      ci(sweep)),
    { code: 1, includes: [`${MSG}: 2 -> 1`] });

  test("bloco em `- run: |` (sem `name:`) tambem conta", (dir) =>
    muda(dir,
      ci(sweep, "      - run: |\n          node c-simulate.mjs\n"),
      ci(sweep)),
    { code: 1, includes: [`${MSG}: 2 -> 1`] });

  test("cabecalho `run: |2` com comentario no fim conta", (dir) =>
    muda(dir,
      ci(sweep, "      - name: c\n        run: |2 # indentacao explicita\n          node e-check.mjs\n"),
      ci(sweep)),
    { code: 1, includes: [`${MSG}: 2 -> 1`] });

  test("CRLF: um `ci.yml` com fins de linha Windows conta igual", (dir) =>
    muda(dir, ci(sweep, hook).replace(/\n/g, "\r\n"), ci(hook).replace(/\n/g, "\r\n")),
    { code: 1, includes: [`${MSG}: 2 -> 1`] });

  // --- A conversao entre as duas formas ---------------------------------------
  // Achado do leitor independente: com uma entrada por forma, isto dava 21 -> 20 numa e
  // 2 -> 3 na outra, e o `totalDesceu` (por `msg`) reprovava. E um refactor legitimo — foi
  // exactamente assim que os dois steps em bloco do `ci.yml` real nasceram.
  test("passar um step de `run: node x` para `run: |` NAO e enfraquecimento", (dir) =>
    muda(dir,
      ci(sweep, "      - run: node .agent/scripts/check-backlog.mjs\n"),
      ci(sweep, bloco("backlog", "set -euo pipefail", "node .agent/scripts/check-backlog.mjs"))),
    { code: 0, excludes: [`${MSG}:`] });

  // --- O que NAO pode contar -------------------------------------------------
  // Cada um destes apaga um step que NAO e verificador. Se a entrada o contasse, a contagem
  // descia e o verificador reprovava a toa — e o caso `code: 0` que o denuncia.
  test("bloco so com `echo` nao conta: apaga-lo nao e enfraquecimento", (dir) =>
    muda(dir, ci(sweep, bloco("eco", "echo ola")), ci(sweep)), { code: 0, excludes: [`${MSG}:`] });

  test("`node x-test.mjs` num COMENTARIO do bloco (linha inteira ou no fim) nao conta", (dir) =>
    muda(dir,
      ci(sweep, bloco("coment", "# depois: node x-test.mjs", "echo nada # ou node y-check.mjs")),
      ci(sweep)),
    { code: 0, excludes: [`${MSG}:`] });

  test("um step com DOIS `node` conta uma vez: tirar o segundo nao desce", (dir) =>
    muda(dir,
      ci(bloco("dois", "node a-check.mjs", "node b-check.mjs"), hook),
      ci(bloco("dois", "node a-check.mjs"), hook)),
    { code: 0, excludes: [`${MSG}:`] });

  test("o corpo nao atravessa para o step seguinte (indentacao)", (dir) => {
    // O bloco `eco` nao tem verificador. O step a seguir tem um `node` que NAO e um `run:` (um
    // argumento de `with:`), e por isso nao conta por si. Se o match atravessasse a fronteira
    // do step, o `eco` passava a contar como um step de verificacao — e apaga-lo reprovava.
    //
    // A fixture TEM de ser esta. Com o step seguinte a ser um `run: node x-test.mjs`, o match
    // que atravessa para nessa linha, que ja contava por si: o total nao muda e o teste nao
    // afirmava nada (medido — a mutacao que tira a indentacao sobrevivia).
    const usa = "      - uses: acme/runner@v1\n        with:\n          args: node d-check.mjs\n";
    return muda(dir, ci(sweep, bloco("eco", "echo ola"), usa), ci(sweep, usa));
  }, { code: 0, excludes: [`${MSG}:`] });

  // --- O custo ----------------------------------------------------------------
  // A primeira versao desta entrada tinha alternativas sobrepostas e levava > 120 s sobre o
  // `ci.yml` real (backtracking exponencial: 20 linhas so de espacos = 114 ms, e a dobrar a
  // cada poucas linhas). O verificador corre em cada PR e o padrao corre em cada ficheiro
  // tocado: um regex lento e um CI pendurado sem mensagem nenhuma.
  //
  // Num PROCESSO FILHO com `timeout`, e nao medido aqui: um regex exponencial nao devolve, logo
  // um `Date.now()` depois do `match` nunca chegava a ser lido — a suite PENDURAVA em vez de
  // ficar vermelha, e o sintoma era o job a morrer no tecto sem dizer porque.
  {
    const nome = "bloco `run: |`: brancos, vazias, longas e indentacao de 2000 espacos medem-se em < 5 s";
    const entrada = CONTAGENS.find((c) => c.msg === MSG);
    if (!entrada) {
      registarResultado(nome, [`nenhuma entrada de CONTAGENS com a msg "${MSG}"`], "");
    } else {
      const codigo = `
        const g = new RegExp(${JSON.stringify(entrada.re.source)}, ${JSON.stringify(entrada.re.flags + "g")});
        const corpo = (l) => ["        run: |", ...Array(5000).fill(l), "      - name: fim"].join("\\n") + "\\n";
        for (const l of ["          ", "", "          echo" + " x".repeat(200)]) corpo(l).match(g);
        // Quadratico na indentacao: sem o \`(?![ \\t])\` da linha final, isto levava ~9 s.
        const fundo = " ".repeat(2000);
        (["        run: |", ...Array(300).fill(fundo + "echo" + " y".repeat(1000)), "      - name: fim"].join("\\n") + "\\n").match(g);`;
      let problemas = [];
      try {
        execFileSync(process.execPath, ["-e", codigo], { timeout: 5000, stdio: "ignore" });
      } catch (err) {
        problemas = [err.signal ? `nao terminou em 5 s (${err.signal}) — backtracking?` : `rebentou: ${err.message}`];
      }
      registarResultado(nome, problemas, "");
    }
  }
}
