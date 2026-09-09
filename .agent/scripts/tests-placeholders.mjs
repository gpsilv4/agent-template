/**
 * Testes do Guard 13 (placeholders apos o bootstrap) — {{PROJECT_NAME}}
 *
 * Espelha `guards/placeholders.mjs`. NAO e um entry point: o `test-guards.mjs` importa e
 * chama `registar()`.
 *
 * A fixture tem de simular um projeto JA bootstrapado, senao o guard salta — e um teste que
 * passa por o guard nao correr nao afirma nada.
 */
import { readdirSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, readF, writeF } from "./test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-placeholders.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
  );
  process.exit(1);
}

// Os literais sao construidos, nao escritos: a Fase 2.1 do bootstrap substitui placeholders
// tambem em `.mjs`, logo um placeholder escrito literalmente aqui seria reescrito num projeto
// derivado e estas asserções passariam a esperar "VALOR". Achado a simular o bootstrap.
const ph = (nome) => "{" + "{" + nome + "}" + "}";

/** Simula um bootstrap CONCLUIDO: cria o `business-logic.md` (o sinal que o guard procura)
 *  e substitui TODOS os `{{...}}` em toda a fixture. Substituir so num punhado de ficheiros
 *  deixava 40+ a avisar, e o teste falhava por a fixture estar a meio bootstrap em vez de
 *  pelo que queria afirmar. */
const bootstrapado = (dir) => {
  const anda = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const sub = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) anda(sub);
      // A lista de tipos espelha a Fase 2.1 do BOOTSTRAP. Faltava `.mdc` nas DUAS — o helper
      // e o bootstrap — o que deixava a regra do Cursor com o placeholder para sempre.
      else if (/\.(md|mdc|mjs|json|yml|toml)$/.test(e.name) || e.name === "LICENSE" || e.name === "CODEOWNERS") {
        const c = readF(dir, sub);
        const novo = c.replace(/\{\{(?!args\})[A-Z_]+\}\}/g, "VALOR");
        if (novo !== c) writeF(dir, sub, novo);
      }
    }
  };
  anda("");
  writeF(dir, ".agent/rules/business-logic.md", "# Regras de negocio\n\nGerado no bootstrap.\n");
};

export function registar() {
  // --- Guard 13: placeholders esquecidos -------------------------------------
  test("G13: sem bootstrap da SKIP visivel (placeholders sao esperados)", null, {
    code: 0,
    includes: ["SKIP  Guard 13 (placeholders) — bootstrap ainda nao correu"],
  });

  test("G13: projeto bootstrapado com placeholder esquecido avisa", (dir) => {
    bootstrapado(dir);
    // Deixar um de proposito num ficheiro que nao documenta placeholders.
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + `\n\nHosting: ${ph("HOSTING")}\n`);
  }, { code: 1,
       includes: [`.agent/rules/core-rules.md: placeholder(s) nao substituido(s) apos o bootstrap — ${ph("HOSTING")}`],
       excludes: ["SKIP  Guard 13"] });

  test("G13: varios placeholders no mesmo ficheiro sao nomeados todos", (dir) => {
    bootstrapado(dir);
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + `\n\n${ph("YEAR")} ${ph("COPYRIGHT_HOLDER")}\n`);
  }, { code: 1, includes: [`${ph("YEAR")}, ${ph("COPYRIGHT_HOLDER")}`] });

  test("G13: `${{ }}` do GitHub Actions nao e falso positivo", (dir) => {
    bootstrapado(dir);
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + "\n\nCI: ${{ secrets.TOKEN }} e ${{ github.ref }}\n");
  }, { code: 0, includes: ["sem placeholders esquecidos"], excludes: ["  WARN  "] });

  test("G13: o placeholder de argumentos do Gemini nao e falso positivo", (dir) => {
    bootstrapado(dir);
    writeF(dir, ".agent/rules/core-rules.md",
      readF(dir, ".agent/rules/core-rules.md") + `\n\nprompt = "corre com ${ph("args")}"\n`);
  }, { code: 0, includes: ["sem placeholders esquecidos"], excludes: ["  WARN  "] });

  test("G13: BOOTSTRAP.md e README.md documentam placeholders e nao contam", (dir) => {
    bootstrapado(dir);
    // Estes dois citam `{{...}}` por design; se contassem, todo projeto derivado avisaria.
    for (const f of [".agent/BOOTSTRAP.md", "README.md"]) {
      try { writeF(dir, f, `# doc\n\nSubstituir ${ph("HOSTING")} e ${ph("YEAR")}.\n`); } catch {}
    }
  }, { code: 0, includes: ["sem placeholders esquecidos"], excludes: ["  WARN  "] });
}
