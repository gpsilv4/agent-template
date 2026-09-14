/**
 * Testes do Guard 16 (politica MCP) — {{PROJECT_NAME}}
 *
 * Espelha `guards/mcp.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco e
 * chama `registar()`.
 *
 * A fixture MONTA o `.mcp.json` de que cada assercao depende (`AP3`) — no template nu esse
 * ficheiro nao existe, logo herdar o estado do repo daria uma suite que so afirma "saltou".
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { test, file, readF, writeF } from "./test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-mcp.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const POLICY = ".agent/rules/mcp-policy.md";

/** Acrescenta um servidor a tabela "Servidores aprovados" da rule. */
const aprova = (dir, nome) => {
  const s = readF(dir, POLICY);
  writeF(dir, POLICY, s.replace(
    "| | | | | | |",
    `| ${nome} | Local | codigo | nao | teste | 2026-09-14 |`
  ));
};

const cfg = (servidores) => JSON.stringify({ mcpServers: servidores }, null, 2) + "\n";

export function registar() {
  // --- O estado do template: sem `.mcp.json`, o guard DIZ que nao correu ------
  test("G16: sem .mcp.json da SKIP visivel, nao silencio", null, {
    code: 0,
    includes: ["SKIP  Guard 16 (politica MCP)"],
  });

  // --- Segredos literais -----------------------------------------------------
  test("G16: token do GitHub literal no env avisa", (dir) => {
    aprova(dir, "exemplo");
    writeF(dir, ".mcp.json", cfg({
      exemplo: { command: "npx", args: ["-y", "algum-servidor"], env: { TOKEN: "ghp_" + "A".repeat(36) } },
    }));
  }, { code: 1, includes: ["token do GitHub literal", ".mcp.json"] });

  test("G16: URL com credencial embutida nos args avisa", (dir) => {
    aprova(dir, "db");
    writeF(dir, ".mcp.json", cfg({
      db: { command: "npx", args: ["servidor", "postgres://utilizador:senha@host/bd"] },
    }));
  }, { code: 1, includes: ["URL com credencial embutida"] });

  test("G16: referencia ao ambiente (${VAR}) NAO e um segredo", (dir) => {
    aprova(dir, "exemplo");
    writeF(dir, ".mcp.json", cfg({
      exemplo: { command: "npx", args: ["servidor"], env: { TOKEN: "${GITHUB_TOKEN}" } },
    }));
  }, { code: 0, includes: ["politica MCP: 1 servidor(es)"], excludes: ["  WARN  "] });

  // --- Aprovacao escrita -----------------------------------------------------
  test("G16: servidor sem linha em 'Servidores aprovados' avisa", (dir) => {
    writeF(dir, ".mcp.json", cfg({ naoAprovado: { command: "npx", args: ["x"] } }));
  }, { code: 1, includes: ["nao esta em \"Servidores aprovados\""] });

  test("G16: sem a seccao 'Servidores aprovados' na rule avisa", (dir) => {
    writeF(dir, POLICY, "# Politica MCP\n\nSem a seccao que o guard procura.\n");
    writeF(dir, ".mcp.json", cfg({ x: { command: "npx", args: ["x"] } }));
  }, { code: 1, includes: ["sem a seccao \"Servidores aprovados\""] });

  // --- Nao consegui ler != esta bem (AP2) -------------------------------------
  test("G16: JSON invalido avisa, em vez de passar", (dir) => {
    writeF(dir, ".mcp.json", "{ isto nao e json }\n");
  }, { code: 1, includes: ["JSON invalido"] });

  test("G16: ficheiro sem `mcpServers` avisa, em vez de passar a zero", (dir) => {
    writeF(dir, ".mcp.json", JSON.stringify({ outraCoisa: {} }, null, 2) + "\n");
  }, { code: 1, includes: ["sem objeto `mcpServers`"] });
}
