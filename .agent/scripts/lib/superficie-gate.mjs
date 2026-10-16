/**
 * Desligar o gate sem tocar num teste: o trigger e os passos da maquinaria — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE (#285, parte 1): as MARCAS do `check-test-surface` leem linhas de teste. Mas o
 * `Guard Tests` desliga-se sem mexer em nenhuma: um `paths-ignore: ['**']` no `on:` faz o workflow
 * deixar de correr no PR, e `check-test-surface.mjs HEAD` compara a arvore consigo mesma. Nenhuma
 * contagem desce — o passo continua la, a fazer nada.
 *
 * A REGRA, decidida no `/grill` do #285, e grosseira de proposito, num workflow que corre testes:
 *  - QUALQUER alteracao ao `on:`, ou aos blocos de topo `env:` e `defaults:` (um `shell: 'true {0}'`
 *    em `defaults:` desliga todos os `run:` sem tocar numa linha deles), avisa;
 *  - QUALQUER passo que cite a maquinaria (`.agent/scripts/`, `.claude/hooks/`, `.githooks/`) e
 *    mude ou desapareca avisa — o PASSO inteiro com o cabecalho do JOB, e nao so a linha. A linha
 *    sozinha deixava passar mover o gate para o passo `Audit` (que tem `continue-on-error: true`),
 *    um `exit 0` acrescentado antes dele, ou o `if:`/`env:` do job mudado (leitura independente
 *    do #285, medido no codigo). Um passo NOVO nao avisa: so alarga a rede.
 * Reconhecer so as formas que estreitam era o jogo que o issue diz nao funcionar (`TP8`).
 *
 * Como o `Guard Tests` e obrigatorio, um aviso destes tem SAIDA, e so esta: o trailer
 * `Test-Surface: <ficheiro> — <porque>` no ULTIMO commit do PR que mexe nesse ficheiro. O aviso
 * passa a nota, com o motivo a vista. Num commit anterior nao conta: um trailer no commit 1 nao pode
 * cobrir o `paths-ignore` que o commit 5 acrescenta. Os avisos antigos (contagens que descem, testes
 * apagados) continuam sem saida.
 *
 * LIMITES ASSUMIDOS, escritos para nao serem descobertos: sem parser de YAML (os scripts nao tem
 * dependencias), logo um `on:` ou um passo montados por ancoras/aliases (`<<: *base`, `- *gate`) e
 * um job reutilizavel (`uses: ./.github/workflows/x.yml`) nao se leem; uma linha NOVA que neutraliza
 * noutro passo (um `git checkout` da base, um `ref:` no `actions/checkout`) nao e vista — as formas
 * de shell sao o #295; um clone raso (`fetch-depth` curto) pode por em `base..HEAD` commits que nao
 * sao do PR; e o trailer le-se dos COMMITS, logo uma alteracao ainda por commitar avisa sempre.
 */
import { modosDaMatriz, modosDoPortao } from "./gate-modos.mjs";

/** Uma linha de YAML sem o comentario e os espacos do fim. O `#` so comeca um comentario no
 *  inicio ou depois de um espaco — `${{ x }}#a` e `a#b` nao sao comentarios. */
