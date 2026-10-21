/**
 * O passo das SUITES EM PARALELO como um conjunto (#341) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: desde o #337 as suites do `guard-tests` correm num so passo (o runner
 * `suites-em-paralelo.mjs` e uma linha `node <suite> \` por suite). O `superficie-gate` comparava esse passo
 * INTEIRO, e acrescentar uma suite pedia o trailer `Test-Surface:` — atrito que deixa de ser lido. Aqui o passo
 * parte-se numa unidade FIXA e numa por SUITE: acrescentar ou reordenar uma suite deixa de avisar; tira-la,
 * mexer no runner, ou cortar a cadeia, continua a avisar.
 *
 * A CADEIA e estrita (tres passagens do `plan-auditor`): a linha do runner, terminada em `\` como ULTIMO
 * caracter, e as linhas SEGUIDAS que sejam exactamente `node <suite>` (com o ` \`; a ultima sem ele). A
 * primeira linha que nao case fecha-a, e vai — com tudo o que vem depois — para a FIXA, por ordem. Assim:
 *   - um `node <suite>` ANTES do `exec` (que corria sozinho e desligava o runner, a 1.a passagem) fica na fixa;
 *   - um ` \` em falta, uma linha vazia ou um comentario a meio cortam a cadeia: as suites seguintes vao para
 *     a fixa, que muda, e as unidades delas perdem-se — avisa;
 *   - o comprimento da cadeia NAO entra na fixa (2.a passagem): com ele, acrescentar uma suite avisava.
 * Le as linhas CRUAS (o `\`, os espacos e os comentarios contam para o `bash`) alinhadas com as LIMPAS pelo
 * indice; os limites do `run:` saem das limpas. E mais estrita que a contagem e o `suitesQueOCICorre` num
 * ponto, de proposito: um `\` seguido de espacos nao continua a linha no `bash`, e aqui fecha a cadeia.
 *
 * E puro, e o par em `PARES` desliga os seus regexes (o do runner e o da suite): sem um deles, o passo volta a
 * uma unidade e os casos "nao avisa" do `tests-surface-blocos.mjs` ficam vermelhos.
 */

/** A linha do runner (o mesmo padrao da contagem "steps de verificacao no CI", `surface-patterns.mjs`), sem o
 *  ` \`. Um `exec` e um `./` opcionais, e um `--max=N` opcional antes do `--`. */
export const RUNNER = /^(?:exec[ \t]+)?node[ \t]+(?:\.\/)?\.agent\/scripts\/lib\/suites-em-paralelo\.mjs(?:[ \t]+--max=\d+)?[ \t]+--$/;
/** Uma linha de SUITE, sem o ` \`: `node` e o caminho de uma suite, e nada mais. */
export const SUITE = /^node[ \t]+((?:\.agent\/scripts\/tests|\.claude\/hooks\/tests)\/test-[\w-]+\.mjs)$/;

/** Uma linha crua sem a indentacao, e se continua (o `\` como ULTIMO caracter, depois de um espaco). */
const semContinuacao = (l) => l.trimStart().replace(/[ \t]+\\$/, "");
const continua = (l) => /[ \t]\\$/.test(l);

/**
 * @param {string[]} limpo as linhas do passo, sem comentarios (como o `superficie-gate` as le)
 * @param {string[]} cru   as MESMAS linhas, cruas, pelo mesmo indice
 * @param {(ls: string[]) => string} normaliza o `normalizaPasso` do gate
 * @returns {null | {fixa: string, cabecalho: string, suites: string[], runner: string, antes: string[], depois: string[]}}
 *   `antes`/`depois`: as linhas `node <suite>` FORA da cadeia — antes do runner (correm sozinhas e o runner nao
 *   corre) ou depois de ela fechar (nao correm).
 *   `null` se o passo nao corre o runner num `run: |` (fica como hoje: uma unidade).
 */
export function partePasso(limpo, cru, normaliza) {
  const iRun = limpo.findIndex((l, i) => /^[ \t]*run[ \t]*:[ \t]*\|[-+]?[ \t]*$/.test(i === 0 ? l.replace(/^([ \t]*)-[ \t]*/, "$1  ") : l));
  if (iRun < 0) return null;
  const col = /^[ \t]*/.exec(limpo[iRun].replace(/^([ \t]*)-[ \t]*/, "$1  "))[0].length;
  let fim = iRun + 1;
  while (fim < limpo.length && (!limpo[fim].trim() || /^[ \t]*/.exec(limpo[fim])[0].length > col)) fim++;
  const corpo = cru.slice(iRun + 1, fim);
  const r = corpo.findIndex((l) => continua(l) && RUNNER.test(semContinuacao(l)));
  if (r < 0) return null;
  let k = r + 1;
  while (k < corpo.length && continua(corpo[k - 1]) && SUITE.test(semContinuacao(corpo[k])))
    k++;
  const suites = corpo.slice(r + 1, k).map((l) => semContinuacao(l).replace(SUITE, "node $1"));
  const limpasDe = (i0, i1) => limpo.slice(iRun + 1 + i0, iRun + 1 + i1).map((l) => l.trim()).filter(Boolean);
  const antes = limpasDe(0, r);
  const depois = limpasDe(k, corpo.length);
  const cabecalho = normaliza([...limpo.slice(0, iRun + 1), ...limpo.slice(fim)]);
  const runner = limpo[iRun + 1 + r].trim();
  // Um `node <suite>` fora da cadeia: nomeia-se no aviso, com a causa certa de cada lado.
  const suitesDe = (ls) => ls.map((l) => l.replace(/[ \t]+\\$/, "")).filter((l) => SUITE.test(l));
  // Uma linha por parte da fixa, de proposito: e cada parte um sitio da varredura (o par em `PARES`).
  const fixa = [
    cabecalho,
    ...antes,
    runner,
    "<cadeia>",
    ...depois,
  ];
  return { fixa: fixa.join("\n"), cabecalho, suites, runner, antes: suitesDe(antes), depois: suitesDe(depois) };
}

/**
 * As unidades do `superficie-gate` para um passo partido: a FIXA (com o aviso das suites fora da cadeia) e uma
 * por suite. `cab` e o cabecalho do job; `id` o job.
 *  - A FIXA entra na chave de cada suite (leitura adversarial do #341): so com o cabecalho do passo, mover uma
 *    suite para um passo-gemeo com o mesmo `name:` e um `exit 0` antes do runner mantinha a chave, e a suite
 *    deixava de correr.
 *  - O `<suite>` separa a fixa da suite: com um `\n` so, a chave da suite `c` (fixa + "node c") era IGUAL a da
 *    fixa nova quando o `c` caia para depois da cadeia, e o multiconjunto dava-o por mantido (a bateria do #341).
 */
export function unidadesDoParalelo(parte, cab, id) {
  const aviso = [
    ...parte.antes.map((s) => `${s} ANTES do runner: corre sozinha, com o runner como argumentos, e o runner nao corre`),
    ...parte.depois.map((s) => `${s} fora da cadeia do runner — falta o \` \\\` na linha anterior, e nao corre`),
  ].join("; ") || null;
  return [
    { chave: `${cab}\n--\n${parte.fixa}`, rotulo: parte.runner, job: id, passo: parte.fixa, aviso },
    ...parte.suites.map((s) => ({ chave: `${cab}\n--\n${parte.fixa}\n<suite>\n${s}`, rotulo: s, job: id, passo: `${parte.fixa}\n<suite>\n${s}` })),
  ];
}
