#!/usr/bin/env node
/**
 * Testes dos Doc Guards — {{PROJECT_NAME}}
 *
 * Entry point das suites dos doc guards. O harness (sandbox, sandbox sintetico, `test()`)
 * vive em `test-harness.mjs`; os blocos maiores foram para modulos que espelham a divisao
 * do verificador (`tests-settings.mjs`, `tests-derived-counts.mjs`).
 *
 * Correr APOS qualquer alteracao a `check-doc-versions.mjs` ou a `guards/*.mjs`: um guard
 * que passa quando devia falhar produz confianca infundada. E depois a varredura de
 * mutacao (`mutation-sweep.mjs`), porque esta suite ficar verde nao prova que afirma algo.
 *
 *   node .agent/scripts/test-guards.mjs
 */

import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { test, sandbox, syntheticSandbox, runGuard, file, readF, writeF, patchSettings, listWorkflowRows, dropLinesContaining, GUARD, ROOT, resumo, registarResultado } from "./test-harness.mjs";
import { registar as registarSettings } from "./tests-settings.mjs";
import { registar as registarDerivedCounts } from "./tests-derived-counts.mjs";
import { registar as registarPlaceholders } from "./tests-placeholders.mjs";

// --- Baseline -----------------------------------------------------------------
// Estes dois nao usam `test()`: correm contra a fixture sintetica, nao contra o repo.
{
  const dir = syntheticSandbox();
  try {
    const { code, out } = runGuard(dir);
    const problems = [];
    if (code !== 0) problems.push(`fixture limpa por construcao devia sair 0, saiu ${code}`);
    if (!out.includes("Todos os guards de documentacao passaram")) {
      problems.push("devia declarar que todos os guards passaram");
    }
    if (out.includes("  WARN  ")) problems.push(`nao devia haver WARN: ${out.split("\n").find((l) => l.includes("  WARN  "))}`);
    const name = "sintetico: repo limpo por construcao sai 0 e declara que passou";
    registarResultado(name, problems, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = syntheticSandbox();
  try {
    // Uma unica quebra na fixture limpa: o exit code TEM de mudar.
    writeFileSync(join(dir, ".nvmrc"), "");
    const { code, out } = runGuard(dir);
    const name = "sintetico: uma quebra na fixture limpa muda o exit code";
    const problems = [];
    if (code === 0) problems.push("devia sair != 0");
    if (!out.includes("  WARN  ")) problems.push("devia imprimir WARN");
    registarResultado(name, problems, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("baseline: o guard produz veredicto e nao acrescenta avisos", null, {
  code: 0,
  // Nao afirma "todos passaram": isso seria afirmar o estado do REPO, e num projeto
  // derivado com drift ficaria vermelho por uma causa que nada tem a ver com o guard.
  includes: ["guard(s) executado(s)", "saltado(s)"],
});

// --- Independencia do cwd (o defeito mais grave: 0 guards + "todos passaram") --
const withDecoyNvmrc = (dir) => {
  mkdirSync(file(dir, "sub"), { recursive: true });
  writeF(dir, "sub/.nvmrc", "18\n"); // isca: com ROOT=cwd, era o unico guard a "correr"
};

test("cwd: correr DE UM SUBDIRETORIO nao desliga os guards", withDecoyNvmrc, {
  code: 0,
  cwd: "sub",
  includes: ["guard(s) executado(s)"],
});

test("cwd: a raiz vem do script, nao do cwd (le o .nvmrc certo)", withDecoyNvmrc, {
  code: 0,
  cwd: "sub",
  includes: ["guard(s) executado(s)", ".nvmrc = 24"],
  excludes: [".nvmrc = 18"],
});

// CONTROLO NEGATIVO PERMANENTE: reintroduz o defeito na copia da sandbox e exige que
// a suite o apanhe. Sem isto, os dois testes acima passavam com ROOT = process.cwd().
test("cwd: [controlo negativo] com ROOT = cwd, o guard TEM de falhar", (dir) => {
  withDecoyNvmrc(dir);
  const patched = readF(dir, GUARD).replace(
    /^const ROOT = .*$/m,
    "const ROOT = process.cwd();"
  );
  if (!patched.includes("const ROOT = process.cwd();")) {
    throw new Error("o patch do controlo negativo nao aplicou — a linha `const ROOT =` mudou de forma");
  }
  writeF(dir, GUARD, patched);
}, {
  code: 1,
  cwd: "sub",
  excludes: ["Todos os guards de documentacao passaram"],
});

// --- Guard 1: orcamento de bytes e rules obrigatorias -------------------------
// `synthetic: true`: a fixture sintetica escreve rules minimas, logo o aviso de orcamento e
// genuinamente NOVO. Com a copia do repo, um projeto derivado cujas rules ja excedam o limite
// — o `core-rules.md` do template esta a 11507 de 12000 e o template manda-lhe acrescentar
// regras de dominio — ja tem esse aviso no baseline, e a assercao diferencial (corretamente)
// nao ve nada de novo. O teste falhava sem que nada estivesse errado.
test("G1: rule acima do maximo de bytes avisa", (dir) => {
  appendFileSync(file(dir, ".agent/rules/core-rules.md"), "x".repeat(15000));
}, { code: 1, synthetic: true, includes: ["core-rules.md", "bytes >"] });

test("G1: rule obrigatoria ausente avisa (nao passa em silencio)", (dir) => {
  rmSync(file(dir, ".agent/rules/anti-patterns.md"));
}, { code: 1, includes: ["anti-patterns.md NAO EXISTE"] });

test("G1: rules geradas no bootstrap dao SKIP visivel", null, {
  code: 0,
  synthetic: true, // num projeto ja bootstrapped estas rules EXISTEM e nao ha SKIP
  includes: ["SKIP  .agent/rules/business-logic.md", "SKIP  .agent/rules/pages-architecture.md"],
});

// --- Guard 1b: orcamento das rules de REFERENCIA (nao carregadas) -------------
// Nao tinham limite nenhum, e uma delas chegou aos 16 KB sem nada avisar — apesar de ser
// reaberta por inteiro a cada ticket `M`/`L`.
test("G1b: o pico historico real (14259 bytes) REPROVA", (dir) => {
  // 14259 e o maior tamanho que uma rule de referencia teve neste repo (`92b745d`); com o
  // gate em 20000 dava NOTE e exit 0, ou seja o guard nao apanhava o seu proprio caso.
  writeF(dir, ".agent/rules/ticket-method.md", "# m\n\n" + "x".repeat(14254));
}, { code: 1, includes: ["ticket-method.md", "grande demais para ser reaberta"] });

test("G1b: referencia acima dos 20 KB avisa com a mensagem mais dura", (dir) => {
  appendFileSync(file(dir, ".agent/rules/ticket-method.md"), "x".repeat(21000));
}, { code: 1, includes: ["ticket-method.md", "deixa de ser lida"] });

test("G1b: referencia maior que uma rule carregada da NOTE, nao WARN", (dir) => {
  // NOTE nao e WARN: o exit fica 0 e o aviso e informativo. So a NOTE prova que o limiar
  // intermedio existe — sem este teste, colapsar os dois limiares passava despercebido.
  writeF(dir, ".agent/rules/scripts-guide.md", "# guia\n\n" + "y".repeat(13000));
}, { code: 0, includes: ["scripts-guide.md", "maior que uma rule carregada"] });

// --- Guard 1d: as Fronteiras copiadas nos ponteiros finos ---------------------
// A copia existe porque nao esta verificado que o Cursor e o Copilot SIGAM um ponteiro em
// markdown. Copia significa divergencia, logo e comparada.

test("G1d: Fronteiras divergentes no ponteiro do Cursor avisam", (dir) => {
  const f = ".cursor/rules/project.mdc";
  writeF(dir, f, readF(dir, f).replace("- **Nunca**:", "- **Nunca (versao antiga)**:"));
}, { code: 1, includes: ["project.mdc", "divergem do CLAUDE.md"] });

test("G1d: ponteiro sem o bloco de Fronteiras avisa", (dir) => {
  const f = ".github/copilot-instructions.md";
  writeF(dir, f, readF(dir, f).replace("## Fronteiras (prioridade maxima)", "## Outra coisa"));
}, { code: 1, includes: ["copilot-instructions.md", "sem regra nenhuma"] });

test("G1d: ponteiro ausente da SKIP visivel, nao silencio", (dir) => {
  rmSync(file(dir, ".cursor/rules/project.mdc"));
}, { code: 0, includes: ["SKIP  .cursor/rules/project.mdc"] });

// --- Guard 15: as referencias a anti-padroes resolvem -------------------------
// Uma citacao errada e pior do que nenhuma: manda o leitor a uma entrada REAL com outro
// significado, e nada no ecra a denuncia. Aconteceu num projeto derivado, ao trazer os
// scripts do template num upgrade.

// O numero e montado em duas partes de proposito: o Guard 15 varre os `.agent/scripts/`,
// **inclusive as suites**, logo o literal escrito aqui seria apanhado como citacao morta no
// repo real. Assim ele existe so no ficheiro que a fixture escreve, que e onde o teste o
// quer. (Excluir as suites da varredura era a alternativa, e perdia dez citacoes legitimas
// que vivem nelas — medido.)
const AP_INEXISTENTE = "AP" + "99";
test("G15: citacao de um anti-padrao que nao existe avisa", (dir) => {
  const f = ".agent/rules/core-rules.md";
  writeF(dir, f, readF(dir, f) + `\n> Ver ${AP_INEXISTENTE} para o detalhe.\n`);
}, { code: 1, includes: [`cita ${AP_INEXISTENTE}`, "nao existe em anti-patterns.md"] });

test("G15: entrada escrita com `###` tambem conta como definida", (dir) => {
  // Tolerancia aos dois niveis: as entradas deste repo usam `##`, um derivado pode usar
  // `###`, e o guard nao pode passar a dizer que o anti-padrao desapareceu por isso.
  const f = ".agent/rules/anti-patterns.md";
  writeF(dir, f, readF(dir, f).replace(/^## AP/gm, "### AP"));
}, { code: 0, excludes: ["nao existe em anti-patterns.md"] });

test("G15: sem anti-patterns.md da SKIP visivel, nao silencio", (dir) => {
  rmSync(file(dir, ".agent/rules/anti-patterns.md"));
}, { code: 1, anyOut: ["SKIP  Guard 15"] });

// --- Guard 1c: o TOTAL carregado a cada sessao --------------------------------
// O Guard 1 orcamenta ficheiro a ficheiro; ninguem orcamentava a soma, e e a soma que o
// agente paga por sessao. Os ficheiros extra ficam ABAIXO do limite por ficheiro de
// proposito: se um deles o excedesse, o Guard 1 tambem avisava e a assercao passava a ser
// satisfeita por outra verificacao — o `AP1`.

test("G1c: contexto acima do maximo avisa (as rules nao contam — tem dono proprio)", (dir) => {
  // Os ficheiros extra vao para `.agent/context/` e nao para `.agent/rules/`: o 1c orcamenta
  // **so** o contexto. Se a fixture engordasse rules, media o Guard 1 e nao este — e era
  // exactamente a mistura que o guard deixou de fazer.
  const extra = "x".repeat(17000);
  let claude = readF(dir, "CLAUDE.md");
  let gemini = readF(dir, "GEMINI.md");
  for (const n of ["extra1", "extra2", "extra3"]) {
    writeF(dir, `.agent/context/${n}.md`, `# ${n}\n\n${extra}`);
    claude += `\n@.agent/context/${n}.md\n`;
    gemini += `\n@.agent/context/${n}.md\n`;
  }
  writeF(dir, "CLAUDE.md", claude);
  writeF(dir, "GEMINI.md", gemini);
}, { code: 1, includes: ["contexto carregado", "> 48000"] });

test("G1c: engordar uma RULE nao dispara o 1c (dispara o Guard 1, que e o dono)", (dir) => {
  // O controlo do ponto anterior: sem ele, o 1c podia continuar a somar as rules e o teste
  // acima passava igual.
  writeF(dir, ".agent/rules/core-rules.md", "# core\n\n" + "y".repeat(13000));
  // `excludes: ["> 48000"]` e nao `["contexto carregado ="]`: essa linha aparece SEMPRE (e a
  // linha OK do guard), logo excluir-la nunca poderia passar. O que se afirma e que o aviso
  // de orcamento de CONTEXTO nao disparou — quem disparou foi o Guard 1, o dono da rule.
}, { code: 1, includes: ["core-rules.md"], excludes: ["> 48000"] });

test("G1c: sem CLAUDE.md da SKIP visivel, nao silencio", (dir) => {
  // `anyOut` e nao `includes`: sem `CLAUDE.md` outros guards avisam (paridade, imports), logo
  // o exit e 1 e as linhas WARN nao contem o SKIP. O que se afirma aqui e que o guard **diz**
  // que nao correu, em vez de desaparecer — a regra de "todo o skip e visivel".
  rmSync(file(dir, "CLAUDE.md"));
}, { code: 1, anyOut: ["SKIP  Guard 1c"] });

test("G1b: sem rules de referencia da SKIP visivel", (dir) => {
  for (const f of ["sync-docs", "ticket-method", "scripts-guide"]) {
    try { rmSync(file(dir, `.agent/rules/${f}.md`)); } catch {}
  }
  // `code: 0`: um SKIP nao e um WARN. O que este teste afirma e que o guard **diz** que nao
  // correu, em vez de desaparecer em silencio — a regra de "todo o skip e visivel".
}, { code: 0, includes: ["SKIP  Guard 1b"] });

// --- Guard 2: paridade CLAUDE/GEMINI ------------------------------------------
test("G2: divergencia de conteudo avisa", (dir) => {
  // Normalizar os dois primeiro: se o repo ja divergir no baseline, o aviso nao seria
  // "novo" e o teste media o estado do repo em vez do guard.
  // Listar TODOS os workflows: uma versao anterior listava um so e gerava 10 WARN de
  // ruido do Guard 7, que satisfaziam a assercao diferencial por acidente.
  const md = ["# Entry", "", "@.agent/rules/core-rules.md", "", "| W | F |", "|---|---|",
    ...listWorkflowRows(dir)].join("\n") + "\n";
  writeF(dir, "CLAUDE.md", md);
  writeF(dir, "GEMINI.md", md.replace("# Entry", "# Entry DIFERENTE"));
}, { code: 1, synthetic: true, includes: ["DIVERGEM"], excludes: ["nao listado na tabela"] });

test("G2: par incompleto avisa", (dir) => {
  rmSync(file(dir, "GEMINI.md"));
}, { code: 1, includes: ["nao o par"] });

// --- Guard 3: versoes ---------------------------------------------------------
test("G3: sem package.json da SKIP visivel", null, {
  code: 0,
  includes: ["SKIP  Guard 3"],
});

test("G3: versao divergente avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## [v1.0.0] - Antiga\n");
}, { code: 1, includes: ["!= maior versao do CHANGELOG"] });

test("G3: CHANGELOG ausente com package.json presente avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  rmSync(file(dir, "src/docs/CHANGELOG.md"));
}, { code: 1, includes: ["CHANGELOG.md nao encontrado"] });

test("G3: package.json sem campo version avisa", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x" }));
}, { code: 1, includes: ['sem campo "version"'] });

test("G3: package.json invalido avisa", (dir) => {
  writeF(dir, "package.json", "{ not json,, }");
}, { code: 1, includes: ["package.json invalido"] });

test("G3: heading sem brackets e aceito (## v1.2.3)", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## v1.2.3 - Atual\n");
}, { code: 0, includes: ["=== package.json"] });

test("G3: headings sem nenhuma versao valida avisa formato", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "1.2.3" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## Release de Marco\n\n## Outra\n");
}, { code: 1, includes: ["formato invalido"] });

test("G3: CHANGELOG em ordem ascendente avisa ordenacao", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "2.0.0" }));
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## [v1.0.0] - Velha\n\n## [v2.0.0] - Nova\n");
}, { code: 1, includes: ["ordenar por versao decrescente"] });

