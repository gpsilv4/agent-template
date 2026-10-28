#!/usr/bin/env node
/**
 * Hook: nenhum nome da lista de nomes proibidos sai num texto que um comando publica — {{PROJECT_NAME}}
 *
 * **So-Claude Code.** Ligado em `.claude/settings.json` (`PreToolUse` / `Bash`), a seguir aos outros dois. O que e
 * um texto publicado (um `gh issue|pr|release|repo|label|gist|api`, um `git tag`, um `git commit`) diz o
 * `lib/textos-publicos.mjs`; a lista e os nomes, o `.agent/scripts/lib/nomes-proibidos.mjs` (#375). O
 * `commit-msg` e o comando `check-textos-publicos.mjs` sao as outras duas pecas, e valem para qualquer agente.
 *
 * O QUE FAZ, por estado da lista, e so quando o comando PUBLICA texto (os outros nem leem a lista):
 *   - `ok`: nega se um texto tem um nome, ou se ha um texto que nao se consegue ler (uma expansao, um pipe);
 *   - `desligado` num comando que publica NOUTRO repo (`-R`, `git -C`, `cd`...): arma na mesma — desligar e para os
 *     nomes legitimos do proprio repo privado, e nao o deixa publicar noutro;
 *   - `sem-lista` e `desligado`: deixa, e diz-o UMA vez por sessao ao utilizador (`systemMessage`);
 *   - `ilegivel`, `vazia`, `dentro-do-repo`, ou a lib em falta: nega, com a razao.
 * A razao cita a ORIGEM e a linha da lista, nunca o nome nem o texto: entra no contexto do agente.
 * E, com ou sem lista, nega um `git config` da chave do interruptor por repo (#397): desligar e do utilizador.
 * Fora de um repo nao ha "dentro do repo" (#397): so quando o git nao acha nenhum repo a partir do `cwd`; outra falha
 * do git (prazo, `safe.directory`, git ausente, um repo avariado) mantem o `cwd` como raiz, e falha fechada — e um
 * `cwd` que ja nao existe nega.
 *
 * O PRAZO: a analise corre com o `comPrazo` do `lib/resposta.mjs`, como no `guard-protected-branch` — um hook em
 * timeout PERMITE, e um comando enorme nao pode ser a forma de passar.
 *
 * CONTRATO DE SAIDA: sai `0` em tudo excepto na negacao explicita. Um erro inesperado permite: um hook avariado nao
 * bloqueia trabalho legitimo (o CI e o `check-textos-publicos.mjs` continuam a ver).
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { isMainThread, workerData } from "worker_threads";
import { comPrazo, negar } from "./lib/resposta.mjs";
import { textosDoComando } from "./lib/textos-publicos.mjs";

/** A raiz do repo DESTE hook: e de la que vem a lib da lista, e e la que fica a marca da sessao. */
const RAIZ_DO_HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** O repo do comando: a raiz da worktree do `cwd`; `null` SO quando o git nao achou nenhum repo ao subir a partir do
 *  `cwd` (lido em `LC_ALL=C`: a frase e traduzida); `undefined` noutra falha — ai nao se sabe. Medido no git 2.54: so a
 *  descoberta falhada diz "(or any"; um `GIT_DIR` invalido ou um `.git` partido dizem "not a git repository: <x>", e
 *  um repo avariado nao e "fora de um repo" (leitura 1 do #397). */
function repoDe(cwd) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 2000, env: { ...process.env, LC_ALL: "C" } });
  if (r.error || r.status === null) return undefined;
  if (r.status === 0) return r.stdout.trim() || undefined;
  return /not a git repository \(or any/i.test(r.stderr ?? "") ? null : undefined;
}

/** Diz ao utilizador UMA vez por sessao. Um so ficheiro, com a ultima sessao, no `.claude/state/` do repo do comando
 *  (como o `stop-verify`), e na raiz do hook fora de um repo: no `cwd` cru deixava uma pasta `.claude/state/` em
 *  qualquer sitio onde se corresse um `gh`, e um ficheiro por sessao acumulava-se. */
function avisaUmaVez(repo, sessao, mensagem) {
  const marca = join(repo ?? RAIZ_DO_HOOK, ".claude/state/textos-publicos.sessao");
  const id = String(sessao ?? "");
  try {
    if (id && readFileSync(marca, "utf8") === id) return;
  } catch {
    /* sem marca: e a primeira vez */
  }
  try {
    mkdirSync(dirname(marca), { recursive: true });
    writeFileSync(marca, id);
  } catch {
    /* sem conseguir guardar, repete-se: mais vale do que calar */
  }
  console.log(JSON.stringify({ systemMessage: mensagem }));
}

