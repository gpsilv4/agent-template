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
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, commit, git, registarResultado, ROOT } from "./harness/test-surface-harness.mjs";
import { CONTAGENS } from "../lib/surface-patterns.mjs";
import { unidadesDaMaquinaria } from "../lib/superficie-gate.mjs";
import { partePasso, RUNNER } from "../lib/passo-paralelo.mjs";
import { suitesQueOCICorre } from "./tests-suites-em-paralelo.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";

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
function muda(dir, antes, depois, msg = "alteracao") {
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"), antes);
  commit(dir, "baseline");
  const ref = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, ".github/workflows/ci.yml"), depois);
  commit(dir, msg);
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

  // As SUITES EM PARALELO (#337): cada suite numa linha de continuacao conta 1, como quando era um passo.
  const passo = (s) => `      - name: ${s}\n        run: node .agent/scripts/tests/${s}.mjs\n`;
  const paralelo = (...ss) =>
    bloco("suites", "node .agent/scripts/lib/suites-em-paralelo.mjs -- \\", ...ss.map((s, i) => `  node .agent/scripts/tests/${s}.mjs${i < ss.length - 1 ? " \\" : ""}`));
  test("suites em paralelo: tirar uma suite da lista faz a contagem descer (#337)", (dir) =>
    muda(dir, ci(paralelo("test-a", "test-b", "test-c")), ci(paralelo("test-a", "test-c"))), { code: 1, includes: [`${MSG}: 3 -> 2`] });
  // A CONTAGEM nao desce; o que avisa e o gate da maquinaria (os passos mudaram), que se resolve com o trailer.
  test("suites em paralelo: juntar os passos num bloco nao faz a contagem descer (#337)", (dir) =>
    muda(dir, ci(passo("test-a"), passo("test-b"), passo("test-c")), ci(paralelo("test-a", "test-b", "test-c"))), {
      code: 1,
      includes: ["passo da maquinaria mudou"],
      excludes: [MSG],
    });

  // 2.a leitura do #337: as linhas de continuacao so contam se a cadeia nasce no proprio runner.
  test("suites em paralelo: o `exec` antes do runner (o do ci.yml) nao parte a contagem (#337)", (dir) =>
    muda(dir, ci(paralelo("test-a", "test-b", "test-c")), ci(paralelo("test-a", "test-b", "test-c").replace("node .agent/scripts/lib/", "exec node .agent/scripts/lib/")),
      "alteracao\n\nTest-Surface: .github/workflows/ci.yml — o exec passa o sinal ao runner"),
    { code: 0, excludes: [`${MSG}:`] });
  test("suites em paralelo: um `--max=N` no runner nao parte a contagem (#337)", (dir) =>
    muda(dir, ci(paralelo("test-a", "test-b", "test-c")), ci(paralelo("test-a", "test-b", "test-c").replace("suites-em-paralelo.mjs --", "suites-em-paralelo.mjs --max=2 --")),
      "alteracao\n\nTest-Surface: .github/workflows/ci.yml — so fixa o tecto"),
    { code: 0, excludes: [`${MSG}:`] });
  test("suites em paralelo: trocar o `node` do runner por `echo` faz a contagem descer (#337)", (dir) =>
    muda(dir, ci(paralelo("test-a", "test-b", "test-c")), ci(paralelo("test-a", "test-b", "test-c").replace("node .agent/scripts/lib/", "echo .agent/scripts/lib/"))), {
      code: 1,
      includes: [`${MSG}: 3 -> 1`],
    });
  test("suites em paralelo: um `suites-em-paralelo.mjs` NOUTRO sitio nao e o runner, e a contagem desce (#337)", (dir) =>
    muda(dir, ci(paralelo("test-a", "test-b", "test-c")), ci(paralelo("test-a", "test-b", "test-c").replace("node .agent/scripts/lib/", "node .github/"))), {
      code: 1,
      includes: [`${MSG}: 3 -> 1`],
    });
  test("suites em paralelo: apagar a linha do runner faz a contagem descer (#337)", (dir) =>
    muda(dir, ci(paralelo("test-a", "test-b", "test-c")), ci(paralelo("test-a", "test-b", "test-c").replace("          node .agent/scripts/lib/suites-em-paralelo.mjs -- \\\n", ""))), {
      code: 1,
      includes: [`${MSG}: 3 -> 1`],
    });
  // AS SUITES NA LINHA DO RUNNER (#383): a forma de uma linha e a mista. Com o trailer, o gate da maquinaria cala-se
  // (tem saida); o que fica e a CONTAGEM, que nao tem. Sem a 4.a alternativa, esta dava 0 -> 0 (ou 1 -> 1) e calava.
  const linha = (...ss) => `      - name: suites\n        run: exec node .agent/scripts/lib/suites-em-paralelo.mjs -- ${ss.map((s) => `node .agent/scripts/tests/${s}.mjs`).join(" ")}\n`;
  const misto = (s, ...ss) => bloco("suites", `exec node .agent/scripts/lib/suites-em-paralelo.mjs -- node .agent/scripts/tests/${s}.mjs \\`, ...ss.map((x, i) => `  node .agent/scripts/tests/${x}.mjs${i < ss.length - 1 ? " \\" : ""}`));
  const COM_TRAILER = "alteracao\n\nTest-Surface: .github/workflows/ci.yml — o caso do teste";
  test("suites na linha do runner: tirar uma da forma de uma linha faz a contagem descer, com o trailer (#383)", (dir) =>
    muda(dir, ci(linha("test-a", "test-b")), ci(linha("test-a")), COM_TRAILER), { code: 1, includes: [`${MSG}: 2 -> 1`] });
  test("suites na linha do runner: tirar a da linha do runner na forma mista faz a contagem descer (#383)", (dir) =>
    muda(dir, ci(misto("test-a", "test-b", "test-c")), ci(misto("test-b", "test-c")), COM_TRAILER), { code: 1, includes: [`${MSG}: 3 -> 2`] });
  test("suites na linha do runner: um `--max=2` na forma de uma linha nao faz a contagem descer (#383)", (dir) =>
    muda(dir, ci(linha("test-a", "test-b")), ci(linha("test-a", "test-b").replace("mjs --", "mjs --max=2 --")), COM_TRAILER), { code: 0, excludes: [`${MSG}:`] });
  // A marca "falha engolida" le o bloco como a shell o executa (`comoORunnerExecuta` junta as continuacoes):
  // um `|| true` numa linha propria, no fim da lista, e a mesma falha engolida.
  test("suites em paralelo: um `|| true` numa linha de continuacao propria e marcado (#337)", (dir) =>
    muda(dir, ci(paralelo("test-a", "test-b")), ci(paralelo("test-a", "test-b").replace(/test-b\.mjs\n/, "test-b.mjs \\\n            || true\n"))), {
      code: 1,
      includes: ["falha engolida"],
    });

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
      ci(sweep, bloco("backlog", "set -euo pipefail", "node .agent/scripts/check-backlog.mjs")),
      // O passo do gate MUDOU (ganhou o `set -euo pipefail`): o gate do #285 avisa, e o trailer e a
      // saida. O que este caso mede continua a ser a CONTAGEM, que nao pode descer.
      "alteracao\n\nTest-Surface: .github/workflows/ci.yml — so ganha o pipefail"),
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

  // Com o trailer (#362): o passo `dois` muda ANTES de um passo da maquinaria (o `hook`) e passa a correr so
  // `node a-check.mjs`, fora da maquinaria — um `run:` mudado e um passo novo, e o gate di-lo. Este caso mede a
  // CONTAGEM; o trailer tira o aviso do gate, e a assercao sobre a contagem fica igual.
  test("um step com DOIS `node` conta uma vez: tirar o segundo nao desce", (dir) =>
    muda(dir,
      ci(bloco("dois", "node a-check.mjs", "node b-check.mjs"), hook),
      ci(bloco("dois", "node a-check.mjs"), hook),
      "alteracao\n\nTest-Surface: .github/workflows/ci.yml — o caso mede a contagem"),
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
    const nome = "bloco `run: |`: brancos, vazias, longas, indentacao de 2000 espacos e 30 mil suites numa linha medem-se em < 5 s";
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
        (["        run: |", ...Array(300).fill(fundo + "echo" + " y".repeat(1000)), "      - name: fim"].join("\\n") + "\\n").match(g);
        // A 4.a alternativa (#383): sem a ancora \`(?<=\\S)\`, uma suite depois de 2000 espacos levava ~7,7 s; sem o
        // teto, 30 mil suites numa linha (com e sem o runner a frente) levavam ~50 s.
        (["        run: |", ...Array(300).fill(fundo + "node .agent/scripts/tests/test-x.mjs"), "      - name: fim"].join("\\n") + "\\n").match(g);
        const s = " node .agent/scripts/tests/test-x.mjs".repeat(30000);
        for (const l of ["      - run: exec node .agent/scripts/lib/suites-em-paralelo.mjs --", "      - run: echo"]) (l + s + "\\n").match(g);
        // A 3.a com essas 30 mil na linha do runner e uma cadeia de 300 linhas depois (2.a leitura do #383): ~0,4 s.
        ("        run: |\\n          exec node .agent/scripts/lib/suites-em-paralelo.mjs --" + s + " \\\\\\n" + "            node x \\\\\\n".repeat(300) + "            node y\\n").match(g);`;
      let problemas = [];
      try {
        execFileSync(process.execPath, ["-e", codigo], { timeout: 5000, stdio: "ignore" });
      } catch (err) {
        problemas = [err.signal ? `nao terminou em 5 s (${err.signal}) — backtracking?` : `rebentou: ${err.message}`];
      }
      registarResultado(nome, problemas, "");
    }
  }

  // --- O passo das suites em paralelo como um CONJUNTO (#341) ---------------------------------------------
  // So contam as suites da CADEIA estrita que nasce no runner; o resto fica na unidade fixa, por ordem.
  const MUDOU = "passo da maquinaria mudou ou saiu";
  const P = (...ss) => paralelo(...ss).replace("node .agent/scripts/lib/", "exec node .agent/scripts/lib/");
  const T = (s) => `node .agent/scripts/tests/${s}.mjs`;
  const TRAILER = "alteracao\n\nTest-Surface: .github/workflows/ci.yml — o caso do teste";
  const calado = { code: 0, excludes: [MUDOU, "fora da cadeia"] };
  const avisa = (...inc) => ({ code: 1, includes: [MUDOU, ...inc] });
  for (const [nome, antes, depois, espera] of [
    ["uma suite nova no FIM da cadeia nao avisa", P("test-a", "test-b"), P("test-a", "test-b", "test-c"), calado],
    ["uma suite nova a MEIO da cadeia nao avisa", P("test-a", "test-b"), P("test-a", "test-c", "test-b"), calado],
    ["reordenar as suites nao avisa", P("test-a", "test-b", "test-c"), P("test-c", "test-a", "test-b"), calado],
    ["o runner com `--max=2` e uma suite nova nao avisa", P("test-a").replace("mjs --", "mjs --max=2 --"), P("test-a", "test-b").replace("mjs --", "mjs --max=2 --"), calado],
    ["tirar uma suite avisa, com o nome dela", P("test-a", "test-b", "test-c"), P("test-a", "test-c"), avisa(`${MUDOU}: ${T("test-b")}`)],
    ["uma suite repetida, e tirar uma das duas, avisa", P("test-a", "test-b", "test-b"), P("test-a", "test-b"), avisa(`${MUDOU}: ${T("test-b")}`)],
    ["uma suite nova ANTES do `exec` avisa, e diz que fica antes do runner", P("test-a", "test-b"), P("test-a", "test-b").replace("exec node", `${T("test-c")} \\\n          exec node`), avisa("ANTES do runner")],
    ["uma suite movida para antes do `exec` avisa", P("test-a", "test-b", "test-c"), P("test-a", "test-b").replace("exec node", `${T("test-c")} \\\n          exec node`), avisa("ANTES do runner")],
    ["uma linha vazia a meio da cadeia avisa", P("test-a", "test-b"), P("test-a", "test-b").replace(`${T("test-a")} \\\n`, `${T("test-a")} \\\n\n`), avisa()],
    ["um comentario a meio da cadeia avisa", P("test-a", "test-b"), P("test-a", "test-b").replace(`${T("test-a")} \\\n`, `${T("test-a")} \\\n          # x\n`), avisa()],
    ["um comentario no fim de uma linha da cadeia (`\\ # c`) avisa", P("test-a", "test-b", "test-c"), P("test-a", "test-b", "test-c").replace(`${T("test-b")} \\`, `${T("test-b")} \\ # c`), avisa()],
    ["um comentario antes do `\\` (`# \\`) avisa", P("test-a", "test-b", "test-c"), P("test-a", "test-b", "test-c").replace(`${T("test-b")} \\`, `${T("test-b")} # \\`), avisa()],
    ["um `\\` seguido de espacos avisa", P("test-a", "test-b", "test-c"), P("test-a", "test-b", "test-c").replace(`${T("test-b")} \\`, `${T("test-b")} \\  `), avisa()],
    ["tirar o `exec` avisa", P("test-a", "test-b"), paralelo("test-a", "test-b"), avisa()],
    ["mudar o caminho do runner avisa", P("test-a", "test-b"), P("test-a", "test-b").replace("lib/suites-em-paralelo.mjs", "lib/outro.mjs"), avisa()],
    ["um `exit 0` antes do `exec` avisa", P("test-a", "test-b"), P("test-a", "test-b").replace("exec node", "exit 0\n          exec node"), avisa()],
    ["um `node <suite> || true` na cadeia avisa", P("test-a", "test-b"), P("test-a", "test-b").replace(`${T("test-a")} \\`, `${T("test-a")} \\\n            ${T("test-x")} || true \\`), avisa()],
    ["mudar o `name:` do passo avisa", P("test-a", "test-b"), P("test-a", "test-b").replace("name: suites", "name: outras"), avisa()],
    ["`run: |` trocado por `run: >` avisa", P("test-a", "test-b"), P("test-a", "test-b").replace("run: |", "run: >"), avisa()],
    ["uma linha nova DEPOIS da cadeia avisa (a fixa mudou)", P("test-a", "test-b"), P("test-a", "test-b").replace(`${T("test-b")}\n`, `${T("test-b")}\n          echo fim\n`), avisa()],
    ["uma suite movida para um passo-GEMEO (o mesmo `name:`) com `exit 0` antes do runner avisa", P("test-a", "test-b"), P("test-a") + P("test-b").replace("exec node", "exit 0\n          exec node"), avisa()],
    ["tabs entre o `node` e o caminho contam como suite (nao avisa)", P("test-a", "test-b"), P("test-a", "test-b", "test-c").replace(`node .agent/scripts/tests/test-c.mjs`, "node\t.agent/scripts/tests/test-c.mjs"), calado],
  ]) test(`paralelo como conjunto: ${nome} (#341)`, (dir) => muda(dir, ci(antes), ci(depois)), espera);
  // Mudar o cabecalho do JOB: um aviso so, pelo job (a deduplicacao do `verificaGate`), e nao um por suite.
  test("paralelo como conjunto: mudar o cabecalho do job avisa UMA vez, pelo job (#341)", (dir) =>
    muda(dir, ci(P("test-a", "test-b")), ci(P("test-a", "test-b")).replace("  t:\n", "  t:\n    env:\n      X: y\n")), { code: 1, includes: ["o cabecalho do job `t` mudou"], excludes: [MUDOU] });
  // Um `\` em falta a meio (o `test-c` deixa de correr): o portao avisa e nomeia-o; com o trailer, a CONTAGEM
  // continua a reprovar (`3 -> 2`), e essa nao tem saida — e a defesa que fica (R12; sem o `\` no `test-a` seria 3 -> 1).
  const semBarra = P("test-a", "test-b", "test-c").replace(`${T("test-b")} \\`, T("test-b"));
  test("paralelo como conjunto: um `\\` em falta a meio avisa, e nomeia a suite que ficou fora (#341)", (dir) =>
    muda(dir, ci(P("test-a", "test-b", "test-c")), ci(semBarra)), avisa(`${T("test-c")} fora da cadeia`));
  test("paralelo como conjunto: com o trailer, um `\\` em falta continua a reprovar pela contagem (#341)", (dir) =>
    muda(dir, ci(P("test-a", "test-b", "test-c")), ci(semBarra), TRAILER), { code: 1, includes: [`${MSG}: 3 -> 2`] });
  test("paralelo como conjunto: o ci.yml com CRLF parte-se como o LF (#341)", (dir) =>
    muda(dir, ci(P("test-a", "test-b")).replace(/\n/g, "\r\n"), ci(P("test-a", "test-b", "test-c")).replace(/\n/g, "\r\n")), calado);
  // O `ci.yml` REAL: a particao corre onde importa. As suites da cadeia sao as que o `suitesQueOCICorre` le, e ha
  // uma so fixa — sem um numero escrito a mao (era o atrito que o #341 tira, levado para o teste).
  {
    const real = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const us = unidadesDaMaquinaria(real).filter((u) => u.job === "guard-tests:");
    // So as unidades que a PARTICAO criou (o `<suite>` na chave): um passo `run: node <suite>` inteiro (o CI antigo,
    // passo a passo) tem o mesmo rotulo, e contava-se como cadeia num derivado na v0.60 (o `simulate-upgrade`).
    const daCadeia = [...new Set(us.filter((u) => u.passo.includes("\n<suite>\n")).map((u) => u.rotulo.replace(/^node[ \t]+/, "")))].sort();
    const lidas = [...suitesQueOCICorre(real)].sort();
    // Um DERIVADO que ainda corre as suites passo a passo (adotar o runner e opcional, a 2b di-lo) nao tem cadeia:
    // SKIP, com o teste registado na mesma. No template, sem cadeia reprova (o `simulate-upgrade` apanhou-o).
    // "Sem runner" = nenhuma unidade FIXA do runner no job. Nao pelas listas: o `suitesQueOCICorre` tambem le os passos
    // `run: node <suite>` um a um, e num derivado passo a passo nunca vem vazio (a 3.a volta do `simulate-upgrade`).
    const fixasDoRunner = us.filter((u) => RUNNER.test(u.rotulo.replace(/[ \t]+\\$/, ""))).length;
    const semRunner = fixasDoRunner === 0;
    if (semRunner && ehDerivado((rel) => leOuNull(join(ROOT, rel)))) {
      console.log("  SKIP  paralelo como conjunto: o ci.yml deste projeto nao corre as suites pelo runner em paralelo (#341)");
      registarResultado("paralelo como conjunto: sem o runner num derivado, nada a medir no ci.yml real (#341)", [], "");
    } else registarResultado("paralelo como conjunto: no ci.yml real, as suites da cadeia sao as que o runner corre, e ha uma fixa (#341)", [
      ...(daCadeia.length > 0 && JSON.stringify(daCadeia) === JSON.stringify(lidas) ? [] : [`a cadeia deu ${JSON.stringify(daCadeia)}, o suitesQueOCICorre ${JSON.stringify(lidas)}`]),
      ...(us.filter((u) => RUNNER.test(u.rotulo.replace(/[ \t]+\\$/, ""))).length === 1 ? [] : ["nao ha exactamente uma unidade fixa do runner"]),
    ], "");
  }
  // O regex do runner contra o da CONTAGEM (R14): as mesmas variantes, o mesmo veredicto. Fica de fora o `\` seguido
  // de espacos, onde divergem de proposito (aqui fecha a cadeia, como no `bash`).
  {
    const conta = CONTAGENS.find((c) => c.msg === MSG).re;
    const contados = (t) => (t.match(new RegExp(conta.source, conta.flags.includes("g") ? conta.flags : `${conta.flags}g`)) ?? []).length;
    const variantes = ["exec node .agent/scripts/lib/suites-em-paralelo.mjs --", "node .agent/scripts/lib/suites-em-paralelo.mjs --", "node ./.agent/scripts/lib/suites-em-paralelo.mjs --", "exec node .agent/scripts/lib/suites-em-paralelo.mjs --max=2 --", "echo .agent/scripts/lib/suites-em-paralelo.mjs --"];
    registarResultado("paralelo como conjunto: o runner reconhece-se como a contagem o reconhece (#341)", variantes.flatMap((v) => {
      const texto = ci(bloco("suites", `${v} \\`, `  ${T("test-a")} \\`, `  ${T("test-b")} \\`, `  ${T("test-c")}`));
      const ls = texto.split("\n").slice(3, -1);
      const parte = partePasso(ls, ls, (x) => x.join("\n"));
      return (parte !== null) === (contados(texto) === 3) ? [] : [`"${v}": a particao ${parte ? "reconhece" : "nao reconhece"}, a contagem deu ${contados(texto)}`];
    }), "");
  }
}
