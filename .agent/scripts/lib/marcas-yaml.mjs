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
 * (O CRLF: o `comoORunnerExecuta` parte as linhas com `\r?\n`, logo chega aqui normalizado.)
 */
export const paraMarcas = (f, t) =>
  /\.ya?ml$/i.test(f)
    ? comoORunnerExecuta(
        t
          .replace(/^([ \t]*)-(?=[ \t]+\S)/gm, "$1 ")
          .replace(/^([ \t]*)(?:(["'])(if|continue-on-error|shell|run)\2|(if|continue-on-error|shell|run))[ \t]*:/gm, "$1$3$4:")
      )
    : t;

/**
 * O `run:` como o RUNNER o executa, e nao como esta escrito (#295). As marcas leem linha a linha, e
 * duas formas punham o comando de teste e o que o neutraliza em linhas diferentes:
 *  - a continuacao de shell (`npm test \` + `|| true` na linha seguinte): a shell junta-as — mas SO
 *    dentro do corpo de um `run:`. Juntar no ficheiro inteiro engolia chaves YAML reais (`name: t \`
 *    + `continue-on-error: true`), e a marca dessa chave deixava de a ver (segunda leitura);
 *  - o `run: >` e o escalar SIMPLES em varias linhas: o YAML junta-as numa so, e a shell le essa linha
 *    ate ao primeiro `#` — o resto e comentario. O `run: |` nao se dobra: cada linha e um comando.
 * As aspas de `run: '...'` nao precisam de nada: as marcas aceitam texto antes do comando e a aspa de
 * fecho depois (medido). Quem as precisava era a CONTAGEM dos passos, que le sem o `paraMarcas`.
 * Puro, sem I/O, e so para as MARCAS.
 */
function comoORunnerExecuta(t) {
  const ls = t.split(/\r?\n/);
  const indentDe = (l) => /^[ \t]*/.exec(l)[0].length;
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const m = /^([ \t]*)run:[ \t]*(.*)$/.exec(ls[i]);
    if (!m) {
      out.push(ls[i]);
      continue;
    }
    const [, ind, valor] = m;
    let j = i + 1;
    while (j < ls.length && (!ls[j].trim() || indentDe(ls[j]) > ind.length)) j++;
    let fim = j;
    while (fim > i + 1 && !ls[fim - 1].trim()) fim--; // as brancas do fim nao sao do corpo
    const corpo = ls.slice(i + 1, fim);
    if (valor.startsWith("|")) {
      // Literal: cada linha e um comando; so as continuacoes `\` (no fim exato) se juntam.
      out.push(ls[i]);
      for (let k = 0; k < corpo.length; k++) {
        let l = corpo[k];
        while (/\\$/.test(l) && k + 1 < corpo.length) l = `${l.slice(0, -1)} ${corpo[++k].trim()}`;
        out.push(l);
      }
    } else if (valor.startsWith(">") || (corpo.length && !valor.startsWith("|"))) {
      // Dobrado (`>`) ou simples em varias linhas (com valor, vazio ou so comentario): o YAML junta as
      // linhas, MAS uma linha em branco — e, no `>`, uma linha mais indentada — fica uma quebra. Cada
      // pedaco e um comando, ate ao primeiro `#` (comentario de shell). Um pedaco que comece no CORPO
      // leva `; ` a frente: o `!` de `run: >-` + `! npm test` continua no inicio de um comando.
      const dobrado = valor.startsWith(">");
      const proprio = !dobrado && valor && !valor.startsWith("#") ? valor : null;
      const base = corpo.find((l) => l.trim()) ? indentDe(corpo.find((l) => l.trim())) : 0;
      const pedacos = proprio === null ? [] : [[proprio]];
      let novo = proprio === null;
      for (const l of corpo) {
        if (!l.trim()) novo = true;
        else if (dobrado && indentDe(l) > base) {
          pedacos.push([l.trim()]);
          novo = true;
        } else {
          if (novo || pedacos.length === 0) pedacos.push([]);
          pedacos.at(-1).push(l.trim());
          novo = false;
        }
      }
      pedacos.forEach((p, k) => {
        const linha = p.map((x) => x.replace(/\\$/, "")).join(" ");
        const c = linha.search(/(^|[ \t])#/);
        out.push(`${ind}run: ${k === 0 && proprio !== null ? "" : "; "}${c < 0 ? linha : linha.slice(0, c)}`);
      });
    } else {
      out.push(ls[i]);
      continue;
    }
    out.push(...ls.slice(fim, j));
    i = j - 1;
  }
  return out.join("\n");
}

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
