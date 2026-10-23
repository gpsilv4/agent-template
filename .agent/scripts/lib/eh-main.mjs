/**
 * Este modulo e o que o `node` esta a correr? — {{PROJECT_NAME}}
 *
 * As CLIs que DECIDEM um veredicto (o `varredura-shards`, o `suites-em-paralelo`, o `adotar-template`) so
 * trabalham quando sao o processo principal. A comparacao crua `import.meta.url === pathToFileURL(argv[1])`
 * partia atras de um symlink: o `node` resolve-o no `import.meta.url` e nao no `argv[1]`, e a CLI saia 0 sem
 * fazer nada — um verde que nao mediu (`TP2`; #366, #373). Uma so fonte, com o caminho REAL dos dois lados.
 *
 * O `lib/plano-ci.mjs` fica com a sua copia de proposito: o portao copia-o SOZINHO da base, e ele so pode
 * importar `node:*`. As outras guardas (~68, os "nao e um entry point" dos modulos de teste) nao decidem
 * nada; atras de um symlink calam-se, e nem o CI nem os simuladores as correm directamente.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} urlDoModulo o `import.meta.url` de quem pergunta
 * @param {string | undefined} [argv1] o `process.argv[1]` (parametro para os testes)
 * @returns {boolean} `false` tambem quando um dos lados nao existe: importado, nao e o principal
 */
export function ehMain(urlDoModulo, argv1 = process.argv[1]) {
  try {
    // Um lado por linha: a varredura de mutacao mede cada `realpathSync` a parte (#373).
    const modulo = realpathSync(fileURLToPath(urlDoModulo));
    return Boolean(argv1) && modulo === realpathSync(argv1);
  } catch {
    return false;
  }
}
