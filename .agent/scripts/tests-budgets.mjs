/**
 * Testes dos guards da serie 1 — {{PROJECT_NAME}}
 *
 * Espelha `guards/budgets.mjs`: os tres orcamentos de bytes (1, 1b, 1c) e a copia das
 * Fronteiras nos ponteiros finos (1d).
 *
 * NAO e um entry point: o `test-guards.mjs` importa e chama `registar()`.
 */
import { appendFileSync, readdirSync, rmSync } from "fs";
import { pathToFileURL } from "url";
import { join } from "path";
import { test, file, readF, writeF } from "./test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-budgets.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Obrigatorio: dois entry points partilham
 *  a pasta `.agent/scripts/`, e a descoberta em disco precisa de saber de quem e
 *  cada modulo. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

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
    // 11 500 <= bytes < 12 000 e a banda da NOTE depois de os limiares descerem de
    // 12500/14000 (o `ticket-method.md` passou os 12k tres vezes e quem deu por isso foi
    // sempre o utilizador, nunca o guard).
    writeF(dir, ".agent/rules/scripts-guide.md", "# guia\n\n" + "y".repeat(11700));
  }, { code: 0, includes: ["scripts-guide.md", "maior que uma rule carregada"] });

  // A outra metade: acima dos 12 000 **reprova**. Sem este teste, subir o gate de volta —
  // que e o remendo tentador quando um ficheiro incha — nao partia nada.
  test("G1b: referencia acima dos 12 000 REPROVA (o limiar que se media a olho)", (dir) => {
    writeF(dir, ".agent/rules/scripts-guide.md", "# guia\n\n" + "y".repeat(12600));
  }, { code: 1, includes: ["scripts-guide.md", "separar instrucoes de evidencia"] });

  // --- Guard 1e: workflows e catalogos de definicoes ---------------------------
  // Dois buracos que ninguem media e que o UTILIZADOR viu a olho: os workflows nao tinham
  // orcamento nenhum (o `review.md` vive nos 11.8 KB) e o `anti-patterns-template.md` estava
  // fora do Guard 1b de proposito — mas "nao e um manual" nao e licenca de tamanho.
  test("G1e: workflow acima do tecto reprova", (dir) => {
    writeF(dir, ".agent/workflows/review.md", "# review\n\n" + "z".repeat(12600));
  }, { code: 1, includes: [".agent/workflows/review.md", "(workflow)"] });

  test("G1e: catalogo de definicoes acima do tecto reprova", (dir) => {
    // Este ficheiro NAO passa pelo Guard 1b (e uma tabela que o Guard 15 le). Sem o 1e,
    // podia crescer sem limite e nada dizia uma palavra.
    writeF(dir, ".agent/rules/anti-patterns-template.md",
      readF(dir, ".agent/rules/anti-patterns-template.md") + "\n\n" + "w".repeat(12600));
  }, { code: 1, includes: ["anti-patterns-template.md", "catalogo de definicoes"] });

  test("G1e: workflow perto do tecto da NOTE, nao WARN", (dir) => {
    writeF(dir, ".agent/workflows/debug.md", "# debug\n\n" + "z".repeat(11700));
  }, { code: 0, includes: ["NOTE", "perto do limite"] });

  // O veredicto de sucesso nomeia o MAIOR e o numero. Um "ok" sem numero e indistinguivel de
  // um guard que nao mediu nada (`AP2`), e com 14 ficheiros ninguem os conta a mao.
  test("G1e: o OK diz qual e o maior e quantos bytes tem", null, {
    code: 0,
    anyOut: ["catalogos e workflows:", "maior ", "tecto 12000"],
  });

  test("G1e: sem workflows nem catalogos da SKIP visivel", (dir) => {
    for (const f of readdirSync(join(dir, ".agent/workflows"))) rmSync(join(dir, ".agent/workflows", f));
    rmSync(file(dir, ".agent/rules/anti-patterns-template.md"), { force: true });
  }, { code: 1, anyOut: ["SKIP  Guard 1e"] });

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

  // --- Os SKIP/NOTE que ninguem observava (varredura `--skips`) -----------------
  // "Todo o skip e visivel" e uma regra que o repo repete em dezenas de comentarios, e nada
  // media se um skip podia ser apagado em silencio. Um guard que deixa de ANUNCIAR que nao
  // correu e o `AP2` em forma pura. Medido com `mutation-sweep --skips`: 17 de 39 cobertos.

  test("G1: rule perto do limite da NOTE (nao WARN)", (dir) => {
    // 11 500 <= bytes < 12 000: avisa que esta perto, sem reprovar. Sem teste, despromover
    // este `note` a silencio era invisivel.
    const alvo = ".agent/rules/core-rules.md";
    const atual = readF(dir, alvo).length;
    if (atual < 11500) appendFileSync(file(dir, alvo), "x".repeat(11600 - atual));
  }, { code: 0, includes: ["NOTE", "perto do limite"] });

  test("G1c: sem @import de .agent/context/ da SKIP visivel", (dir) => {
    // Os DOIS espelhos: mexer so no CLAUDE.md quebra o Guard 2 e o teste falharia por um
    // aviso sem relacao nenhuma com o que afirma. A sintaxe difere (`@` vs `@./`).
    writeF(dir, "CLAUDE.md", readF(dir, "CLAUDE.md").split("\n")
      .filter((l) => !l.startsWith("@.agent/context/")).join("\n"));
    writeF(dir, "GEMINI.md", readF(dir, "GEMINI.md").split("\n")
      .filter((l) => !l.startsWith("@./.agent/context/")).join("\n"));
  }, { code: 0, includes: ["SKIP  Guard 1c"] });

  test("G1d: sem bloco de Fronteiras no CLAUDE.md da SKIP visivel", (dir) => {
    // Remocao CIRURGICA do bloco: reescrever o ficheiro inteiro levava tambem a tabela de
    // workflows, e o teste falhava com 14 avisos do Guard 7 — sem relacao com o que afirma.
    const semFronteiras = (t) => t.replace(/^## Fronteiras[\s\S]*?(?=^## )/m, "");
    for (const f of ["CLAUDE.md", "GEMINI.md"]) writeF(dir, f, semFronteiras(readF(dir, f)));
  }, { code: 0, includes: ["SKIP  Guard 1d"] });

  test("G1d: sem nenhum ponteiro fino da SKIP visivel", (dir) => {
    for (const f of [".cursor/rules/project.mdc", ".github/copilot-instructions.md"]) {
      try { rmSync(file(dir, f)); } catch {}
    }
  }, { code: 0, includes: ["SKIP  Guard 1d"] });

  test("G1b: sem rules de referencia da SKIP visivel", (dir) => {
    // A lista e DERIVADA do disco: escrever os nomes a mao envelhecia no primeiro ficheiro
    // de referencia novo — e foi o que aconteceu com o `anti-patterns-template.md`, que
    // deixava o SKIP por disparar e o teste falhava a apontar para o guard (AP1).
    for (const f of readdirSync(file(dir, ".agent/rules"))) {
      if (!f.endsWith(".md")) continue;
      // Carregadas + catalogos de definicoes: nenhum destes e "rule de referencia" para o
      // Guard 1b, e apagar o catalogo deixava as citacoes AP do repo a apontar para o vazio.
      if (["core-rules.md", "process-rules.md", "anti-patterns.md", "business-logic.md",
           "pages-architecture.md", "anti-patterns-template.md"].includes(f)) continue;
      try { rmSync(file(dir, `.agent/rules/${f}`)); } catch {}
    }
    // `code: 0`: um SKIP nao e um WARN. O que este teste afirma e que o guard **diz** que nao
    // correu, em vez de desaparecer em silencio — a regra de "todo o skip e visivel".
  }, { code: 0, includes: ["SKIP  Guard 1b"] });
}
