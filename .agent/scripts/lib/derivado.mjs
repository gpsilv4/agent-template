/**
 * "Este repo e o template, ou um projeto derivado dele?" — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: a pergunta decide o comportamento de tres sitios — o `check-doc-versions.mjs`
 * (o Guard 13 so varre placeholders depois do bootstrap), o `simulate-upgrade.mjs` (as tags de um
 * derivado sao as releases DELE, logo a simulacao mediria outra coisa) e o `simulate-derived.mjs`
 * (a promessa "funciona no teu projeto derivado" so o template a pode verificar).
 *
 * Estava escrita em **dois** deles, a mao. Acrescentar a terceira copia era escrever o `TP8` no
 * mesmo trabalho que o corrige.
 *
 * OS DOIS SINAIS, e porque sao dois: o bootstrap **escreve** `.agent/.template-version` e **manda
 * apagar** o `BOOTSTRAP.md`. Qualquer um basta — um projeto que tenha apagado o bootstrap sem
 * deixar marca (ou o contrario) e na mesma um derivado, e olhar so para um deixava metade dos
 * derivados a correr o caminho errado.
 *
 * @param ler   funcao `(caminhoRelativo) => string | null`. Recebe-se em vez de se ler aqui porque
 *              cada chamador ja tem a sua: uns leem relativo a raiz do repo, outros de uma copia
 *              em `tmp`. Impor uma delas obrigava os outros a adaptarem-se a esta.
 * @returns {boolean} `true` se o bootstrap ja correu neste repo.
 */
export const ehDerivado = (ler) =>
  ler(".agent/.template-version") !== null || ler(".agent/BOOTSTRAP.md") === null;
