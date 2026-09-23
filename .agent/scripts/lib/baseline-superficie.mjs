/**
 * Resolver a BASELINE e provar que ha superficie para medir — {{PROJECT_NAME}}
 *
 * As duas perguntas que o `check-test-surface.mjs` tem de responder ANTES de comparar seja o
 * que for: *contra que commit* se mede, e *ha alguma coisa* para medir. Extraidas de la quando
 * o ficheiro chegou a 499 linhas — uma do limite do Guard 17.
 *
 * SAO DUAS FUNCOES E NAO UMA, e a fronteira nao e estetica: a primeira falha quando o `git`
 * nao responde, a segunda quando os `TEST_GLOBS` nao casam nada. Sao dois defeitos diferentes,
 * com mensagens diferentes e accoes diferentes de quem os le — juntas, a mensagem teria de
 * cobrir os dois casos e deixava de dizer o que fazer.
 *
 * OS CORPOS ESTAO VERBATIM, indentacao original incluida, pela razao de sempre neste repo: uma
 * divisao tem de ser auditavel como MOVIMENTO — o output fica igual — e nao como reescrita.
 * O que mudou foi a moldura: `git` e `fatal` passaram de fecho de escopo a parametro, e o que
 * era `let base` mutado no topo passou a valor devolvido.
 *
 * As recusas vivem aqui, logo este ficheiro leva a sua entrada em `PARES` no
 * `mutation-sweep.mjs`. Sem ela a varredura cobria so o ficheiro de origem e anunciava
 * cobertura completa sobre sitios que ja nao la estao.
 */

/**
 * @param {string|undefined} base  o ref passado a mao, ou nada para derivar do branch atual
 * @param {(args: string[]) => string} git
 * @param {(m: string, extra?: string) => never} fatal
 * @returns {string} o ref da baseline, ja verificado
 */
export function resolveBaseline({ base, git, fatal }) {
  try {
    if (!base) {
      // Detached HEAD tratado explicitamente: o `symbolic-ref` lanca, o catch de baixo
      // apanhava-o e dizia `baseline "(auto)" nao resolve`, o que atribui a culpa a coisa
      // errada. Quem esta em detached tem de passar o ref, e a mensagem tem de o dizer.
      if (git(["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD") {
        fatal(
          "HEAD esta detached, logo nao ha branch de onde derivar a baseline",
          "        passar um ref explicito: node .agent/scripts/check-test-surface.mjs <ref>"
        );
      }
      const head = git(["symbolic-ref", "--short", "HEAD"]);
      // Os remote-tracking refs entram na lista, e nao por elegancia: num projeto **derivado**
      // acabado de clonar, o branch de trabalho e `fix/...` e nao existe `main` LOCAL — so
      // `origin/main`. Sem estes candidatos o verificador nao conseguia medir e saia `!= 0` no
      // dia 1 de cada consumidor, com uma mensagem que nao dizia o que fazer. Medido a correr
      // o bootstrap: e a classe do `TP3` (verde no template, vermelho no derivado).
      const principal = ["main", "master", "develop", "origin/main", "origin/master", "origin/develop", "origin/HEAD"].find((b) => {
        try {
          git(["rev-parse", "--verify", `${b}^{commit}`]);
          return true;
        } catch {
          return false;
        }
      });
      if (!principal) {
        fatal(
          "nao encontrei um branch principal (main/master/develop, local ou em origin/) para servir de baseline",
          "        passar um ref explicito: node .agent/scripts/check-test-surface.mjs <ref>"
        );
      }
      base = head === principal ? `${principal}^` : git(["merge-base", principal, "HEAD"]);
    }
    git(["rev-parse", "--verify", `${base}^{commit}`]);
  } catch (err) {
    fatal(
      `baseline "${base ?? "(auto)"}" nao resolve: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      "        sem baseline nao ha medicao — e uma medicao ausente nao e um OK"
    );
  }
  return base;
}

/**
 * A superficie tem de existir **nalgum lado** — na baseline ou no disco. Se os `TEST_GLOBS`
 * nao casam nada em nenhum dos dois, este verificador imprimia `superficie intacta` e saia
 * `0`, **para sempre**, sobre uma suite apagada: e o `TP2` aplicado a si mesmo, e a unica
 * mitigacao era prosa.
 *
 * **Os dois lados, e nao so um.** Olhar so para o disco roubava a mensagem ao caso do
 * `APAGADO` (apagar o unico teste deixa o disco vazio, mas isso e enfraquecimento e tem
 * mensagem propria). Olhar so para a baseline reprovava qualquer projeto cuja baseline seja
 * anterior aos testes — medido a seguir a receita do `BOOTSTRAP.md` neste repo, cujo commit
 * inicial e anterior as suites: o gate falhava a dizer que os globs estavam mal. Ambos os
 * erros foram meus, um em cada correcao.
 */
export function exigeSuperficie({ base, git, fatal, testGlobs }) {
  let naBaseline = [];
  try {
    naBaseline = git(["ls-tree", "-r", "--name-only", base]).split("\n").filter(Boolean);
  } catch (err) {
    fatal(`o git nao conseguiu listar os ficheiros da baseline: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
  let noDisco = [];
  try {
    noDisco = git(["ls-files"]).split("\n").filter(Boolean);
  } catch {
    noDisco = [];
  }
  const casa = (f) => testGlobs.some((r) => r.test(f));
  const nBase = naBaseline.filter(casa).length;
  const nDisco = noDisco.filter(casa).length;
  if (nBase === 0 && nDisco === 0) {
    fatal(
      `os TEST_GLOBS nao casam nenhum ficheiro de teste, nem em ${base} nem no disco — nao ha superficie para medir`,
      "        adaptar TEST_GLOBS a stack deste projeto (ver BOOTSTRAP.md, 'Adaptar o check-test-surface.mjs')"
    );
  }
  console.log(`  superficie: ${nBase} ficheiro(s) na baseline, ${nDisco} no disco\n`);
}
