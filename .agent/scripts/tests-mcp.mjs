/**
 * Testes do Guard 16 (politica MCP) — {{PROJECT_NAME}}
 *
 * Espelha `guards/mcp.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco e
 * chama `registar()`.
 *
 * A fixture MONTA o `.mcp.json` de que cada assercao depende (`TP3`) — no template nu esse
 * ficheiro nao existe, logo herdar o estado do repo daria uma suite que so afirma "saltou".
 */
import { pathToFileURL } from "url";
import { test, readF, writeF } from "./test-harness.mjs";

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

/** Os segredos de fixture CONSTROEM-SE, nunca se escrevem por extenso — e a convencao deste
 *  ficheiro desde sempre (`"ghp_" + "A".repeat(36)`), e existe porque o `gitleaks` do CI varre
 *  o codigo-fonte e nao distingue uma fixture de um token a serio. Medido: colei um JWT
 *  literal aqui e o job `Secret Scan` do PR ficou vermelho. Montado em pedacos, tem a forma
 *  que o guard procura e nao a assinatura que o scanner procura. */
const jwtFalso = ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "yb2xlIjoiZml4dHVyZSJ9", "Q" + "UJDREVGR0hJSktM"].join(".");
/** O VS Code chama-lhe `servers`, nao `mcpServers`. */
const cfgVscode = (servidores) => JSON.stringify({ servers: servidores }, null, 2) + "\n";

export function registar() {
  // --- O estado do template: sem `.mcp.json`, o guard DIZ que nao correu ------
  test("G16: sem ficheiro MCP nenhum da SKIP visivel, nao silencio", null, {
    code: 0,
    includes: ["SKIP  Guard 16 (politica MCP)"],
  });

  // A mensagem do SKIP tem de NOMEAR onde procurou. Um "nao encontrei nada" que nao diga
  // onde olhou e indistinguivel de um guard que olha para o sitio errado (TP2).
  test("G16: o SKIP diz onde procurou, e sao os quatro agentes", null, {
    code: 0,
    includes: [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".gemini/settings.json"],
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

  // --- Nao consegui ler != esta bem (TP2) -------------------------------------
  test("G16: JSON invalido avisa, em vez de passar", (dir) => {
    writeF(dir, ".mcp.json", "{ isto nao e json }\n");
  }, { code: 1, includes: ["JSON invalido"] });

  test("G16: ficheiro sem `mcpServers` avisa, em vez de passar a zero", (dir) => {
    writeF(dir, ".mcp.json", JSON.stringify({ outraCoisa: {} }, null, 2) + "\n");
  }, { code: 1, includes: ["sem objeto `mcpServers`"] });

  // --- Os outros tres agentes (o guard via SO o Claude Code) -------------------
  // A politica declara-se para todos os agentes. Enquanto o guard so lia `.mcp.json`,
  // bastava configurar o servidor pelo Cursor, pelo VS Code ou pelo Gemini para ele nao ver
  // nada e dizer SKIP — a politica valia num dos quatro caminhos (TP6).
  test("G16: servidor por aprovar no ficheiro do Cursor avisa", (dir) => {
    writeF(dir, ".cursor/mcp.json", cfg({ naoAprovado: { command: "npx", args: ["x"] } }));
  }, { code: 1, includes: [".cursor/mcp.json", 'nao esta em "Servidores aprovados"'] });

  test("G16: segredo no ficheiro do VS Code (chave `servers`) avisa", (dir) => {
    aprova(dir, "exemplo");
    writeF(dir, ".vscode/mcp.json", cfgVscode({
      exemplo: { command: "npx", env: { TOKEN: "ghp_" + "A".repeat(36) } },
    }));
  }, { code: 1, includes: [".vscode/mcp.json", "token do GitHub literal"] });

  test("G16: servidor por aprovar no .gemini/settings.json avisa", (dir) => {
    writeF(dir, ".gemini/settings.json",
      JSON.stringify({ theme: "Default", mcpServers: { naoAprovado: { command: "npx" } } }, null, 2) + "\n");
  }, { code: 1, includes: [".gemini/settings.json", 'nao esta em "Servidores aprovados"'] });

  // O reverso: um ficheiro de definicoes GERAIS sem MCP nenhum nao e um achado. Tratar a
  // ausencia da chave como "formato inesperado" transformava o guard numa fonte de ruido em
  // todo o projeto que use o Gemini CLI sem servidores.
  test("G16: .gemini/settings.json sem MCP nenhum nao avisa", (dir) => {
    writeF(dir, ".gemini/settings.json", JSON.stringify({ theme: "Default" }, null, 2) + "\n");
  }, { code: 0, includes: ["SKIP  Guard 16"], excludes: ["  WARN  "] });

  // --- Segredos que o catalogo nao conhecia ------------------------------------
  test("G16: JWT literal (service key) avisa", (dir) => {
    aprova(dir, "bd");
    writeF(dir, ".mcp.json", cfg({
      bd: { command: "npx", env: { KEY: jwtFalso } },
    }));
  }, { code: 1, includes: ["JWT (eyJ...)"] });

  test("G16: token do Supabase (sbp_) literal avisa", (dir) => {
    aprova(dir, "bd");
    writeF(dir, ".mcp.json", cfg({ bd: { command: "npx", env: { PAT: "sbp_" + "0123456789abcdef".repeat(2) + "01234567" } } }));
  }, { code: 1, includes: ["token do Supabase"] });

  // Um segredo FORA do bloco de servidores. O `.vscode/mcp.json` tem uma seccao `inputs` que
  // existe precisamente para valores sensiveis; enquanto a varredura era so do bloco de
  // servidores, um token colado la passava — e a linha de sucesso dizia "sem segredos
  // literais, em .vscode/mcp.json", a afirmar sobre o ficheiro tendo lido uma chave (`TP1`).
  test("G16: segredo fora do bloco de servidores tambem avisa", (dir) => {
    aprova(dir, "exemplo");
    writeF(dir, ".vscode/mcp.json", JSON.stringify({
      inputs: [{ id: "tok", type: "promptString", default: "ghp_" + "B".repeat(36) }],
      servers: { exemplo: { command: "npx" } },
    }, null, 2) + "\n");
  }, { code: 1, includes: ["token do GitHub literal", "inputs"] });

  // O aviso nomeia o AGENTE, e nao so o caminho: quem le "`.gemini/settings.json`" sabe o
  // caminho, quem le "(Gemini CLI)" sabe onde foi configurado.
  test("G16: o aviso diz que agente configurou o servidor", (dir) => {
    writeF(dir, ".cursor/mcp.json", cfg({ naoAprovado: { command: "npx" } }));
  }, { code: 1, includes: ["(Cursor)"] });

  // --- A tabela de aprovados acaba no proximo `##` -----------------------------
  // Lia-se ate ao FIM DO FICHEIRO: qualquer tabela escrita a seguir — um exemplo, um
  // historico — passava a conceder aprovacao. Hoje a seccao e a ultima, o que torna o
  // defeito invisivel ate alguem acrescentar uma seccao. Este teste acrescenta-a.
  test("G16: tabela numa seccao POSTERIOR nao concede aprovacao", (dir) => {
    writeF(dir, POLICY, readF(dir, POLICY) +
      "\n## Exemplos que NAO estao aprovados\n\n" +
      "| Servidor | Porque nao |\n|---|---|\n| contrabando | exemplo ilustrativo |\n");
    writeF(dir, ".mcp.json", cfg({ contrabando: { command: "npx", args: ["x"] } }));
  }, { code: 1, includes: ['servidor `contrabando` nao esta em "Servidores aprovados"'] });
}
