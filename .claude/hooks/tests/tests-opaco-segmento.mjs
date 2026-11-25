/**
 * Um comando que corre noutra shell, decidido POR SEGMENTO, e o `$'...'` na fronteira (`/audit` da v0.64.0, #605) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: o `comandoOpaco` decidia pela 1.a palavra do texto INTEIRO se o que esta entre aspas e codigo. Com um
 * wrapper que nao e opaco a frente (`sudo`, `nice`, `timeout`), ou um comando antes do `;`, o `&&` dentro do `-c` nao
 * partia, o ciclo das invocacoes parava na 1.a palavra do `-c` (`cd`), e o force-push la dentro passava (medido a correr o
 * hook no `main`, `c416f04`, e na `v0.63.6`). E o ponto 2 do #605 visto do outro lado: a mesma decisao, pelo texto
 * inteiro, partia o `;` citado de um git SEGUINTE. Agora decide-se por segmento: cada um e opaco pela SUA cabeca.
 * E o ponto 1 do #605: o corpo de um heredoc que vai para uma shell varre-se, mesmo com um git antes no preambulo.
 * E as shells que o guard do branch nao conhecia (`csh`, `tcsh`, `fish`), e o `$'...'`/`$"..."` que a fronteira apagava.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { PROTEGIDOS_LISTA } from "../lib/protegidos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-opaco-segmento.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const P = "git push --force origin feature/x";

export function registar({ test, corre, repo, eq, SALTA }) {
  const p = PROTEGIDOS_LISTA[0];
  // `protegido` pede o 1.o branch protegido do projeto: sem nenhum, salta (o controlo nao mediria nada).
  const decide = (comando, esperado, protegido = false) => {
    if (protegido && p === undefined) throw SALTA;
    const d = repo(protegido ? p : "feature/x");
    try {
      eq(corre({ tool_input: { command: comando }, cwd: d }).decisao, esperado, `"${comando.replace(/\n/g, "⏎")}"`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  // --- O force-push dentro de um `-c` com um segmento ou um wrapper NAO opaco antes (nega em qualquer branch) -------
  for (const c of [`sudo sh -c 'cd r && ${P}'`, `true; bash -c 'true && ${P}'`, `nice su -c 'cd r && ${P}'`,
    `timeout 60 bash -c 'cd r; ${P}'`, `env A=1 doas sh -c 'cd r; ${P}'`, `true; sh -c 'cd x && ${P}'`,
    `sudo -u me bash -c 'cd r | ${P}'`]) {
    test(`opaco: \`${c}\` NEGA o force-push (a cabeca do segmento, nao a do texto)`, () => decide(c, "deny"));
  }
  // O `runuser` fica opaco pela sua cabeca: com o `-c` composto, o 1.o comando escondia o 2.o.
  for (const c of [`runuser -c 'cd x && ${P}'`, `runuser -c 'git status && ${P}'`, `runuser -u me -c 'true; ${P}'`]) {
    test(`opaco: \`${c}\` NEGA o force-push (o runuser composto)`, () => decide(c, "deny"));
  }
  // O ponto 2 do #605: o `;`/`|` citado de um git SEGUINTE ja nao parte (o segmento do git nao e opaco).
  for (const c of [`sh -c true; git push -o "a;b" --force origin feat`, `bash -c true; git push -o "a|b" origin --force feat`]) {
    test(`opaco: \`${c}\` NEGA o force-push (#605, o segmento seguinte)`, () => decide(c, "deny"));
  }
  // As shells que o guard do branch nao conhecia.
  for (const c of [`fish -c '${P}'`, `tcsh -c '${P}'`, `csh -c '${P}'`, `sudo fish -c 'cd r; ${P}'`, `/usr/bin/fish -c '${P}'`]) {
    test(`opaco: \`${c}\` NEGA o force-push (csh/tcsh/fish)`, () => decide(c, "deny"));
  }

  // --- O corpo de um heredoc que vai para uma shell --------------------------------------------------------------
  const corpo = `\n${P}\nEOF`;
  // O ponto 1 do #605: um git no preambulo nao faz do corpo texto quando quem o recebe e uma shell.
  for (const c of [`git stripspace <<'EOF' | bash${corpo}`, `git stripspace | bash <<'EOF'${corpo}`, `git log; bash <<'EOF'${corpo}`,
    `fish <<'EOF'${corpo}`, `cat <<'EOF' | tcsh${corpo}`]) {
    test(`opaco: \`${c.split("\n")[0]}\` com um force-push no corpo NEGA (#605)`, () => decide(c, "deny"));
  }
  // Os ramos do `ehShell` (#600) que nao tinham caso: depois de um caminho ou de um separador, e flags antes da que eleva.
  for (const c of [`/bin/su - root <<'EOF'${corpo}`, `true;su - <<'EOF'${corpo}`, `sudo -u root -s <<'EOF'${corpo}`,
    `doas -u x -s <<'EOF'${corpo}`]) {
    test(`opaco: \`${c.split("\n")[0]}\` com um force-push no corpo NEGA (o ehShell do #600)`, () => decide(c, "deny"));
  }
  // E com o EQUALS do zsh (#567): o `=?` antes do `su`/`sudo`.
  for (const c of [`=su - root <<'EOF'${corpo}`, `=sudo -s <<'EOF'${corpo}`]) {
    test(`opaco: \`${c.split("\n")[0]}\` com um force-push no corpo NEGA (o EQUALS no ehShell)`, () => decide(c, "deny"));
  }

  // --- Num branch protegido: o commit dentro do `-c` composto ---------------------------------------------------
  for (const c of [`timeout 60 bash -c 'cd r; git commit -m x'`, `nice sh -c 'true && git commit -m x'`]) {
    test(`opaco: \`${c}\` num branch protegido NEGA o commit`, () => decide(c, "deny", true));
  }

  // --- Controlos: o que e TEXTO continua a deixar -----------------------------------------------------------------
  // Um argumento citado de um comando que nao corre o que recebe; o mesmo com um segmento opaco ANTES (era negado
  // pela 1.a palavra do texto: um falso positivo que sai, dito — o `echo` nao corre o que escreve).
  test("opaco: CONTROLO, texto citado depois de um segmento opaco, ou de um wrapper que nao e opaco, DEIXA num branch protegido", () => {
    for (const c of [`echo "a; ${P}"`, `rg "build && ${P}" docs/`, `sudo -u me echo "a; ${P}"`,
      `bash -c 'true'; echo "a; ${P}"`, `fish -c 'git status'`, `nice sh -c 'git log --oneline'`]) decide(c, "allow", true);
  });
  // Uma mensagem para o git num heredoc, com uma shell ANTES no preambulo: quem recebe o corpo e o git. O corpo E o
  // force-push (uma linha so com ele): varrido por engano, negava — e o que faz deste controlo uma prova (o leitor 2).
  test("opaco: CONTROLO, `bash -c 'x' && git commit -F - <<EOF` com um force-push na mensagem DEIXA", () => {
    for (const c of [`bash -c 'x' && git commit -F - <<'EOF'${corpo}`, `git commit -F - <<'EOF'${corpo}`]) decide(c, "allow");
  });
  // Cada ramo do `ultimoComando` com o seu vermelho: com uma shell ANTES, o fallback `ehShell(preambulo)` negava todos se
  // o `quem` nao visse o git que RECEBE o corpo (a redireccao, o `&>`, o `${X}`, o `$(...)`, e o pedaco vazio depois do `)`).
  test("opaco: CONTROLO, o git que recebe o corpo depois de uma redireccao, de uma expansao ou de um `)` DEIXA", () => {
    for (const c of [`bash -c x && git commit -F - 2>&1 <<'EOF'${corpo}`, `bash -c x && git commit -F - &>/dev/null <<'EOF'${corpo}`,
      `bash -c x && git commit -F - \${OPTS} <<'EOF'${corpo}`, `bash -c x && git commit -F - $(echo -q) <<'EOF'${corpo}`,
      `bash -c x && (git commit -F -) <<'EOF'${corpo}`]) decide(c, "allow");
  });

  // --- O que os dois leitores do PR acharam -----------------------------------------------------------------------
  // O `ultimoComando` partia nas redireccoes, nas expansoes e no fecho de um composto: a shell deixava de se ver, e o
  // corpo com o force-push saia da analise (deny -> allow contra o `main`, medido a correr o hook).
  for (const c of [`bash -s 2>&1 <<'EOF'${corpo}`, `bash >&2 <<'EOF'${corpo}`, `bash &>/dev/null <<'EOF'${corpo}`,
    `bash -s -- \${ARGS} <<'EOF'${corpo}`, `bash -s $(pwd) <<'EOF'${corpo}`, `(cd repo && bash -s) <<'EOF'${corpo}`,
    `{ bash -s; } <<'EOF'${corpo}`, `while read l; do bash -s ; done <<'EOF'${corpo}`, `git log 2>&1 | bash <<'EOF'${corpo}`,
    `cat <<'EOF' | bash;${corpo}`, `(cat <<'EOF' | bash)${corpo}`, `cat <<'EOF' |&bash${corpo}`, `/bin/bash <<'EOF'${corpo}`,
    `/usr/bin/fish <<'EOF'${corpo}`]) {
    test(`opaco: \`${c.split("\n")[0]}\` com um force-push no corpo NEGA (leitores do PR)`, () => decide(c, "deny"));
  }
  // A barra dentro de plicas e literal: `'C:\'` fecha a plica, e o `;` a seguir parte.
  // Uma cabeca que nao se le (`$SHELL`, `$(...)`), e o `watch`/`script` (do #607), sao opacos.
  // E o `$'...'`, em que a barra ESCAPA: `$'it\'s'` e uma palavra so, e o `;` a seguir parte (a passagem 2 do leitor).
  for (const c of [`echo 'C:\\'; ${P}`, `sh -c true; echo 'C:\\'; ${P}`, `echo $'it\\'s'; ${P}`, `printf $'don\\'t\\n' && ${P}`, `$SHELL -c "cd r; ${P}"`,
    `$(command -v bash) -c "true; ${P}"`, `watch "y; ${P}"`, `sh -c x; watch "y; ${P}"`, `script -qc "true; ${P}" /dev/null`]) {
    test(`opaco: \`${c}\` NEGA o force-push (leitores do PR)`, () => decide(c, "deny"));
  }

  // --- A fronteira: o `$'...'` e o `$"..."` leem-se como as aspas simples ----------------------------------------
  const nega = (c) => { if (porqueAltera(c) === null) throw new Error(`"${c}": devia negar, deixou`); };
  for (const c of ["rm -r $'.claude/hooks'", "cp /tmp/x $'.claude/hooks/guard-protected-branch.mjs'", "rm -r $'.claude\\x2fhooks'",
    "rm -r $'\\056claude/hooks'", 'rm -r $".claude/hooks"', "rm .claude/$'settings.json'"]) {
    test(`opaco: fronteira — \`${c}\` NEGA (o ANSI-C e o $"..." ja nao se apagam)`, () => nega(c));
  }
  // Controlo: com e sem o `$`, a mesma decisao (le-se igual a uma aspa simples), e um `$'...'` sem caminho continua a sair.
  test("opaco: fronteira — CONTROLO, `$'...'` decide como a aspa simples, e sem caminho da fronteira DEIXA", () => {
    for (const [a, b] of [["grep -n $'\\t' .claude/hooks/x.mjs", "grep -n '\\t' .claude/hooks/x.mjs"],
      ["ls $'.claude/hooks'", "ls '.claude/hooks'"], ["cat $'.claude/settings.json'", "cat '.claude/settings.json'"]]) {
      eq(porqueAltera(a), porqueAltera(b), a);
    }
    for (const c of ["printf $'a\\tb\\n'", "echo $'ok' > /tmp/x", 'echo $"ok"']) eq(porqueAltera(c), null, c);
  });
}
