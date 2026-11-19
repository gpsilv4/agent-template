/**
 * Testes do Guard 11: os ficheiros de EXEMPLO do `.env` abrem-se, os de segredo nao (#595) — {{PROJECT_NAME}}
 *
 * O que se afirma: o `!` do `deny` (a negacao do gitignore, na doc de permissoes do Claude Code) abre so os nomes de
 * exemplo; a ORDEM conta; um `!` largo, ou um posto depois de outra regra de caminho, reprova; e um `deny` que ainda
 * apanhe os exemplos e uma NOTA, nao uma reprovacao. Cada caso que abre tem o seu controlo que fecha.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre-o e chama `registar()`.
 */
import { posix } from "path";
import { pathToFileURL } from "url";
import { test, patchSettings, registarResultado } from "./harness/test-harness.mjs";
import { cobre, emFalta } from "../lib/permissoes.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-settings-exemplos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** O `deny` do `.env` do template, na ordem dele: as largas, e logo a seguir os `!`, antes do `secrets/**`. */
const EXEMPLOS = [".env.example", ".env.sample", ".env.template"];
const ABRE = (f) => EXEMPLOS.map((n) => `${f}(!${n})`);
const DENY = [
  "Read(./.env)", "Read(./.env.*)", "Read(./**/.env)", "Read(./**/.env.*)",
  "Edit(./.env*)", "Edit(./**/.env*)", "Write(./.env*)", "Write(./**/.env*)",
  ...ABRE("Read"), ...ABRE("Edit"), ...ABRE("Write"),
  "Read(./**/secrets/**)",
];
/** Os nomes de segredo pedidos no #595, e os que tentam enganar a excecao. `.env.example/../.env` chega normalizado. */
const SEGREDOS = [".env", ".env.local", ".env.production.local", "apps/web/.env.local", ".env.example.local",
  ".env.local.example", posix.normalize(".env.example/../.env"), ".env.staging", "secrets/.env.example"];

const falhas = (casos) => casos.filter(([, obtido, esperado]) => obtido !== esperado).map(([o, obtido, esperado]) => `${o}: esperado ${esperado}, obtido ${obtido}`);

export function registar() {
  registarResultado("G11: com os `!`, os exemplos abrem-se e os segredos continuam negados, nas tres ferramentas (#595)", falhas([
    ...["Read", "Edit", "Write"].flatMap((f) => [".env.example", "apps/web/.env.sample", ".env.template"].map((a) => [`${f} ${a}`, cobre(DENY, f, a), false])),
    ...["Read", "Edit", "Write"].flatMap((f) => SEGREDOS.filter((a) => f === "Read" || !a.startsWith("secrets/")).map((a) => [`${f} ${a}`, cobre(DENY, f, a), true])),
  ]));
  // O controlo de cada um: sem os `!` o exemplo esta fechado; um `!` ANTES da regra larga nao tira nada (a doc: "A `!`
  // rule listed first carves nothing out"); um `!` largo abre um segredo.
  registarResultado("G11: CONTROLO — sem `!` o exemplo fecha; um `!` antes da regra larga nao abre; um `!.env*` abre o .env.local (#595)", falhas([
    ["sem !", cobre(DENY.filter((r) => !r.includes("(!")), "Read", ".env.example"), true],
    ["! antes", cobre(["Read(!.env.example)", "Read(./**/.env.*)"], "Read", ".env.example"), true],
    ["!.env* largo", cobre([...DENY, "Read(!.env*)"], "Read", ".env.local"), false],
    ["uma regra larga DEPOIS do ! volta a fechar", cobre([...DENY, "Read(./**/.env*)"], "Read", ".env.example"), true],
    // Um `Bash(!x)` e um comando literal (como antes do #595): cobre o `!x`, e nao nega nada.
    ["Bash(!x) literal", cobre(["Bash(!x)"], "Bash", "!x"), true],
    ["Bash(!x) nao nega", cobre(["Bash(rm -rf:*)", "Bash(!rm -rf:*)"], "Bash", "rm -rf x"), true],
  ]));
  // A doc nao diz se um `Edit(!x)` corta um `Read(...)` anterior: para o que tem de ficar NEGADO supoe-se que sim.
  registarResultado("G11: um `!` depois de `secrets/**` abre o exemplo dentro de `secrets/` — de qualquer ferramenta (#595)", falhas([
    ["Read(!) depois", cobre(["Read(./**/secrets/**)", "Read(!.env.example)"], "Read", "secrets/.env.example"), false],
    ["Edit(!) depois, cruza", cobre(["Read(./**/secrets/**)", "Edit(!.env.example)"], "Read", "secrets/.env.example"), false],
    ["Edit(!) depois, sem cruzar", cobre(["Read(./**/secrets/**)", "Edit(!.env.example)"], "Read", "secrets/.env.example", { cruza: false }), true],
    ["um ! que nao casa nao corta", cobre(["Read(./**/secrets/**)", "Read(!.env.sample)"], "Read", "secrets/.env.example"), true],
  ]));
  // Juntar o `ask` e o `deny` numa lista deixava um `!` do `deny` cortar o `ask` que viesse antes na concatenacao.
  // O `!` casa as sondas (`.githooks/commit-msg`, `.githooks/lib/x.mjs`): com o `ask` e o `deny` concatenados, cortava-as.
  registarResultado("G11: um `!` no `deny` nao corta uma regra do `ask` (cada lista por si, #595)", (() => {
    const tipos = emFalta({ deny: ["Edit(!.githooks/**)", "Write(!.githooks/**)"], ask: ["Edit(./.githooks/**)", "Write(./.githooks/**)"] })
      .filter(({ sonda }) => sonda.alvo?.startsWith(".githooks/")).map(({ sonda }) => `${sonda.ferramenta} ${sonda.alvo}`);
    return tipos.length ? [`o \`!\` do deny cortou o ask: ${tipos.join(", ")}`] : [];
  })());

  const tira = (c) => (c.permissions.deny = c.permissions.deny.filter((r) => !r.includes("(!")));
  test("G11: sem os `!`, o `deny` que apanha os exemplos e uma NOTA, nao reprova (#595)", (dir) => {
    patchSettings(dir, tira);
  }, { synthetic: true, code: 0, anyOut: ["o `deny` apanha os ficheiros de EXEMPLO do `.env` (`Read` de `.env.example`"] });
  // O controlo da nota: com os `!` (a fixture como e), nao ha nota.
  test("G11: CONTROLO — com os `!` logo a seguir as regras do `.env`, nem nota nem aviso (#595)", () => {}, {
    synthetic: true, code: 0, excludes: ["ficheiros de EXEMPLO", "cobre a leitura de"],
  });
  test("G11: um `Read(!.env*)` abre os segredos e reprova (#595)", (dir) => {
    patchSettings(dir, (c) => c.permissions.deny.push("Read(!.env*)"));
  }, { synthetic: true, code: 1, includes: ["nenhuma regra `deny` cobre a leitura de `.env.local`", "cobre a leitura de `.env.production.local`"] });
  test("G11: um `!` posto no FIM do `deny` (depois do `secrets/**`) reprova (#595)", (dir) => {
    patchSettings(dir, (c) => {
      tira(c);
      c.permissions.deny.push("Read(!.env.example)");
    });
  }, { synthetic: true, code: 1, includes: ["nenhuma regra `deny` cobre a leitura de `secrets/.env.example`"] });
}
