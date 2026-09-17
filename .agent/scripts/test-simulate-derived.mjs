#!/usr/bin/env node
/**
 * Testes do simulador de projeto derivado — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS da logica **propria** do `simulate-derived.mjs`: o que copia, o que
 * substitui, o que gera, e — sobretudo — recusar-se a dar OK quando nao mediu nada.
 *
 * O veredicto sobre os verificadores nao e testado aqui: e o exit code deles, e cada um ja tem
 * a sua suite. O que se testa e o arnes.
 *
 * A fixture e um repo MINIMO montado do zero, com stubs no lugar dos verificadores — logo cada
 * caso corre em milissegundos em vez dos ~50s da simulacao a serio. O simulador ancora a raiz
 * a sua propria localizacao, logo copia-lo para a fixture faz com que ele simule a fixture: e
 * o mesmo truque do `test-harness.mjs`.
 *
 *   node .agent/scripts/test-simulate-derived.mjs
 *
 * Sai `!= 0` se algum teste falhar. Corre no job `guard-tests` do `ci.yml`.
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIMULADOR = join(ROOT, ".agent/scripts/simulate-derived.mjs");

/** Os caminhos que o simulador tem de correr. **A fixture e que manda**: ela escreve um
 *  `ci.yml` com estes comandos no job `guard-tests`, e o simulador tem de os DERIVAR de la.
 *  Antes esta lista era extraida do codigo-fonte do simulador (um array literal); agora que a
 *  lista dele vem do CI, isso seria medir a fixture contra si propria. Assim mede-se a
 *  derivacao: se ela partir, estes testes ficam vermelhos. */
const COMANDOS = [
  ".agent/scripts/test-alfa.mjs",
  ".agent/scripts/test-beta.mjs",
  ".claude/hooks/tests/test-gama.mjs",
];

/** Um `ci.yml` minimo com o job que o simulador le. */
const ciYml = (comandos) =>
  "name: CI\non:\n  push:\n\njobs:\n  guard-tests:\n    runs-on: ubuntu-latest\n    steps:\n" +
  comandos.map((c) => `      - name: ${c}\n        run: node ${c}\n`).join("");

let passed = 0;
const falhas = [];

/** Repo minimo, limpo por construcao: um placeholder para substituir, uma seccao 2.2 no
 *  BOOTSTRAP para derivar, e um stub por cada comando que o simulador chama. */
/** Os IDs CONSTROEM-SE, nunca se escrevem por extenso: o Guard 15 varre os `.agent/scripts/`,
 *  e um `APn` literal aqui seria uma citacao a um ID que o template nu nao define — o guard
 *  reprovava o repo, e foi o que aconteceu ao escrever estes testes. E a mesma convencao do
 *  `tests-anti-patterns.mjs`. Os `TPn` nao precisam disto (o template define-os), mas a
 *  fixture usa o prefixo do PROJETO de proposito: e ele que a numeracao aqui exercita. */
const ap = (n) => "AP" + n;

