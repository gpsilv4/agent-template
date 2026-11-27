/**
 * O `repeat N` do zsh no guard do branch e na fronteira (#640) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: no zsh (a shell do Bash do Claude Code aqui) o `repeat N cmd` corre o `cmd` N vezes, e nenhum dos guards o
 * lia. Medido no `main` a 26 nov (`ab0ade8`): num branch protegido `repeat 1 git commit` passava, e o force-push atras dele
 * em qualquer branch (tambem dentro de um `sh -c '...'`); na fronteira, `echo '<escrita>' | repeat 1 bash` passava.
 *
 * A CONTAGEM e o que tornou isto dificil (tres leituras do #606, tres auditorias da Fase 0 do #640): `"1 + 1"` sao tres
 * tokens, `${N}`/`$((...))` partem o segmento, dentro de um `-c` o `repeat` lia-se como o valor da flag. O desenho le a
 * contagem como UMA PALAVRA DA SHELL nos tokens crus (`contagem()` em `invocacoes-git.mjs`), sem reescrever texto; uma
 * contagem fora da lista fechada (ou um `repeat` sem contagem) marca a invocacao como opaca — num protegido nega.
 *
 * O que passa de NEGADO a PERMITIDO, e e deliberado (Fase 0 no #640): (B) uma LEITURA atras de `repeat <n >= 1>` na
 * fronteira; (C) um `cd` atras de `repeat 1` seguido na fronteira; (D) o corpo de um heredoc dado a
 * `repeat <contagem conhecida> git ... -F -` e texto, como sem o `repeat`.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { invocacoes } from "../lib/invocacoes-git.mjs";
import { PROTEGIDOS_LISTA } from "../lib/protegidos.mjs";
import { afirma, corre as correTextos, NEGA } from "./tests-textos-publicos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-repeat.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const F = ".claude/hooks/x.mjs";
/** O contexto fixo dos casos do `cd` (como no `tests-fronteira-caminho.mjs`): nao depende da maquina (`TP3`). */
const CTX = { raiz: "/Users/g/proj", cwd: "/Users/g/proj", prefixo: "", home: "/Users/g" };
const FORCE = "git push --force origin <P>";

/** Num branch PROTEGIDO, NEGA: cada uma passava no `main` (`ab0ade8`), salvo as marcadas. */
const NEGA_PROTEGIDO = [
  "repeat 1 git commit -m x", "repeat 3 git commit -m x", 'repeat "1 + 1" git commit -m x', "repeat $N git commit -m x",
  "repeat $(echo 1) git commit -m x", "repeat 2 do git commit -m x; done", "repeat 1 git commit -F - <<EOF\nmsg\nEOF",
  "time repeat 1 git commit -m x", "if repeat 1 git commit -m x; then :; fi", "coproc repeat 1 git commit -m x",
  "sh -c 'repeat ${N} git commit -m x'", "repeat 1 xargs git commit -m x",
  // A contagem fora da lista fechada (a decisao 2): opaca. Um verbo que escreve nega; o `--version` tambem (o `INSPECAO_PURA`
  // nao vale atras de um opaco). Um verbo SEGURO (`status`) deixa: a marca de opaco nao o torna inseguro.
  "repeat 1+1 git commit -m x", 'repeat 1"x git commit -m x', "repeat $#x git commit -m x", "repeat 1+1 git --version",
  // Entre aspas, so a aritmetica e conhecida: `"a;b"` e desconhecida, e o `--version` atras dela nega.
  'repeat "a;b" git --version', 'repeat "a;b" git commit -m x',
  // Ja negavam (o segmento partia por acaso; o `sudo -u repeat` porque o `git` e o comando): prendem-se.
  "repeat ${N} git commit -m x", "repeat $((1+1)) git commit -m x", "repeat 2 { git commit -m x }", "repeat 2; git commit -m x",
  "sudo -u repeat git commit -m x", "bash -c x; repeat git bash <<EOF\ngit commit -m y\nEOF",
  // Falso positivo que NASCE (dito na Fase 0): o `repeat` sai sozinho, e o ciclo continua ate ao `echo`... e ao `git`.
  "sudo -u repeat echo git commit",
];

