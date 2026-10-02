/**
 * O construtor de fixture do `test-simulate-derived.mjs` — {{PROJECT_NAME}}
 *
 * NAO e um entry point e nao corre testes: monta o repo minimo onde o simulador corre.
 *
 * Extraido quando a suite chegou as 497 linhas e o #198 precisava de dois testes (Guard 17).
 * MOVIMENTO, e nao reescrita: o corpo e o mesmo, so mudou de casa. A outra forma de abrir
 * espaco era mudar os testes do `lib/patch.mjs` para um modulo seu, e o `check-test-surface`
 * reprovou-a com razao — o veredicto daqueles quatro casos deixava de estar no ficheiro e nao
 * aparecia noutro.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SIMULADOR = join(ROOT, ".agent/scripts/simulate-derived.mjs");

/** Os caminhos que o simulador tem de correr. **A fixture e que manda**: ela escreve um
 *  `ci.yml` com estes comandos no job `guard-tests`, e o simulador tem de os DERIVAR de la.
 *  Antes esta lista era extraida do codigo-fonte do simulador (um array literal); agora que a
 *  lista dele vem do CI, isso seria medir a fixture contra si propria. Assim mede-se a
 *  derivacao: se ela partir, estes testes ficam vermelhos. */
export const COMANDOS = [
  ".agent/scripts/test-alfa.mjs",
  ".agent/scripts/test-beta.mjs",
  ".claude/hooks/tests/test-gama.mjs",
];

/** Um `ci.yml` minimo com o job que o simulador le. */
const ciYml = (comandos) =>
  "name: CI\non:\n  push:\n\njobs:\n  guard-tests:\n    runs-on: ubuntu-latest\n    steps:\n" +
  comandos.map((c) => `      - name: ${c}\n        run: node ${c}\n`).join("");


/** Repo minimo, limpo por construcao: um placeholder para substituir, uma seccao 2.2 no
 *  BOOTSTRAP para derivar, e um stub por cada comando que o simulador chama. */
/** Os IDs CONSTROEM-SE, nunca se escrevem por extenso: o Guard 15 varre os `.agent/scripts/`,
 *  e um `APn` literal aqui seria uma citacao a um ID que o template nu nao define — o guard
 *  reprovava o repo, e foi o que aconteceu ao escrever estes testes. E a mesma convencao do
 *  `tests-anti-patterns.mjs`. Os `TPn` nao precisam disto (o template define-os), mas a
 *  fixture usa o prefixo do PROJETO de proposito: e ele que a numeracao aqui exercita. */
export const ap = (n) => "AP" + n;

