/**
 * Testes do Guard 22 (os runners do CI do template num so rotulo fixo, #488) — {{PROJECT_NAME}}
 *
 * Espelha `guards/runners.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco e chama `registar()`.
 *
 * Cada regra com os DOIS lados: o caso que reprova (um `-latest`, outro rotulo, num workflow ou num exemplo) e o
 * vizinho que NAO pode reprovar (o rotulo fixo entre aspas, ou com um comentario a seguir). E os dois SKIP/WARN que o
 * verificador completo nao alcanca (um derivado; nenhum `runs-on:`), chamados diretamente.
 */
import { pathToFileURL } from "url";
import { test, writeF, registarResultado } from "./harness/test-harness.mjs";
import { guardRunners, RUNNER, runsOnDe } from "../guards/runners.mjs";
import { correDireto } from "./harness/guard-direto.mjs";
// O guard so corre no TEMPLATE: num derivado (o `simulate-derived` corre esta suite la) a sandbox passa a template antes.
import { comoTemplate } from "./harness/projeto-derivado.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-runners.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-guards.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** A sandbox no estado de template, e os ficheiros `{ rel: conteudo }` escritos nela. */
const noTemplate = (ficheiros = {}) => (dir) => {
  comoTemplate(dir);
  for (const [rel, c] of Object.entries(ficheiros)) writeF(dir, rel, c);
};

const job = (runsOn) => `name: x\non: push\njobs:\n  a:\n    runs-on: ${runsOn}\n    steps:\n      - run: echo ok\n`;

/** Um exemplo dos derivados com o job `guard-tests` COMENTADO (como o `ci-sem-maquinaria.yml`, #534): com os marcadores
 *  `MODO COMPLETO (b)`, ou sem eles (`comBloco: false`). O `runs-on:` comentado fica na linha 10. */
const exemplo = (rotulo, { comBloco = true } = {}) =>
  `name: x\non: push\njobs:\n  ci:\n    runs-on: ${RUNNER}\n    steps:\n      - run: echo ok\n` +
  `${comBloco ? "  # --- MODO COMPLETO (b) inicio: o job da maquinaria" : "  # um job opcional"}\n` +
  `  # guard-tests:\n  #   runs-on: ${rotulo}\n` +
  `${comBloco ? "  # --- MODO COMPLETO (b) fim ---" : "  # fim"}\n`;

