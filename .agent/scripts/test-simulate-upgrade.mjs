#!/usr/bin/env node
/**
 * Testes NEGATIVOS do simulador de `/upgrade` — {{PROJECT_NAME}}
 *
 * O que se afirma: **cada caminho de recusa recusa mesmo, e diz porque**. Um simulador que
 * falhasse aberto era pior do que nao existir — daria por verificada a metade do produto que
 * ninguem mede, que e exactamente o buraco que ele veio tapar.
 *
 * Cada caso monta o seu proprio repo git (`TP3`: nada e herdado do estado deste). Os casos
 * exercitam os caminhos que saem ANTES de o simulador precisar das suites reais — e por isso
 * sao baratos; a corrida completa e o `simulate-upgrade.mjs` no CI.
 *
 * O motor mecanico tem os seus casos proprios aqui em baixo: foi extraido para `lib/` por ser
 * a parte que escreve por cima dos ficheiros de um consumidor, e e ai que um erro custa dados.
 *
 *   node .agent/scripts/test-simulate-upgrade.mjs
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { aplicaUpgradeMecanico } from "./lib/upgrade-mecanico.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SIMULADOR = resolve(AQUI, "simulate-upgrade.mjs");

let passed = 0;
const falhas = [];

const git = (dir, args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** Um repo git minimo que passa o guarda "sou o template?": tem `BOOTSTRAP.md` e nao tem
 *  marca. O conteudo e o minimo para o simulador chegar ao passo que se quer medir. */
