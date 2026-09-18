/**
 * Testes do Guard 17 (tamanho de ficheiro) — {{PROJECT_NAME}}
 *
 * Espelha `guards/sizes.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco e
 * chama `registar()`.
 *
 * A fixture MEXE nos ficheiros reais do sandbox (`TP3`): a catraca so tem significado contra
 * contagens verdadeiras, e um ficheiro sintetico de 600 linhas provaria apenas que o guard
 * sabe contar — nao que os tetos apontam para os ficheiros certos.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { test, file, readF, writeF } from "./harness/test-harness.mjs";
import { TETOS } from "../guards/sizes.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-sizes.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Um dos ficheiros congelados em TETOS — **DERIVADO**, nunca escrito a mao.
 *
 *  Os `TETOS` sao por natureza do PROJETO: sao contagens de linhas dos ficheiros dele. Qualquer
 *  derivado os reescreve, e no momento em que o faz sem incluir o nome que estivesse cravado
 *  aqui, estes testes rebentam no setup com `ENOENT`. Aconteceu num derivado real: os dois
 *  ficheiros acima de 500 linhas eram outros, e quatro testes ficaram vermelhos a apontar para
 *  um caminho que os `TETOS` dele nao tinham.
 *
 *  O `guardFileSizes` ja trata a pasta ausente (`noAlcance`, `ausentes`) — o cuidado estava no
 *  guard e faltava no teste dele.
 *
 *  **Exclui o proprio verificador e os seus modulos**: estes testes truncam e esvaziam o
 *  ficheiro escolhido, e faze-lo ao `check-doc-versions.mjs` (ou a um `guards/*.mjs`) rebenta
 *  quem esta a correr, em vez de produzir o aviso que se quer medir. */
const CONGELADO = Object.keys(TETOS).find(
  (f) => !/check-doc-versions\.mjs$|\/guards\/|\/lib\//.test(f)
);
if (!CONGELADO) {
  throw new Error(
    "tests-sizes: nenhuma entrada de TETOS serve de cobaia (todas sao o verificador ou modulos dele). " +
      "Acrescentar um teto de um ficheiro que os testes possam truncar, ou ajustar a exclusao."
  );
}

