/**
 * O que o git EXECUTA de uma opcao ou variavel (#253) — {{PROJECT_NAME}}
 *
 * Num branch de FEATURE, onde se trabalha: a fronteira lia o caminho citado como texto, e o git
 * executava-o (`lib/verbos-git.mjs`, `valoresQueExecutam`; julgado em `lib/fronteira.mjs`). Vive a
 * parte do `tests-bypasses.mjs`, que chegou as 498 linhas com estes casos.
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre-o e chama `registar()`.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-git-executa.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`, que importa este modulo e chama registar()."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-hooks.mjs";

const F = ".claude/hooks/x.mjs";

/** Medido: todas estas passavam num branch de feature. Em `main` negavam por ACIDENTE (o valor
 *  com espaco partia o token e o verbo ficava irreconhecivel). */
const EXECUTA = [
  ["-c alias com !", `git -c alias.x='!rm -rf ${F}' x`],
  ["-c alias sem ! (sub-verbo do git)", `git -c alias.x='rm ${F}' x`],
  ["-c core.pager", `git -c core.pager='rm ${F}' log`],
  ["-c core.sshCommand", `git -c core.sshCommand='rm ${F}' fetch origin`],
  ["-c diff.external", `git -c diff.external='rm ${F}' diff`],
  ["GIT_PAGER a frente do git", `GIT_PAGER='rm ${F}' git log`],
  ["GIT_SSH_COMMAND a frente do git", `GIT_SSH_COMMAND='rm ${F}' git fetch`],
  ["archive --exec", `git archive --remote=. --exec='rm ${F}' HEAD`],
  ["archive --exec separado", `git archive --remote=. --exec 'rm ${F}' HEAD`],
  ["rebase --exec", `git rebase --exec 'rm ${F}' HEAD~1`],
  ["rebase -x", `git rebase -x 'rm ${F}' HEAD~1`],
  ["clone -u", `git clone -u 'rm ${F}' x y`],
  ["fetch --upload-pack", `git fetch --upload-pack='rm ${F}' origin`],
  ["grep -O", `git grep -O'rm ${F}' foo`],
  ["grep -nO agrupado", `git grep -nO'rm ${F}' foo`],
  ["grep --open-files-in-pager", `git grep --open-files-in-pager='rm ${F}' foo`],
  ["grep --op abreviado", `git grep --op='rm ${F}' foo`],
  ["difftool -x", `git difftool -x 'rm ${F}'`],
  ["bisect run", `git bisect run rm ${F}`],
  // Das duas leituras do #253: o git ACRESCENTA argumentos ao que executa, e o valor sozinho nao
  // tocava a fronteira; um separador colado escondia o `git`; uma cabeca escondia a atribuicao;
  // as formas abreviadas e coladas que o parse-options aceita.
  ["alias ! com o alvo nos argumentos", `git -c alias.x='!rm' x ${F}`],
  ["alias sem ! com o alvo nos argumentos", `git -c alias.d=rm d ${F}`],
  ["grep -O colado ao comando", "git grep -Orm deny .claude/hooks"],
  ["upload-pack com o alvo nos argumentos", "git fetch --upload-pack='rm -rf' .claude/hooks"],
  ["separador colado (;git)", `true;git -c alias.x='!rm ${F}' x`],
  ["separador colado (&&git)", `cd /tmp&&git -c alias.x='!rm ${F}' x`],
  ["subshell colada", `(git -c alias.x='!rm ${F}' x)`],
  ["atribuicao atras de uma cabeca", `GIT_PAGER='rm ${F}' env git -p log`],
  ["GIT_EDITOR atras de command", `GIT_EDITOR='rm ${F}' command git commit`],
  ["GIT_CONFIG_PARAMETERS", `GIT_CONFIG_PARAMETERS="'core.pager=rm ${F}'" git -p log`],
  ["rebase -x colado", `git rebase -x'rm ${F}' HEAD~1`],
  ["rebase --exe abreviado", `git rebase --exe='rm ${F}' HEAD~1`],
  ["fetch --upload abreviado", `git fetch --upload='rm ${F}' x`],
  ["submodule foreach", `git submodule foreach 'rm -f ${F}'`],
  ["filter-branch --tree-filter", `git filter-branch --tree-filter 'rm -f ${F}' HEAD`],
  ["um git executado que traz outro -c (um nivel so)", `git bisect run git -c alias.x='!rm ${F}' x`],
  // Da 3.a leitura: a continuacao de linha, o formato `'k'='v'`, as curtas agrupadas, o valor de
  // uma flag de cabeca, e o `$(...)` dentro de aspas duplas, que corre.
  ["continuacao de linha antes do -c", `git \\\n  -c alias.x='!rm ${F}' x`],
  ["continuacao de linha depois da atribuicao", `GIT_PAGER='rm ${F}' \\\ngit -p log`],
  ["GIT_CONFIG_PARAMETERS 'k'='v'", `GIT_CONFIG_PARAMETERS="'core.pager'='rm ${F}'" git -p log`],
  ["rebase -ix agrupado", `git rebase -ix 'rm ${F}' HEAD~3`],
  ["atribuicao atras de env -u FOO", `GIT_PAGER='rm ${F}' env -u FOO git -p log`],
  ["$(git ...) dentro de aspas duplas", `echo "$(git -c alias.x='!rm ${F}' x)"`],
  // Da 4.a leitura: o nome das pastas atras de `$PWD` num git aninhado, e o `$(...)` em aspas duplas
  // com um `)` ou uma aspa impar citados la dentro.
  ["$PWD num git aninhado", `git rebase -x "git -c alias.y='!rm -rf \\$PWD/.claude/hooks' y" HEAD~1`],
  ["`)` citado dentro de \"$(...)\"", `echo "$(echo ')'; git -c alias.x='!rm ${F}' x)"`],
  ["aspa impar dentro de \"$(...)\"", `echo "$(echo '"')"; git -c alias.x='!rm ${F}' x`],
  // O tecto (`MAX_EXECUTADOS`): acima dele nega sem abrir nenhum — cada um, inofensivo, passaria.
  ["mais de 16 valores executados", `git ${"-c core.pager=cat ".repeat(17)}log ${F}`],
];