export function fixture({ stubFalha = null, sobraPlaceholder = false, bootstrapQuebrado = false, semStubs = false, ciAusente = false, jobRenomeado = false, ciSemComandos = false, comandoExtra = false, segredosAninhados = false, apTemplate = false, semConfig = false, configOutraForma = false, semGuardTamanhos = false, tetosOutraForma = false, stubExigeSemBootstrap = false, gitSemResposta = false, ciExtra = "", extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sim-test-"));
  const w = (rel, body) => {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  };

  w(".agent/BOOTSTRAP.md", bootstrapQuebrado
    ? "# Bootstrap\n\nSem a seccao que o simulador procura.\n"
    : "# Bootstrap\n\n- **Modo minimo**: manter so os essenciais e **remover os restantes** (`podado` — sem uso) na Fase 2.\n\n" +
      "### 2.2 Ficheiros a GERAR do zero\n\n| Ficheiro |\n|---|\n" +
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
  // A config dos guards do PROJETO, como o template a entrega (#176): o 3f declara la o seu.
  w(".agent/scripts/config/guards-do-projeto.mjs", "export const GUARDS = [];\nexport const PARES_DO_PROJETO = [];\nexport const SKIPS_DO_PROJETO = [];\n");
  w(".agent/rules/process-rules.md", "# Processo\n\nO metodo passa por 6 fases.\n");
  if (!semGuardTamanhos) {
    // O `contaLinhas` vem JUNTO com a tabela: o simulador importa-o do guard da copia em vez de
    // reimplementar a contagem, e uma fixture so com `TETOS` fazia o import trazer `undefined`.
    // E a mesma licao que o harness do `/upgrade` ja tinha aprendido — a recusa esta certa, a
    // fixture e que estava incompleta.
    w(
      ".agent/scripts/guards/sizes.mjs",
      'export const contaLinhas = (src) => src.replace(/\\n$/, "").split("\\n").length;\n' +
        (tetosOutraForma ? "export const TETOS = [];\n" : "export const TETOS = {\n};\n")
    );
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
    // Um stub que AFIRMA sobre a copia em vez de so devolver um codigo. E a unica forma de
    // provar que o `BOOTSTRAP.md` foi mesmo apagado: afirmar sobre a mensagem do simulador
    // media a mensagem, nao o ficheiro — e uma mensagem sobrevive a remocao da linha que a
    // justifica.
    const corpo = stubExigeSemBootstrap && i === 0
      ? `#!/usr/bin/env node\nimport { existsSync } from "fs";\n` +
        `if (existsSync(".agent/BOOTSTRAP.md")) { console.log("  0 passaram, 1 falharam. BOOTSTRAP.md AINDA EXISTE na copia"); process.exit(1); }\n` +
        `console.log("  1 passaram, 0 falharam.");\n`
      : `#!/usr/bin/env node\nconsole.log("  ${i} passaram, ${falha ? 1 : 0} falharam.");\n` +
        `process.exit(${falha ? 1 : 0});\n`;
    w(c, corpo);
  }

  // O `ci.yml` e a FONTE da lista de comandos do simulador.
  if (!ciAusente) {
    const yml = ciYml(ciSemComandos ? [] : (comandoExtra ? [...COMANDOS, ".agent/scripts/test-delta.mjs"] : COMANDOS));
    w(".github/workflows/ci.yml", (jobRenomeado ? yml.replace("guard-tests:", "verificacoes:") : yml) + ciExtra);
  }

  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });
  // `ciExtra` e `extra`: passos e ficheiros a mais, para os casos do leitor do `ci.yml` (#198).
  for (const [rel, corpo] of Object.entries(extra)) w(rel, corpo);
  if (segredosAninhados) {
    // Segredos e estado local ABAIXO do primeiro nivel. A lista de exclusao comparava contra
    // o nome de topo (`.claude`), logo `.claude/state` — que estava la escrito — entrava
    // sempre, e um `.pem` dentro de qualquer subpasta entrava com ele.
    w(".claude/state/sessao.json", '{"segredo":"nao devia sair daqui"}\n');
    w("infra/certs/servidor.pem", "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n");
    w("apps/web/.env.local", "SUPABASE_SERVICE_KEY=nao-copiar\n");
    // Ignorado pelo `.gitignore`: a lista a mao so conhecia `TEMPLATE-FIXES` e deixava-o entrar (#182).
    w("RELATORIO-TEMPLATE-RONDA9.md", "# notas de trabalho\n");
  }
  copyFileSync(SIMULADOR, join(dir, ".agent/scripts/simulate-derived.mjs"));
  // O simulador importa `lib/patch.mjs` — a distincao entre "o patch nao aplicou" e "o valor ja
  // era o desejado", que vive num sitio so de proposito. Sem o copiar, o import rebenta e TODOS
  // estes casos falham por uma razao que nada tem a ver com eles.
  mkdirSync(join(dir, ".agent/scripts/lib"), { recursive: true });
  // A `lib/` INTEIRA, derivada do disco, e nao os modulos nomeados um a um. A lista a mao era
  // uma segunda copia das dependencias do script, a ter de concordar com os `import` dele sem
  // nada a verifica-lo (`TP8`). E a TERCEIRA vez que este padrao morde: extrair um modulo novo
  // rebenta as fixtures com `ERR_MODULE_NOT_FOUND`, que nao diz "falta uma linha no harness".
  // Copiar de mais e barato: um modulo que ninguem importa nao chega a ser lido.
  for (const m of readdirSync(join(ROOT, ".agent/scripts/lib")).filter((f) => f.endsWith(".mjs"))) {
    copyFileSync(join(ROOT, `.agent/scripts/lib/${m}`), join(dir, `.agent/scripts/lib/${m}`));
  }
  // Um REPO, como o template: o simulador pergunta ao git o que nao e do template (#182). O
  // `.gitignore` GLOBAL de quem corre fica de fora (`TP3`); um `.git` para lado nenhum faz o git
  // falhar sem subir a um repo pai.
  if (gitSemResposta) w(".git", "gitdir: /nao/existe\n");
  else {
    w(".gitignore", ".claude/state/\nRELATORIO-*.md\n");
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "core.excludesFile", "/dev/null"], { cwd: dir });
  }
  return dir;
}
