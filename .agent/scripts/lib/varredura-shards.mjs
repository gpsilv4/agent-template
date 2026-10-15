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
 * Uso no portao: `node .agent/scripts/lib/varredura-shards.mjs <pasta-com-os-relatorios>`.
 *
 * A FATIA (`--shard=k/n`, a particao) vive em `./varredura-fatia.mjs`, e nao aqui: este modulo
 * tem sitios de recusa, e o varredor importa-la arrastava-o para a fixture do
 * `test-mutation-sweep`, cujo `PARES` sintetico nao o declara (o mesmo que o `ordem-por-alvo.mjs`
 * documenta: medido, toda a suite vermelha com `SEM PAR`).
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

/**
 * Confere os relatorios de todos os shards de UMA corrida. Cada relatorio:
 * `{ modo, k, n, total, medidos, aplicavel }` (`aplicavel: false` = o PR nao tocou em verificador
 * nenhum, e a varredura nem correu).
 * @param {Array<{modo: string, k: number, n: number, total?: number, medidos?: number, aplicavel: boolean}>} relatorios
 * @returns {string[]} os problemas; vazio = a varredura inteira foi medida
 */
export function confere(relatorios) {
  const problemas = [];
  if (relatorios.length === 0) problemas.push("nenhum relatorio de shard — a varredura nao deixou prova de ter corrido");
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pasta = process.argv[2];
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
  const erros = [...ilegiveis.map((f) => `nao consegui ler ${f}`), ...confere(relatorios)];
  for (const e of erros) console.log(`  FALHA  varredura: ${e}`);
  if (erros.length === 0) {
    for (const r of relatorios.sort((a, b) => a.modo.localeCompare(b.modo) || a.k - b.k))
      console.log(`  OK  ${r.modo} ${r.k}/${r.n}: ${r.aplicavel ? `${r.medidos} de ${r.total} sitios` : "nao aplicavel"}`);
  }
  process.exit(erros.length ? 1 : 0);
}
