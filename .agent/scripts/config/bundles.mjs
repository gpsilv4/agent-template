/**
 * Configuracao do PROJETO para o verificador de bundles — {{PROJECT_NAME}}
 *
 * **Este ficheiro e teu. O `/upgrade` nunca o SUBSTITUI** — so o cria se ainda nao existir.
 *
 * PORQUE EXISTE: a configuracao vivia dentro do `check-bundle-sizes.mjs`, que e logica e que o
 * upgrade **substitui**. A mitigacao era uma lista de nomes a preservar, mantida a mao — e uma
 * lista a mao envelhece. Foi assim que o `ALVOS_REPROVAM` ficou de fora dela e a decisao de um
 * projeto (suspender o gate, com ticket aberto) se perdeu **em silencio**, com o verificador a
 * correr e a medir bem.
 *
 * O modo de falha era o pior que ha: nada desaparecia do ecra, so o veredicto mudava. Uma
 * verificacao por diferenca de output apanha o que some; **nao apanha um default que regressa**.
 *
 * A separacao fecha a classe em vez de a mitigar: o upgrade passa a poder copiar
 * `.agent/scripts/**` por inteiro, porque a configuracao ja nao esta la dentro.
 */

/** As rotas que este projeto mede, e o orcamento de cada uma. ADAPTAR no bootstrap. */
export const TARGETS = {
  "/":        { name: "Home",     target: 160, alarm: 180 },
  // "/about":   { name: "About",    target: 155, alarm: 175 },
  // "/dashboard": { name: "Dashboard", target: 160, alarm: 180 },
};

/** Os alvos de tamanho reprovam, ou so avisam?
 *
 *  **`true` por omissao** — um orcamento que nao reprova nao e um orcamento.
 *
 *  Porque existe o interruptor: quando um projeto liga a medicao a serio pela primeira vez (o
 *  manifesto RSC acima), os alvos que ja la estavam foram escritos contra um numero que **nao
 *  era medicao**. Medido num derivado real: as dez rotas ficaram **1,4x a 2,0x** acima. Nessa
 *  altura ha tres saidas, e duas sao mas:
 *    - subir os alvos -> transforma um diagnostico em norma, e o orcamento passa a descrever
 *      o que ha em vez de o que se quer;
 *    - deixar o gate vermelho -> bloqueia todos os PRs por um problema que nao e deles;
 *    - **suspender o JUIZO sobre o tamanho**, com um ticket aberto e a razao escrita — e o
 *      que esta linha permite.
 *
 *  O que NAO se suspende: **nao conseguir medir continua a reprovar** (rota por resolver,
 *  ficheiro ausente, caminho fora do `.next/`). So o juizo sobre o numero e que fica de fora.
 *
 *  A alternativa que se tentou primeiro e que NAO se deve usar: `|| true` no `ci.yml`. O
 *  `check-test-surface` apanhou-a, e com razao — e a neutralizacao silenciosa que ele existe
 *  para detetar. A decisao vive aqui, visivel e com data, ou nao vive. */
export const ALVOS_REPROVAM = true;
