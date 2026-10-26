/**
 * Testes do hook `guard-textos-publicos` (#375b) — {{PROJECT_NAME}}
 *
 * O que se afirma: um comando que PUBLICA texto (`gh issue|pr|release|repo|api`, `git tag`, `git commit`) e negado
 * se um texto tem um nome da lista, ou se ha um texto que o hook nao consegue ler; um que nao publica nem le a
 * lista; sem lista, ou num repo desligado, deixa e diz-o uma vez por sessao. A razao nunca traz o nome.
 *
 * Cada caso corre o hook como o Claude Code: o payload no stdin, num tmpdir proprio (o `cwd` do payload), com a
 * lista num ficheiro inventado e o ambiente sem a lista nem o `GIT_*` de quem corre (`TP3`). Os nomes sao inventados.
 *
 * NAO e um entry point. O `test-hooks.mjs` descobre-o e chama `registar()`.
 */
import { execFileSync, spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-textos-publicos.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HOOK = join(ROOT, ".claude/hooks/guard-textos-publicos.mjs");
const LISTA = "# privados\nprojeto-secreto\n";
const SEM_GIT = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k) && k !== "NOMES_PROIBIDOS_FICHEIRO"));

/**
 * Corre o hook. `lista`: o conteudo (`null`: sem lista, com uma HOME vazia); `pasta`: uma PASTA no lugar dela;
 * `dentro`: a lista no `cwd` (um repo git). `desligado`: o interruptor local no `cwd`. `ficheiros`: escritos no `cwd`.
 * `hook`: outro ficheiro de hook (a copia sem a lib). Devolve `{ decisao, razao, aviso }`.
 */
function corre(comando, { lista = LISTA, pasta = false, dentro = false, desligado = false, ficheiros = {}, sessao = "s1", dir: dado, hook = HOOK } = {}) {
  const dir = dado ?? mkdtempSync(join(tmpdir(), "textos-hook-test-"));
  try {
    const cwd = join(dir, "repo");
    mkdirSync(cwd, { recursive: true });
    const env = { ...SEM_GIT(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", HOME: join(dir, "home") };
    // Sempre um repo: a marca da sessao fica no `.claude/state/` dele, dentro do tmpdir, e nunca no repo real.
    execFileSync("git", ["init", "-q"], { cwd, env });
    if (desligado) execFileSync("git", ["config", "--local", "agent-template.nomesProibidos", "desligado"], { cwd, env });
    mkdirSync(env.HOME, { recursive: true });
    const caminho = dentro ? join(cwd, "lista") : join(dir, "lista");
    if (pasta) mkdirSync(caminho, { recursive: true });
    else if (lista !== null) writeFileSync(caminho, lista);
    if (lista !== null || pasta) env.NOMES_PROIBIDOS_FICHEIRO = caminho;
    for (const [rel, conteudo] of Object.entries(ficheiros)) writeFileSync(rel.startsWith("~/") ? join(env.HOME, rel.slice(2)) : join(cwd, rel), conteudo);
    const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ session_id: sessao, cwd, tool_input: { command: comando } }), encoding: "utf8", env });
    const out = (r.stdout ?? "").trim();
    const j = out ? JSON.parse(out) : {};
    return { decisao: j.hookSpecificOutput?.permissionDecision ?? "allow", razao: j.hookSpecificOutput?.permissionDecisionReason ?? "", aviso: j.systemMessage ?? "" };
  } finally {
    if (!dado) rmSync(dir, { recursive: true, force: true });
  }
}