const semComentario = (l) => l.replace(/(^|[ \t])#.*$/, "").replace(/[ \t]+$/, "");
const linhasDe = (texto) => texto.split(/\r\n|\r|\n/).map(semComentario);
const indent = (l) => /^[ \t]*/.exec(l)[0].length;
const limpas = (ls) => ls.map((l) => l.trim()).filter(Boolean);

/** Um bloco de topo (chave na coluna 0 ate a proxima), normalizado: sem comentarios, espacos
 *  finais nem linhas vazias. `null` quando nao existe. */
function blocoDeTopo(texto, chave) {
  if (!texto) return null;
  const ls = linhasDe(texto);
  const i = ls.findIndex((l) => chave.test(l));
  if (i < 0) return null;
  const fim = ls.findIndex((l, j) => j > i && /^[^\s#-]/.test(l));
  return [ls[i], ...ls.slice(i + 1, fim < 0 ? ls.length : fim).filter((l) => l.trim())].join("\n");
}

/**
 * O bloco `on:` de um workflow, normalizado para comparar. Comeca na chave `on:` na COLUNA 0
 * (tambem `"on":`, `'on':` e `true:`, que o YAML le como a mesma chave) e acaba na proxima chave de
 * coluna 0; a forma em linha (`on: [push, pull_request]`) vem na propria linha.
 * @param {string | null} texto
 * @returns {string | null} `null` quando o ficheiro nao tem `on:` de coluna 0
 */
export const blocoOn = (texto) => blocoDeTopo(texto, /^(?:on|"on"|'on'|true)[ \t]*:/);

/** O que cita a maquinaria de verificacao: quem a mudar num workflow mexe no proprio gate. */
const MAQUINARIA = /\.agent\/scripts\/|\.claude\/hooks\/|\.githooks\//;

/**
 * Um passo normalizado para o que ele FAZ: sem o `- `, sem indentacao, sem comentarios. O `run:`
 * guarda o TIPO de escalar — `|` (literal: uma linha, um comando) e diferente de `>` e do escalar
 * simples em varias linhas, que JUNTAM as linhas numa so: trocar `|` por `>` no passo da varredura
 * fazia de tudo o que vem depois de um `#` um comentario de shell, e o passo ficava verde sem varrer
 * (segunda leitura do #285, medido no `ci.yml`). So com UMA linha de conteudo as formas sao a mesma:
 * `run: x` e `run: |` + `x` (medido: um teste do #279 apanhou o alarme). As aspas de `run: "x"` saem.
 */
function normalizaPasso(ls) {
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const l = i === 0 ? ls[0].replace(/^([ \t]*)-[ \t]*/, "$1  ") : ls[i];
    const m = /^([ \t]*)run[ \t]*:[ \t]*(.*)$/.exec(l);
    if (!m) {
      if (l.trim()) out.push(l.trim());
      continue;
    }
    // O corpo do `run:`: as linhas seguintes MAIS indentadas que a chave (e as vazias pelo meio).
    let j = i + 1;
    while (j < ls.length && (!ls[j].trim() || indent(ls[j]) > m[1].length)) j++;
    const corpo = limpas(ls.slice(i + 1, j));
    const ind = /^[|>]/.test(m[2]) ? m[2][0] : "plano";
    const conteudo = ind === "plano" ? [m[2].replace(/^(["'])(.*)\1$/, "$2"), ...corpo].filter(Boolean) : corpo;
    out.push(conteudo.length <= 1 ? "run:|" : `run:${ind}`, ...conteudo);
    i = j - 1;
  }
  return out.join("\n");
}

/** As chaves do cabecalho de um job que NAO desligam o gate em silencio: um `timeout-minutes`, um
 *  `runs-on` ou um `permissions` errados fazem o job FALHAR ou ficar pendente — e um required check
 *  pendente bloqueia o merge. Medido no historico: o `timeout-minutes` subido duas vezes arrastava
 *  todos os passos do job para o aviso. Lista do que se IGNORA, de proposito: uma chave que nao
 *  esteja aqui continua vigiada (falha fechada, `TP6`). */
const CABECALHO_INOFENSIVO = /^(?:timeout-minutes|runs-on|name|permissions|outputs|concurrency|environment)[ \t]*:/;

/** O cabecalho de um job sem as chaves inofensivas (e o que esta aninhado nelas). */
function cabecalhoQueConta(ls) {
  const ne = ls.slice(1).filter((l) => l.trim());
  if (ne.length === 0) return limpas(ls).join("\n");
  const ind = Math.min(...ne.map(indent));
  const fica = [ls[0]];
  let saltar = false;
  for (const l of ls.slice(1)) {
    if (l.trim() && indent(l) === ind) saltar = CABECALHO_INOFENSIVO.test(l.trim());
    if (!saltar) fica.push(l);
  }
  return limpas(fica).join("\n");
}

/** Parte `ls` em grupos que comecam numa linha com a indentacao `ind` (e que case `abre`). */
function agrupa(ls, ind, abre = () => true) {
  const grupos = [];
  for (const l of ls) {
    if (l.trim() && indent(l) === ind && abre(l)) grupos.push([l]);
    else if (grupos.length) grupos.at(-1).push(l);
  }
  return grupos;
}

/** O id de um job a partir da sua linha (`  guard-tests:` -> `guard-tests`). */
const idDe = (l) => l.trim().replace(/^["']?([^"':]+)["']?[ \t]*:.*$/, "$1");

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
function agregadoresDe(jobs) {
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

/**
 * As UNIDADES da maquinaria de um workflow: cada passo que a cite, com o cabecalho do job onde
 * esta (o id, `if:`, `needs:`, `env:`, `continue-on-error:`, ... — menos os `steps:` e as chaves
 * de `CABECALHO_INOFENSIVO`). `chave` e o que
 * se compara; `rotulo` e o que se mostra (a primeira linha da maquinaria). As linhas que a citem
 * fora de um passo (um `if:` de job, uma linha solta) sao unidades so delas.
 * @param {string | null} texto
 * @returns {{chave: string, rotulo: string, job: string, passo: string}[]}
 */
export function unidadesDaMaquinaria(texto) {
  if (!texto) return [];
  const ls = linhasDe(texto);
  const rotuloDe = (grupo) => limpas(grupo).find((l) => MAQUINARIA.test(l)).replace(/^(?:-[ \t]+)?(?:run[ \t]*:[ \t]*)?/, "");
  const soltas = (grupo) => limpas(grupo).filter((l) => MAQUINARIA.test(l)).map((l) => ({ chave: l, rotulo: l, job: "", passo: l }));
  const iJobs = ls.findIndex((l) => /^jobs[ \t]*:/.test(l));
  if (iJobs < 0) return soltas(ls);
  const fimJobs = ls.findIndex((l, j) => j > iJobs && /^[^\s#]/.test(l));
  const corpo = ls.slice(iJobs + 1, fimJobs < 0 ? ls.length : fimJobs);
  const unidades = [...soltas(ls.slice(0, iJobs)), ...(fimJobs < 0 ? [] : soltas(ls.slice(fimJobs)))];
  const naoVazias = corpo.filter((l) => l.trim());
  if (naoVazias.length === 0) return unidades;
  const jobs = agrupa(corpo, Math.min(...naoVazias.map(indent)));
  // Os AGREGADORES (`agregadoresDe`): mudar-lhes o `case`, tirar o `always()` ou um job do `needs:`
  // desligava o gate sem tocar numa linha de maquinaria — por isso cada um e uma unidade, o job
  // inteiro menos as chaves inofensivas do cabecalho (`timeout-minutes`, `runs-on`, ...).
  const { agregadores } = agregadoresDe(jobs.map((j) => ({ id: idDe(j[0]), ls: j })));
  for (const job of jobs) {
    if (!agregadores.has(idDe(job[0]))) continue;
    const inteiro = cabecalhoQueConta(job);
    unidades.push({ chave: inteiro, rotulo: `o job ${idDe(job[0])} (agrega o resultado da maquinaria)`, job: job[0].trim(), passo: inteiro });
  }
  for (const job of jobs) {
    const id = job[0].trim();
    const iSteps = job.findIndex((l) => /^[ \t]*steps[ \t]*:/.test(l));
    // `steps: [...]` (flow) nao se parte em passos: o job inteiro e uma unidade (falha fechada).
    if (iSteps >= 0 && /^[ \t]*steps[ \t]*:[ \t]*\S/.test(job[iSteps])) {
      if (job.some((l) => MAQUINARIA.test(l))) unidades.push({ chave: limpas(job).join("\n"), rotulo: `o job ${id} (steps em flow)`, job: id, passo: "" });
      continue;
    }
    // Os passos acabam na primeira linha a coluna de `steps:` (ou menos) que nao seja um `-`: um
    // `if:`/`timeout-minutes:` DEPOIS dos `steps:` e cabecalho, e nao um passo (segunda leitura).
    const sInd = iSteps < 0 ? 0 : indent(job[iSteps]);
    let fimPassos = iSteps + 1;
    while (iSteps >= 0 && fimPassos < job.length && (!job[fimPassos].trim() || indent(job[fimPassos]) > sInd || /^[ \t]*-/.test(job[fimPassos]))) fimPassos++;
    const cabecalho = iSteps < 0 ? job : [...job.slice(0, iSteps), ...job.slice(fimPassos)];
    const cab = cabecalhoQueConta(cabecalho);
    unidades.push(...soltas(cabecalho).map((u) => ({ ...u, chave: `${cab}\n${u.chave}`, job: id, passo: u.chave })));
    if (iSteps < 0) continue;
    const passos = job.slice(iSteps + 1, fimPassos);
    const ne = passos.filter((l) => l.trim());
    if (ne.length === 0) continue;
    for (const p of agrupa(passos, Math.min(...ne.map(indent)), (l) => /^[ \t]*-/.test(l))) {
      const passo = normalizaPasso(p);
      if (p.some((l) => MAQUINARIA.test(l))) unidades.push({ chave: `${cab}\n--\n${passo}`, rotulo: rotuloDe(p), job: id, passo });
    }
  }
  return unidades;
}

/**
 * O que existia ANTES e deixou de existir, como multiconjunto: uma unidade que mudou e uma unidade
 * perdida (e a nova, acrescentada, que nao conta). Acrescentar uma verificacao so alarga a rede.
 * @param {string[]} antes
 * @param {string[]} agora
 * @returns {number[]} os indices de `antes` que se perderam
 */
export function perdidas(antes, agora) {
  const restam = new Map();
  for (const l of agora) restam.set(l, (restam.get(l) ?? 0) + 1);
  const perdeu = [];
  antes.forEach((l, i) => {
    const n = restam.get(l) ?? 0;
    if (n > 0) restam.set(l, n - 1);
    else perdeu.push(i);
  });
  return perdeu;
}

/**
 * Os trailers `Test-Surface: <ficheiro> — <porque>` de uma mensagem de commit. O separador e o
 * travessao, `--` ou ` - `; um motivo VAZIO nao conta — o trailer existe para deixar escrito o
 * porque, e sem ele e so um interruptor.
 * @param {string} mensagem
 * @returns {Map<string, string>} ficheiro -> motivo
 */
export function aceites(mensagem) {
  const m = new Map();
  for (const l of mensagem.split(/\r\n|\r|\n/)) {
    const t = /^[ \t]*test-surface[ \t]*:[ \t]*(\S+)[ \t]+(?:—|--|-)[ \t]*(.*?)[ \t]*$/i.exec(l);
    if (t && t[2]) m.set(t[1], t[2]);
  }
  return m;
}

/** O GitHub so corre os workflows da raiz: `apps/x/.github/workflows/` e ignorado, e editar um
 *  desses nao mexe em gate nenhum. */
const WORKFLOW_DA_RAIZ = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
/** Um workflow que corre testes sem um `node ...test` (o que as CONTAGENS veem) — o `e2e.yml` deste
 *  repo e um. O runner como COMANDO (`npm test`, `npm run test:e2e`, `go test`, ...), e nao a palavra
 *  algures na linha: `npm i -D @playwright/test` nao corre testes. A lista esta no `CONTRIBUTING.md`. */
const RUNNER = /^(?![ \t]*#)[^\n]*(?:\b(?:npm|pnpm|yarn|bun)(?:[ \t]+run)?[ \t]+test(?![\w/-])|\b(?:npm|pnpm|yarn)[ \t]+run[ \t]+test:|\bnpx[ \t]+(?:vitest|jest|playwright[ \t]+test|cypress[ \t]+run|mocha)\b|\bpytest\b|\bpython3?[ \t]+-m[ \t]+(?:pytest|unittest)\b|\b(?:go|cargo|dotnet|make)[ \t]+test\b|\bnode[ \t]+--test\b)/m;

/**
 * Avisa quando um workflow que CORRE TESTES muda o `on:`, o `env:`/`defaults:` de topo, ou um
 * passo da maquinaria. Com o trailer no ultimo commit que mexe no ficheiro, passa a nota.
 *
 * @param {{f: string, antes: string, agora: string, para?: string, contavel: boolean, base: string,
 *          git: (args: string[]) => string, ler: (rel: string) => string|null,
 *          warn: (m: string) => void, note: (m: string) => void}} o
 * @returns {boolean} `true` se avisou (quem chama nao diz "sem marcas" a seguir)
 */
export function verificaGate({ f, antes, agora, para, contavel, base, git, ler, warn, note }) {
  // Os defeitos de estrutura (#308) primeiro, e em QUALQUER workflow da raiz que mudou — tambem num
  // novo: um `needs:` partido invalida-o inteiro, corra testes ou nao. So os que o PR introduziu.
  // So na entrada do proprio ficheiro: numa renomeacao, o destino entra por si — correr aqui tambem
  // dizia cada defeito duas vezes (leitura independente do #308).
  const estrutura = WORKFLOW_DA_RAIZ.test(f) && para === undefined ? defeitosNovos(antes, agora) : [];
  for (const d of estrutura) warn(`${f}: ${d}`);
  // Um workflow novo so alarga a rede (`antes` vazio); um apagado ja avisa pela contagem que desce.
  if (!WORKFLOW_DA_RAIZ.test(f) || !antes || !(contavel || RUNNER.test(antes))) return estrutura.length > 0;
  const sinais = [];
  // Renomeado: compara-se com o DESTINO. Para fora da raiz, o GitHub deixa de o correr.
  let depois = agora;
  if (para !== undefined) {
    if (!WORKFLOW_DA_RAIZ.test(para)) sinais.push(`saiu para ${para}, que o GitHub nao corre`);
    depois = WORKFLOW_DA_RAIZ.test(para) ? ler(para) ?? "" : antes;
  }
  for (const [nome, re] of [["on", /^(?:on|"on"|'on'|true)[ \t]*:/], ["env", /^env[ \t]*:/], ["defaults", /^defaults[ \t]*:/]]) {
    const [a, d] = [blocoDeTopo(antes, re), blocoDeTopo(depois, re)];
    if (a !== d) sinais.push(`o \`${nome}:\` mudou (antes: ${(a ?? "(nenhum)").replace(/\n\s*/g, " ")} | agora: ${(d ?? "(nenhum)").replace(/\n\s*/g, " ")})`);
  }
  const ua = unidadesDaMaquinaria(antes);
  const ud = unidadesDaMaquinaria(depois);
  // Um passo que continua igual no MESMO job, e so o cabecalho do job mudou: diz-se uma vez, pelo
  // job, e nao passo a passo (no `guard-tests` real seriam ~25 linhas sem dizer a causa).
  const cabecalhos = new Set();
  for (const i of perdidas(ua.map((u) => u.chave), ud.map((u) => u.chave))) {
    const u = ua[i];
    if (u.job && ud.some((v) => v.job === u.job && v.passo === u.passo)) cabecalhos.add(u.job);
    else sinais.push(`passo da maquinaria mudou ou saiu: ${u.rotulo}`);
  }
  for (const job of cabecalhos) sinais.push(`o cabecalho do job \`${job.replace(/:$/, "")}\` mudou (if:/needs:/env:/continue-on-error:...)`);
  if (sinais.length === 0) return estrutura.length > 0;
  let motivo = null;
  try {
    // Numa renomeacao o ultimo commit pode tocar so no DESTINO: procura-se nos dois, e o trailer
    // pode nomear qualquer dos dois (segunda leitura: o da origem num commit antigo cobria o destino).
    const caminhos = para === undefined ? [f] : [f, para];
    const m = aceites(git(["log", "-1", "--format=%B", `${base}..HEAD`, "--", ...caminhos]));
    motivo = caminhos.map((c) => m.get(c)).find(Boolean) ?? null;
  } catch {
    motivo = null; // sem o log, sem saida: o aviso fica (falha fechada)
  }
  if (motivo) {
    note(`${f}: ${sinais.join("; ")} — aceite (Test-Surface: ${motivo})`);
    return estrutura.length > 0;
  }
  warn(
    `${f}: ${sinais.join("; ")} desde ${base} — muda o gate sem tocar num teste; se e deliberado, ` +
      `o ultimo commit que mexe neste ficheiro leva o trailer \`Test-Surface: ${f} — <porque>\``
  );
  return true;
}
