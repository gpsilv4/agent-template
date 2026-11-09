#!/usr/bin/env node
/**
 * Testes do MODO PARCIAL do `/upgrade` (#429) — {{PROJECT_NAME}}
 *
 * Prova quatro coisas, cada uma com o seu controlo (o mesmo texto mutado de UMA forma tem de dar vermelho):
 *   1. a regra do modo (`lib/modo-upgrade.mjs`): as seis linhas da tabela, e um `modo:` que nao e nenhum dos dois;
 *   2. o §4 do `upgrade.md` CORRIDO (o bloco `bash` tirado do ficheiro como texto): grava o `commit:` PRIMEIRO, mantem
 *      o `modo:` e o resto (larga o `versao:` velho), e a extracao do §1 (tambem tirada do ficheiro) le o SHA NOVO — numa fixture
 *      feita para o desmentir (o template sem `origin` num caminho com uma palavra hex, e uma linha mantida com outra);
 *   3. a ORDEM do `src/docs/upgrade-parcial.md`: a pergunta, o que vem, a fronteira, o CI, medir, as notas;
 *   4. o FECHO: a lista "o que vem" cobre tudo o que os hooks, o `commit-msg`, o `check-backlog` e o `minutos-ci`
 *      leem (`harness/fecho-parcial.mjs`), e o tokenizer nao toma um comentario ou uma regex por um caminho.
 * Os casos do simulador (o que o `simulate-upgrade --projeto` diz em cada modo) estao no `tests-medida-2b-modo.mjs`.
 *
 * Num derivado, as partes 3 e 4 SKIP (com ou sem o doc); no template sao exigidas (`TP15`).
 *
 *   node .agent/scripts/tests/test-modo-upgrade.mjs
 */
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { modoDaMarca, modoDoProjeto, mensagemDoModo } from "../lib/modo-upgrade.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { ISENCOES, listaDoDoc, literaisDe, problemasDoFecho } from "./harness/fecho-parcial.mjs";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const ler = (p) => leOuNull(join(ROOT, p));
const DOC = "src/docs/upgrade-parcial.md";

let passed = 0;
const falhas = [];
function caso(nome, fn) {
  let p;
  try {
    p = fn() ?? [];
  } catch (err) {
    p = [`rebentou: ${err instanceof Error ? err.message : String(err)}`];
  }
  if (p.length === 0) {
    passed++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`  FAIL  ${nome}`);
    for (const m of p) console.log(`          ${m}`);
  }
}
const espera = (cond, msg) => (cond ? [] : [msg]);

// --- 1. A regra ---

const LINHAS = [
  ["modo: parcial\n", false, "parcial"],
  ["modo: parcial\n", true, "contradicao"],
  ["modo: completo\n", true, "completo"],
  ["modo: completo\n", false, "contradicao"],
  ["", true, "completo"],
  ["", false, "parcial"],
  ["modo: outro\n", true, "contradicao"],
];
for (const [extra, temGuardTests, quer] of LINHAS) {
  caso(`regra: ${extra.trim() || "sem modo:"} + ${temGuardTests ? "com" : "sem"} o job -> ${quer}`, () => {
    const r = modoDoProjeto({ marca: `commit: abc1234\n${extra}`, temGuardTests });
    return [...espera(r.modo === quer, `deu ${r.modo}`), ...espera(r.porque.length > 0, "sem porque")];
  });
}
caso("regra: o `modo:` le-se da sua linha (espacos no fim; nao de outra linha que o mencione)", () => [
  ...espera(modoDaMarca("commit: x\nmodo: parcial  \n") === "parcial", "com espacos no fim"),
  ...espera(modoDaMarca("nota: o modo: parcial e daqui a um mes\n") === null, "leu o modo do meio de outra linha"),
  ...espera(modoDaMarca(null) === null, "sem marca"),
]);
caso("regra: a mensagem do parcial nomeia o doc e as duas verificacoes a mao; a da contradicao diz-se", () => {
  const p = mensagemDoModo({ modo: "parcial", porque: "x" });
  const c = mensagemDoModo({ modo: "contradicao", porque: "y" });
  return [
    ...espera(/nada medido/.test(p) && p.includes("src/docs/upgrade-parcial.md") && p.includes("test-hooks.mjs") && p.includes(".githooks/commit-msg") && p.includes("check-backlog"), `parcial: ${p}`),
    ...espera(/contradizem-se: y/.test(c), `contradicao: ${c}`),
  ];
});

