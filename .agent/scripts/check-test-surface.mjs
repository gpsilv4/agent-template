#!/usr/bin/env node
/**
 * Test Surface Checker — {{PROJECT_NAME}}
 *
 * Responde a UMA pergunta: entre a baseline e agora, a **superficie de teste** foi
 * enfraquecida?
 *
 * PORQUE EXISTE: um ciclo de correcao com o objetivo "ficar verde" tem uma solucao
 * degenerada — enfraquecer o teste em vez de corrigir o codigo (ver `AP4` em
 * `anti-patterns.md`). Apagar a assercao, marcar `skip`, ou **estreitar a selecao do runner**,
 * que remove falhas igualmente bem sem tocar em nenhum ficheiro de teste.
 *
 * O QUE ISTO E E O QUE NAO E: e uma verificacao **universal** — so precisa de `node` e `git`,
 * logo qualquer agente a corre e o CI corre-a para todos. No Claude Code existe tambem um
 * passo a correr — **nao** existe hook a negar a escrita de testes;
 * noutras ferramentas isto e o equivalente que se corre.
 *
 * Uso:
 *   node .agent/scripts/check-test-surface.mjs                 # vs a base do branch
 *   node .agent/scripts/check-test-surface.mjs <ref>           # vs um ref explicito
 *
 * Sai `!= 0` se encontrar enfraquecimento, e tambem se **nao conseguir medir** — um
 * verificador que nao sabe responder nao pode responder "esta tudo bem".
 */

import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- CONFIGURAR AO PROJETO ---------------------------------------------------
// A superficie congelada: onde vivem os testes E a configuracao que os seleciona.
// Congelar so os testes nao basta: estreitar o `include` do runner remove falhas
// igualmente bem. Adaptar no bootstrap a stack do projeto.
const TEST_GLOBS = [
  /(^|\/)(tests?|__tests__|spec|e2e)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /_test\.py$/i,
  /(^|\/)test_[^/]+\.py$/i,
  // `test-guards.mjs`, `tests-settings.mjs`, `test_algo.js`: nem o sufixo `.test.js` nem a
  // pasta `tests/` cobrem quem nomeia a suite pelo **prefixo**. Medido: 9 das 10 suites deste
  // repo eram invisiveis, e apagar TODAS dava "superficie intacta" com exit 0 — um gate a
  // afirmar que estava bem. E o `AP2` na sua forma mais cara.
  /(^|\/)tests?[-_][^/]+\.[cm]?[jt]sx?$/i,
];
const CONFIG_GLOBS = [
  /(^|\/)(vitest|jest|playwright|cypress|karma)\.config\.[cm]?[jt]s$/i,
  /(^|\/)(conftest|factories)\.py$/i,
  /(^|\/)(pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml)$/i,
  /(^|\/)\.mocharc\./i,
];

