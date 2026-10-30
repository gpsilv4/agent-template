/**
 * O PREFIXO Conventional Commits (#394): a funcao pura (`lib/prefixo-commit.mjs`) por uma tabela de assuntos, e o
 * passo "Mensagens de commit" do `ci.yml` corrido como o runner o corre, sobre um PR de fixture.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`. E o dono barato do par do
 * `prefixo-commit.mjs` na varredura (`lib/pares-publicos.mjs`).
 *
 * O passo le-se do `ci.yml` REAL (o `passoDoCi` do `tests-portao-ci.mjs`), e nao de uma copia: um `|| true`, um `%s`
 * no lugar do `%B`, ou o titulo fora do hook tem de ficar vermelho aqui. Os valores LITERAIS do `env:` do passo vao
 * para o shell como o runner os da; o `PR_TITULO`, que e do evento, injecta-se — e por isso o `env:` afirma-se a parte.
 */
import { pathToFileURL } from "url";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { correCorpo, gitEm } from "./harness/repo-descartavel.mjs";
import { literaisDoEnv, passoDoCi } from "./tests-portao-ci.mjs";
import { VARIAVEL } from "../lib/nomes-proibidos.mjs";
import { razaoDoPrefixo, tiposDe } from "../lib/prefixo-commit.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-commit-msg-prefixo.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** O nome do passo, igual ao do `ci.yml`. */
const PASSO = "Mensagens de commit — Conventional Commits e titulo do PR, sem atribuicao a IA";
const TIPOS = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "ci"];

/** Recusados: cada um com o pedaco da razao que tem de dar. */
const RECUSADOS = [
  ["update stuff", "forma"], ["Feat: x", "`Feat`"], ["feat:x", "forma"], ["feat(): x", "forma"], ["feat(x) y", "forma"],
  ["wip: x", "`wip`"], ["Merge stuff", "forma"], ["fixup! update stuff", "forma"], ["", "nao tem assunto"], ["fixup! ", "nao tem assunto"],
  ["#394 update", "forma"], ["feat: ", "forma"], ["Squashed commit of the following:", "forma"], ["Apply stuff", "forma"],
];
/** Passam: o que as pessoas, o git, o GitHub e o Dependabot escrevem. */
const PASSAM = [
  "feat(x): y", "feat: y", "fix(a, b)!: y", "feat!: y", "feat(x): y (#12)", "docs(security-tests, audit): z",
  "chore(deps-dev): bump a from 1 to 2", "ci(deps): bump b", "Merge branch 'x'", "Merge branch 'x' of https://h/r into main",
  "Merge pull request #1 from a/b", "Merge remote-tracking branch 'origin/main'", "Merge tag 'v1'", "Revert \"feat: x\"",
  "Reapply \"Revert \\\"feat: x\\\"\"", "fixup! feat: x", "squash! feat: x", "amend! feat: x", "fixup! fixup! fix: x",
  "Merge tags 'a' and 'b'", "Merge commits 'a' and 'b'", "Merge remote-tracking branches 'o/a' and 'o/b'", "Merge https://h/r",
  "Apply suggestions from code review", "Apply suggestion from code review",
];

/** Um PR de fixture: o `main` com dois commits, o PR com `commits`, e o HEAD como o merge ref (pai 1 = a base).
 *  `vazio`: o HEAD e um merge sem nenhum commit novo (o intervalo `HEAD^1..HEAD` sem mensagens). */
