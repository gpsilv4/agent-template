/**
 * Tabelas de bypasses do `guard-protected-branch` — {{PROJECT_NAME}}
 *
 * Extraido do `test-hooks.mjs` (615 linhas, contra a regra dos 500 que o `core-rules.md`
 * impoe). Foi o proprio `/review` a apanhar isto, ao correr a seccao 6 sobre este diff.
 *
 * Segue a convencao dos `tests-*.mjs` de `.agent/scripts/`: NAO e um entry point — o
 * `test-hooks.mjs` importa e chama `registar()`, para a ordem dos testes ser explicita.
 *
 * PORQUE VIVE NUMA TABELA: a cobertura de mutacao deste hook deu `2/2 sitios` em tres
 * versoes diferentes — a que tinha 32 defeitos, a que tinha 22, e a atual. O numero nao se
 * move porque mede se cada aviso EXISTENTE e observado. O instrumento que o substitui e esta
 * lista de formas: cresce quando se encontra outra. Ver `AP6` em `anti-patterns.md`.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";

// NAO e um entry point: corrido diretamente nao afirmaria nada e sairia 0 — a forma canonica
// do `AP2`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-bypasses.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`, que importa este modulo e chama registar()."
  );
  process.exit(1);
}

export function registar({ test, corre, repo, eq, contem }) {
// --- BYPASSES: as formas conhecidas de contornar o guard ---------------------
// Sem numero de propósito: escrever o tamanho da tabela em prosa foi errado duas vezes no
// mesmo dia (dizia 28 com 47 casos). O que nao envelhece sao os EVENTOS: a primeira leitura
// independente encontrou 23 formas, a medicao completa dessa ronda deu 28 formas + 3 de
// force-push + 1 falso positivo, e a segunda leitura encontrou mais 22 defeitos.
// A versao anterior deste hook procurava os verbos PERIGOSOS com uma regex de posicao de
// comando, e tinha 100% de cobertura de mutacao (2/2 sitios) — com 23 formas de a contornar.
// A cobertura media que cada aviso EXISTENTE e observado; nao mede os que faltam. Esta tabela
// e a resposta: cada forma vive aqui como caso, e a lista cresce quando se encontra outra.
// Quatro delas foram criadas pela correcao anterior, que retirava as aspas em bloco.
const BYPASSES = [
  ["eval sem aspas", "eval git commit -m x"],
  ["eval com aspas", 'eval "git commit -m x"'],
  ["eval com aspas simples", "eval 'git commit -m x'"],
  ["sh -c", 'sh -c "git commit -m x"'],
  ["bash -c", 'bash -c "git push"'],
  ["caminho absoluto", "/usr/bin/git commit -m x"],
  ["caminho relativo", "./git commit -m x"],
  ["sudo", "sudo git commit -m x"],
  ["env", "env git commit -m x"],
  ["env com atribuicao", "env GIT_DIR=.git git commit -m x"],
  ["atribuicao inline", "GIT_AUTHOR_NAME=x git commit -m y"],
  ["command", "command git commit -m x"],
  ["exec", "exec git push"],
  ["xargs", "echo x | xargs git commit -m"],
  ["nohup", "nohup git push"],
  ["timeout", "timeout 5 git push"],
  ["backticks", "echo `git commit -m x`"],
  ["substituicao $()", "echo $(git commit -m x)"],
  ["grupo com chaves", "{ git commit -m x; }"],
  ["subshell", "(git commit -m x)"],
  ["if/then", "if true; then git commit -m x; fi"],
  ["for/do", "for i in 1; do git push; done"],
  ["negacao !", "! git commit -m x"],
  ["verbo entre aspas", 'git "commit" -m x'],
  ["verbo ofuscado por aspas", 'git comm""it -m x'],
  ["verbo com escapes", "git \\c\\o\\m\\m\\i\\t -m x"],
  ["depois de &&", "npm test && git commit -m x"],
  ["depois de ;", "npm test; git push"],
  ["verbo desconhecido (falha FECHADA)", "git frobnicate --hard"],
  ["verbo em variavel (nao identificavel)", "git $VERBO"],
  ["reset --hard", "git reset --hard HEAD~1"],
  ["restore descarta trabalho", "git restore ."],
  ["clean apaga ficheiros", "git clean -fd"],
  ["checkout sem -b pode descartar", "git checkout -- ."],
  // Achados de uma segunda leitura independente: o verbo esta em SEGUROS e a FLAG e que
  // destroi. O primeiro faz o que `reset --hard` faz, e a versao com blocklist negava-o.
  ["switch -C reposiciona o branch atual", "git switch -C main HEAD~1"],
  ["checkout -B reposiciona um branch existente", "git checkout -B main HEAD~1"],
  ["branch -f move um branch protegido", "git branch -f master HEAD~1"],
  ["branch -D apaga um branch protegido", "git branch -D develop"],
  ["fetch com refspec escreve refs locais", "git fetch . HEAD:master"],
  ["stash drop destroi", "git stash drop"],
  ["tag -d apaga uma tag", "git tag -d v1.0.0"],
  ["reflog expire destroi a rede de recuperacao", "git reflog expire --expire=now --all"],
  ["remote set-url muda o destino do push", "git remote set-url origin git@x:y.git"],
  ["config --unset apaga configuracao", "git config --unset user.email"],
  ["add -p e interativo (um hook nao responde)", "git add -p"],
  ["pull SEM --ff-only pode criar merge commit", "git pull origin main"],
  ["push de um branch, mesmo com --tags", "git push origin main --tags"],
];

for (const [nome, comando] of BYPASSES) {
  test(`bypass: ${nome}`, () => {
    const d = repo("main");
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, "deny", `"${comando}" tinha de ser negado em main`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

// --- FALSOS POSITIVOS: negar trabalho legitimo custa tanto como deixar passar --
// Oito destes vinham medidos da mesma leitura. O `git merge-base` negou ao revisor a
// verificacao do range que lhe foi pedida — um falso positivo bloqueia trabalho a serio.
const LEGITIMOS = [
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
  ["push --follow-tags", "git push --follow-tags"],
  // B3: nao fazem nada; negar e ruido.
  ["git sozinho", "git"],
  ["git --version", "git --version"],
  ["git --help", "git --help"],
  ["stash list e leitura", "git stash list"],
  ["notes list e leitura", "git notes list"],
  ["submodule status e leitura", "git submodule status"],
];

for (const [nome, comando] of LEGITIMOS) {
  test(`legitimo em main: ${nome}`, () => {
    const d = repo("main");
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, "allow", `"${comando}" NAO devia ser negado`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

// --- Force-push: negado em QUALQUER branch, incluindo as formas de refspec ------
const FORCES = [
  ["--force", "git push --force"],
  ["-f", "git push -f origin main"],
  ["flags juntas", "git push -uf origin main"],
  ["refspec com +", "git push origin +main:main"],
  ["atraves de eval", 'eval "git push --force"'],
  // M1: apagar um branch remoto destroi tanto como um force-push, e escapava.
  ["refspec vazia apaga o remoto", "git push origin :main"],
  ["--delete apaga o remoto", "git push origin --delete main"],
  ["--mirror forca tudo e apaga o que falta", "git push --mirror origin"],
];
for (const [nome, comando] of FORCES) {
  test(`force-push (branch nao protegido): ${nome}`, () => {
    const d = repo("feature/x");
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, "deny", `"${comando}" tinha de ser negado mesmo fora de main`);
      contem(r.razao, "Force-push");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

test("--force-with-lease NAO e negado (nao e force cru)", () => {
  const d = repo("feature/x");
  try {
    eq(corre({ tool_input: { command: "git push --force-with-lease" }, cwd: d }).decisao, "allow", "force-with-lease");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// --- Sem pista de diretorio: antes PERMITIA (lista vazia = ciclo que nao corre) -
}
