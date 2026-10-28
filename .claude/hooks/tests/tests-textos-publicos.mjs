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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { SEM_PRAZO_ATE } from "../lib/resposta.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-textos-publicos.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HOOK = join(ROOT, ".claude/hooks/guard-textos-publicos.mjs");
const LISTA = "# privados\nprojeto-secreto\n";
// Sem o `NODE_OPTIONS` de quem corre: umas opcoes que escrevem avisos no stderr punham vermelho cada "allow" (#397).
const SEM_GIT = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k) && k !== "NOMES_PROIBIDOS_FICHEIRO" && k !== "NODE_OPTIONS"));

/**
 * Corre o hook. `lista`: o conteudo (`null`: sem lista, com uma HOME vazia); `pasta`: uma PASTA no lugar dela;
 * `dentro`: a lista no `cwd` (um repo git). `desligado`: o interruptor local no `cwd`. `ficheiros`: escritos no `cwd`.
 * `hook`: outro ficheiro de hook (a copia sem a lib). `semRepo` (#397, M1): o `cwd` NAO e um repo e e a HOME, com a
 * lista no caminho por omissao (`~/.config/...`), como numa sessao aberta na `$HOME`; `envExtra` junta ao ambiente.
 * Devolve `{ decisao, razao, aviso, status, stderr }`.
 */
function corre(comando, { lista = LISTA, pasta = false, dentro = false, desligado = false, ficheiros = {}, sessao = "s1", dir: dado, hook = HOOK, semRepo = false, envExtra = {} } = {}) {
  const dir = dado ?? mkdtempSync(join(tmpdir(), "textos-hook-test-"));
  try {
    if (semRepo) return correSemRepo(comando, realpathSync(dir), envExtra, semRepo === "quebrado");
    const cwd = join(dir, "repo");
    mkdirSync(cwd, { recursive: true });
    const env = { ...SEM_GIT(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", HOME: join(dir, "home"), ...envExtra };
    // Sempre um repo: a marca da sessao fica no `.claude/state/` dele, dentro do tmpdir, e nunca no repo real.
    execFileSync("git", ["init", "-q"], { cwd, env });
    if (desligado) execFileSync("git", ["config", "--local", "agent-template.nomesProibidos", "desligado"], { cwd, env });
    mkdirSync(env.HOME, { recursive: true });
    const caminho = dentro ? join(cwd, "lista") : join(dir, "lista");
    if (pasta) mkdirSync(caminho, { recursive: true });
    else if (lista !== null) writeFileSync(caminho, lista);
    if (lista !== null || pasta) env.NOMES_PROIBIDOS_FICHEIRO = caminho;
    for (const [rel, conteudo] of Object.entries(ficheiros)) {
      const f = rel.startsWith("~/") ? join(env.HOME, rel.slice(2)) : join(cwd, rel);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, conteudo);
    }
    return chama(hook, comando, cwd, env, sessao);
  } finally {
    if (!dado) rmSync(dir, { recursive: true, force: true });
  }
}

/** O hook, como o Claude Code o chama: o payload no stdin. Guarda o exit code e o stderr (um "allow" silencioso pode
 *  ser um crash, e o `afirma` exige que nao seja). */
function chama(hook, comando, cwd, env, sessao = "s1") {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ session_id: sessao, cwd, tool_input: { command: comando } }), encoding: "utf8", env });
  const out = (r.stdout ?? "").trim();
  const j = out ? JSON.parse(out) : {};
  return { decisao: j.hookSpecificOutput?.permissionDecision ?? "allow", razao: j.hookSpecificOutput?.permissionDecisionReason ?? "", aviso: j.systemMessage ?? "", status: r.status, stderr: r.stderr ?? "" };
}

/** O `cwd` fora de qualquer repo, que e a HOME e tem a lista no caminho por omissao. O `GIT_CEILING_DIRECTORIES` no
 *  pai (caminhos REAIS: no macOS o `/var` e `/private/var`) impede o git de subir para um repo onde o `TMPDIR` esteja;
 *  e a precondicao afirma-se, senao o caso podia correr dentro de um repo e passar sem provar nada. */
