/**
 * O texto que as MARCAS do `check-test-surface` leem num workflow, e o que e so do template — {{PROJECT_NAME}}
 *
 * Saiu do `check-test-surface.mjs` quando ele chegou as 495 linhas (#279). Sao funcoes puras, sem
 * sitios de recusa: quem decide e o verificador, que as chama. Os testes vivem nas suites dele
 * (`tests-surface-marks.mjs`, `tests-surface-gate-repo.mjs`).
 */

/** Os ficheiros SO DO TEMPLATE: o bootstrap remove-os e o `/upgrade` nao os traz. So neles a
 *  excecao do gate deste repo se aplica. Num ficheiro que o derivado HERDA (o `ci.yml`), o mesmo
 *  `if:` e verdadeiro no template e falso em cada copia: os testes morriam em todos os derivados, e
 *  a baseline deles ja nascia com o gate — nenhum aviso, nunca (leitura independente do #277). */
export const SO_DO_TEMPLATE = new Set([".github/workflows/codeql.yml"]);

/**
 * O texto que as MARCAS leem, nos DOIS lados (baseline e agora). So em YAML: noutro ficheiro, uma
 * linha `- if:` numa string nao e um passo.
 *  - O `-` de um item de lista passa a espaco (#279): `- if: false` e YAML valido e escapava a
 *    `^([ \t]*)if:`. A chave fica na MESMA coluna, logo o `\1` da continuacao continua certo —
 *    acrescentar `(?:-[ \t]+)?` a cada regex metia o `- ` no `\1` e partia a continuacao.
 *  - A chave `if`/`continue-on-error` entre aspas, ou com espacos antes dos `:`, passa a forma nua
 *    (#279): `"if": false` e `'continue-on-error': true` sao YAML valido e escapavam as duas marcas.
 * (O CRLF nao precisa de nada: com a flag `m`, o `$` do JS ja para antes do `\r` — medido.)
 */
export const paraMarcas = (f, t) =>
  /\.ya?ml$/i.test(f)
    ? t
        .replace(/^([ \t]*)-(?=[ \t]+\S)/gm, "$1 ")
        .replace(/^([ \t]*)(?:(["'])(if|continue-on-error)\2|(if|continue-on-error))[ \t]*:/gm, "$1$3$4:")
    : t;

/** O `dono/repo` de um URL de `origin` do GitHub (`https` ou `git@`, com ou sem `.git`), ou `null`. */
export const repoDoOrigin = (url) => /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(url)?.[1] ?? null;

/**
 * A excecao do gate DESTE repo (#277), para os ficheiros SO DO TEMPLATE: um `if:` cuja condicao
 * INTEIRA e `github.repository == '<este repo>'` e sempre verdadeiro aqui, e o ficheiro nem existe
 * numa copia — nao desliga nada. Neutraliza-se antes das MARCAS. Ancorado nos dois extremos como a
 * excecao do `pull_request`: outro nome, `!=`, uma cauda (`&& false`) — ou uma CONTINUACAO na linha
 * seguinte, que o YAML junta ao escalar (`\n  && false`) — continuam a contar. So o NOME ignora a
 * caixa (o `==` do GitHub Actions ignora-a); a chave `if:` e o contexto ficam exatos — escritos
 * noutra caixa contam, mesmo que o GitHub os aceitasse (falha fechada).
 *
 * @param esteRepo `() => string | null` — o nome deste repo; chamado so quando ha um ficheiro desses,
 *                 e `null` (nao se sabe) desliga a excecao (falha fechada).
 * @returns `(texto) => texto` com os gates deste repo trocados por um comentario.
 */
export function gateDesteRepo(esteRepo) {
  let re;
  return (t) => {
    if (re === undefined) {
      const repo = esteRepo();
      re = !repo
        ? null
        : new RegExp(
            String.raw`^([ \t]*)if:[ \t]*(["']?)[ \t]*(?:\$\{\{[ \t]*)?github\.repository[ \t]*==[ \t]*'` +
              repo.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).replace(/[.\\-]/g, "\\$&") +
              String.raw`'[ \t]*(?:\}\})?[ \t]*\2[ \t]*(?:#[^\n]*)?$(?!(?:\r?\n[ \t]*)*\r?\n\1[ \t]+[^\s#])`,
            "gm"
          );
    }
    return re ? t.replace(re, "$1# (if: so este repo)") : t;
  };
}
