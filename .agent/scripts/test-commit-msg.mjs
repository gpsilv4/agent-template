#!/usr/bin/env node
/**
 * Testes do hook `commit-msg` — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS: por cada forma de atribuir codigo a uma IA numa mensagem de commit, monta
 * a mensagem e exige que o hook reprove; e por cada forma legitima, exige que passe. Um hook
 * que recusa o que devia passar e pior do que hook nenhum — treina toda a gente a usar
 * `--no-verify`, e ai deixa de haver rede.
 *
 * Sem dependencias e sem `package.json`: corre com `node`, como os restantes.
 *
 *   node .agent/scripts/test-commit-msg.mjs
 *
 * Sai `!= 0` se algum teste falhar. Corre no job `guard-tests` do `ci.yml`.
 */

import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(ROOT, ".githooks/commit-msg");

let passed = 0;
const falhas = [];

/**
 * @param nome    descricao do cenario
 * @param msg     a mensagem de commit (null = nao escrever ficheiro nenhum)
 * @param expect  { code, includes?: string[], caminhoAusente?: boolean } — `includes` afirma
 *                contra o STDERR do hook,
 *                que e onde a recusa e explicada. Afirmar contra stdout+stderr juntos deixava
 *                um teste passar por causa de output que nao e o da recusa (o `AP1`).
 */
function test(nome, msg, expect) {
  const dir = mkdtempSync(join(tmpdir(), "commit-msg-test-"));
  try {
    const args = [HOOK];
    if (expect.caminhoAusente) {
      // Caminho que o git passaria mas que nao existe: o hook tem de reprovar, nao passar.
      args.push(join(dir, "NAO-EXISTE"));
    } else if (msg !== null) {
      const f = join(dir, "COMMIT_EDITMSG");
      writeFileSync(f, msg);
      args.push(f);
    }
    let code = 0;
    let err = "";
    try {
      execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      code = e.status ?? -1;
      err = e.stderr ?? "";
    }
    const problemas = [];
    if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
    for (const s of expect.includes ?? []) {
      if (!err.includes(s)) problemas.push(`o stderr devia conter "${s}"`);
    }
    if (problemas.length) {
      falhas.push({ nome, problemas, err });
      console.log(`  FAIL  ${nome}`);
      for (const p of problemas) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${nome}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== Testes do hook commit-msg ===\n");

// --- O que tem de PASSAR -------------------------------------------------------
// Metade do valor deste hook esta aqui. Um hook que reprova mensagens legitimas e abandonado.

test("mensagem normal passa", "fix(scripts): corrigir o guard\n", { code: 0 });

test("co-autor HUMANO passa", "feat: x\n\nCo-Authored-By: Maria Silva <maria@exemplo.pt>\n", { code: 0 });

test("prosa que fala de geracao passa", "docs: explicar como o relatorio e gerado pelo script\n", { code: 0 });

// O texto de ajuda que o git acrescenta ao ficheiro vem comentado com `#` e NAO entra na
// mensagem final. Se o hook o lesse, qualquer commit interactivo podia disparar.
//
// As formas usadas aqui sao as NAO ANCORADAS de proposito. A primeira versao deste teste
// punha um `# Co-Authored-By:` comentado — e esse padrao comeca com `^\s*`, logo ja nao casa
// uma linha que comeca por `#`, filtro ou nao. O teste ficava verde com o filtro ligado **e**
// desligado: nao afirmava nada, que e o `AP1`. Apanhado pelo controlo negativo.
test("comentario do git com `generated with` nao conta", "fix: x\n\n# Generated with [Claude Code](https://claude.com)\n", { code: 0 });

test("comentario do git com o emoji de robo nao conta", "fix: x\n\n# 🤖 texto de ajuda\n", { code: 0 });

// --- O que tem de REPROVAR -----------------------------------------------------
// A forma que motivou o hook: escrita por um agente, num commit feito com `-F`.
test("`Co-Authored-By` de IA reprova", "fix: x\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n", {
  code: 1,
  includes: ["COMMIT RECUSADO", "Co-Authored-By"],
});

for (const [nome, valor] of [
  ["Copilot", "GitHub Copilot <copilot@github.com>"],
  ["Gemini", "Gemini <noreply@google.com>"],
  ["Cursor", "Cursor <agent@cursor.sh>"],
  ["gpt-4", "gpt-4 <bot@openai.com>"],
]) {
  test(`\`Co-Authored-By\` de ${nome} reprova`, `fix: x\n\nCo-Authored-By: ${valor}\n`, { code: 1 });
}

test("`Generated with [ferramenta]` reprova", "fix: x\n\nGenerated with [Claude Code](https://claude.com/claude-code)\n", {
  code: 1,
  includes: ["generated with"],
});

test("emoji de robo reprova sozinho", "fix: x\n\n🤖 qualquer coisa\n", { code: 1, includes: ["emoji de robo"] });

test("`Assisted-By` de IA reprova", "fix: x\n\nAssisted-By: gpt-4\n", { code: 1 });

// O trailer no MEIO do corpo, e nao no fim: um hook que so olhasse a ultima linha falhava.
test("atribuicao no meio do corpo reprova", "fix: x\n\nCo-Authored-By: Claude <a@b>\n\nmais texto depois\n", { code: 1 });

// --- "Nao consegui medir" tem de REPROVAR --------------------------------------
// Um hook que nao consegue ler a mensagem e deixa passar e o `AP2`: "nao ha nada" nao e
// "nao consegui ler". Aqui o custo de falhar fechado e um commit repetido; o de falhar aberto
// e uma mensagem imutavel errada.
test("sem o argumento do git reprova", null, { code: 1, includes: ["nao consigo verificar"] });

test("ficheiro da mensagem ausente reprova", null, {
  code: 1,
  caminhoAusente: true,
  includes: ["nao consegui ler"],
});

// --- A mensagem de recusa tem de ser accionavel --------------------------------
// Sem isto, quem leva a recusa nao sabe o que fazer e alcanca o `--no-verify`.
test("a recusa diz a regra, o ficheiro e o que fazer", "fix: x\n\nCo-Authored-By: Claude <a@b>\n", {
  code: 1,
  includes: ["process-rules.md", ".githooks/commit-msg", "Apagar as linhas acima"],
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
console.log("");
if (falhas.length) {
  for (const { nome, err } of falhas) {
    console.log(`--- stderr de "${nome}" ---`);
    console.log(err);
  }
  console.log("  Ha testes do hook commit-msg a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do hook commit-msg passaram.\n");
