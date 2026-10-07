/**
 * Testes do ORQUESTRADOR dos doc guards (`check-doc-versions.mjs`) — {{PROJECT_NAME}}
 *
 * Os guards que vivem DENTRO dele (2, 4-10), a independencia do cwd, o CRLF, os ficheiros em
 * branco e os SKIP visiveis. Viviam INLINE no `test-guards.mjs` (#171). O #156 pos os modulos a
 * correr ANTES dos testes inline (para o dono do alvo mutado poder correr primeiro), e o
 * `check-doc-versions.mjs` nao tinha dono pela convencao: os seus 17 mutantes passaram a correr
 * ~270 testes de modulos antes de chegar a estes. Medido: 59 s -> 219 s. Com este ficheiro, o dono
 * dele existe e corre primeiro.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre-o e chama `registar()`.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { pathToFileURL } from "url";
import { test, file, readF, writeF, patchSettings, listWorkflowRows, dropLinesContaining, GUARD, sandbox, runGuard, registarResultado } from "./harness/test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-check-doc-versions.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

export function registar() {
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

  // --- Guards da serie 1 (orcamentos + Fronteiras) ------------------------------
  // Movidos para `tests-budgets.mjs`, a acompanhar o modulo `guards/budgets.mjs` que espelham.

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
  // derivado que use a feature (e ela existe para isso) tornava esta pre-condicao falsa — TP3.
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

  /** Um workflow que EXISTE na sandbox, para os testes que tiram um das tabelas. O Modo minimo
   *  (§2.6) poda oito, e cravar o nome partia o teste no derivado que o seguiu (#189). O preferido
   *  se estiver; senao o primeiro que nao seja `review`/`plan`, que tem os seus casos proprios. */
  const umWorkflow = (dir, preferido) => {
    const ws = readdirSync(file(dir, ".agent/workflows")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
    return ws.includes(preferido) ? preferido : ws.find((w) => !["review", "plan"].includes(w));
  };

  test("G7: um workflow removido da tabela avisa", (dir) => {
    const w = umWorkflow(dir, "design-review");
    for (const f of ["CLAUDE.md", "GEMINI.md"]) dropLinesContaining(dir, f, `.agent/workflows/${w}.md`);
    return { includes: [`Workflow "${w}" nao listado`] };
  }, { code: 1 });

  test("G7: workflow sem colisao de nome continua a ser apanhado", (dir) => {
    // Escrever a tabela COMPLETA primeiro: num projeto derivado que ja tenha removido
    // este workflow da tabela, o aviso estaria no baseline e passaria invisivel.
    const base = ["# Entry", "", "@.agent/rules/core-rules.md", "", "| W | F |", "|---|---|",
      ...listWorkflowRows(dir)].join("\n") + "\n";
    writeF(dir, "CLAUDE.md", base);
    writeF(dir, "GEMINI.md", base.replace(/^@(.*)$/gm, "@./$1"));
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

  test("G8: num DERIVADO, o import das rules do bootstrap ausentes avisa", (dir) => {
    // O marcador poe o repo em derivado; as duas rules ausentes sao o bootstrap a meio (#190).
    writeF(dir, ".agent/.template-version", "sha: abc1234\nversao: v0.3.0\n");
    for (const f of ["business-logic.md", "pages-architecture.md"]) rmSync(file(dir, `.agent/rules/${f}`), { force: true });
  }, {
    code: 1,
    synthetic: true,
    includes: ["importa `@.agent/rules/business-logic.md` mas o ficheiro NAO EXISTE"],
  });

  test("G8: CLAUDE.md sem imports avisa", (dir) => {
    writeF(dir, "CLAUDE.md", readF(dir, "CLAUDE.md").split("\n").filter((l) => !l.startsWith("@")).join("\n"));
  }, { code: 1, includes: ["sem nenhum `@import`"] });

  // --- Guard 9: AGENTS.md e agent-guide.md -------------------------------------
  test("G9a: workflow removido do AGENTS.md avisa", (dir) => {
    const w = umWorkflow(dir, "market-scan");
    writeF(dir, "AGENTS.md", readF(dir, "AGENTS.md").replace(`\`${w}\``, "`removido`"));
    return { includes: [`Workflow "${w}" nao listado em AGENTS.md`] };
  }, { code: 1 });

  test("G9a: /review removido nao e mascarado por design-review", (dir) => {
    writeF(dir, "AGENTS.md", readF(dir, "AGENTS.md").replace("`review` · ", ""));
  }, { code: 1, includes: ['Workflow "review" nao listado em AGENTS.md'] });

  test("G9b: workflow removido do agent-guide.md avisa", (dir) => {
    const w = umWorkflow(dir, "refactor");
    dropLinesContaining(dir, "src/docs/agent-guide.md", `\`/${w}\``);
    return { includes: [`Workflow "${w}" nao listado em src/docs/agent-guide.md`] };
  }, { code: 1 });

  // --- Guard 10: conteudo dos wrappers -----------------------------------------
  test("G10: wrapper a apontar para o workflow ERRADO avisa", (dir) => {
    writeF(dir, ".claude/commands/review.md", "---\ndescription: x\n---\n\nLer `.agent/workflows/deploy.md`.\n");
  }, { code: 1, includes: [".claude/commands/review.md nao aponta"] });

  test("G10: wrapper vazio avisa", (dir) => {
    writeF(dir, ".gemini/commands/debug.toml", "");
  }, { code: 1, includes: [".gemini/commands/debug.toml nao aponta"] });

  // M6 do #195: o template declara a sua versao num ficheiro, em `vX.Y.Z` e so isso.
  test("versao do template: sem o ficheiro, avisa", (dir) => {
    rmSync(file(dir, ".agent/TEMPLATE_VERSION"), { force: true });
  }, { code: 1, synthetic: true, includes: ["`.agent/TEMPLATE_VERSION` nao existe"] });

  test("versao do template: fora do formato, avisa", (dir) => {
    writeF(dir, ".agent/TEMPLATE_VERSION", "versao 1\n");
  }, { code: 1, synthetic: true, includes: ["devia ser `vX.Y.Z`"] });

  test("versao do template: num derivado, salta", (dir) => {
    writeF(dir, ".agent/.template-version", "sha: abc1234\nversao: v0.3.0\n");
    rmSync(file(dir, ".agent/TEMPLATE_VERSION"), { force: true });
  }, { code: 1, synthetic: true, anyOut: ["SKIP  versao do template"], excludes: ["`.agent/TEMPLATE_VERSION` nao existe"] });

  // G-08 do #195: um wrapper que aponta para o workflow certo mas copia a logica la para dentro.
  test("G10: wrapper que aponta mas e grosso avisa", (dir) => {
    writeF(dir, ".claude/commands/review.md",
      `---\ndescription: x\n---\n\nLer \`.agent/workflows/review.md\`.\n\n${"1. Passo copiado do workflow.\n".repeat(40)}`);
  }, { code: 1, includes: [".claude/commands/review.md tem", "a logica vive em"] });

  test("G10: wrapper fino perto do tecto nao avisa", (dir) => {
    writeF(dir, ".claude/commands/review.md",
      `---\ndescription: ${"x".repeat(900)}\n---\n\nLer \`.agent/workflows/review.md\`.\n`);
  }, { code: 0, excludes: [".claude/commands/review.md tem"] });


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
      // Engolir SO o ficheiro ausente. A versao anterior tinha um `catch {}` mudo e o
      // `readFileSync` nao estava importado: as 10 iteracoes lancavam `ReferenceError`, o
      // catch comia-os, e o teste passava por a fixture ficar IDENTICA ao baseline. A receita
      // de deteccao que o TP2 prescreve ("correr cada verificador num clone com CRLF") esteve
      // por verificar desde que foi escrita.
      try {
        paraCrlf(p);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    }
  }, { code: 0, excludes: ["  WARN  "] });


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
    writeF(dir, "GEMINI.md", md.replace(/^@(.*)$/gm, "@./$1"));
  }, {
    code: 0,
    synthetic: true, // a contagem depende de `business-logic.md` nao existir
    includes: ["2 de 3 @imports"],
  });


  // --- Os SKIP que ninguem observava (varredura `--skips`) ----------------------
  // "Todo o skip e visivel" e regra repetida em dezenas de comentarios, e nada media se um
  // skip podia ser apagado em silencio. Um guard que deixa de ANUNCIAR que nao correu e o
  // `TP2`. Cada teste aqui monta a ausencia que faz o guard saltar e exige que ele o diga.
  //
  // `code: 0` na maioria: **um SKIP nao e um WARN**, e o invariante do harness e que o exit
  // code reflete os avisos. O que se afirma nao e reprovacao — e que a linha SKIP aparece.
  // Os dois que esperam `code: 1` sao os que, alem do skip, partem outra coisa (apagar
  // `.agent/workflows` ou o `CLAUDE.md` dispara guards de paridade).

  test("G4: ficheiro de termos banidos ausente da SKIP visivel", (dir) => {
    // O Guard 4 varre ficheiros da lista BANNED; um que nao exista tem de dizer, nao calar.
    // A versao anterior apagava o `agent-guide.md`, que NAO esta nos `LIVING_DOCS`, com o `BANNED`
    // vazio do template — o guard nem chegava a este ramo, e `["SKIP", "agent-guide"]` casava outra
    // linha: apagar o SKIP passava verde (#192, `--skips`). Um termo que nao casa nada e um
    // documento vivo que nao existe levam-no ao ramo sem trazer avisos.
    const g = readF(dir, GUARD)
      .replace(/const BANNED = \[[\s\S]*?\];/, 'const BANNED = [{ re: /termo-que-nao-existe-192/g, msg: "x" }];')
      .replace("const LIVING_DOCS = [", 'const LIVING_DOCS = [\n  "nao-existe-192.md",');
    if (!g.includes("nao-existe-192.md") || !g.includes("termo-que-nao-existe-192")) throw new Error("nao encontrei BANNED e LIVING_DOCS no GUARD");
    writeF(dir, GUARD, g);
  }, { code: 0, includes: ["SKIP  Guard 4 em nao-existe-192.md — ficheiro nao encontrado"] });

  // Sem guards do projeto declarados, o guard tem de o DIZER. O `skips-congelados` permite este
  // SKIP mas nao o exige (de proposito), e apaga-lo passava verde (#192). `registarResultado` e nao
  // `test`: num derivado esvaziar `GUARDS` deixa os guards dele orfaos, e o exit depende disso.
  {
    const dir = sandbox();
    try {
      const cfg = ".agent/scripts/config/guards-do-projeto.mjs";
      const c = readF(dir, cfg).replace(/export const GUARDS = \[[\s\S]*?\];/, "export const GUARDS = [];");
      writeF(dir, cfg, c);
      const out = runGuard(dir).out ?? "";
      registarResultado("guards do projeto: nenhum declarado da SKIP visivel",
        out.includes("SKIP  guards do projeto — nenhum declarado") ? [] : ["o SKIP nao saiu"], out);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("G6: sem .claude/commands da SKIP visivel", (dir) => {
    rmSync(file(dir, ".claude/commands"), { recursive: true, force: true });
  }, { code: 0, includes: ["SKIP  .claude/commands — pasta ausente"] });

  test("G7: sem .agent/workflows da SKIP visivel", (dir) => {
    rmSync(file(dir, ".agent/workflows"), { recursive: true, force: true });
  }, { code: 1, anyOut: ["SKIP  Guard 7"] });

  test("G8: sem CLAUDE.md da SKIP visivel (nao silencio)", (dir) => {
    rmSync(file(dir, "CLAUDE.md"));
  }, { code: 1, anyOut: ["SKIP  Guard 8"] });

  test("G9a: sem AGENTS.md da SKIP visivel", (dir) => {
    rmSync(file(dir, "AGENTS.md"));
  }, { code: 0, includes: ["SKIP  Guard 9a"] });

  test("G9b: sem agent-guide.md da SKIP visivel", (dir) => {
    rmSync(file(dir, "src/docs/agent-guide.md"));
  }, { code: 0, includes: ["SKIP  Guard 9b"] });

  test("G10: sem pastas de wrappers da SKIP visivel", (dir) => {
    rmSync(file(dir, ".claude/commands"), { recursive: true, force: true });
    rmSync(file(dir, ".gemini/commands"), { recursive: true, force: true });
  }, { code: 0, includes: ["SKIP  Guard 10"] });

  // --- Os guards PROPRIOS do projeto, declarados na config (#176) -------------------
  // Ligados a mao no `check-doc-versions.mjs`, o `/upgrade` desligava-os ao substituir o ficheiro.
  // A config e do projeto e o upgrade nunca a substitui.
  const CFG = ".agent/scripts/config/guards-do-projeto.mjs";
  // ACRESCENTA a `GUARDS`, e nao a substitui: num derivado a lista ja tem os guards dele, e
  // tira-los punha-os "nao chamados por ninguem" — o teste reprovava la e passava aqui (`TP3`).
  // O resto da config (as pastas do Guard 20) fica como o repo a tem.
  const declara = (dir, guards) => {
    const antes = readF(dir, CFG);
    const depois = antes.replace("export const GUARDS = [", `export const GUARDS = [${guards.map((g) => JSON.stringify(g)).join(", ")}, `);
    if (depois === antes) throw new Error(`nao encontrei \`export const GUARDS = [\` em ${CFG}`);
    writeF(dir, CFG, depois);
  };
  const PROPRIO = { modulo: "./guards/proprio.mjs", funcao: "guardProprio" };
  const modulo = (corpo) => `export function guardProprio({ warn, ok }) {\n  ${corpo}\n  return 1;\n}\n`;

  test("guard PROPRIO declarado na config corre, e o seu aviso reprova", (dir) => {
    writeF(dir, ".agent/scripts/guards/proprio.mjs", modulo('warn("regra do projeto violada");'));
    declara(dir, [PROPRIO]);
  }, { code: 1, includes: ["regra do projeto violada"] });

  test("guard PROPRIO que passa conta como executado, sem aviso", (dir) => {
    writeF(dir, ".agent/scripts/guards/proprio.mjs", modulo('ok("regra do projeto cumprida");'));
    declara(dir, [PROPRIO]);
  }, { code: 0, includes: ["OK    regra do projeto cumprida"], excludes: ["guards do projeto — nenhum declarado"] });

  // O R7-A outra vez, mas com um SKIP: depois do upgrade o modulo esta no disco e a config vazia.
  test("modulo em guards/ que ninguem chama avisa", (dir) => {
    writeF(dir, ".agent/scripts/guards/proprio.mjs", modulo('ok("nunca corre");'));
  }, { code: 1, includes: ["guards/proprio.mjs nao e chamado por ninguem"] });

  // Uma ligacao partida nao pode passar por "nao ha nada a verificar" (`TP2`).
  test("guard PROPRIO declarado e ausente do disco avisa", (dir) => {
    declara(dir, [PROPRIO]);
  }, { code: 1, includes: ["guardProprio em ./guards/proprio.mjs, e o modulo nao existe"] });

  test("guard PROPRIO cujo modulo nao exporta a funcao avisa", (dir) => {
    writeF(dir, ".agent/scripts/guards/proprio.mjs", "export const outraCoisa = 1;\n");
    declara(dir, [PROPRIO]);
  }, { code: 1, includes: ["o modulo nao a exporta"] });
}
