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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { CONSTANTES_DO_PROJETO } from "./lib/upgrade-mecanico.mjs";
// Os construtores de fixture vivem no harness: a suite passou as 500 linhas e a catraca do
// Guard 17 exigiu a divisao antes de a deixar crescer mais. Ver `test-upgrade-harness.mjs`.
import { git, repo, corre, exige, BASE, cenario, limpa, templateSintetico } from "./test-upgrade-harness.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SIMULADOR = resolve(AQUI, "simulate-upgrade.mjs");

/** O par (ficheiro, constante) que o simulador customiza na fixture — DERIVADO da mesma lista
 *  que ele usa. Escrito a mao aqui e la, os dois lados tinham de concordar sem nada a
 *  verifica-lo, e deixaram de concordar assim que uma constante mudou de ficheiro. */
const CONST_FIXTURE = CONSTANTES_DO_PROJETO[0];

let passed = 0;
const falhas = [];

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

// A DECISAO do projeto sobrevive a travessia. Nao e um caso qualquer de constante preservada:
// e O caso, porque foi este valor que se perdeu numa ronda de `/upgrade` real — o ficheiro veio,
// a constante voltou ao default, e o gate dos bundles passou a reprovar **sem ninguem decidir
// nada**, com o verificador a correr e a medir bem.
//
// A verificacao que o consumidor tinha era por DIFERENCA de output e nao o apanhou: nenhuma
// linha desapareceu, o veredicto e que mudou. Diferenca de output apanha o que some; nao apanha
// um default que regressa. Por isso isto e um teste e nao uma linha numa tabela: acrescentar a
// constante a lista das preservadas prova que alguem a escreveu la, nao que ela sobrevive.
// O INVARIANTE MUDOU, e a mudanca e o ponto: antes afirmava-se que o `ALVOS_REPROVAM` estava
// na lista das constantes preservadas. Agora ele vive em `config/bundles.mjs`, e o que tem de
// ser verdade e mais forte — **o upgrade nunca SUBSTITUI a pasta de configuracao**.
//
// Uma lista de nomes a preservar envelhece a cada decisao nova que alguem acrescente e se
// esqueca de inscrever. Uma pasta que o upgrade nao substitui nao envelhece.
//
// "Nunca substitui" e nao "nunca toca": a primeira versao desta regra excluia a pasta por
// inteiro, e a simulacao contra a tag real reprovou — um consumidor anterior a `config/` existir
// recebia o `check-bundle-sizes.mjs` novo, que a IMPORTA, sem o ficheiro importado. O par de
// testes abaixo mede as duas direccoes, porque uma sozinha deixa passar a outra.
test("o upgrade NAO substitui a configuracao do projeto", () => {
  let c;
  try {
    const cfg = ".agent/scripts/config/bundles.mjs";
    c = cenario({
      ontem: { [cfg]: "export const ALVOS_REPROVAM = true;\n" },
      // O template mudou a sua config — e mesmo assim a do consumidor fica.
      hoje: { [cfg]: "export const ALVOS_REPROVAM = true;\nexport const NOVIDADE = 1;\n" },
      consumidor: { [cfg]: "export const ALVOS_REPROVAM = false;\n" },
    });
    const v = c.ler(cfg);
    const p = [];
    if (!/ALVOS_REPROVAM = false/.test(v ?? "")) p.push("a decisao do projeto foi atropelada pelo upgrade");
    if ((v ?? "").includes("NOVIDADE")) p.push("o upgrade escreveu por cima da config — devia nao lhe tocar");
    return p;
  } finally {
    limpa(c);
  }
});

// A OUTRA METADE, e a que o CI apanhou quando este par ainda era so a de cima. Um consumidor
// tirado de uma tag anterior a `config/` existir NAO a tem — e todos os projetos derivados
// estao nesse caso na ronda em que ela nasce.
//
// Se o upgrade a saltasse por "e do projeto", trazia o `check-bundle-sizes.mjs` novo (que faz
// `import ... from "./config/bundles.mjs"`) SEM o ficheiro importado, e o verificador rebentava
// no arranque. Proteger a configuracao partindo o consumidor nao e proteger nada.
test("consumidor SEM config/ recebe-a (senao fica com logica que importa o que nao existe)", () => {
  let c;
  try {
    const cfg = ".agent/scripts/config/bundles.mjs";
    c = cenario({
      ontem: { [cfg]: null }, // a tag de onde o projeto saiu ainda nao tinha a pasta
      hoje: { [cfg]: "export const ALVOS_REPROVAM = true;\n" },
      consumidor: { [cfg]: null },
    });
    const v = c.ler(cfg);
    return v === null ? ["o upgrade nao trouxe a config — o verificador novo fica sem o que importa"] : [];
  } finally {
    limpa(c);
  }
});

// E o caso que a exclusao-da-pasta-inteira tambem partia, e que nenhuma das duas de cima apanha:
// o consumidor JA tem a pasta, e o template acrescenta-lhe um ficheiro NOVO. Saltar a pasta por
// ela existir deixava o ficheiro novo de fora para sempre.
test("ficheiro NOVO dentro de config/ chega a um consumidor que ja tem a pasta", () => {
  let c;
  try {
    const cfg = ".agent/scripts/config/bundles.mjs";
    const novo = ".agent/scripts/config/rotas.mjs";
    c = cenario({
      ontem: { [cfg]: "export const ALVOS_REPROVAM = true;\n", [novo]: null },
      hoje: { [cfg]: "export const ALVOS_REPROVAM = true;\n", [novo]: "export const ROTAS = [];\n" },
      consumidor: { [cfg]: "export const ALVOS_REPROVAM = false;\n", [novo]: null },
    });
    const p = [];
    if (c.ler(novo) === null) p.push("o ficheiro novo de config/ nao chegou");
    if (!/ALVOS_REPROVAM = false/.test(c.ler(cfg) ?? "")) p.push("e a decisao existente foi atropelada");
    return p;
  } finally {
    limpa(c);
  }
});

