/**
 * Guard 17: o flag das 500 linhas mede-se — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: `core-rules.md` declara "~400 linhas ideal, > 500 candidato **obrigatorio** a
 * splitting" e nada media. No proprio template, QUATRO ficheiros da maquinaria estavam acima
 * de 500 — dois deles acima de 650 — e os comentarios de dois guards ja se justificavam com
 * "passou o flag das 500 linhas", ou seja, a regra era citada por quem a violava. Uma regra
 * que so existe em prosa mede-se pelo que acontece quando ninguem olha: nada.
 *
 * O QUE MEDE: os ficheiros `.mjs` da maquinaria do template (`.agent/scripts/`, `.claude/hooks/`).
 * O codigo da APLICACAO nao entra: cada projeto derivado traz a sua stack, as suas extensoes e
 * as suas excecoes legitimas (ficheiros gerados, tipos de API), e um guard que varresse `src/`
 * seria ruido no dia 1 — a regra dos ~400 para codigo de app e trabalho do `/review`.
 *
 * O TETO, e nao uma lista de isentos: os ficheiros que ja estavam acima do limite entram em
 * `TETOS` com a contagem **do dia em que foram medidos**. Nao os isenta — **congela-os**:
 * podem encolher, nunca crescer. E uma catraca. Um ficheiro novo acima de 500 reprova na hora;
 * um ficheiro velho que ganhe uma linha reprova tambem. Quando um deles descer ate ao limite, o
 * guard **manda tirar a entrada** — senao a lista sobrevivia ao problema que a justificava.
 *
 * O que uma lista de isentos faria, e que isto nao faz, e deixar `test-hooks.mjs` ir dos 696
 * para os 1200 sem uma palavra.
 */

export const LIMITE = 500;

/** Quantas linhas TEM um ficheiro, para efeitos deste guard.
 *
 *  O `replace` nao e cosmetico: sem ele, um ficheiro terminado em newline — todos, por convencao
 *  — mede uma linha a mais do que o `wc -l` que qualquer pessoa vai correr para confirmar. Um
 *  guard que discorda da ferramenta obvia gasta-se a ser desacreditado.
 *
 *  **Exportado porque tinha uma segunda copia.** A adaptacao 2b do `simulate-upgrade.mjs`, que
 *  congela em `TETOS` os ficheiros do projeto acima do limite, contava sem o `replace` — logo
 *  media sempre +1 e congelava ficheiros que este guard considera dentro do limite. Nao dava
 *  sinal nenhum ate um ficheiro cair em EXACTAMENTE 500: ai a 2b congelava-o e o guard mandava
 *  tirar a entrada, e o /upgrade de qualquer consumidor ficava vermelho por causa disso. */
export const contaLinhas = (src) => src.replace(/\n$/, "").split("\n").length;

/** Onde vive a maquinaria. Cada entrada e uma pasta varrida em profundidade. */
const PASTAS = [".agent/scripts", ".claude/hooks"];

/**
 * Contagem congelada dos ficheiros que ja estavam acima do limite quando o guard nasceu
 * (2026-09-14). Podem encolher; crescer reprova. Baixar um destes valores e trabalho legitimo
 * e bem-vindo — subi-lo e desligar a catraca, e o `sync-docs.md` di-lo por escrito.
 */
export const TETOS = {
  ".claude/hooks/tests/test-hooks.mjs": 696,
  // 668 -> 590 (tabelas de verbos) -> 554 (verificacao da fronteira) -> 517 (a tabela
  // FORMA_EXIGIDA, que e politica e nao motor). RE-CONGELA a cada descida, senao a catraca
  // deixava a folga recuperada por recuperar.
  ".claude/hooks/guard-protected-branch.mjs": 517,
  ".agent/scripts/tests/test-guards.mjs": 525,
};

