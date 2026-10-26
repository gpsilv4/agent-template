/**
 * O resumo de TEMPOS da varredura de mutacao (#308): saiu da `varredura-paralela.mjs` quando ela chegou as 500
 * linhas (o Guard 17; #374b), tal e qual. Puro: so formata o que a medicao ja contou. — {{PROJECT_NAME}}
 */

/**
 * O resumo de tempos (#308): onde vai o custo da varredura, por alvo, do mais caro para o mais
 * barato. Vai DEPOIS das linhas `OK`/`INCOMPLETA`, que ficam como estavam — sao lidas por outras
 * pecas. O tempo de um alvo e CPU (a soma das corridas dele); a parede e a da MEDICAO (sem a criacao
 * das copias). Um alvo com dois pares em `PARES` sai em duas linhas, marcadas "par i de n".
 *
 * @param {{resultados: Array<{alvo: string, total: number, ms: number, corridas: number}>, msBaselines: number,
 *          paredeMs: number, workers: number}} o
 * @returns {string} o bloco, ou `""` sem alvos medidos
 */
export function resumoDeTempos({ resultados, msBaselines, paredeMs, workers }) {
  if (resultados.length === 0) return "";
  const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
  const cpu = resultados.reduce((t, r) => t + r.ms, 0) + msBaselines;
  const pct = (ms) => `${String(Math.round((100 * ms) / (cpu || 1))).padStart(3)}%`;
  const pares = (r) => resultados.filter((x) => x.alvo === r.alvo);
  const nome = (r) => (pares(r).length > 1 ? `${r.alvo} (par ${pares(r).indexOf(r) + 1} de ${pares(r).length})` : r.alvo);
  const linhas = [...resultados]
    .sort((a, b) => b.ms - a.ms || a.alvo.localeCompare(b.alvo))
    .map((r) => `    ${pct(r.ms)}  ${s(r.ms).padStart(8)}  ${String(r.total).padStart(3)} sitios  ${String(r.corridas).padStart(4)} corrida(s)  ${s(r.ms / r.total)}/sitio  ${nome(r)}`);
  // Os segundos arredondam-se ANTES de partir em minutos: `119.6 s` dava `1m60s`.
  const seg = Math.round(paredeMs / 1000);
  const parede = `${Math.floor(seg / 60)}m${String(seg % 60).padStart(2, "0")}s`;
  return [
    `\n  TEMPOS (CPU por alvo = soma das corridas dele; CPU total ${s(cpu)}, parede da medicao ${parede}, ${workers} worker(s))`,
    ...linhas,
    `    ${pct(msBaselines)}  ${s(msBaselines).padStart(8)}  baselines (1 corrida por suite)`,
  ].join("\n");
}
