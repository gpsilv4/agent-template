/**
 * Chamar um hook com PRAZO, nos testes (#650) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: a `test-hooks` chamava os hooks com `execFileSync` SEM prazo. Medido a 27 nov, dentro da varredura de
 * mutacao: tres vezes um guard ficou parado no `read()` do stdin e a suite no `spawnSync` — 12 a 20 min perdidos por
 * corrida, e no CI um job preso ate ao seu limite. Nao se reproduziu fora (2400 + 24 corridas, e a varredura das 15h,
 * zero), e a decisao foi torna-lo VISIVEL e HONESTO.
 *
 * O PORQUE DO `process.exit(3)` e nao de um `throw`: dentro de um `test()`, um `throw` vira um `FAIL <teste>`, e a
 * varredura conta-o como o mutante APANHADO — um verde FALSO (medido e desfeito no #640). Uma suite que sai vermelha SEM
 * nenhuma linha `FAIL` e, para a varredura, `REBENTOU — nao e cobertura` (`lib/varredura-paralela.mjs`, `PROVA_DE_FALHA`):
 * a mesma resposta honesta do `TIMEOUT` de hoje, mas em 60 s e nao em 12-20 min. Na bateria e no CI, o passo fica vermelho
 * logo, com o comando a vista — e e por la que se acha a causa, se voltar.
 *
 * A LIGACAO vive numa so funcao (`chamaOuSai`), usada pelos dois chamadores (o `corre` da `test-hooks`, aqui como
 * `decisaoDoGuard`, e o `chama` do `tests-textos-publicos.mjs`): duas copias de `if (r.pendurou) ...` eram duas formas de a
 * perder em silencio (os dois leitores do #650). Limites ditos: o `process.exit` nao corre os `finally` de quem chamou —
 * as pastas temporarias desse teste ficam (dentro da varredura, a copia do worker apaga-se no fim); e o stderr de um guard
 * que sai 0 deixou de ir para o da suite (o `spawnSync` captura-o; com um exit != 0, a mensagem do erro leva-o).
 */
import { spawnSync } from "child_process";
import { basename } from "path";

/** 60 s e folga larga: o guard responde em menos de 1 s, e o seu proprio prazo (`lib/resposta.mjs`) e 30 s. */
export const PRAZO_DO_HOOK_MS = 60_000;
/** O codigo com que a suite sai quando um hook pendurou (nem 0, nem o 1 de uma suite com testes vermelhos). */
export const CODIGO_PENDUROU = 3;

/** Corre `node <hook>` com o `input` no stdin e um PRAZO. Devolve o resultado do `spawnSync` e `pendurou`. */
export function chamaComPrazo(hook, input, { env, cwd, prazoMs = PRAZO_DO_HOOK_MS } = {}) {
  const r = spawnSync(process.execPath, [hook], { input, encoding: "utf8", env, cwd, timeout: prazoMs, killSignal: "SIGKILL" });
  const pendurou = r.error?.code === "ETIMEDOUT";
  return { ...r, pendurou };
}

/** O `chamaComPrazo`, e se pendurou a suite SAI (`saiPorquePendurou`) — nunca volta com um pendurado. */
export function chamaOuSai(hook, input, { env, cwd, prazoMs = PRAZO_DO_HOOK_MS } = {}) {
  const r = chamaComPrazo(hook, input, { env, cwd, prazoMs });
  if (r.pendurou) saiPorquePendurou(hook, input, prazoMs);
  return r;
}

/** A decisao do guard dos branches (`permissionDecision` e a razao), com PRAZO: o `corre` da `test-hooks` (que esta
 *  congelado acima das 500 linhas pelo Guard 17, e so pode encolher — por isso vive aqui). Um erro ou um exit != 0 lancam,
 *  como no `execFileSync` de antes. */
export function decisaoDoGuard(hook, payload, { prazoMs = PRAZO_DO_HOOK_MS } = {}) {
  const r = chamaOuSai(hook, JSON.stringify(payload), { prazoMs });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`o guard saiu ${r.status}: ${(r.stderr ?? "").slice(0, 300)}`);
  if (!r.stdout.trim()) return { decisao: "allow", razao: "" };
  const d = JSON.parse(r.stdout).hookSpecificOutput ?? {};
  return { decisao: d.permissionDecision ?? "allow", razao: d.permissionDecisionReason ?? "" };
}

/** Uma linha que NAO e um `FAIL` (a varredura nao a conta como cobertura), e a suite sai com `CODIGO_PENDUROU`. O eco do
 *  comando vem sem quebras de linha — tambem as U+2028/U+2029, que o `JSON.stringify` nao escapa e que o `^` de uma regex
 *  `m` aceita: um `<U+2028>  FAIL` no comando fazia desta linha um FAIL (o 2.o leitor do #650). */
export function saiPorquePendurou(hook, input, prazoMs = PRAZO_DO_HOOK_MS) {
  const eco = String(input).slice(0, 300).replace(/[\r\n\u2028\u2029]/g, " ");
  process.stdout.write(`\nPENDUROU: o hook ${basename(hook)} nao respondeu em ${prazoMs / 1000} s — ${eco}\n`);
  process.exit(CODIGO_PENDUROU);
}
