/**
 * As linhas que o `/upgrade` mostra antes de se aprovar — {{PROJECT_NAME}}
 *
 * Uma so funcao por lista, para os DOIS modos: o simulador do lado do template e a 2b dentro de um
 * derivado. Escritas em cada um, divergiam — e uma ja tinha divergido: as `migracoes` so eram
 * impressas pelo simulador, e a 2b, que e o modo que um consumidor real corre, nunca as mostrava
 * (#176). Nao recusa nada, so formata: quem decide e quem le.
 *
 * E as listas soltas nao chegavam: cada modo imprimia-as com o seu idioma e pela sua ordem, e a
 * ordem ja divergia (#243). Os dois modos chamam `imprimeAntesDeAprovar`, e mais nada.
 */
import { linhasNaoCopiados } from "./fora-do-template.mjs";

/** Os ficheiros que o projeto ALTEROU e a copia vai substituir. */
export const linhasSubstituidos = (substituidos) =>
  substituidos.length === 0
    ? []
    : [
        `${substituidos.length} ficheiro(s) que este projeto ALTEROU vao ser substituidos pela versao do template:`,
        ...substituidos.map((c) => `        ${c}`),
        "        Um guard ou par proprio ligado num deles passa para config/guards-do-projeto.mjs (upgrade-why.md).",
      ];

/** As constantes customizadas que mudaram de casa: o ficheiro novo chega com os defaults. */
export const linhasMigracoes = (migracoes) =>
  migracoes.length === 0
    ? []
    : [
        `${migracoes.length} constante(s) customizada(s) mudaram de casa — migrar A MAO:`,
        ...migracoes.map(({ nome, de, para }) => `        ${nome}: ${de}  ->  ${para}`),
        "        O valor antigo esta no historico do git; o novo ficheiro chega com os defaults.",
      ];

/** Os agentes customizados cujo `tools:` difere do do template (#240): o motor so traz os intactos. */
export const linhasAgentes = (agentes) =>
  agentes.length === 0
    ? []
    : [
        `${agentes.length} agente(s) com \`tools:\` diferente do template — trazer o \`tools:\` novo A MAO:`,
        ...agentes.map((a) => `        .claude/agents/${a}`),
        "        O motor nao os actualizou (estao customizados), e o hook guard-subagent-bash impoe o tools: deles.",
      ];

/** Os ficheiros que sairam do template e o projeto ainda tem. Numa MIGRACAO (o mesmo nome noutra
 *  pasta) adiar a remocao deixa as duas estruturas, e e isso que poe o gate vermelho. */
export const linhasRemovidos = (removidos, desde) => {
  if (removidos.length === 0) return [];
  const migrados = removidos.filter((r) => r.migrado).length;
  return [
    `${removidos.length} ficheiro(s) sairam do template desde ${desde} e continuam no projeto:`,
    ...removidos.map(({ caminho, migrado }) => `        ${caminho}${migrado ? "   (MIGRADO: o mesmo nome existe noutra pasta)" : ""}`),
    ...(migrados
      ? [
          `        ${migrados} sao MIGRACAO, nao limpeza — adiar a remocao deixa o projeto`,
          "        com as duas estruturas, e e isso que poe o gate vermelho.",
        ]
      : []),
  ];
};

/**
 * Tudo o que se le antes de aprovar, pela MESMA ordem nos dois modos: o que vai ser substituido,
 * o que nao foi copiado, os agentes, as constantes que mudaram de casa, e o que saiu do template.
 * @returns {string[][]} so os blocos nao vazios; o primeiro elemento de cada um e o titulo.
 */
export const blocosAntesDeAprovar = ({ medido, agentes, desde }) =>
  [
    linhasSubstituidos(medido.substituidos),
    linhasNaoCopiados(medido.naoCopiados),
    linhasAgentes(agentes),
    linhasMigracoes(medido.migracoes ?? []),
    linhasRemovidos(medido.removidos, desde),
  ].filter((b) => b.length);

/** Imprime os blocos: o titulo por `ok` (o idioma do chamador), o detalhe tal como esta. */
export function imprimeAntesDeAprovar(opcoes, ok) {
  for (const [titulo, ...resto] of blocosAntesDeAprovar(opcoes)) {
    ok(titulo);
    for (const l of resto) console.log(l);
  }
}