// --- Guard 4: termos banidos (o bug do lastIndex) -----------------------------
// Injeta uma entrada em BANNED com um termo presente em CLAUDE.md E GEMINI.md.
// Com o regex /g reutilizado, o 2o ficheiro era silenciosamente ignorado.
test("G4: termo banido e apanhado em TODOS os ficheiros, nao so no primeiro", (dir) => {
  const g = readF(dir, GUARD).replace(
    // Regex e nao literal: num clone com `core.autocrlf=true` o ficheiro tem `\r\n` e o
    // literal "\n" nao casava — o patch nao se aplicava e a asserção rebentava (bem).
    /const BANNED = \[\r?\n/,
    'const BANNED = [\n  { re: /Fronteiras/g, msg: "termo de teste" },\n'
  );
  // Um `.replace()` que nao casa devolve o ficheiro intacto, e o teste passaria pela razao
  // errada. Aconteceu com o `CHECKS` quando ele mudou de ficheiro: melhor rebentar aqui.
  if (g === readF(dir, GUARD)) throw new Error("nao encontrei 'const BANNED = [' no GUARD");
  writeF(dir, GUARD, g);
}, { code: 1, includes: ["CLAUDE.md:", "GEMINI.md:", "termo de teste"] });

// A fixture ESVAZIA o `BANNED`, em vez de assumir que o repo o tem vazio: um projeto
// derivado que use a feature (e ela existe para isso) tornava esta pre-condicao falsa — AP3.
test("G4: lista BANNED vazia da SKIP visivel", (dir) => {
  const g = readF(dir, GUARD).replace(/const BANNED = \[[\s\S]*?\];/, "const BANNED = [];");
  if (g === readF(dir, GUARD)) throw new Error("nao encontrei o array BANNED no GUARD");
  writeF(dir, GUARD, g);
}, {
  code: 0,
  // A mensagem INTEIRA, e nao o prefixo `SKIP  Guard 4`: o guard tem um segundo skip
  // ("Guard 4 em <ficheiro> — ficheiro nao encontrado") que satisfazia a assercao sozinho.
  includes: ["SKIP  Guard 4 (termos banidos) — lista BANNED vazia"],
});

// --- Guard 5: .nvmrc ----------------------------------------------------------
test("G5: .nvmrc ausente avisa", (dir) => {
  rmSync(file(dir, ".nvmrc"));
}, { code: 1, includes: [".nvmrc nao encontrado"] });

test("G5: .nvmrc vazio avisa (era reportado como ausente)", (dir) => {
  writeF(dir, ".nvmrc", "");
}, { code: 1, includes: [".nvmrc esta vazio"] });

test("G5: .nvmrc com conteudo invalido avisa", (dir) => {
  writeF(dir, ".nvmrc", "not-a-version\n");
}, { code: 1, includes: ["nao parece uma versao Node valida"] });

test("G5: lts/* e aceito", (dir) => {
  writeF(dir, ".nvmrc", "lts/*\n");
}, { code: 0, includes: [".nvmrc = lts/*"] });

// --- Guard 6: paridade workflows <-> wrappers ---------------------------------
test("G6: wrapper em falta avisa", (dir) => {
  rmSync(file(dir, ".gemini/commands/review.toml"));
}, { code: 1, includes: ['Workflow "review" sem wrapper em .gemini/commands'] });

test("G6: wrapper orfao avisa", (dir) => {
  writeF(dir, ".claude/commands/orphan.md", "---\ndescription: x\n---\n");
}, { code: 1, includes: ['Wrapper "orphan"'] });

test("G6: workflow novo sem wrappers avisa nos dois", (dir) => {
  writeF(dir, ".agent/workflows/brand-new.md", "# /brand-new\n");
}, { code: 1, includes: [".claude/commands", ".gemini/commands"] });

test("G6: pasta de wrappers ausente da SKIP visivel (nao desaparece)", (dir) => {
  rmSync(file(dir, ".gemini/commands"), { recursive: true });
}, { code: 0, includes: ["SKIP  .gemini/commands"] });

// --- Guard 7: workflows nas tabelas de entrada -------------------------------
// Regressao dos dois workflows que o match por substring exemptava para sempre:
// "review.md" era satisfeito por "design-review.md", e "plan.md" por
// "implementation_plan.md" (importado em CLAUDE.md).
test("G7: /review removido da tabela avisa (mascarado por design-review.md)", (dir) => {
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/review.md");
}, { code: 1, includes: ['Workflow "review" nao listado'] });

test("G7: /plan removido da tabela avisa (mascarado por implementation_plan.md)", (dir) => {
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/plan.md");
}, { code: 1, includes: ['Workflow "plan" nao listado'] });

test("G7: /design-review removido da tabela avisa", (dir) => {
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/design-review.md");
}, { code: 1, includes: ['Workflow "design-review" nao listado'] });

test("G7: workflow sem colisao de nome continua a ser apanhado", (dir) => {
  // Escrever a tabela COMPLETA primeiro: num projeto derivado que ja tenha removido
  // este workflow da tabela, o aviso estaria no baseline e passaria invisivel.
  const base = ["# Entry", "", "@.agent/rules/core-rules.md", "", "| W | F |", "|---|---|",
    ...listWorkflowRows(dir)].join("\n") + "\n";
  writeF(dir, "CLAUDE.md", base);
  writeF(dir, "GEMINI.md", base.replace(/^@(.*)$/gm, "@[$1]"));
  for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, ".agent/workflows/debug.md");
}, { code: 1, includes: ['Workflow "debug" nao listado'] });

