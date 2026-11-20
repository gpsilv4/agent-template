/**
 * O EQUALS do zsh (`=git`, `=gh`, `=bash`) nos tres guards (#567) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: no zsh (a shell do Bash do Claude Code aqui) o EQUALS vem ligado — `=git` corre o `/usr/bin/git`. Os
 * leitores tiravam o nome com `replace(/^.*\//, "")`, e `=git` ficava `=git`: `=git push --force origin main`, um heredoc
 * para `=bash`, `=git -c core.pager='rm ...' log` e `=gh issue comment ... <nome>` passavam (medido no `main` a 20 nov).
 * A correcao le o nome com e sem o `=`, e nega se qualquer das leituras negar (o precedente do #546): os casos "N1"
 * (negavam no `main` por a leitura antiga ver o `git`) prendem a leitura antiga na uniao.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { PROTEGIDOS_LISTA } from "../lib/protegidos.mjs";
import { afirma, corre as correTextos, NEGA } from "./tests-textos-publicos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-equals.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const NOME = "projeto-secreto";
const F = ".claude/hooks/x.mjs";

export function registar({ test, corre, repo, eq, SALTA }) {
  const p = PROTEGIDOS_LISTA[0];
  const decide = (comando, esperado, branch) => {
    if (branch === undefined && p === undefined) throw SALTA;
    const d = repo(branch);
    try {
      eq(corre({ tool_input: { command: comando.replaceAll("<P>", p ?? "main") }, cwd: d }).decisao, esperado, `"${comando}"`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  // --- O guard do branch protegido -------------------------------------------------------------------------------
  for (const c of ["=git commit -m x", "env =git commit -m x", "sudo =git commit -m x", "=sudo git commit -m x",
    "=env =git push origin <P>", "=bash -s <<'EOF'\ngit commit -m x\nEOF", "cat <<'EOF' | =bash\ngit commit -m x\nEOF",
    '=sh -c "echo a; git commit -m x"']) {
    test(`equals: \`${c.split("\n")[0]}\` num branch protegido NEGA (#567)`, () => decide(c, "deny"));
  }
  // O force-push e negado em QUALQUER branch: com o `=`, tambem.
  test("equals: `=git push --force` num branch de feature NEGA (#567)", () => decide("=git push --force origin <P>", "deny", "feature/x"));
  // N1: o `main` ja negava (a leitura antiga ve o `git`/`sh`); a uniao das duas leituras tem de continuar a negar.
  test("equals: N1 — `=git stripspace <<EOF | bash` com um force-push no corpo NEGA (#567)", () =>
    decide("=git stripspace <<'EOF' | bash\ngit push --force origin <P>\nEOF", "deny", "feature/x"));
  test('equals: N1 — `=sh -c true; git push -o "a;b" --force` NEGA (#567)', () =>
    decide('=sh -c true; git push -o "a;b" --force origin feat', "deny", "feature/x"));
  // Controlos: um verbo seguro, um `=git` que e argumento, e o `=` de um teste.
  // E o `"=git"` CITADO: o zsh nao o expande, e nao ha comando `=git`.
  for (const c of ["=git status", "echo =git", '[ "$a" = b ] && git status', '"=git" commit -m x']) {
    test(`equals: CONTROLO — \`${c}\` num branch protegido DEIXA (#567)`, () => decide(c, "allow"));
  }
  // Falso positivo dito: o `semVerboEInofensivo` procura o `git` sem `=`.
  test("equals: `=git --version` num branch protegido NEGA — falso positivo aceite (#567)", () => decide("=git --version", "deny"));

  // --- Os textos publicos -----------------------------------------------------------------------------------------
  for (const c of [`=gh issue comment 1 --body "${NOME}"`, `env =gh issue comment 1 --body "${NOME}"`,
    `=git commit -m "${NOME}"`, `=git tag -a v1 -m "${NOME}"`, `=env =gh issue comment 1 --body "${NOME}"`]) {
    test(`equals: textos — \`${c}\` NEGA com a lista (#567)`, () => afirma(correTextos(c), NEGA));
  }
  test("equals: textos — CONTROLO, `=gh` sem o nome DEIXA (#567)", () =>
    afirma(correTextos('=gh issue comment 1 --body "texto limpo"'), { decisao: "allow" }));
  // Falso positivo dito: o `=gh` nao esta nos `LEITORES`, e o `body.md` conta como escrito pelo proprio comando.
  test("equals: textos — `=gh -F body.md` limpo NEGA, como escrito (falso positivo aceite, #567)", () =>
    afirma(correTextos("=gh issue comment 1 -F body.md", { ficheiros: { "body.md": "texto limpo\n" } }), { decisao: "deny", inclui: ["escrito neste mesmo comando"] }));
  // O `=cd` e o `/usr/bin/cd`: NAO muda a pasta da shell, e o `gh` le o `body.md` daqui. Com o ficheiro nas DUAS pastas
  // e o nome so no daqui, ler o `=cd` como `cd` lia o limpo e deixava. O controlo (`cd`) le o de la e deixa.
  const duas = { "body.md": `${NOME}\n`, "sub/body.md": "texto limpo\n" };
  test("equals: textos — `=cd sub; gh -F body.md` le o body.md DAQUI e NEGA (#567)", () =>
    afirma(correTextos("=cd sub; gh issue comment 1 -F body.md", { ficheiros: duas }), NEGA));
  test("equals: textos — CONTROLO, `cd sub; gh -F body.md` le o de la e DEIXA (#567)", () =>
    afirma(correTextos("cd sub; gh issue comment 1 -F body.md", { ficheiros: duas }), { decisao: "allow" }));
  // O `=env -C sub` muda a pasta do `gh` como o `env -C sub`: o relativo deixa de se ler DAQUI. Com o nome so no de LA, ler
  // o daqui (limpo) deixava; o `mudaAPasta` manda-o para o "nao li", e nega. (Com o nome no daqui, nao distinguia nada.)
  const la = { "body.md": "texto limpo\n", "sub/body.md": `${NOME}\n` };
  for (const v of ["env", "=env"]) {
    test(`equals: textos — \`${v} -C sub gh -F body.md\` com o nome so em sub/ NEGA (#567)`, () =>
      eq(correTextos(`${v} -C sub gh issue comment 1 -F body.md`, { ficheiros: la }).decisao, "deny", v));
  }
  // O `=cp` e o `cp`: o destino e uma PASTA, e o `sub/a.md` que o gh le e escrito por este comando. Sem o `nomeDoComando`
  // no `COPIAM`, o `sub` era um ficheiro, e lia-se o `sub/a.md` limpo do disco.
  const copia = { "a.md": `${NOME}\n`, "sub/a.md": "texto limpo\n" };
  // E atras de uma cabeca com `=` (`=sudo cp`): a 2.a leitura do `cabeca()` chega ao `cp`. E o `of=` de um `=dd`.
  for (const c of ["cp a.md sub", "=cp a.md sub", "=sudo cp a.md sub", "=env cp a.md sub", "=dd if=a.md of=sub/a.md", "=sudo dd if=a.md of=sub/a.md"]) {
    test(`equals: textos — \`${c} && gh -F sub/a.md\` NEGA, como escrito (#567)`, () =>
      afirma(correTextos(`${c} && gh issue comment 1 -F sub/a.md`, { ficheiros: copia }), { decisao: "deny", inclui: ["escrito neste mesmo comando"] }));
  }

  // --- A fronteira ------------------------------------------------------------------------------------------------
  const nega = (c) => { if (porqueAltera(c) === null) throw new Error(`"${c}": devia negar, deixou`); };
  for (const c of [`=git -c core.pager='rm -rf ${F}' log`, `GIT_PAGER='rm -rf ${F}' =git log`,
    `echo 'rm -rf ${F}' | =bash`, `echo 'rm -rf ${F}' | env =bash`, `cat ${F} | =bash`,
    // A cabeca com `=` e CONSUMIDA (o `=` sai da palavra, e nao so do nome): `=sudo -s` le o stdin como o `sudo -s`.
    `echo 'rm -rf ${F}' | =sudo -s`, `=sudo -s <<'EOF'\nrm -rf ${F}\nEOF`, `echo 'rm -rf ${F}' | =env -i bash`,
    `=perl -ne 'unlink "${F}"'`,
    // O `=` fora de aspas com o resto citado: o zsh expande-o (`="bash"` -> `/bin/bash`, medido).
    `echo 'rm -rf ${F}' | ="bash"`, `echo 'rm -rf ${F}' | =ba''sh`, `echo 'rm -rf ${F}' | ="sudo" -s`,
    // A cabeca com `=` entre a atribuicao e o git (o ciclo para tras parava nela).
    `GIT_PAGER='rm -rf ${F}' =env git log`, `GIT_PAGER='rm -rf ${F}' =sudo git log`, `GIT_PAGER='rm -rf ${F}' /usr/bin/env git log`,
    // Todas as palavras git, e nao a 1.a: o `git` do `-u` era o engodo que escondia o `-c` do git real.
    `sudo -u git =git -c core.pager='rm -rf ${F}' log`, `sudo -u git git -c core.pager='rm -rf ${F}' log`]) {
    test(`equals: fronteira — \`${c.split("\n")[0]}\` NEGA (#567)`, () => nega(c));
  }
  // N1: o `main` ja negava (le o 2.o `git` como o 1.o); com a 2.a leitura, o `=git` engodo nao o pode esconder.
  test("equals: fronteira — N1, `echo =git git -c core.pager=...` NEGA (#567)", () => nega(`echo =git git -c core.pager='rm -rf ${F}' log`));
  // Controlos: um `=` que e argumento, um script (nao inline), e a palavra CITADA, que o zsh nao expande.
  test("equals: fronteira — CONTROLO, `echo =git`, `=git log`, `=perl x.pl` e `| \"=sudo\" -s` DEIXAM (#567)", () => {
    for (const c of ["echo =git", "=git log --oneline", "=perl x.pl", 'echo x | "=sudo" -s', `echo 'rm -rf ${F}' | "=bash"`]) if (porqueAltera(c) !== null) throw new Error(`"${c}" negou`);
  });
}
