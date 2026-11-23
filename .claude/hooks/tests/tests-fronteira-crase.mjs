/**
 * A crase EXECUTA, tambem quando e "so um caminho" (#568) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: o `executados()` (`caminhos.mjs`) isentava uma crase com UMA palavra sem metacaracteres — pensada para o
 * markdown de uma mensagem de commit. Mas o shell corre-a: depois de um `cd` para a fronteira, `` true `/tmp/w` `` corre
 * um script qualquer LA DENTRO, e passava (medido no `main` a 23 nov, 9 formas, tambem entre aspas duplas e num heredoc
 * sem aspas). A isencao sai: uma crase fora de aspas simples e de heredoc citado e sempre uma substituicao, como o `$(...)`.
 *
 * O CUSTO, dito: uma mensagem com `` `.claude/hooks` `` entre aspas duplas passa a negar. A razao diz porque e o que
 * funciona (plicas, `-F <ficheiro>`, `<<'EOF'`) — a `NOTA_CRASE` do `razaoDe`, so quando ha uma crase fora de plicas.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-fronteira-crase.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** Um excerto da `NOTA_CRASE` (`fronteira-dados.mjs`): afirmar a nota prende a razao certa (TP1). */
const NOTA = "a crase EXECUTA";

export function registar({ test, corre, repo, eq, contem }) {
  const nega = (c) => { if (porqueAltera(c) === null) throw new Error(`"${c}": devia negar, deixou`); };
  const deixa = (c) => { const r = porqueAltera(c); if (r !== null) throw new Error(`"${c}": devia deixar, negou (${r})`); };
  const razao = (comando) => {
    const d = repo("feature/x");
    try {
      return corre({ tool_input: { command: comando }, cwd: d });
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  // --- O buraco: a crase de uma palavra corre um script, depois de um `cd` para a fronteira -------------------------
  for (const c of ["cd .claude/hooks && true `/tmp/w`", "cd .claude/hooks && echo `/tmp/w`", "cd .claude/hooks && cat `/tmp/w`",
    'cd .claude/hooks && true "`/tmp/w`"', "cd .githooks && true `/tmp/w`", "cd .claude/hooks; true `/tmp/w`",
    "cd .claude/hooks && true `./w`"]) {
    test(`crase: \`${c}\` NEGA (#568)`, () => nega(c));
  }
  // Sem `/`, o shell procura `w` no PATH, e nao na pasta: nao e o buraco, e nega por ser conservador (o `$(w)` tambem).
  test("crase: `cd .claude/hooks && true `w`` NEGA, como o `$(w)` (#568)", () => {
    nega("cd .claude/hooks && true `w`");
    nega("cd .claude/hooks && true $(w)");
  });

  // --- A fronteira numa crase EXECUTADA: entre aspas duplas, num heredoc sem aspas, num titulo ---------------------
  for (const c of ["git commit -F- <<EOF\nfix: `.claude/hooks`\nEOF", "git commit -m \"fix(hooks): ajusta `.claude/hooks/x.mjs`\"",
    "gh pr create --title \"x `.claude/hooks` y\" --body x", "echo `.claude/settings.json`"]) {
    test(`crase: \`${c.replace(/\n/g, "⏎")}\` NEGA (#568)`, () => nega(c));
  }

  // --- Do leitor 2: a crase ANINHADA (`` \` `` corre), e uma aspa solta numa crase de heredoc sem aspas -----------------
  // O 4.o caso negava no `main` e a 1.a versao deste ticket deixava-o (a plica escondia o `rm`): a regressao fica presa.
  for (const c of ["echo `echo \\`rm -rf .claude/hooks/\\``", "cd .claude/hooks && echo `echo \\`/tmp/w\\``",
    "echo \"`echo \\`rm -rf .claude/hooks\\``\"", "cat <<EOF\n`a'`\nEOF\nrm -rf .claude/hooks", "cat <<EOF\n`a b'`\nEOF\nrm -rf .claude/hooks",
    "cat <<EOF\n`a\"`\nEOF\nrm -rf .githooks"]) {
    test(`crase: \`${c.replace(/\n/g, "⏎")}\` NEGA (#568)`, () => nega(c));
  }
  // Da releitura focada: o interior de uma crase ou de um heredoc lido DUAS vezes (ou pelas aspas de fora) — o `"x"`
  // virava ` "" `, e o `#` seguinte passava a comentario e engolia o `rm`. Os dois primeiros negavam no `main`, e a
  // 2.a versao deste ticket deixava-os; o rotulo afirma que nega PELO `rm`, e nao por acaso.
  for (const c of ["cat <<EOF\n$(echo \"x\"#; rm -rf .claude/hooks)\nEOF", "cat <<EOF\n`echo \"x\"#; rm -rf .claude/hooks`\nEOF",
    "echo `echo \\`echo \"x\"#; rm -rf .claude/hooks\\``", "echo `echo \"x\"#; rm -rf .claude/hooks`",
    "cat <<EOF\n$(echo x; rm -rf .claude/hooks)\nEOF",
    // Da 2.a releitura: o fim de uma crase lido por um `indexOf` (fechava na escapada), um `$(...)` que fechava no `)` de
    // dentro de uma crase, e o interior de um heredoc cuja linha do `<<` abre aspas. Os tres deixavam no `main`.
    'echo "`echo \\`true\\``"; rm -rf .claude/hooks',
    'cat <<EOF "\n$(rm -rf .claude/hooks)\nEOF\n"',
    // Da 3.a releitura: uma crase POR FECHAR dentro de `"$(...)"` engolia o resto (negavam no `main`, e a 3.a versao
    // deixava-os). O comentario dentro de `$(...)` (`# it's⏎)`, ja aberto no `main`) fica para o leitor de shell: ler
    // comentarios no `fimSubst` abriu quatro deny -> allow novos (a 4.a releitura: `"$(echo a\ #)"; rm <f>`).
    'echo "$(true # `\n)"; rm -rf .claude/hooks', 'echo \\` "$(true # `\n)"; rm -rf .claude/hooks; echo `true`',
    'echo "$(true `\n)"; rm -rf .claude/hooks', 'echo "$(echo a\\ #)"; rm .claude/settings.json',
    'echo "$(echo a\\;#)"; rm .claude/settings.json', 'echo "$(echo a\\\n#)"; rm .claude/settings.json',
    'echo "$(echo a #b)"; rm .claude/settings.json',
    // Da 5.a releitura: uma crase por fechar (para o `fimSubst`) e uma plica dentro de uma crase, em `"$(...)"`. O
    // `main` deixava os dois (engolia ate ao fim, ou lia a plica pelas aspas de fora).
    '"$(echo `)`)"; rm .claude/hooks/x', "\"$(echo `echo '`; rm .claude/hooks/x; echo `'`)\""]) {
    test(`crase: \`${c.replace(/\n/g, "⏎")}\` NEGA pelo \`rm\` (#568)`, () => eq(porqueAltera(c), "verbo-nao-e-leitura:rm", c));
  }
  // Da 2.a releitura: reler a regex dos heredocs em CADA nivel de `"$(` levava 4 s (o `main`: 58 ms). Folga larga.
  test("crase: `\"$(` aninhado 200 vezes com 2000 `<<a` decide em menos de 1,5 s (#568)", () => {
    const c = 'echo "' + '$("'.repeat(200) + "\n<<a".repeat(2000) + ')"'.repeat(200) + '"';
    const t = Date.now();
    porqueAltera(c);
    if (Date.now() - t > 1500) throw new Error(`levou ${Date.now() - t} ms`);
  });

  // --- O que NAO executa continua a deixar --------------------------------------------------------------------------
  for (const c of ["git commit -m 'fix(hooks): ajusta `.claude/hooks/x.mjs`'", "git commit -F - <<'EOF'\nfix: ajusta `.claude/hooks/x.mjs`\nEOF",
    "git commit -F /tmp/msg.txt", "echo 'usa `/tmp/w`'", "true `/tmp/w`", 'echo "\\`.claude/hooks\\`"',
    "git commit -m \"docs: corre `npm test` antes\"",
    // O ramo das crases do `fronteira.mjs` (fronteira SO em texto) fica como estava: um comentario e o `<<\EOF`.
    "ls x # ver `.claude/hooks`", "cat <<\\EOF\n`.claude/hooks`\nEOF",
    // Controlo medido na revalidacao (23 nov): corre um `x` na pasta ATUAL, a classe do script opaco. Deixava e deixa.
    "echo `.claude/hooks$(x)`",
    // Um `$(...)` que so LE, num heredoc sem aspas: expande-se como texto, nao se executa o resultado (a 2.a versao
    // punha-o como ` $(...) ` numa subshell, e negava pelo verbo `$`).
    "cat <<EOF\n$(cat .claude/hooks/README.md)\nEOF"]) {
    test(`crase: \`${c.replace(/\n/g, "⏎")}\` DEIXA (#568)`, () => deixa(c));
  }

  // --- A razao: a nota da crase so quando ha uma crase que o shell EXECUTA (`executaCrase`) -------------------------
  for (const c of ["git commit -m \"fix: o `.claude/hooks` agora nega\"", "gh pr create --title \"x `.claude/hooks` y\" --body x",
    // Do leitor 1: uma plica dentro das aspas duplas, e uma barra escapada antes de uma crase verdadeira.
    "git commit -m \"fix: it's `.claude/hooks`, don't\"", "git commit -m \"it's `.claude/hooks`\" && echo 'x'",
    "git commit -m \"a \\\\`.claude/hooks`\"", "git commit -F- <<EOF\nfix: `.claude/hooks`\nEOF"]) {
    test(`crase: \`${c.replace(/\n/g, "⏎")}\` nega com a nota da crase (#568)`, () => {
      const r = razao(c);
      eq(r.decisao, "deny", c);
      contem(r.razao, NOTA);
    });
  }
  // Da releitura focada: o `executaCrase` corre FORA do `try` do `porqueAltera`. Com `"$(` aninhado 19000 vezes (abaixo
  // do tecto de 100000 caracteres) a pilha rebentava ali, o hook saia 0 e DEIXAVA o que o `porqueAltera` negou (medido).
  test("crase: aninhamento fundo em aspas duplas, pelo hook, continua a NEGAR (#568)", () => {
    const c = 'rm -rf .claude/hooks; echo "' + '$("'.repeat(19000) + ')"'.repeat(19000) + '"';
    eq(razao(c).decisao, "deny", "aninhamento fundo");
  });
  // Do leitor 1: o `<<'EOF'` com um template literal e a forma mais comum de escrever um hook — a nota mandava usar o
  // `<<'EOF'` a quem ja o usava. E um comentario, um `$'...'` com plica escapada, e um `<<\EOF`, que nao executam.
  for (const c of ["rm -rf .claude/hooks", "echo 'a `b`' && rm -rf .claude/hooks",
    "cat <<'EOF' > .claude/hooks/x.mjs\nconst a = `${b}`;\nEOF", "cat <<\\EOF > .claude/hooks/x.mjs\nconst a = `${b}`;\nEOF",
    "rm -rf .claude/hooks # ver `x`", "echo $'a\\' `b`' && rm -rf .claude/hooks"]) {
    test(`crase: \`${c}\` nega SEM a nota da crase (#568)`, () => {
      const r = razao(c);
      eq(r.decisao, "deny", c);
      if (r.razao.includes(NOTA)) throw new Error(`"${c}": sem crase executada, a razao nao devia ter a nota`);
    });
  }
}