function fixture({ stubFalha = null, sobraPlaceholder = false, bootstrapQuebrado = false, semStubs = false, ciAusente = false, jobRenomeado = false, ciSemComandos = false, comandoExtra = false, segredosAninhados = false, apTemplate = false, semConfig = false, configOutraForma = false, semGuardTamanhos = false, tetosOutraForma = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sim-test-"));
  const w = (rel, body) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  };

  w(".agent/BOOTSTRAP.md", bootstrapQuebrado
    ? "# Bootstrap\n\nSem a seccao que o simulador procura.\n"
    : "# Bootstrap\n\n### 2.2 Ficheiros a GERAR do zero\n\n| Ficheiro |\n|---|\n" +
      "| `.agent/rules/business-logic.md` |\n\n### 2.3 Outra coisa\n\nTexto.\n");

  // O placeholder e construido, nao escrito: o bootstrap substitui placeholders tambem em
  // `.mjs`, logo um literal aqui seria reescrito num projeto derivado e a fixture deixava de
  // ter o que o teste precisa.
  const ph = "{" + "{" + "PROJECT_NAME" + "}" + "}";
  // O `README.md` esta na lista dos que DOCUMENTAM placeholders, logo nao serve de cobaia:
  // uma rule serve, e e onde um placeholder esquecido de facto engana o agente.
  w(".agent/rules/core-rules.md", `# ${ph}\n\nTexto.\n`);
  w("README.md", "# Readme\n");
  // `sobraPlaceholder` simula a lacuna real: um placeholder num tipo de ficheiro que a
  // substituicao **nao** cobre. O `.txt` nao esta em nenhuma das listas — e e essa a forma do
  // defeito que isto apanhou de verdade: o `.githooks/commit-msg`, que nao tem extensao.
  if (sobraPlaceholder) w("NOTAS.txt", `Projeto: ${ph}\n`);

  // Os ficheiros que os blocos 3d/3e CONFIGURAM. Sem eles o simulador reprova a dizer que nao
  // consegue simular um derivado configurado — e reprova bem: um patch que nao aplica deixava-o
  // a medir o template por estrear outra vez. A fixture tem de os ter, como um template os tem.
  //
  // Sao SINTETICOS e nao copiados: copiar os reais fazia estes testes depender do conteudo
  // deste repo (`TP3`). O que se mede aqui e o simulador, nao os verificadores.
  // `semConfig` / `configOutraForma`: as duas formas de o bloco 3d nao conseguir configurar o
  // derivado. Reprovar e obrigatorio — um patch que nao aplica deixa a simulacao a medir o
  // template por estrear outra vez, que e o defeito que o 3d existe para fechar.
  if (!semConfig) {
    w(".agent/scripts/guards/versions.mjs", configOutraForma ? 'const CHECKS = "outra forma";\n' : "const CHECKS = [\n];\n");
  }
  w(".agent/scripts/check-doc-versions.mjs", "const BANNED = [\n];\n");
  // A configuracao do projeto vive a parte, e e ela que o bloco 3d suspende. O ficheiro da
  // logica fica sem a constante — foi essa a mudanca que tirou a decisao do caminho do upgrade.
  w(".agent/scripts/check-bundle-sizes.mjs", "// logica do verificador\n");
  w(".agent/scripts/config/bundles.mjs", "export const ALVOS_REPROVAM = true;\n");
  w(".agent/rules/process-rules.md", "# Processo\n\nO metodo passa por 6 fases.\n");
  if (!semGuardTamanhos) {
    w(".agent/scripts/guards/sizes.mjs", tetosOutraForma ? "export const TETOS = [];\n" : "export const TETOS = {\n};\n");
  }

  w(".agent/rules/anti-patterns.md",
    `# Anti-Padroes\n\n<!-- Exemplo a remover no bootstrap.\n\n## ${ap(1)} — exemplo\n\n-->\n\n## ${ap(1)} — real\n`);
  if (apTemplate) {
    // O ficheiro do TEMPLATE ao lado do do projeto. E o que torna a fixture um derivado com
    // historia: o simulador acrescenta um anti-padrao proprio, e tem de o numerar sem olhar
    // para estes. Os numeros escolhidos SOBREPOEM-SE aos do projeto de proposito (o `1` esta
    // nos dois ficheiros, em prefixos diferentes): e a unica forma de a fixture distinguir
    // "ignorou o ficheiro do template" de "somou os dois".
    w(".agent/rules/anti-patterns-template.md",
      "# Anti-Padroes do template\n\n## TP1 — um\n\n## TP2 — dois\n\n## TP7 — sete\n");
  }

  const listaStubs = comandoExtra ? [...COMANDOS, ".agent/scripts/test-delta.mjs"] : COMANDOS;
  for (const [i, c] of semStubs ? [] : listaStubs.entries()) {
    const falha = stubFalha !== null && c.includes(stubFalha);
    w(c, `#!/usr/bin/env node\nconsole.log("  ${i} passaram, ${falha ? 1 : 0} falharam.");\n` +
         `process.exit(${falha ? 1 : 0});\n`);
  }

  // O `ci.yml` e a FONTE da lista de comandos do simulador.
  if (!ciAusente) {
    const yml = ciYml(ciSemComandos ? [] : (comandoExtra ? [...COMANDOS, ".agent/scripts/test-delta.mjs"] : COMANDOS));
    w(".github/workflows/ci.yml", jobRenomeado ? yml.replace("guard-tests:", "verificacoes:") : yml);
  }

  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  if (segredosAninhados) {
    // Segredos e estado local ABAIXO do primeiro nivel. A lista de exclusao comparava contra
    // o nome de topo (`.claude`), logo `.claude/state` — que estava la escrito — entrava
    // sempre, e um `.pem` dentro de qualquer subpasta entrava com ele.
    w(".claude/state/sessao.json", '{"segredo":"nao devia sair daqui"}\n');
    w("infra/certs/servidor.pem", "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n");
    w("apps/web/.env.local", "SUPABASE_SERVICE_KEY=nao-copiar\n");
  }
  copyFileSync(SIMULADOR, join(dir, ".agent/scripts/simulate-derived.mjs"));
  return dir;
}

