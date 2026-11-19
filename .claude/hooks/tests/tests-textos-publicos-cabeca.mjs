/**
 * Testes do hook `guard-textos-publicos`: o `gh`/`git` atras de uma CABECA com flags (#565) — {{PROJECT_NAME}}
 *
 * O que se afirma: o valor de uma flag de cabeca (`env -u FOO`, `sudo -u eu`, `timeout -s KILL 60`, `time -o out`,
 * `sudo -D ~/src/gh`) ja nao esconde o `gh`/`git` a seguir — toda a palavra com esse nome e lida; uma cabeca que muda
 * a pasta (`env -C`/`--chdir`, `sudo -D`/`-i`) faz um ficheiro RELATIVO ir para o "nao li" (o `gh` le-o noutra pasta)
 * e arma o externo; e um `GH_REPO=` atras de uma cabeca arma o externo. Os ajudantes sao do `tests-textos-publicos.mjs`.
 *
 * NAO e um entry point. O `test-hooks.mjs` descobre-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { afirma, corre, DEIXA, NEGA } from "./tests-textos-publicos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-textos-publicos-cabeca.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const NOME = "projeto-secreto";
const NAO_LEU = { decisao: "deny", inclui: ["Nao consegui ler o texto"] };
const INTERRUPTOR = { decisao: "deny", inclui: ["interruptor dos nomes proibidos"] };
const DESL = { desligado: true };

export function registar({ test }) {
  // Cada forma era DEIXADA: o hook lia o valor como o verbo, e o `gh`/`git` nem se via (medido no `main` do #580).
  test("textos-publicos: o valor de uma flag de cabeca nao esconde o gh (env -u, sudo -u, timeout -s, time -o, env -C) (#565)", () => {
    for (const c of [`env -u FOO gh pr create --title t --body "${NOME}"`, `sudo -u eu gh issue comment 1 --body "${NOME}"`,
      `timeout -s KILL 60 gh issue comment 1 --body "${NOME}"`, `time -o out gh issue comment 1 --body "${NOME}"`,
      `env -C . gh issue comment 1 --body "${NOME}"`])
      afirma(corre(c), NEGA);
  });
  test("textos-publicos: nem uma flag fora da lista, um grupo, ou uma cabeca por caminho escondem o gh (#565)", () => {
    for (const c of [`sudo -E -u eu gh issue comment 1 --body "${NOME}"`, `sudo -Eu eu gh issue comment 1 --body "${NOME}"`,
      `env -iu FOO gh issue comment 1 --body "${NOME}"`, `sudo --user eu gh issue comment 1 --body "${NOME}"`,
      `/usr/bin/sudo -u eu gh issue comment 1 --body "${NOME}"`, `sudo -u eu -- gh issue comment 1 --body "${NOME}"`])
      afirma(corre(c), NEGA);
  });
  test("textos-publicos: uma pasta chamada gh ou git como valor nao esconde o gh/git verdadeiro (#565)", () => {
    for (const c of [`sudo --user gh gh issue comment 1 --body "${NOME}"`, `env -u gh gh issue comment 1 --body "${NOME}"`,
      `sudo -u git git commit -m "${NOME}"`])
      afirma(corre(c), NEGA);
  });
  test("textos-publicos: o git commit/tag e o interruptor atras de sudo -u sao lidos (#565)", () => {
    afirma(corre(`sudo -u eu git commit -m "${NOME}"`), NEGA);
    afirma(corre(`timeout -s KILL 60 git tag -a v1 -m "${NOME}"`), NEGA);
    afirma(corre(`sudo -u eu git config agent-template.nomesproibidos desligado`), INTERRUPTOR);
  });
  // A pasta mudada num repo LIGADO: o `f` limpo do cwd nao e o que o `gh` publica. Com o `h` a ser o proprio `gh`
  // (a flag colada), o `escreve` nao o apanha: e o `mudaAPasta` que nega.
  test("textos-publicos: uma cabeca que muda a pasta manda um ficheiro relativo para o 'nao li' (#565)", () => {
    for (const c of [`env -C/outro gh pr create --title t --body-file f`, `env --chdir=/outro gh pr create --title t --body-file f`,
      `sudo -D/outro gh issue comment 1 --body-file f`, `sudo -i gh issue comment 1 --body-file f`])
      afirma(corre(c, { ficheiros: { f: "texto limpo\n" } }), NAO_LEU);
  });
  test("textos-publicos: com a pasta mudada, um absoluto e o stdin continuam lidos (#565)", () => {
    afirma(corre(`env -C/outro gh pr create --title t --body-file ~/f`, { ficheiros: { "~/f": `${NOME}\n` } }), NEGA);
    afirma(corre(`env -C/outro gh pr create --title t --body-file ~/f`, { ficheiros: { "~/f": "texto limpo\n" } }), DEIXA);
    afirma(corre(`env -C/outro gh issue create -t x -F - <<'EOF'\n${NOME}\nEOF`), NEGA);
  });
  test("textos-publicos: num repo DESLIGADO, uma cabeca que muda a pasta ou um GH_REPO atras de uma cabeca armam a lista (#565)", () => {
    for (const c of [`env -C ../publico gh issue comment 1 --body "${NOME}"`, `env --chdir=../publico gh issue comment 1 --body "${NOME}"`,
      `sudo -D ../publico gh issue comment 1 --body "${NOME}"`, `sudo -u eu GH_REPO=o/publico gh issue comment 1 --body "${NOME}"`])
      afirma(corre(c, DESL), NEGA);
  });
  test("textos-publicos: CONTROLO — sem nome, as formas com cabeca continuam a passar (#565)", () => {
    for (const c of [`env -u FOO gh issue comment 1 --body "texto limpo"`, `sudo -u eu gh pr create --title t --body b`,
      `timeout 5 gh issue view 3`])
      afirma(corre(c), DEIXA);
  });
  // As duas leituras do diff do #565: o `cd` como valor saia antes do despacho; uma opcao longa abreviada e uma cabeca
  // como valor escapavam ao `mudaAPasta`; e um `gh constructor` fazia o hook lancar (e deixar passar tudo).
  test("textos-publicos: um cd como valor, uma opcao abreviada, uma cabeca como valor e o gh constructor (#565)", () => {
    afirma(corre(`env -u cd gh issue comment 1 --body "${NOME}"`), NEGA);
    for (const c of [`env --chd=/outro gh pr create --title t --body-file f`, `sudo --log gh issue comment 1 --body-file f`,
      `env -u sudo -C/outro gh pr create --title t --body-file f`])
      afirma(corre(c, { ficheiros: { f: "texto limpo\n" } }), NAO_LEU);
    afirma(corre(`gh constructor; gh issue comment 1 --body "${NOME}"`), NEGA);
  });
  // Os controlos negativos das pecas novas: uma flag de cabeca que NAO muda a pasta le o relativo (sem o `mudaAPasta`
  // estreito, `sudo -E`/`env -i` negavam); e uma cabeca sem `GH_REPO` nem pasta mudada nao arma o externo.
  test("textos-publicos: CONTROLO — sudo -E e env -i leem o relativo; sudo -u sem GH_REPO nao e externo (#565)", () => {
    for (const c of [`sudo -E gh issue comment 1 --body-file f`, `env -i gh pr create --title t --body-file f`])
      afirma(corre(c, { ficheiros: { f: "texto limpo\n" } }), DEIXA);
    afirma(corre(`sudo -u eu gh issue comment 1 --body "${NOME}"`, DESL), { decisao: "allow", aviso: "DESLIGADA neste repo" });
  });
  // A varredura do #565: com o despacho de toda a palavra `gh`, as atribuicoes do `cabeca()` deixaram de ter caso que as
  // prendesse (desligadas, o `gh` lia-se na mesma). Continuam a decidir o VERBO das escritas e o `GH_REPO` sem ordem.
  test("textos-publicos: uma atribuicao antes de um cat (X[0]=1, env A-B=1) nao faz do cat uma escrita (#565, a varredura)", () => {
    for (const c of [`X[0]=1 cat pr.md && gh pr create --title t -F pr.md`, `env A-B=1 cat pr.md && gh pr create --title t -F pr.md`])
      afirma(corre(c, { ficheiros: { "pr.md": "texto limpo\n" } }), DEIXA);
  });
  test("textos-publicos: num repo DESLIGADO, um GH_REPO atras de uma cabeca noutro comando arma a lista (sem ordem, #399; #565)", () =>
    afirma(corre(`sudo GH_REPO=o/publico true && gh issue comment 1 --body "${NOME}"`, DESL), NEGA));
  // O falso positivo dito no cabecalho: o valor (`eu`) e o verbo das escritas, logo o `f` conta como escrito.
  test("textos-publicos: com uma flag de cabeca com valor, um --body-file relativo nega como escrito (falso positivo dito, #565)", () =>
    afirma(corre(`sudo -u eu gh issue comment 1 --body-file f`, { ficheiros: { f: "texto limpo\n" } }), { decisao: "deny", inclui: ["escrito neste mesmo comando"] }));
}