// --- Guard 8: @imports de CLAUDE.md resolvem ---------------------------------
test("G8: @import para ficheiro inexistente avisa", (dir) => {
  writeF(dir, "CLAUDE.md", readF(dir, "CLAUDE.md").replace("@.agent/rules/core-rules.md", "@.agent/rules/nao-existe.md"));
}, { code: 1, synthetic: true, includes: ["importa `@.agent/rules/nao-existe.md`", "NAO EXISTE"] });

test("G8: rule obrigatoria apagada e apanhada pelo import pendurado", (dir) => {
  rmSync(file(dir, ".agent/rules/process-rules.md"));
  // `includes: ["process-rules.md"]` era satisfeito pelo WARN do Guard 1 — o teste
  // passava mesmo com o aviso do Guard 8 removido. Exigir a mensagem do Guard 8.
  return { includes: ["importa `@.agent/rules/process-rules.md`"] };
}, { code: 1 });

test("G8: as duas rules do bootstrap dao SKIP, nao WARN", null, {
  code: 0,
  synthetic: true,
  includes: ["SKIP  @.agent/rules/business-logic.md"],
});

test("G8: CLAUDE.md sem imports avisa", (dir) => {
  writeF(dir, "CLAUDE.md", readF(dir, "CLAUDE.md").split("\n").filter((l) => !l.startsWith("@")).join("\n"));
}, { code: 1, includes: ["sem nenhum `@import`"] });

