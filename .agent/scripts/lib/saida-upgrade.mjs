/**
 * As linhas que o `/upgrade` mostra antes de se aprovar — {{PROJECT_NAME}}
 *
 * Uma so funcao por lista, para os DOIS modos: o simulador do lado do template e a 2b dentro de um
 * derivado. Escritas em cada um, divergiam — e uma ja tinha divergido: as `migracoes` so eram
 * impressas pelo simulador, e a 2b, que e o modo que um consumidor real corre, nunca as mostrava
 * (#176). Nao recusa nada, so formata: quem decide e quem le.
 */

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
