/**
 * Testes das SONDAS do Guard 11 (`lib/permissoes.mjs`, #301) — {{PROJECT_NAME}}
 *
 * PORQUE VIVE A PARTE: o `tests-settings.mjs` passava as 500 linhas com estes casos, e a fronteira
 * e natural — aquele afirma o `allow` e os hooks registados, este o `deny`/`ask` que um derivado
 * deixa envelhecer (R7B-1 da ronda 8).
 *
 * NAO e um entry point: o `test-guards.mjs` descobre-o e chama `registar()`.
 */
import { join } from "path";
import { pathToFileURL } from "url";
import { test, writeF, patchSettings, ROOT, registarResultado } from "./harness/test-harness.mjs";
import { emFalta } from "../lib/permissoes.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-settings-sondas.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

export function registar() {
// --- Guard 11: o `deny`/`ask` de um derivado que envelheceu (#301, R7B-1) -----------
// Um derivado real ficou com 18 `deny` e 7 `ask` contra 47 e 22, sem o `ask` dos hooks, e nenhum
// verificador o disse. Um caso por sitio novo do guard e por forma de regra.
//
// TODOS sobre a fixture SINTETICA: na copia do repo, num derivado, o `settings.json` e o DO PROJETO, e
// tirar-lhe uma regra literal do template nao prova nada — um projeto com `Bash(rm:*)` (mais estrito)
// nao tem `Bash(rm -fr:*)` para tirar, e o teste reprovava uma configuracao certa (leitura independente).
const tira = (lista, ...regras) => (c) => (c.permissions[lista] = (c.permissions[lista] ?? []).filter((r) => !regras.includes(r)));
// A pasta dos hooks na sintetica dispara o Guard 17 (os `TETOS` citam a suite deles): os casos que
// esperam 0 usam a dos agentes, que tem o mesmo `pasta`.
const comHooks = (dir) => writeF(dir, ".claude/hooks/lib/x.mjs", "// a pasta existe\n");
const comAgentes = (dir) => writeF(dir, ".claude/agents/x.md", "---\nname: x\ntools: Read\n---\n");
const AGENTES_ASK = ["Edit(./.claude/agents/**)", "Write(./.claude/agents/**)"];
const HOOKS_ASK = ["Edit(./.claude/hooks/**)", "Write(./.claude/hooks/**)"];
const S = { synthetic: true };

test("G11: sem o `ask` de Edit dos hooks avisa (a fronteira)", (dir) => {
  comHooks(dir);
  patchSettings(dir, tira("ask", "Edit(./.claude/hooks/**)"));
}, { ...S, code: 1, includes: ["`Edit` de `.claude/hooks/x.mjs` nao esta em `ask` nem em `deny`"] });

// O contra-caso do `pasta`: um derivado sem a camada so-Claude nao tem hooks a proteger.
test("G11: sem a pasta dos hooks, o `ask` deles nao e exigido", (dir) => {
  patchSettings(dir, tira("ask", ...HOOKS_ASK));
}, { ...S, code: 0, excludes: ["de `.claude/hooks/x.mjs` nao esta"] });

// `*.mjs` cobria os hooks da raiz e deixava o `lib/` aberto — e o `lib/fronteira.mjs` e onde a decisao vive.
test("G11: um `ask` so dos ficheiros da raiz deixa o `lib/` dos hooks a descoberto", (dir) => {
  comHooks(dir);
  patchSettings(dir, (c) => {
    tira("ask", ...HOOKS_ASK)(c);
    c.permissions.ask.push("Edit(./.claude/hooks/*.mjs)", "Write(./.claude/hooks/*.mjs)");
  });
}, { ...S, code: 1, includes: ["`Edit` de `.claude/hooks/lib/x.mjs` nao esta em `ask`"], excludes: ["de `.claude/hooks/x.mjs` nao esta"] });

test("G11: a regra do `ask` movida para o `deny` nao avisa", (dir) => {
  comAgentes(dir);
  patchSettings(dir, (c) => {
    tira("ask", "Edit(./.claude/agents/**)")(c);
    c.permissions.deny.push("Edit(./.claude/agents/**)");
  });
}, { ...S, code: 0, excludes: ["`Edit` de `.claude/agents/x.md` nao esta"] });

// ...e o caso que o torna afirmavel: sem a regra em lado nenhum, a mesma pasta avisa.
test("G11: sem o `ask` dos agentes (com a pasta) avisa", (dir) => {
  comAgentes(dir);
  patchSettings(dir, tira("ask", "Edit(./.claude/agents/**)"));
}, { ...S, code: 1, includes: ["`Edit` de `.claude/agents/x.md` nao esta em `ask` nem em `deny`"] });

// O nome nu e a ferramenta inteira; `/x` e a raiz do projeto (doc do Claude Code); `//x` e absoluto.
test("G11: `Edit` nu e `Write(/.claude/agents/**)` cobrem os agentes", (dir) => {
  comAgentes(dir);
  patchSettings(dir, (c) => {
    tira("ask", ...AGENTES_ASK)(c);
    c.permissions.ask.push("Edit", "Write(/.claude/agents/**)");
  });
}, { ...S, code: 0, excludes: ["de `.claude/agents/x.md` nao esta"] });

test("G11: `Write(//.claude/hooks/**)` (absoluto) nao cobre os hooks do projeto", (dir) => {
  comHooks(dir);
  patchSettings(dir, (c) => {
    tira("ask", "Write(./.claude/hooks/**)")(c);
    c.permissions.ask.push("Write(//.claude/hooks/**)");
  });
}, { ...S, code: 1, includes: ["`Write` de `.claude/hooks/x.mjs` nao esta em `ask` nem em `deny`"] });

test("G11: sem um `rm` destrutivo no `deny` avisa", (dir) => {
  patchSettings(dir, tira("deny", "Bash(rm -fr:*)"));
}, { ...S, code: 1, includes: ["`rm -fr` nao esta em `deny`"] });

// `:*` exige fronteira de palavra (doc do Claude Code): `Bash(rm -:*)` so nega `rm - ...`.
test("G11: `Bash(rm -:*)` nao passa por deny dos `rm` destrutivos", (dir) => {
  patchSettings(dir, (c) => {
    c.permissions.deny = c.permissions.deny.filter((r) => !r.startsWith("Bash(rm ")).concat("Bash(rm -:*)");
  });
}, { ...S, code: 1, includes: ["`rm -rf` nao esta em `deny`", "`rm --recursive --force` nao esta em `deny`"] });

// O `--force-with-lease` e fluxo de rebase legitimo: NOTE. E o `Bash(git push --force:*)` NAO o cobre.
test("G11: sem o deny de `--force-with-lease` da nota, e o `--force:*` nao o cobre", (dir) => {
  patchSettings(dir, tira("deny", "Bash(git push --force-with-lease:*)"));
}, { ...S, code: 0, anyOut: ["NOTE  .claude/settings.json: `git push --force-with-lease` nao esta em `deny`"] });

test("G11: sem o deny de `~/.ssh` avisa a leitura", (dir) => {
  patchSettings(dir, tira("deny", "Read(~/.ssh/**)"));
}, { ...S, code: 1, includes: ["nenhuma regra `deny` cobre a leitura de `~/.ssh/id_ed25519`"] });

// Um nome solto casa a qualquer profundidade (gitignore): `Read(.env)` e `Read(**/.env)` sao a mesma.
test("G11: `Read(.env*)` solto cobre o `.env` aninhado", (dir) => {
  patchSettings(dir, (c) => {
    c.permissions.deny = c.permissions.deny.filter((r) => !/^Read\(\.\/(?:\*\*\/)?\.env/.test(r)).concat("Read(.env*)");
  });
}, { ...S, code: 0, excludes: ["cobre a leitura de `a/b/.env`", "cobre a leitura de `a/.env.local`"] });

test("G11: sem o `ask` de `pip install` da nota, nao reprova", (dir) => {
  patchSettings(dir, tira("ask", "Bash(pip install:*)"));
}, { ...S, code: 0, anyOut: ["NOTE  .claude/settings.json: `pip install` nao esta em `ask` nem em `deny`"] });

// O ANTI-`TP8`, por REMOCAO: cada regra do `deny`/`ask` do template tem de mudar o veredicto do guard
// quando sai. "Exercida por uma sonda" nao chegava — uma regra sobreposta por outra passava, e tira-la
// num derivado ficava invisivel (leitura independente do #301). Uma regra nova sem sonda reprova aqui.
const semEfeito = (perms) => {
  const base = emFalta(perms).length;
  return ["deny", "ask"].flatMap((l) => (perms[l] ?? []).filter((r) => emFalta({ ...perms, [l]: perms[l].filter((x) => x !== r) }).length === base));
};
// As que o template tem A MAIS, de proposito, com a razao: a forma ancorada na raiz e um subconjunto
// da aninhada (`**/` casa zero pastas — a doc do Claude Code da `Read(**/.env)` como bloqueando o da
// raiz), e o template guarda as duas por defesa em profundidade; `id_rsa*` esta dentro de `id_*`.
const REDUNDANTES = new Set([
  "Read(./.env)", "Read(./.env.*)", "Read(./*.pem)", "Read(./*.key)", "Read(./id_rsa*)", "Read(./.npmrc)",
  "Read(./credentials*)", "Read(./secrets/**)", "Edit(./.env*)", "Write(./.env*)", "Read(./**/id_rsa*)",
]);
// O controlo negativo, em qualquer repo: uma regra sem sonda e uma tapada por outra saem; as que
// mudam o veredicto nao.
registarResultado("G11: a remocao um a um apanha a regra sem sonda e a tapada (#301)", (() => {
  const fora = semEfeito({ deny: ["Read(./**/.env*)", "Read(./**/*.kdbx)", "Read(./.env)"], ask: ["Edit(./.githooks/**)", "Bash(cargo add:*)"] });
  const esperado = ["Read(./**/*.kdbx)", "Read(./.env)", "Bash(cargo add:*)"];
  return JSON.stringify(fora) === JSON.stringify(esperado) ? [] : [`devia apanhar ${JSON.stringify(esperado)}; apanhou ${JSON.stringify(fora)}`];
})());
// So no TEMPLATE (a MESMA regra de "derivado" do resto da maquinaria): num derivado, uma regra a mais e
// do projeto. SKIP visivel, e nao um PASS que nao mediu nada.
const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
const settingsRaiz = lerRaiz(".claude/settings.json");
if (ehDerivado(lerRaiz) || settingsRaiz === null) {
  console.log(`  SKIP  G11: remocao um a um das regras do template (${settingsRaiz === null ? "sem .claude/settings.json" : "derivado: as regras a mais sao do projeto"})`);
} else {
  registarResultado("G11: cada regra do deny/ask do template muda o veredicto do guard quando sai (#301)", (() => {
    const p = JSON.parse(settingsRaiz).permissions ?? {};
    const fora = semEfeito(p).filter((r) => !REDUNDANTES.has(r));
    const mortas = [...REDUNDANTES].filter((r) => ![...(p.deny ?? []), ...(p.ask ?? [])].includes(r));
    return [
      ...(fora.length ? [`regras do template que o guard nao ve sair (sonda em falta em lib/permissoes.mjs, ou REDUNDANTES com razao): ${fora.join(", ")}`] : []),
      ...(mortas.length ? [`REDUNDANTES que ja nao estao no template: ${mortas.join(", ")}`] : []),
    ];
  })());
}
}