// --- Guard 9: AGENTS.md e agent-guide.md -------------------------------------
test("G9a: workflow removido do AGENTS.md avisa", (dir) => {
  writeF(dir, "AGENTS.md", readF(dir, "AGENTS.md").replace("`market-scan`", "`removido`"));
}, { code: 1, includes: ['Workflow "market-scan" nao listado em AGENTS.md'] });

test("G9a: /review removido nao e mascarado por design-review", (dir) => {
  writeF(dir, "AGENTS.md", readF(dir, "AGENTS.md").replace("`review` · ", ""));
}, { code: 1, includes: ['Workflow "review" nao listado em AGENTS.md'] });

test("G9b: workflow removido do agent-guide.md avisa", (dir) => {
  dropLinesContaining(dir, "src/docs/agent-guide.md", "`/refactor`");
}, { code: 1, includes: ['Workflow "refactor" nao listado em src/docs/agent-guide.md'] });

// --- Guard 10: conteudo dos wrappers -----------------------------------------
test("G10: wrapper a apontar para o workflow ERRADO avisa", (dir) => {
  writeF(dir, ".claude/commands/review.md", "---\ndescription: x\n---\n\nLer `.agent/workflows/deploy.md`.\n");
}, { code: 1, includes: [".claude/commands/review.md nao aponta"] });

