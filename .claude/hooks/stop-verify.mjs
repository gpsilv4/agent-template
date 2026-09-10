#!/usr/bin/env node
/**
 * Hook `Stop`: antes de o turno fechar, dizer o que ficou por verificar — {{PROJECT_NAME}}
 *
 * **So-Claude Code.** Ligado em `.claude/settings.json`.
 *
 * PORQUE EXISTE: o padrao que esta sessao repetiu mais vezes nao foi um teste errado — foi a
 * verificacao ser **declarada** em vez de medida. "Validei e esta limpo" foi dito oito vezes;
 * em cinco delas algo encontrou defeitos depois. Isto nao verifica nada: diz **que verificacao
 * ficou em divida** para os ficheiros que foram de facto tocados, para o passo nao ser saltado
 * em silencio.
 *
 * DELIBERADAMENTE BARATO E NAO BLOQUEANTE. Nao corre suites — uma suite pesada levaria minutos
 * a cada fim de turno, e um hook lento e um hook que se desliga. Le o `git status` e mapeia
 * caminhos para os comandos que os cobrem.
 *
 * CONTRATO DE SAIDA: sai `0` sempre. Nunca impede o turno de fechar.
 */

import { execFileSync } from "child_process";

/** CONFIGURAR AO PROJETO: caminho tocado -> comando que o verifica.
 *  A ordem importa: a primeira regra que casa e a que se reporta. */
const SUITES = [
  { re: /^\.agent\/scripts\/guards\//, cmd: "node .agent/scripts/test-guards.mjs && node .agent/scripts/mutation-sweep.mjs --only=guards" },
  { re: /^\.agent\/scripts\/check-doc-versions\.mjs$/, cmd: "node .agent/scripts/test-guards.mjs && node .agent/scripts/mutation-sweep.mjs --only=check-doc" },
  { re: /^\.agent\/scripts\/check-backlog\.mjs$/, cmd: "node .agent/scripts/test-backlog.mjs && node .agent/scripts/mutation-sweep.mjs --only=check-backlog" },
  { re: /^\.agent\/scripts\/check-test-surface\.mjs$/, cmd: "node .agent/scripts/test-test-surface.mjs" },
  { re: /^\.agent\/scripts\/check-bundle-sizes\.mjs$/, cmd: "node .agent/scripts/test-bundle-sizes.mjs" },
  { re: /^\.agent\/scripts\/mutation-sweep\.mjs$/, cmd: "node .agent/scripts/test-mutation-sweep.mjs" },
  { re: /^\.claude\/hooks\//, cmd: "node .claude/hooks/tests/test-hooks.mjs" },
  { re: /^\.agent\/(rules|workflows)\//, cmd: "node .agent/scripts/check-doc-versions.mjs" },
  { re: /^(CLAUDE|GEMINI|AGENTS|README)\.md$/, cmd: "node .agent/scripts/check-doc-versions.mjs" },
  { re: /^\.agent\/context\/backlog/, cmd: "node .agent/scripts/check-backlog.mjs" },
  { re: /^\.claude\/settings\.json$/, cmd: "node .agent/scripts/test-guards.mjs" },
];

try {
  // `--untracked-files=all` e obrigatorio: sem ele o git **colapsa diretorios** nao
  // rastreados — um ficheiro novo em pasta nova aparece como `?? .agent/` e nenhuma regra de
  // caminho casa, logo o hook nao reportava divida nenhuma. Um teste apanhou-o.
  const porcelain = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!porcelain) process.exit(0); // nada tocado: nada em divida

  const tocados = porcelain.split("\n").filter(Boolean).map((l) => l.slice(3).trim());
  const devidos = new Map(); // cmd -> ficheiros que o motivam
  for (const f of tocados) {
    const regra = SUITES.find((s) => s.re.test(f));
    if (!regra) continue;
    if (!devidos.has(regra.cmd)) devidos.set(regra.cmd, []);
    devidos.get(regra.cmd).push(f);
  }
  if (devidos.size === 0) process.exit(0);

  const linhas = [...devidos].map(([cmd, fs]) => `- \`${cmd}\`  ← ${fs.length === 1 ? fs[0] : `${fs.length} ficheiros`}`);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          "Verificacao em divida para o que foi tocado neste turno (hook `Stop`; nao corri nada):\n" +
          linhas.join("\n") +
          "\n\nSe ja correste, di-lo com o resultado. Se nao, isto e a Fase 2 do metodo por ticket — " +
          "e um resultado nao medido nao e um resultado.",
      },
    })
  );
} catch {
  // Silencio: um hook de fim de turno nunca impede o turno de fechar.
}
process.exit(0);
