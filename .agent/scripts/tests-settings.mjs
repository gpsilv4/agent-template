/**
 * Testes do Guard 11 (sanidade do .claude/settings.json) — {{PROJECT_NAME}}
 *
 * Extraido do `test-guards.mjs` (943 linhas, contra a regra dos 500 que o repo impoe).
 * Espelha a divisao do verificador: cada modulo de guards tem o seu modulo de testes.
 *
 * NAO e um entry point: o `test-guards.mjs` importa e chama `registar()`, para a ordem dos
 * testes ser explicita em vez de depender da ordem de avaliacao dos imports.
 */
import { rmSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { test, sandbox, syntheticSandbox, runGuard, file, readF, writeF, patchSettings,
         listWorkflowRows, dropLinesContaining, GUARD, GUARD_MODULES, ROOT } from "./test-harness.mjs";

export function registar() {
// --- Guard 11: sanidade do settings.json -------------------------------------
test("G11: deny de .env retirado por completo avisa", (dir) => {
  // Escrever primeiro um settings.json com o deny COMPLETO: num projeto derivado que
  // ja nao o tenha, o aviso estaria no baseline e a assercao diferencial nao o veria.
  writeF(dir, ".claude/settings.json", JSON.stringify({
    permissions: { deny: ["Read(./.env)", "Read(./**/.env)", "Read(./.env.*)", "Read(./**/.env.*)"], allow: [] },
  }, null, 2));
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  cfg.permissions.deny = [];
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
}, { code: 1, includes: ["nenhuma regra `deny` cobre a leitura de"] });

test("G11: wildcard sem delimitador no allow avisa", (dir) => {
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  cfg.permissions.allow.push("Bash(node .agent/scripts/*)", "Bash(npm run lint*)");
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
}, { code: 1, includes: ["Bash(node .agent/scripts/*)", "Bash(npm run lint*)", "wildcard sem delimitador"] });

test("G11: `:*` e delimitador valido, nao avisa", (dir) => {
  const cfg = JSON.parse(readF(dir, ".claude/settings.json"));
  cfg.permissions.allow.push("Bash(git log:*)");
  writeF(dir, ".claude/settings.json", JSON.stringify(cfg, null, 2));
}, { code: 0, excludes: ["wildcard sem delimitador"] });

test("G11: settings.json invalido avisa", (dir) => {
  writeF(dir, ".claude/settings.json", "{ nope,, }");
}, { code: 1, includes: ["nao e JSON valido"] });

test("G11: settings.json ausente da SKIP visivel", (dir) => {
  rmSync(file(dir, ".claude/settings.json"));
}, { code: 0, includes: ["SKIP  Guard 11"] });

// --- Guard 11: formas de bypass que uma versao anterior aprovava ---------------
// Estas existem porque a primeira versao do Guard 11 so olhava para o `*` precedido de
// caractere de palavra. `Bash(*)`, `Bash` sem parenteses e `Bash(sh:*)` passavam todos.
test("G11: `Bash(*)` e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(*)"));
}, { code: 1, includes: ["Bash(*)", "wildcard sem delimitador"] });

test("G11: `Bash` sem parenteses (concessao maxima) e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash"));
}, { code: 1, includes: ["concede a ferramenta INTEIRA"] });

test("G11: `Bash(sh:*)` respeita a forma `:*` mas e execucao arbitraria", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(sh:*)"));
}, { code: 1, includes: ["receber argumentos livres"] });

test("G11: `Bash(node:*)` idem", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(node:*)"));
}, { code: 1, includes: ["receber argumentos livres"] });

test("G11: `Read(./**)` abrange o repo inteiro", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Read(./**)"));
}, { code: 1, includes: ["abrange o repo inteiro"] });

test("G11: `defaultMode: bypassPermissions` desliga tudo", (dir) => {
  patchSettings(dir, (c) => (c.permissions.defaultMode = "bypassPermissions"));
}, { code: 1, includes: ["desliga a fronteira de permissoes"] });

test("G11: `allow` que nao e array nao rebenta", (dir) => {
  patchSettings(dir, (c) => (c.permissions.allow = {}));
}, { code: 1, includes: ["devia ser um array"], excludes: ["is not iterable"] });

test("G11: deny mais ESTRITO nao e falso positivo", (dir) => {
  // Supersets estritos dos padroes do template: um por classe de secret.
  patchSettings(dir, (c) => (c.permissions.deny = [
    "Read(./.env*)", "Read(./**/.env*)", "Read(./**/*.pem)", "Read(./**/*.key)",
    "Read(./**/id_rsa*)", "Read(./**/.npmrc)", "Read(./**/credentials*)", "Read(./**/secrets/**)",
  ]));
}, { code: 0, excludes: ["nenhuma regra `deny` cobre"] });