// O `mutation-sweep.mjs` esteve nesta lista (505 linhas) e SAIU: a tabela `PARES` — 186
// linhas de dados dentro de um ficheiro de logica — passou para `lib/pares.mjs` e o motor
// ficou em 330. E o desfecho que a catraca existe para provocar; fica aqui escrito para a
// proxima pessoa ver que sair da lista e possivel, e como.
//
// QUANDO ESTE GUARD DISPARAR, e a licao mais util deste ficheiro: a saida barata e encolher
// prosa — cortar comentarios ate caber, tres linhas de cada vez. A saida certa e quase sempre
// **procurar o que esta escrito duas vezes**. Medido cinco vezes numa so sessao; a diferenca
// entre as duas reaccoes:
//
//   - cortar prosa: 3 linhas por corte, e a informacao que se perde e a que explica PORQUE;
//   - remover uma copia: 14 linhas de uma vez (o `leOuNull`, que vivia em dois ficheiros), e o
//     que se perde e um defeito a espera de acontecer — as duas copias divergem sempre.
//
// O mesmo vale para os orcamentos de bytes das rules, e aconteceu la duas vezes: o racional do
// paralelismo estava escrito no `scripts-guide.md` **e** no cabecalho do modulo que o
// implementa. Tirar um deu 170 bytes; cortar frases dava 20.

/**
 * @returns {number} guards executados
 */
export function guardFileSizes({ read, warn, ok, skip, note, listTree }) {
  // Que pastas existem de facto. Um projeto derivado pode ter removido a camada so-Claude
  // (`.claude/hooks/`), e entao os tetos que apontam para la nao estao "em falta" — estao
  // fora do alcance. Reporta-los como ficheiros desaparecidos seria afirmar sobre o que
  // nao se olhou.
  const presentes = PASTAS.filter((p) => listTree(p, ".mjs") !== null);
  const ausentes = PASTAS.filter((p) => !presentes.includes(p));
  const noAlcance = (f) => presentes.some((p) => f.startsWith(`${p}/`));
  const ficheiros = presentes.flatMap((p) => listTree(p, ".mjs"));
  if (ausentes.length) {
    note(`Guard 17: ${ausentes.join(", ")} nao existe(m) — os tetos dessa(s) pasta(s) ficam fora do alcance`);
  }
  if (ficheiros.length === 0) {
    // Um projeto derivado pode ter removido a maquinaria. "Nao encontrei" tem de o DIZER.
    skip(`Guard 17 (tamanho de ficheiro) — sem ficheiros .mjs em ${PASTAS.join(" nem ")}`);
    return 1;
  }

  let problemas = 0;
  let maior = { f: null, n: 0 };
  const vistos = new Set();

  for (const f of ficheiros.sort()) {
    const src = read(f);
    if (src === null) continue; // listado e ilegivel: outro guard trata disso
    const n = contaLinhas(src);
    vistos.add(f);
    if (n > maior.n) maior = { f, n };

    const teto = TETOS[f];
    if (teto === undefined) {
      if (n > LIMITE) {
        warn(
          `${f} tem ${n} linhas (> ${LIMITE}) — \`core-rules.md\` torna o splitting obrigatorio. ` +
            `Dividir, ou (se houver razao) congelar em TETOS de guards/sizes.mjs com a razao por escrito`
        );
        problemas++;
      }
      continue;
    }

    if (n > teto) {
      warn(
        `${f} tem ${n} linhas e o teto congelado e ${teto} — este ficheiro ja estava acima de ` +
          `${LIMITE} linhas e so pode ENCOLHER. Dividir antes de acrescentar`
      );
      problemas++;
    } else if (n <= LIMITE) {
      // A catraca fechou. Deixar a entrada era guardar uma excecao para um problema que ja
      // nao existe — e a proxima pessoa lia-a como licenca para voltar a crescer.
      warn(
        `${f} tem ${n} linhas e ja cabe no limite de ${LIMITE} — remover a entrada de TETOS ` +
          `em guards/sizes.mjs (a excecao sobreviveu ao problema)`
      );
      problemas++;
    }
  }

  // Uma entrada de TETOS para um ficheiro que ja nao existe e uma excecao que ninguem vai
  // rever: renomeou-se ou apagou-se o ficheiro e a linha ficou.
  for (const f of Object.keys(TETOS)) {
    if (!noAlcance(f)) continue; // pasta ausente: ja reportado acima, e nao e o mesmo achado
    if (!vistos.has(f)) {
      warn(`TETOS em guards/sizes.mjs cita \`${f}\`, que nao existe — renomeado ou removido?`);
      problemas++;
    }
  }

  if (problemas === 0) {
    const congelados = Object.keys(TETOS).length;
    ok(
      `tamanho de ficheiro: ${ficheiros.length} ficheiros .mjs, maior ${maior.f} (${maior.n}), ` +
        `${congelados} congelado(s) acima de ${LIMITE} e nenhum a crescer`
    );
  }
  return 1;
}