function test(nome, opcoes, expect) {
  const dir = fixture(opcoes);
  try {
    let code = 0;
    let out = "";
    try {
      out = execFileSync("node", [join(dir, ".agent/scripts/simulate-derived.mjs"), ...(expect.args ?? [])], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      code = e.status ?? -1;
      out = (e.stdout ?? "") + (e.stderr ?? "");
    }
    const problemas = [];
    if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
    // Quando se espera reprovacao, afirma-se contra as linhas WARN e nada mais: um `includes`
    // sobre o output inteiro seria satisfeito por uma linha OK com o mesmo texto (`TP1`).
    const alvo = expect.code === 0
      ? out
      : out.split("\n").filter((l) => l.trimStart().startsWith("WARN")).join("\n");
    for (const s of expect.includes ?? []) {
      if (!alvo.includes(s)) problemas.push(`${expect.code === 0 ? "output" : "linhas WARN"} devia conter "${s}"`);
    }
    for (const s of expect.excludes ?? []) {
      if (out.includes(s)) problemas.push(`output NAO devia conter "${s}"`);
    }
    // Afirmacoes sobre a COPIA em si (nao sobre o que o simulador imprimiu). So faz sentido
    // com `--keep`, que e o que a deixa no disco para ser inspeccionada.
    if (expect.copia) {
      const m = out.match(/copia mantida em (.+)/);
      if (!m) problemas.push("esperava a linha `copia mantida em ...` (falta --keep?)");
      else {
        try {
          problemas.push(...(expect.copia(m[1].trim()) ?? []));
        } finally {
          rmSync(m[1].trim(), { recursive: true, force: true });
        }
      }
    }
    if (problemas.length) {
      falhas.push({ nome, problemas, out });
      console.log(`  FAIL  ${nome}`);
      for (const p of problemas) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${nome}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== Testes do simulador de projeto derivado ===\n");

// --- O caminho feliz, e o que ele tem de declarar -------------------------------
test("fixture sa: corre tudo e declara quantas verificacoes passaram", {}, {
  code: 0,
  includes: [`${COMANDOS.length} verificacao(oes) verdes num projeto derivado`],
  excludes: ["  WARN  "],
});

// --- Um verificador que falha no DERIVADO tem de reprovar a simulacao -----------
// E a razao de existir do script: um defeito que so aparece depois do bootstrap.
test("um verificador a falhar reprova a simulacao, e e nomeado", { stubFalha: COMANDOS[0] }, {
  code: 1,
  includes: [COMANDOS[0], "exit 1"],
});

// --- "Nao consegui medir" tem de REPROVAR, nao dar OK (TP2) ---------------------
// A primeira versao deste teste afirmava "zero placeholders substituidos reprova". Era
// inalcancavel: o proprio simulador tem um placeholder no cabecalho, logo a contagem nunca e
// zero — e o ramo do script que ele testava so dispararia num projeto ja bootstrapado, onde
// zero e o estado CORRECTO. O que se mede agora e o invariante que interessa: nao sobrar
// nenhum placeholder na copia.
test("um placeholder que sobra na copia reprova", { sobraPlaceholder: true }, {
  code: 1,
  includes: ["sobraram placeholders", "NOTAS.txt"],
});

// O controlo do controlo: sem a sobra, nao pode haver falso positivo.
test("sem sobras, a varredura de placeholders nao acusa nada", {}, {
  code: 0,
  excludes: ["sobraram placeholders"],
});

// O ramo mais facil de esquecer: todos os comandos ausentes. Sem o `fatal`, o script chegava
// ao fim a contar avisos em vez de dizer que nao mediu nada — e a diferenca importa, porque
// "falharam" e "nao correram" pedem accoes diferentes a quem le. E o `TP2`.
test("nenhum comando a correr reprova a dizer que nao mediu", { semStubs: true }, {
  code: 1,
  includes: ["nao mediu nada"],
});

test("BOOTSTRAP sem a seccao 2.2 reprova, em vez de gerar nada em silencio", { bootstrapQuebrado: true }, {
  code: 1,
  includes: ["nenhuma rule gerada"],
});

test("`--only` que nao selecciona nada reprova", {}, {
  code: 1,
  args: ["--only=nao-existe-nenhum"],
  includes: ["nao seleccionou nenhum comando"],
});

// --- O passo 2.8: o unico destrutivo que o simulador aplica --------------------
test("o exemplo comentado do anti-patterns.md e removido (passo 2.8)", {}, {
  code: 0,
  includes: ["exemplo comentado do anti-patterns.md removido"],
});

// --- `--only` valido continua a correr o que selecciona ------------------------
test("`--only` valido corre so o seleccionado", {}, {
  code: 0,
  args: [`--only=${COMANDOS[0].split("/").pop().replace(".mjs", "")}`],
  includes: ["1 verificacao(oes) verdes"],
});

// --- A lista de comandos e DERIVADA do ci.yml (era mantida a mao) ----------------
// Estava escrita no simulador com um comentario a dizer "os mesmos do ci.yml" e nada a
// verifica-lo: acrescentar uma suite ao CI e esquecer aqui fazia a simulacao medir menos,
// em silencio. Estes tres casos fixam a derivacao nos dois sentidos.

test("sem ci.yml reprova a dizer que NAO DERIVOU — nao 'nada a correr' (TP2)", { ciAusente: true }, {
  code: 1,
  includes: ["nao derivei nenhum comando"],
});

test("job `guard-tests` renomeado reprova, em vez de correr zero", { jobRenomeado: true }, {
  code: 1,
  includes: ["nao derivei nenhum comando"],
});

test("job sem nenhum `node ...mjs` reprova", { ciSemComandos: true }, {
  code: 1,
  includes: ["nao derivei nenhum comando"],
});

test("um comando ACRESCENTADO ao ci.yml passa a ser corrido pela simulacao", { comandoExtra: true }, {
  code: 0,
  includes: [".agent/scripts/test-delta.mjs"],
});

// --- O derivado com HISTORIA, e nao so o dia 1 -------------------------------
// O simulador validava o **dia 1**: zero anti-padroes proprios, os TETOS do template, nenhum
// ficheiro grande. Tres dos quatro achados da terceira ronda de revisao escaparam-lhe por
// isso — todos vivem no dia 100. O passo 3c acrescenta um anti-padrao PROPRIO, e o numero sai
// do ficheiro do projeto e **so** dele.
//
// Os dois testes sao um PAR e valem pela igualdade: com o ficheiro do template presente ou
// ausente, o proximo ID do projeto e o mesmo. E isso que os prefixos separados garantem — a
// numeracao do template nao consome a do projeto. Voltar a somar os dois ficheiros da 8 no
// primeiro caso e 2 no segundo, e o par reprova. Um teste sozinho aqui nao distinguia nada:
// qualquer dos dois, isolado, e satisfeito por uma implementacao errada.
test("derivado maduro: os `TPn` do template NAO consomem a numeracao do projeto", { apTemplate: true }, {
  code: 0,
  includes: [`anti-padrao proprio ${ap(2)} acrescentado`],
});

test("derivado maduro: sem o ficheiro do template, o proximo e o MESMO", {}, {
  code: 0,
  includes: [`anti-padrao proprio ${ap(2)} acrescentado`],
});

// --- O derivado que CONFIGUROU: cada recusa recusa mesmo ----------------------
// A varredura de mutacao apontou os quatro `fatal()` dos blocos 3d/3e como NAO COBERTOS: eu
// tinha escrito as defesas e nenhum teste notava se deixassem de disparar. Um patch que nao
// aplica em silencio deixa a simulacao a medir o template por estrear — exactamente o que
// estes blocos existem para impedir.
test("sem o ficheiro que o 3d configura, REPROVA", { semConfig: true }, {
  code: 1,
  includes: ["nao existe na copia", "nao consigo simular"],
});

test("com a constante do 3d noutra forma, REPROVA", { configOutraForma: true }, {
  code: 1,
  includes: ["nao consegui configurar", "o literal mudou de forma"],
});

test("sem o guard dos tamanhos, o 3e REPROVA", { semGuardTamanhos: true }, {
  code: 1,
  includes: ["guards/sizes.mjs nao existe na copia"],
});

test("com os TETOS noutra forma, o 3e REPROVA", { tetosOutraForma: true }, {
  code: 1,
  includes: ["nao consegui reescrever os TETOS"],
});

// --- A lista de exclusao tem de valer em profundidade ------------------------
// Medido: `.claude/state` estava na lista e entrava sempre na copia, porque a comparacao
// era feita contra o nome de TOPO (`.claude`). O mesmo para um `.pem` ou um `.env.local`
// dentro de qualquer subpasta — e a copia vai para `/tmp`, onde fica se o script sair por
// `fatal()`. Uma lista de exclusao que so olha para o primeiro nivel nao exclui nada.
test("segredos e estado local em subpastas NAO entram na copia", { segredosAninhados: true }, {
  code: 0,
  args: ["--keep"],
  copia: (dir) => {
    const problemas = [];
    for (const rel of [".claude/state/sessao.json", "infra/certs/servidor.pem", "apps/web/.env.local"]) {
      if (existsSync(join(dir, rel))) problemas.push(`${rel} entrou na copia e nao devia`);
    }
    // O contra-teste: se a copia estivesse vazia, o de cima passava por nao haver nada.
    if (!existsSync(join(dir, ".agent/BOOTSTRAP.md"))) problemas.push("a copia nao tem o que devia ter — o teste acima nao prova nada");
    if (!existsSync(join(dir, "infra/certs"))) problemas.push("a subpasta `infra/certs` devia existir (so o .pem e que sai)");
    return problemas;
  },
});

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
console.log("");
if (falhas.length) {
  for (const { nome, out } of falhas) {
    console.log(`--- output de "${nome}" ---`);
    console.log(out);
  }
  console.log("  Ha testes do simulador a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do simulador passaram.\n");
