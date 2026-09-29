/**
 * CORPUS GERADO da fronteira: o produto das dimensoes, nao uma lista escrita a mao
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * ## Porque existe
 *
 * O `tests-fronteira-inventario.mjs` e uma fotografia escrita a mao. Foi util — apanhou
 * oito formas de afrouxar antes de eu as escrever. Mas tem um limite que so aparece quando
 * se confia nele: **o corpus foi escolhido por quem escreveu o codigo, e herda-lhe os pontos
 * cegos.**
 *
 * Medido, e e a razao de ser deste ficheiro. Ao planear a correccao das cabecas, corri um
 * prototipo contra os 4 grupos do inventario mais 13 casos de nao-regressao mais 22 de
 * aridade, e declarei: *"5 `deny -> allow`, e sao exactamente os 5 alvos; 0 outras
 * conversoes"*. Era falso. O corpus gerado contou **270**.
 *
 * As 270 eram **um** defeito multiplicado: `{cabecas consumidas} x {verbo invocado por
 * caminho}`. O inventario tem as duas metades — `/usr/bin/git rm <H>` num grupo, `sudo git rm
 * <H>` noutro — e **nunca o produto das duas**. Nenhuma lista escrita a mao o teria: e preciso
 * ja suspeitar da combinacao para a escrever, e quem escreveu o codigo nao suspeita.
 *
 * ## O que muda
 *
 * A assercao deixa de ser uma lista e passa a ser uma **invariante**:
 *
 *     se o verbo REAL do comando escreve, a fronteira nega.
 *
 * As excepcoes nao sao comandos soltos: sao **classes**, cada uma com a sua razao escrita.
 * E cada classe afirma tambem que **nao esta vazia** — uma classe que se esvazia foi fechada,
 * e isso tem de ficar vermelho para alguem a promover, em vez de emagrecer em silencio.
 *
 * ## O numero que justifica o #101
 *
 * Sem prefixo nenhum, as 81 leituras geradas passam. **Com qualquer prefixo — os 28 que aqui
 * estao — as 81 sao negadas.** Nao sao 17 defeitos diferentes: e um. E sao 756 comandos de
 * leitura legitima negados, num guard cujo proprio cabecalho avisa que *"um guard que nega
 * trabalho normal e contornado, e ai deixa de proteger o que interessa"*.
 */
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-gerado.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

export const entryPoint = "test-hooks.mjs";

/** Os tres alvos, um por entrada de `CAMINHOS_FRONTEIRA`: um ficheiro exacto, um dentro de
 *  uma pasta-prefixo, e a outra pasta-prefixo. */
export const ALVOS = [
  ".claude/settings.json",
  ".claude/hooks/stop-verify.mjs",
  ".githooks/commit-msg",
];

/** Prefixos. O primeiro e o **controlo**: sem prefixo, uma leitura tem de passar. Os outros
 *  sao wrappers inertes, wrappers com flag-e-valor, palavras de shell e atribuicoes. */
export const CABECAS = [
  "",
  "sudo ", "env ", "command ", "time ", "timeout 5 ", "nohup ", "nice -n 0 ", "setsid ",
  "stdbuf -o0 ", "doas ", "builtin ", "ionice -c 2 ", "unbuffer ",
  "sudo -u me ", "env -i ", "env -u FOO ", "timeout -s KILL 5 ", "stdbuf -o 0 ",
  "time -o /tmp/t ",
  "if ", "! ", "if ! ",
  "sudo env ", "timeout 5 sudo ",
  "FOO=1 ", "PATH=/tmp/evil ", "LD_PRELOAD=/tmp/x/env ",
  "NODE_OPTIONS=--require=/tmp/evil/env ",
];

/** Como o verbo e invocado. A terceira e a segunda existem porque a combinacao
 *  `<cabeca> <verbo-por-caminho>` foi a que produziu as 270. */
export const INVOCA = [(v) => v, (v) => `/usr/bin/${v}`, (v) => `./${v}`];

/** Verbos que ESCREVEM. Negar qualquer um destes e o trabalho da fronteira. */
export const ESCREVEM = [
  ["rm", (b, a) => `${b} -f ${a}`],
  ["mv", (b, a) => `${b} /tmp/x ${a}`],
  ["cp", (b, a) => `${b} /tmp/x ${a}`],
  ["tee", (b, a) => `echo x | ${b} ${a}`],
  ["sed", (b, a) => `${b} -i '' s/a/b/ ${a}`],
  ["truncate", (b, a) => `${b} -s 0 ${a}`],
  ["chmod", (b, a) => `${b} 000 ${a}`],
  ["ln", (b, a) => `${b} -sf /tmp/x ${a}`],
  ["install", (b, a) => `${b} /tmp/x ${a}`],
  ["git", (b, a) => `${b} rm ${a}`],
  ["git", (b, a) => `${b} restore ${a}`],
  ["git", (b, a) => `${b} checkout -- ${a}`],
  ["find", (b, a) => `${b} ${a} -delete`],
  ["find", (b, a) => `${b} ${a} -exec rm {} +`],
  ["find", (b, a) => `${b} ${a} -exec grep -l X {} + -exec rm {} +`],
  ["find", (b, a) => `${b} ${a} -execdir mv {} /tmp ;`],
];

