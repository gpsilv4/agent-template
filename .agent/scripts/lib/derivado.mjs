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

/**
 * As rules que a Fase 2.2 do `BOOTSTRAP.md` manda GERAR, lidas da propria tabela para nao
 * envelhecer: um ficheiro gerado que entre la, entra aqui.
 *
 * Estava escrita a mao no `simulate-derived.mjs` e no `lib/projeto-de-ontem.mjs`, e a fixture
 * `bootstrapado()` ia levar a terceira copia (#190) — o `TP8`.
 *
 * @param {string | null} bootstrap  o texto do `BOOTSTRAP.md` (o do HEAD, ou o de uma tag)
 * @returns {string[]} caminhos relativos; vazio quando nao ha ficheiro ou a seccao mudou de forma
 */
export function rulesGeradasDe(bootstrap) {
  const seccao = bootstrap?.split(/^### 2\.2 /m)[1]?.split(/^### 2\.3 /m)[0] ?? "";
  return [...new Set([...seccao.matchAll(/`(\.agent\/rules\/[a-z-]+\.md)`/g)].map((m) => m[1]))];
}