export function registar() {
  // --- O estado limpo do repo ------------------------------------------------
  test("G17: o repo como esta passa — nenhum congelado cresceu", null, {
    code: 0,
    includes: ["tamanho de ficheiro:", "nenhum a crescer"],
  });

  // --- Um ficheiro NOVO acima do limite -------------------------------------
  // O caso que a regra sempre descreveu e que ninguem media: alguem escreve um verificador
  // de 600 linhas e o `core-rules.md` limita-se a ter razao em silencio.
  test("G17: ficheiro novo acima de 500 linhas avisa", (dir) => {
    writeF(dir, ".agent/scripts/guards/inchado.mjs", "// linha\n".repeat(600));
  }, { code: 1, includes: ["guards/inchado.mjs tem 600 linhas (> 500)", "splitting obrigatorio"] });

  test("G17: ficheiro novo DENTRO do limite nao avisa", (dir) => {
    writeF(dir, ".agent/scripts/guards/curto.mjs", "// linha\n".repeat(499));
  }, { code: 0, includes: ["tamanho de ficheiro:"] });

  // O limite e `> 500`, nao `>= 500`. Sem este teste, trocar o operador passava despercebido
  // — e a fronteira e o unico sitio onde um guard de contagem costuma estar errado.
  test("G17: exatamente 500 linhas ainda cabe", (dir) => {
    writeF(dir, ".agent/scripts/guards/fronteira.mjs", "// linha\n".repeat(500));
  }, { code: 0, includes: ["tamanho de ficheiro:"] });

  test("G17: 501 linhas ja nao cabe", (dir) => {
    writeF(dir, ".agent/scripts/guards/fronteira.mjs", "// linha\n".repeat(501));
  }, { code: 1, includes: ["fronteira.mjs tem 501 linhas (> 500)"] });

  // --- A catraca: os congelados so podem ENCOLHER ----------------------------
  test("G17: ficheiro congelado que CRESCE avisa", (dir) => {
    // Quantas linhas acrescentar deriva do TETO e do tamanho ATUAL — uma so nao chega quando
    // o ficheiro encolheu e ficou com folga, e fixar o numero aqui obrigava a mexer neste
    // teste a cada extraccao. Foi o que aconteceu ao extrair `lib/verbos-git.mjs`.
    const atual = readF(dir, CONGELADO).replace(/\n$/, "").split("\n").length;
    const faltam = TETOS[CONGELADO] - atual + 1;
    writeF(dir, CONGELADO, readF(dir, CONGELADO) + "// mais uma linha\n".repeat(Math.max(1, faltam)));
  }, { code: 1, includes: ["o teto congelado e", "so pode ENCOLHER"] });

  // --- A catraca tem de FECHAR, e este teste dizia o contrario ----------------
  //
  // A versao anterior afirmava que encolher entre o LIMITE e o teto **nao avisa**, com
  // `code: 0`. Consagrava o buraco: um ficheiro congelado a 600 que descesse para 520 nao
  // disparava ramo nenhum e podia voltar a crescer 80 linhas em silencio. Uma catraca que
  // permite recuperar o terreno perdido nao e uma catraca — e havia um teste a garantir que
  // continuasse assim.
  //
  // A regra ja estava escrita no comentario da propria tabela ("RE-CONGELA a cada descida") e
  // era cumprida a mao. Medido no dia em que o ramo nasceu: o `test-guards.mjs` estava a 510
  // com o teto em 525, com 15 linhas de folga por reclamar.
  test("G17: ficheiro congelado que ENCOLHE manda reclamar a folga", (dir) => {
    // O alvo e DERIVADO do teto real, e nao fixado: fixa-lo obrigava a mexer neste teste
    // sempre que o ficheiro encolhesse, e foi o que aconteceu ao re-congelar o teto em 590.
    const teto = TETOS[CONGELADO];
    const alvo = Math.floor((500 + teto) / 2);
    writeF(dir, CONGELADO, readF(dir, CONGELADO).split("\n").slice(0, alvo).join("\n") + "\n");
    return { includes: [`Baixar o teto para ${alvo}`, "folga ficou por reclamar"] };
  }, { code: 1 });

  // O CONTRA-CASO, e sem ele o de cima era satisfeito por um guard que avisasse SEMPRE que
  // existisse uma entrada em TETOS: no teto exacto nao ha folga nenhuma a reclamar.
  test("G17: ficheiro congelado EXACTAMENTE no teto nao avisa", (dir) => {
    const teto = TETOS[CONGELADO];
    const linhas = readF(dir, CONGELADO).replace(/\n$/, "").split("\n");
    const corpo = linhas.slice(0, teto - 1).join("\n");
    writeF(dir, CONGELADO, corpo + "\n" + "// enche ate ao teto\n".repeat(teto - (teto - 1)));
    return { excludes: ["folga ficou por reclamar", "so pode ENCOLHER"] };
  }, { code: 0 });

  // --- A excecao nao sobrevive ao problema -----------------------------------
  // Sem isto, um ficheiro dividido ate as 200 linhas ficava com a entrada de TETOS para
  // sempre, e a proxima pessoa lia-a como licenca para voltar a crescer ate 668.
  test("G17: congelado que ja cabe no limite manda remover a entrada", (dir) => {
    writeF(dir, CONGELADO, "// linha\n".repeat(120));
  }, { code: 1, includes: ["ja cabe no limite de 500", "remover a entrada de TETOS"] });

  test("G17: TETOS a citar um ficheiro que nao existe avisa", (dir) => {
    rmSync(file(dir, CONGELADO), { force: true });
  }, { code: 1, includes: ["que nao existe", "renomeado ou removido"] });
}
