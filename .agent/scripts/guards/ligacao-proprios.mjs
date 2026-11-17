/**
 * Os guards proprios do projeto e o detetor de guards desligados — {{PROJECT_NAME}}
 *
 * Os PROPRIOS sao os declarados em `config/guards-do-projeto.mjs`; um DESLIGADO e um modulo de `guards/` que ninguem chama.
 *
 * Extraido do `check-doc-versions.mjs` (#539), que estava a 499 linhas: o proximo guard registado reprovava no
 * Guard 17. O corpo e o mesmo; o que muda e de onde o detetor le os imports: antes lia o PROPRIO ficheiro pelo
 * `import.meta.url`, e aqui esse ficheiro passava a ser este modulo (todos os `guards/*.mjs` ficavam "nao chamados").
 * O `check-doc-versions` passa-lhe o SEU texto (`fonte`), e este modulo fica ligado pelo import de la.
 *
 * O NOME e de proposito: `do-projeto.mjs` e o que um derivado da ao seu guard proprio (a fixture do `simulate-derived`
 * escreve-o, `lib/derivado-maduro.mjs`), e o `/upgrade` copia `guards/` inteiro — um nome igual apagava o dele.
 *
 * Os avisos vivem aqui, logo este ficheiro tem de estar em `PARES` (`lib/pares.mjs`).
 */
import { existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

/**
 * @param {{ fonte: string, GUARDS: {modulo: string, funcao: string}[], ctx: object }} args `fonte` e o texto do
 *   `check-doc-versions.mjs` (onde os `guards/*.mjs` sao importados); `ctx` e o que cada guard proprio recebe
 * @returns {Promise<number>} guards executados
 */
export async function guardsDoProjeto({ fonte, GUARDS, ctx }) {
  const { warn, skip, listDir, ROOT } = ctx;
  let guardsRun = 0;
  // Ligados aqui a mao, o `/upgrade` desligava-os ao substituir o `check-doc-versions` (#176). A config e do
  // projeto e o upgrade nunca a substitui.
  //
  // Um modulo em `guards/` que ninguem chama e um guard DESLIGADO. Foi assim que o R7-A ficou
  // invisivel: depois do upgrade os modulos do derivado continuavam no disco e a config vinha
  // vazia — sem isto, o resultado era um SKIP verde. Ligado = importado no `check-doc-versions`, ou declarado.
  const ligados = new Set([
    ...[...fonte.matchAll(/from "\.\/guards\/([\w-]+\.mjs)"/g)].map((m) => m[1]),
    ...GUARDS.map((g) => g.modulo.split("/").pop()),
  ]);
  for (const nome of listDir(".agent/scripts/guards", ".mjs") ?? []) {
    if (!ligados.has(`${nome}.mjs`)) warn(`.agent/scripts/guards/${nome}.mjs nao e chamado por ninguem — declarar em config/guards-do-projeto.mjs (GUARDS), ou apagar`);
  }
  if (GUARDS.length === 0) skip("guards do projeto — nenhum declarado em config/guards-do-projeto.mjs");
  for (const { modulo, funcao } of GUARDS) {
    const caminho = join(ROOT, ".agent/scripts", modulo);
    const m = existsSync(caminho) ? await import(pathToFileURL(caminho).href) : null;
    if (typeof m?.[funcao] !== "function") {
      warn(`config/guards-do-projeto.mjs declara ${funcao} em ${modulo}, e ${m ? "o modulo nao a exporta" : "o modulo nao existe"} — o guard nao corre`);
      continue;
    }
    guardsRun += m[funcao](ctx);
  }
  return guardsRun;
}
