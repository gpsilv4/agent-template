/**
 * Testes dos guards de VERSOES de dependencias (`guards/versions.mjs`) — {{PROJECT_NAME}}
 *
 * Espelha o guard. NAO e um entry point: o `test-guards.mjs` importa e chama `registar()`.
 *
 * PORQUE VIVE A PARTE: o `test-guards.mjs` esta congelado nos `TETOS` do Guard 17, e a
 * catraca so desce. Ao corrigir a fixture do primeiro teste daqui — que lia a `CHECKS` do
 * repo em vez de a montar — o ficheiro cresceu e a catraca disparou, com razao. Extrair e o
 * que o `core-rules.md` manda fazer acima das 500 linhas; afrouxar o teto seria trocar a
 * regra pelo que da menos trabalho.
 *
 * A LICAO QUE ESTES DOIS TESTES CARREGAM: a fixture **monta** a configuracao que quer medir.
 * O `CHECKS` e opt-in e vem vazio no template — mas um projeto derivado preenche-o, que e
 * para isso que existe. Um teste que assuma a lista vazia esta a afirmar sobre o estado do
 * repo e nao sobre o guard, e fica vermelho no consumidor sem nada estar partido (`TP3`).
 */
import { rmSync } from "fs";
import { test, readF, writeF, file } from "./harness/test-harness.mjs";
import { aplica } from "../lib/patch.mjs";
import { pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-versions.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

/** O ficheiro do guard, escrito uma vez: os dois testes mexem no mesmo literal, e duas copias
 *  do caminho divergiam no dia em que o guard mudasse de casa (ja mudou uma vez). */
const GUARD_VERSOES = ".agent/scripts/guards/versions.mjs";
const LISTA = /const CHECKS = \[[\s\S]*?\n\];/;

export function registar() {
// A fixture ESVAZIA a `CHECKS`, em vez de assumir que o repo a tem vazia — a mesma forma que
  // o `BANNED` ja usava acima, e pela mesma razao (`TP3`). Este teste lia o estado do repo: num
  // derivado que preencha a lista — que e para isso que o opt-in existe — o `SKIP` nao aparece e
  // o teste fica vermelho sem nada estar partido.
  //
  // O template aprendeu esta licao no `BANNED`, escreveu-a, e nao a propagou. Apanhado por um
  // derivado real, e depois pelo `simulate-derived.mjs` no bloco 3d.
  test("Guards de deps: lista CHECKS vazia da SKIP visivel (opt-in)", (dir) => {
    const antes = readF(dir, GUARD_VERSOES);
    // `ja-estava` nao e falha: um projeto que ja tenha `const CHECKS = [];` numa linha esta no
    // estado que esta fixture quer montar. A versao anterior colapsava-o com "nao encontrei o
    // array", e a mensagem mandava procurar um literal que esta la. Ver `lib/patch.mjs`.
    const r = aplica(antes, LISTA, "const CHECKS = [];");
    if (r.estado === "sem-alvo") throw new Error(`nao encontrei o array CHECKS em ${GUARD_VERSOES}`);
    writeF(dir, GUARD_VERSOES, r.texto);
  }, {
    // Opt-in por defeito. Um opt-in silencioso e indistinguivel de um guard partido.
    code: 0,
    includes: ["SKIP  Guards de versoes de dependencias — lista CHECKS vazia"],
  });
  
  test("Guards de deps: com CHECKS mas sem package.json da SKIP visivel", (dir) => {
    // `CHECKS` e opt-in e vem vazio; preencher e a unica forma de chegar ao ramo seguinte.
    writeF(dir, GUARD_VERSOES, readF(dir, GUARD_VERSOES).replace(
      LISTA,
      'const CHECKS = [{ name: "Next.js", pkg: "next", pattern: /Next\\.js\\s+(\\d+)/g, files: [".agent/rules/core-rules.md"] },\n];'));
  }, { code: 0, includes: ["SKIP  Guards de versoes de dependencias — sem package.json"] });

  // --- Guard 3 (versao do package.json vs CHANGELOG) ------------------------------
  // Viviam INLINE no `test-guards.mjs`. A varredura poe o modulo dono do alvo a correr primeiro
  // (#156), e o dono do `guards/versions.mjs` e ESTE modulo pela convencao — mas so tinha os dois
  // testes das deps acima. Os 7 sitios do Guard 3 eram mortos de fora do dono, e cada mutante
  // pagava duas corridas completas (medido: 7 de 10 confirmacoes nos alvos `guards/`).
  test("G3: sem package.json da SKIP visivel", null, {
    code: 0,
    includes: ["SKIP  Guard 3"],
  });

  test("G3: versao divergente avisa", (dir) => {
    writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
    writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## [v1.0.0] - Antiga\n");
  }, { code: 1, includes: ["!= maior versao do CHANGELOG"] });

  test("G3: CHANGELOG ausente com package.json presente avisa", (dir) => {
    writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
    rmSync(file(dir, "src/docs/CHANGELOG.md"));
  }, { code: 1, includes: ["CHANGELOG.md nao encontrado"] });

  test("G3: package.json sem campo version avisa", (dir) => {
    writeF(dir, "package.json", JSON.stringify({ name: "x" }));
  }, { code: 1, includes: ['sem campo "version"'] });

  test("G3: package.json invalido avisa", (dir) => {
    writeF(dir, "package.json", "{ not json,, }");
  }, { code: 1, includes: ["package.json invalido"] });

  test("G3: heading sem brackets e aceito (## v1.2.3)", (dir) => {
    writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
    writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## v1.2.3 - Atual\n");
  }, { code: 0, includes: ["=== package.json"] });

  test("G3: headings sem nenhuma versao valida avisa formato", (dir) => {
    writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
    writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## Release de Marco\n\n## Outra\n");
  }, { code: 1, includes: ["formato invalido"] });

  test("G3: CHANGELOG em ordem ascendente avisa ordenacao", (dir) => {
    writeF(dir, "package.json", JSON.stringify({ name: "x", version: "2.0.0" }));
    writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## [v1.0.0] - Velha\n\n## [v2.0.0] - Nova\n");
  }, { code: 1, includes: ["ordenar por versao decrescente"] });
}
