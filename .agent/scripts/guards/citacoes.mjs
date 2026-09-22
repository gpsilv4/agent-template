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

/** Onde os ficheiros citados podem viver.
 *
 *  ADAPTAVEL AO PROJETO, como os `TEST_GLOBS` do `check-test-surface.mjs`: um derivado tem as
 *  suas proprias pastas de scripts, e cravar so as do template fazia este guard acusar citacoes
 *  que resolvem. Medido num consumidor: a `business-logic.md` dele citava `seed.mjs`, que existe
 *  em `scripts/seed.mjs`, e saiu como citacao morta.
 *
 *  O proprio cabecalho deste guard avisa contra isso — *"um guard que acusa quem lhe obedece e
 *  desligado na primeira semana"* — e era ele a faze-lo.
 *
 *  As duas primeiras sao do template e nao se tiram; as seguintes acrescentam-se no bootstrap,
 *  conforme onde o projeto poe os seus scripts. Uma pasta que nao exista e ignorada em silencio:
 *  a lista diz onde PODE viver, nao o que tem de existir. */
const MAQUINARIA = [".agent/scripts", ".claude/hooks", "scripts", "tools"];

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

/** Um ponteiro de RACIONAL: `(porque: \`ficheiro.md\` § "Titulo")`. A ancora e o titulo EXACTO
 *  de uma seccao do destino, e nao um slug — computar slugs seria uma segunda copia da regra
 *  do GitHub, mantida aqui a mao (`TP8`), e um titulo com crases ou acentos torna-a fragil.
 *  Comparacao literal contra o texto que vem depois de `##`/`###`: sem algoritmo, sem deriva. */
const PONTEIRO = /\(porque[:,][^)]*?`([a-z][\w-]*\.md)`\s*§\s*"([^"]+)"\)/g;

/** Um `(porque ...)` que NAO tem a forma acima. Existe para a convencao nao ser opcional: sem
 *  isto, escrever `(porque: X)` sem ancora continuava a passar, e uma convencao que se pode
 *  ignorar nao e uma convencao. A forma de DEFINICAO — a que documenta o proprio padrao — usa
 *  `<ficheiro>` entre sinais de menor/maior e fica de fora. */
const PONTEIRO_SEM_ANCORA = /\(porque[:,](?![^)]*§)(?![^)]*<ficheiro>)[^)]*\)/g;

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

  // O indice das SECCOES de cada `.md` do repo: ficheiro -> titulos. Derivado do disco, como o
  // indice acima — uma lista a mao seria a mesma classe de defeito.
  const seccoes = new Map();
  for (const base of [...PASTAS, "src/docs"]) {
    for (const n of listDir(base, ".md") ?? []) {
      const c = read(`${base}/${n}.md`);
      if (c === null) continue;
      seccoes.set(`${n}.md`, [...c.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)].map((m) => m[1]));
    }
  }

  let problemas = 0;
  let citadas = 0;
  let ancoras = 0;

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
      // A ANCORA de um ponteiro de racional. O Guard 20 ja garantia que um ficheiro citado
      // existe; nao garantia que ele **contem o que a citacao promete** — e foi por ai que dois
      // ponteiros partiram ao mover evidencia (#112). Um ficheiro que existe com a seccao
      // movida para fora le-se como ponteiro valido.
      for (const m of linha.matchAll(PONTEIRO)) {
        const [, alvo, titulo] = m;
        ancoras++;
        const tem = seccoes.get(alvo);
        if (!tem) {
          warn(`${f}:${i + 1} aponta para \`${alvo}\`, que nao existe`);
          problemas++;
        } else if (!tem.includes(titulo)) {
          warn(`${f}:${i + 1} aponta para "${titulo}" em \`${alvo}\`, e essa seccao NAO existe la — a evidencia mudou de sitio e o ponteiro ficou a mentir`);
          problemas++;
        }
      }
      for (const m of linha.matchAll(PONTEIRO_SEM_ANCORA)) {
        warn(`${f}:${i + 1} tem \`${m[0]}\` sem ancora — a forma e (porque: \`ficheiro.md\` § "Titulo exacto da seccao")`);
        problemas++;
      }
    });
  }

  if (problemas === 0) ok(`Guard 20: ${citadas} citacao(oes) de ficheiro nas instrucoes, todas resolvem para um so; e ${ancoras} ponteiro(s) de racional apontam para uma seccao que existe`);
  return 1;
}
