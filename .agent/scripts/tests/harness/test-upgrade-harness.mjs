/**
 * Harness do simulador de `/upgrade` — {{PROJECT_NAME}}
 *
 * Os construtores de fixture do `test-simulate-upgrade.mjs`. **NAO e um entry point**: nao corre
 * testes, so os monta.
 *
 * PORQUE VIVE A PARTE: a suite passou as 500 linhas e foi congelada em `TETOS` — e a catraca
 * exigiu a divisao a proxima vez que ela cresceu ("Dividir antes de acrescentar"). Levantar o
 * teto para acomodar crescimento proprio esvazia a catraca; extrair e o que o `core-rules.md`
 * manda. E o mesmo padrao do `test-surface-harness.mjs`: um harness **importa-se**, nao precisa
 * de descoberta.
 *
 * E rende mais do que linhas: tres defeitos da ronda 4 viveram em construtores de fixture (que
 * nao mutavam nada, ou que liam o repo em vez de montarem o que queriam medir). Aqui podem ser
 * exercitados sem montar a simulacao inteira.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { aplicaUpgradeMecanico } from "../../lib/upgrade-mecanico.mjs";

// `AQUI` e agora `tests/harness/`; os ficheiros que este harness copia vivem na raiz de
// `.agent/scripts/`. Resolver a partir da RAIZ e nao da pasta do ficheiro evita que a proxima
// mudanca de sitio parta isto outra vez em silencio.
const AQUI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIMULADOR = resolve(AQUI, "simulate-upgrade.mjs");

export const git = (dir, args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** Um repo git minimo que passa o guarda "sou o template?": tem `BOOTSTRAP.md` e nao tem
 *  marca. O conteudo e o minimo para o simulador chegar ao passo que se quer medir. */
export function repo({ comTag = null, comMarca = false, semBootstrap = false } = {}) {
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
export function corre(dir) {
  mkdirSync(join(dir, ".agent", "scripts", "lib"), { recursive: true });
  mkdirSync(join(dir, ".agent", "scripts", "guards"), { recursive: true });
  for (const [de, para] of [
    [SIMULADOR, ".agent/scripts/simulate-upgrade.mjs"],
    [resolve(AQUI, "lib", "upgrade-mecanico.mjs"), ".agent/scripts/lib/upgrade-mecanico.mjs"],
    // O motor re-exporta o `leOuNull` de `lib/ficheiros.mjs` (a definicao vive la, uma vez).
    [resolve(AQUI, "lib", "ficheiros.mjs"), ".agent/scripts/lib/ficheiros.mjs"],
    [resolve(AQUI, "lib", "derivado.mjs"), ".agent/scripts/lib/derivado.mjs"],
  ]) {
    writeFileSync(join(dir, para), readFileSync(de, "utf8"));
  }
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, ".agent/scripts/simulate-upgrade.mjs")], { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

export const exige = ({ code, out }, { codigo, inclui = [], exclui = [] }) => {
  const p = [];
  if (code !== codigo) p.push(`exit ${code}, esperado ${codigo}`);
  for (const t of inclui) if (!out.includes(t)) p.push(`output devia conter ${JSON.stringify(t)}`);
  for (const t of exclui) if (out.includes(t)) p.push(`output NAO devia conter ${JSON.stringify(t)}`);
  if (p.length) p.push(`--- output ---\n${out.slice(0, 700)}`);
  return p;
};

console.log("\n=== Testes do simulador de /upgrade ===\n");
export const BASE = {
  ".agent/scripts/x.mjs": "// script\n",
  ".claude/hooks/h.mjs": "// hook\n",
  ".agent/rules/anti-patterns-template.md": "# Template\n\n## TP1 — um\n",
  // O ID e MONTADO: escrito por extenso, este ficheiro passava a CITAR um anti-padrao que o
  // template nu nao define, e o Guard 15 reprovava o repo. E a convencao do
  // `tests-anti-patterns.mjs`, e foi o guard que a exigiu aqui tambem.
  ".agent/rules/anti-patterns.md": `# Projeto\n\n> cabecalho\n\n---\n\n## ${"AP" + "1"} — meu\n`,
};

/** `base` e a pasta onde os dois tmpdirs nascem. Existe **so** para o teste da fuga poder medir
 *  "nao ficou nada para tras" numa pasta que e SO dele: contar `sim-up-*` no `tmpdir()` do
 *  sistema seria um teste a depender do estado da maquina (`TP3`) — qualquer outra corrida a
 *  acontecer ao mesmo tempo pintava-o de vermelho sem haver defeito nenhum. */
/** `tag` e a versao de onde o consumidor saiu. Parametrizavel porque ha um caminho de recusa que
 *  so se alcanca com uma tag que o `git` nao resolve — e sem ele a lista do que saiu do template
 *  sairia VAZIA, que se le como "nada saiu" (`TP2`). */
export function cenario({ ontem, hoje, consumidor = null, constantes = [], base = tmpdir(), tag = "v1.0.0" }) {
  ontem = { ...BASE, ...ontem };
  hoje = { ...BASE, ...hoje };
  if (consumidor) consumidor = { ...BASE, ...consumidor };
  const root = mkdtempSync(join(base, "sim-up-root-"));
  const dir = mkdtempSync(join(base, "sim-up-cons-"));
  try {
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
      if (c === null) {
        // `null` em `hoje` = o template JA NAO TEM este ficheiro. Tem de o APAGAR, nao so saltar a
        // escrita: o passo do `ontem` ja o pos no disco, e saltar deixava-o la. O comentario dizia
        // "nao existe" e o codigo fazia "nao sobrescreve" — duas coisas diferentes, e a diferenca
        // so aparece quando alguem tenta medir uma REMOCAO. Foi o que aconteceu.
        rmSync(join(root, rel), { force: true });
        continue;
      }
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), c);
    }

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
      tag,
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
  } catch (err) {
    // Os casos que medem uma RECUSA fazem o `fatal` lancar daqui de dentro. O chamador escreve
    // `let c; try { c = cenario(...) } finally { limpa(c) }` — e no throw o `c` ainda e
    // `undefined`, logo o `limpa` nao limpava nada. Quem criou os dois tmpdirs foi esta funcao,
    // logo e ela que os desfaz quando nao chega a entrega-los.
    //
    // Medido: 8 diretorios por corrida, 1621 acumulados (4,1 GB), cada um com um repo `git init`
    // dentro. Nao era so disco: o indexador do macOS percorria-os e as medicoes de tempo desta
    // propria suite sairam 3x inflacionadas — uma fuga de recursos que falsifica benchmarks e
    // que nenhuma leitura do teste denunciava, porque o teste PASSA.
    limpa({ dir, root });
    throw err;
  }
}

