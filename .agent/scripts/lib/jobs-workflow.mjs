/**
 * O LEITOR de jobs de um workflow (#542) — {{PROJECT_NAME}}
 *
 * Saiu do `estrutura-workflow.mjs` sem mudar comportamento (as linhas vieram tal e qual), para o `limites-ci.mjs` o
 * poder ler sem arrastar a maquinaria do gate (o `gate-modos`) para o modo parcial do `/upgrade`, que traz o
 * `minutos-ci` e o que ele importa. O `estrutura-workflow` reexporta-o: quem o importava de la nao muda.
 * So funcoes puras, sem sitios de recusa (quem decide a falha fechada e quem chama).
 */

/** Uma linha de YAML sem o comentario e os espacos do fim. O `#` so comeca um comentario no
 *  inicio ou depois de um espaco — `${{ x }}#a` e `a#b` nao sao comentarios. */
export const semComentario = (l) => l.replace(/(^|[ \t])#.*$/, "").replace(/[ \t]+$/, "");
export const indent = (l) => /^[ \t]*/.exec(l)[0].length;
/** O id de um job a partir da sua linha (`  guard-tests:` -> `guard-tests`). */
export const idDe = (l) => l.trim().replace(/^["']?([^"':]+)["']?[ \t]*:.*$/, "$1");

/** As chaves de PRIMEIRO nivel de um job (as linhas a indentacao da primeira chave). */
export function chavesDoJob(job) {
  const ne = job.slice(1).filter((l) => l.trim());
  if (ne.length === 0) return [];
  const ind = Math.min(...ne.map(indent));
  return job.slice(1).map((l, k) => ({ l, k: k + 1 })).filter(({ l }) => l.trim() && indent(l) === ind);
}

/** O VALOR do `name:` de um job, lido da linha CRUA, sem a ancora, as tags e as aspas — com as expressoes `${{ }}`
 *  intactas (o `limites-ci` faz delas curingas, #542). `undefined` sem a chave `name:`; `null` quando o valor nao se
 *  le daqui (aspas que nao fecham, um escape que nao se le, um escalar em bloco, um alias). */
export function valorDoNome(cru) {
  const linha = cru.find((l) => /^[ \t]*name[ \t]*:/.test(l));
  if (!linha) return undefined;
  // A ancora (`&n`) e as tags (`!!str`, `!`, `!<...>`) nao fazem parte do valor, em qualquer ordem (#355, #420): o YAML
  // le `!!str &n Guard Tests` como `Guard Tests`.
  let v = linha.replace(/^[ \t]*name[ \t]*:[ \t]*/, "");
  for (let m = /^(?:&\S+|!\S*)[ \t]+/.exec(v); m; m = /^(?:&\S+|!\S*)[ \t]+/.exec(v)) v = v.slice(m[0].length);
  // As aspas fecham onde o YAML as fecha (#420): `''` e uma plica dentro das simples, e `\"` uma aspa dentro das
  // duplas. Fechar na primeira lia `'Guard Tests'' (agg)'` como `Guard Tests`, e o rename do portao passava calado.
  const simples = /^'((?:[^']|'')*)'(?!')/.exec(v);
  const duplas = /^"((?:[^"\\]|\\.)*)"/.exec(v);
  if (!simples && !duplas && /^["']/.test(v)) return null; // aspas que nao fecham: nao se le
  if (simples) return simples[1].replace(/''/g, "'");
  // Os escapes entre aspas duplas (`"Guard\x20Tests"`) leem-se como o YAML os le, com `\\` consumido primeiro (senao
  // `\\x41` lia-se `A`); um que nao se le e nao literal.
  if (duplas) {
    try {
      return JSON.parse(`"${duplas[1].replace(/\\(\\|x([0-9a-fA-F]{2}))/g, (_, e, h) => (h ? `\\u00${h}` : "\\\\"))}"`);
    } catch {
      return null;
    }
  }
  const nome = v.replace(/(^|[ \t])#.*$/, "").trim();
  return /^[|>*&!]/.test(nome) ? null : nome;
}

/** O `name:` de um job lido da linha CRUA: um `#` dentro de aspas (`"Shard #1"`) e do nome, e o
 *  `semComentario` cortava-o (leitura independente do #308). `null` quando nao ha nome LITERAL —
 *  uma expressao (`${{ matrix.os }}`), um escalar em bloco, um alias: o check real nao se le daqui. */
export function nomeLiteral(cru, id) {
  const v = valorDoNome(cru);
  if (v === undefined) return id;
  // Vazio, ou com `${{ }}` (tambem entre aspas: continua a ser uma expressao), nao e um nome literal.
  return !v || /\$\{\{/.test(v) ? null : v;
}

/** Os jobs de um workflow: `{ id, ls, cru, todas }` — as linhas sem comentarios; as cruas so de primeiro nivel (para o
 *  `nomeLiteral`); e TODAS as cruas, alinhadas com o `ls` (para quem le o corpo de um `run:` como a shell, #362). */
export function jobsDe(texto) {
  if (!texto) return [];
  const crus = texto.split(/\r\n|\r|\n/);
  const ls = crus.map(semComentario);
  const iJobs = ls.findIndex((l) => /^jobs[ \t]*:/.test(l));
  if (iJobs < 0) return [];
  const fimJobs = ls.findIndex((l, j) => j > iJobs && /^[^\s#]/.test(l));
  const fim = fimJobs < 0 ? ls.length : fimJobs;
  const ne = ls.slice(iJobs + 1, fim).filter((l) => l.trim());
  if (ne.length === 0) return [];
  const ind = Math.min(...ne.map(indent));
  const jobs = [];
  for (let i = iJobs + 1; i < fim; i++) {
    if (ls[i].trim() && indent(ls[i]) === ind) jobs.push({ id: idDe(ls[i]), ls: [ls[i]], cru: [crus[i]] });
    else if (jobs.length) {
      jobs.at(-1).ls.push(ls[i]);
      jobs.at(-1).cru.push(crus[i]);
    }
  }
  // So as chaves do PROPRIO job contam para o nome (um `- name:` de passo, ou um `name:` em `with:`,
  // nao): o `cru` fica reduzido as linhas de primeiro nivel. O `todas` guarda-as inteiras.
  for (const j of jobs) {
    const nivel = new Set(chavesDoJob(j.ls).map(({ k }) => k));
    j.todas = j.cru;
    j.cru = j.cru.filter((_, k) => nivel.has(k));
  }
  return jobs;
}