/** O force-push e negado em QUALQUER branch: num branch de feature, atras de um `repeat`. */
const FORCES = [
  "repeat 1", "repeat $N", 'repeat "1 + 1"', 'repeat "1 + 1 "', 'repeat " 1 + 1"', 'repeat "$n + 1"', 'repeat "$(( n + 1 ))"',
  "repeat $'1 + 1'", 'repeat "1"+"1"', "repeat 1 env", "coproc repeat 1", "repeat $((1+1))",
].map((antes) => `${antes} ${FORCE}`).concat([
  `sh -c 'repeat $N ${FORCE}'`, `bash -c 'repeat 1+1 ${FORCE}'`, `sh -c 'repeat "1 + 1" ${FORCE}'`, `sh -c 'repeat $(( n + 1 )) ${FORCE}'`,
  `sh -c "repeat \\"1 + 1\\" ${FORCE}"`, `eval "repeat \\"1 + 1\\" ${FORCE}"`, `repeat 1 sh -c 'cd r && ${FORCE}'`,
  // Uma aspa ESCAPADA dentro de uma contagem entre aspas, ao nivel de cima: o zsh corre-a (`repeat "1\" + 1" cmd` corre o
  // `cmd` duas vezes; medido). A palavra lida acaba em `"1\"`, e e o AVANCO ate ao `git` que o apanha — o caso que faltava ao
  // par dele (a varredura do #640 deu-o por coberto por nenhum teste).
  `repeat "1\\" + 1" ${FORCE}`,
  // Do P3 (e): um `repeat` aninhado depois de uma contagem desconhecida — o avanco para nele, e o ciclo le-o.
  `repeat 1+1 repeat $N ${FORCE}`, `repeat 1+1 repeat "$n + 1" ${FORCE}`,
  // ... mas so num `repeat` cru: o `repeat"` e o fim do valor de `X="a repeat"`, e o `$SHELL` a seguir tem de ser visto.
  `repeat 1+1 X="a repeat" $SHELL -c 'cd r && ${FORCE}'`,
  `repeat 1 sh -c 'git status; ${FORCE}'`, `sudo -u repeat sh -c 'cd r && ${FORCE}'`,
  // O `sh` nunca e uma contagem: sem isso, o `comandoOpaco` deixava de partir o `;` citado, e o verbo ficava `status;`.
  `sudo -u repeat sh -c 'git status; ${FORCE}'`,
  // Do 2.o leitor: o `repeat` como VALOR de uma flag, seguido de uma cabeca que nao se le (negava no `main`: era a cabeca);
  // e uma contagem desconhecida antes de uma (ja passava no `main`). As duas ficam opacas, e o `;` citado parte.
  `sudo -u repeat $SHELL -c 'git status; ${FORCE}'`, `env -u repeat $(which bash) -c 'git status; ${FORCE}'`,
  `repeat 1+1 $SHELL -c "git status; ${FORCE}"`,
  // Do 1.o leitor: o `repeat` como valor de uma ATRIBUICAO antes de uma cabeca que nao se le (negava no `main`); e o `repeat`
  // como o UTILIZADOR de um `su` com o `-c` colado (negava no `main`: o `-c'...'` lia-se como uma contagem entre aspas).
  `X="a repeat" $SHELL -c 'cd r && ${FORCE}'`, `su repeat -c'${FORCE}'`,
  // O `-c` colado de um `su` parte-se em dois tokens, e os dois ficam com o cru do original: sem isso, a contagem do `repeat`
  // la dentro comecava no cru errado.
  `su -c'repeat " 1 + 1" ${FORCE}'`,
  `repeat $((1+1)) sh -c 'cd r && ${FORCE}'`, `bash -c x; repeat git bash <<EOF\n${FORCE}\nEOF`,
  // Os da v1 da Fase 0 (uma normalizacao no TEXTO apagava o push): `repeat` dentro de uma string de outro comando.
  `echo "a repeat "; ${FORCE}; echo "b"`, `env "X=repeat " ${FORCE} "y"`,
]);

