/**
 * O `concurrency:` de topo de um workflow, e o que lhe falta — {{PROJECT_NAME}}
 *
 * PORQUE VIVE A PARTE (#455): vivia no `marcas-yaml.mjs`, que trata das marcas e das isencoes do portao, e o
 * `concurrency` nao e uma marca. Le-o a 2b do `/upgrade` (`medida-upgrade-ci.mjs`), o teste do `ci.yml`
 * (`tests-portao-ci.mjs`) e o do exemplo sem a maquinaria (`test-ci-exemplo.mjs`).
 */

/** O bloco `concurrency:` DE TOPO de um workflow (#427): as linhas indentadas que o seguem, ou `null` sem ele. Um
 *  `concurrency:` de JOB nao conta (a leitura independente do #427: a 2b lia o ficheiro inteiro). Uma forma em linha
 *  (`concurrency: x`, `{ ... }`) e um comentario na coluna 0 a meio do bloco leem-se como sem as chaves: falha fechada. */
export const concurrencyDeTopo = (texto) => /^concurrency:[ \t]*\r?\n((?:[ \t]+.*\r?\n|[ \t]*\r?\n)*)/m.exec(texto ?? "")?.[1] ?? null;

/** O que falta ao bloco para nenhum push no `main` ficar sem verificacao (#427): um grupo por COMMIT num push
 *  (`github.sha`), porque o GitHub cancela o run PENDENTE de um grupo mesmo com `cancel-in-progress: false` (num burst
 *  de 3 pushes, o do meio); e o cancelamento so num PR, que e o que poupa minutos. */
export function problemasDaConcurrency(bloco) {
  const out = [];
  if (!/^[ \t]+group:.*\bgithub\.sha\b/m.test(bloco)) out.push("o `group:` nao separa os pushes por commit (`github.sha`): o GitHub cancela o run pendente de um grupo, e num burst de pushes no `main` o do meio fica sem verificacao");
  if (!/^[ \t]+cancel-in-progress:[ \t]*(["']?)\$\{\{[ \t]*github\.event_name[ \t]*==[ \t]*'pull_request'[ \t]*\}\}\1[ \t]*(?:#.*)?$/m.test(bloco)) {
    out.push("o `cancel-in-progress` nao e so dos PRs: um push novo no `main` cancela o run em curso do anterior");
  }
  return out;
}
