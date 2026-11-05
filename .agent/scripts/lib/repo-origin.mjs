/**
 * O `dono/repo` de um `origin` do GitHub — {{PROJECT_NAME}}
 *
 * PORQUE VIVE A PARTE (#455): vivia no `marcas-yaml.mjs` (as isencoes do portao), e o `minutos-ci.mjs` importava-o de
 * la. So por esse import, o `marcas-yaml` entrava no fecho do `/upgrade` parcial (`src/docs/upgrade-parcial.md`), e
 * um derivado sem a maquinaria recebia a logica das isencoes do portao.
 */

/** O `dono/repo` de um URL de `origin` do GitHub (`https` ou `git@`, com ou sem `.git`), ou `null`. */
export const repoDoOrigin = (url) => /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(url)?.[1] ?? null;