/** So um ficheiro REGULAR se le: um FIFO pendurava o hook, e o `/dev/stdin` dele ja foi consumido pelo payload. */
function lerFicheiro(p) {
  if (!statSync(p).isFile()) throw new Error("nao e um ficheiro regular");
  return readFileSync(p, "utf8");
}

try {
  const payload = isMainThread ? await comPrazo(import.meta.url) : workerData;
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== "string" || !/\b(?:gh|git)\b/.test(cmd)) process.exit(0);
  const cwd = payload?.cwd && isAbsolute(payload.cwd) ? payload.cwd : process.cwd();
  const lidos = textosDoComando(cmd, { cwd, home: homedir(), ler: lerFicheiro });
  // Antes do "publica" e da lista: um `git config` nao publica, e o interruptor vale com ou sem lista (#397, M4).
  if (lidos.interruptor) {
    negar("Este comando le ou muda o interruptor dos nomes proibidos (`agent-template.nomesProibidos`). Desligar ou ligar a verificacao num repo e decisao do utilizador, a mao e fora do agente (`git config --local`; `src/docs/upgrade-why.md`).");
  }
  if (!lidos.publica) process.exit(0);

  let nomes;
  try {
    nomes = await import(pathToFileURL(join(RAIZ_DO_HOOK, ".agent/scripts/lib/nomes-proibidos.mjs")).href);
  } catch (err) {
    negar(`Nao consegui carregar a lista de nomes proibidos (\`.agent/scripts/lib/nomes-proibidos.mjs\`: ${err instanceof Error ? err.message : String(err)}), e este comando publica texto. O \`/upgrade\` traz a lib.`);
  }
  // Num comando que publica NOUTRO repo, o interruptor deste nao conta: a lista arma.
  // Fora de um repo (`null`) a lib nao procura "dentro do repo"; sem saber (`undefined`), o `cwd` serve de raiz. Um
  // `cwd` que ja nao existe fazia a lib lancar, e o `catch` de fora PERMITIA (leitura 1 do #397, ja no `main`): nega.
  const repo = repoDe(cwd);
  if (repo === undefined && !existsSync(cwd)) negar("A pasta deste comando ja nao existe, logo nao consigo saber se a lista de nomes proibidos esta dentro do repo. Correr o comando a partir de uma pasta que exista.");
  const lista = nomes.carregaLista({ raiz: repo === undefined ? cwd : repo, ...(lidos.alvoExterno ? { desligado: () => false } : {}) });
  if (lista.estado === "sem-lista" || lista.estado === "desligado") {
    avisaUmaVez(repo, payload?.session_id,`Nomes proibidos: ${nomes.RAZOES[lista.estado]} — os textos publicados nesta sessao nao sao verificados (#375).`);
    process.exit(0);
  }
  if (lista.estado !== "ok") {
    negar(`Este comando publica texto, e ${nomes.RAZOES[lista.estado]} (${lista.caminho}). Corrigir a lista, ou retira-la (sem lista nao ha verificacao).`);
  }
  if (lidos.porLer.length) {
    negar(
      `Nao consegui ler o texto que este comando publica, logo nao o consigo verificar contra a lista de nomes proibidos:\n` +
        lidos.porLer.map((m) => `  - ${m}`).join("\n") +
        "\n\nEscrever o texto num ficheiro (com a ferramenta de edicao) e passa-lo por `--body-file <caminho>` / `-F <caminho>`."
    );
  }
  const re = nomes.padroes(lista.nomes);
  const achados = lidos.textos.flatMap((t) => nomes.encontra(t.texto, re).map((n) => `  - ${t.origem}: o nome da linha ${n} da lista`));
  if (achados.length) {
    negar(
      `Este comando publica um nome da lista de nomes proibidos (${lista.caminho}):\n${achados.join("\n")}\n\n` +
        "Um texto publico nao pode nomear o que e privado. Reescrever esse texto e repetir. Num repo PRIVADO, onde os " +
        "nomes podem ser legitimos, quem decide desligar e o utilizador, nunca um agente (`src/docs/upgrade-why.md`)."
    );
  }
} catch {
  // Sair 0 de proposito: um hook avariado nao pode bloquear trabalho legitimo.
}
process.exit(0);
