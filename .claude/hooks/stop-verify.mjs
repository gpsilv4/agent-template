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
 * SO FALA QUANDO A DIVIDA MUDA. A primeira versao repetia a mesma lista a cada fim de turno
 * enquanto a arvore estivesse suja — inclusive depois de as suites terem sido corridas, porque
 * o hook nao ve resultados de comandos, so o `git status`. Um aviso que grita sempre treina
 * quem o le a ignora-lo, e ai deixa de ser um aviso. Guarda a ultima divida em
 * `.claude/state/` (local, ignorado pelo git) e cala-se se for identica; volta a falar quando o
 * conjunto muda — um ficheiro novo tocado, ou um commit a limpar a arvore.
 *
 * O limite honesto: se a divida nao mudar e ninguem correr nada, o hook nao repete. Torna o
 * silencio possivel uma vez; a alternativa — repetir sempre — mediu-se pior.
 *
 * CONTRATO DE SAIDA: sai `0` sempre. Nunca impede o turno de fechar.
 */

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { regraDe, comandoDe } from "../../.agent/scripts/lib/mapa-suites.mjs";

/** O mapa "caminho tocado -> o que o verifica" vive em `.agent/scripts/lib/mapa-suites.mjs`.
 *
 *  Nasceu aqui, mas o conhecimento nao e deste hook: vale para qualquer agente, e o
 *  `mutation-sweep.mjs` precisa do mesmo mapa para derivar o que varrer a partir de um diff.
 *  Duas copias eram dois campos a ter de concordar a mao, sem nada a verifica-los (`TP1`).
 *
 *  Este hook e so-Claude-Code; o mapa nao. Por isso o mapa esta la e este importa-o, e nao ao
 *  contrario — um script que qualquer agente corre nao pode depender de `.claude/`. */

/** Caminhos de um `git status --porcelain -z`.
 *
 *  `-z` e obrigatorio, nao cosmetico: SEM ele o git **cita** os caminhos que tenham espacos
 *  ou bytes nao-ASCII (`?? ".agent/guards/caf\303\251.mjs"`), e o `slice(3)` entrega a aspa
 *  e os escapes octais ao matcher — nenhuma regra casa e a divida e sub-reportada em
 *  SILENCIO, que e o defeito que este hook existe para evitar. Medido: 1 de 3 ficheiros
 *  vistos. E a segunda cara do `TP5` (o `.trim()` foi a primeira).
 *
 *  Com `-z` as entradas vem separadas por NUL e os caminhos crus. Renomeacoes e copias
 *  ocupam DUAS entradas (`R  novo\0antigo\0`): a segunda e um caminho nu, sem coluna de
 *  estado, logo um `slice(3)` cego comia-lhe 3 caracteres. Por isso sao consumidas ao par.
 *
 *  (Existe uma copia desta funcao em `session-context.mjs` — sao dois hooks independentes
 *  e o template evita acoplar um ao outro; se mudar aqui, mudar la.) */
function caminhosPorcelain(saida) {
  const entradas = saida.split("\0").filter(Boolean);
  const caminhos = [];
  for (let i = 0; i < entradas.length; i++) {
    const estado = entradas[i].slice(0, 2);
    caminhos.push(entradas[i].slice(3));
    // `R`/`C` trazem o caminho de origem como entrada seguinte, sem coluna de estado.
    if (estado[0] === "R" || estado[0] === "C") i++;
  }
  return caminhos;
}

try {
  // `--untracked-files=all` e obrigatorio: sem ele o git **colapsa diretorios** nao
  // rastreados — um ficheiro novo em pasta nova aparece como `?? .agent/` e nenhuma regra de
  // caminho casa, logo o hook nao reportava divida nenhuma. Um teste apanhou-o.
  const porcelain = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    // Nada de `.trim()` nem de `.replace(/\n+$/)`: com `-z` o separador e NUL e o caminho e
    // cru. Aparar bloco a bloco foi o `TP5` original (comia o espaco da coluna de estado).
  });
  if (!porcelain.replace(/\0+$/, "")) process.exit(0); // nada tocado: nada em divida

  const tocados = caminhosPorcelain(porcelain);
  const devidos = new Map(); // cmd -> ficheiros que o motivam
  for (const f of tocados) {
    const regra = regraDe(f);
    if (!regra) continue;
    const cmd = comandoDe(regra);
    if (!devidos.has(cmd)) devidos.set(cmd, []);
    devidos.get(cmd).push(f);
  }
  if (devidos.size === 0) process.exit(0);

  const linhas = [...devidos].map(([cmd, fs]) => `- \`${cmd}\`  ← ${fs.length === 1 ? fs[0] : `${fs.length} ficheiros`}`);
  // Calar se a divida for identica a da ultima vez.
  // A marca pertence ao repo que esta a ser medido: resolver ao ficheiro do hook fazia um
  // hook a correr noutro repo (ou uma suite num repo temporario) escrever a marca AQUI — e a
  // marca alheia calava o aviso seguinte.
  const ROOT = (() => {
    try {
      return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n+$/, "");
    } catch {
      return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    }
  })();
  const marca = join(ROOT, ".claude/state/stop-verify.last");
  const agora = linhas.join("\n");
  try {
    if (readFileSync(marca, "utf8") === agora) process.exit(0);
  } catch {
    /* sem marca: e a primeira vez, fala */
  }
  try {
    mkdirSync(dirname(marca), { recursive: true });
    writeFileSync(marca, agora);
  } catch {
    /* nao conseguir guardar nao justifica calar: mais vale repetir do que perder o aviso */
  }

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
