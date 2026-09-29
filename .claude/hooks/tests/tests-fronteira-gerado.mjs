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
  // Cabeca invocada por um caminho ARBITRARIO. O `basename` sozinho aceitava-a, logo qualquer
  // binario posto numa pasta propria passava a ser uma cabeca inerte. Medido pela Fase 4.
  "/tmp/evil/env ",
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
  // --- Formas que o corpus NAO gerava, e por isso nao via -------------------------------
  // Acrescentadas depois de um leitor independente medir 168 conversoes `deny -> allow` que
  // este ficheiro dava como zero. **O corpus era cego a elas**, e um corpus cego a uma forma
  // afirma sobre ela exactamente o mesmo que nao afirmar nada.
  //
  // E a licao do proprio cabecalho, uma volta acima: gerar o produto mata o ponto cego de quem
  // escreve a LISTA, nao o de quem escreve as DIMENSOES. Cada forma abaixo custou uma medicao
  // de outra pessoa.
  ["find", (b, a) => `${b} ${a} -type f -exec grep -l X {} \\; -exec rm {} \\;`],
  ["find", (b, a) => `${b} ${a} -exec git rm {} +`],
  ["find", (b, a) => `${b} ${a} -exec node /tmp/evil.js {} +`],
  ["git", (b, a) => `${b} config -f ${a} sec.key val`],
  ["git", (b, a) => `${b} apply /tmp/p.patch ${a}`],
  ["git", (b, a) => `${b} reset --hard ${a}`],
  ["node", (b, a) => `${b} -r /tmp/evil.js ${a}`],
  ["awk", (b, a) => `${b} -i inplace '{print}' ${a}`],
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
 * Formas de ESCRITA que passam **hoje**, e que a invariante nao conta como falha porque estao
 * DECLARADAS. Nao sao desculpas: cada uma passa TAMBEM com a cabeca vazia — sao buracos
 * pre-existentes, e o que as negava com cabeca era o acidente que o #101 removeu.
 *
 * O acidente nao era proteccao — e o proprio inventario que o escreve — mas a sua remocao tem de
 * ser DITA, e nao descoberta por alguem daqui a seis meses. Cada entrada e um buraco por fechar,
 * com o seu ticket.
 */
const DECLARADO = [
  // `git` com sub-verbos fora da lista do `gitQueEscreve` (`config -f`, `apply`, `reset --hard`).
  // A lista e uma blocklist de sub-verbos — o `TP6` que o resto do ficheiro evita — e fecha-la
  // e trabalho proprio: exige inverter para allowlist de sub-verbos de LEITURA.
  // O `(?:\S*\/)?` tolera o caminho: `/usr/bin/git config` e a mesma forma que `git config`,
  // e a primeira versao deste predicado nao o via — o corpus apanhou-o de imediato.
  (k) => /(?:^|\s)(?:\S*\/)?git\s+(?:config|apply|reset|am|cherry-pick|revert|filter-branch)\b/.test(k.cmd),
  // `node -r` / `--require`: carrega codigo antes do ficheiro. O `CODIGO_INLINE` cobre `-e`/`-p`
  // e nao esta forma. Mesma familia do `NODE_OPTIONS=--require` que o inventario ja regista.
  (k) => /\bnode\b[^\n]*\s(?:-r|--require)\b/.test(k.cmd),
  // `awk -i inplace`: o `editaNoSitio` cobre `sed|perl|ruby|python` e nao o `awk`.
  (k) => /\bawk\b[^\n]*\s-i\s+inplace\b/.test(k.cmd),
  // `node <ficheiro>` a correr um script arbitrario com o alvo como argumento — por `-exec` ou
  // nu. NAO se fecha aqui de proposito, e a razao e de desenho: `node` esta na `LEITURA` porque
  // correr um FICHEIRO e leitura, e e assim que se corre a suite dos hooks. Decidir que
  // `node <script> <fronteira>` e escrita negava `node .claude/hooks/tests/test-hooks.mjs`, que
  // e trabalho normal. Fechar isto exige distinguir o script do repo de um script de fora — e
  // decisao propria, nao um remendo no fim de outro ticket.
  (k) => /\bnode\b\s+\/(?!Users)[^\s]*\.js\b/.test(k.cmd),
];

