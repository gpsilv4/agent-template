/**
 * O LIMITE de cada job de CI e os avisos de quando o tempo se aproxima dele (#542) — {{PROJECT_NAME}}
 *
 * O tempo de um job so se via quando ele ja tinha falhado: o `Simuladores` do PR #527 ficou a 32 s do seu
 * `timeout-minutes` e nada o disse; o do PR #541 foi cortado. Isto le o limite de cada job no workflow que correu e
 * classifica as corridas de cada job:
 *   - CORTADO: o GitHub matou-o pelo limite. Medido no run do #541: a `conclusion` e `cancelled` (como a de um
 *     cancelamento qualquer, ex. `concurrency`) e SO a anotacao do check run o distingue — "The job has exceeded the
 *     maximum execution time of 30m0s" —, e ela da o limite EFETIVO desse run (`limiteDaAnotacao`);
 *   - IMINENTE: uma corrida a >= 90% do limite (um corte a porta);
 *   - CRESCIMENTO: a MEDIANA das ultimas 5 corridas a >= 75% do limite atual (o ruido de um runner lento nao a move).
 * Com menos de 5 corridas, so o CORTADO e o IMINENTE, e diz-se.
 *
 * Puro, sem a API (o `minutos-ci` traz os dados). Os limiares provam-se na suite com casos NA fronteira (89,9/90,
 * 74,9/75): a varredura neutraliza as chamadas `aviso(`, nao as constantes.
 */
import { jobsDe, semComentario, valorDoNome } from "./jobs-workflow.mjs";
import { mediana } from "./minutos-calculo.mjs";
import { literalEmRegex } from "./regex-literal.mjs";

/** O `timeout-minutes` por omissao do GitHub (um job sem a chave). */
export const LIMITE_DO_GITHUB_MIN = 360;
export const IMINENTE = 0.9;
export const CRESCIMENTO = 0.75;
/** Quantas corridas entram na mediana do crescimento. */
export const JANELA = 5;

/** O MOLDE do nome que a API mostra para um job: cada `${{ ... }}` do `name:` e um curinga; um job de matriz com um
 *  nome sem expressoes (ou sem `name:`) recebe do GitHub o sufixo ` (a, b)`. `null` quando o nome nao se le. */
export function moldeDoNome(nome, matriz) {
  if (nome === null) return null;
  const partes = nome.split(/\$\{\{[\s\S]*?\}\}/);
  const corpo = partes.map(literalEmRegex).join(".+?");
  const sufixo = matriz && partes.length === 1 ? "(?: \\(.+\\))?" : "";
  return new RegExp(`^${corpo}${sufixo}$`);
}

/** O job tem uma MATRIZ: um `matrix:` DENTRO do bloco do `strategy:` (ou na propria linha, em flow) — um `matrix:` no
 *  `with:` ou no `env:` de um passo nao reparte nada (a mesma protecao do `nomeDeCheck` do gate). */
function temMatriz(j) {
  const iS = j.ls.findIndex((l, k) => k > 0 && /^[ \t]*strategy[ \t]*:/.test(l));
  if (iS < 0) return false;
  if (/\bmatrix[ \t]*:/.test(j.ls[iS])) return true;
  const ind = j.ls[iS].search(/\S/);
  for (let k = iS + 1; k < j.ls.length; k++) {
    const l = j.ls[k];
    if (!l.trim()) continue;
    if (l.search(/\S/) <= ind) return false;
    if (/^[ \t]*matrix[ \t]*:/.test(l)) return true;
  }
  return false;
}

/** Por job do workflow: `{ id, molde, limiteMin, porOmissao, chamador }`. `limiteMin` `null` = um `timeout-minutes` que
 *  nao e um numero literal (uma expressao): ilegivel, e quem chama di-lo. Um job que chama outro workflow (`uses:`) tem
 *  `molde` `null` e o `chamador`: os jobs do workflow chamado aparecem na API como `<chamador> / <job>`, e o limite
 *  deles vive no OUTRO ficheiro — nunca se ligam a um job deste (leitor do #542). */