test("G10: wrapper vazio avisa", (dir) => {
  writeF(dir, ".gemini/commands/debug.toml", "");
}, { code: 1, includes: [".gemini/commands/debug.toml nao aponta"] });


// --- Clone em Windows: CRLF nao pode desligar nada ---------------------------
// Um clone com `core.autocrlf=true` entrega `\r\n`. Dois patches de teste usavam o literal
// "\n" e deixavam de casar, e as assercoes acrescentadas hoje rebentaram em voz alta em vez
// de o teste passar pela razao errada. Isto fixa o comportamento.
test("crlf: o guard passa num clone com line endings do Windows", (dir) => {
  const paraCrlf = (p) => {
    const b = readFileSync(file(dir, p));
    if (!b.includes("\r\n")) writeFileSync(file(dir, p), b.toString("utf8").replace(/\n/g, "\r\n"));
  };
  for (const p of ["CLAUDE.md", "GEMINI.md", "AGENTS.md", ".nvmrc",
                   ".agent/rules/core-rules.md", ".agent/rules/process-rules.md",
                   ".agent/rules/anti-patterns.md", ".agent/rules/sync-docs.md",
                   ".agent/rules/ticket-method.md", "src/docs/agent-guide.md"]) {
    try { paraCrlf(p); } catch { /* nao existe nesta fixture */ }
  }
}, { code: 0, excludes: ["  WARN  "] });

