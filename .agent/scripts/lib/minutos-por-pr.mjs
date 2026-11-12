/**
 * O custo de um PR, por tipo (#517): as contas do `minutos-ci --quota --por-pr`, puras e sem `gh` — {{PROJECT_NAME}}
 *
 * A pergunta que decide se um derivado privado muda de CI ou de modo e "quanto custa um PR?", e a resposta depende do
 * TIPO: um upgrade (paga as suites da maquinaria), um PR normal, um PR do Dependabot, e os runs do proprio Dependabot
 * (`dynamic`, as tentativas de atualizar, falhadas incluidas). O valor e a MEDIANA do cobrado por run (a soma dos jobs,
 * cada um ao minuto acima) com o `n`; sem runs, "sem amostra" — nunca um 0 que nao mediu nada (`TP2`).
 *
 * NAO e um entry point e nao recusa (so contas): as recusas ficam no script, num `fatal(` (a licao do #439).
 */
import { mediana } from "./minutos-calculo.mjs";

/** A marca que o `/upgrade` grava (§4): um PR que lhe mexe e um upgrade. Deterministico; pelo titulo era adivinhar. */
export const MARCA = ".agent/.template-version";

/** Os tipos, pela ordem das colunas. */
export const TIPOS = ["upgrade", "normal", "dependabot", "dynamic"];

/** Um PR aberto pelo Dependabot: o autor do run e o bot (num re-run, o `actor` continua o do PR). */
const doBot = (run) => run.actor?.login === "dependabot[bot]";

/**
 * O tipo de um run: "dynamic" (o proprio Dependabot), "dependabot" (o CI de um PR dele), "upgrade" (um PR que mexe na
 * marca), "docs" (um PR so de `.md`: fora do "normal", como o `--app` o deixa fora da mediana), "normal", "sem-pr" (um
 * `pull_request` sem o numero do PR: dito, nunca perdido), ou `null` (outro evento: um push, um agendado).
 * @param {object} run  o run da API
 * @param {number | null} numero  o numero do PR (`prDoRun`)
 * @param {string[] | null} ficheiros  os ficheiros do PR (so precisa deles um PR que nao e do Dependabot)
 */
export function tipoDoRun(run, numero, ficheiros) {
  if (run.event === "dynamic") return "dynamic";
  if (run.event !== "pull_request") return null;
  if (doBot(run)) return "dependabot";
  if (!numero) return "sem-pr";
  if ((ficheiros ?? []).includes(MARCA)) return "upgrade";
  if (ficheiros?.length && ficheiros.every((f) => f.endsWith(".md"))) return "docs";
  return "normal";
}

/**
 * O numero do PR de um run, ou `null`. O `pull_requests` do run vem VAZIO quando o branch do PR ja foi apagado (medido
 * num derivado, 11 nov 2026: 119 de 126 runs de PR do mes): entao procura-se nos PRs do repo (`prs`, da API `pulls`) o
 * do mesmo branch (`head_branch` = `head.ref`); se o branch se repetiu, o mais recente criado ate ao run.
 */
export function prDoRun(run, prs = []) {
  const doRun = run.pull_requests?.[0]?.number;
  if (doRun) return doRun;
  if (run.event !== "pull_request" || !run.head_branch) return null;
  const ate = Date.parse(run.created_at ?? "") || Infinity;
  const candidatos = prs.filter((p) => p.head?.ref === run.head_branch && Date.parse(p.created_at ?? "") <= ate);
  candidatos.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return candidatos[0]?.number ?? null;
}

/** Precisa dos ficheiros do PR para decidir o tipo? So um `pull_request` com numero, que nao e do Dependabot. */
export const precisaDosFicheiros = (run, numero) => run.event === "pull_request" && !doBot(run) && numero !== null;

/**
 * O custo por tipo: `{ [tipo]: { mediana, n, total, jobs, falhas: { n, min } } }`, so dos runs ACABADOS (um em curso
 * contaria 0). `jobs` e a mediana do numero de jobs por run (um upgrade com o CI antigo de 5 jobs ve-se aqui).
 * @param {{ tipo: string | null, cobrado: number, jobs: number, concluido: boolean, conclusao: string | null }[]} linhas
 */
export function custoPorTipo(linhas) {
  const out = {};
  for (const tipo of [...TIPOS, "docs", "sem-pr", "outros"]) {
    const destas = linhas.filter((l) => l.concluido && (l.tipo ?? "outros") === tipo);
    const falhadas = destas.filter((l) => l.conclusao === "failure");
    out[tipo] = {
      mediana: mediana(destas.map((l) => l.cobrado)),
      n: destas.length,
      total: destas.reduce((a, l) => a + l.cobrado, 0),
      jobs: mediana(destas.map((l) => l.jobs)),
      falhas: { n: falhadas.length, min: falhadas.reduce((a, l) => a + l.cobrado, 0) },
    };
  }
  return out;
}

/** Uma celula da tabela: a mediana com o `n`, ou "sem amostra". O `dynamic` mostra o TOTAL (o desperdicio repete-se a
 *  cada tentativa: e a soma que pesa) e as falhadas; o upgrade, o numero de jobs. */
export function celula(tipo, c) {
  if (c.n === 0) return "sem amostra";
  if (tipo === "dynamic") return `${c.total} min (n=${c.n}; ${c.falhas.n} falhadas: ${c.falhas.min} min)`;
  const base = `${c.mediana} min (n=${c.n}`;
  return tipo === "upgrade" ? `${base}; ${c.jobs} jobs)` : `${base})`;
}