// O que **nao pode descer**: apagar assercoes ou casos de teste enfraquece a superficie sem
// deixar nenhuma marca de `skip` para trás. Sem isto, cortar uma suite de 328 para 62 linhas
// passava com exit 0. Adaptar ao vocabulario do projeto no bootstrap: o que interessa e que
// os nomes contados sejam os que o projeto **usa** para declarar um teste e uma assercao.
const CONTAGENS = [
  { re: /\b(?:it|test|describe|context)\s*\(/, msg: "casos de teste" },
  { re: /\bdef\s+test_\w+/, msg: "casos de teste (python)" },
  { re: /\b(?:expect|assert\w*)\s*\(/, msg: "assercoes" },
];

// Marcas de enfraquecimento. Procuradas **so** nas linhas ACRESCENTADAS da superficie
// congelada — nunca no codigo de producao, senao um `.skip(offset)` de paginacao ou um
// `only` de uma query dao falso positivo.
const MARCAS = [
  { re: /\b(?:it|test|describe|context)\.(?:skip|only|todo)\b/, msg: "seleccao/desativacao de teste" },
  { re: /\b(?:xit|xdescribe|xtest)\b/, msg: "teste desativado (x-prefixo)" },
  { re: /@pytest\.mark\.(?:skip|xfail)\b/, msg: "marca pytest de skip/xfail" },
  { re: /\.(?:skip|only)\s*\(\s*\)/, msg: "skip()/only() sem argumento" },
  { re: /\b(?:pytest\.skip|unittest\.skip)\b/, msg: "skip programatico" },
];

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

let problemas = 0;
const warn = (m) => {
  console.log(`  WARN  ${m}`);
  problemas++;
};
const ok = (m) => console.log(`  OK    ${m}`);
/** Nao consegui medir: avisa e sai `!= 0` na hora. Existe como FUNCAO e nao como
 *  `console.log` + `process.exit` soltos porque a varredura de mutacao procura sitios de
 *  aviso por nome: escritos a mao, tres destes ficavam fora da contagem e a varredura
 *  anunciava "cobertura completa" a medir metade dos sitios — o mesmo defeito que um
 *  wrapper `flag()` ja tinha causado neste repo. */
const fatal = (m, extra) => {
  console.log(`  WARN  ${m}`);
  if (extra) console.log(extra);
  console.log("");
  process.exit(1);
};

console.log("\n=== Test Surface Check ===\n");

// A baseline: argumento explicito, ou a base do branch atual. **Falhar se nao resolver** —
// um `git` que nao responde nao autoriza um veredicto de "nada mudou".
let base = process.argv[2];
try {
  if (!base) {
    const head = git(["symbolic-ref", "--short", "HEAD"]);
    // Os remote-tracking refs entram na lista, e nao por elegancia: num projeto **derivado**
    // acabado de clonar, o branch de trabalho e `fix/...` e nao existe `main` LOCAL — so
    // `origin/main`. Sem estes candidatos o verificador nao conseguia medir e saia `!= 0` no
    // dia 1 de cada consumidor, com uma mensagem que nao dizia o que fazer. Medido a correr
    // o bootstrap: e a classe do `AP3` (verde no template, vermelho no derivado).
    const principal = ["main", "master", "develop", "origin/main", "origin/master", "origin/develop", "origin/HEAD"].find((b) => {
      try {
        git(["rev-parse", "--verify", `${b}^{commit}`]);
        return true;
      } catch {
        return false;
      }
    });
    if (!principal) {
      fatal(
        "nao encontrei um branch principal (main/master/develop, local ou em origin/) para servir de baseline",
        "        passar um ref explicito: node .agent/scripts/check-test-surface.mjs <ref>"
      );
    }
    base = head === principal ? `${principal}^` : git(["merge-base", principal, "HEAD"]);
  }
  git(["rev-parse", "--verify", `${base}^{commit}`]);
} catch (err) {
  fatal(
    `baseline "${base ?? "(auto)"}" nao resolve: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    "        sem baseline nao ha medicao — e uma medicao ausente nao e um OK"
  );
}
console.log(`  baseline: ${base}\n`);

const naSuperficie = (f) => TEST_GLOBS.some((r) => r.test(f)) || CONFIG_GLOBS.some((r) => r.test(f));

let alterados;
try {
  // `${base}` e nao `${base}..HEAD`: compara a baseline com a **arvore de trabalho**. Com
  // `..HEAD` o verificador ignorava tudo o que nao estivesse commitado — ou seja, "correr
  // antes de commit" nao media exatamente o que estava a ser commitado. No CI as duas formas
  // coincidem (arvore limpa), logo nao ha perda.
  alterados = git(["diff", "--name-only", base]).split("\n").filter(Boolean);
} catch (err) {
  fatal(`o git nao conseguiu listar as alteracoes: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
}

const tocados = alterados.filter(naSuperficie);
if (tocados.length === 0) {
  ok(`superficie de teste intacta (${alterados.length} ficheiro(s) alterado(s), nenhum na superficie)`);
} else {
  for (const f of tocados) {
    const config = CONFIG_GLOBS.some((r) => r.test(f));
    // Comparar a CONTAGEM de cada marca entre a baseline e agora, e nao as linhas do diff.
    // Com `--unified=0`, EDITAR uma linha que ja tinha um `skip` aparece como linha
    // acrescentada — e dava falso positivo em qualquer alteracao a um teste ja desativado.
    // O que interessa e se a marca ficou MAIS frequente.
    // As marcas contam-se com o conteudo das STRINGS retirado. Uma marca dentro de aspas e
    // **dados**, nao uma diretiva: a suite deste proprio verificador tem `test.skip(...)`
    // dentro de fixtures, e sem isto ela sinalizava-se a si mesma — medido a correr o gate
    // num projeto derivado. Uma desativacao a serio (`it.skip(`) fica sempre FORA das aspas,
    // logo continua a contar; e `test("nome"` tambem, porque a chamada nao esta entre aspas.
    // Os escapes contam: um `\'` dentro de uma string desalinhava um emparelhamento ingenuo
    // e a marca seguinte ficava exposta. Medido na propria suite deste verificador, que tem
    // fixtures com aspas escapadas — o gate sinalizava-a a si mesmo num projeto derivado.
    const semStrings = (t) =>
      t.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
    const conta = (texto, re) => {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      return (semStrings(texto).match(g) || []).length;
    };
    // EXISTIA vs conteudo: um ficheiro de teste **vazio** que e apagado tem conteudo "" na
    // baseline, e depender da truthiness dava-lhe a mensagem vaga em vez de "APAGADO".
    let antes = "";
    let existiaAntes = true;
    try {
      antes = git(["show", `${base}:${f}`]);
    } catch {
      existiaAntes = false; // ficheiro novo desde a baseline: zero marcas antes, e correto
    }
    let agora = "";
    const noDisco = join(ROOT, f);
    if (existsSync(noDisco)) {
      agora = readFileSync(noDisco, "utf8");
    } else {
      // Estava na baseline e ja nao esta em HEAD: foi APAGADO. E a forma mais brutal de
      // enfraquecer, e merece nome proprio. (Um ficheiro ausente das DUAS arvores nao pode
      // aparecer no `git diff`, logo nao ha terceiro caso.)
      warn(`${f}: ficheiro da superficie de teste APAGADO desde ${base}${existiaAntes ? "" : " (e ausente da baseline — verificar a mao)"}`);
      continue;
    }
    const achadas = MARCAS.filter((m) => conta(agora, m.re) > conta(antes, m.re));
    const desceram = CONTAGENS.filter((c) => conta(agora, c.re) < conta(antes, c.re));
    const notas = [
      ...achadas.map((a) => `${a.msg} acrescentado(s)`),
      ...desceram.map((d) => `${d.msg}: ${conta(antes, d.re)} -> ${conta(agora, d.re)}`),
    ];
    if (notas.length) {
      warn(`${f}: ${notas.join("; ")} desde ${base}`);
    } else if (config) {
      warn(`${f}: configuracao do runner alterada — confirmar que a selecao de testes nao ficou mais estreita`);
    } else {
      ok(`${f} alterado, sem marcas de enfraquecimento`);
    }
  }
}

console.log("");
if (problemas > 0) {
  console.log(`WARNING: ${problemas} sinal(is) de enfraquecimento da superficie de teste.`);
  console.log("         Corrigir o codigo, nao o teste. Ver AP4 em .agent/rules/anti-patterns.md\n");
} else {
  console.log("  Superficie de teste nao enfraquecida.\n");
}
process.exit(problemas > 0 ? 1 : 0);
