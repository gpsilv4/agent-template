/**
 * Testes do Guard 23 (os exemplos do `.env` sem segredos, #595) — {{PROJECT_NAME}}
 *
 * Espelha `guards/env-example.mjs`. NAO e um entry point: o `test-guards.mjs` descobre-o em disco e chama `registar()`.
 *
 * As formas de segredo vivem em `lib/segredos.mjs` (partilhadas com o Guard 16): os casos delas sao estes e os do
 * `tests-mcp.mjs`.
 *
 * A fixture MONTA o ficheiro de exemplo de que cada assercao depende (`TP3`): o template nu nao tem nenhum.
 * Os segredos de fixture CONSTROEM-SE por pedacos, como no `tests-mcp.mjs`: o `gitleaks` do CI varre o codigo-fonte e
 * nao distingue uma fixture de um token a serio. Cada EXCECAO de placeholder tem uma linha que so ela deixa passar
 * (num servidor remoto, para nao passar por outra), e um controlo que reprova.
 */
import { createHmac } from "crypto";
import { execFileSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { test, writeF, registarResultado } from "./harness/test-harness.mjs";
import { problemasDosExemplos } from "../guards/env-example.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-env-example.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const STRIPE = "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc";
const GITHUB = "gh" + "p_" + "A1b2C3d4".repeat(5);
const ARGON2 = "$argon2" + "id$v=19$m=65536,t=3,p=4$" + "c2FsdHNhbHRzYWx0" + "$" + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo";
const BCRYPT = "$2" + "b$12$" + "R9h/cIPz0gi.URNNX3kh2O".padEnd(53, "PST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");
/** Um JWT HS256 com a carga e o segredo pedidos. O de demonstracao do `supabase start` e publico. */
const DEMO = "super-secret-jwt-token-" + "with-at-least-32-characters-long";
const jwt = (carga, segredo = "outro-segredo-qualquer-com-32-caracteres") => {
  const h = "eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
  const p = Buffer.from(JSON.stringify(carga)).toString("base64url");
  // A assinatura numa variavel, e nao dentro do `${...}`: o `check-codigo-morto` nao ve um uso dentro de uma template
  // string que tem outra template string la dentro, e dava o `createHmac` por importado e nunca usado.
  const assinatura = createHmac("sha256", segredo).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${assinatura}`;
};
const URL_ = (cred, host = "db.exemplo.pt") => `postgres://${cred}@${host}:5432/app`;
const LIMPO = [
  "# Copiar para .env.local e preencher",
  "DATABASE_URL=postgres://postgres:postgres@localhost:5432/app",
  "STRIPE_SECRET_KEY=<real-key>",
  "ADMIN_PASSWORD_HASH=(gerar com: node scripts/hash.mjs)",
  "SESSION_SECRET=",
  "API_TOKEN=changeme",
  "REDIS_URL=${REDIS_URL}",
].join("\n") + "\n";

/** Uma linha por excecao: so ELA a deixa passar (servidor remoto, senha sem outra palavra de exemplo). */
const HONESTOS = [
  // A senha, por formato e por palavra.
  URL_("app:<senha>"), URL_("app:[SENHA]"), URL_("app:${DB_PASS}"), URL_("app:xxxxxxxx"), URL_("app:..."),
  ...["pass", "secret", "root", "postgres", "admin", "dev", "test", "user"].map((w) => URL_(`app:${w}`)),
  URL_("app:mypassword"), URL_("app:yourpass"), URL_("app:example1"), URL_("app:changeme"), URL_("app:placeholder1"),
  URL_("app:app"),
  // O servidor reservado (RFC 2606/6761), com uma senha que nao e de exemplo.
  ...["db.example.com", "db.example.org", "db.example.net", "db.example", "db.test", "db.invalid", "db.localhost"].map((h) => URL_("app:s3gr3d0", h)),
  // A chave, por corpo.
  "AWS_ACCESS_KEY_ID=AKIA" + "IOSFODNN7EXAMPLE", "OPENAI_API_KEY=sk-" + "x".repeat(24), "STRIPE_SECRET_KEY=sk_" + "live_" + "0".repeat(24),
  "GITHUB_TOKEN=gh" + "p_" + "yourTokenGoesHereAbcdefgh", "SLACK_TOKEN=xox" + "b-placeholder-1234567890",
  // O JWT publico: a chave `anon`, e o de demonstracao provado pela assinatura.
  `SUPABASE_ANON_KEY=${jwt({ iss: "supabase", role: "anon" })}`,
  `SUPABASE_SERVICE_ROLE_KEY=${jwt({ iss: "supabase-demo", role: "service_role" }, DEMO)}`,
].map((l, i) => (l.includes("=") ? l : `V${i}=${l}`)).join("\n") + "\n";

/** Os controlos: cada um tem a forma de uma excecao e reprova. */
const CONTROLOS = [
  [URL_("app:s3gr3d0"), "um servidor remoto com senha real"],
  [URL_("app:K7QX9PL2"), "uma senha so de maiusculas e digitos"],
  [URL_("app:s3gr3d0", "localhost"), "localhost nao iliba sozinho (port-forward)"],
  [URL_("app:s3gr3d0", "db"), "um servidor sem ponto nao iliba sozinho"],
  [URL_("app:s3gr3d0", "db.exemplo.pt") + "  # dev: postgres://p:p@localhost", "um URL de exemplo noutro sitio da linha"],
  [jwt({ iss: "supabase-demo", role: "service_role" }), "um JWT demo re-assinado com outro segredo"],
  [jwt({ iss: "supabase", role: "service_role" }), "um JWT service_role"],
];

const SOU_ROOT = process.getuid?.() === 0;

export function registar() {
  test("G23: sem ficheiro de exemplo nenhum da SKIP visivel, nao silencio", null, {
    code: 0, anyOut: ["SKIP  Guard 23 (exemplos do `.env` sem segredos)"],
  });
  test("G23: placeholders (vazio, <real-key>, (gerar com ...), changeme, ${VAR}, URL local com senha de exemplo) passam", (dir) => {
    writeF(dir, ".env.example", LIMPO);
  }, { code: 0, anyOut: ["exemplos do `.env` sem segredos com forma conhecida (.env.example)"] });
  test("G23: cada excecao de placeholder (senha, servidor reservado, chave, JWT publico) deixa passar a sua linha", (dir) => {
    writeF(dir, ".env.example", HONESTOS);
  }, { code: 0, anyOut: ["exemplos do `.env` sem segredos com forma conhecida (.env.example)"] });
  for (const [linha, porque] of CONTROLOS) {
    test(`G23: CONTROLO — ${porque} reprova`, (dir) => {
      writeF(dir, ".env.example", `X=${linha}\n`);
    }, { code: 1, includes: [".env.example:1: "] });
  }

  test("G23: uma chave do Stripe num .env.example reprova, com o ficheiro e a linha, e SEM o valor", (dir) => {
    writeF(dir, ".env.example", `${LIMPO}STRIPE_SECRET_KEY=${STRIPE}\n`);
  }, { code: 1, includes: [".env.example:8: chave do Stripe (sk_/rk_)"], excludes: [STRIPE] });
  test("G23: um hash Argon2 completo reprova (o caso do derivado F), sem o valor", (dir) => {
    writeF(dir, ".env.example", `ADMIN_PASSWORD_HASH=${ARGON2}\n`);
  }, { code: 1, includes: [".env.example:1: hash Argon2 completo"], excludes: [ARGON2] });
  test("G23: um hash bcrypt completo reprova, sem o valor", (dir) => {
    writeF(dir, ".env.template", `ADMIN_HASH='${BCRYPT}'\n`);
  }, { code: 1, includes: [".env.template:1: hash bcrypt completo"], excludes: [BCRYPT] });
  test("G23: um token numa subpasta (.env.sample) e num comentario reprova", (dir) => {
    writeF(dir, "apps/web/.env.sample", `# GITHUB_TOKEN=${GITHUB}\n`);
  }, { code: 1, includes: ["apps/web/.env.sample:1: token do GitHub"] });
  test("G23: as formas que a primeira versao deixava passar (sk_test_, rk_live_, whsec_, sb_secret_) reprovam", (dir) => {
    writeF(dir, ".env.example", ["sk_" + "test_", "rk_" + "live_", "whsec_", "sb_" + "secret_"].map((p, i) => `K${i}=${p}${"Zq7Rt2Wm".repeat(4)}`).join("\n") + "\n");
  }, { code: 1, includes: [".env.example:1: chave do Stripe", ".env.example:2: chave do Stripe", ".env.example:3: segredo de webhook do Stripe", ".env.example:4: chave secreta do Supabase"] });

  // O que o guard NAO le: um ficheiro de segredo (nao e um exemplo) e o `node_modules`. Um `build/` LE: o `!` abre-o.
  test("G23: CONTROLO — um .env.local e um node_modules/.env.example nao se leem", (dir) => {
    writeF(dir, ".env.local", `STRIPE_SECRET_KEY=${STRIPE}\n`);
    writeF(dir, "node_modules/pkg/.env.example", `STRIPE_SECRET_KEY=${STRIPE}\n`);
  }, { code: 0, anyOut: ["SKIP  Guard 23"], excludes: [".env.local", "node_modules/pkg"] });
  test("G23: um exemplo dentro de um build/ e varrido (o `!` abre-o)", (dir) => {
    writeF(dir, "deploy/build/.env.example", `GITHUB_TOKEN=${GITHUB}\n`);
  }, { code: 1, includes: ["deploy/build/.env.example:1: token do GitHub"] });

  // O que nao e um ficheiro normal: o `!` abre-o, e o outro lado nao e um ficheiro de placeholders.
  test("G23: um exemplo que e um symlink reprova", (dir) => {
    writeF(dir, ".env.local", "X=1\n");
    symlinkSync(".env.local", join(dir, ".env.example"));
  }, { code: 1, includes: [".env.example: nao e um ficheiro normal (um symlink)"] });
  test("G23: uma PASTA com nome de exemplo reprova", (dir) => {
    writeF(dir, "cfg/.env.example/prod.json", "{}\n");
  }, { code: 1, includes: ["cfg/.env.example: nao e um ficheiro normal (uma PASTA)"] });
  test("G23: um FIFO com nome de exemplo reprova, e nao pendura o guard", (dir) => {
    execFileSync("mkfifo", [join(dir, ".env.example")]);
  }, { code: 1, includes: [".env.example: nao e um ficheiro normal (um FIFO ou dispositivo)"] });
  test("G23: um symlink de PASTA dentro do repo e seguido", (dir) => {
    writeF(dir, "real/.env.example", `GITHUB_TOKEN=${GITHUB}\n`);
    mkdirSync(join(dir, "apps"), { recursive: true });
    symlinkSync("../real", join(dir, "apps/web"));
  }, { code: 1, includes: ["apps/web/.env.example:1: token do GitHub", "real/.env.example:1: token do GitHub"] });
  // Para FORA do repo: o `!` abre o exemplo pelo caminho do repo, logo varre-se la. Numa pasta propria (o alvo de fora
  // tem de ser apagado no fim, e a sandbox do harness so apaga a dela).
  registarResultado("G23: um symlink de PASTA para FORA do repo e varrido, e o exemplo de la conta (#595)", (() => {
    const pai = mkdtempSync(join(tmpdir(), "g23-"));
    try {
      writeF(pai, "fora/.env.example", `GITHUB_TOKEN=${GITHUB}\n`);
      mkdirSync(join(pai, "repo"));
      symlinkSync(join(pai, "fora"), join(pai, "repo/partilhado"));
      const { problemas } = problemasDosExemplos(join(pai, "repo"));
      return problemas.some((p) => p.startsWith("partilhado/.env.example:1: token do GitHub")) ? [] : [`devia reprovar o exemplo de fora: ${JSON.stringify(problemas)}`];
    } finally {
      rmSync(pai, { recursive: true, force: true });
    }
  })());
  test("G23: um ciclo de symlinks termina (o `.` visto duas vezes)", (dir) => {
    writeF(dir, ".env.example", LIMPO);
    symlinkSync(".", join(dir, "ciclo"));
  }, { code: 0, anyOut: ["exemplos do `.env` sem segredos com forma conhecida (.env.example)"] });

  // O que NAO se le da nota: o agente, com o mesmo utilizador, tambem nao o le. Como root as permissoes nao contam, e
  // o caso nao se monta: SKIP visivel. Uma PASTA sem permissao nao se apaga com a sandbox (o `rmSync` nao a lista):
  // corre numa pasta propria, e a permissao volta no `finally`.
  if (SOU_ROOT) {
    console.log("  SKIP  G23: o que nao se le (a correr como root, as permissoes nao contam)");
    return;
  }
  test("G23: um exemplo que nao se le da nota, e nao reprova (o agente tambem nao o le)", (dir) => {
    writeF(dir, ".env.example", "X=1\n");
    chmodSync(join(dir, ".env.example"), 0o000);
  }, { code: 0, anyOut: ["NOTE  Guard 23: .env.example: nao consegui ler"] });
  registarResultado("G23: uma pasta que nao se le vai para as notas, e nao reprova", (() => {
    const raiz = mkdtempSync(join(tmpdir(), "g23-"));
    const fechada = join(raiz, "fechada");
    try {
      mkdirSync(fechada);
      chmodSync(fechada, 0o000);
      const { problemas, notas } = problemasDosExemplos(raiz);
      return notas.some((n) => n.startsWith("fechada/: nao consegui ler a pasta")) && problemas.length === 0
        ? [] : [`devia dar nota e nenhum problema: ${JSON.stringify({ problemas, notas })}`];
    } finally {
      chmodSync(fechada, 0o755);
      rmSync(raiz, { recursive: true, force: true });
    }
  })());
}
