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
import { test, file, readF, writeF } from "./test-harness.mjs";
import { TETOS } from "./guards/sizes.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-sizes.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
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

  test("G17: ficheiro congelado que ENCOLHE (sem chegar ao limite) nao avisa", (dir) => {
    // Encolher para um valor entre o LIMITE (500) e o teto: nao pode avisar. O numero e
    // derivado do teto real, nao fixado — fixa-lo aqui obrigava a mexer neste teste sempre
    // que o ficheiro encolhesse, e foi o que aconteceu ao re-congelar o teto em 590.
    const teto = TETOS[CONGELADO];
    const alvo = Math.floor((500 + teto) / 2);
    writeF(dir, CONGELADO, readF(dir, CONGELADO).split("\n").slice(0, alvo).join("\n") + "\n");
  }, { code: 0, includes: ["tamanho de ficheiro:"] });

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
