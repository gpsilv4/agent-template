/**
 * O parser do frontmatter dos agentes (`lib/agentes.mjs`, #238) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: e lido por dois consumidores — o Guard 11 e o hook `guard-subagent-bash` — e era
 * isso que se queria: uma copia so. Os dois tem testes de ponta a ponta; este afirma o contrato da
 * propria funcao, sem `git` nem sandbox, com as formas de YAML que ja enganaram um dos parsers antigos.
 */
import { pathToFileURL } from "url";
import { ferramentasDe, nomeDe, frontmatter } from "../lib/agentes.mjs";
import { registarResultado } from "./harness/test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-agentes.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const md = (corpo) => `---\nname: x\n${corpo}---\n\ncorpo\n`;
const J = JSON.stringify;

/** O contrato do `test-guards`: cada teste junta os problemas, e um vazio passa. */
function test(nome, fn) {
  const p = [];
  fn((a, b, m) => { if (a !== b) p.push(`${m}: esperado ${b}, obtido ${a}`); });
  registarResultado(nome, p);
}

export function registar() {
  test("agentes: sem `tools:` devolve null (herda tudo); vazio devolve []", (eq) => {
    eq(ferramentasDe(md("")), null, "sem a linha");
    eq(J(ferramentasDe(md("tools:\n"))), J([]), "a linha vazia");
    eq(ferramentasDe("sem frontmatter"), null, "sem frontmatter");
  });

  test("agentes: a virgula dentro de parenteses nao parte o item", (eq) => {
    eq(J(ferramentasDe(md("tools: Read, Bash(git log --format=%h,%s:*), Grep\n"))),
      J(["Read", "Bash(git log --format=%h,%s:*)", "Grep"]), "a regra fica inteira");
  });

  test("agentes: em fluxo, entre aspas e em lista, com linhas em branco e comentarios", (eq) => {
    eq(J(ferramentasDe(md("tools: [Read, Bash(git diff:*)]\n"))), J(["Read", "Bash(git diff:*)"]), "`[ ]`");
    eq(J(ferramentasDe(md('tools: "Read, Grep"\n'))), J(["Read", "Grep"]), "entre aspas");
    eq(J(ferramentasDe(md("tools:\n  - Read  # ler\n\n  # so leitura\n  - \"Bash(git diff:*)\"\n"))),
      J(["Read", "Bash(git diff:*)"]), "lista com branco, comentario e aspas");
    eq(J(ferramentasDe(md("tools: Read, Bash # o debugger\n"))), J(["Read", "Bash"]), "comentario em linha");
  });

  test("agentes: o valor numa linha indentada a seguir continua o `tools:` (#238)", (eq) => {
    eq(J(ferramentasDe(md("tools:\n  Read, Bash(git diff:*)\ndescription: y\n"))), J(["Read", "Bash(git diff:*)"]),
      "um escalar continuado nao e uma lista vazia");
    eq(J(ferramentasDe(md("tools: []\ndescription: y\n"))), J([]), "`[]` explicito e vazio");
  });

  test("agentes: CRLF e BOM nao escondem o frontmatter", (eq) => {
    eq(J(ferramentasDe("﻿---\r\nname: x\r\ntools: Read\r\n---\r\n")), J(["Read"]), "BOM e CRLF");
    eq(frontmatter("---\r\na: b\r\n---\r\n"), "a: b", "o CRLF sai");
  });

  test("agentes: o `name:` le-se sem aspas", (eq) => {
    eq(nomeDe(md("")), "x", "simples");
    eq(nomeDe('---\nname: "code-reviewer"\n---\n'), "code-reviewer", "entre aspas");
    eq(nomeDe("---\ndescription: y\n---\n"), null, "sem nome");
  });
}
