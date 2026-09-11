/**
 * Testes dos guards da serie 1 — {{PROJECT_NAME}}
 *
 * Espelha `guards/budgets.mjs`: os tres orcamentos de bytes (1, 1b, 1c) e a copia das
 * Fronteiras nos ponteiros finos (1d).
 *
 * NAO e um entry point: o `test-guards.mjs` importa e chama `registar()`.
 */
import { appendFileSync, rmSync } from "fs";
import { pathToFileURL } from "url";
import { test, file, readF, writeF } from "./test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-budgets.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
  );
  process.exit(1);
}

export function registar() {
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
  // Movidos para `tests-anti-patterns.mjs` quando o Guard 15 saiu para
  // `guards/anti-patterns.mjs`: este ficheiro tambem passou o flag das 500 linhas, e os testes
  // acompanham o modulo que espelham. Registados no fim, com os restantes.

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
}