registarSettings();

// --- Ficheiros em branco: "existe mas vazio" != "ausente" ---------------------
test("blank: AGENTS.md vazio nao passa a verde", (dir) => {
  writeF(dir, "AGENTS.md", "");
}, { code: 1, includes: ["AGENTS.md existe mas esta VAZIO"], excludes: ["Todos os guards de documentacao passaram"] });

test("blank: agent-guide.md vazio nao passa a verde", (dir) => {
  writeF(dir, "src/docs/agent-guide.md", "");
}, { code: 1, includes: ["agent-guide.md existe mas esta VAZIO"] });

test("blank: rule obrigatoria a 0 bytes nao recebe OK", (dir) => {
  writeF(dir, ".agent/rules/core-rules.md", "");
}, { code: 1, includes: ["core-rules.md = 0 bytes mas esta VAZIO"] });

test("blank: CLAUDE.md so com espacos e tratado como vazio", (dir) => {
  writeF(dir, "CLAUDE.md", "   \n\t\n  ");
}, { code: 1, includes: ["CLAUDE.md existe mas esta VAZIO"], excludes: ["nao listado na tabela"] });

test("blank: a mensagem de SKIP nao mente sobre a causa", (dir) => {
  writeF(dir, "CLAUDE.md", "");
}, { code: 1, anyOut: ["CLAUDE.md esta vazio"], excludes: ["Guard 8 (@imports) — sem CLAUDE.md"] });

