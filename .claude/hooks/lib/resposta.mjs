/**
 * A entrada e a saida do guard, e o PRAZO da analise (#227) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: um hook `PreToolUse` que excede o timeout (600 s por omissao) PERMITE a chamada
 * — esta na documentacao de hooks do Claude Code. O #224 fechou tres caminhos lentos do
 * `guard-protected-branch.mjs`, e a leitura independente mediu mais: ha sempre mais um. Em vez de
 * os perseguir, a analise corre num `Worker` com prazo; esgotado o prazo, o guard NEGA.
 *
 * O worker e o proprio guard: o mesmo ficheiro, com `isMainThread` falso. O processo principal so
 * le o payload, espera, e responde — um regex sincrono nao se interrompe de outra forma.
 */
import { readFileSync } from "fs";
import { Worker, isMainThread, parentPort } from "worker_threads";

/** O prazo da analise. A variavel de ambiente so o pode ENCURTAR (para os testes): o ambiente do
 *  hook vem do Claude Code, mas um prazo maior nunca e o que se quer. */
export const PRAZO_MS = Math.min(30_000, Number(process.env.GUARD_PRAZO_MS) || 30_000);

/** O payload do hook, ou `null` se nao vier JSON valido. */
export function ler() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

/** Nega, no formato que o Claude Code entende. Dentro do worker, passa a razao ao processo
 *  principal, que e quem responde. */
export function negar(razao) {
  if (!isMainThread) {
    parentPort.postMessage(razao);
    process.exit(0); // num worker, termina so a thread
  }
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: razao,
      },
    })
  );
  process.exit(0);
}

/** Ate aqui, a analise corre no proprio processo, sem worker: arrancar um custa ~25 ms a CADA
 *  comando Bash (medido), e com 4000 caracteres os caminhos quadraticos medidos levam milissegundos.
 *  O prazo so protege onde a analise pode demorar. */
export const SEM_PRAZO_ATE = 4000;

/** Corre o ficheiro `url` num worker com o payload, e responde pelo que ele decidir — ou nega, se
 *  passar do prazo. Nesse caso nunca resolve: o processo acaba num dos tres ramos. Um worker que
 *  rebente sai 0 (permite), como o guard sempre fez: um hook avariado nao bloqueia trabalho
 *  legitimo. Um comando curto devolve o payload, e o guard analisa-o aqui mesmo. */
export function comPrazo(url) {
  const payload = ler();
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== "string" || cmd.length <= SEM_PRAZO_ATE) return Promise.resolve(payload);
  const w = new Worker(new URL(url), { workerData: payload });
  const prazo = setTimeout(() => {
    w.terminate();
    negar(
      `A verificacao do comando passou de ${PRAZO_MS / 1000} s: demasiado lento para verificar, e ` +
        "um hook em timeout deixaria passar. Partir o comando em partes mais pequenas."
    );
  }, PRAZO_MS);
  w.on("message", (razao) => {
    clearTimeout(prazo);
    negar(razao);
  });
  w.on("error", () => process.exit(0));
  w.on("exit", () => {
    clearTimeout(prazo);
    process.exit(0);
  });
  return new Promise(() => {});
}
