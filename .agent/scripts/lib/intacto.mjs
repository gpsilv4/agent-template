/**
 * "O projeto nao mexeu neste ficheiro" — {{PROJECT_NAME}}
 *
 * A pergunta que o motor do `/upgrade` faz a cada ficheiro: o consumidor tem-no como a tag o
 * deixou, ou alterou-o? Com placeholders, igualdade de texto responde mal: o bootstrap pos la o
 * nome do projeto, e quem mede (a 2b) nao o sabe — usa um nome de fachada. Medido num derivado
 * real: 68 de 71 ficheiros davam "alterado" so por isso (#176).
 *
 * Aqui cada `{{ X }}` da tag aceita o que o consumidor la tiver, **numa so linha** (sem retrocesso
 * catastrofico). Sem placeholders, e igualdade simples. O #179 leva esta comparacao ao resto do
 * motor; hoje so a lista `substituidos` a usa.
 */

const UM_PLACEHOLDER = /\{\{(?!args\})[A-Z_]+\}\}/;

/** `doConsumidor` e `daTag` iguais, a menos do valor de cada placeholder da tag. */
export function intactoAMenosDePlaceholders(doConsumidor, daTag) {
  const partes = daTag.split(new RegExp(UM_PLACEHOLDER.source, "g"));
  if (partes.length === 1) return doConsumidor === daTag;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${partes.map(esc).join("[^\\n]*?")}$`).test(doConsumidor);
}