/** Afirma a decisao, o que a razao (ou o aviso) tem, e que o NOME nunca aparece. */
function afirma(r, { decisao, inclui = [], aviso }) {
  const p = [];
  if (r.decisao !== decisao) p.push(`decisao ${r.decisao}, esperado ${decisao} (${r.razao.slice(0, 120)})`);
  for (const s of inclui) if (!r.razao.includes(s)) p.push(`a razao devia ter "${s}": ${r.razao.slice(0, 160)}`);
  if (aviso === false && r.aviso) p.push(`nao devia avisar: ${r.aviso}`);
  if (typeof aviso === "string" && !r.aviso.includes(aviso)) p.push(`o aviso devia ter "${aviso}": "${r.aviso}"`);
  if (/projeto[-_ ]secreto/i.test(`${r.razao}${r.aviso}`)) p.push("o NOME saiu na razao ou no aviso");
  if (p.length) throw new Error(p.join("; "));
}

export function registar({ test }) {
  // --- Um nome, em cada sitio por onde um texto sai -----------------------------------------------
  const NEGA = { decisao: "deny", inclui: ["o nome da linha 2 da lista"] };
  test("textos-publicos: um nome no --body de um gh pr create nega, sem o nome na razao", () =>
    afirma(corre(`gh pr create --title "x" --body "visto no Projeto Secreto"`), { ...NEGA, inclui: ["gh pr create --body: o nome da linha 2 da lista"] }));
  test("textos-publicos: uma variante (sublinhado) no --title nega", () => afirma(corre(`gh issue create --title "projeto_secreto" --body ok`), NEGA));
  test("textos-publicos: um --body-file com o nome nega (le o ficheiro, relativo ao cwd)", () =>
    afirma(corre(`gh issue comment 3 --body-file corpo.md`, { ficheiros: { "corpo.md": "o projeto-secreto\n" } }), NEGA));
  test("textos-publicos: o -F - de um heredoc com o nome nega", () => afirma(corre(`gh issue create -t x -F - <<'EOF'\nvisto no projeto-secreto\nEOF`), NEGA));
  test("textos-publicos: a forma literal \"$(cat <<'EOF' ...)\" e lida, e um nome nela nega", () =>
    afirma(corre(`gh pr create --title t --body "$(cat <<'EOF'\nlinha\nprojeto secreto\nEOF\n)"`), NEGA));
  test("textos-publicos: as notas de uma tag (git tag -m) com o nome negam", () => afirma(corre(`git tag -a v1 -m "release do projeto-secreto"`), NEGA));
  test("textos-publicos: o corpo de um squash (gh pr merge --body) com o nome nega", () => afirma(corre(`gh pr merge 3 --squash --body "projeto-secreto"`), NEGA));
  test("textos-publicos: uma review (gh pr review --body) com o nome nega", () => afirma(corre(`gh pr review 3 --comment --body "projeto-secreto"`), NEGA));
  test("textos-publicos: o comentario de um gh issue close --comment com o nome nega", () => afirma(corre(`gh issue close 3 --comment "projeto-secreto"`), NEGA));
  test("textos-publicos: um gh api -F body=@ficheiro com o nome nega", () =>
    afirma(corre(`gh api -X PATCH repos/o/r/issues/comments/1 -F body=@corpo.md`, { ficheiros: { "corpo.md": "projeto-secreto" } }), NEGA));
  test("textos-publicos: o -d (--draft) do gh pr create nao engole o --title que vem a seguir", () => afirma(corre(`gh pr create -d --title "projeto-secreto" --body b`), NEGA));

  // --- O que as leituras independentes acharam (#375b) ----------------------------------------------
  test("textos-publicos: um `1)` no corpo do \"$(cat <<'EOF' ...)\" nao esconde o resto do corpo", () =>
    afirma(corre(`gh pr create --title t --body "$(cat <<'EOF'\n1) corrigido :)\nprojeto-secreto\nEOF\n)"`), NEGA));
  test("textos-publicos: com dois \"$(cat <<...)\", o SEGUNDO tambem e lido", () =>
    afirma(corre(`gh pr create --title "$(cat <<'A'\nfeat: x\nA\n)" --body "$(cat <<'B'\nprojeto-secreto\nB\n)"`), NEGA));
  test("textos-publicos: as opcoes curtas agrupadas (git tag -am, -aF; git commit -am; gh -dt) sao lidas", () => {
    for (const c of [`git tag -am "notas do projeto-secreto" v1`, `git tag -aF notas.md v1`, `git commit -am "projeto-secreto"`, `gh pr create -dt "projeto-secreto" -b x`])
      afirma(corre(c, { ficheiros: { "notas.md": "projeto-secreto" } }), NEGA);
  });
  test("textos-publicos: um gh dentro de um `for ... do` ou de um `if ... then` e lido", () => {
    for (const c of [`for n in 3 4; do gh issue comment $n --body "projeto-secreto"; done`, `if gh pr view 3; then gh pr comment 3 --body "projeto-secreto"; fi`]) afirma(corre(c), NEGA);
  });
  test("textos-publicos: o --body-file /dev/stdin de um heredoc e o mesmo que -F -", () =>
    afirma(corre(`gh issue create -t x --body-file /dev/stdin <<'EOF'\nprojeto-secreto\nEOF`), NEGA));
  test("textos-publicos: um ~/ no caminho le o ficheiro da home (nao nega por nao o achar)", () =>
    afirma(corre(`gh issue comment 3 --body-file ~/c.md`, { ficheiros: { "~/c.md": "projeto-secreto" } }), NEGA));
  test("textos-publicos: o -R e o subcomando depois de flags (gh issue -R o/r close -c) sao lidos", () => afirma(corre(`gh issue -R o/r close 3 -c "projeto-secreto"`), NEGA));
  test("textos-publicos: gh label --description e gh gist (os ficheiros) sao lidos", () => {
    afirma(corre(`gh label create x --description "projeto-secreto"`), NEGA);
    afirma(corre(`gh gist create --public -d x notas.md`, { ficheiros: { "notas.md": "projeto-secreto" } }), NEGA);
  });
  test("textos-publicos: num repo DESLIGADO, publicar NOUTRO repo (-R, GH_REPO, gh api repos/o/r, git -C, cd) arma a lista", () => {
    for (const c of [`gh issue create -R o/publico --title x --body "projeto-secreto"`, `GH_REPO=o/publico gh issue create --title x --body "projeto-secreto"`,
      `gh api repos/o/publico/issues -f body="projeto-secreto"`, `git -C ../publico tag -a v1 -m "projeto-secreto"`, `cd ../publico && gh pr create --title "projeto-secreto" --body b`])
      afirma(corre(c, { desligado: true }), NEGA);
    afirma(corre(`gh api repos/{owner}/{repo}/issues -f body="projeto-secreto"`, { desligado: true }), { decisao: "allow", aviso: "DESLIGADA neste repo" });
  });

  // --- O que nao se consegue ler nega (TP2) ---------------------------------------------------------
  const NAO_LEU = { decisao: "deny", inclui: ["Nao consegui ler o texto"] };
  test("textos-publicos: um --body com uma expansao (\"$BODY\") nega", () => afirma(corre(`gh pr create --title t --body "$BODY"`), NAO_LEU));
  test("textos-publicos: um -F - que vem de um pipe nega", () => afirma(corre(`cat f | gh issue create -t x -F -`), NAO_LEU));
  test("textos-publicos: um --body-file que nao existe nega", () => afirma(corre(`gh issue comment 3 --body-file nao-existe.md`), NAO_LEU));
  test("textos-publicos: um apostrofo dentro de aspas duplas nao esconde a expansao", () => afirma(corre(`gh pr create --title x --body "Here's the summary: $(cat notas.md)"`), NAO_LEU));
  test("textos-publicos: um heredoc SEM aspas na etiqueta com uma expansao (e um apostrofo) nega", () => afirma(corre(`gh issue create -t x -F - <<EOF\nIt's from $(basename "$PWD")\nEOF`), NAO_LEU));
  test("textos-publicos: um \"$(cat <<'EOF'\" sem a etiqueta de fecho nega", () => afirma(corre(`gh pr create --title t --body "$(cat <<'EOF'\nprojeto-secreto)"`), NAO_LEU));
  test("textos-publicos: o caminho com uma expansao (--body-file \"$F\") nega", () => afirma(corre(`gh issue comment 3 --body-file "$F"`), NAO_LEU));
  test("textos-publicos: um caminho relativo depois de um `cd` que nao se resolve nega", () => afirma(corre(`cd "$X" && gh issue comment 3 --body-file c.md`), NAO_LEU));
  test("textos-publicos: a razao do que nao leu nao traz o VALOR (que pode ter o nome)", () => afirma(corre(`gh pr create --title x --body "projeto-secreto $X"`), NAO_LEU));

  // --- O que passa -----------------------------------------------------------------------------------
  const DEIXA = { decisao: "allow", aviso: false };
  test("textos-publicos: um texto limpo passa", () => afirma(corre(`gh pr create --title "feat: x" --body "projetos secretos em geral"`), DEIXA));
  test("textos-publicos: um comando que nao publica (gh issue view) passa sem ler a lista, mesmo vazia", () => afirma(corre(`gh issue view 3`, { lista: "# nada\n" }), DEIXA));
  test("textos-publicos: um comando sem gh nem git passa", () => afirma(corre(`ls -la`, { lista: "# nada\n" }), DEIXA));
  test("textos-publicos: o que NAO publica (gh pr checkout -b, gh api -X GET -f) passa sem ler a lista, mesmo vazia", () => {
    for (const c of [`gh pr checkout 3 -b x`, `gh api -X GET search/issues -f q=x`]) afirma(corre(c, { lista: "# nada\n" }), DEIXA);
  });

  // --- Os estados da lista ---------------------------------------------------------------------------
  test("textos-publicos: sem lista deixa, e avisa UMA vez por sessao", () => {
    const dir = mkdtempSync(join(tmpdir(), "textos-hook-test-"));
    try {
      const um = corre(`gh pr create --title x --body "projeto-secreto"`, { lista: null, dir });
      const dois = corre(`gh pr create --title x --body y`, { lista: null, dir });
      const outra = corre(`gh pr create --title x --body y`, { lista: null, dir, sessao: "s2" });
      afirma(um, { decisao: "allow", aviso: "nao ha lista" });
      afirma(dois, { decisao: "allow", aviso: false });
      afirma(outra, { decisao: "allow", aviso: "nao ha lista" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("textos-publicos: num repo DESLIGADO deixa, e diz que esta desligado", () =>
    afirma(corre(`gh pr create --title x --body "projeto-secreto"`, { desligado: true }), { decisao: "allow", aviso: "DESLIGADA neste repo" }));
  test("textos-publicos: uma lista vazia nega um comando que publica", () => afirma(corre(`gh pr create --title x --body y`, { lista: "# so isto\n" }), { decisao: "deny", inclui: ["nao tem nenhum nome"] }));
  test("textos-publicos: uma lista ilegivel (uma pasta) nega", () => afirma(corre(`gh pr create --title x --body y`, { pasta: true }), { decisao: "deny", inclui: ["nao se consegue ler"] }));
  test("textos-publicos: uma lista DENTRO do repo nega", () => afirma(corre(`gh pr create --title x --body y`, { dentro: true }), { decisao: "deny", inclui: ["DENTRO do repo"] }));
  test("textos-publicos: sem a lib da lista (um derivado antigo) nega com a razao", () => {
    const dir = mkdtempSync(join(tmpdir(), "textos-hook-test-"));
    try {
      cpSync(join(ROOT, ".claude/hooks"), join(dir, ".claude/hooks"), { recursive: true });
      const r = corre(`gh pr create --title x --body y`, { hook: join(dir, ".claude/hooks/guard-textos-publicos.mjs") });
      if (existsSync(join(dir, ".agent"))) throw new Error("a copia trouxe o .agent/ — o caso nao mede a lib em falta");
      afirma(r, { decisao: "deny", inclui: ["Nao consegui carregar a lista", "/upgrade"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
