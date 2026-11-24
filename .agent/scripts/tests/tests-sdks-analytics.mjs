/**
 * Testes do Guard 24 (um SDK de analytics no `package.json`, #495) — {{PROJECT_NAME}}
 *
 * Espelha `guards/sdks-analytics.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco e chama `registar()`.
 * A fixture MONTA o `package.json` e o inventario de que cada assercao depende (`TP3`): o template nu nao tem nenhum.
 * O `package.json` e o CHANGELOG escrevem-se com a MESMA versao (o Guard 3 fica calado no template e num derivado).
 * O guard so da NOTE (sai 0): as assercoes sao contra o output inteiro, e cada caso tem o seu controlo.
 */
import { rmSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, writeF } from "./harness/test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-sdks-analytics.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** O `package.json` e o CHANGELOG da MESMA versao, escritos pela fixture (o precedente do `tests-versions.mjs`): num
 *  derivado o CHANGELOG ja tem versoes, e um `version` fixo punha o Guard 3 a avisar (`TP3`); ler o da sandbox era uma
 *  segunda leitura dele, com outras regras (`TP8` — o leitor tecnico do #495). */
const pkg = (dir, deps = {}, devDeps = {}, extra = {}) => {
  writeF(dir, "src/docs/CHANGELOG.md", "# CHANGELOG\n\n## [v1.2.3] - Atual\n");
  return JSON.stringify({ name: "x", version: "1.2.3", dependencies: deps, devDependencies: devDeps, ...extra });
};
const INVENTARIO = "docs/legal/privacy-inventory.md";
const inventario = (linha) => `# Inventario\n\n| Dado | Destino |\n|------|---------|\n${linha}\n`;

export function registar() {
  test("G24: sem package.json da SKIP visivel (o template, a fixture)", null, {
    code: 0,
    includes: ["Guard 24 (SDKs de analytics) — sem package.json"],
  });
  test("G24: sem nenhum SDK da lista, OK", (dir) => {
    writeF(dir, "package.json", pkg(dir, { react: "19.0.0" }));
  }, { code: 0, includes: ["Guard 24: nenhum SDK de analytics da lista no package.json"], excludes: ["sugere dados pessoais"] });

  // --- O nivel base: o SDK e o sinal ------------------------------------------------------------------------------
  // "Sem inventario" MONTA-SE (`TP3`): num derivado com o "sim" do BOOTSTRAP, o inventario ja existe.
  test("G24: um SDK por prefixo de scope (@sentry/nextjs), sem inventario, lembra o nivel completo", (dir) => {
    rmSync(join(dir, INVENTARIO), { force: true });
    writeF(dir, "package.json", pkg(dir, { "@sentry/nextjs": "8.0.0" }));
  }, { code: 0, includes: ["Guard 24: Sentry no package.json sugere dados pessoais — passar ao nivel completo"] });
  test("G24: um SDK por nome exato (posthog-js), tambem nas devDependencies", (dir) => {
    rmSync(join(dir, INVENTARIO), { force: true });
    writeF(dir, "package.json", pkg(dir, {}, { "posthog-js": "1.0.0" }));
  }, { code: 0, includes: ["Guard 24: PostHog no package.json sugere dados pessoais"] });
  // O controlo do nome exato e do scope: um pacote que so COMECA igual nao conta.
  test("G24: um pacote com o mesmo comeco (react-ga4-extra, @sentry-internal/x) nao conta", (dir) => {
    writeF(dir, "package.json", pkg(dir, { "react-ga4-extra": "1.0.0", "@sentry-internal/x": "1.0.0" }));
  }, { code: 0, includes: ["Guard 24: nenhum SDK de analytics da lista no package.json"] });

  // --- O nivel completo: o inventario -----------------------------------------------------------------------------
  test("G24: com o SDK numa linha de tabela do inventario, OK", (dir) => {
    writeF(dir, "package.json", pkg(dir, { "@sentry/nextjs": "8.0.0" }));
    writeF(dir, INVENTARIO, inventario("| erros da app | Sentry |"));
  }, { code: 0, includes: ["Guard 24: 1 SDK(s) de analytics, todos no inventario"], excludes: ["nao aparece numa linha do inventario"] });
  test("G24: com o SDK fora do inventario, lembra-o", (dir) => {
    writeF(dir, "package.json", pkg(dir, { "@sentry/nextjs": "8.0.0", "mixpanel-browser": "2.0.0" }));
    writeF(dir, INVENTARIO, inventario("| erros da app | Sentry |"));
  }, { code: 0, includes: ["Guard 24: Mixpanel esta no package.json e nao aparece numa linha do inventario"], excludes: ["Sentry esta no package.json"] });
  // `TP1`: o nome numa FRASE nao conta, so numa linha de tabela.
  test("G24: o nome do SDK numa frase do inventario nao conta", (dir) => {
    writeF(dir, "package.json", pkg(dir, { "@sentry/nextjs": "8.0.0" }));
    writeF(dir, INVENTARIO, "# Inventario\n\nNao usamos o Sentry para nada pessoal.\n\n| Dado | Destino |\n|---|---|\n| email | o projeto |\n");
  }, { code: 0, includes: ["Guard 24: Sentry esta no package.json e nao aparece numa linha do inventario"] });
  // Por PALAVRA: "Segmentation" nao e o "Segment".
  test("G24: o nome por palavra — Segmentation nao e o Segment", (dir) => {
    writeF(dir, "package.json", pkg(dir, { "@segment/analytics-next": "1.0.0" }));
    writeF(dir, INVENTARIO, inventario("| perfis | Segmentation interna |"));
  }, { code: 0, includes: ["Guard 24: Segment esta no package.json e nao aparece numa linha do inventario"] });
  // Com as MAIUSCULAS do nome: "amplitude" numa frase em portugues nao e a Amplitude (o leitor tecnico do #495).
  test("G24: o nome com as maiusculas — amplitude minuscula nao e a Amplitude", (dir) => {
    writeF(dir, "package.json", pkg(dir, { "@amplitude/analytics-browser": "2.0.0" }));
    writeF(dir, INVENTARIO, inventario("| medicoes | a amplitude das respostas |"));
  }, { code: 0, includes: ["Guard 24: Amplitude esta no package.json e nao aparece numa linha do inventario"] });
  // As `optionalDependencies` tambem instalam; e um prefixo terminado em `-` (`@datadog/browser-` apanha o `-rum-react`).
  test("G24: as optionalDependencies contam, e um prefixo em `-` apanha a variante", (dir) => {
    rmSync(join(dir, INVENTARIO), { force: true });
    writeF(dir, "package.json", pkg(dir, {}, {}, { optionalDependencies: { "@datadog/browser-rum-react": "5.0.0" } }));
  }, { code: 0, includes: ["Guard 24: Datadog RUM no package.json sugere dados pessoais"] });

  // --- A ordem dos ramos ------------------------------------------------------------------------------------------
  // Um `package.json` invalido: o Guard 3 diz-o, e o 24 nao repete.
  test("G24: com o package.json invalido nao diz nada (o Guard 3 ja o diz)", (dir) => {
    writeF(dir, "package.json", "{ invalido");
  }, {
    code: 1,
    includes: ["package.json invalido"],
    excludes: ["Guard 24"],
    // A linha final do resumo so sai se o processo NAO rebentou no Guard 24 (`TP1`: sem o `try`, o crash tambem saia 1).
    anyOut: ["WARNING: ha divergencias/avisos de documentacao"],
  });
  // Uma sandbox minima, sem a lista: SKIP com a razao.
  // A config sem a exportacao e o mesmo ramo que a config ausente (o `import` da `{}`), sem apagar um ficheiro que o
  // `scripts-guide.md` cita — apaga-lo punha o Guard 20 a avisar, e o caso media outra coisa.
  test("G24: sem a lista (config/sdks-de-analytics.mjs) da SKIP com a razao", (dir) => {
    writeF(dir, "package.json", pkg(dir, { "@sentry/nextjs": "8.0.0" }));
    writeF(dir, ".agent/scripts/config/sdks-de-analytics.mjs", "export const OUTRA = [];\n");
  }, { code: 0, includes: ["Guard 24 (SDKs de analytics) — sem a lista"], excludes: ["sugere dados pessoais"] });
}