/** Verbos que so LEEM. Negar qualquer um destes e um falso positivo. */
export const LEEM = [
  ["cat", (b, a) => `${b} ${a}`],
  ["grep", (b, a) => `${b} -n X ${a}`],
  ["head", (b, a) => `${b} -5 ${a}`],
  ["wc", (b, a) => `${b} -l ${a}`],
  ["node", (b, a) => `${b} ${a}`],
  ["git", (b, a) => `${b} diff ${a}`],
  ["git", (b, a) => `${b} log -p ${a}`],
  ["find", (b, a) => `${b} ${a} -name '*.mjs'`],
  ["find", (b, a) => `${b} ${a} -exec grep -l X {} +`],
];

/** O produto. Cada caso leva a familia (o que o verbo REAL faz) e o prefixo, para que uma
 *  falha diga qual dimensao a produziu em vez de so o comando. */
export function gerar() {
  const out = [];
  for (const cabeca of CABECAS)
    for (const inv of INVOCA)
      for (const [familia, lista] of [["escreve", ESCREVEM], ["le", LEEM]])
        for (const [bin, tpl] of lista)
          for (const alvo of ALVOS) out.push({ familia, cabeca, bin, cmd: cabeca + tpl(inv(bin), alvo) });
  return out;
}

/**
 * As excepcoes a invariante, por CLASSE e com a razao. Nao sao comandos soltos: um comando
 * solto nao diz o que representa, e ao ser fechado deixa a classe inteira sem afirmacao.
 *
 * Cada uma afirma **duas** coisas: que os seus membros passam hoje, e que **nao esta vazia**.
 * A segunda e a que importa — uma classe que se esvazia foi fechada por alguem, e isso tem de
 * ficar vermelho para ser promovido a FECHADO, em vez de desaparecer sem sinal.
 *
 * **Cada classe e a forma NUA (`cabeca === ""`), e isso e deliberado.** Com uma cabeca a
 * frente, `sudo /usr/bin/git rm <alvo>` e negado hoje — pelo `sudo`, por acidente, e nao pelo
 * buraco deixar de existir. Definir a classe sobre a forma nua poe as 270 combinacoes
 * `{cabeca} x {verbo por caminho}` a cargo da **invariante**: hoje nao escapam porque a
 * cabeca as nega; no dia em que o #101 consumir a cabeca, escapam, e a invariante fica
 * VERMELHA. E a armadilha, e esta e a sua forma exacta.
 */
export const ABERTO = [
  {
    nome: "verbo invocado por caminho",
    porque:
      "o extractor do verbo faz `basename`, mas as regex de sub-verbo (`^git`) correm contra " +
      "o texto CRU. `/usr/bin/git rm <alvo>` tem verbo `git` (na LEITURA) e o `^git` ve " +
      "`/usr/bin/git`. E a metade do produto que produziu as 270.",
    casa: (k) => k.cabeca === "" && /^(?:\/usr\/bin\/|\.\/)(?:git|find)\b/.test(k.cmd),
  },
  {
    nome: "find: verbo de LEITURA que destroi",
    porque:
      "o `find` esta na LEITURA e nao tem verificacao de sub-verbo, ao contrario do `git`. " +
      "`-delete` e `-exec rm` escrevem. Ja consta do inventario escrito a mao (DESCUIDO).",
    casa: (k) => k.cabeca === "" && /^find\b/.test(k.cmd) && /-delete|-exec(?:dir)?\s+(?:rm|mv)\b/.test(k.cmd),
  },
  {
    nome: "find: uma leitura a frente desarma a escrita",
    porque:
      "variante da anterior, e a mesma familia do `cat <fronteira> && git rm` do inventario: " +
      "`-exec grep ... -exec rm` poe uma leitura antes da escrita. Merece entrada propria " +
      "porque uma correccao do `find` que varra so o PRIMEIRO `-exec` fecha a anterior e " +
      "deixa esta aberta — medido num prototipo.",
    casa: (k) => k.cabeca === "" && /^find\b/.test(k.cmd) && /-exec\s+grep[^\n]*-exec\s+rm/.test(k.cmd),
  },
];

