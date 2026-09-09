/**
 * Testes dos Guards 12 e 12c (contagens derivadas) — {{PROJECT_NAME}}
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
// --- Guard 12: a contagem da checklist como dado derivado ---------------------
// Quatro sitios de aviso, um teste por sitio. O guard nasceu porque a checklist cresceu
// para 25 e as quatro citacoes em prosa ficaram em 24 sem nada notar.
const SYNC = ".agent/rules/sync-docs.md";

test("G12a: numeracao com salto avisa", (dir) => {
  // 25 pontos escritos 1..24 e depois "26." — o erro tipico ao inserir um ponto no meio.
  writeF(dir, SYNC, readF(dir, SYNC).replace(/^25\. \[ \]/m, "26. [ ]"));
}, { code: 1, includes: ["numeracao da checklist quebrada", 'ponto #25 esta escrito como "26."'] });

test("G12a: numero duplicado avisa", (dir) => {
  writeF(dir, SYNC, readF(dir, SYNC).replace(/^5\. \[ \]/m, "4. [ ]"));
}, { code: 1, includes: ["numeracao da checklist quebrada"] });

test("G12a: checklist sem pontos avisa", (dir) => {
  // Formato mudado: os pontos passam a bullets. A contagem deixa de existir.
  writeF(dir, SYNC, readF(dir, SYNC).replace(/^\d+\. \[ \]/gm, "- [ ]"));
}, { code: 1, includes: ["nao tem pontos de checklist"] });

test("G12b: citacao desatualizada avisa (o defeito original)", (dir) => {
  // Exatamente o estado em que o repo estava: checklist a 25, prosa a 24.
  writeF(dir, ".agent/rules/process-rules.md",
    readF(dir, ".agent/rules/process-rules.md").replace("(25 pontos)", "(24 pontos)"));
}, { code: 1, includes: ['diz "(24 pontos" mas a checklist de sync-docs.md tem 25'] });

test("G12b: ponto novo sem atualizar a prosa avisa", (dir) => {
  // O inverso: cresce a checklist e ninguem toca nas citacoes.
  writeF(dir, SYNC, readF(dir, SYNC) + "\n26. [ ] ponto novo\n");
}, { code: 1, includes: ['diz "(25 pontos" mas a checklist de sync-docs.md tem 26'] });

test("G12b: '(N pontos' de OUTRA contagem nao e falso positivo", (dir) => {
  // O relatorio de fecho de sprint tem 6 pontos e e citado com a mesma forma. Uma versao
  // anterior deste guard reclamava dele. A linha nao menciona sync-docs, logo nao conta.
  writeF(dir, "src/docs/agent-guide.md",
    readF(dir, "src/docs/agent-guide.md") + "\n> relatorio de fecho (6 pontos — ver process-rules.md)\n");
}, { code: 0, includes: ['citacao(oes) de "(N pontos" coerentes com 25'] });

test("G12b: zero citacoes avisa (o ponteiro obrigatorio desapareceu)", (dir) => {
  for (const f of [".agent/rules/process-rules.md", ".agent/workflows/review.md",
                   ".agent/workflows/deploy.md", "src/docs/agent-guide.md"]) {
    writeF(dir, f, readF(dir, f).replace(/\(25 pontos/g, "(a checklist"));
  }
}, { code: 1, includes: ["nenhum ficheiro cita o tamanho da checklist"] });

test("G12: sync-docs.md ausente da SKIP visivel, nao silencio", (dir) => {
  rmSync(file(dir, SYNC));
}, { code: 0, includes: ["SKIP  Guard 12"] });

// --- Guard 12c: contagem de fases do metodo por ticket ------------------------
// O defeito original: o ficheiro tinha 6 fases (0-5) e tres sitios diziam "5 fases",
// omitindo sempre a Fase 4 (leitor independente) — a mais cara. Num ficheiro que afirma
// "nenhuma se salta", faltar uma nos resumos e um erro de conteudo, nao uma gralha.
const METODO = ".agent/rules/ticket-method.md";

test("G12c: citacao em digito desatualizada avisa (o defeito original)", (dir) => {
  writeF(dir, ".agent/rules/process-rules.md",
    readF(dir, ".agent/rules/process-rules.md").replace("passa por 6 fases", "passa por 5 fases"));
}, { code: 1, includes: ['diz "5 fases" mas .agent/rules/ticket-method.md tem 6'] });

test("G12c: citacao por palavra desatualizada avisa", (dir) => {
  writeF(dir, METODO, readF(dir, METODO).replace("Seis fases:", "Cinco fases:"));
}, { code: 1, includes: ['diz "Cinco fases" mas o metodo tem 6 (seis)'] });

test("G12c: fase acrescentada sem atualizar a prosa avisa", (dir) => {
  writeF(dir, METODO, readF(dir, METODO) + "\n## Fase 6 — Algo novo\n\nconteudo.\n");
}, { code: 1, includes: ['fases" mas'] });

test("G12c: fase renumerada com salto avisa", (dir) => {
  writeF(dir, METODO, readF(dir, METODO).replace("## Fase 4 —", "## Fase 7 —"));
}, { code: 1, includes: ["esperado 0..5 sem saltos"] });

test("G12c: metodo sem cabecalhos `## Fase N` avisa", (dir) => {
  writeF(dir, METODO, readF(dir, METODO).replace(/^## Fase \d+/gm, "## Etapa"));
}, { code: 1, includes: ["nao tem cabecalhos `## Fase N`"] });

test("G12c: zero citacoes avisa (o ponteiro obrigatorio desapareceu)", (dir) => {
  for (const f of [".agent/rules/process-rules.md", METODO, "src/docs/agent-guide.md"]) {
    writeF(dir, f, readF(dir, f).replace(/(\d+|Seis|seis)\s+fases/g, "as etapas"));
  }
}, { code: 1, includes: ["nenhum ficheiro cita o numero de fases"] });

test("G12c: metodo ausente da SKIP visivel, nao silencio", (dir) => {
  rmSync(file(dir, METODO));
}, { code: 0, includes: ["SKIP  Guard 12c"] });

}