export function registar() {
  // --- O estado limpo do repo ------------------------------------------------
  // A fixture nao copia os workflows: sem eles salta (visivel); com um no rotulo fixo, passa e di-lo.
  test("G22: sem workflows na fixture salta, com SKIP visivel", noTemplate(), { code: 0, includes: ["SKIP  Guard 22 (runner fixo) — sem workflows"] });
  test("G22: um workflow no rotulo fixo passa", noTemplate({ ".github/workflows/bom.yml": job(RUNNER) }), { code: 0, includes: [`Guard 22: 1 \`runs-on:\`, todos em ${RUNNER}`] });

  // --- Reprova -----------------------------------------------------------------
  test("G22: um workflow com ubuntu-latest reprova", noTemplate({ ".github/workflows/novo.yml": job("ubuntu-latest") }), {
    code: 1,
    includes: [".github/workflows/novo.yml:5", "`runs-on: ubuntu-latest`", `o rotulo fixo do template e \`${RUNNER}\``],
  });
  test("G22: um rotulo fixo DIFERENTE reprova (o meio-termo de uma subida a meio)", noTemplate({ ".github/workflows/novo.yml": job("ubuntu-22.04") }), {
    code: 1,
    includes: ["`runs-on: ubuntu-22.04`"],
  });
  test("G22: um exemplo dos derivados com ubuntu-latest tambem reprova", noTemplate({ "src/docs/exemplos/novo.yml": job("ubuntu-latest") }), {
    code: 1,
    includes: ["src/docs/exemplos/novo.yml:5"],
  });
  // #534: o `runs-on:` comentado DENTRO de um bloco MODO COMPLETO e o que um derivado privado descomenta.
  test("G22: um runs-on COMENTADO dentro de um bloco MODO COMPLETO de um exemplo reprova, com a linha do ficheiro (#534)", noTemplate({ "src/docs/exemplos/novo.yml": exemplo("ubuntu-latest") }), {
    code: 1,
    includes: ["src/docs/exemplos/novo.yml:10", "`runs-on: ubuntu-latest`"],
  });
  test("G22: CONTROLO — o mesmo comentario FORA de um bloco MODO COMPLETO nao conta (#534)", noTemplate({ "src/docs/exemplos/novo.yml": exemplo("ubuntu-latest", { comBloco: false }) }), {
    code: 0,
    includes: [`Guard 22: 1 \`runs-on:\`, todos em ${RUNNER}`],
  });
  test("G22: CONTROLO — dentro do bloco, o rotulo fixo passa e conta (#534)", noTemplate({ "src/docs/exemplos/novo.yml": exemplo(RUNNER) }), {
    code: 0,
    includes: [`Guard 22: 2 \`runs-on:\`, todos em ${RUNNER}`],
  });
  test("G22: CONTROLO — um workflow (nao um exemplo) com o bloco comentado nao o le (#534)", noTemplate({ ".github/workflows/novo.yml": exemplo("ubuntu-latest") }), {
    code: 0,
    includes: [`Guard 22: 1 \`runs-on:\`, todos em ${RUNNER}`],
  });
  test("G22: a extensao .yaml tambem se le", noTemplate({ ".github/workflows/novo.yaml": job("ubuntu-latest") }), {
    code: 1,
    includes: [".github/workflows/novo.yaml:5"],
  });

  // --- O vizinho que NAO pode reprovar ---------------------------------------------
  test("G22: o rotulo fixo entre aspas, ou com um comentario a seguir, passa", noTemplate({ ".github/workflows/aspas.yml": job(`"${RUNNER}"`), ".github/workflows/comentario.yml": job(`${RUNNER}  # fixo`) }), { code: 0, includes: [`todos em ${RUNNER}`] });

  // --- O que o verificador completo nao alcanca -------------------------------------
  const derivado = correDireto(guardRunners, { ehDerivado: () => true, listDir: () => ["ci"], read: () => job("ubuntu-latest") });
  registarResultado("G22: num derivado salta, com SKIP visivel, mesmo com um ubuntu-latest", derivado.includes("SKIP  Guard 22") && !derivado.includes("WARN") ? [] : [`saiu: ${derivado}`]);
  // #524: numa ADOCAO em curso (o manifesto existe, a marca ainda nao), so os ficheiros que o manifesto diz que vieram do
  // template se verificam. O controlo e o mesmo sem o manifesto (o template), que reprova.
  // O disco de uma adocao real: o `ci.yml` do projeto (com o runner dele) e um exemplo que veio do template.
  const comManifesto = (manifesto) =>
    correDireto(guardRunners, {
      ehDerivado: () => false,
      read: (f) => (f === ".agent/adocao.json" ? manifesto : f.startsWith("src/docs/exemplos/") ? job(RUNNER) : job("ubuntu-latest")),
      listDir: (p, ext) => (ext !== ".yml" ? null : p === ".github/workflows" ? ["ci"] : p === "src/docs/exemplos" ? ["ex"] : null),
    });
  const adocao = comManifesto(JSON.stringify({ estado: "a copiar", copiados: [".agent/BOOTSTRAP.md", "src/docs/exemplos/ex.yml"], colisoes: [".github/workflows/ci.yml"], iguais: [], perguntar: [] }));
  registarResultado("G22: numa adocao, o workflow do PROJETO (nao listado) fica de fora, e o exemplo que veio do template verifica-se (#524, #534)", !adocao.includes("WARN") && adocao.includes(`Guard 22: 1 \`runs-on:\`, todos em ${RUNNER}`) ? [] : [`saiu: ${adocao}`]);
  // #534: um manifesto que nao lista nada do disco nao e uma adocao real (nela, os exemplos vem sempre do template).
  const vazio = comManifesto(JSON.stringify({ estado: "completo", copiados: [], colisoes: [], iguais: [], perguntar: [] }));
  registarResultado("G22: um adocao.json que nao lista nenhum workflow nem exemplo do disco avisa, em vez de SKIP (#534)", vazio.includes("WARN") && vazio.includes("nao lista nenhum workflow nem exemplo") && !vazio.includes("SKIP") ? [] : [`saiu: ${vazio}`]);
  const doTpl = comManifesto(JSON.stringify({ copiados: [".github/workflows/ci.yml"], iguais: [] }));
  registarResultado("G22: numa adocao, um workflow que VEIO do template verifica-se, e o ubuntu-latest reprova (#524)", doTpl.includes("WARN") && doTpl.includes(".github/workflows/ci.yml") ? [] : [`saiu: ${doTpl}`]);
  const ilegivel = comManifesto("{}");
  registarResultado("G22: um adocao.json ilegivel (ou esquecido, sem as listas) avisa, em vez de desligar o guard (#524)", ilegivel.includes("WARN") && ilegivel.includes("adocao.json` e ilegivel") && !ilegivel.includes("SKIP") ? [] : [`saiu: ${ilegivel}`]);
  const semAdocao = correDireto(guardRunners, {
    ehDerivado: () => false,
    read: (f) => (f === ".agent/adocao.json" ? null : job("ubuntu-latest")),
    listDir: (p, ext) => (p === ".github/workflows" && ext === ".yml" ? ["ci"] : null),
  });
  registarResultado("G22: controlo — o mesmo sem o manifesto da adocao reprova (#524)", semAdocao.includes("WARN") ? [] : [`saiu: ${semAdocao}`]);
  const semRunsOn = correDireto(guardRunners, { ehDerivado: () => false, listDir: (p, ext) => (p === ".github/workflows" && ext === ".yml" ? ["ci"] : null), read: (f) => (f === ".agent/adocao.json" ? null : "jobs: {}\n") });
  // Um workflow que so chama outros (`uses:` no job) nao tem `runs-on:`: salta, e di-lo (nao "estao todos certos", TP2).
  registarResultado("G22: workflows sem nenhum runs-on saltam com SKIP visivel, sem avisar", semRunsOn.includes("SKIP  Guard 22 (runner fixo) — 1 workflow(s) e nenhum `runs-on:`") && !semRunsOn.includes("WARN") ? [] : [`saiu: ${semRunsOn}`]);
  // O leitor: o valor sem aspas e sem o comentario; uma linha que so menciona `runs-on` noutro sitio nao conta.
  const lidos = runsOnDe(`a:\n  runs-on: 'ubuntu-24.04' # x\n  # runs-on: ubuntu-latest (comentado)\n  name: runs-on: nao\n`);
  registarResultado("G22: o leitor tira as aspas e o comentario", lidos.length === 1 && lidos[0].valor === "ubuntu-24.04" && lidos[0].linha === 2 ? [] : [`leu: ${JSON.stringify(lidos)}`]);
  // #534: com `modoCompleto`, o comentado dentro de um bloco le-se; depois do `fim`, volta a nao contar.
  const blocos = runsOnDe(`a:\n  # --- MODO COMPLETO (b) inicio\n  #   runs-on: x-dentro\n  # --- MODO COMPLETO (b) fim ---\n  # runs-on: x-depois\n`, { modoCompleto: true });
  registarResultado("G22: o leitor com modoCompleto le o bloco e para no fim (#534)", blocos.length === 1 && blocos[0].valor === "x-dentro" && blocos[0].linha === 3 ? [] : [`leu: ${JSON.stringify(blocos)}`]);
}
