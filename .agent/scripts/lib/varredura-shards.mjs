/**
 * Os SHARDS da varredura de mutacao (#308, o desenho do #159): a perna completa repartida por
 * varias maquinas do CI, cada uma com a sua fatia de sitios. Num privado (2 vCPU) a varredura
 * completa ja passava os 37 min — metade do teto de 75 —, e nenhum corte por sitio dava folga.
 *
 * O QUE NENHUMA MAQUINA VE SOZINHA: cada shard reprova os seus sitios por cobrir, mas um shard
 * que NAO CORREU (tirado da matriz por engano) nao reprova nada — metade dos sitios ficava por
 * medir com tudo verde. Por isso cada shard escreve um RELATORIO, e o portao (`guard-gate`)
 * confere-os todos juntos com `confere()`: os indices sao exactamente 1..n, todos concordam no
 * `n` e no total, e a soma dos medidos e o total. O desenho original do #159 tinha esta defesa;
 * uma primeira versao do #308 deixou-a cair, e a revisao do proprio ticket repo-la.
 *
 * Uso no portao: `node .agent/scripts/lib/varredura-shards.mjs <pasta-com-os-relatorios> [modo...]`. Os
 * MODOS esperados (#317): sem eles, tirar a `skips` da matriz deixava o portao verde sem ela — cada modo
 * so era conferido se aparecesse. Sem modos na linha de comando, o comportamento e o de antes (um derivado
 * com o `ci.yml` antigo nao parte); o gate (`estrutura-workflow.mjs`) exige que sejam os da matriz.
 *
 * A FATIA (`--shard=k/n`, a particao) vive em `./varredura-fatia.mjs`, e nao aqui: este modulo
 * tem sitios de recusa, e o varredor importa-la arrastava-o para a fixture do
 * `test-mutation-sweep`, cujo `PARES` sintetico nao o declara (o mesmo que o `ordem-por-alvo.mjs`
 * documenta: medido, toda a suite vermelha com `SEM PAR`).
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ehMain } from "./eh-main.mjs";

/**
 * Confere os relatorios de todos os shards de UMA corrida. Cada relatorio:
 * `{ modo, k, n, total, medidos, aplicavel }` (`aplicavel: false` = o PR nao tocou em verificador
 * nenhum, e a varredura nem correu).
 * @param {Array<{modo: string, k: number, n: number, total?: number, medidos?: number, aplicavel: boolean}>} relatorios
 * @param {string[]} [modos] os modos que TEM de ter relatorios (a matriz do `sweep`)
 * @param {{plano?: boolean}} [o] o PLANO da base (#347): com ele, cada relatorio tem de ter `aplicavel ===
 *   plano`. No C2 o portao so o passa com `true` (com `false`, os shards nem arrancam): um shard "nao aplicavel"
 *   com o plano a dizer que se aplica nao mediu nada (`TP2`). Sem ele, como antes.
 * @returns {string[]} os problemas; vazio = a varredura inteira foi medida
 */