function correPasso(corpo, env, { commits = [], vazio = false } = {}) {
  // O prefixo das fixtures do `commit-msg` (`lib/tmp-limpo.mjs`): um prefixo novo pedia uma entrada la.
  const dir = mkdtempSync(join(tmpdir(), "commit-msg-test-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(join(repo, ".agent/scripts/lib"), { recursive: true });
    cpSync(join(ROOT, ".githooks"), join(repo, ".githooks"), { recursive: true });
    for (const f of [".agent/scripts/lib/nomes-proibidos.mjs", ".agent/scripts/lib/prefixo-commit.mjs"]) cpSync(join(ROOT, f), join(repo, f));
    // A tabela da FIXTURE, e nao a do projeto (`TP3`): num derivado sem `docs`, os casos dependiam dela.
    writeFileSync(join(repo, "CONTRIBUTING.md"), "### Types\n\n| Type | Q |\n|---|---|\n| `feat` | a |\n| `fix` | b |\n| `docs` | c |\n| `chore` | d |\n");
    const git = gitEm(repo);
    const commit = (msg) => {
      writeFileSync(join(dir, "msg"), msg);
      git(["commit", "-q", "--allow-empty", "-F", join(dir, "msg")]);
    };
    git(["init", "-q", "-b", "main"]);
    git(["add", "-A"]);
    commit("chore: raiz\n");
    commit("chore: base\n");
    if (vazio) {
      // Um merge com a base e um antepassado dela: nenhum commit novo, e o HEAD^1 e a base.
      const m = git(["commit-tree", "HEAD^{tree}", "-p", "HEAD", "-p", "HEAD^", "-m", "Merge x into y"]).toString().trim();
      git(["reset", "-q", "--hard", m]);
    } else {
      git(["checkout", "-q", "-b", "pr"]);
      for (const c of commits) commit(c);
      git(["checkout", "-q", "main"]);
      git(["merge", "-q", "--no-ff", "-m", "Merge pr into main", "pr"]);
    }
    return correCorpo(corpo, { cwd: repo, env: { ...env, HOME: join(dir, "home-sem-lista") }, runnerTemp: dir, semVars: [VARIAVEL, "COMMIT_MSG_FINAL", "PR_TITULO"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function registar() {
  // --- A funcao pura ------------------------------------------------------------------------------------------------
  registarResultado("prefixo: os assuntos sem o prefixo recusam, cada um pela sua razao (#394)", RECUSADOS.flatMap(([a, diz]) => {
    const r = razaoDoPrefixo(a, TIPOS);
    if (r === undefined) return [`${JSON.stringify(a)} passou`];
    const esperado = diz === "forma" ? "nao tem a forma" : diz;
    return r.includes(esperado) ? [] : [`${JSON.stringify(a)}: a razao foi "${r}", sem "${esperado}"`];
  }));
  registarResultado("prefixo: o que as pessoas, o git, o GitHub e o Dependabot escrevem passa (#394)",
    PASSAM.filter((a) => razaoDoPrefixo(a, TIPOS) !== undefined).map((a) => `${JSON.stringify(a)} recusou: ${razaoDoPrefixo(a, TIPOS)}`));
  registarResultado("prefixo: sem tabela, so a forma (qualquer palavra em minusculas) (#394)", [
    ...(razaoDoPrefixo("qualquer: x", null) === undefined ? [] : ["`qualquer: x` recusou sem tabela"]),
    ...(razaoDoPrefixo("Feat: x", null)?.includes("minusculas") ? [] : ["`Feat: x` passou sem tabela"]),
    ...(razaoDoPrefixo("update stuff", null)?.includes("nao tem a forma") ? [] : ["`update stuff` passou sem tabela"]),
  ]);
  const tabela = "# T\n\n### Types\n\n| Type | Q |\n|---|---|\n| `feat` | a |\n| `build-x` | b |\n\n## Depois\n| `wip` | c |\n";
  registarResultado("prefixo: a tabela le-se ate a seccao seguinte, com LF ou CRLF (#394)", [
    ...(JSON.stringify(tiposDe(tabela)) === JSON.stringify({ estado: "ok", tipos: ["feat", "build-x"] }) ? [] : [`LF: ${JSON.stringify(tiposDe(tabela))}`]),
    ...(JSON.stringify(tiposDe(tabela.replace(/\n/g, "\r\n"))) === JSON.stringify({ estado: "ok", tipos: ["feat", "build-x"] }) ? [] : ["CRLF nao leu"]),
    ...(tiposDe("# T\n\n### Tipos\n| Type | a |\n| `feat` | a |\n").estado === "sem-seccao" ? [] : ["um cabecalho traduzido nao deu `sem-seccao`"]),
    ...(tiposDe("### Types\n\n| Type | Q |\n|---|---|\nnada\n").estado === "sem-linhas" ? [] : ["uma tabela sem linhas nao deu `sem-linhas`"]),
  ]);
  // Um `### Types` de convencoes de TIPOS (um projeto TypeScript) antes do dos commits: sem a tabela `| Type |`, salta-se.
  const ts = "## Codigo\n### Types\n\nUsar `unknown`.\n| `string` | ok |\n\n## Commits\n### Types\n\n| Type | Q |\n|---|---|\n| `feat` | a |\n";
  registarResultado("prefixo: um `### Types` sem a tabela `| Type |` (convencoes de tipos) nao tapa a dos commits (#394)",
    JSON.stringify(tiposDe(ts)) === JSON.stringify({ estado: "ok", tipos: ["feat"] }) ? [] : [`leu ${JSON.stringify(tiposDe(ts))}`]);
  // A tabela DESTE repo: no template tem de se ler; num derivado sem ela (adotado, traduzido) o hook verifica so a forma,
  // e isso e suportado — SKIP. Uma tabela que existe e nao se le reprova em qualquer um (`TP2`).
  const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
  const doRepo = tiposDe(lerRaiz("CONTRIBUTING.md") ?? "");
  if (doRepo.estado === "sem-seccao" && ehDerivado(lerRaiz)) console.log("  SKIP  prefixo: o CONTRIBUTING.md deste projeto nao tem a tabela `### Types` — o hook verifica so a forma (#394)");
  else registarResultado("prefixo: a tabela do CONTRIBUTING.md deste repo le-se (#394)", doRepo.estado === "ok" ? [] : [`estado: ${doRepo.estado}`]);

  // --- O passo do CI ------------------------------------------------------------------------------------------------
  const ci = lerRaiz(".github/workflows/ci.yml");
  const passo = ci === null ? null : passoDoCi(ci, PASSO);
  if (passo === null && ehDerivado(lerRaiz)) {
    console.log(`  SKIP  prefixo: o ci.yml deste projeto nao tem o passo \`${PASSO}\` (#394)`);
    registarResultado("prefixo: sem o passo das mensagens num derivado, nada a medir (#394)", []);
    return;
  }
  registarResultado("prefixo: o passo das mensagens existe no ci.yml e le-se (#394)", passo === null ? [`nao encontrei o \`run: |\` do passo \`${PASSO}\``] : []);
  if (passo === null) return;
  // O `env:` vem dos campos certos (o precedente: `tests-portao-ci.mjs`): os casos abaixo injectam o titulo.
  registarResultado("prefixo: o `env:` do passo da o titulo do PR e o modo do CI (#394)", [
    "PR_TITULO: ${{ github.event.pull_request.title }}", 'COMMIT_MSG_FINAL: "1"',
  ].filter((e) => !passo.env.includes(e)).map((e) => `falta \`${e}\` no env: do passo`));
  const base = { ...literaisDoEnv(passo.env), GITHUB_EVENT_NAME: "pull_request", PR_TITULO: "feat(x): o titulo" };
  const BONS = ["feat(a): um\n", "fix: dois\n\ncorpo\n", "docs(b): tres\n"];
  const casos = [
    { nome: "tres commits bons e um titulo bom passam", env: base, o: { commits: BONS }, verde: true, diz: ["3 mensagem(ns) verificada(s)", "titulo do PR verificado"] },
    { nome: "o 2.o de tres commits sem prefixo reprova (o registo depois do 1.o)", env: base, o: { commits: [BONS[0], "update stuff\n", BONS[2]] }, verde: false, diz: ["nao segue o Conventional Commits", "update stuff"] },
    { nome: "um commit com uma linha `#` no topo (o `-F` guarda-a) reprova", env: base, o: { commits: [BONS[0], "#394 update\n\nfeat: x\n"] }, verde: false, diz: ["#394 update"] },
    // O `%B` e nao o `%s`: a atribuicao vive no corpo, e um passo que so lesse o assunto deixava-a passar.
    { nome: "uma atribuicao a IA no corpo de um commit reprova (o `%B` inteiro)", env: base, o: { commits: [BONS[0], "fix: y\n\nCo-Authored-By: Claude <a@b>\n"] }, verde: false, diz: ["atribui o trabalho a uma ferramenta de IA"] },
    { nome: "os commits bons e o titulo mau reprovam", env: { ...base, PR_TITULO: "Update foo" }, o: { commits: BONS }, verde: false, diz: ["Update foo"] },
    { nome: "fora de um PR o titulo nao conta", env: { ...base, GITHUB_EVENT_NAME: "push", PR_TITULO: "Update foo" }, o: { commits: BONS }, verde: true, diz: ["3 mensagem(ns)"] },
    { nome: "um intervalo sem commits reprova, mesmo com o titulo (o titulo fora do `n`)", env: base, o: { vazio: true }, verde: false, diz: ["Nenhuma mensagem no intervalo"] },
  ];
  for (const c of casos) {
    const r = correPasso(passo.corpo, c.env, c.o);
    registarResultado(`prefixo: o passo do CI — ${c.nome} (#394)`, [
      ...((r.code === 0) === c.verde ? [] : [`esperava ${c.verde ? "verde" : "vermelho"}, saiu ${r.code}: ${r.out.slice(-300)}`]),
      ...c.diz.filter((t) => !r.out.includes(t)).map((t) => `faltou "${t}" no output`),
    ]);
  }
}
