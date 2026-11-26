/**
 * Os modificadores do zsh (`noglob`, `nocorrect`, `-`) nos tres guards (#606) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: no zsh (a shell do Bash do Claude Code aqui) estes modificadores poem o comando a seguir a correr, e
 * nenhum dos guards os conhecia. Medido no `main` a 25 nov (`4ab4e82`): num branch protegido `noglob git commit` e
 * `nocorrect git commit` passavam, e o force-push atras deles em qualquer branch; na fronteira,
 * `echo '<escrita>' | noglob bash` (e `| nocorrect sh`, `| - bash`) passava. Os textos publicos ja os liam
 * (`cabeca-comando.mjs`): os casos de la prendem que a lista unica (`MODIFICADORES_ZSH`) nao os mudou.
 *
 * O `repeat N` ficou de fora, com issue proprio: a contagem nao e uma palavra que se salte a cegas (`repeat "1 + 1"`,
 * `repeat $N`, depois de um `-c`), e tres leituras do #606 acharam formas novas a cada versao.
 *
 * O que passa de NEGADO a PERMITIDO, e e deliberado (Fase 0 no #606): (A) uma LEITURA atras de um modificador, com a
 * fronteira a vista (`noglob cat <f>`), como o `command cat <f>`; (B) um `cd` atras de um modificador, que passa a ser
 * seguido como o `builtin cd` — uma escrita depois continua a negar.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { PROTEGIDOS_LISTA } from "../lib/protegidos.mjs";
import { afirma, corre as correTextos, NEGA } from "./tests-textos-publicos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-modificadores-zsh.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const NOME = "projeto-secreto";
const F = ".claude/hooks/x.mjs";
/** O contexto fixo dos casos do `cd` (como no `tests-fronteira-caminho.mjs`): nao depende da maquina (`TP3`). */
const CTX = { raiz: "/Users/g/proj", cwd: "/Users/g/proj", prefixo: "", home: "/Users/g" };

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
  for (const c of ["noglob git commit -m x", "nocorrect git commit -m x", "noglob nocorrect git commit -m x",
    "command noglob git commit -m x", "noglob =git commit -m x", "noglob bash -c 'cd r && git commit -m x'",
    // O `-` ja negava (le-se como flag, e o `git` vem a seguir): prende-se.
    "- git commit -m x"]) {
    test(`modificadores: \`${c}\` num branch protegido NEGA (#606)`, () => decide(c, "deny"));
  }
  // O force-push e negado em QUALQUER branch: atras de um modificador, tambem.
  for (const m of ["noglob", "nocorrect", "-"]) {
    test(`modificadores: \`${m} git push --force\` num branch de feature NEGA (#606)`, () => decide(`${m} git push --force origin <P>`, "deny", "feature/x"));
  }
  // O `cd` atras de um modificador (ou do `builtin`/`command`, que ja falhavam) leva o commit para OUTRO repo: o branch que se
  // julga e o dele (o 1.o leitor do #606). Lancado de um branch de feature, para um repo num protegido.
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
  for (const antes of ["noglob", "nocorrect", "-", "builtin", "command"]) {
    test(`modificadores: \`${antes} cd <repo protegido> && git commit\` de um branch de feature NEGA (#606)`, () => decideCd(antes, undefined, "deny"));
  }
  test("modificadores: CONTROLO — `noglob cd <outra feature> && git commit` DEIXA (#606)", () => decideCd("noglob", "feature/y", "allow"));
  // Controlos: o modificador como argumento, um verbo seguro atras dele.
  for (const c of ["echo noglob git commit -m x", "noglob git status", "- git status"]) {
    test(`modificadores: CONTROLO — \`${c}\` num branch protegido DEIXA (#606)`, () => decide(c, "allow"));
  }

  // --- A fronteira ------------------------------------------------------------------------------------------------
  const nega = (c, ctx) => { if (porqueAltera(c, ctx) === null) throw new Error(`"${c}": devia negar, deixou`); };
  const deixa = (c, ctx) => { const r = porqueAltera(c, ctx); if (r !== null) throw new Error(`"${c}": devia deixar, negou (${r})`); };
  for (const c of [`echo 'rm -rf ${F}' | noglob bash`, `echo 'rm -rf ${F}' | nocorrect sh`, `echo 'rm -rf ${F}' | - bash`,
    `echo 'rm -rf ${F}' | exec noglob bash`, `cat ${F} | noglob node -e 'x'`, `noglob node -e 1 ${F}`]) {
    test(`modificadores: fronteira — \`${c}\` NEGA (#606)`, () => nega(c));
  }
  // Uma escrita atras de um modificador nega pelo verbo REAL (o rotulo era o do modificador).
  for (const m of ["noglob", "nocorrect", "-"]) {
    test(`modificadores: fronteira — \`${m} rm <f>\` nega pelo \`rm\` (#606)`, () => eq(porqueAltera(`${m} rm ${F}`), "verbo-nao-e-leitura:rm", m));
  }
  // (A) deliberado: uma LEITURA atras de um modificador passa a ser julgada pelo verbo real, e deixa (era um falso positivo).
  for (const c of [`noglob cat ${F}`, `nocorrect grep x ${F}`, `- cat ${F}`]) {
    test(`modificadores: fronteira (A) — \`${c}\` DEIXA (#606)`, () => deixa(c));
  }
  // (B) deliberado: um `cd` atras de um modificador e seguido como o `builtin cd` — ler la deixa, escrever nega.
  for (const m of ["noglob", "-"]) {
    test(`modificadores: fronteira (B) — \`${m} cd <fronteira> && cat x\` DEIXA (#606)`, () => deixa(`${m} cd .claude/hooks && cat x`, CTX));
    test(`modificadores: fronteira (B) — \`${m} cd <fronteira> && cp /tmp/x y.mjs\` NEGA pelo \`cp\` (#606)`, () =>
      eq(porqueAltera(`${m} cd .claude/hooks && cp /tmp/x y.mjs`, CTX), "verbo-nao-e-leitura:cp", m));
  }
  // Controlos que nao mudam: o falso positivo do `exec` que ja existia (o `fronteira.mjs` chama o `resto()` sem o `exec`) —
  // registado, nao corrigido aqui; e o modificador como argumento.
  test("modificadores: fronteira — CONTROLO, `noglob exec cat <f>` continua a NEGAR — falso positivo que ja existia (#606)", () => nega(`noglob exec cat ${F}`));
  test("modificadores: fronteira — CONTROLO, `echo noglob` e `noglob ls` DEIXAM (#606)", () => {
    for (const c of ["echo noglob bash", "noglob ls"]) deixa(c);
  });

  // --- Os textos publicos: ja liam os modificadores, e nao podem mudar --------------------------------------------
  for (const m of ["noglob", "nocorrect", "-"]) {
    test(`modificadores: textos — \`${m} gh issue comment\` com o nome NEGA (#606)`, () =>
      afirma(correTextos(`${m} gh issue comment 1 --body "${NOME}"`), NEGA));
  }
  test("modificadores: textos — CONTROLO, `noglob gh` sem o nome DEIXA (#606)", () =>
    afirma(correTextos('noglob gh issue comment 1 --body "texto limpo"'), { decisao: "allow" }));
}