// --- 2. O §4 corrido ---

const UPGRADE = ler(".agent/workflows/upgrade.md") ?? "";
const TPL_LINHA = "TPL=<caminho-para-um-CLONE-LOCAL-do-template>";

/** O bloco `bash` da seccao `## 4.` do `upgrade.md`, ou `null`. */
function blocoDo4(texto) {
  const i = texto.search(/^## 4\./m);
  if (i < 0) return null;
  const fim = texto.slice(i + 1).search(/^## /m);
  const seccao = texto.slice(i, fim < 0 ? texto.length : i + 1 + fim);
  return /```bash\n([\s\S]*?)```/.exec(seccao)?.[1] ?? null;
}
/** A extracao do SHA do §1 (Modo A), tirada do ficheiro. */
const extracaoDo1 = (texto) => texto.split("\n").find((l) => /^SHA=\$\(grep -oE .*\.agent\/\.template-version/.test(l)) ?? null;
/** A leitura do `versao:` do §1 (a alternativa ao SHA), tirada do ficheiro. */
const versaoDo1 = (texto) => texto.split("\n").find((l) => /^V=\$\(.*\.agent\/\.template-version/.test(l)) ?? null;

function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
const MARCA_ANTIGA = "template: /um/caminho/antigo\ncommit: 1111111\ndata: 2026-01-01\nversao: v0.62.0\nmodo: parcial\nnota: abc1234\n";

/** Corre o `bloco` do §4 num projeto de fixture e devolve `{ marca, sha, lido }`, ou `{ erro }`. */
function corre4(bloco, texto = UPGRADE) {
  const raiz = mkdtempSync(join(tmpdir(), "modo-upgrade-test-"));
  try {
    // O template SEM `origin`, num caminho com uma palavra hex E uma versao: o `template:` da marca e esse caminho.
    const tpl = join(raiz, "tpl-abc1234def-v9.9.9");
    mkdirSync(tpl);
    writeFileSync(join(tpl, "a.md"), "a\n");
    git(tpl, "init", "-q", "-b", "main");
    git(tpl, "add", "-A");
    git(tpl, "commit", "-q", "-m", "tpl");
    const sha = git(tpl, "rev-parse", "HEAD");
    const proj = join(raiz, "proj");
    mkdirSync(join(proj, ".agent"), { recursive: true });
    writeFileSync(join(proj, ".agent/.template-version"), MARCA_ANTIGA);
    if (bloco.split("\n").filter((l) => l === TPL_LINHA).length !== 1) return { erro: `a linha \`${TPL_LINHA}\` nao aparece exatamente uma vez no §4` };
    const script = bloco.replace(TPL_LINHA, `TPL=${JSON.stringify(tpl)}`);
    const r = spawnSync("bash", ["-c", script], { cwd: proj, encoding: "utf8" });
    if (r.status !== 0) return { erro: `o §4 saiu ${r.status}: ${r.stderr}` };
    const marca = readFileSync(join(proj, ".agent/.template-version"), "utf8");
    const ext = extracaoDo1(texto);
    if (!ext) return { erro: "nao encontrei a extracao do SHA no §1" };
    const lido = spawnSync("bash", ["-c", `${ext}\nprintf '%s' "$SHA"`], { cwd: proj, encoding: "utf8" }).stdout;
    const v = versaoDo1(texto);
    if (!v) return { erro: "nao encontrei a leitura do `versao:` no §1" };
    const versao = spawnSync("bash", ["-c", `${v}\nprintf '%s' "$V"`], { cwd: proj, encoding: "utf8" }).stdout;
    return { marca, sha, lido, tpl, versao };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
/** Os problemas da marca escrita pelo §4. */
function problemasDo4(bloco, texto = UPGRADE) {
  if (bloco === null) return ["nao encontrei o bloco `bash` da seccao `## 4.` do upgrade.md"];
  const r = corre4(bloco, texto);
  if (r.erro) return [r.erro];
  const linhas = r.marca.split("\n").filter(Boolean);
  const conta = (k) => linhas.filter((l) => l.startsWith(`${k}:`)).length;
  return [
    ...espera(r.lido === r.sha, `o §1 leu \`${r.lido}\` da marca escrita, e nao o SHA novo \`${r.sha}\`:\n${r.marca}`),
    ...espera(linhas[0] === `commit: ${r.sha}`, `a 1.a linha nao e o \`commit:\` novo: ${linhas[0]}`),
    ...espera(conta("commit") === 1 && conta("template") === 1 && conta("data") === 1, `commit/template/data nao aparecem uma vez cada:\n${r.marca}`),
    ...espera(linhas.includes(`template: ${r.tpl}`), "o `template:` nao e o caminho do clone (sem origin)"),
    ...["modo: parcial", "nota: abc1234"].flatMap((l) => espera(linhas.includes(l), `perdeu \`${l}\``)),
    // O `versao:` velho NAO fica: ao lado do commit novo, era a baseline errada quando o SHA nao existe no clone.
    ...espera(conta("versao") === 0, `manteve o \`versao:\` velho:\n${r.marca}`),
    // E o §1 nao o vai buscar ao caminho do template (o `template:` sem origin tem um `v9.9.9`).
    ...espera(r.versao === "", `o §1 leu a versao \`${r.versao}\` de uma marca sem \`versao:\``),
  ];
}
const BLOCO = blocoDo4(UPGRADE);
caso("§4: grava o commit PRIMEIRO, mantem `modo:` e o resto, larga o `versao:` velho, e o §1 le o SHA novo", () => problemasDo4(BLOCO));

const PRINTF_NOVO = /printf 'commit: %s\\ntemplate: %s\\ndata: %s\\n%s\\n' "\$SHA" \\\n  ("\$\(git -C "\$TPL" remote get-url origin 2>\/dev\/null \|\| echo "\$TPL"\)") "\$\(date \+%F\)" "\$M"/;
const MUTACOES_4 = [
  { nome: "o printf antigo de 3 campos", troca: (b) => b.replace(/^M=.*\n/m, "").replace(PRINTF_NOVO, `printf 'template: %s\\ncommit: %s\\ndata: %s\\n' \\\n  $1 \\\n  "$SHA" "$(date +%F)"`).replace(/ \| grep \. >/, " >"), espera: "o §1 leu" },
  { nome: "o `template:` antes do `commit:`", troca: (b) => b.replace(PRINTF_NOVO, `printf 'template: %s\\ncommit: %s\\ndata: %s\\n%s\\n' \\\n  $1 "$SHA" "$(date +%F)" "$M"`), espera: "o §1 leu" },
  { nome: "as linhas mantidas antes do `commit:`", troca: (b) => b.replace(PRINTF_NOVO, `printf '%s\\ncommit: %s\\ntemplate: %s\\ndata: %s\\n' "$M" "$SHA" \\\n  $1 "$(date +%F)"`), espera: "o §1 leu" },
  { nome: "manter so o `modo:`", troca: (b) => b.replace(/^M=\$\(grep -vE '\^\(template\|commit\|data\|versao\):'/m, "M=$(grep -E '^modo:'"), espera: "perdeu `nota: abc1234`" },
  { nome: "manter o `versao:` velho", troca: (b) => b.replace("'^(template|commit|data|versao):'", "'^(template|commit|data):'"), espera: "manteve o `versao:` velho" },
];
caso("controlo §1: o `V=` antigo (a 1.a versao da marca) le a do caminho do template", () => {
  const velho = UPGRADE.replace(versaoDo1(UPGRADE) ?? "@@", `V=$(grep -oE 'v[0-9]+\\.[0-9]+\\.[0-9]+' .agent/.template-version | head -1)`);
  if (velho === UPGRADE) return ["a mutacao nao se aplicou (o §1 mudou?)"];
  const ps = problemasDo4(BLOCO, velho);
  return ps.some((p) => p.includes("o §1 leu a versao `v9.9.9`")) ? [] : [`deu: ${ps.join(" | ") || "nenhum"}`];
});
for (const m of MUTACOES_4) {
  caso(`controlo §4: ${m.nome}`, () => {
    if (BLOCO === null) return ["sem o bloco do §4"];
    const mutado = m.troca(BLOCO);
    if (mutado === BLOCO) return ["a mutacao nao se aplicou (o §4 mudou?)"];
    const ps = problemasDo4(mutado);
    return ps.some((p) => p.includes(m.espera)) ? [] : [`esperava "${m.espera}"; deu: ${ps.join(" | ") || "nenhum"}`];
  });
}

// --- 3 e 4. O doc ---

const doc = ler(DOC);
// Num derivado, SEMPRE SKIP (com ou sem o doc): o fecho e as isencoes sao do codigo do TEMPLATE, e um hook proprio do
// projeto pintava de vermelho uma lista que nao e dele.
if (ehDerivado((p) => ler(p))) {
  console.log(`  SKIP  a ordem e o fecho do ${DOC} sao do template (isto e um derivado).`);
} else {
  const ORDEM = ["## 1. A pergunta", "## 2. O que vem", "## 3. A ordem da fronteira", "## 4. O CI", "## 5. Medir", "## 6. As notas"];
  const ordemDe = (t) => (t ?? "").split("\n").filter((l) => /^## /.test(l));
  const problemasDaOrdem = (t) => (JSON.stringify(ordemDe(t)) === JSON.stringify(ORDEM) ? [] : [`as seccoes sao ${JSON.stringify(ordemDe(t))}, e nao ${JSON.stringify(ORDEM)}`]);
  caso(`${DOC}: as seis seccoes, por ordem`, () => (doc === null ? [`${DOC} nao existe — no template e exigido (\`TP15\`)`] : problemasDaOrdem(doc)));
  caso("controlo ordem: duas seccoes trocadas", () => {
    const t = (doc ?? "").replace("## 4. O CI", "## @@").replace("## 5. Medir", "## 4. O CI").replace("## @@", "## 5. Medir");
    return problemasDaOrdem(t).length ? [] : ["a ordem trocada passou"];
  });

  const lista = listaDoDoc(doc);
  caso("fecho: a lista \"o que vem\" cobre tudo o que a fronteira le, e cada isencao ainda apanha algo", () => (lista === null ? ["sem os marcadores `<!-- fecho:inicio -->`/`<!-- fecho:fim -->`"] : problemasDoFecho(ROOT, lista, ISENCOES)));
  // Cada controlo tira UMA entrada da lista: o import estatico, o `import()` por texto, a pasta lida, o ficheiro lido.
  for (const [tira, espera] of [
    [".agent/scripts/lib/agentes.mjs", "`.agent/scripts/lib/agentes.mjs`"],
    [".agent/scripts/lib/nomes-proibidos.mjs", "`.agent/scripts/lib/nomes-proibidos.mjs`"],
    [".claude/agents/", "`.claude/agents`"],
    ["CONTRIBUTING.md", "`CONTRIBUTING.md`"],
    [".agent/scripts/tests/harness/relatorio.mjs", "`.agent/scripts/tests/harness/relatorio.mjs`"],
    // O literal por extenso do `lib/backlog-areas.mjs` (#465): sem ele, a lista ficava verde com a `config/` invisivel.
    [".agent/scripts/config/areas-do-backlog.mjs", "`.agent/scripts/config/areas-do-backlog.mjs`"],
  ]) {
    caso(`controlo fecho: sem \`${tira}\` na lista`, () => {
      const ps = problemasDoFecho(ROOT, (lista ?? []).filter((e) => e !== tira), ISENCOES);
      return ps.some((p) => p.startsWith(espera)) ? [] : [`esperava ${espera}; deu: ${ps.join(" | ") || "nenhum"}`];
    });
  }
  // Numa FIXTURE: um hook novo do `.githooks/` (nao so o `commit-msg`) que le uma lib, e um nome que o modulo nao exporta.
  const H = ".claude/hooks";
  const comFixture = (fn) => {
    const r = mkdtempSync(join(tmpdir(), "modo-upgrade-test-"));
    try {
      const ficheiros = {
        ".githooks/pre-push": 'import(".agent/scripts/lib/x.mjs");\n',
        ".agent/scripts/lib/x.mjs": "export const y = 1;\n",
        [`${H}/a.mjs`]: 'import { z } from "../../.agent/scripts/lib/x.mjs";\n',
      };
      for (const [f, c] of Object.entries(ficheiros)) {
        mkdirSync(join(r, f, ".."), { recursive: true });
        writeFileSync(join(r, f), c);
      }
      return fn(r);
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  };
  caso("controlo fecho (fixture): um hook do `.githooks/` alem do `commit-msg` entra no fecho", () =>
    comFixture((r) => {
      const ps = problemasDoFecho(r, [`${H}/`, ".githooks/"], []);
      // So aparece entre quem o le se o `pre-push` foi lido: e isso que prova que ele e raiz.
      return ps.some((p) => p.startsWith("`.agent/scripts/lib/x.mjs` (lido por") && /lido por [^)]*\.githooks\/pre-push/.test(p)) ? [] : [`deu: ${ps.join(" | ") || "nenhum"}`];
    }));
  caso("controlo fecho (fixture): um nome importado que o modulo da lista nao exporta reprova", () =>
    comFixture((r) => {
      const ps = problemasDoFecho(r, [`${H}/`, ".githooks/", ".agent/scripts/lib/x.mjs"], []);
      return ps.some((p) => p.includes("importa `z` de .agent/scripts/lib/x.mjs, que nao o exporta")) ? [] : [`deu: ${ps.join(" | ") || "nenhum"}`];
    }));
  caso("controlo fecho: uma isencao que ja nao apanha nada reprova", () => {
    const ps = problemasDoFecho(ROOT, lista ?? [], [...ISENCOES, { ficheiro: ".claude/hooks/stop-verify.mjs", literal: ".claude/nada.json", porque: "x" }]);
    return ps.some((p) => p.includes("`.claude/nada.json`") && p.includes("ja nao apanha nada")) ? [] : [`deu: ${ps.join(" | ") || "nenhum"}`];
  });
  caso("controlo fecho: sem uma isencao, o caminho dela aparece", () => {
    const ps = problemasDoFecho(ROOT, lista ?? [], ISENCOES.filter((x) => x.literal !== ".claude/state/stop-verify.last"));
    return ps.some((p) => p.startsWith("`.claude/state/stop-verify.last`")) ? [] : [`deu: ${ps.join(" | ") || "nenhum"}`];
  });
}

caso("tokenizer: um caminho num comentario ou numa regex NAO conta; num texto e no prefixo de um template conta", () => {
  const src = [
    "/** le `.agent/scripts/lib/doc.mjs` */",
    "// ver \".agent/scripts/lib/linha.mjs\"",
    'const r = /".agent\\/scripts\\/lib\\/regex.mjs"/;',
    "const x = a / 2 / 3;",
    'import { y } from "./texto.mjs";',
    "const t = `.agent/scripts/lib/${nome}.mjs`;",
    "const s = '.claude/agents';",
    "const u = `${raiz}/.agent/scripts/lib/depois.mjs`;",
  ].join("\n");
  const l = literaisDe(src);
  return [
    ...espera(!l.some((x) => /doc\.mjs|linha\.mjs|regex\.mjs/.test(x)), `apanhou um comentario ou uma regex: ${JSON.stringify(l)}`),
    ...espera(l.includes("./texto.mjs") && l.includes(".agent/scripts/lib/") && l.includes(".claude/agents"), `faltou um literal: ${JSON.stringify(l)}`),
    ...espera(l.includes(".agent/scripts/lib/depois.mjs"), `o pedaco depois de um \`\${…}\` nao entrou: ${JSON.stringify(l)}`),
  ];
});

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
