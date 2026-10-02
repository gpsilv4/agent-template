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
import { test, file, readF, writeF, registarResultado } from "./harness/test-harness.mjs";
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
// Quando NAO ha nenhum — `TETOS = {}`, o estado que a catraca quer atingir —, a suite rebentava
// ao carregar e levava o `test-guards` inteiro com ela (#186). Passa a usar uma cobaia
// SINTETICA, que cada teste monta na sandbox (o ficheiro e a sua entrada em `TETOS`): perde-se a
// prova "os tetos apontam para os ficheiros certos", que so faz sentido com tetos, e mantem-se
// a da catraca.
export function escolheCobaia(tetos) {
  const rel = Object.keys(tetos).find((f) => !/check-doc-versions\.mjs$|\/guards\/|\/lib\//.test(f));
  return rel ? { rel, teto: tetos[rel], sintetica: false } : { rel: ".agent/scripts/cobaia-do-teto.mjs", teto: 600, sintetica: true };
}
const COBAIA = escolheCobaia(TETOS);
const SINTETICA = escolheCobaia({});

/** Monta a cobaia sintetica na sandbox. A real ja la esta. */
function prepara(dir, c) {
  if (!c.sintetica) return;
  writeF(dir, c.rel, "// linha\n".repeat(c.teto));
  const g = ".agent/scripts/guards/sizes.mjs";
  const antes = readF(dir, g);
  const depois = antes.replace("export const TETOS = {", `export const TETOS = {\n  ${JSON.stringify(c.rel)}: ${c.teto},`);
  if (depois === antes) throw new Error(`nao encontrei \`export const TETOS = {\` em ${g}`);
  writeF(dir, g, depois);
}

export function registar() {
  // #186: com `TETOS = {}` (ou so com entradas que nao se podem truncar), a escolha cai na
  // sintetica em vez de rebentar ao carregar. E com uma entrada utilizavel, usa a real.
  registarResultado("G17: sem cobaia em TETOS, a suite usa uma sintetica e nao rebenta", [
    ...(escolheCobaia({}).sintetica ? [] : ["TETOS vazio nao deu a sintetica"]),
    ...(escolheCobaia({ ".agent/scripts/guards/x.mjs": 510 }).sintetica ? [] : ["so um guard em TETOS nao deu a sintetica"]),
    ...(escolheCobaia({ ".agent/scripts/x.mjs": 510 }).rel === ".agent/scripts/x.mjs" ? [] : ["com uma entrada utilizavel nao a usou"]),
  ]);

  // --- O estado limpo do repo ------------------------------------------------
  test("G17: o repo como esta passa — nenhum congelado cresceu", null, {
    code: 0,
    includes: ["tamanho de ficheiro:", "nenhum a crescer"],
  });

  // --- Um ficheiro NOVO acima do limite -------------------------------------
  // O caso que a regra sempre descreveu e que ninguem media: alguem escreve um verificador
  // de 600 linhas e o `core-rules.md` limita-se a ter razao em silencio.
  test("G17: ficheiro novo acima de 500 linhas avisa", (dir) => {
    // Em `lib/` e nao em `guards/`: um `.mjs` em `guards/` que ninguem chama passou a avisar (#176),
    // e estes casos medem o TAMANHO — qualquer pasta da maquinaria serve.
    writeF(dir, ".agent/scripts/lib/inchado.mjs", "// linha\n".repeat(600));
  }, { code: 1, includes: ["lib/inchado.mjs tem 600 linhas (> 500)", "splitting obrigatorio"] });

  test("G17: ficheiro novo DENTRO do limite nao avisa", (dir) => {
    writeF(dir, ".agent/scripts/lib/curto.mjs", "// linha\n".repeat(499));
  }, { code: 0, includes: ["tamanho de ficheiro:"] });

  // O limite e `> 500`, nao `>= 500`. Sem este teste, trocar o operador passava despercebido
  // — e a fronteira e o unico sitio onde um guard de contagem costuma estar errado.
  test("G17: exatamente 500 linhas ainda cabe", (dir) => {
    writeF(dir, ".agent/scripts/lib/fronteira.mjs", "// linha\n".repeat(500));
  }, { code: 0, includes: ["tamanho de ficheiro:"] });

  test("G17: 501 linhas ja nao cabe", (dir) => {
    writeF(dir, ".agent/scripts/lib/fronteira.mjs", "// linha\n".repeat(501));
  }, { code: 1, includes: ["fronteira.mjs tem 501 linhas (> 500)"] });

  // --- A catraca: os congelados so podem ENCOLHER ----------------------------
  // A catraca, contra a cobaia do repo e contra a sintetica: os dois caminhos tem de medir.
  for (const [rotulo, C] of [["", COBAIA], [" (cobaia sintetica)", SINTETICA]]) {
  test(`G17: ficheiro congelado que CRESCE avisa${rotulo}`, (dir) => {
    prepara(dir, C);
    // Quantas linhas acrescentar deriva do TETO e do tamanho ATUAL — uma so nao chega quando
    // o ficheiro encolheu e ficou com folga, e fixar o numero aqui obrigava a mexer neste
    // teste a cada extraccao. Foi o que aconteceu ao extrair `lib/verbos-git.mjs`.
    const atual = readF(dir, C.rel).replace(/\n$/, "").split("\n").length;
    const faltam = C.teto - atual + 1;
    writeF(dir, C.rel, readF(dir, C.rel) + "// mais uma linha\n".repeat(Math.max(1, faltam)));
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
  test(`G17: ficheiro congelado que ENCOLHE manda reclamar a folga${rotulo}`, (dir) => {
    prepara(dir, C);
    // O alvo e DERIVADO do teto real, e nao fixado: fixa-lo obrigava a mexer neste teste
    // sempre que o ficheiro encolhesse, e foi o que aconteceu ao re-congelar o teto em 590.
    const teto = C.teto;
    const alvo = Math.floor((500 + teto) / 2);
    writeF(dir, C.rel, readF(dir, C.rel).split("\n").slice(0, alvo).join("\n") + "\n");
    return { includes: [`Baixar o teto para ${alvo}`, "folga ficou por reclamar"] };
  }, { code: 1 });

  // O CONTRA-CASO, e sem ele o de cima era satisfeito por um guard que avisasse SEMPRE que
  // existisse uma entrada em TETOS: no teto exacto nao ha folga nenhuma a reclamar.
  test(`G17: ficheiro congelado EXACTAMENTE no teto nao avisa${rotulo}`, (dir) => {
    prepara(dir, C);
    const teto = C.teto;
    const linhas = readF(dir, C.rel).replace(/\n$/, "").split("\n");
    const corpo = linhas.slice(0, teto - 1).join("\n");
    writeF(dir, C.rel, corpo + "\n" + "// enche ate ao teto\n".repeat(teto - (teto - 1)));
    return { excludes: ["folga ficou por reclamar", "so pode ENCOLHER"] };
  }, { code: 0 });

  // --- A excecao nao sobrevive ao problema -----------------------------------
  // Sem isto, um ficheiro dividido ate as 200 linhas ficava com a entrada de TETOS para
  // sempre, e a proxima pessoa lia-a como licenca para voltar a crescer ate 668.
  test(`G17: congelado que ja cabe no limite manda remover a entrada${rotulo}`, (dir) => {
    prepara(dir, C);
    writeF(dir, C.rel, "// linha\n".repeat(120));
  }, { code: 1, includes: ["ja cabe no limite de 500", "remover a entrada de TETOS"] });

  test(`G17: TETOS a citar um ficheiro que nao existe avisa${rotulo}`, (dir) => {
    prepara(dir, C);
    rmSync(file(dir, C.rel), { force: true });
  }, { code: 1, includes: ["que nao existe", "renomeado ou removido"] });
  }
}
