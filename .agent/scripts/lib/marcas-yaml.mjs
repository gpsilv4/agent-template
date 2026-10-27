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
        tolerantes(isencoesDeJob(t, f))
          .replace(/^([ \t]*)-(?=[ \t]+\S)/gm, "$1 ")
          .replace(/^([ \t]*)(?:(["'])(if|continue-on-error|shell|run)\2|(if|continue-on-error|shell|run))[ \t]*:/gm, "$1$3$4:")
      )
    : t;

/**
 * As TRES isencoes da marca do `if:` que so valem como `if:` de PRIMEIRO NIVEL de um job — a mesma forma num
 * passo continua a contar. Cada uma so na forma EXACTA (aspas, `${{ }}`, um comentario; nenhuma cauda, nenhuma
 * continuacao na linha seguinte). O `if:` passa a `@@if-...@@:`, que a marca nao le.
 *  - O `if: always()` de um AGREGADOR (#308): sem ele, uma dependencia vermelha SALTAVA o agregador — e um
 *    check saltado conta como passado para a protecao. So num job que LE o resultado de outro
 *    (`needs.<X>.result`). Num job a jusante que nao le resultados — um `deploy` com `needs: [test]` —, o
 *    `always()` faz correr com os testes vermelhos, e CONTA: a primeira versao desta excecao vivia no regex
 *    da marca, sem saber de que job era, e deixava-o passar (auditoria do #308).
 *  - O push de um MERGE num repo privado (#347, PR B): `pull_request || publico || committer != web-flow`.
 *    E verdadeiro em TODO o PR e em todo o repo publico — so salta, num privado, o push que o GitHub fez ao
 *    mergear (o PR ja correu tudo; num privado free cada job e cobrado ao minuto). So nos dois jobs do
 *    `ci.yml` que o PR tambem corre (`JOBS_DO_MERGE`): noutro workflow — um so de `push`, como um `deploy` —
 *    ou noutro job, o "o PR ja correu isto" nao e verdade, e a mesma forma CONTA (as duas leituras do PR B).
 *    O portao (`Guard Tests`) recalcula o salto no SEU shell e reprova qualquer outro `skipped`.
 *    O `secret-scan` SAIU da lista (#372): um commit pela UI web no `main` tem o mesmo committer, e com o
 *    salto nunca era varrido. Posto la de volta, o `if:` conta como enfraquecimento.
 *  - O PLANO da varredura (#347, C2): `pull_request && needs.guard-tests.outputs.aplica == 'true'`. Os shards so
 *    arrancam quando o plano da base diz que a varredura se aplica. So no job `sweep` do `ci.yml`: o portao
 *    (`Guard Tests`) recalcula o plano da BASE no seu shell e e a autoridade — plano `true` com o `sweep` saltado,
 *    ou um output do job diferente do plano dele, e vermelho. Um derivado que traga este `if:` sem o portao novo
 *    fica vermelho em cada PR sem maquinaria (o portao antigo le um `skipped` num PR como "nao mediu").
 * Cada uma passa pela mesma troca, numa chamada literal por linha: e o que deixa a varredura medir cada
 * isencao como um sitio seu (o par em `PARES`).
 */
const JOBS_DO_MERGE = new Set(["quality", "guard-tests"]);
const JOBS_DO_PLANO = new Set(["sweep"]);
const CI_DO_MERGE = /(^|\/)\.github\/workflows\/ci\.ya?ml$/;
const SEMPRE = /^([ \t]*)["']?if["']?([ \t]*:[ \t]*)(["']?)[ \t]*(?:\$\{\{[ \t]*)?always\(\)[ \t]*(?:\}\})?[ \t]*\3[ \t]*(?:#.*)?$/;
const MERGE_PRIVADO = /^([ \t]*)["']?if["']?([ \t]*:[ \t]*)(["']?)[ \t]*(?:\$\{\{[ \t]*)?github\.event_name[ \t]*==[ \t]*'pull_request'[ \t]*\|\|[ \t]*!github\.event\.repository\.private[ \t]*\|\|[ \t]*github\.event\.head_commit\.committer\.username[ \t]*!=[ \t]*'web-flow'[ \t]*(?:\}\})?[ \t]*\3[ \t]*(?:#.*)?$/;
/** Exportado para a nota da 2b (`medida-upgrade-ci.mjs`) ler a MESMA forma, e nao uma copia (`TP8`). */
export const PLANO_DO_SWEEP = /^([ \t]*)["']?if["']?([ \t]*:[ \t]*)(["']?)[ \t]*(?:\$\{\{[ \t]*)?github\.event_name[ \t]*==[ \t]*'pull_request'[ \t]*&&[ \t]*needs\.guard-tests\.outputs\.aplica[ \t]*==[ \t]*'true'[ \t]*(?:\}\})?[ \t]*\3[ \t]*(?:#.*)?$/;
/** A linha com o `if:` trocado pela `marca`, se a forma for EXACTAMENTE `re`; senao `null`. */
const isenta = (linha, re, marca) => (re.test(linha) ? linha.replace(re, marca) : null);
function isencoesDeJob(t, ficheiro) {
  const ls = t.split(/\r?\n/);
  const iJobs = ls.findIndex((l) => /^["']?jobs["']?[ \t]*:/.test(l));
  if (iJobs < 0) return t;
  const ind = (l) => /^[ \t]*/.exec(l)[0].length;
  const fimJobs = ls.findIndex((l, j) => j > iJobs && /^[^\s#]/.test(l));
  const fim = fimJobs < 0 ? ls.length : fimJobs;
  const ne = ls.slice(iJobs + 1, fim).filter((l) => l.trim() && !/^[ \t]*#/.test(l));
  if (ne.length === 0) return t;
  const jInd = Math.min(...ne.map(ind));
  for (let i = iJobs + 1; i < fim; i++) {
    if (!ls[i].trim() || ind(ls[i]) !== jInd || /^[ \t]*#/.test(ls[i])) continue;
    let f = i + 1;
    while (f < fim && (!ls[f].trim() || /^[ \t]*#/.test(ls[f]) || ind(ls[f]) > jInd)) f++;
    const bloco = ls.slice(i + 1, f);
    const agrega = bloco.some((l) => !/^[ \t]*#/.test(l) && /\bneeds\.[\w-]+\.result\b/.test(l));
    const id = /^[ \t]*["']?([\w-]+)["']?[ \t]*:/.exec(ls[i])?.[1];
    const doMerge = CI_DO_MERGE.test(ficheiro) && JOBS_DO_MERGE.has(id);
    const doPlano = CI_DO_MERGE.test(ficheiro) && JOBS_DO_PLANO.has(id);
    const naoVazias = bloco.filter((l) => l.trim() && !/^[ \t]*#/.test(l));
    const kInd = naoVazias.length ? Math.min(...naoVazias.map(ind)) : -1;
    for (let k = i + 1; k < f; k++) {
      if (ind(ls[k]) !== kInd) continue;
      const prox = ls.slice(k + 1, f).find((l) => l.trim() && !/^[ \t]*#/.test(l));
      if (prox !== undefined && ind(prox) > kInd) continue; // uma continuacao muda a condicao
      const isento =
        (agrega && isenta(ls[k], SEMPRE, "$1@@if-agregador@@$2always()")) ||
        (doMerge && isenta(ls[k], MERGE_PRIVADO, "$1@@if-merge-privado@@$2")) ||
        (doPlano && isenta(ls[k], PLANO_DO_SWEEP, "$1@@if-plano@@$2"));
      if (isento) ls[k] = isento;
    }
    i = f - 1;
  }
  return ls.join("\n");
}

/** `continue-on-error` com um valor que nao e `false` (o mesmo criterio da marca dessa chave). */
const COE = /^[ \t]*(?:-[ \t]+)?["']?continue-on-error["']?[ \t]*:[ \t]*(?!["']?false["']?[ \t]*(?:#|$)|["']?\$\{\{[ \t]*false[ \t]*\}\}["']?[ \t]*(?:#|$))\S/i;
/** ...e com um valor CONDICIONAL (`${{ matrix.experimental }}`): so algumas pernas toleram. Ancorado a
 *  CHAVE: um `${{ }}` num comentario (`true  # ver: ${{ matrix.x }}`) nao torna a chave condicional.
 *  LIMITE: uma expressao sempre verdadeira (`${{ !false }}`) conta como condicional. */
const COE_CONDICIONAL = /^[ \t]*(?:-[ \t]+)?["']?continue-on-error["']?[ \t]*:[ \t]*["']?\$\{\{(?![ \t]*(?:true|false)[ \t]*\}\})/i;
/** Um `run:` cujo corpo sao CHAVES (`defaults: run: shell: ...`): um mapeamento, nao um comando. */
const RUN_MAPEAMENTO = (ls, j) => {
  const prox = ls.slice(j + 1).find((l) => l.trim() && !/^[ \t]*#/.test(l));
  return prox !== undefined && /^[ \t]*[\w-]+[ \t]*:(?:[ \t]|$)/.test(prox);
};

/**
 * Os comandos de um PASSO ou JOB com `continue-on-error` levam um prefixo (#296): `@@coe@@; ` (sempre
 * tolerado) ou `@@coe?@@; ` (condicional, `${{ matrix.x }}`). A marca dessa chave conta por FICHEIRO,
 * logo move-la do passo `Audit` para o passo que corre os testes deixava a contagem igual; com o
 * prefixo, uma marca conta os comandos de TESTE sempre tolerados, e mover a chave para um passo de
 * teste — ou passar uma condicional a `true` — faz essa contagem subir. O `;` deixa um `!` a seguir no
 * inicio de um comando. Corre sobre o texto ORIGINAL (com o `- `): e o `- ` que diz onde um passo comeca.
 *
 * O bloco de uma chave `continue-on-error` na coluna `k`: o item `- ` cujo conteudo comeca em `k`
 * (um passo), ou a linha anterior menos indentada (um job). Acaba na primeira linha nao vazia (e que
 * nao seja comentario — um `#` na coluna 0 e YAML valido) com a indentacao do dono, ou menos. O prefixo
 * vai so no INICIO de cada comando: nao numa linha que continua a anterior (`\` no fim, ou o corpo de
 * um `>`/simples), senao a juncao do `comoORunnerExecuta` punha o `;` a meio e escondia o `|| true`.
 * Um `run:` cujo corpo sao chaves (`defaults: run: shell:`) nao e um comando e fica como esta.
 */
/** Um comando que SO audita dependencias: `npm|pnpm|yarn|bun audit` (com flags), ou o
 *  `npm run test:audit` do template. Nada a seguir que encadeie outro comando (`&&`, `;`, `|`). */
const AUDIT = /^(?:(?:npm|pnpm|yarn|bun)[ \t]+audit|npm[ \t]+run[ \t]+test:audit)(?:[ \t]+[^\s;&|]+)*$/;

/** Os comandos dos `run:` de um bloco, um por linha, com as continuacoes `\` juntas e sem
 *  comentarios. Um `run:` que e um mapeamento (`defaults: run: shell:`) nao e um comando. */
function comandosDoBloco(bloco, col) {
  const cmds = [];
  for (let j = 0; j < bloco.length; j++) {
    const r = /^[ \t]*(?:-[ \t]+)?["']?run["']?[ \t]*:[ \t]*(.*)$/.exec(bloco[j]);
    if (!r || (!r[1] && RUN_MAPEAMENTO(bloco, j))) continue;
    const linhas = r[1] && !/^[|>]/.test(r[1]) ? [r[1]] : [];
    for (let c = j + 1; c < bloco.length && (!bloco[c].trim() || /^[ \t]*/.exec(bloco[c])[0].length > col(bloco[j])); c++) linhas.push(bloco[c]);
    let acc = "";
    for (const l of linhas.map((x) => x.trim()).filter((x) => x && !x.startsWith("#"))) {
      acc = acc ? `${acc} ${l}` : l;
      if (/\\$/.test(acc)) acc = acc.slice(0, -1).trim();
      else {
        cmds.push(acc.replace(/[ \t]+#.*$/, "").replace(/^["']|["']$/g, "").trim());
        acc = "";
      }
    }
    if (acc) cmds.push(acc);
  }
  return cmds;
}

function tolerantes(t) {
  const ls = t.split(/\r?\n/);
  const col = (l) => /^[ \t]*(?:-[ \t]+)?/.exec(l)[0].length; // onde comeca o conteudo
  const ind = (l) => /^[ \t]*/.exec(l)[0].length;
  const comentario = (l) => /^[ \t]*#/.test(l);
  // Um `@@coe@@` (sempre) sobrepoe-se a um `@@coe?@@` (condicional) que ja la esteja: a ordem das chaves
  // no ficheiro nao pode decidir — um job condicional processado primeiro rebaixava o `true` do passo.
  const prefixa = (l, p) => (l.includes("@@coe?@@; ") && p === "@@coe@@; " ? l.replace("@@coe?@@; ", p) : l.includes("@@coe") ? l : l.replace(/^([ \t]*(?:-[ \t]+)?(?:["']?run["']?[ \t]*:[ \t]*)?)/, `$1${p}`));
  for (let i = 0; i < ls.length; i++) {
    if (!COE.test(ls[i])) continue;
    const p = COE_CONDICIONAL.test(ls[i]) ? "@@coe?@@; " : "@@coe@@; ";
    const k = col(ls[i]);
    let dono = -1;
    for (let d = /^[ \t]*-[ \t]/.test(ls[i]) ? i : i - 1; d >= 0; d--) {
      if (!ls[d].trim() || comentario(ls[d])) continue;
      if ((/^[ \t]*-[ \t]/.test(ls[d]) && col(ls[d]) === k) || col(ls[d]) < k) {
        dono = d;
        break;
      }
    }
    if (dono < 0) continue;
    let fim = dono + 1;
    while (fim < ls.length && (!ls[fim].trim() || comentario(ls[fim]) || ind(ls[fim]) > ind(ls[dono]))) fim++;
    // Um bloco que SO corre audit (#303, R7B-6): e o desenho que o proprio template recomenda — o
    // `npm audit` informativo, com `continue-on-error` —, e a marca da chave nao deixava um derivado
    // que o tinha escalado para gate voltar atras, nem com a razao escrita. A chave sai da contagem
    // (fica `@@coe-audit@@`), e o bloco nao leva prefixo. So com TODOS os comandos de audit, e pelo
    // menos um, e nenhum `uses:`: um passo com uma action nao prova o que faz, e um `npm audit &&
    // npm test` corre testes.
    const cmds = comandosDoBloco(ls.slice(dono, fim), col);
    // Sem `uses:` no bloco: um job tolerado que corre os testes por uma action e so audita no `run:`
    // escondia os testes atras do audit (auditoria do #308).
    const usa = ls.slice(dono, fim).some((l) => /^[ \t]*(?:-[ \t]+)?["']?uses["']?[ \t]*:/.test(l));
    if (cmds.length && !usa && cmds.every((c) => AUDIT.test(c))) {
      ls[i] = ls[i].replace(/continue-on-error/i, "@@coe-audit@@");
      continue;
    }
    for (let j = dono; j < fim; j++) {
      const r = /^[ \t]*(?:-[ \t]+)?["']?run["']?[ \t]*:[ \t]*(.*)$/.exec(ls[j]);
      if (!r || (!r[1] && RUN_MAPEAMENTO(ls, j))) continue;
      const literal = /^\|/.test(r[1]);
      const dobrado = /^>/.test(r[1]);
      const base = (() => {
        const l = ls.slice(j + 1, fim).find((x) => x.trim() && !comentario(x));
        return l === undefined ? 0 : ind(l);
      })();
      if (r[1] && !/^[|>#]/.test(r[1])) ls[j] = prefixa(ls[j], p);
      // O corpo do `run:`: as linhas mais indentadas que a CHAVE (a coluna do conteudo, nao a do `- `).
      let continua = !!r[1] && !/^[|>#]/.test(r[1]); // um valor simples na propria linha: o corpo continua-o
      for (let c = j + 1; c < fim && (!ls[c].trim() || ind(ls[c]) > col(ls[j])); c++) {
        if (!ls[c].trim()) {
          continua = false; // uma linha em branco separa comandos (no `>` e no simples)
          continue;
        }
        if (comentario(ls[c])) continue;
        // No `>`, uma linha MAIS indentada que o corpo fica uma linha a parte (o YAML nao a dobra): e
        // um comando, e a seguinte tambem comeca um.
        const aParte = dobrado && ind(ls[c]) > base;
        if (!continua || aParte) ls[c] = prefixa(ls[c], p);
        if (aParte) {
          continua = false;
          continue;
        }
        // No literal, so o `\` no fim continua; no `>`/simples, o corpo inteiro e um comando.
        continua = literal ? /\\$/.test(ls[c]) : true;
      }
    }
  }
  return ls.join("\n");
}

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
        // Um COMENTARIO que acaba em `\` nao continua: a shell nao junta comentarios.
        while (/\\$/.test(l) && !/^[ \t]*#/.test(l) && k + 1 < corpo.length) l = `${l.slice(0, -1)} ${corpo[++k].trim()}`;
        out.push(l);
      }
    } else if (valor.startsWith(">") || (corpo.length && !valor.startsWith("|") && !(!valor && RUN_MAPEAMENTO(ls, i)))) {
      // (Um `run:` vazio com CHAVES no corpo — `defaults: run: shell:` — e um mapeamento, e nao se dobra:
      // dobrado, o `shell:` desaparecia da marca dele.)
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
