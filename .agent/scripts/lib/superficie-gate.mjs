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
 *    do #285, medido no codigo). Um passo NOVO nao avisa: so alarga a rede. O passo das SUITES EM
 *    PARALELO parte-se numa unidade fixa e numa por suite (#341, `lib/passo-paralelo.mjs`): uma suite
 *    nova DENTRO da cadeia do runner e uma unidade nova, e nao avisa.
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
import { semComentario, indent, MAQUINARIA, idDe, agregadoresDe, defeitosNovos } from "./estrutura-workflow.mjs";
import { partePasso, unidadesDoParalelo } from "./passo-paralelo.mjs";

const linhasDe = (texto) => texto.split(/\r\n|\r|\n/).map(semComentario);
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

/** Parte `ls` em grupos que comecam numa linha com a indentacao `ind` (e que case `abre`). Cada grupo guarda em
 *  `.inicio` o indice da sua primeira linha em `ls`: e o que alinha as linhas limpas com as cruas (#341). */
function agrupa(ls, ind, abre = () => true) {
  const grupos = [];
  ls.forEach((l, i) => {
    if (l.trim() && indent(l) === ind && abre(l)) grupos.push(Object.assign([l], { inicio: i }));
    else if (grupos.length) grupos.at(-1).push(l);
  });
  return grupos;
}

/**
 * As UNIDADES da maquinaria de um workflow: cada passo que a cite, com o cabecalho do job onde
 * esta (o id, `if:`, `needs:`, `env:`, `continue-on-error:`, ... — menos os `steps:` e as chaves
 * de `CABECALHO_INOFENSIVO`). `chave` e o que
 * se compara; `rotulo` e o que se mostra (a primeira linha da maquinaria). As linhas que a citem
 * fora de um passo (um `if:` de job, uma linha solta) sao unidades so delas.
 * @param {string | null} texto
 * @returns {{chave: string, rotulo: string, job: string, passo: string, aviso?: string | null}[]}
 */
export function unidadesDaMaquinaria(texto) {
  if (!texto) return [];
  const ls = linhasDe(texto);
  const cru = texto.split(/\r\n|\r|\n/);
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
      if (!p.some((l) => MAQUINARIA.test(l))) continue;
      // O passo das suites em paralelo (#341): uma unidade fixa e uma por suite (`lib/passo-paralelo.mjs`).
      const ini = iJobs + 1 + job.inicio + iSteps + 1 + p.inicio;
      const parte = partePasso(p, cru.slice(ini, ini + p.length), normalizaPasso);
      if (parte) {
        unidades.push(...unidadesDoParalelo(parte, cab, id));
        continue;
      }
      const passo = normalizaPasso(p);
      unidades.push({ chave: `${cab}\n--\n${passo}`, rotulo: rotuloDe(p), job: id, passo });
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
    // So e "o cabecalho mudou" se o MESMO passo continua la tantas vezes como antes (#341: uma suite repetida, e
    // tirar uma das duas, deixava a outra a fazer de prova e dizia "cabecalho" em vez do nome da suite).
    const n = (us) => us.filter((v) => v.job === u.job && v.passo === u.passo).length;
    if (u.job && n(ud) > 0 && n(ud) >= n(ua)) cabecalhos.add(u.job);
    else sinais.push(`passo da maquinaria mudou ou saiu: ${u.rotulo}`);
  }
  for (const job of cabecalhos) sinais.push(`o cabecalho do job \`${job.replace(/:$/, "")}\` mudou (if:/needs:/env:/continue-on-error:...)`);
  // Uma suite que ficou FORA da cadeia do runner (#341): o aviso acima diz "o passo mudou"; este diz porque.
  // Pelo `passo` e nao pela `chave`: senao uma suite ja fora da cadeia na base voltava a cada mudanca de cabecalho.
  for (const v of ud) if (v.aviso && !ua.some((u) => u.passo === v.passo)) sinais.push(v.aviso);
  sinais.splice(0, sinais.length, ...new Set(sinais)); // dois passos iguais perdidos davam a mesma linha duas vezes
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