export const limpa = (c) => {
  for (const d of [c?.dir, c?.root]) if (d) rmSync(d, { recursive: true, force: true });
};


/** Um template minimo mas COMPLETO: tem tudo o que o simulador toca. As constantes adaptaveis
 *  estao ca todas porque o motor as procura pelo nome e para se faltar uma — de proposito. */
export function templateSintetico(extra = {}) {
  const constantes = {
    // `ALVOS_REPROVAM` entra aqui porque entrou na lista das constantes preservadas: o motor
    // procura-a pelo nome e REPROVA se nao a encontrar — e reprova bem, porque a tabela do
    // `/upgrade` estaria a mandar preservar algo que nao existe. Quem fica incompleta e a
    // fixture, nao o motor.
    ".agent/scripts/check-bundle-sizes.mjs": 'const TARGETS = {\n  "/": { name: "Home", target: 160, alarm: 180 },\n};\n',
    // A DECISAO vive a parte, e e ela que o simulador suspende. Estava dentro do ficheiro da
    // logica e o upgrade atropelava-a — foi essa a mudanca que a separacao veio fechar.
    ".agent/scripts/config/bundles.mjs": "export const ALVOS_REPROVAM = true;\n",
    ".agent/scripts/check-doc-versions.mjs": "const BANNED = [\n];\n",
    ".agent/scripts/guards/versions.mjs": "const CHECKS = [\n];\n",
    ".agent/scripts/check-test-surface.mjs": "const TEST_GLOBS = [\n];\nconst CONFIG_GLOBS = [\n];\n",
    ".agent/scripts/lib/surface-patterns.mjs": "const CONTAGENS = [\n];\n",
    // O guard dos tamanhos exporta TRES coisas que a adaptacao 2b usa: a tabela que reescreve, e
    // a contagem/limite que importa dele para nao existir uma segunda copia da mesma regra. Uma
    // fixture so com a tabela fazia o import trazer `undefined` e a simulacao rebentava — a
    // recusa estava certa, a fixture e que estava incompleta.
    ".agent/scripts/guards/sizes.mjs":
      "export const LIMITE = 500;\n" +
      "export const contaLinhas = (src) => src.replace(/\\n$/, \"\").split(\"\\n\").length;\n" +
      "export const TETOS = {\n};\n",
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
export function pontaAPonta(extra = {}) {
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

/** O runner desta suite e os seus contadores.
 *
 *  Vivem aqui pela mesma razao que o `sandbox()`: a suite passou as 500 linhas e a catraca do
 *  Guard 17 manda dividir antes de acrescentar. E o mesmo desenho do `test-sweep-harness.mjs` —
 *  quem monta fixtures conta tambem o veredicto, e a suite fica so com as ASSERCOES, que e o que
 *  se le quando se quer saber o que esta garantido. */
let passed = 0;
const falhas = [];

export function test(nome, fn) {
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

/** O veredicto da suite. SAI daqui, como o `resumo()` do `test-harness.mjs`: devolver um codigo
 *  tirava o `process.exit(1)` de dentro do runner, que e a marca por onde o `check-test-surface`
 *  reconhece que uma suite ainda tem veredicto. Ja foi apanhado uma vez. */
export function resumo() {
  console.log("");
  console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
  if (falhas.length) {
    console.log("\n  Um simulador que falhe ABERTO da por verificada a metade do produto que ninguem mede.\n");
    process.exit(1);
  }
  console.log("\n  Todos os testes do simulador de /upgrade passaram.\n");
  process.exit(0);
}
