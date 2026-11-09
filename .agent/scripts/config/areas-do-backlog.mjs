/**
 * As AREAS do backlog deste projeto — {{PROJECT_NAME}}
 *
 * **Este ficheiro e teu. O `/upgrade` nunca o SUBSTITUI** — so o cria se ainda nao existir.
 *
 * PORQUE EXISTE (#465): o Tipo diz a especie de mudanca (Bug, UX, Divida Tecnica, Feature), um por ticket; a Area diz
 * o ASSUNTO, e um ticket pode ter varias (`seguranca, dados`). Sem uma lista, `segurança` e `seguranca` eram duas areas.
 * Com a coluna `Area` nas tabelas por tipo do `backlog.md`, o `check-backlog` verifica cada valor contra esta lista
 * (pelo `norm`: sem acentos e sem caixa). Sem a coluna, nada se verifica.
 *
 * COMO SE ADAPTA: acrescentar, tirar ou renomear chaves, cada uma com uma definicao de uma frase (para quem escolhe).
 * Sugestoes que a base nao traz: `i18n` (traducoes), `seo`, `mobile`/`pwa`, `ia` (modelos e prompts proprios),
 * `pagamentos`.
 *
 * Depois de mudar a lista com o `backlog-board.mjs --vigiar` a correr, reinicia-lo: ele so le a lista ao arrancar.
 */

/** `{ chave: definicao }`. */
export const AREAS = {
  seguranca: "protege contra abusos e fugas: vulnerabilidades, permissoes, segredos, cabecalhos",
  privacidade: "dados pessoais e o que a lei pede: RGPD, consentimento",
  dados: "como os dados se guardam: modelo, migracoes, copias de seguranca",
  desempenho: "rapidez e peso: tempo de carga, bundle, LCP",
  a11y: "acessibilidade: leitor de ecra, contraste, teclado",
  testes: "confianca de que funciona: cobertura, E2E, testes instaveis",
  docs: "documentacao: README, guias",
  ci: "do commit a producao: pipeline, minutos, deploy",
  dependencias: "pacotes de terceiros: versoes, Dependabot, vulnerabilidades em pacotes",
  integracoes: "servicos externos: APIs, quotas, IA externa",
};
