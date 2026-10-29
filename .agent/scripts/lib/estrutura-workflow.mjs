/**
 * A ESTRUTURA do gate de um workflow (#308, #374b): os jobs, os `needs:`, os AGREGADORES (quem le o resultado da
 * maquinaria) e os defeitos de forma que desligam o gate sem tocar num teste — {{PROJECT_NAME}}
 *
 * Saiu do `superficie-gate.mjs` quando ele chegou as 494 linhas (o Guard 17 reprova acima de 500), sem mudar
 * comportamento: as linhas vieram tal e qual. O gate importa daqui o que partilha (o `semComentario`, o `indent`,
 * a `MAQUINARIA`, o `idDe`, os `agregadoresDe`, os `defeitosNovos` e as `colisoesNovas`); este modulo nao importa o gate (sem ciclo).
 * Cada defeito sai por `defeito(`, o sinal do par em `lib/pares.mjs` (#382); o dono na varredura e o
 * `tests/tests-estrutura-workflow.mjs`, no `test-guards`, onde cada sitio morre em milissegundos.
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
  // A ancora (`&n`) e a tag `!!str` nao fazem parte do valor (#355): o YAML le `&n Guard Tests` como `Guard Tests`.
  const v = linha.replace(/^[ \t]*name[ \t]*:[ \t]*/, "").replace(/^&\S+[ \t]+/, "").replace(/^!!str[ \t]+/, "");
  const aspas = /^(["'])(.*?)\1/.exec(v);
  let nome = aspas ? aspas[2] : v.replace(/(^|[ \t])#.*$/, "").trim();
  // Os escapes entre aspas duplas (`"Guard\x20Tests"`) leem-se como o YAML os le; um que nao se le e nao literal.
  if (aspas?.[1] === '"' && nome.includes("\\")) {
    try {
      nome = JSON.parse(`"${nome.replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1")}"`);
    } catch {
      return null;
    }
  }
  return !nome || /\$\{\{|^[|>*&!]/.test(nome) ? null : nome;
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
  // Cada chamada e um sitio da varredura (#382); o `out.push(` do `needsDe` e leitura, e fica de fora.
  const defeito = (m) => out.push(m);
  for (const j of jobs) {
    for (const n of needsDe(j.ls)) if (!ids.has(n)) defeito(`o job \`${j.id}\` tem \`needs: ${n}\`, e o job \`${n}\` nao existe — o GitHub rejeita o workflow inteiro`);
  }
  const varrem = jobs.filter((j) => j.ls.some((l) => VARREDURA.test(l)));
  if (varrem.length > 1) defeito(`a varredura de mutacao corre em ${varrem.length} jobs (${varrem.map((j) => `\`${j.id}\``).join(", ")}) — corre duas vezes; um passo que mudou de job sai do antigo`);
  // So quando as suites correm NOUTRO job deste workflow: um job que so corre a varredura, num
  // workflow sem suites, e ele proprio o check — nao ha nada de que ficar de fora (as fixtures do
  // `check-test-surface` tem esse workflow, e foi o controlo negativo do diferencial que o mostrou).
  const haSuites = jobs.some((j) => j.ls.some((l) => SUITES.test(l)));
  for (const j of varrem) {
    const lida = jobs.some((a) => agregadores.has(a.id) && new RegExp(`\\bneeds\\.${j.id}\\.result\\b`).test(a.ls.join("\n")));
    if (haSuites && !j.ls.some((l) => SUITES.test(l)) && !lida) defeito(`a varredura corre no job \`${j.id}\`, sem as suites e sem um agregador que leia \`needs.${j.id}.result\` — fica fora do check que a protecao exige`);
  }
  // Os SHARDS (#308): cada shard so ve a sua fatia, e "todos verdes" nao prova que todos correram — quem
  // o prova e o portao (`lib/varredura-shards.mjs`). Um derivado que traga a matriz em shards SEM o
  // portao ficava com um shard em falta verde: falha aberta (leitor do #308). E o portao tem de estar num
  // AGREGADOR (auditoria do #308): num job a parte, que nenhuma protecao exige, nao decide nada. O `ls` ja
  // vem sem comentarios.
  const ativa = (j, re) => j.ls.some((l) => re.test(l));
  if (jobs.some((j) => ativa(j, /\bSWEEP_SHARD\b/)) && !jobs.some((j) => agregadores.has(j.id) && ativa(j, /\bvarredura-shards\.mjs\b/))) {
    defeito("a varredura e repartida em shards (`SWEEP_SHARD`) e nenhum job AGREGADOR confere os relatorios deles (`lib/varredura-shards.mjs`) — um shard em falta passava verde");
  }
  // Os MODOS (#317): a matriz e a linha do portao sao duas listas, e tem de ser IGUAIS (`lib/gate-modos.mjs`).
  // Um modo que nao chegue ao portao passava verde se deixasse de correr; um a mais punha todos os PRs
  // vermelhos. O que nao se le FALHA FECHADO: um YAML desconhecido calava a regra (leituras do #317).
  for (const j of jobs.filter((x) => ativa(x, /\bSWEEP_SHARD\b/))) {
    const daMatriz = modosDaMatriz(j.ls);
    if (daMatriz === null) {
      defeito(`nao consegui ler os modos da matriz do job \`${j.id}\` (\`modo: [a, b]\` ou \`- modo: x\`) — sem eles, o portao nao sabe que modos exigir`);
      continue;
    }
    for (const a of jobs.filter((x) => agregadores.has(x.id))) {
      for (const recebe of modosDoPortao(a.ls)) {
        if (recebe === null) {
          defeito(`nao consegui ler os modos que o portao recebe no job \`${a.id}\` — escreve-os por extenso, sem variaveis`);
          continue;
        }
        const faltam = daMatriz.filter((x) => !recebe.includes(x));
        const sobram = recebe.filter((x) => !daMatriz.includes(x));
        if (faltam.length) defeito(`o portao (\`lib/varredura-shards.mjs\`, job \`${a.id}\`) nao recebe o(s) modo(s) ${faltam.join(", ")} da matriz — um modo que nao corresse passava verde`);
        if (sobram.length) defeito(`o portao (\`lib/varredura-shards.mjs\`, job \`${a.id}\`) exige o(s) modo(s) ${sobram.join(", ")}, que a matriz nao tem — todos os PRs ficavam vermelhos`);
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
      defeito(`os jobs ${js.map((j) => `\`${j}\``).join(" e ")} tem o mesmo nome de check, \`${nome}\` — uma protecao que o exija pode dar-se por satisfeita com o primeiro a acabar`);
    }
  }
  return out;
}