function repo({ comTag = null, comMarca = false, semBootstrap = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sim-up-"));
  mkdirSync(join(dir, ".agent", "scripts"), { recursive: true });
  if (!semBootstrap) writeFileSync(join(dir, ".agent/BOOTSTRAP.md"), "# Bootstrap\n");
  if (comMarca) writeFileSync(join(dir, ".agent/.template-version"), "sha: abc1234\n");
  writeFileSync(join(dir, "README.md"), "# repo\n");
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t"]);
  git(dir, ["config", "user.name", "t"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "inicial"]);
  if (comTag) {
    git(dir, ["tag", comTag]);
    // Sem um commit A SEGUIR a tag, a tag E o HEAD — que e o caso do "delta vazio".
  }
  return dir;
}

/** Corre o simulador DENTRO de `dir`. O simulador resolve a raiz a partir do seu proprio
 *  caminho, logo tem de ser copiado para la — correr o daqui mediria ESTE repo. */
function corre(dir) {
  mkdirSync(join(dir, ".agent", "scripts", "lib"), { recursive: true });
  for (const [de, para] of [
    [SIMULADOR, ".agent/scripts/simulate-upgrade.mjs"],
    [resolve(AQUI, "lib", "upgrade-mecanico.mjs"), ".agent/scripts/lib/upgrade-mecanico.mjs"],
  ]) {
    writeFileSync(join(dir, para), readFileSync(de, "utf8"));
  }
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, ".agent/scripts/simulate-upgrade.mjs")], { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

function test(nome, fn) {
  try {
    const problemas = fn() ?? [];
    if (problemas.length === 0) {
      passed++;
      console.log(`  PASS  ${nome}`);
    } else {
      falhas.push({ nome, problemas });
      console.log(`  FAIL  ${nome}`);
      for (const p of problemas) console.log(`          ${p}`);
    }
  } catch (err) {
    falhas.push({ nome, problemas: [`rebentou: ${err.message}`] });
    console.log(`  FAIL  ${nome}\n          rebentou: ${err.message}`);
  }
}

/** Verifica exit code e texto de uma corrida, e devolve os problemas. */
const exige = ({ code, out }, { codigo, inclui = [], exclui = [] }) => {
  const p = [];
  if (code !== codigo) p.push(`exit ${code}, esperado ${codigo}`);
  for (const t of inclui) if (!out.includes(t)) p.push(`output devia conter ${JSON.stringify(t)}`);
  for (const t of exclui) if (out.includes(t)) p.push(`output NAO devia conter ${JSON.stringify(t)}`);
  if (p.length) p.push(`--- output ---\n${out.slice(0, 700)}`);
  return p;
};

console.log("\n=== Testes do simulador de /upgrade ===\n");

// --- Os guardas que saem ANTES de medir -----------------------------------------

// Sem tags nao ha baseline, e sem baseline nao ha medicao. Passar aqui seria dar por
// verificado um upgrade que nunca chegou a ser montado — o `TP2` na ferramenta escrita
// para o apanhar.
test("sem tags acessiveis, REPROVA a dizer que nao mediu", () => {
  const dir = repo();
  try {
    return exige(corre(dir), { codigo: 1, inclui: ["nao ha tags acessiveis", "sem baseline nao ha medicao"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A tag IGUAL ao HEAD acontece logo a seguir a marcar uma release. Sem delta nao ha upgrade
// nenhum a simular, e um OK aqui era sucesso sobre zero trabalho.
test("tag identica ao HEAD (delta vazio), REPROVA", () => {
  const dir = repo({ comTag: "v9.9.9" });
  try {
    return exige(corre(dir), { codigo: 1, inclui: ["e identica ao HEAD", "nao ha upgrade a simular"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// O CONTRA-CASO do anterior: com um commit depois da tag ha delta, e o simulador passa deste
// guarda. Sem ele, um simulador que reprovasse SEMPRE passava o teste de cima.
test("com delta, PASSA deste guarda (nao reprova por baseline)", () => {
  const dir = repo({ comTag: "v9.9.9" });
  try {
    writeFileSync(join(dir, "NOVO.md"), "# novo\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "depois da tag"]);
    return exige(corre(dir), { codigo: 1, exclui: ["nao ha upgrade a simular", "nao ha tags acessiveis"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Este script e COPIADO para todos os projetos derivados. La, "a ultima tag antes do HEAD"
// sao as releases DESSE projeto — mediria projeto-v1 -> projeto-v2. Pior que inutil: media
// uma coisa a fingir que media outra. Sai 0 com a razao VISIVEL.
test("num projeto derivado (com marca), da SKIP visivel e sai 0", () => {
  const dir = repo({ comMarca: true, comTag: "v1.0.0" });
  try {
    return exige(corre(dir), { codigo: 0, inclui: ["SKIP", "e um projeto derivado, nao o template"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// O outro sinal do mesmo facto: o bootstrap manda apagar o `BOOTSTRAP.md`. Qualquer um dos
// dois basta — olhar so para um deixava metade dos derivados a correr a simulacao errada.
test("sem BOOTSTRAP.md (o outro sinal de derivado), tambem da SKIP", () => {
  const dir = repo({ semBootstrap: true, comTag: "v1.0.0" });
  try {
    return exige(corre(dir), { codigo: 0, inclui: ["SKIP", "e um projeto derivado"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- O motor mecanico: e aqui que um erro custa DADOS -----------------------------

/** Monta um par (template de ontem -> template de hoje) + o consumidor que saiu do primeiro.
 *  `ontem` e o conteudo na tag; `hoje` o que o template tem agora; `consumidor` o que o
 *  projeto tem (por omissao, igual ao de ontem — ou seja, intacto). */
/** O minimo que o motor exige de qualquer template: as pastas que ele copia por inteiro e os
 *  dois ficheiros de anti-padroes (o cabecalho de um deles e trazido, e a divisao e pelo `---`).
 *  Sem esta base, cada caso rebentava num `fatal` que nada tinha a ver com o que media. */
const BASE = {
  ".agent/scripts/x.mjs": "// script\n",
  ".claude/hooks/h.mjs": "// hook\n",
  ".agent/rules/anti-patterns-template.md": "# Template\n\n## TP1 — um\n",
  // O ID e MONTADO: escrito por extenso, este ficheiro passava a CITAR um anti-padrao que o
  // template nu nao define, e o Guard 15 reprovava o repo. E a convencao do
  // `tests-anti-patterns.mjs`, e foi o guard que a exigiu aqui tambem.
  ".agent/rules/anti-patterns.md": `# Projeto\n\n> cabecalho\n\n---\n\n## ${"AP" + "1"} — meu\n`,
};

function cenario({ ontem, hoje, consumidor = null, constantes = [] }) {
  ontem = { ...BASE, ...ontem };
  hoje = { ...BASE, ...hoje };
  if (consumidor) consumidor = { ...BASE, ...consumidor };
  const root = mkdtempSync(join(tmpdir(), "sim-up-root-"));
  for (const [rel, c] of Object.entries(ontem)) {
    if (c === null) continue; // `null` = este ficheiro NAO existe, e e isso que se mede
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), c);
  }
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "ontem"]);
  git(root, ["tag", "v1.0.0"]);
  for (const [rel, c] of Object.entries(hoje)) {
    if (c === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), c);
  }

  const dir = mkdtempSync(join(tmpdir(), "sim-up-cons-"));
  for (const [rel, c] of Object.entries(consumidor ?? ontem)) {
    if (c === null) continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), c);
  }
  mkdirSync(join(dir, ".agent", "context"), { recursive: true });
  writeFileSync(join(dir, ".agent/context/session.md"), "# estado do projeto\n");

  const razoes = [];
  const medido = aplicaUpgradeMecanico({
    dir,
    root,
    tag: "v1.0.0",
    fatal: (m) => {
      // A razao VAI na excepcao. Sem isto, um caso que rebentasse dizia so "__fatal__" e
      // obrigava a instrumentar o motor para se perceber porque — foi o que aconteceu.
      razoes.push(m);
      throw new Error(`__fatal__: ${m}`);
    },
    substituto: "Consumidor",
    constantes,
  });
  return { dir, root, medido, razoes, ler: (rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : null) };
}

const limpa = (c) => {
  for (const d of [c?.dir, c?.root]) if (d) rmSync(d, { recursive: true, force: true });
};

// A regra geral do `/upgrade`, na sua forma mais simples: intacto -> traz-se o novo.
test("documento NAO customizado fica com a versao nova", () => {
  let c;
  try {
    c = cenario({
      ontem: { ".agent/rules/guia.md": "# guia velho\n" },
      hoje: { ".agent/rules/guia.md": "# guia novo\n" },
    });
    const v = c.ler(".agent/rules/guia.md");
    return v === "# guia novo\n" ? [] : [`ficou ${JSON.stringify(v)}, esperado o novo`];
  } finally {
    limpa(c);
  }
});

// O CONTRA-CASO, e e ele que faz a regra valer alguma coisa: se um simulador trouxesse tudo,
// o teste de cima passava na mesma e nada media a diferenca entre customizado e intacto.
test("documento CUSTOMIZADO fica com a versao do projeto", () => {
  let c;
  try {
    c = cenario({
      ontem: { ".agent/rules/guia.md": "# guia velho\n" },
      hoje: { ".agent/rules/guia.md": "# guia novo\n" },
      consumidor: { ".agent/rules/guia.md": "# guia velho\n\nnotas minhas\n" },
    });
    const v = c.ler(".agent/rules/guia.md");
    return v?.includes("notas minhas") ? [] : [`ficou ${JSON.stringify(v)}, devia manter as notas do projeto`];
  } finally {
    limpa(c);
  }
});

// `.agent/context/` e o estado do projeto e nao existe em mais sitio nenhum. A primeira frase
// da Fase 0 do `/upgrade` e sobre isto.
test("`.agent/context/` nao e tocado", () => {
  let c;
  try {
    c = cenario({ ontem: { ".agent/rules/guia.md": "# v\n" }, hoje: { ".agent/rules/guia.md": "# n\n" } });
    const v = c.ler(".agent/context/session.md");
    return v === "# estado do projeto\n" ? [] : [`o contexto do projeto foi alterado: ${JSON.stringify(v)}`];
  } finally {
    limpa(c);
  }
});

// Uma constante CUSTOMIZADA e conteudo do projeto: sobrevive a copia do ficheiro.
test("constante customizada e preservada por cima do ficheiro novo", () => {
  let c;
  try {
    const velho = "const A = {\n  x: 1,\n};\n// resto velho\n";
    c = cenario({
      ontem: { ".agent/scripts/s.mjs": velho },
      hoje: { ".agent/scripts/s.mjs": "const A = {\n  x: 1,\n};\n// resto NOVO\n" },
      consumidor: { ".agent/scripts/s.mjs": "const A = {\n  x: 99,\n};\n// resto velho\n" },
      constantes: [[".agent/scripts/s.mjs", "A"]],
    });
    const v = c.ler(".agent/scripts/s.mjs");
    const p = [];
    if (!v?.includes("x: 99")) p.push("perdeu a constante customizada do projeto");
    if (!v?.includes("resto NOVO")) p.push("nao trouxe o resto do ficheiro novo");
    if (c.medido.repostas !== 1) p.push(`repostas=${c.medido.repostas}, esperado 1`);
    return p;
  } finally {
    limpa(c);
  }
});

// E o contra-caso: uma constante INTACTA nao se preserva — preserva-la era congelar prosa
// velha do template, e foi assim que citacoes que uma renomeacao matou voltaram a aparecer.
test("constante INTACTA fica com a versao nova (nao se congela prosa velha)", () => {
  let c;
  try {
    const igual = "const A = {\n  x: 1,\n};\n";
    c = cenario({
      ontem: { ".agent/scripts/s.mjs": igual + "// velho\n" },
      hoje: { ".agent/scripts/s.mjs": "const A = {\n  x: 2,\n};\n// novo\n" },
      constantes: [[".agent/scripts/s.mjs", "A"]],
    });
    const v = c.ler(".agent/scripts/s.mjs");
    const p = [];
    if (!v?.includes("x: 2")) p.push("devia ficar com a constante nova");
    if (c.medido.repostas !== 0) p.push(`repostas=${c.medido.repostas}, esperado 0`);
    return p;
  } finally {
    limpa(c);
  }
});

// A tabela do `/upgrade` manda preservar constantes por nome. Se uma delas sair do ficheiro,
// a instrucao passa a ser impossivel de cumprir — e um consumidor seguia-a as cegas.
test("constante que desapareceu do template REPROVA, em vez de ignorar", () => {
  let c;
  try {
    c = cenario({
      ontem: { ".agent/scripts/s.mjs": "const A = {\n  x: 1,\n};\n" },
      hoje: { ".agent/scripts/s.mjs": "// a constante saiu daqui\n" },
      constantes: [[".agent/scripts/s.mjs", "A"]],
    });
    return ["devia ter reprovado"];
  } catch (err) {
    if (!err.message.startsWith("__fatal__")) return [`rebentou por outra razao: ${err.message}`];
    return [];
  } finally {
    limpa(c);
  }
});

// --- O simulador de ponta a ponta, sobre um template SINTETICO --------------------
// Os casos de cima saem cedo, nos guardas. Estes montam um template completo o bastante para
// o simulador correr ate ao fim — e e so assim que os seus proprios caminhos de recusa (a
// customizacao da fixture, a derivacao dos comandos, a adaptacao do Guard 17) ficam medidos.
// A varredura de mutacao apontou-os um a um como nao cobertos; nenhum apareceu numa leitura.

/** Um template minimo mas COMPLETO: tem tudo o que o simulador toca. As constantes adaptaveis
 *  estao ca todas porque o motor as procura pelo nome e para se faltar uma — de proposito. */
function templateSintetico(extra = {}) {
  const constantes = {
    ".agent/scripts/check-bundle-sizes.mjs": 'const TARGETS = {\n  "/": { name: "Home", target: 160, alarm: 180 },\n};\n',
    ".agent/scripts/check-doc-versions.mjs": "const BANNED = [\n];\n",
    ".agent/scripts/guards/versions.mjs": "const CHECKS = [\n];\n",
    ".agent/scripts/check-test-surface.mjs": "const TEST_GLOBS = [\n];\nconst CONFIG_GLOBS = [\n];\n",
    ".agent/scripts/surface-patterns.mjs": "const CONTAGENS = [\n];\n",
    ".agent/scripts/guards/sizes.mjs": "export const TETOS = {\n};\n",
  };
  return {
    ".agent/BOOTSTRAP.md": "# Bootstrap\n\n### 2.2 Ficheiros a GERAR\n\n| `.agent/rules/business-logic.md` |\n\n### 2.3 Outra\n",
    ".github/workflows/ci.yml": "jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/stub.mjs\n",
    ".agent/scripts/stub.mjs": 'console.log("  1 passaram, 0 falharam.");\n',
    ".claude/hooks/h.mjs": "// hook\n",
    ".agent/context/session.md": "# estado\n",
    ".agent/rules/anti-patterns-template.md": "# Template\n\n## TP1 — um\n",
    ".agent/rules/anti-patterns.md": `# Projeto\n\n> cabecalho\n\n---\n\n## ${"AP" + "1"} — meu\n`,
    ...constantes,
    ...extra,
  };
}

/** Monta um repo com esse template, tagado, e corre o SIMULADOR la dentro. */
function pontaAPonta(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sim-up-e2e-"));
  for (const [rel, c] of Object.entries(templateSintetico(extra))) {
    if (c === null) continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), c);
  }
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t"]);
  git(dir, ["config", "user.name", "t"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "ontem"]);
  git(dir, ["tag", "v1.0.0"]);
  writeFileSync(join(dir, "NOVO.md"), "# ha delta\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "hoje"]);
  return { dir, ...corre(dir) };
}

// O archive vazio: a tag aponta para um commit sem ficheiros nenhuns, e o template so aparece
// depois dela. E a unica forma de chegar a esse caminho sem partir o git de proposito.
test("tag cujo archive sai VAZIO, REPROVA", () => {
  const dir = mkdtempSync(join(tmpdir(), "sim-up-vazio-"));
  try {
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["config", "user.email", "t@t"]);
    git(dir, ["config", "user.name", "t"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "vazio"]);
    git(dir, ["tag", "v1.0.0"]);
    for (const [rel, c] of Object.entries(templateSintetico())) {
      if (c === null) continue;
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), c);
    }
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "so depois da tag"]);
    return exige(corre(dir), { codigo: 1, inclui: ["o archive saiu vazio"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("template sintetico completo: o simulador corre ate ao fim", () => {
  const r = pontaAPonta();
  try {
    return exige(r, { codigo: 0, inclui: ["FASE 2", "verificado"] });
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});

// Cada um destes desliga uma peca que o simulador PRECISA, e exige que ele pare a dizer o que
// falta — em vez de seguir e dar um veredicto sobre uma simulacao incompleta.
for (const [nome, extra, marca] of [
  ["sem o ficheiro onde a fixture customiza uma constante", { ".agent/scripts/check-bundle-sizes.mjs": null }, "nao representa um consumidor"],
  ["com a constante da fixture noutra forma", { ".agent/scripts/check-bundle-sizes.mjs": "const TARGETS = [];\n" }, "a forma da constante mudou"],
  ["sem job `guard-tests` no ci.yml", { ".github/workflows/ci.yml": "jobs:\n  outro:\n    steps: []\n" }, "nao derivei nenhum comando"],
  ["sem o guard dos tamanhos", { ".agent/scripts/guards/sizes.mjs": null }, "nao consigo aplicar a adaptacao"],
  ["sem `.agent/context/`", { ".agent/context/session.md": null }, "nao existe na copia"],
  ["sem a seccao 2.2 no BOOTSTRAP.md", { ".agent/BOOTSTRAP.md": "# Bootstrap\n\nsem a seccao\n" }, "nao derivei nenhuma rule gerada"],
  ["sem `anti-patterns.md` na tag", { ".agent/rules/anti-patterns.md": null }, "nao representa um consumidor"],
]) {
  test(`${nome}, REPROVA`, () => {
    const r = pontaAPonta(extra);
    try {
      return exige(r, { codigo: 1, inclui: [marca] });
    } finally {
      rmSync(r.dir, { recursive: true, force: true });
    }
  });
}

// --- O que o motor NAO consegue fazer tem de PARAR tudo -------------------------
// Estes tres sitios sairam da varredura de mutacao como nao cobertos: desliga-los deixava a
// suite verde. Um `fatal()` que ninguem nota e um caminho de recusa que nao recusa — e este
// modulo escreve por cima dos ficheiros de um consumidor, logo o custo nao e um aviso.

/** Corre o motor com uma BASE a que falta um ficheiro, e exige que pare. */
const exigeFatal = (base, marca) => {
  let c;
  try {
    c = cenario({ ontem: base, hoje: base });
    return [`devia ter reprovado (${marca})`];
  } catch (err) {
    if (!err.message.startsWith("__fatal__")) return [`rebentou por outra razao: ${err.message}`];
    return err.message.includes(marca) ? [] : [`reprovou por outra coisa: ${err.message}`];
  } finally {
    limpa(c);
  }
};

test("pasta que o upgrade copia por inteiro em falta, REPROVA", () =>
  exigeFatal({ ".claude/hooks/h.mjs": null, ".agent/scripts/x.mjs": "// x\n" }, "nada a trazer"));

test("catalogo de anti-padroes do template em falta, REPROVA", () =>
  exigeFatal({ ".agent/rules/anti-patterns-template.md": null }, "anti-patterns-template.md"));

test("`anti-patterns.md` sem o separador `---`, REPROVA em vez de adivinhar", () =>
  exigeFatal({ ".agent/rules/anti-patterns.md": "# Projeto\n\nsem separador\n" }, "separador"));

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  console.log("\n  Um simulador que falhe ABERTO da por verificada a metade do produto que ninguem mede.\n");
  process.exit(1);
}
console.log("\n  Todos os testes do simulador de /upgrade passaram.\n");
process.exit(0);