export function confere(relatorios, modos = [], { plano } = {}) {
  const problemas = [];
  if (typeof plano === "boolean") {
    const contra = relatorios.filter((r) => r.aplicavel !== plano).map((r) => `${r.modo} ${r.k}/${r.n}`);
    if (contra.length) problemas.push(`o plano da base diz que a varredura ${plano ? "se aplica" : "nao se aplica"}, e ${contra.join(", ")} decidiu o contrario — o plano da base e os relatorios dos shards discordam`);
  }
  if (relatorios.length === 0) problemas.push("nenhum relatorio de shard — a varredura nao deixou prova de ter corrido");
  for (const m of modos) if (!relatorios.some((r) => r.modo === m)) problemas.push(`${m}: nenhum relatorio — o modo saiu da matriz, ou nao correu`);
  // A MESMA decisao para todos os modos pedidos (leitura do #317), como ja vale entre os shards de um: uma
  // `completa` que correu com uma `skips` toda "nao aplicavel" e um modo que um `if:` proprio calou.
  const decisoes = new Set(modos.flatMap((m) => relatorios.filter((r) => r.modo === m).map((r) => r.aplicavel)));
  if (decisoes.size > 1) problemas.push(`os modos ${modos.join(", ")} nao concordam em correr: uns mediram, outros disseram "nao aplicavel"`);
  for (const modo of [...new Set(relatorios.map((r) => r.modo))].sort()) {
    const rs = relatorios.filter((r) => r.modo === modo);
    const ns = [...new Set(rs.map((r) => r.n))];
    if (ns.length !== 1) {
      problemas.push(`${modo}: os shards nao concordam no numero de shards (${ns.join(", ")})`);
      continue;
    }
    const n = ns[0];
    const ks = rs.map((r) => r.k).sort((a, b) => a - b);
    const esperado = Array.from({ length: n }, (_, i) => i + 1);
    if (ks.join(",") !== esperado.join(",")) problemas.push(`${modo}: shards ${ks.join(",")} de ${n} — esperado exactamente ${esperado.join(",")}`);
    const aplicaveis = rs.filter((r) => r.aplicavel);
    // Todos "nao aplicavel": o `sweep` da v0.60.0 (com o seu `grep`) num PR sem maquinaria, num derivado que nao
    // adotou o C2. No template (C2), o portao so chama isto com o plano `true`: ai este ramo e alcancado so depois de o
    // problema ja estar registado acima (#347).
    if (aplicaveis.length === 0) continue;
    if (aplicaveis.length !== rs.length) {
      problemas.push(`${modo}: uns shards correram e outros disseram "nao aplicavel" — a mesma decisao tinha de valer para todos`);
      continue;
    }
    const totais = [...new Set(rs.map((r) => r.total))];
    if (totais.length !== 1) {
      problemas.push(`${modo}: os shards viram totais diferentes (${totais.join(", ")}) — nao mediram a mesma arvore`);
      continue;
    }
    const medidos = rs.reduce((t, r) => t + r.medidos, 0);
    if (medidos !== totais[0]) problemas.push(`${modo}: ${medidos} de ${totais[0]} sitios medidos entre os ${n} shards`);
  }
  return problemas;
}

/**
 * O `VARREDURA_PLANO` que o portao exporta (#347, C1). `"true"`/`"false"` -> o booleano; AUSENTE -> `undefined`
 * (o portao antigo, ou um `push`; desde o C2 uma base sem o plano exporta `true`: o `confere` como antes). Qualquer outro valor, `""` incluido, e um
 * problema — nunca "como antes" por um valor mal escrito (`TP2`).
 * @param {string | undefined} valor @param {string[]} problemas
 */
export function planoDe(valor, problemas) {
  if (valor === undefined) return undefined;
  if (valor === "true" || valor === "false") return valor === "true";
  problemas.push(`VARREDURA_PLANO=${JSON.stringify(valor)} — so "true" ou "false" (ou ausente)`);
  return undefined;
}

if (ehMain(import.meta.url)) {
  const [pasta, ...modos] = process.argv.slice(2);
  let relatorios = [];
  let ilegiveis = [];
  try {
    const nomes = readdirSync(pasta).filter((f) => f.endsWith(".json"));
    relatorios = nomes.flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(join(pasta, f), "utf8"))];
      } catch {
        ilegiveis.push(f);
        return [];
      }
    });
  } catch {
    ilegiveis = [`a pasta ${pasta ?? "(nenhuma)"}`];
  }
  const doPlano = [];
  const plano = planoDe(process.env.VARREDURA_PLANO, doPlano);
  const erros = [...ilegiveis.map((f) => `nao consegui ler ${f}`), ...doPlano, ...confere(relatorios, modos, { plano })];
  for (const e of erros) console.log(`  FALHA  varredura: ${e}`);
  if (erros.length === 0) {
    for (const r of relatorios.sort((a, b) => a.modo.localeCompare(b.modo) || a.k - b.k))
      console.log(`  OK  ${r.modo} ${r.k}/${r.n}: ${r.aplicavel ? `${r.medidos} de ${r.total} sitios` : "nao aplicavel"}`);
  }
  process.exit(erros.length ? 1 : 0);
}
