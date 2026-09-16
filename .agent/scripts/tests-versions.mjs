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
import { test, readF, writeF } from "./test-harness.mjs";
import { pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-versions.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
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
    const depois = antes.replace(LISTA, "const CHECKS = [];");
    if (depois === antes) throw new Error(`nao encontrei o array CHECKS em ${GUARD_VERSOES}`);
    writeF(dir, GUARD_VERSOES, depois);
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
}