/**
 * As cabecas cujas leituras sao TODAS negadas hoje. Sao falsos positivos: o verbo real le.
 *
 * Nao ha aqui contagens escritas em prosa (`TP1`) — a afirmacao e "todas", derivada do
 * proprio produto. Quando o #101 corrigir uma cabeca, o seu teste fica VERMELHO e a entrada
 * muda de `FALSO_POSITIVO_CABECA` para `CORRIGIDO_CABECA`. Nao se "corrige o teste".
 */
export const CORRIGIDO_CABECA = [];

export function registar({ test, eq }) {
  const casos = gerar();
  const aberto = (k) => ABERTO.find((cl) => cl.casa(k));

  // --- A invariante -----------------------------------------------------------------------
  test("gerado: todo o verbo que ESCREVE e negado, excepto as classes abertas", () => {
    const escapam = casos
      .filter((k) => k.familia === "escreve" && porqueAltera(k.cmd) === null && !aberto(k))
      .map((k) => k.cmd);
    eq(
      escapam.length,
      0,
      `${escapam.length} comando(s) que ESCREVEM passam sem estar numa classe de ABERTO. ` +
        `Se a forma e nova, acrescentar a classe com a razao; se e regressao, corrigir o ` +
        `codigo (#101). Primeiros: ${escapam.slice(0, 5).join(" | ")}`
    );
  });

  test("gerado: o corpus tem o tamanho do produto das dimensoes", () => {
    const esperado = CABECAS.length * INVOCA.length * (ESCREVEM.length + LEEM.length) * ALVOS.length;
    eq(
      casos.length,
      esperado,
      `o produto das dimensoes da ${esperado} e o gerador produziu ${casos.length} — uma ` +
        `dimensao esvaziou-se, e um corpus vazio nao reprova nada (TP2)`
    );
  });

  // --- As classes abertas -----------------------------------------------------------------
  for (const classe of ABERTO) {
    test(`gerado/aberto: ${classe.nome} — ainda escapa`, () => {
      const membros = casos.filter((k) => k.familia === "escreve" && classe.casa(k));
      eq(
        membros.length > 0,
        true,
        `a classe "${classe.nome}" ficou VAZIA: o gerador deixou de a produzir. Sem membros ` +
          `nao afirma nada — corrigir as dimensoes ou remover a classe com a razao`
      );
      const fechados = membros.filter((k) => porqueAltera(k.cmd) !== null).map((k) => k.cmd);
      eq(
        fechados.length,
        0,
        `${fechados.length} de ${membros.length} ja NAO passam — BOA NOTICIA, alguem fechou ` +
          `esta classe. Mover para uma afirmacao de NEGACAO, nao apagar. Primeiro: ${fechados[0]}`
      );
    });
  }

  // --- O controlo: sem prefixo, uma leitura passa ------------------------------------------
  test("gerado/controlo: sem prefixo, TODAS as leituras passam", () => {
    const negadas = casos
      .filter((k) => k.familia === "le" && k.cabeca === "" && porqueAltera(k.cmd) !== null)
      .map((k) => k.cmd);
    eq(
      negadas.length,
      0,
      `${negadas.length} leitura(s) SEM prefixo sao negadas. Este e o controlo do ficheiro: ` +
        `se ele falha, o problema nao e das cabecas. Primeira: ${negadas[0]}`
    );
  });

  // --- Os falsos positivos, por cabeca ------------------------------------------------------
  for (const cabeca of CABECAS) {
    if (cabeca === "") continue;
    const corrigida = CORRIGIDO_CABECA.includes(cabeca);
    test(
      `gerado/${corrigida ? "corrigido" : "falso-positivo"}: prefixo ${JSON.stringify(cabeca)}`,
      () => {
        const leituras = casos.filter((k) => k.familia === "le" && k.cabeca === cabeca);
        eq(leituras.length > 0, true, `o prefixo ${JSON.stringify(cabeca)} nao gerou leitura nenhuma`);
        const negadas = leituras.filter((k) => porqueAltera(k.cmd) !== null);
        if (corrigida) {
          eq(
            negadas.length,
            0,
            `o prefixo ${JSON.stringify(cabeca)} esta em CORRIGIDO_CABECA mas ainda nega ` +
              `${negadas.length} de ${leituras.length} leituras. Primeira: ${negadas[0]?.cmd}`
          );
        } else {
          eq(
            negadas.length,
            leituras.length,
            `o prefixo ${JSON.stringify(cabeca)} deixou de negar ${leituras.length - negadas.length} ` +
              `de ${leituras.length} leituras — se foi corrigido, mover a entrada para ` +
              `CORRIGIDO_CABECA (#101); nao mexer na assercao`
          );
        }
      }
    );
  }
}
