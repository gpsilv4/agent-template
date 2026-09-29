/**
 * ONDE VIVE A MAQUINARIA que precisa de rede — a lista que a descoberta do `mutation-sweep.mjs`
 * varre a procura de ficheiros sem par.
 *
 * VIVE A PARTE porque e a parte que NAO PARA DE CRESCER. Cada entrada aqui nasceu de uma
 * lacuna medida (um modulo novo que entrou sem par, um harness que decidia veredictos e estava
 * fora, o `lib/` dos hooks que era invisivel), e o ficheiro que a albergava chegou a exactamente
 * 500 linhas contra um limite de 500: a entrada seguinte nao cabia. `TETOS` e catraca, nao
 * isencao, logo a lista saiu para onde possa crescer sem partir nada.
 *
 * Nao tem sitios de recusa — e um construtor de lista. Por isso nao precisa de par proprio
 * (`PODE_SER_ISENTO` cobre `.agent/scripts/lib/`), e quem a exercita e o
 * `test-mutation-sweep.mjs` atraves do varredor.
 */

/** @param listarDir (rel: string) => string[] — os nomes de ficheiro de uma pasta do repo.
 *  @returns os caminhos, relativos a raiz, que TEM de constar de `PARES`. */
export function alvosNoDisco(listarDir) {
  return [
    // A convencao do repo: verificadores sao `check-*.mjs` e os seus modulos vivem em
    // `guards/`. Este ficheiro nao entra na descoberta — ja esta em `PARES`, e incluir-se
    // fazia a sua propria fixture de teste (que substitui `PARES`) reprovar.
    ...listarDir(".agent/scripts").filter((f) => /^check-.*\.mjs$/.test(f)).map((f) => `.agent/scripts/${f}`),
    ...listarDir(".agent/scripts/guards").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/guards/${f}`),
    // `lib/`: modulos partilhados com sitios de recusa proprios (hoje, o registo de suites
    // por descoberta). Sem esta linha um modulo novo ali entrava sem par e sem suite.
    ...listarDir(".agent/scripts/lib").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/lib/${f}`),
    // Os harnesses: decidem o veredicto de todas as suites e estavam fora da descoberta.
    ...listarDir(".agent/scripts/tests/harness").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/tests/harness/${f}`),
    // O `simulate-derived.mjs` nao e um `check-*` nem um harness, mas TEM sitios de recusa
    // (8 `fatal()`) — e escapava a descoberta pelo NOME. A convencao e util mas nao e a
    // verdade: o que faz de um ficheiro um verificador e ter sitios de recusa, nao o prefixo.
    ...listarDir(".agent/scripts").filter((f) => /^simulate-.*\.mjs$/.test(f)).map((f) => `.agent/scripts/${f}`),
    // Os hooks tambem: sao codigo de enforcement com sitios de decisao, e estavam fora da
    // regra que o template impoe a todos os verificadores ("cada um com a sua suite"). Um
    // hook novo sem testes passava sem ninguem notar — e um hook errado e pior que um guard
    // errado, porque corre ANTES de cada ferramenta.
    ...listarDir(".claude/hooks").filter((f) => f.endsWith(".mjs")).map((f) => `.claude/hooks/${f}`),
    // E o `lib/` dos hooks, que estava de fora. A assimetria era gritante e ninguem a via: o
    // `.agent/scripts/lib/` esta na descoberta doze linhas acima, e este nao estava — a mesma
    // lacuna fechada de um lado e deixada aberta do outro.
    //
    // O que la vive nao e acessorio: a `lib/fronteira.mjs` DECIDE o que um agente pode escrever,
    // e a `lib/verbos-git.mjs` decide o que e uma invocacao destrutiva de git. Apareceu numa
    // auditoria da Fase 0 do #101, que invocava "sitios de recusa em 220" como criterio de
    // pronto para uma alteracao a `fronteira.mjs` — um numero que **nao se mexe** quando esse
    // ficheiro muda, porque a varredura nao o media. Um criterio que nao pode reprovar (`TP1`).
    ...listarDir(".claude/hooks/lib").filter((f) => f.endsWith(".mjs")).map((f) => `.claude/hooks/lib/${f}`),
    // E o `.githooks/`, pela mesma razao: codigo de enforcement que corre antes de um commit
    // ficar escrito. Sem esta linha, um hook novo ali entrava sem par e sem suite — que e o
    // buraco que esta descoberta existe para nao ter. Os ficheiros nao tem extensao (o git
    // exige o nome exacto do evento), logo nao ha filtro por sufixo.
    ...listarDir(".githooks").map((f) => `.githooks/${f}`),
  ];
}
