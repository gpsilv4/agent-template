#!/usr/bin/env node
/**
 * Hook: um subagente so corre o Bash que o seu `tools:` declara — {{PROJECT_NAME}}
 *
 * **So-Claude Code.** Ligado em `.claude/settings.json` (`PreToolUse` / `Bash`), a seguir ao
 * `guard-protected-branch`. A logica vive em `lib/ambito-agente.mjs`; o porque tambem (S-01 do #195).
 *
 * Vive a parte do `guard-protected-branch.mjs` porque aquele esta no tecto do Guard 17, e porque
 * pergunta outra coisa: aquele julga o COMANDO, este julga QUEM o corre.
 *
 * CONTRATO DE SAIDA: sai `0` em tudo excepto na negacao explicita. Sem `agent_type` (o agente
 * principal), sem o ficheiro do agente (um agente de fora do projeto) ou com um erro: permite.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ler, negar } from "./lib/resposta.mjs";
import { agenteChamado, razaoAmbito } from "./lib/ambito-agente.mjs";

try {
  const payload = ler();
  const tipo = payload?.agent_type;
  const cmd = payload?.tool_input?.command;
  if (typeof tipo !== "string" || !tipo || typeof cmd !== "string") process.exit(0);
  const raiz = process.env.CLAUDE_PROJECT_DIR || payload?.cwd;
  if (!raiz) process.exit(0);
  const dir = join(raiz, ".claude/agents");
  const ficheiros = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => [f, readFileSync(join(dir, f), "utf8")]);
  const md = agenteChamado(tipo, ficheiros);
  if (md === null) process.exit(0);
  const razao = razaoAmbito(tipo, cmd, md);
  if (razao) negar(razao);
} catch {
  // Sair 0 de proposito: um hook avariado nao pode bloquear trabalho legitimo.
}
process.exit(0);
