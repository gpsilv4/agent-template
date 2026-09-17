/**
 * Guard 20: um ficheiro citado numa instrucao existe, e e um so — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: as rules e os workflows citam ficheiros pelo **nome**, sem caminho — *"os testes
 * vivem no `test-guards.mjs`"*, *"`CONTAGENS` (`surface-patterns.mjs`)"*. Sao instrucoes: alguem,
 * humano ou agente, vai procurar o ficheiro e segui-lo.
 *
 * Uma citacao morta **nao da erro nenhum**. Fica a mentir ate alguem a seguir, e quem a segue
 * perde tempo a procurar o que nao existe antes de desconfiar da documentacao.
 *
 * O QUE MEDE, e e deliberadamente estreito:
 *   - **zero** ficheiros com aquele nome -> a citacao esta morta;
 *   - **mais que um** -> e ambigua, e o leitor nao sabe qual seguir.
 *
 * O QUE NAO MEDE, e a razao importa: **um nome citado sem a pasta nao e defeito**. Medido no
 * proprio repo: dos 21 nomes nus nas instrucoes, 20 resolviam para exactamente um ficheiro, e 13
 * deles vivem numa subpasta. Exigir a pasta acusaria 13 citacoes correctas — e um guard que acusa
 * quem lhe obedece e desligado na primeira semana. Aconteceu ao Guard 19, que na primeira versao
 * acusou um harness que fazia tudo bem.
 *
 * (A premissa inicial deste guard era exactamente essa, e estava errada: um nome nu **nao**
 * envelhece quando o ficheiro se move — continua a resolver. Envelhece quando ele desaparece.)
 */

/** Onde vivem as INSTRUCOES. Nao inclui `.agent/scripts/`: la ha fixtures que inventam nomes de
 *  proposito (`check-orfao.mjs`, `guards/inchado.mjs`), e acusa-las seria acusar o desenho. */
const PASTAS = [".agent/rules", ".agent/workflows"];

/** Onde os ficheiros citados podem viver. */
const MAQUINARIA = [".agent/scripts", ".claude/hooks"];

/** Um nome de ficheiro `.mjs` dentro de crases. */
const CITADO = /`([a-z][\w-]*\.mjs)`/g;

/** O que NAO e uma citacao de ficheiro, por FORMA e nunca por lista de nomes — uma lista a mao
 *  dentro deste guard seria a mesma classe de defeito que ele vem da familia de apanhar:
 *
 *   - `tests-*.mjs`, `check-*.mjs` — padroes, nao ficheiros (o `*` ja os exclui do regex acima,
 *     mas a intencao fica escrita);
 *   - `tests-x.mjs`, `test-x.mjs`, `nome.mjs` — **exemplos**: um sufixo de uma so letra depois do
 *     tracao, ou um nome generico. Sao a forma que a prosa deste repo usa para dizer "um ficheiro
 *     qualquer com este feitio". */
const EXEMPLO = /^(?:tests?-[a-z]\.mjs|nome\.mjs|x\.mjs)$/;

/**
 * @returns {number} guards executados
 */
export function guardCitacoes({ read, warn, ok, skip, listDir, listTree }) {
  const instrucoes = PASTAS.flatMap((p) => (listDir(p, ".md") ?? []).map((n) => `${p}/${n}.md`));
  if (instrucoes.length === 0) {
    // Um projeto derivado pode ter podado as rules e os workflows. "Nao encontrei" tem de o DIZER:
    // um zero lido como "nada a verificar" e o `TP2`.
    skip(`Guard 20 (citacoes de ficheiro) — sem instrucoes em ${PASTAS.join(" nem ")}`);
    return 1;
  }

  // O indice do disco: nome -> caminhos. Derivado, nunca escrito a mao.
  const porNome = new Map();
  for (const base of MAQUINARIA) {
    for (const rel of listTree(base, ".mjs") ?? []) {
      const nome = rel.split("/").pop();
      if (!porNome.has(nome)) porNome.set(nome, []);
      porNome.get(nome).push(rel);
    }
  }

  let problemas = 0;
  let citadas = 0;

  for (const f of instrucoes) {
    const src = read(f);
    if (src === null) continue; // ilegivel: outro guard trata disso
    src.split("\n").forEach((linha, i) => {
      for (const m of linha.matchAll(CITADO)) {
        const nome = m[1];
        if (EXEMPLO.test(nome)) continue;
        const onde = porNome.get(nome);
        citadas++;
        if (!onde) {
          warn(`${f}:${i + 1} cita \`${nome}\`, que nao existe em ${MAQUINARIA.join(" nem ")} — instrucao a mandar procurar o que nao ha`);
          problemas++;
        } else if (onde.length > 1) {
          warn(`${f}:${i + 1} cita \`${nome}\`, e existem ${onde.length}: ${onde.join(", ")} — a instrucao nao diz qual`);
          problemas++;
        }
      }
    });
  }

  if (problemas === 0) ok(`Guard 20: ${citadas} citacao(oes) de ficheiro nas instrucoes, todas resolvem para um so`);
  return 1;
}
