/**
 * O PLANO do CI: a varredura de mutacao aplica-se a este PR? — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#347): num PR que nao toca na maquinaria, os shards da varredura arrancam e concluem "nao
 * aplicavel" em segundos — num repo privado, cada um custa um minuto cobrado. Para os shards so arrancarem
 * quando a varredura se aplica (o C2), a decisao tem de ser tomada ANTES do codigo do PR, e por isso este
 * ficheiro e lido do commit BASE: o portao (`Guard Tests`) copia-o SOZINHO para `$RUNNER_TEMP` e corre-o. Um
 * PR que mudasse a regra mudava a decisao que o julga. E por ser copiado sozinho que nao importa NADA do repo
 * (um teste em `tests-plano-ci.mjs` exige so `node:*`).
 *
 * NO C2: o passo `plano` do `guard-tests` corre-o (lido da base) e escreve `aplica=true|false`, e o `if:` do
 * `sweep` so arranca os shards com `true`. O portao recalcula-o com as mesmas linhas e e a autoridade (o C1 foi a
 * sombra que o mediu: 13 PRs a concordar). Os prefixos sao os mesmos do `grep` dos `Simuladores` — o
 * `tests-plano-ci.mjs` compara-os pelo comportamento, e a descoberta da varredura (`alvos-no-disco.mjs`, `PARES`)
 * contra eles. O diff chega com `-z` passado a linhas por um `tr`: o nome tal como e, sem as aspas do git.
 *
 * Uso: `node plano-ci.mjs <ficheiro com um caminho por linha>` — imprime `true` ou `false` e sai 0; um
 * ficheiro vazio (um PR sem diff) e `false`. Sem argumento, ilegivel, ou com uma linha vazia no meio: sai 2.
 * "Nao consegui ler" nunca e "false" (`TP2`).
 */
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** O que conta como maquinaria: as pastas que a varredura mede. */
export const PREFIXOS_MAQUINARIA = /^(\.agent\/scripts\/|\.claude\/hooks\/|\.githooks\/)/;

/** @param {string[]} caminhos @returns {boolean} a varredura aplica-se se algum caminho e maquinaria */
export const aplicaVarredura = (caminhos) => caminhos.some((c) => PREFIXOS_MAQUINARIA.test(c));

/**
 * Os caminhos de um ficheiro do `git diff --name-only`, um por linha. Devolve `{ caminhos }` ou `{ erro }`.
 * Uma linha vazia so pode ser a ultima (o `\n` final): no meio, o ficheiro nao e o que o `git diff` escreve.
 */
export function caminhosDe(texto) {
  const ls = texto.split("\n");
  if (ls.at(-1) === "") ls.pop();
  if (ls.some((l) => l === "")) return { erro: "uma linha vazia no meio — nao e a saida de um `git diff --name-only`" };
  return { caminhos: ls };
}

/** Recusa com a razao, e sai 2: o shell do portao trata qualquer saida que nao seja `true`/`false` como vermelho. */
function recusa(msg) {
  console.error(`plano-ci: ${msg}`);
  process.exit(2);
}

// Os DOIS lados pelo caminho real (#366): o Node resolve os symlinks no `import.meta.url` e nao no
// `argv[1]`, logo, copiado para uma pasta atras de um symlink (o `tmpdir()` do macOS e `/var`, que
// aponta para `/private/var`), o plano nao corria e nao imprimia nada. Resolver so o `argv[1]` partia
// com `--preserve-symlinks-main`. O `try`: importado com um `argv[1]` que nao existe, nao e o main.
const ehMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (ehMain) {
  const ficheiro = process.argv[2];
  if (!ficheiro) recusa("falta o ficheiro com os caminhos tocados");
  let texto;
  try {
    texto = readFileSync(ficheiro, "utf8");
  } catch (err) {
    recusa(`nao consegui ler ${ficheiro}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const { caminhos, erro } = caminhosDe(texto);
  if (erro) recusa(`${ficheiro}: ${erro}`);
  console.log(String(aplicaVarredura(caminhos)));
}