/** Um workflow SO reutilizavel (#355): a unica chave do `on:` e `workflow_call` — `on: workflow_call`,
 *  `on: [workflow_call]`, ou o bloco (com `inputs:` aninhados). Os checks dele chamam-se `chamador / job`, e
 *  nunca tem o nome nu. FALHA FECHADA: um `on:` que nao se le (um alias, uma forma desconhecida) e um
 *  workflow normal, e os nomes dele contam. */
function soReutilizavel(texto) {
  const ls = texto.split(/\r\n|\r|\n/).map(semComentario);
  const i = ls.findIndex((l) => /^(?:on|"on"|'on'|true)[ \t]*:/.test(l));
  if (i < 0) return false;
  const valor = ls[i].replace(/^[^:]*:[ \t]*/, "").trim();
  const so = (xs) => xs.length === 1 && xs[0] === "workflow_call";
  if (valor.startsWith("[")) return /^\[[^\]]*\]$/.test(valor) && so(valor.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")));
  if (valor) return valor === "workflow_call";
  const fim = ls.findIndex((l, k) => k > i && /^\S/.test(l));
  const corpo = ls.slice(i + 1, fim < 0 ? ls.length : fim).filter((l) => l.trim());
  if (corpo.length === 0) return false;
  const ind = Math.min(...corpo.map(indent));
  const chaves = corpo.filter((l) => indent(l) === ind).map((l) => /^[ \t]*["']?([\w-]+)["']?[ \t]*:/.exec(l)?.[1] ?? null);
  return !chaves.includes(null) && so(chaves);
}

/** O nome do CHECK de um job, ou `null` quando o check nao tem o nome nu (#355): um job de matriz (o GitHub
 *  acrescenta os valores, `Nome (a, b)`), um job que chama um reutilizavel (`chamador / job`), ou um nome que
 *  nao e literal. Comparado com `trim()` e sem distinguir maiusculas: nao medi como o GitHub compara o nome
 *  exigido, e assim falha para o lado de avisar. */
function nomeDeCheck(j) {
  const chaves = chavesDoJob(j.ls);
  if (chaves.some(({ l }) => /^[ \t]*uses[ \t]*:/.test(l))) return null;
  // O `matrix:` DENTRO do bloco do `strategy:` (ou no flow da propria linha): um `matrix:` num `env:` ou num
  // `with:` nao reparte nada, e lido como matriz calava o nome (leitura adversarial do #355).
  const s = chaves.find(({ l }) => /^[ \t]*strategy[ \t]*:/.test(l));
  if (s && /\bmatrix[ \t]*:/.test(s.l)) return null;
  for (const l of s ? j.ls.slice(s.k + 1) : []) {
    if (!l.trim()) continue;
    if (indent(l) <= indent(s.l)) break;
    if (/^[ \t]*matrix[ \t]*:/.test(l)) return null;
  }
  return nomeLiteral(j.cru, j.id);
}

/** Os checks de um workflow, `[{ id, nome, portao }]`; nenhum se ele for so reutilizavel. */
function checksDe(texto) {
  if (!texto || soReutilizavel(texto)) return [];
  const jobs = jobsDe(texto);
  const { vigiados, agregadores } = agregadoresDe(jobs);
  return jobs.map((j) => ({ id: j.id, nome: nomeDeCheck(j), portao: vigiados.has(j.id) || agregadores.has(j.id) })).filter((c) => c.nome !== null);
}

/**
 * O mesmo nome de check ENTRE workflows (#355): um job noutro ficheiro com o nome de um portao (`name: Guard
 * Tests` + `echo ok`) reporta um check verde com esse nome, e uma protecao que o exija da-se por satisfeita.
 * Defeito quando um dos dois e portao NO SEU workflow (maquinaria ou agregador): duas colisoes entre jobs
 * alheios (`Detect Project` em dois ficheiros, num derivado) sao idioma legitimo. Devolve um `Map` do NOME de
 * check (a chave: sem ids nem caminhos, para mudar um id ou renomear o outro ficheiro nao fazer renascer uma
 * colisao antiga) para as mensagens — todas, uma por par de jobs.
 * LIMITES (como dentro de um ficheiro): o nome nao literal (`name: ${{ 'Guard Tests' }}`), um escape que nao se
 * le, e o escalar partido por varias linhas (`name: Guard` + `Tests` na seguinte, que se le `Guard`); a chave
 * entre aspas (`"name": X`) e o job em flow (`fake: { name: X }`), que se leem pelo id; os checks de nome
 * COMPOSTO (o de um portao reutilizavel, `chamador / job`, e o de um de matriz, `Nome (a, b)`), que nunca se
 * constroem; um passo que publique um commit status (`context:`) ou um check run pela API — inalcancavel por
 * analise estatica. E CONTA A MAIS (sem saida, como os outros defeitos de estrutura): um workflow que nunca
 * corre sobre o SHA de um PR (`on: push` so para o `main`, `on: release`) — excluir por gatilho abria outra
 * forma de evasao.
 * @param {string | null} texto  o workflow tocado
 * @param {{ f: string, texto: string | null }[]} outros  os outros workflows da raiz
 */
export function colisoesEntreWorkflows(texto, outros) {
  const meus = checksDe(texto);
  const out = new Map();
  const defeito = (nome, m) => out.set(nome, [...(out.get(nome) ?? []), m]);
  const chaveDoNome = (n) => n.trim().toLowerCase();
  for (const o of outros) {
    for (const c of checksDe(o.texto)) {
      for (const j of meus.filter((x) => chaveDoNome(x.nome) === chaveDoNome(c.nome) && (x.portao || c.portao))) {
        defeito(chaveDoNome(j.nome), `o job \`${j.id}\`${j.portao ? " (portao)" : ""} tem o mesmo nome de check, \`${j.nome.trim()}\`, que o job \`${c.id}\`${c.portao ? " (portao)" : ""} de \`${o.f}\` — uma protecao que o exija pode dar-se por satisfeita com o primeiro a acabar`);
      }
    }
  }
  return out;
}

/** So as colisoes que o PR introduziu, por nome de check: o ANTES contra os outros na BASE, o depois contra os
 *  outros AGORA. Com os de agora dos dois lados, um PR que pusesse a maquinaria nos DOIS jobs de um nome que ja
 *  se repetia (sem portao) via a colisao ja no "antes", e calava-a (leitura adversarial do #355). Os da base
 *  podem vir por uma funcao, chamada SO se o depois tiver colisoes: le-los sao processos `git`, e no caso de
 *  todos os PRs (nenhuma colisao) nao sao precisos (medido: ~85 ms -> ~15 ms por workflow tocado). */
export const colisoesNovas = (antes, outrosAntes, depois, outros) => {
  const novas = colisoesEntreWorkflows(depois, outros);
  if (novas.size === 0) return [];
  const ja = colisoesEntreWorkflows(antes, typeof outrosAntes === "function" ? outrosAntes() : outrosAntes);
  return [...novas].filter(([k]) => !ja.has(k)).flatMap(([, ms]) => ms);
};

/** So o que o PR INTRODUZIU (leitura independente do #308): um defeito que ja existia antes nao e deste
 *  PR, e sem saida pelo trailer deixava vermelho cada PR que tocasse no ficheiro — um do Dependabot a
 *  subir uma action incluido, que nao escreve trailer. */
export const defeitosNovos = (antes, depois) => {
  const ja = new Set(defeitosDeEstrutura(antes));
  return defeitosDeEstrutura(depois).filter((d) => !ja.has(d));
};
