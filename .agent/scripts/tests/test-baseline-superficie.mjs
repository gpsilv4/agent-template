#!/usr/bin/env node
/**
 * Testes NEGATIVOS da baseline e da exigencia de superficie — {{PROJECT_NAME}}
 *
 * As duas perguntas que o `check-test-surface.mjs` responde antes de comparar seja o que for:
 * contra QUE commit se mede, e HA alguma coisa para medir.
 *
 * O QUE ESTA SUITE AFIRMA: cada uma das cinco recusas fica vermelha quando o que ela vigia
 * falha. Sao todas recusas de **"nao consegui medir"**, e sao a classe que mais interessa —
 * um verificador que falhe ABERTO ao nao conseguir medir da por intacta uma superficie que
 * nunca leu, e sai `0` a dizer que esta tudo bem. E o `TP2` na sua forma mais cara.
 *
 * O `git` E FALSO, e e deliberado: montar repositorios reais para cada caso (detached HEAD,
 * sem branch principal, baseline podre) e lento e fragil, e os casos ficavam a depender do
 * estado do repo onde a suite corre — `TP3`. Aqui cada teste MONTA a resposta do git que quer
 * medir, e o que se afirma e a decisao do modulo perante ela.
 *
 *   node .agent/scripts/tests/test-baseline-superficie.mjs
 */
import { resolveBaseline, exigeSuperficie } from "../lib/baseline-superficie.mjs";

let passed = 0;
const falhas = [];
const test = (nome, fn) => {
  let p;
  try {
    p = fn() ?? [];
  } catch (err) {
    p = [`rebentou: ${err.message}`];
  }
  if (p.length === 0) {
    passed++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas.push([nome, p]);
    console.log(`  FAIL  ${nome}`);
    for (const m of p) console.log(`          ${m}`);
  }
};

/** O `fatal` do verificador, capturado em vez de executado: o verdadeiro sai do processo e
 *  matava a suite. Substitui-lo por um no-op media o modulo a falhar ABERTO, que e o defeito
 *  — por isso lanca, e o teste afirma SOBRE a mensagem. */
class Recusa extends Error {}
const fatal = (m) => {
  throw new Recusa(m);
};

/** Um `git` de mentira: `respostas` mapeia o primeiro argumento (ou o comando todo) ao que
 *  devolve; uma resposta `Error` faz o comando lancar, que e como o git real falha. */
const gitFalso = (respostas) => (args) => {
  const chave = Object.keys(respostas).find((k) => args.join(" ").startsWith(k));
  if (chave === undefined) throw new Error(`git ${args.join(" ")}: nao previsto pela fixture`);
  const r = respostas[chave];
  if (r instanceof Error) throw r;
  return r;
};

/** O caminho feliz: branch de trabalho, `main` existe, tudo resolve. Cada teste parte daqui e
 *  estraga UMA coisa — senao nao se sabe qual delas produziu a recusa. */
const FELIZ = {
  "rev-parse --abbrev-ref HEAD": "feature/x",
  "symbolic-ref --short HEAD": "feature/x",
  "rev-parse --verify main^{commit}": "aaa",
  "merge-base main HEAD": "cafe123",
  "rev-parse --verify cafe123^{commit}": "cafe123",
};

console.log("\n=== Testes da baseline e da superficie ===\n");

// --- resolveBaseline: o caminho feliz, primeiro --------------------------------
// Sem ele, um modulo que recusasse SEMPRE passava em todos os testes de recusa abaixo.
test("resolveBaseline: deriva a base do branch atual", () => {
  const base = resolveBaseline({ base: undefined, git: gitFalso(FELIZ), fatal });
  return base === "cafe123" ? [] : [`devolveu ${base}, esperava o merge-base`];
});

test("resolveBaseline: um ref explicito e respeitado e verificado", () => {
  const vistos = [];
  const git = (args) => {
    vistos.push(args.join(" "));
    return "ok";
  };
  const base = resolveBaseline({ base: "v1.2.3", git, fatal });
  const p = [];
  if (base !== "v1.2.3") p.push(`devolveu ${base}`);
  if (!vistos.some((v) => v.includes("v1.2.3^{commit}"))) p.push("nao verificou o ref passado a mao");
  return p;
});

// No branch principal a base e o commit ANTERIOR, e nao o merge-base consigo proprio (que
// seria o proprio HEAD, e media zero).
test("resolveBaseline: no branch principal mede contra o commit anterior", () => {
  const base = resolveBaseline({
    base: undefined,
    git: gitFalso({
      ...FELIZ,
      "rev-parse --abbrev-ref HEAD": "main",
      "symbolic-ref --short HEAD": "main",
      // A verificacao final, sobre `main^`. Sem esta entrada a fixture lancava e o teste
      // acusava o modulo de uma falha que era dela.
      "rev-parse --verify main^^{commit}": "anterior",
    }),
    fatal,
  });
  return base === "main^" ? [] : [`devolveu ${base}, esperava main^`];
});

