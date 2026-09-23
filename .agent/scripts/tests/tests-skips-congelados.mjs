/**
 * O conjunto de `SKIP` da fixture sa esta CONGELADO — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-guards.mjs` importa e chama `registar()`.
 *
 * PORQUE EXISTE, e e a parte deste ticket que vale mais do que derivar listas: um guard que
 * SALTA passa por verde. Nao ha vermelho, nao ha aviso, o ecra diz "todos passaram" — e o
 * guard nunca correu.
 *
 * Aconteceu de facto. A lista de ficheiros que a sandbox sintetica copia e escrita a mao, e
 * quando lhe faltou o `src/docs/anti-patterns-why.md` o **Guard 18 deu SKIP em TODOS os
 * testes**. O comentario ao lado dessa lista ainda o regista: *"um guard que salta sempre passa
 * por verde sem nunca ter sido medido"*. Nada o apanhou na altura; apanhou-se a olho.
 *
 * As outras duas vezes que a mesma lista envelheceu falharam ALTO (o Guard 20 a avisar em todos
 * os testes, sete vermelhos de uma vez ao criar o `review-why.md`). Foi sorte: depende de o
 * guard em causa ter uma forma ruidosa de falhar. Este teste tira a sorte da equacao.
 *
 * PORQUE E UMA LISTA CONGELADA E NAO "ZERO SKIPS": nove sao legitimos e medidos — dois
 * ficheiros que o bootstrap gera e ainda nao existem (contados duas vezes, por serem tambem
 * `@import`), o Guard 3 sem `package.json`, o Guard 4 com a lista de termos banidos vazia, o
 * Guard 13 antes do bootstrap, o Guard 16 sem servidor MCP, e os guards de versoes de
 * dependencias com a lista de opt-in vazia. Um teste que exigisse zero seria desligado no
 * mesmo dia.
 *
 * E uma catraca, como os `TETOS` do Guard 17: congela o medido, e um `SKIP` NOVO fica vermelho
 * e nomeia-se. Um que DESAPARECA tambem — se um guard deixou de saltar, ou passou a medir mais
 * (bom, e a entrada sai da lista) ou a fixture mudou de forma (mau, e quer-se saber).
 */
import { pathToFileURL } from "url";
import { sandbox, runGuard, registarResultado } from "./harness/test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-skips-congelados.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Os `SKIP` que a fixture sa produz, com a RAZAO de cada um — sem ela, a proxima pessoa nao
 *  sabe qual pode desaparecer nem porque. Guardam-se por um fragmento estavel da mensagem: a
 *  frase inteira muda quando alguem a melhora, e um teste que reprove por isso e ruido. */
const SKIPS_ESPERADOS = [
  // Os dois ficheiros que a Fase 2.2 do bootstrap GERA. Na fixture ainda nao existem, e isso e
  // o estado correcto de um template por estrear. Contam duas vezes: uma pela existencia do
  // ficheiro, outra pelo `@import` que o CLAUDE.md lhe faz.
  { chave: "business-logic.md — gerado no bootstrap", vezes: 2 },
  { chave: "pages-architecture.md — gerado no bootstrap", vezes: 2 },
  // A fixture nao tem app. E o estado do template nu, e o guard di-lo em vez de o esconder.
  { chave: "Guard 3 (versoes) — sem package.json", vezes: 1 },
  { chave: "Guards de versoes de dependencias", vezes: 1 },
  // Listas de opt-in vazias: o template nao tem termos banidos proprios nem servidor MCP.
  { chave: "Guard 4 (termos banidos) — lista BANNED vazia", vezes: 1 },
  { chave: "Guard 16 (politica MCP) — nenhum servidor configurado", vezes: 1 },
  // O bootstrap ainda nao correu, logo nao ha placeholders por substituir a acusar.
  { chave: "Guard 13 (placeholders) — bootstrap ainda nao correu", vezes: 1 },
];

export function registar() {
  const dir = sandbox();
  const out = runGuard(dir).out ?? "";
  const linhas = out.split("\n").filter((l) => /\bSKIP\b/.test(l));

  const afirma = (nome, problemas) => registarResultado(nome, problemas, out);

  // 1. Nenhum SKIP a mais. E este que apanha a fixture incompleta: um ficheiro que falte faz o
  //    guard que o le saltar, e o salto aparece aqui com o nome dele.
  afirma("skips: nenhum guard salta alem dos que a fixture sa justifica", (() => {
    const sobra = linhas.filter((l) => !SKIPS_ESPERADOS.some((e) => l.includes(e.chave)));
    return sobra.map((l) => `SKIP inesperado — ou a fixture esta incompleta, ou e legitimo e falta na lista: ${l.trim()}`);
  })());

  // 2. Nenhum SKIP a menos, e nao e simetria: um esperado que desapareca significa que o guard
  //    passou a medir (e a entrada sai) ou que a fixture mudou de forma (e quer-se saber).
  afirma("skips: os esperados continuam todos la, com a contagem certa", (() => {
    const p = [];
    for (const e of SKIPS_ESPERADOS) {
      const n = linhas.filter((l) => l.includes(e.chave)).length;
      if (n !== e.vezes) p.push(`"${e.chave}": esperava ${e.vezes}, encontrei ${n}`);
    }
    return p;
  })());

  // 3. O CONTRA-CASO, e sem ele os dois de cima eram satisfeitos por uma fixture que nao
  //    produzisse SKIP nenhum — ou por um `out` vazio, que e o `TP2` a entrar pela porta do
  //    lado. Se um dia nenhum guard saltar, esta lista fica vazia DE PROPOSITO e alguem o
  //    escreve aqui.
  afirma("skips: a fixture produz de facto os skips que se medem", linhas.length > 0 ? [] : ["zero SKIP no output — o guard correu?"]);
}