/** Num branch PROTEGIDO, DEIXA: o `repeat` como argumento, e uma leitura atras de uma contagem conhecida. */
const DEIXA_PROTEGIDO = ["echo repeat 1 git commit", 'git log --grep "repeat 3"', 'echo "a repeat "; git status', "repeat 1 git status",
  "repeat $N git log", "repeat ${N} git status", 'repeat "1 + 1" git diff', "repeat 1+1 git status", "repeat $#x git status",
  // A contagem CONHECIDA nao marca opaco, e o `--version` passa como sem o `repeat`. E aqui que a leitura da palavra se ve: com
  // uma contagem com aspas lida mal (desconhecida), o `--version` negava. Um caso por forma da palavra.
  "repeat 1 git --version", 'repeat "1 + 1" git --version', 'repeat "1 + 1 " git --version', 'repeat " 1 + 1" git --version',
  'repeat "$(( n + 1 ))" git --version', "repeat $'1 + 1' git --version", 'repeat "1"+"1" git --version', "repeat $(echo 1) git --version"];

/** A fronteira: NEGA (as que deixavam no `main`, e as que continuam a negar pela razao certa). */
const NEGA_FRONTEIRA = [
  `echo 'rm -rf ${F}' | repeat 1 bash`, `echo 'rm -rf ${F}' | repeat $N bash`, `echo 'rm -rf ${F}' | repeat 1+1 bash`,
  `echo 'rm -rf ${F}' | repeat "1 + 1" bash`, `echo 'rm -rf ${F}' | repeat 0 bash`, `cat ${F} | repeat 1+1 node -e 'x'`,
  `time repeat 1 rm ${F}`,
  // Os falsos positivos que ficam: a contagem nao e um numero >= 1.
  `repeat $N cat ${F}`, `repeat 0 cat ${F}`,
];

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
  const curto = (c) => c.replace(/\n/g, "⏎").slice(0, 70);

  // --- O guard do branch ------------------------------------------------------------------------------------------
  for (const c of NEGA_PROTEGIDO) test(`repeat: \`${curto(c)}\` num branch protegido NEGA (#640)`, () => decide(c, "deny"));
  for (const c of FORCES) test(`repeat: \`${curto(c)}\` num branch de feature NEGA (#640)`, () => decide(c, "deny", "feature/x"));
  for (const c of DEIXA_PROTEGIDO) test(`repeat: CONTROLO — \`${c}\` num branch protegido DEIXA (#640)`, () => decide(c, "allow"));
  test("repeat: CONTROLO — `repeat 1 git commit` num branch de feature DEIXA (#640)", () => decide("repeat 1 git commit -m x", "allow", "feature/x"));
  // (D) deliberado: o corpo de um heredoc dado ao `git ... -F -` e texto, com ou sem o `repeat` a frente (#605).
  test("repeat: (D) — `sh -c true && repeat 1 git commit -F - <<EOF` com um force-push no corpo DEIXA num branch de feature (#640)",
    () => decide(`sh -c true && repeat 1 git commit -F - <<EOF\n${FORCE}\nEOF`, "allow", "feature/x"));
  // Os heredocs dados a uma shell atras de um `repeat`: o corpo corre, e continua a negar.
  for (const c of [`repeat 1 bash <<'EOF'\n${FORCE}\nEOF`, `repeat 1 sh -s <<EOF\n${FORCE}\nEOF`]) {
    test(`repeat: \`${curto(c)}\` num branch de feature NEGA (#640)`, () => decide(c, "deny", "feature/x"));
  }

  // O `cd` atras de um `repeat` (qualquer contagem: seguir um `cd` so ACRESCENTA directorios) leva o commit para OUTRO repo.
  const decideCd = (antes, ramoAlvo, esperado) => {
    if (ramoAlvo === undefined && p === undefined) throw SALTA;
    const alvo = repo(ramoAlvo);
    const daqui = repo("feature/x");
    try {
      eq(corre({ tool_input: { command: `${antes} cd ${alvo} && git commit -m x` }, cwd: daqui }).decisao, esperado, `${antes} cd`);
    } finally {
      for (const d of [alvo, daqui]) rmSync(d, { recursive: true, force: true });
    }
  };
  for (const antes of ["repeat 1", 'repeat "1 + 1"', "repeat $((n + 1))", "repeat 0", "repeat $N", "repeat 1 builtin", "repeat 1 noglob"]) {
    test(`repeat: \`${antes} cd <repo protegido> && git commit\` de um branch de feature NEGA (#640)`, () => decideCd(antes, undefined, "deny"));
  }
  test("repeat: CONTROLO — `repeat 1 cd <outra feature> && git commit` DEIXA (#640)", () => decideCd("repeat 1", "feature/y", "allow"));
  // CONTORNOS registados (criterio do #223; o 2.o leitor): contagens que o `ANTES_DO_CD` nao casa — o `cd` nao e seguido e o
  // commit e julgado no branch de onde se lanca. Ja passavam no `main`. **A ficar VERMELHO e BOA NOTICIA**: alguem as fechou.
  for (const antes of ["repeat $a[1]", 'repeat "1"2', "repeat $((1)+1)"]) {
    test(`repeat: CONTORNO ABERTO — \`${antes} cd <repo protegido> && git commit\` de um branch de feature DEIXA (#640)`, () => decideCd(antes, undefined, "allow"));
  }
  // Do P3 (e) (o mesmo criterio): dentro de um `sh -c '...'`, as chavetas e um `;` citado numa contagem nao partem como fora
  // dele — o leitor de shell dentro de um `-c` e a classe do #601/#614 (o `sh -c '(git commit)'` ja passa sem `repeat`).
  for (const c of ["sh -c 'repeat 1 { git commit -m x; }'", "sh -c 'repeat 2 { git commit -m x }'", `sh -c 'repeat "a;b" git commit -m x'`]) {
    test(`repeat: CONTORNO ABERTO — \`${c}\` num branch protegido DEIXA (#640)`, () => decide(c, "allow"));
  }

  // O custo: a `contagem` le a palavra de forma incremental, e o `ANTES_DO_CD` tem alternativas disjuntas (sem elas, cada
  // `repeat "1"` tinha duas leituras e o retrocesso era exponencial — na thread principal, abaixo dos 4000 caracteres).
  test("repeat: 100k caracteres de `repeat 1 ` sao lidos em menos de 1 s (#640)", () => {
    const t = Date.now();
    invocacoes("repeat 1 ".repeat(11_000) + "git status");
    if (Date.now() - t > 1000) throw new Error(`levou ${Date.now() - t} ms`);
  });
  test("repeat: 350 x `; repeat \"1\" ` sem `cd` decide em menos de 5 s (o processo inteiro) (#640)", () => {
    const t = Date.now();
    decide(`${'; repeat "1" '.repeat(350)}x`, "allow", "feature/x");
    if (Date.now() - t > 5000) throw new Error(`levou ${Date.now() - t} ms`);
  });

  // --- A fronteira ------------------------------------------------------------------------------------------------
  const nega = (c, ctx) => { if (porqueAltera(c, ctx) === null) throw new Error(`"${c}": devia negar, deixou`); };
  const deixa = (c, ctx) => { const r = porqueAltera(c, ctx); if (r !== null) throw new Error(`"${c}": devia deixar, negou (${r})`); };
  for (const c of NEGA_FRONTEIRA) test(`repeat: fronteira — \`${curto(c)}\` NEGA (#640)`, () => nega(c));
  // Uma escrita atras de um `repeat 1` nega pelo verbo REAL (o rotulo era o do `repeat`).
  test("repeat: fronteira — `repeat 1 rm <f>` nega pelo `rm` (#640)", () => eq(porqueAltera(`repeat 1 rm ${F}`), "verbo-nao-e-leitura:rm", "rm"));
  // (B) deliberado: uma LEITURA atras de `repeat <n >= 1>` deixa (era o falso positivo do `repeat` como verbo).
  for (const c of [`repeat 1 cat ${F}`, `repeat 3 grep x ${F}`, `time repeat 1 cat ${F}`]) {
    test(`repeat: fronteira (B) — \`${c}\` DEIXA (#640)`, () => deixa(c));
  }
  // (C) deliberado: o `cd` atras de `repeat 1` e seguido; com outra contagem NAO (a decisao 3: o `repeat 0` nao o corre, e o
  // `repeat 2 cd ..` muda o directorio duas vezes).
  // Lancado DE DENTRO da fronteira (o `cwd` e `.claude/hooks`): o `rm x.mjs` so sai dela se o `cd` correr.
  const DENTRO = { ...CTX, cwd: `${CTX.raiz}/.claude/hooks`, prefixo: ".claude/hooks" };
  test("repeat: fronteira (C) — `repeat 1 cd /tmp && rm x.mjs` de dentro da fronteira DEIXA (o `rm` corre em /tmp) (#640)", () => deixa("repeat 1 cd /tmp && rm x.mjs", DENTRO));
  test("repeat: fronteira (C) — `repeat 1 cd .claude/hooks && cp /tmp/x y.mjs` NEGA pelo `cp` (#640)", () =>
    eq(porqueAltera("repeat 1 cd .claude/hooks && cp /tmp/x y.mjs", CTX), "verbo-nao-e-leitura:cp", "cp"));
  for (const c of ["repeat 0 cd /tmp && rm x.mjs", "repeat 2 cd /tmp && rm x.mjs", "repeat $N cd /tmp && rm x.mjs", 'repeat "1 - ! env" cd /tmp && rm x.mjs',
    // Do 1.o leitor: uma cabeca ou outro `repeat` entre o `repeat 2` e o `cd` (o `cd` corre duas vezes na mesma).
    "repeat 2 builtin cd /tmp && rm x.mjs", "repeat 2 repeat 1 cd /tmp && rm x.mjs"]) {
    test(`repeat: fronteira — \`${c}\` de dentro da fronteira NEGA (o \`cd\` nao e seguido) (#640)`, () => nega(c, DENTRO));
  }
  // Do 2.o leitor: o `pushd` atras de `repeat 2` e de uma cabeca ou de outro `repeat` corre duas vezes, e nao e seguido.
  for (const c of ["repeat 2 repeat 1 pushd /Users/g/proj/.claude/hooks; popd; rm x.mjs", "repeat 2 builtin pushd /Users/g/proj/.claude/hooks; popd; rm x.mjs"]) {
    test(`repeat: fronteira — \`${c.slice(0, 50)}\` NEGA (o \`pushd\` corre duas vezes) (#640)`, () => nega(c, CTX));
  }
  // Nao nasce o falso positivo que a Fase 0 previa (o `$N` lido como comando-variavel no ramo citado): medido, deixa.
  test("repeat: fronteira — CONTROLO, `echo repeat 1 bash`, `repeat 1 ls` e `repeat $N echo \"ver .claude/hooks\"` DEIXAM (#640)", () => {
    for (const c of ["echo repeat 1 bash", "repeat 1 ls", 'repeat $N echo "ver .claude/hooks"']) deixa(c);
  });

  // --- Os textos publicos: ja liam o `repeat` (pelas `CABECAS`, onde ele NAO entra), e nao podem mudar ---------------
  for (const c of ['repeat 1 gh issue comment 1 --body "projeto-secreto"', 'repeat $N gh issue comment 1 --body "projeto-secreto"']) {
    test(`repeat: textos — \`${c.slice(0, 40)}\` com o nome NEGA (#640)`, () => afirma(correTextos(c), NEGA));
  }
  test("repeat: textos — CONTROLO, `repeat 1 gh` sem o nome DEIXA (#640)", () =>
    afirma(correTextos('repeat 1 gh issue comment 1 --body "texto limpo"'), { decisao: "allow" }));
}