// --- Ramos que nao tinham teste nenhum ---------------------------------------
// Descobertos sabotando cada `warn(`/`flag(` do guard um a um: estes quatro podiam ser
// neutralizados com a suite a dar 109/109 verde.
test("G2: nenhum entry point existe avisa", (dir) => {
  rmSync(file(dir, "CLAUDE.md"));
  rmSync(file(dir, "GEMINI.md"));
}, { code: 1, synthetic: true, includes: ["nao encontrados — sao os entry points"] });

test("G6: .agent/workflows/ ausente avisa", (dir) => {
  rmSync(file(dir, ".agent/workflows"), { recursive: true });
}, { code: 1, synthetic: true, includes: [".agent/workflows/ nao encontrado"] });

test("G11: entrada do deny que nao e string e apanhada", (dir) => {
  patchSettings(dir, (c) => c.permissions.deny.push({ pattern: "Read(./.env)" }));
}, { code: 1, synthetic: true, includes: ["do `deny` que nao e string"] });

test("G11: regra sem a forma Ferramenta(padrao) e apanhada", (dir) => {
  patchSettings(dir, (c) => c.permissions.allow.push("Bash(sh:*"));
}, { code: 1, synthetic: true, includes: ["nao tem a forma"] });

// --- Guard 3: precedencia SemVer ---------------------------------------------
const withPkg = (dir, version, changelog) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version }));
  writeF(dir, "src/docs/CHANGELOG.md", changelog);
};