// --- Guard 11: bypasses por PREFIXO e nomes de ferramenta fora da lista -------
// Todos estes passavam a verde quando o guard testava a FORMA da regra em vez da
// propriedade ("o argumento fica constrangido?").
for (const rule of [
  "Bash(/bin/sh:*)",        // prefixo derrota um `^` ancorado
  "Bash(/bin/bash -c:*)",   // interpretador + flag = execucao arbitraria
  "Bash(/usr/bin/env sh:*)",// wrapper `env` a esconder o interpretador
  "Bash(npm:*)",            // npm exec -- qualquer coisa
  "Bash(npx:*)",
  "Bash(git:*)",            // git -c core.pager='sh -c ...'
  "Bash(find:*)",           // find -exec
  "Bash(awk:*)",            // awk 'BEGIN{system(...)}'
  "Bash(docker:*)",
  "Bash ",                  // sem trim, era um nome de ferramenta nu
  "Grep",                   // fora da lista hardcoded de 6 nomes
  "NotebookEdit",           // ferramenta de ESCRITA fora da lista
  "mcp__servidor__tool",    // ferramentas MCP nao eram olhadas
  "Read(./*)",              // raiz inteira
  // Ronda 4: cada uma passava por uma razao diferente.
  "Bash(env -i sh:*)",      // remover o wrapper deixava a FLAG como head
  "Bash(sudo -u root sh:*)",// o head passava a ser `root`, argumento do wrapper
  "Bash(nice -n 0 bash:*)",
  "Bash(xargs -I{} sh:*)",
  "Bash(BASH -c:*)",        // comparacao case-sensitive
  "Bash(/bin/SH -c:*)",
  "Bash(git log; sh:*)",    // metacaracteres de shell nunca eram olhados
  "Bash(git log|sh:*)",
  "Bash(cd / && sh:*)",
  "Bash(sh)",               // comando fixo: shell interactiva
  "Bash(rm -rf ~)",         // comando fixo destrutivo
  "Read(~/**)",             // home inteira, inclui ~/.ssh
  "Read(/Users/**)",        // caminho absoluto
  "Read(../**)",            // sai do repo
  "Write(~/.ssh/**)",
  "WebFetch(*)",            // ferramenta com parenteses fora de Bash/ficheiro
  "Task(*)",
  "mcp__srv__tool(*)",
]) {
  test(`G11: \`${rule}\` e apanhado`, (dir) => {
    patchSettings(dir, (c) => c.permissions.allow.push(rule));
    // Afirmar que foi ESTA regra a ser marcada. Sem isto o teste passava com o guard a
    // avisar por qualquer outra razao — vermelho, mas nao na assercao certa.
    // `.trim()`: o guard reporta a regra normalizada (o caso `"Bash "` perde o espaco).
    return { includes: [rule.trim()] };
  }, { code: 1 });
}

test("G11: entrada do allow que nao e string e apanhada", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push({ tool: "Bash", args: "*" }));
}, { code: 1, includes: ["nao e string"] });

// E o simetrico: concessoes ESTREITAS e legitimas nao podem ser falsos positivos.
for (const rule of [
  "Bash(node .agent/scripts/check-doc-versions.mjs:*)", // interpretador com alvo FIXO
  "Bash(npm run lint:*)",                               // prefixo de 3 tokens
  "Bash(git log:*)",
  "Read(./.agent/**)",
  // Ronda 4: comandos fixos nao tem argumentos livres, logo sao seguros.
  "Bash(npx tsc --noEmit)",
  "Bash(git status)",
  "Glob(**/*.ts)",
  // Read-only com um so token: NOTE, nao WARN — nao pode travar o gate.
  "Bash(ls:*)",
  "Bash(cat:*)",
]) {
  test(`G11: \`${rule}\` NAO e falso positivo`, (dir) => {
    patchSettings(dir, (c) => c.permissions.allow.push(rule));
  }, { code: 0 });
}

// Ramos acrescentados na ronda 5 — descobertos pela varredura de mutacao, que revelou
// que eu os tinha escrito sem teste (o proprio AP1 a acontecer).
test("G11: caminho fora do projeto e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(cat ~/.ssh/id_rsa)"));
}, { code: 1, synthetic: true, includes: ["fora do projeto"] });

test("G11: comando fixo destrutivo e apanhado", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(rm -rf /tmp/x)"));
}, { code: 1, synthetic: true, includes: ["shell interactiva ou comando destrutivo"] });

test("G11: allow que cai dentro de um prefixo em ask e contradicao", (dir) => {
  patchSettings(dir, (c) => {
    c.permissions.ask = ["Bash(git push:*)"];
    c.permissions.allow.push("Bash(git push origin:*)");
  });
}, { code: 1, synthetic: true, includes: ["cai dentro de", "contradicao"] });

test("CHECKS: versao de dependencia desatualizada na doc avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.0.0", dependencies: { next: "16.2.2" } }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CL\n\n## [v1.0.0] - Atual\n");
  writeF(dir, ".agent/rules/core-rules.md", "# core\n\nStack: Next.js 15.0.0\n");
  // O `CHECKS` vive em `guards/versions.mjs` desde que o Guard 3 e os guards de
  // dependencias sairam do ficheiro principal. Patch no modulo, nao no GUARD.
  const alvo = `${GUARD_MODULES}/versions.mjs`;
  const g = readF(dir, alvo).replace(
    "const CHECKS = [\n",
    'const CHECKS = [\n  { name: "Next.js", pkg: "next", pattern: /Next\\.js\\s+(\\d+(?:\\.\\d+(?:\\.\\d+)?)?)/g, files: [".agent/rules/core-rules.md"] },\n'
  );
  if (g === readF(dir, alvo)) throw new Error(`nao encontrei 'const CHECKS = [' em ${alvo}`);
  writeF(dir, alvo, g);
}, { code: 1, synthetic: true, includes: ["documentado 15.0.0", "atual 16.2.2"] });

}