function correSemRepo(comando, dir, envExtra, quebrado = false) {
  const cwd = join(dir, "casa");
  mkdirSync(join(cwd, ".config", "agent-template"), { recursive: true });
  // `quebrado`: um `.git` que aponta para nada (uma worktree partida): o git falha, mas NAO por estar fora de um repo.
  if (quebrado) writeFileSync(join(cwd, ".git"), "gitdir: /nao/existe/.git/worktrees/x\n");
  writeFileSync(join(cwd, ".config", "agent-template", "nomes-proibidos"), LISTA);
  const env = { ...SEM_GIT(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", HOME: cwd, GIT_CEILING_DIRECTORIES: dir, ...envExtra };
  if (spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, env, encoding: "utf8" }).status === 0) throw new Error("precondicao: o cwd do caso esta dentro de um repo");
  return chama(HOOK, comando, cwd, env);
}

/** Afirma a decisao, o que a razao (ou o aviso) tem, e que o NOME nunca aparece. */
function afirma(r, { decisao, inclui = [], aviso }) {
  const p = [];
  if (r.decisao !== decisao) p.push(`decisao ${r.decisao}, esperado ${decisao} (${r.razao.slice(0, 120)})`);
  for (const s of inclui) if (!r.razao.includes(s)) p.push(`a razao devia ter "${s}": ${r.razao.slice(0, 160)}`);
  if (aviso === false && r.aviso) p.push(`nao devia avisar: ${r.aviso}`);
  if (typeof aviso === "string" && !r.aviso.includes(aviso)) p.push(`o aviso devia ter "${aviso}": "${r.aviso}"`);
  if (/projeto[-_ ]secreto/i.test(`${r.razao}${r.aviso}`)) p.push("o NOME saiu na razao ou no aviso");
  // Um "allow" e o stdout vazio: tambem e o que deixa um hook que rebentou FORA do seu `try` (um import, a sintaxe).
  // So vale com exit 0 e o stderr calado (#397). Um erro DENTRO do `try` sai 0 e calado, de proposito: isso nao se ve aqui.
  if (decisao === "allow" && (r.status !== 0 || r.stderr.trim())) p.push(`allow com exit ${r.status} e stderr "${r.stderr.trim().slice(0, 120)}": pode ser um crash`);
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
  // #399: os alvos que publicavam fora do repo sem se verem. Retirar uma regra poe o seu teste VERMELHO (o comando
  // passava a ser deixado); a varredura mede cada sitio do `out.alvoExterno = true`.
  const DESL = { desligado: true };
  test("textos-publicos: num repo DESLIGADO, um gist e um `repo create` sao externos", () => {
    afirma(corre(`gh gist create --public -d "projeto-secreto" notas.md`, { ...DESL, ficheiros: { "notas.md": "x" } }), NEGA);
    afirma(corre(`gh repo create dono/novo --public -d "projeto-secreto"`, DESL), NEGA);
  });
  test("textos-publicos: num repo DESLIGADO, `gh repo edit dono/outro` e externo; sem o repo, nao (mesmo com `--add-topic x`)", () => {
    afirma(corre(`gh repo edit dono/outro -d "projeto-secreto"`, DESL), NEGA);
    afirma(corre(`gh repo edit --add-topic x -d "projeto-secreto"`, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
  });
  test("textos-publicos: num repo DESLIGADO, um URL no lugar do issue e externo (mesmo do proprio repo: falso positivo aceite)", () =>
    afirma(corre(`gh issue comment https://github.com/o/publico/issues/3 -b "projeto-secreto"`, DESL), NEGA));
  test("textos-publicos: num repo DESLIGADO, o `-R` colado (`-Ro/r`) e externo; um titulo `-Refactor x`, nao", () => {
    afirma(corre(`gh issue create -Ro/publico --title x --body "projeto-secreto"`, DESL), NEGA);
    afirma(corre(`gh issue create --title "-Refactor x" --body "projeto-secreto"`, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
  });
  test("textos-publicos: num repo DESLIGADO, `GH_REPO=` depois de `time`/`sudo`/`timeout 5 env` e de `export FOO` e externo (como no main)", () => {
    for (const c of [`time GH_REPO=o/publico gh issue create --title x --body "projeto-secreto"`, `sudo GH_REPO=o/publico gh issue create --title x --body "projeto-secreto"`,
      `timeout 5 env GH_REPO=o/publico gh issue create --title x --body "projeto-secreto"`, `export FOO GH_REPO=o/publico && gh issue create --title x --body "projeto-secreto"`])
      afirma(corre(c, DESL), NEGA);
  });
  test("textos-publicos: num repo DESLIGADO, um `export GH_REPO=` noutro comando e externo (e o vazio, como antes); num texto, nao", () => {
    afirma(corre(`export GH_REPO=o/publico && gh issue create --title x --body "projeto-secreto"`, DESL), NEGA);
    afirma(corre(`GH_REPO= gh issue create --title x --body "projeto-secreto"`, DESL), NEGA);
    afirma(corre(`gh issue create --title "projeto-secreto" --body "GH_REPO=x funciona?"`, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
  });
  test("textos-publicos: num repo DESLIGADO, um `gh api` fora de `repos/{owner}/{repo}` e externo, e a rota nao se desloca com as flags", () => {
    afirma(corre(`gh api gists -f description="projeto-secreto"`, DESL), NEGA);
    afirma(corre(`gh api -f body="projeto-secreto" repos/{owner}/outro/issues/1/comments`, DESL), NEGA);
    afirma(corre(`gh api -f body="projeto-secreto" repos/{owner}/{repo}/issues/1/comments`, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
    afirma(corre(`gh api -H "Accept: x" repos/{owner}/{repo}/issues -f title="projeto-secreto"`, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
  });
  test("textos-publicos: num repo DESLIGADO, o `graphql` so e externo com uma `mutation` (ou sem nenhuma `query` lida, como no `--input`)", () => {
    afirma(corre(`gh api graphql -f query='mutation { addComment(input:{body:"projeto-secreto"}) { clientMutationId } }'`, DESL), NEGA);
    afirma(corre(`gh api graphql --input q.json -f x="projeto-secreto"`, { ...DESL, ficheiros: { "q.json": "{}" } }), NEGA);
    afirma(corre(`gh api graphql -f query='query{repository(owner:"o",name:"projeto-secreto"){id}}'`, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
  });
  test("textos-publicos: a rotina deixa — num repo DESLIGADO a falar de si, e com a lista armada sem nomes (#399)", () => {
    for (const c of [`gh pr comment 3 -b "projeto-secreto"`, `gh repo edit -d "projeto-secreto"`, `gh issue create --label bug --title "projeto-secreto" --body b`,
      `gh release create v1 --notes "projeto-secreto"`])
      afirma(corre(c, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
    for (const c of [`git push -u origin "$(git branch --show-current)"`, `git push origin --delete x`, `git push origin :x`, `git push --tags`, `git tag -l 'v0.*'`,
      `git tag -d v1`, `gh label list`, `gh pr create --head feature/x --title t --body b`, `gh repo create --source . --private`])
      afirma(corre(c), { decisao: "allow" });
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

  // --- Um ficheiro escrito no MESMO comando (#396) ----------------------------------------------------
  // O ficheiro lido existe e esta LIMPO em todos: a negacao so pode vir da escrita (o hook le antes de correr).
  const LIMPOS = { "pr.md": "texto limpo\n", "n.md": "notas\n", "t.txt": "tag\n", "b.json": "{}\n", "b.md": "ok\n", "a.md": "ok\n" };
  const ESCRITO = { decisao: "deny", inclui: ["escrito neste mesmo comando", "numa chamada e publicar noutra"] };
  const DEIXA = { decisao: "allow", aviso: false };
  test("textos-publicos: um cat > f <<'EOF' antes de --body-file f nega, mesmo com o f velho limpo (#396)", () => {
    afirma(corre(`cat > pr.md <<'EOF'\nvisto no projeto-secreto\nEOF\ngh pr create --title t --body-file pr.md`, { ficheiros: LIMPOS }), ESCRITO);
    afirma(corre(`gh pr create --title t --body-file pr.md`, { ficheiros: LIMPOS }), DEIXA);
  });
  test("textos-publicos: cada forma de escrever o ficheiro lido nega (#396)", () => {
    for (const c of [`printf x | tee pr.md && gh pr create -t t --body-file pr.md`, `cp a.md pr.md && gh pr create -t t -F pr.md`,
      `cp ../a.md . && gh issue comment 3 --body-file a.md`, `echo x >> pr.md && gh issue comment 3 --body-file pr.md`,
      `gh issue comment 3 --body-file pr.md &> pr.md`, `gh pr create -t t -F pr.md > pr.md`, `git log -1 > n.md && gh release create v1 -F n.md`,
      `printf x > t.txt; git tag -a v1 -F t.txt`, `echo x > b.json && gh api repos/{owner}/{repo}/issues --input b.json`,
      `echo x > b.md && gh api -X PATCH repos/o/r/issues/comments/1 -F body=@b.md`, `echo x | dd of=pr.md && gh issue comment 3 --body-file pr.md`,
      `echo x > "$F" && gh issue comment 3 --body-file pr.md`, `x=$(tee pr.md </dev/null); gh issue comment 3 --body-file pr.md`,
      `for i in 1 2; do gh issue comment $i --body-file pr.md; echo x > pr.md; done`])
      afirma(corre(c, { ficheiros: LIMPOS }), ESCRITO);
  });
  test("textos-publicos: o que as leituras do #396 acharam tambem nega (pasta absoluta, pipeline, ciclo, interior)", () => {
    const NA_HOME = { ...LIMPOS, "~/a.md": "ok\n", "~/d/a.md": "ok\n" };
    for (const c of [`cp ../a.md ~/ && gh issue comment 3 --body-file ~/a.md`, `cp -r ../d ~/ && gh issue comment 3 --body-file ~/d/a.md`,
      `cp -t ~/ ../a.md && gh issue comment 3 --body-file ~/a.md`, `cp --target-directory=. ../x.md && gh issue comment 3 --body-file a.md`,
      `gh issue comment 3 --body-file pr.md | tee pr.md`, `if true; then for i in 1 2; do gh issue comment $i --body-file pr.md; echo x > pr.md; done; fi`,
      `x=$(tee pr.md </dev/null); cd .. && gh issue comment 3 --body-file repo/pr.md`])
      afirma(corre(c, { ficheiros: NA_HOME }), ESCRITO);
  });
  test("textos-publicos: o que nao escreve o ficheiro lido continua a passar (#396)", () => {
    for (const c of [`echo x > outro.md && gh pr create -t t --body-file pr.md`, `cat pr.md && gh pr create -t t --body-file pr.md`,
      `git add -A && git commit -F pr.md`, `cd . && gh issue comment 3 --body-file pr.md`, `find . -name x && gh issue comment 3 --body-file ./pr.md`,
      `mkdir -p . && gh issue comment 3 --body-file pr.md`, `gh issue edit 3 --body-file pr.md`, `gh issue comment 3 --body-file pr.md 2>&1`,
      `gh issue comment 3 --body-file pr.md 2>/dev/null`, `gh issue comment 3 --body-file pr.md && rm pr.md`, `gh issue comment 3 --body-file pr.md; mv pr.md old.md`,
      `URL=$(gh pr create -t t --body-file pr.md) && rm pr.md`])
      afirma(corre(c, { ficheiros: LIMPOS }), DEIXA);
    // Depois de um `cd` que nao se resolve, so o filtro dos descritores impede o `2>&1` de contar como escrita de tudo.
    afirma(corre(`cd "$X" && gh issue comment 3 --body-file ~/pr.md 2>&1`, { ficheiros: { "~/pr.md": "texto limpo\n" } }), DEIXA);
  });

  // --- O que passa -----------------------------------------------------------------------------------
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

  // --- Os seguimentos do /audit pre-tag (#397) -------------------------------------------------------
  const NEGA_NOME = { decisao: "deny", inclui: ["o nome da linha 2 da lista"] };
  test("textos-publicos: fora de um repo, com o cwd na HOME que tem a lista, publica sem o falso 'DENTRO do repo' (#397, M1)", () => {
    afirma(corre(`gh issue create -R o/r --title t --body ok`, { semRepo: true }), { decisao: "allow", aviso: false });
    afirma(corre(`gh issue create -R o/r --title t --body "projeto-secreto"`, { semRepo: true }), NEGA_NOME);
    // O controlo: num repo com a lista DENTRO, continua a negar.
    afirma(corre(`gh pr create --title x --body y`, { dentro: true }), { decisao: "deny", inclui: ["DENTRO do repo"] });
    // Um repo AVARIADO (o `.git` aponta para nada) nao e "fora de um repo": o `cwd` serve de raiz, e a lista nele nega.
    afirma(corre(`gh issue create -R o/r --title t --body ok`, { semRepo: "quebrado" }), { decisao: "deny", inclui: ["DENTRO do repo"] });
  });
  // Um `git` FALSO no PATH: nesta maquina e no CI o git nao esta traduzido, e um caso com `LANG=pt_PT` nao media nada
  // (leitura 2 do #397). O falso diz a frase em portugues sem `LC_ALL=C`, ou a falha que se lhe pede.
  test("textos-publicos: o hook le a frase do git em LC_ALL=C; e as outras falhas do git mantem o cwd como raiz (#397, R2)", () => {
    const dir = mkdtempSync(join(tmpdir(), "textos-hook-test-"));
    try {
      const falso = (nome, corpo) => {
        const d = join(dir, nome);
        mkdirSync(d);
        writeFileSync(join(d, "git"), `#!/bin/sh\n${corpo}\n`, { mode: 0o755 });
        return d;
      };
      const FORA = "fatal: not a git repository (or any of the parent directories): .git";
      const traduz = falso("traduz", `if [ "$LC_ALL" = C ]; then echo "${FORA}" >&2; else echo "fatal: nao e um repositorio git (nem nenhuma das pastas acima): .git" >&2; fi\nexit 128`);
      afirma(corre(`gh issue create -R o/r --title t --body ok`, { semRepo: true, envExtra: { PATH: `${traduz}:${process.env.PATH}`, LANG: "pt_PT.UTF-8" } }), { decisao: "allow", aviso: false });
      // Falha fechada: a lista no `cwd` volta a contar como "dentro do repo".
      const DENTRO = { decisao: "deny", inclui: ["DENTRO do repo"] };
      const dubio = falso("dubio", `echo "fatal: detected dubious ownership in repository at '$PWD'" >&2\nexit 128`);
      afirma(corre(`gh issue create -R o/r --title t --body ok`, { semRepo: true, envExtra: { PATH: `${dubio}:${process.env.PATH}` } }), DENTRO);
      // E sem nenhum git no PATH (uma pasta vazia).
      mkdirSync(join(dir, "vazia"));
      afirma(corre(`gh issue create -R o/r --title t --body ok`, { semRepo: true, envExtra: { PATH: join(dir, "vazia") } }), DENTRO);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("textos-publicos: um cwd que ja nao existe nega, em vez de rebentar e permitir (#397, leitura 1)", () => {
    const dir = mkdtempSync(join(tmpdir(), "textos-hook-test-"));
    try {
      const env = { ...SEM_GIT(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", HOME: dir, NOMES_PROIBIDOS_FICHEIRO: join(dir, "lista") };
      writeFileSync(env.NOMES_PROIBIDOS_FICHEIRO, LISTA);
      afirma(chama(HOOK, `gh pr create --title x --body y`, join(dir, "apagada"), env), { decisao: "deny", inclui: ["ja nao existe"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("textos-publicos: uma opcao global do git com valor (--config-env, --attr-source) nao esconde o commit/tag (#397, M2)", () => {
    for (const c of [`git --config-env a=B commit -m "projeto-secreto"`, `git --attr-source X tag -a v1 -m "projeto-secreto"`]) afirma(corre(c), NEGA_NOME);
  });
  test("textos-publicos: o git config da chave do interruptor nega, com e sem lista, e outra chave passa (#397, M4)", () => {
    const INTERRUPTOR = { decisao: "deny", inclui: ["interruptor dos nomes proibidos", "decisao do utilizador"] };
    for (const c of [`git -C . config --local agent-template.nomesproibidos desligado`, `git config --get agent-template.nomesProibidos`,
      `git --git-dir=.git config AGENT-TEMPLATE.NOMESPROIBIDOS x`, `git --config-env a=B config agent-template.nomesProibidos desligado`, `git config --unset agent-template.nomesProibidos`]) {
      afirma(corre(c), INTERRUPTOR);
      afirma(corre(c, { lista: null }), INTERRUPTOR);
    }
    afirma(corre(`git -C . config user.name x`), { decisao: "allow", aviso: false });
  });
  test("textos-publicos: um comando com mais de 4000 caracteres (o worker com prazo) le o nome DEPOIS do caracter 4000 (#397, M5)", () => {
    const longo = (fim) => `gh pr create --title t --body "${"linha de texto ".repeat(300)}${fim}"`;
    if (longo("").length <= SEM_PRAZO_ATE) throw new Error(`o caso nao passa dos ${SEM_PRAZO_ATE} caracteres: nao mede o worker`);
    afirma(corre(longo("projeto-secreto")), NEGA_NOME);
    afirma(corre(longo("fim")), { decisao: "allow", aviso: false });
  });
  test("textos-publicos: um 'allow' de um hook que rebentou (exit 3, stdout vazio) reprova o afirma (#397, controlo semeado)", () => {
    const dir = mkdtempSync(join(tmpdir(), "textos-hook-test-"));
    try {
      // Os dois ramos: um exit != 0 calado, e um exit 0 com o stderr escrito.
      for (const [nome, corpo] of [["rebenta.mjs", "process.exit(3);\n"], ["fala.mjs", "console.error('TypeError: x');\n"]]) {
        const falso = join(dir, nome);
        writeFileSync(falso, corpo);
        const r = corre(`gh pr create --title x --body y`, { hook: falso });
        let lancou = false;
        try { afirma(r, { decisao: "allow", aviso: false }); } catch { lancou = true; }
        if (!lancou) throw new Error(`o afirma aceitou como 'allow' o hook ${nome}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("textos-publicos: as opcoes globais do git com valor vivem numa so lista; uma copia NOVA noutro hook reprova (#397, M2)", () => {
    // As tres copias do nucleo da fronteira convergem no #336 (com um corpus diferencial); ate la, sao as unicas excecoes.
    const CONHECIDAS = new Set(["lib/fronteira-dados.mjs", "lib/fronteira.mjs", "lib/verbos-git.mjs", "guard-protected-branch.mjs"]);
    const raiz = join(ROOT, ".claude/hooks");
    const fontes = {};
    const anda = (d, rel = "") => { for (const n of readdirSync(d)) { const p = join(d, n); const r = rel ? `${rel}/${n}` : n; if (statSync(p).isDirectory()) { if (n !== "tests") anda(p, r); } else if (n.endsWith(".mjs")) fontes[r] = readFileSync(p, "utf8"); } };
    anda(raiz);
    if (copiasDaLista(fontes, CONHECIDAS).length) throw new Error(`copias da lista fora da fonte: ${copiasDaLista(fontes, CONHECIDAS).join(", ")}`);
    // Os controlos: uma copia em regex SEM `exec-path`, e uma em array.
    for (const copia of ["/^--(?:git-dir|config-env)$/", `["-C", "--attr-source"]`])
      if (!copiasDaLista({ "lib/nova.mjs": copia }, CONHECIDAS).includes("lib/nova.mjs")) throw new Error(`o teste nao viu a copia ${copia}`);
  });
}

/** Os ficheiros, fora dos `conhecidos`, que escrevem uma opcao global do git com valor. O marcador e qualquer das que
 *  so servem para isto (o `git-dir`/`work-tree` nao: o `textos-publicos` le-os por outra razao, o repo do comando). */
function copiasDaLista(fontes, conhecidos) {
  return Object.entries(fontes).filter(([rel, t]) => !conhecidos.has(rel) && /exec-path|config-env|attr-source|namespace/.test(t)).map(([rel]) => rel);
}
