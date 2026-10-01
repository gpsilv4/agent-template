/**
 * A ORDEM POR ALVO da varredura de mutacao (#156) — o que o registo e o motor partilham.
 *
 * PORQUE E UM MODULO A PARTE, e so de dados e funcoes puras: o motor
 * (`lib/varredura-paralela.mjs`) e o registo (`lib/registo.mjs`) precisam das MESMAS constantes,
 * e uma segunda copia seria o `TP8`. Elas viviam no `registo.mjs`, e o motor passou a importa-lo
 * — o que trouxe para a fixture do `test-mutation-sweep` um modulo com sitios de recusa que o
 * `pares.mjs` sintetico nao declara, e a descoberta reprovou-a com `SEM PAR` (catorze testes
 * vermelhos de uma vez). Um modulo sem um unico sitio de recusa e isento de par por desenho, e
 * nao arrasta nada consigo.
 *
 * O que e: na corrida mutada, o modulo DONO do alvo corre primeiro. O fail-fast (#140) sai no
 * primeiro `FAIL`, mas o teste que mata um mutante de `guards/settings.mjs` vivia no
 * `tests-settings.mjs` — descoberto por ordem alfabetica, quase no fim. E ORDENACAO, nunca
 * filtragem (#102): o dono corre primeiro e depois correm TODOS os outros.
 */

/** Os entry points que honram o `ENV_ALVO`. O `test-hooks` e o `test-simulate-upgrade` entram
 *  quando tiverem fail-fast (#157): sem ele a ordem nao muda o tempo. */
export const ORDENA_POR_ALVO = ["test-guards.mjs"];
export const ENV_ALVO = "SWEEP_ALVO";
/** A PROVA DO PREFIXO: correr so o dono, sem mutacao, e sair. Ver o motor. */
export const ENV_SO_DONO = "SWEEP_SO_DONO";
/** Impressa depois do dono. O motor le-a: um `FAIL` SEM ela veio do dono (o fail-fast sai antes
 *  de a imprimir); um `FAIL` depois dela veio de fora, e e confirmado na ordem normal. Nao
 *  contem `FAIL` de proposito: nao pode casar o `PROVA_DE_FALHA`. */
export const MARCA_FIM_DO_DONO = "  -- varredura: fim do modulo dono --";
/** O que e um modulo de teste descoberto. Uma so definicao para quem descobre e para quem
 *  calcula o dono sem correr nada. */
export const EH_MODULO_DE_TESTE = /^tests-.*\.mjs$/;

/** O dono de um alvo, POR CONVENCAO (decisao do #102, nunca uma tabela a mao):
 *  `<pasta>/X.mjs` -> `tests-X.mjs`, se existir entre os modulos DESTE entry point. */
export function donoDe(alvo, nomesDesteEntryPoint) {
  const nome = `tests-${String(alvo).split("/").pop()}`;
  return nomesDesteEntryPoint.includes(nome) ? nome : null;
}
