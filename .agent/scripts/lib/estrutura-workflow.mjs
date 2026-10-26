/**
 * A ESTRUTURA do gate de um workflow (#308, #374b): os jobs, os `needs:`, os AGREGADORES (quem le o resultado da
 * maquinaria) e os defeitos de forma que desligam o gate sem tocar num teste — {{PROJECT_NAME}}
 *
 * Saiu do `superficie-gate.mjs` quando ele chegou as 494 linhas (o Guard 17 reprova acima de 500), sem mudar
 * comportamento: as linhas vieram tal e qual. O gate importa daqui o que partilha (o `semComentario`, o `indent`,
 * a `MAQUINARIA`, o `idDe`, os `agregadoresDe` e os `defeitosNovos`); este modulo nao importa o gate (sem ciclo).
 * Os defeitos reportam-se por `out.push(`, que nao e sinal da varredura: a lacuna e o #382.
 */
import { modosDaMatriz, modosDoPortao } from "./gate-modos.mjs";

/** Uma linha de YAML sem o comentario e os espacos do fim. O `#` so comeca um comentario no
 *  inicio ou depois de um espaco — `${{ x }}#a` e `a#b` nao sao comentarios. */
export const semComentario = (l) => l.replace(/(^|[ \t])#.*$/, "").replace(/[ \t]+$/, "");
export const indent = (l) => /^[ \t]*/.exec(l)[0].length;
/** O que cita a maquinaria de verificacao: quem a mudar num workflow mexe no proprio gate. */
export const MAQUINARIA = /\.agent\/scripts\/|\.claude\/hooks\/|\.githooks\//;
/** O id de um job a partir da sua linha (`  guard-tests:` -> `guard-tests`). */
export const idDe = (l) => l.trim().replace(/^["']?([^"':]+)["']?[ \t]*:.*$/, "$1");

/** As chaves de PRIMEIRO nivel de um job (as linhas a indentacao da primeira chave). */
function chavesDoJob(job) {
  const ne = job.slice(1).filter((l) => l.trim());
  if (ne.length === 0) return [];
  const ind = Math.min(...ne.map(indent));
  return job.slice(1).map((l, k) => ({ l, k: k + 1 })).filter(({ l }) => l.trim() && indent(l) === ind);
}

/** O `needs:` de um job: `needs: x`, `needs: [x, y]` (tambem em varias linhas), ou a lista em bloco
 *  (`- x`). Um alias YAML (`*deps`) nao se resolve: fica de fora — dizer que o job nao existe era um
 *  falso positivo (leitura independente do #308). */
function needsDe(job) {
  const c = chavesDoJob(job).find(({ l }) => /^[ \t]*needs[ \t]*:/.test(l));
  if (!c) return [];
  let valor = c.l.replace(/^[ \t]*needs[ \t]*:[ \t]*/, "").trim();
  if (valor.startsWith("[")) {
    for (let k = c.k + 1; !valor.includes("]") && k < job.length; k++) valor += ` ${job[k].trim()}`;
  }
  const limpa = (xs) => xs.map((x) => x.trim().replace(/^["']|["']$/g, "")).filter((x) => x && !/^[*&]/.test(x));
  if (valor) return limpa(valor.replace(/^\[|\].*$/g, "").split(","));
  const out = [];
  for (const l of job.slice(c.k + 1)) {
    if (!l.trim()) continue;
    const m = /^[ \t]*-[ \t]*(\S+)[ \t]*$/.exec(l);
    if (!m) break; // a primeira linha que nao e um item da lista acaba-a
    out.push(m[1]);
  }
  return limpa(out);
}

/** O `name:` de um job lido da linha CRUA: um `#` dentro de aspas (`"Shard #1"`) e do nome, e o
 *  `semComentario` cortava-o (leitura independente do #308). `null` quando nao ha nome LITERAL —
 *  uma expressao (`${{ matrix.os }}`), um escalar em bloco, um alias: o check real nao se le daqui. */
function nomeLiteral(cru, id) {
  const linha = cru.find((l) => /^[ \t]*name[ \t]*:/.test(l));
  if (!linha) return id;
  const v = linha.replace(/^[ \t]*name[ \t]*:[ \t]*/, "");
  const aspas = /^(["'])(.*?)\1/.exec(v);
  const nome = aspas ? aspas[2] : v.replace(/(^|[ \t])#.*$/, "").trim();
  return !nome || /\$\{\{|^[|>*&]/.test(nome) ? null : nome;
}

/** Os jobs de um workflow: `{ id, ls, cru }` (as linhas sem comentarios, e as cruas, alinhadas). */
function jobsDe(texto) {
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
  // nao): o `cru` fica reduzido as linhas de primeiro nivel.
  for (const j of jobs) {
    const nivel = new Set(chavesDoJob(j.ls).map(({ k }) => k));
    j.cru = j.cru.filter((_, k) => nivel.has(k));
  }
  return jobs;
}

/** A varredura de mutacao: o comando, pelo NOME do ficheiro — a suite dela (`test-mutation-sweep.mjs`)
 *  corre nas suites e nao e a varredura. */
const VARREDURA = /\bnode[ \t]+(?:\S*\/)?mutation-sweep\.mjs\b/;
/** As suites da maquinaria (o que o `guard-tests` corre). */
const SUITES = /\bnode[ \t]+\S*\.agent\/scripts\/tests\//;

/**
 * Os AGREGADORES (#308): jobs que LEEM o resultado (`needs.<X>.result`) de um job com maquinaria, ou de
 * outro agregador — o `guard-gate` deste repo e um, e e o que decide o check `Guard Tests` que a
 * protecao exige. So depender (`needs:`) nao chega: um `deploy` a jusante das suites nao decide gate
 * nenhum, e vigia-lo inteiro avisava a cada `actions/checkout` subido (leitura independente do #308).
 * Em cadeia: um agregador de agregadores tambem conta.
 */
export function agregadoresDe(jobs) {
  const vigiados = new Set(jobs.filter((j) => j.ls.some((l) => MAQUINARIA.test(l))).map((j) => j.id));
  const agregadores = new Set();
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const j of jobs) {
      if (agregadores.has(j.id)) continue;
      const le = [...j.ls.join("\n").matchAll(/\bneeds\.([\w-]+)\.result\b/g)].map((m) => m[1]);
      if (le.some((x) => vigiados.has(x) || agregadores.has(x))) {
        agregadores.add(j.id);
        mudou = true;
      }
    }
  }
  return { vigiados, agregadores };
}

/**
 * Defeitos de ESTRUTURA de um workflow que o GitHub nao perdoa, ou que tiram a maquinaria do check que
 * uma protecao exige (#308), em ABSOLUTO — quem os avisa so diz os NOVOS (`defeitosNovos`):
 *  - um `needs:` para um job que nao existe: o GitHub rejeita o workflow INTEIRO e nenhum job corre;
 *  - a varredura num job que NAO corre as suites (correndo elas noutro), sem um agregador que leia o
 *    resultado dele: fica fora do check exigido (um derivado que traga o `sweep` e esqueca o `guard-gate`);
 *  - a varredura em DOIS jobs: corre duas vezes (um derivado que traga o `sweep` e a deixe no antigo);
 *  - dois jobs com o MESMO nome de check, sendo um deles da maquinaria ou um agregador: uma protecao
 *    exige checks pelo nome e pode dar-se por satisfeita com o primeiro a acabar (um derivado que
 *    traga o `guard-gate` e nao renomeie o `guard-tests`). Nomes nao literais e colisoes so entre
 *    jobs alheios a maquinaria nao contam: `name: Deploy` em staging e prod e idioma legitimo.
 * @param {string | null} texto
 * @returns {string[]} uma mensagem por defeito
 */
export function defeitosDeEstrutura(texto) {
  const jobs = jobsDe(texto);
  const ids = new Set(jobs.map((j) => j.id));
  const { vigiados, agregadores } = agregadoresDe(jobs);
  const out = [];
  for (const j of jobs) {
    for (const n of needsDe(j.ls)) if (!ids.has(n)) out.push(`o job \`${j.id}\` tem \`needs: ${n}\`, e o job \`${n}\` nao existe — o GitHub rejeita o workflow inteiro`);
  }
  const varrem = jobs.filter((j) => j.ls.some((l) => VARREDURA.test(l)));
  if (varrem.length > 1) out.push(`a varredura de mutacao corre em ${varrem.length} jobs (${varrem.map((j) => `\`${j.id}\``).join(", ")}) — corre duas vezes; um passo que mudou de job sai do antigo`);
  // So quando as suites correm NOUTRO job deste workflow: um job que so corre a varredura, num
  // workflow sem suites, e ele proprio o check — nao ha nada de que ficar de fora (as fixtures do
  // `check-test-surface` tem esse workflow, e foi o controlo negativo do diferencial que o mostrou).
  const haSuites = jobs.some((j) => j.ls.some((l) => SUITES.test(l)));
  for (const j of varrem) {
    const lida = jobs.some((a) => agregadores.has(a.id) && new RegExp(`\\bneeds\\.${j.id}\\.result\\b`).test(a.ls.join("\n")));
    if (haSuites && !j.ls.some((l) => SUITES.test(l)) && !lida) out.push(`a varredura corre no job \`${j.id}\`, sem as suites e sem um agregador que leia \`needs.${j.id}.result\` — fica fora do check que a protecao exige`);
  }
  // Os SHARDS (#308): cada shard so ve a sua fatia, e "todos verdes" nao prova que todos correram — quem
  // o prova e o portao (`lib/varredura-shards.mjs`). Um derivado que traga a matriz em shards SEM o
  // portao ficava com um shard em falta verde: falha aberta (leitor do #308). E o portao tem de estar num
  // AGREGADOR (auditoria do #308): num job a parte, que nenhuma protecao exige, nao decide nada. O `ls` ja
  // vem sem comentarios.
  const ativa = (j, re) => j.ls.some((l) => re.test(l));
  if (jobs.some((j) => ativa(j, /\bSWEEP_SHARD\b/)) && !jobs.some((j) => agregadores.has(j.id) && ativa(j, /\bvarredura-shards\.mjs\b/))) {
    out.push("a varredura e repartida em shards (`SWEEP_SHARD`) e nenhum job AGREGADOR confere os relatorios deles (`lib/varredura-shards.mjs`) — um shard em falta passava verde");
  }
  // Os MODOS (#317): a matriz e a linha do portao sao duas listas, e tem de ser IGUAIS (`lib/gate-modos.mjs`).
  // Um modo que nao chegue ao portao passava verde se deixasse de correr; um a mais punha todos os PRs
  // vermelhos. O que nao se le FALHA FECHADO: um YAML desconhecido calava a regra (leituras do #317).
  for (const j of jobs.filter((x) => ativa(x, /\bSWEEP_SHARD\b/))) {
    const daMatriz = modosDaMatriz(j.ls);
    if (daMatriz === null) {
      out.push(`nao consegui ler os modos da matriz do job \`${j.id}\` (\`modo: [a, b]\` ou \`- modo: x\`) — sem eles, o portao nao sabe que modos exigir`);
      continue;
    }
    for (const a of jobs.filter((x) => agregadores.has(x.id))) {
      for (const recebe of modosDoPortao(a.ls)) {
        if (recebe === null) {
          out.push(`nao consegui ler os modos que o portao recebe no job \`${a.id}\` — escreve-os por extenso, sem variaveis`);
          continue;
        }
        const faltam = daMatriz.filter((x) => !recebe.includes(x));
        const sobram = recebe.filter((x) => !daMatriz.includes(x));
        if (faltam.length) out.push(`o portao (\`lib/varredura-shards.mjs\`, job \`${a.id}\`) nao recebe o(s) modo(s) ${faltam.join(", ")} da matriz — um modo que nao corresse passava verde`);
        if (sobram.length) out.push(`o portao (\`lib/varredura-shards.mjs\`, job \`${a.id}\`) exige o(s) modo(s) ${sobram.join(", ")}, que a matriz nao tem — todos os PRs ficavam vermelhos`);
      }
    }
  }
  const nomes = new Map();
  for (const j of jobs) {
    const nome = nomeLiteral(j.cru, j.id);
    if (nome !== null) nomes.set(nome, [...(nomes.get(nome) ?? []), j.id]);
  }
  for (const [nome, js] of nomes) {
    if (js.length > 1 && js.some((id) => vigiados.has(id) || agregadores.has(id))) {
      out.push(`os jobs ${js.map((j) => `\`${j}\``).join(" e ")} tem o mesmo nome de check, \`${nome}\` — uma protecao que o exija pode dar-se por satisfeita com o primeiro a acabar`);
    }
  }
  return out;
}

/** So o que o PR INTRODUZIU (leitura independente do #308): um defeito que ja existia antes nao e deste
 *  PR, e sem saida pelo trailer deixava vermelho cada PR que tocasse no ficheiro — um do Dependabot a
 *  subir uma action incluido, que nao escreve trailer. */
export const defeitosNovos = (antes, depois) => {
  const ja = new Set(defeitosDeEstrutura(antes));
  return defeitosDeEstrutura(depois).filter((d) => !ja.has(d));
};