/** O contra-caso, no mesmo branch: o que o git executa e uma LEITURA, ou nao ha opcao que execute.
 *  O alias `!git status` e o `--textconv` nao tocam a fronteira (ver `verbos-git.mjs`). */
const LEGITIMOS = [
  ["GIT_PAGER=cat", "GIT_PAGER=cat git log"],
  ["pager que LE a fronteira", `git -c core.pager='cat ${F}' log`],
  ["grep -c conta, nao configura", "git grep -c foo"],
  ["branch -c copia", "git branch -c a b"],
  ["grep NA fronteira", `git grep -n deny ${F}`],
  ["-c que nao executa", "git -c color.ui=false log"],
  ["alias ! sem fronteira (ABERTO)", "git -c alias.x='!git status' x"],
  ["log --textconv (ABERTO)", "git log -p --textconv"],
  // Falsos positivos das leituras: um CAMINHO nao e um comando, e as opcoes de outro comando
  // depois de um separador nao sao do git.
  ["-c core.hooksPath (um caminho)", "git -c core.hooksPath=.githooks commit -m x"],
  ["o -x do ls depois de um rebase", "git rebase main && ls -x .claude/hooks"],
  ["um `run` depois de um bisect, noutro comando", "git bisect reset; grep -n run .githooks/commit-msg"],
  ["apply --index nao e --index-filter", `git apply --index ${F}`],
  // Da 3.a leitura: a mensagem de um commit cita a fronteira (o resto vai re-citado), um booleano
  // nao e um comando, e um git aninhado SEM fronteira nao e negado com a razao dela.
  ["commit cuja mensagem cita a fronteira", `GIT_EDITOR=true git commit -m "fix(hooks): ajusta ${F}"`],
  ["pager.log=false com um caminho da fronteira", `git -c pager.log=false log -- ${F}`],
  ["rebase -x com um git -c aninhado, sem fronteira", "git rebase -i -x 'GIT_EDITOR=true git commit --amend' HEAD~3"],
  ["foreach com um git -c, sem fronteira", "git submodule foreach 'git -c core.pager=cat log -1'"],
  // Da 5.a leitura: uma mensagem por heredoc que DESCREVE estas formas — a do commit deste ticket.
  ["commit por heredoc que cita uma forma", `git commit -m "$(cat <<'EOF'\nfix(hooks): x\n\nAntes, git -c core.pager='rm ${F}' log passava.\nEOF\n)"`],
];

export function registar({ test, corre, repo, eq, contem }) {
  const decide = (comando) => {
    const d = repo("feature/x");
    try {
      return corre({ tool_input: { command: comando }, cwd: d });
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };
  for (const [nome, comando] of EXECUTA) {
    test(`git que executa (branch de feature): ${nome}`, () => {
      const r = decide(comando);
      eq(r.decisao, "deny", `"${comando}" executa na fronteira`);
      contem(r.razao, "git-que-executa");
    });
  }
  for (const [nome, comando] of LEGITIMOS) {
    test(`git que executa, legitimo (branch de feature): ${nome}`, () => {
      eq(decide(comando).decisao, "allow", `"${comando}" NAO devia ser negado`);
    });
  }
  // Custo (2.a leitura): a recursao sem tecto crescia ~2,3x por `bisect run`, e um hook que excede
  // o prazo PERMITE. Quarenta aninhados tem de dar a resposta, depressa.
  test("git que executa: quarenta `bisect run` aninhados negam depressa", () => {
    const t0 = Date.now();
    eq(decide(`rm -rf .claude/hooks; ${"git bisect run ".repeat(40)}true`).decisao, "deny", "nega");
    eq(Date.now() - t0 < 5000, true, `demorou ${Date.now() - t0} ms`);
  });
  // E o `"$(` aninhado (4.a leitura): o interior varrido de novo com as aspas trocadas crescia.
  test("git que executa: vinte `\"$(` aninhados negam depressa", () => {
    const t0 = Date.now();
    eq(decide(`echo ${'"$(a '.repeat(20)}x${')"'.repeat(20)}; rm -rf .claude/hooks`).decisao, "deny", "nega");
    eq(Date.now() - t0 < 5000, true, `demorou ${Date.now() - t0} ms`);
  });
}