test("a DECISAO do projeto (gate suspenso) sobrevive ao upgrade", () => {
  let c;
  try {
    const rel = ".agent/scripts/check-bundle-sizes.mjs";
    c = cenario({
      ontem: { [rel]: "const ALVOS_REPROVAM = true;\n// motor velho\n" },
      hoje: { [rel]: "const ALVOS_REPROVAM = true;\n// motor NOVO\n" },
      // O consumidor SUSPENDEU o gate. E a posicao que ele toma ao ligar a medicao a serio.
      consumidor: { [rel]: "const ALVOS_REPROVAM = false;\n// motor velho\n" },
      constantes: [[rel, "ALVOS_REPROVAM"]],
    });
    const v = c.ler(rel);
    const p = [];
    if (!/const ALVOS_REPROVAM = false;/.test(v ?? "")) p.push("a suspensao perdeu-se: o upgrade repos o default");
    if (!(v ?? "").includes("motor NOVO")) p.push("nao trouxe o motor novo — a logica tem de vir");
    return p;
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

// Os casos de recusa aqui em cima passavam TODOS — e deixavam oito diretorios temporarios por
// corrida para tras, cada um com um repo `git init` dentro. O chamador escreve
// `let c; try { c = cenario(...) } finally { limpa(c) }`, e quando o `cenario` lanca, o `c`
// ainda e `undefined`: o `finally` corre e nao limpa nada. Um teste verde a sujar a maquina.
//
// Chegou a 1621 diretorios (4,1 GB) antes de alguem reparar, e o efeito nao era so disco: o
// indexador do macOS percorria-os e as medicoes de tempo DESTA suite saiam 3x infladas — uma
// fuga de recursos que falsificava as proprias medicoes que iam decidir se valia a pena
// optimizar. Nenhuma leitura do teste a denunciava, porque o sintoma esta fora do processo.
test("um cenario que REBENTA nao deixa diretorios temporarios para tras", () => {
  // A pasta e SO deste teste. Contar `sim-up-*` no `tmpdir()` do sistema media o estado da
  // maquina (`TP3`) e ficava vermelho por causa de qualquer outra corrida em paralelo.
  const base = mkdtempSync(join(tmpdir(), "sim-up-fuga-"));
  try {
    try {
      cenario({
        ontem: { ".agent/scripts/s.mjs": "const A = {\n  x: 1,\n};\n" },
        hoje: { ".agent/scripts/s.mjs": "// a constante saiu daqui\n" },
        constantes: [[".agent/scripts/s.mjs", "A"]],
        base,
      });
      return ["o cenario devia ter rebentado — sem isso este teste nao mede nada"];
    } catch (err) {
      if (!err.message.startsWith("__fatal__")) return [`rebentou por outra razao: ${err.message}`];
    }
    const restos = readdirSync(base);
    return restos.length === 0 ? [] : [`ficaram ${restos.length} diretorio(s) para tras: ${restos.join(", ")}`];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// --- O simulador de ponta a ponta, sobre um template SINTETICO --------------------
// Os casos de cima saem cedo, nos guardas. Estes montam um template completo o bastante para
// o simulador correr ate ao fim — e e so assim que os seus proprios caminhos de recusa (a
// customizacao da fixture, a derivacao dos comandos, a adaptacao do Guard 17) ficam medidos.
// A varredura de mutacao apontou-os um a um como nao cobertos; nenhum apareceu numa leitura.


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
  // QUAL ficheiro e QUAL constante vem de `CONSTANTES_DO_PROJETO`, como no simulador. Cravados
  // aqui, estes dois casos passavam a medir um ficheiro que a fixture ja nao customiza — e a
  // reprovar por outra razao que nao a que dizem no nome. Foi o que aconteceu do outro lado.
  [
    "sem o ficheiro onde a fixture customiza uma constante",
    { [CONST_FIXTURE[0]]: null },
    "nao representa um consumidor",
  ],
  [
    "com a constante da fixture noutra forma",
    // Sem o `=` na forma que o simulador procura, a customizacao nao aplica e ele tem de parar.
    { [CONST_FIXTURE[0]]: `const ${CONST_FIXTURE[1]} = [];\n` },
    "a forma da constante mudou",
  ],
  ["sem job `guard-tests` no ci.yml", { ".github/workflows/ci.yml": "jobs:\n  outro:\n    steps: []\n" }, "nao derivei nenhum comando"],
  ["sem o guard dos tamanhos", { ".agent/scripts/guards/sizes.mjs": null }, "nao consigo aplicar a adaptacao"],
  ["sem `.agent/context/`", { ".agent/context/session.md": null }, "nao existe na copia"],
  // O gate suspenso e a DECISAO do projeto: se a fixture nao a conseguir montar, a simulacao
  // deixa de exercitar a travessia que interessa — e passava a verde a afirmar menos. A
  // varredura apontou este `fatal()` como nao coberto.
  ["com o gate dos bundles noutra forma", { ".agent/scripts/config/bundles.mjs": "export const ALVOS_REPROVAM = 1;\n" }, "nao consegui suspender o gate"],
  // A AUSENCIA da config NAO entra nesta lista, e saiu dela de proposito: um consumidor tirado
  // de uma tag anterior a `config/` existir nao a tem, e esse e o caso real mais importante, nao
  // uma fixture partida. A fixture passa a escreve-la; o que ela mede esta nos dois testes
  // dedicados mais abaixo.
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