test("G3: `version` vazia nao desliga o guard em silencio", (dir) => {
  writeF(dir, "package.json", JSON.stringify({ name: "x", version: "" }));
}, { code: 1, includes: ['sem campo "version" utilizavel'] });

test("G3: beta.10 > beta.9 (numerico, nao string)", (dir) => {
  withPkg(dir, "1.2.3-beta.10", "# CL\n\n## [v1.2.3-beta.10] - Nova\n\n## [v1.2.3-beta.9] - Velha\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: build metadata nao conta para precedencia", (dir) => {
  withPkg(dir, "1.2.3", "# CL\n\n## [v1.2.3+build.5] - Atual\n\n## [v1.2.2] - Velha\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: pre-release com hifen no identificador nao empata", (dir) => {
  withPkg(dir, "1.2.3-beta-9", "# CL\n\n## [v1.2.3-beta-9] - Nova\n\n## [v1.2.3-beta-2] - Velha\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: build metadata nao torna a ordenacao invalida", (dir) => {
  // O topo e a entrada seguinte sao a MESMA versao por precedencia (spec §10) e
  // diferentes por string. A verificacao de ordenacao comparava strings e avisava.
  withPkg(dir, "1.2.3", "# CL\n\n## [v1.2.3] - Atual\n\n## [v1.2.3+build.5] - Rebuild\n");
}, { code: 0, excludes: ["ordenar por versao decrescente"] });

test("G3: ordem ERRADA em pre-releases numericos e apanhada", (dir) => {
  withPkg(dir, "1.2.3-rc.10", "# CL\n\n## [v1.2.3-rc.2] - Topo errado\n\n## [v1.2.3-rc.10] - Maior\n");
}, { code: 1, includes: ["ordenar por versao decrescente"] });

// --- Guard 8: a contagem tem de excluir os que nao resolvem ------------------
test("G8: conta so os imports que RESOLVEM", (dir) => {
  // CLAUDE.md sintetico: 2 imports validos + 1 gerado no bootstrap (SKIP esperado).
  // Colar ao numero de imports do ficheiro real punha este teste vermelho num projeto
  // derivado, com um nome que nao descreve a causa.
  const md = [
    "# Entry",
    "",
    "@.agent/rules/core-rules.md",
    "@.agent/rules/process-rules.md",
    "@.agent/rules/business-logic.md",
    "",
    "| W | F |",
    "|---|---|",
    ...listWorkflowRows(dir),
  ].join("\n") + "\n";
  writeF(dir, "CLAUDE.md", md);
  writeF(dir, "GEMINI.md", md.replace(/^@(.*)$/gm, "@[$1]"));
}, {
  code: 0,
  synthetic: true, // a contagem depende de `business-logic.md` nao existir
  includes: ["2 de 3 @imports"],
});


registarDerivedCounts();
registarPlaceholders();

resumo();
