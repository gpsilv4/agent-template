/**
 * Os falsos positivos do `guard-protected-branch` — {{PROJECT_NAME}}
 *
 * Saiu do `tests-bypasses.mjs` quando ele chegou as 500 linhas (#243): a tabela das formas de
 * CONTORNAR o guard fica la, e a do trabalho LEGITIMO que ele nao pode negar vive aqui. Sao as
 * duas metades da mesma afirmacao, e cada uma cresce por si.
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre-o e chama `registar()`.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-legitimos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`, que importa este modulo e chama registar()."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-hooks.mjs";

export function registar({ test, corre, repo, eq }) {
// --- FALSOS POSITIVOS: negar trabalho legitimo custa tanto como deixar passar --
// Oito destes vinham medidos da mesma leitura. O `git merge-base` negou ao revisor a
// verificacao do range que lhe foi pedida — um falso positivo bloqueia trabalho a serio.
const LEGITIMOS = [
  // --- Falsos positivos medidos na segunda auditoria --------------------------
  // Tres destes bloquearam trabalho de LEITURA durante a propria sessao de correcao. Um
  // guarda que nega `git --version` ou um `grep` nao protege nada — treina a contorna-lo.
  ["command -v git", "command -v git"],
  ["env git --version", "env git --version"],
  ["timeout 5 git --version", "timeout 5 git --version"],
  ["echo com separador dentro de aspas", 'echo "a; git push --force"'],
  ["grep cuja STRING cita um comando", 'rg "build && git push --force" docs/'],
  ["branch -c COPIA, nao destroi", "git branch -c antigo novo"],
  // Limpar o branch depois de mergear o PR — que as `process-rules` mandam fazer. Era negado
  // enquanto a regra julgava pela FLAG; `git push origin --delete fix/x` ja passava, e a
  // incoerencia entre as duas apanhou um derivado real a seguir ao merge do PR dele.
  ["branch -d de um branch nao protegido", "git branch -d fix/ja-mergeado"],
  ["branch -D de um branch nao protegido", "git branch -D feature/abandonada"],
  ["branch -d de varios nao protegidos", "git branch -d fix/a fix/b docs/c"],
  // Publicar uma tag de versao depois do merge — o que o `process-rules.md` manda fazer. Era
  // negado porque a regra so reconhecia a forma `--tags`, e medi-lo ao marcar a v0.4.0 deste
  // repo. Julgado pela FORMA do ref e pela exclusao dos nomes protegidos: perguntar ao git
  // aqui correria no cwd do HOOK e responderia sobre o repo errado.
  ["push de uma tag de versao", "git push origin v0.4.0"],
  ["push de duas tags nomeadas", "git push origin v1.0.0 v1.0.1"],
  ["fetch para refs remote-tracking", "git fetch origin +refs/heads/main:refs/remotes/origin/main"],
  ["symbolic-ref a LER (um argumento)", "git symbolic-ref HEAD"],
  // LER a fronteira tem de continuar trivial. Um guard que nega `cat` ou `git diff` sobre ela
  // treina a gente a contorna-lo — e o `git diff` foi mesmo um falso positivo da primeira
  // versao desta verificacao, apanhado ao medi-la.
  ["cat da fronteira", "cat .claude/settings.json"],
  ["grep na fronteira", "grep -n deny .claude/settings.json"],
  ["jq na fronteira", "jq .permissions .claude/settings.json"],
  ["git diff sobre a fronteira", "git diff .claude/settings.json"],
  ["correr a suite dos hooks", "node .claude/hooks/tests/test-hooks.mjs"],
  // Por SEGMENTO, e nao pelo primeiro verbo da linha: a primeira versao olhava so para o
  // inicio do texto e negava um `for` que corresse a suite. Medido na sessao em que nasceu —
  // bloqueou-me a correr os proprios testes. Um guard que nega trabalho normal e contornado.
  ["for a correr a suite dos hooks", "for s in a b; do node .claude/hooks/tests/test-hooks.mjs; done"],
  ["suite com redireccao para /tmp", "node .claude/hooks/tests/test-hooks.mjs > /tmp/o 2>&1"],
  ["sed -i NOUTRO ficheiro, na mesma linha", "sed -i '' 's/a/b/' README.md && cat .claude/settings.json"],
  // Um `|` DENTRO de aspas partia o comando e o "verbo" do segmento seguinte era um pedaco do
  // padrao de procura. Medido ao tentar ler o proprio hook.
  ["grep com | dentro das aspas", "grep -n 'soTags\\|FORMA_EXIGIDA' .claude/hooks/guard-protected-branch.mjs"],
  // Escrever um ficheiro NOUTRO sitio cujo conteudo MENCIONA a fronteira. Um caminho citado e
  // texto; so um caminho em posicao de argumento e um alvo. Medido ao escrever a mensagem da
  // tag v0.4.0, que descreve esta mesma regra.
  ["heredoc que DESCREVE a fronteira", "cat > /tmp/nota.txt <<'EOF'\nfala de .claude/settings.json e .githooks/\nEOF"],
  // Negar trabalho legitimo custa tanto como deixar passar. O `partir()` tratava `(` e `{`
  // como separadores mesmo DENTRO de aspas, logo um comando que apenas MENCIONA git entre
  // parentesis era negado — e o `eForce` corre ANTES da verificacao de branch, logo nao havia
  // branch nenhum onde passasse. Aconteceu ao proprio revisor, duas vezes.
  ["echo com git entre parentesis", 'echo "(git push --force)"'],
  ["python3 -c que cita git", `python3 -c "print('git push --force')"`],
  ["node -e que cita git", `node -e "console.log('git commit -m x')"`],
  ["config a LER uma chave perigosa", "git config --get core.pager"],
  ["config de identidade (chave inofensiva)", "git config user.email a@b.com"],
  ["merge-base", "git merge-base main HEAD"],
  ["status", "git status --porcelain"],
  ["log", "git log --oneline -5"],
  ["diff", "git diff --name-only main"],
  ["show", "git show HEAD:package.json"],
  ["rev-parse", "git rev-parse --verify main"],
  ["branch (listar)", "git branch --show-current"],
  ["switch para outro branch", "git switch feature/x"],
  ["switch -c cria branch (e como se SAI de main)", "git switch -c fix/algo"],
  ["checkout -b cria branch", "git checkout -b fix/algo"],
  ["add", "git add -A"],
  ["fetch", "git fetch origin"],
  ["stash", "git stash"],
  ["tag a listar", "git tag"],
  ["mencionar num echo nao e executar", 'echo "corre git commit depois"'],
  ["grep sobre docs", 'grep -rn "git push --force" .agent'],
  ["heredoc com o texto la dentro", "cat <<'EOF'\ngit commit -m x\nEOF"],
  ["comentario", "# git commit -m x"],
  ["nome de ficheiro parecido", "cat git-commit-notes.md"],
  ["encadeado de dois verbos seguros", "git switch -c x && git status"],
  // A4: o procedimento de release do PROPRIO repo (deploy.md, CONTRIBUTING.md,
  // process-rules.md) corre em `main`. Negar isso punha o guard contra a documentacao.
  ["pull --ff-only (procedimento de release)", "git pull --ff-only origin main"],
  ["push so de tags (procedimento de release)", "git push origin --tags"],
  // `git push --follow-tags` SAIU daqui: medido com `--dry-run --porcelain` contra um remoto
  // real, publica o refspec normal **mais** as tags — ou seja, publica o branch atual. Estava
  // listado como procedimento de release por analogia com `--tags`, que publica so tags.
  // O procedimento de release usa `--tags`, e esse continua aqui em baixo.
  // B3: nao fazem nada; negar e ruido.
  ["git sozinho", "git"],
  ["git --version", "git --version"],
  ["git --help", "git --help"],
  ["stash list e leitura", "git stash list"],
  ["notes list e leitura", "git notes list"],
  ["submodule status e leitura", "git submodule status"],
  // Apagar um branch de feature JA MERGEADO e rotina, e e o que as regras deste repo mandam
  // fazer depois de um merge. A primeira versao do `eForce` negava qualquer `--delete`, e a
  // primeira coisa que bloqueou foi exatamente esta limpeza — medido, nao imaginado.
  ["apagar um branch de feature no remoto", "git push origin --delete fix/algo"],
  ["apagar um branch de feature por refspec", "git push origin :fix/algo"],
  // Falsos positivos medidos na terceira leitura: sub-verbos comparados contra QUALQUER
  // argumento (a palavra `apply` numa mensagem), `fetch` a disparar com URLs, e a forma
  // aderente do `-b`.
  ["remote add", "git remote add upstream https://x/y.git"],
  ["remote prune", "git remote prune origin"],
  ["submodule update", "git submodule update --init --recursive"],
  ["fetch por URL https", "git fetch https://github.com/o/r main"],
  ["fetch por URL ssh", "git fetch git@github.com:o/r.git"],
  ["stash apply restaura, nao destroi", "git stash apply"],
  ["stash push com 'apply' na mensagem", 'git stash push -m "apply later"'],
  ["checkout -bfeature (forma aderente)", "git checkout -bfeature"],
  ["apagar feature com -dv agrupado", "git push -dv origin fix/algo"],
  ["mencionar depois de um wrapper nao e executar", "sudo -u me echo git commit"],
  ["notes add acrescenta", "git notes add -m x"],
];

for (const [nome, comando] of LEGITIMOS) {
  test(`legitimo em main: ${nome}`, () => {
    const d = repo();
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, "allow", `"${comando}" NAO devia ser negado`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}
}