/**
 * CLASSES FECHADAS. Nasceram todas em `ABERTO` — o que este ficheiro registava como escapando —
 * e fecharam no #101. **Nao se apagaram**: a assercao inverteu-se, e agora exigem NEGACAO.
 *
 * Apagar uma classe fechada era o `TP4`: a forma deixava de ser afirmada por coisa nenhuma, e
 * uma regressao que a reabrisse passava com a suite verde. O cabecalho deste ficheiro ja dizia
 * "mover para uma afirmacao de NEGACAO, nao apagar" — isto e o cumprimento dessa instrucao.
 */
export const FECHADO_CLASSE = [
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
 * As cabecas CORRIGIDAS pelo #101: as suas leituras passam todas.
 *
 * Uma cabeca que NAO esteja nesta lista e um falso positivo ainda por corrigir, e o ramo
 * `else` do registo exige que ela negue TODAS — a afirmacao e derivada do produto, nunca uma
 * contagem em prosa (`TP1`). Se uma delas for corrigida, o seu teste fica VERMELHO e a entrada
 * migra para aqui. Nao se "corrige o teste".
 */
export const CORRIGIDO_CABECA = [
  // As CABECAS INERTES, corrigidas pelo #101. Cada uma negava 81 de 81 leituras geradas; o
  // total sai desta lista, e nao de um numero escrito a mao (`TP1`):
  //     CORRIGIDO_CABECA.length * INVOCA.length * LEEM.length * ALVOS.length
  // A primeira versao deste comentario dizia 2268 — contava as 28 cabecas, incluindo as 4
  // atribuicoes que o comentario a seguir diz estarem FORA. Apanhado pela Fase 4.
  //
  // NAO se apagaram as entradas ao corrigi-las. Uma entrada apagada deixa de ser afirmada por
  // coisa nenhuma, e amanha uma regressao repoe a negacao com a suite verde (`TP4`). Migram, e
  // a assercao inverte-se: aqui exige-se que TODAS passem.
  "sudo ", "env ", "command ", "time ", "timeout 5 ", "nohup ", "nice -n 0 ", "setsid ",
  "stdbuf -o0 ", "doas ", "builtin ", "ionice -c 2 ", "unbuffer ",
  "sudo -u me ", "env -i ", "env -u FOO ", "timeout -s KILL 5 ", "stdbuf -o 0 ",
  "time -o /tmp/t ",
  "if ", "! ", "if ! ",
  "sudo env ", "timeout 5 sudo ",
  // FORA, e continuam em `FALSO_POSITIVO` por desenho: as QUATRO atribuicoes. Hoje falham
  // FECHADO para todos os nomes, por acidente do `basename`; saltar atribuicoes compraria esse
  // acidente por uma lista de nomes que fica sempre curta — medido que `PATH=`, `NODE_PATH=`,
  // `LESSOPEN=` e `AWKPATH=` ficariam de fora dela. Tem slice propria.
];

export function registar({ test, eq }) {
  const casos = gerar();

  // --- A invariante -----------------------------------------------------------------------
  test("gerado: todo o verbo que ESCREVE e negado, excepto o que esta DECLARADO", () => {
    const escapam = casos
      .filter((k) => k.familia === "escreve" && porqueAltera(k.cmd) === null && !DECLARADO.some((d) => d(k)))
      .map((k) => k.cmd);
    eq(
      escapam.length,
      0,
      `${escapam.length} comando(s) que ESCREVEM passam sem estar DECLARADOS. ` +
        `Se a forma e nova, acrescentar a DECLARADO com a razao; se e regressao, corrigir o ` +
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

  // --- As classes que FECHARAM --------------------------------------------------------------
  for (const classe of FECHADO_CLASSE) {
    test(`gerado/fechado: ${classe.nome} — ja NAO escapa`, () => {
      const membros = casos.filter((k) => k.familia === "escreve" && classe.casa(k));
      eq(
        membros.length > 0,
        true,
        `a classe "${classe.nome}" ficou VAZIA: o gerador deixou de a produzir. Sem membros ` +
          `nao afirma nada — corrigir as dimensoes ou remover a classe com a razao`
      );
      // Um membro que esteja DECLARADO como aberto por outra razao nao conta: a classe afirma
      // o que ELA fechou, e nao que o comando inteiro seja negado por todos os motivos.
      const escapam = membros
        .filter((k) => porqueAltera(k.cmd) === null && !DECLARADO.some((d) => d(k)))
        .map((k) => k.cmd);
      eq(
        escapam.length,
        0,
        `${escapam.length} de ${membros.length} voltaram a passar — esta classe estava FECHADA ` +
          `e reabriu. Nao mexer na assercao: corrigir o codigo (#101). Primeiro: ${escapam[0]}`
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