export function limitesDoWorkflow(texto) {
  return jobsDe(texto).map((j) => {
    const chave = (k) => j.cru.find((l) => new RegExp(`^[ \\t]*${k}[ \\t]*:`).test(l));
    const t = chave("timeout-minutes");
    const valor = t ? semComentario(t).replace(/^[ \t]*timeout-minutes[ \t]*:[ \t]*/, "").replace(/^(["'])(.*)\1$/, "$2") : null;
    const limiteMin = t === undefined ? LIMITE_DO_GITHUB_MIN : /^\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : null;
    const nome = valorDoNome(j.cru);
    const usa = Boolean(chave("uses"));
    const molde = usa ? null : moldeDoNome(nome === undefined ? j.id : nome, temMatriz(j));
    return { id: j.id, molde, limiteMin, porOmissao: t === undefined, chamador: usa ? (nome ?? j.id) : null };
  });
}

/** O job do workflow a que pertence um nome da API: `{ estado: "ok", ... }`, `{ estado: "sem-job" }` ou
 *  `{ estado: "ambiguo", ids }` (dois moldes que casam o mesmo nome — nunca "o primeiro"). */
export function limiteDoJob(nomeDaApi, limites) {
  // Um job de um workflow chamado (`<chamador> / <job>`): o limite dele vive no outro ficheiro (um curinga deste, como
  // `^Deploy .+?$`, casava-o com o limite errado).
  if (typeof nomeDaApi !== "string" || limites.some((l) => l.chamador !== null && nomeDaApi.startsWith(`${l.chamador} / `))) return { estado: "sem-job" };
  const casam = limites.filter((l) => l.molde && l.molde.test(nomeDaApi));
  if (casam.length === 0) return { estado: "sem-job" };
  if (casam.length > 1) return { estado: "ambiguo", ids: casam.map((l) => l.id) };
  return { estado: "ok", ...casam[0] };
}

/** O limite EFETIVO de um job cortado, em segundos, lido das anotacoes do check run; `null` se nenhuma diz que o job
 *  passou o tempo (entao foi cancelado por outra razao). */
export function limiteDaAnotacao(anotacoes) {
  for (const a of anotacoes ?? []) {
    const m = /exceeded the maximum execution time of (?:(\d+)h)?(\d+)m(\d+)s/.exec(a?.message ?? "");
    if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return null;
}

/** Acrescenta um aviso (o sinal do par na varredura). */
function aviso(lista, tipo, texto) {
  lista.push({ tipo, texto });
}

const pct = (s, limite) => Math.round((100 * s) / limite);
const mmss = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;

/**
 * Os avisos de UM job, a partir das suas corridas POR ORDEM de inicio (as "ultimas 5" sao as mais recentes; quem chama
 * ordena — a API devolve os runs do mais recente para o mais antigo): `{ s, conclusao, limiteS, cortadoS }` —
 * `limiteS` o limite do workflow desse run (ou `null`, nao lido), `cortadoS` o limite da anotacao de corte (ou `null`).
 * Devolve `{ avisos, nota, resumo }`. So as corridas `success`/`failure` com limite entram no IMINENTE e na mediana:
 * um `cancelled` que nao foi corte (ex. `concurrency`) dura segundos e puxava a mediana para baixo.
 */
export function avisosDoJob(job, corridas) {
  const avisos = [];
  for (const c of corridas.filter((x) => x.cortadoS !== null && x.cortadoS !== undefined)) {
    aviso(avisos, "CORTADO", `${job}: cortado aos ${mmss(c.s)} pelo limite de ${mmss(c.cortadoS)}`);
  }
  const validas = corridas.filter((c) => (c.conclusao === "success" || c.conclusao === "failure") && c.limiteS);
  for (const c of validas) {
    if (c.s >= IMINENTE * c.limiteS) aviso(avisos, "AVISO", `${job}: ${mmss(c.s)} de ${mmss(c.limiteS)} (${pct(c.s, c.limiteS)}%) — corte iminente (>= ${Math.round(IMINENTE * 100)}%)`);
  }
  const ultimas = validas.slice(-JANELA);
  const med = ultimas.length ? mediana(ultimas.map((c) => c.s)) : null;
  const limiteAtual = ultimas.at(-1)?.limiteS ?? null;
  let nota = null;
  if (ultimas.length < JANELA) nota = `n=${ultimas.length} < ${JANELA}: so o corte iminente e o cortado`;
  else if (med >= CRESCIMENTO * limiteAtual) aviso(avisos, "AVISO", `${job}: mediana de ${JANELA} ${mmss(med)} de ${mmss(limiteAtual)} (${pct(med, limiteAtual)}%) — a crescer para o limite (>= ${Math.round(CRESCIMENTO * 100)}%)`);
  const maximo = validas.length ? Math.max(...validas.map((c) => c.s)) : null;
  return { avisos, nota, resumo: { n: ultimas.length, mediana: med, maximo, limite: limiteAtual } };
}