// --- RECUSA 1 de 5: detached HEAD ----------------------------------------------
// Tem mensagem propria porque a generica culpava a coisa errada: dizia que a baseline nao
// resolvia quando o problema era nao haver branch de onde a derivar.
test("RECUSA: detached HEAD, com mensagem propria", () => {
  try {
    resolveBaseline({ base: undefined, git: gitFalso({ "rev-parse --abbrev-ref HEAD": "HEAD" }), fatal });
    return ["passou em detached HEAD — mediria contra uma baseline inventada"];
  } catch (err) {
    return err instanceof Recusa && /detached/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  }
});

// --- RECUSA 2 de 5: sem branch principal ---------------------------------------
test("RECUSA: nenhum branch principal existe", () => {
  try {
    resolveBaseline({
      base: undefined,
      git: gitFalso({
        "rev-parse --abbrev-ref HEAD": "feature/x",
        "symbolic-ref --short HEAD": "feature/x",
        "rev-parse --verify": new Error("unknown revision"),
      }),
      fatal,
    });
    return ["passou sem branch principal nenhum"];
  } catch (err) {
    return err instanceof Recusa && /nao encontrei um branch principal/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  }
});

// O CONTRA-CASO da de cima, e e ele que impede a lista de encolher em silencio: num clone novo
// so existe `origin/main`, e o verificador TEM de conseguir medir. Sem este caso, alguem
// cortava os remote-tracking da lista e so um consumidor descobria, no dia 1.
test("resolveBaseline: so com origin/main ainda resolve (o caso do clone novo)", () => {
  const base = resolveBaseline({
    base: undefined,
    git: gitFalso({
      "rev-parse --abbrev-ref HEAD": "feature/x",
      "symbolic-ref --short HEAD": "feature/x",
      "rev-parse --verify main^{commit}": new Error("unknown"),
      "rev-parse --verify master^{commit}": new Error("unknown"),
      "rev-parse --verify develop^{commit}": new Error("unknown"),
      "rev-parse --verify origin/main^{commit}": "aaa",
      "merge-base origin/main HEAD": "bbb",
      "rev-parse --verify bbb^{commit}": "bbb",
    }),
    fatal,
  });
  return base === "bbb" ? [] : [`devolveu ${base}, esperava a base contra origin/main`];
});

// --- RECUSA 3 de 5: a baseline nao resolve -------------------------------------
test("RECUSA: o ref passado a mao nao existe", () => {
  try {
    resolveBaseline({ base: "nao-existe", git: gitFalso({ "rev-parse --verify": new Error("bad revision") }), fatal });
    return ["aceitou um ref que nao resolve — media contra nada"];
  } catch (err) {
    return err instanceof Recusa && /nao resolve/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  }
});

// --- exigeSuperficie: o caminho feliz ------------------------------------------
test("exigeSuperficie: com ficheiros dos dois lados nao recusa", () => {
  exigeSuperficie({
    base: "x",
    git: gitFalso({ "ls-tree": "src/a.test.js\nREADME.md", "ls-files": "src/a.test.js" }),
    fatal,
    testGlobs: [/\.test\.js$/],
  });
  return [];
});

// So no DISCO tambem chega: e o caso de um projeto cuja baseline e anterior as suites, medido
// a seguir a receita do BOOTSTRAP neste repo.
test("exigeSuperficie: so no disco chega (baseline anterior as suites)", () => {
  exigeSuperficie({
    base: "x",
    git: gitFalso({ "ls-tree": "README.md", "ls-files": "src/a.test.js" }),
    fatal,
    testGlobs: [/\.test\.js$/],
  });
  return [];
});

// --- RECUSA 4 de 5: o git nao lista a baseline ---------------------------------
test("RECUSA: o git nao conseguiu listar os ficheiros da baseline", () => {
  try {
    exigeSuperficie({ base: "x", git: gitFalso({ "ls-tree": new Error("fatal: not a tree") }), fatal, testGlobs: [/\.test\.js$/] });
    return ["passou sem conseguir ler a baseline"];
  } catch (err) {
    return err instanceof Recusa && /nao conseguiu listar/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  }
});

// --- RECUSA 5 de 5: os globs nao casam nada ------------------------------------
// A mais importante das cinco: sem ela o verificador imprimia "superficie intacta" e saia 0
// **para sempre** sobre uma suite apagada. TP2 aplicado a si proprio.
test("RECUSA: os TEST_GLOBS nao casam nada, em lado nenhum", () => {
  try {
    exigeSuperficie({
      base: "x",
      git: gitFalso({ "ls-tree": "README.md", "ls-files": "README.md" }),
      fatal,
      testGlobs: [/\.test\.js$/],
    });
    return ["passou sem superficie nenhuma — diria 'intacta' sobre uma suite apagada"];
  } catch (err) {
    return err instanceof Recusa && /nao casam nenhum ficheiro de teste/.test(err.message) ? [] : [`recusa errada: ${err.message}`];
  }
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n  Um verificador que nao consegue medir e sai 0 da por intacta uma superficie que nunca leu.\n");
  process.exit(1);
}
console.log("\n  Todos os testes da baseline e da superficie passaram.\n");
process.exit(0);
