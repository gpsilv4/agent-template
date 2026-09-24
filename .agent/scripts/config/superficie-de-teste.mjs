/**
 * Configuracao do PROJETO para o verificador da superficie de teste — {{PROJECT_NAME}}
 *
 * **Este ficheiro e teu. O `/upgrade` nunca o SUBSTITUI** — so o cria se ainda nao existir.
 *
 * PORQUE EXISTE: estas duas tabelas dizem **que ficheiros sao testes nesta stack**, e isso e
 * decisao do projeto, nao logica do verificador. Viviam dentro do `check-test-surface.mjs`, que
 * o upgrade substitui por inteiro — e a mitigacao era preserva-las **pelo nome**, numa lista
 * mantida a mao (`CONSTANTES_DO_PROJETO`). O ficheiro que a guarda ja dizia que ela *"encolhe a
 * cada uma que se mude, e o objectivo e desaparecer"*.
 *
 * Uma lista a mao envelhece, e ja envelheceu: o `ALVOS_REPROVAM` ficou de fora dela e a decisao
 * de um projeto perdeu-se **em silencio** (ver `upgrade-why.md`). A separacao fecha a classe em
 * vez de a mitigar.
 *
 * SO SE PODE FAZER ISTO PORQUE `config/` ESTA NA SUPERFICIE CONGELADA — o commit anterior deste
 * ticket. Sem ele, mover estas tabelas para ca **tirava-as** da vigilancia, e estreitar a
 * seleccao dos testes e literalmente o invariante 2 do `TP4`, que este verificador existe para
 * apanhar. Foi por isso que a proposta foi reprovada duas vezes em auditoria.
 *
 * O QUE **NAO** VEIO PARA CA, e a razao de cada um:
 *
 *   `CONFIG_CONTAVEIS`  — nao e decisao de stack. E a lista dos instrumentos de medida deste
 *                         template (`check-*`, `guards/*`, os hooks, o `.githooks/`), e um
 *                         derivado nao tem razao para lhe mexer. Move-la era convidar a que a
 *                         "limpassem".
 *
 *   o glob de PREFIXO   — `tests?[-_]...` existe porque as suites DESTE repo se chamam assim, e
 *                         elas viajam para dentro de cada derivado. E conhecimento do template,
 *                         nao do consumidor: se estivesse aqui, um projeto que limpasse a sua
 *                         configuracao desligava a vigilancia sobre as suites que herdou.
 *
 * A fronteira, dita de uma vez: **aqui fica o que descreve a stack DO CONSUMIDOR**; na logica
 * fica o que descreve a maquinaria que ele herdou.
 */

/**
 * Os ficheiros que sao TESTES nesta stack. ADAPTAR no bootstrap.
 *
 * Congelar so os testes nao basta: estreitar o `include` do runner remove falhas igualmente bem
 * e **nao toca em nenhum ficheiro de teste**. E por isso que a configuracao que os seleciona
 * entra na superficie ao lado deles.
 *
 * A FRACAO DE SUITES QUE CADA PADRAO APANHA NAO SE ESCREVE AQUI. Foi escrita tres vezes e
 * esteve errada tres vezes. Conta-se:
 *   git ls-files | grep -E '(^|/)tests?[-_][^/]+\.mjs$|(^|/)tests?/[^/]+\.mjs$'
 */
export const TEST_GLOBS_DO_PROJETO = [
  /(^|\/)(tests?|__tests__|spec|e2e)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /_test\.py$/i,
  /(^|\/)test_[^/]+\.py$/i,
];

/**
 * Configuracao **opaca** do runner: mexer nela pode estreitar a seleccao de uma forma que
 * nenhuma contagem apanha, logo qualquer alteracao pede confirmacao humana. ADAPTAR no bootstrap.
 *
 * `pytest.ini`/`tox.ini` sao **so** configuracao de teste. O `pyproject.toml` e o `setup.cfg`
 * NAO estao aqui de proposito — misturam deps e versao com a seleccao de testes, e um bump de
 * versao dava exit 1 em qualquer projeto Python (medido). Esses vivem em `CONFIG_CONTAVEIS`, na
 * logica, e medem-se por contagem.
 *
 * A fronteira entre os dois nao e limpa — e a MESMA decisao de stack dividida por razao de
 * mecanismo — e fica escrita aqui para quem a herdar nao a "arrumar" sem saber o que custa.
 */
export const CONFIG_GLOBS_DO_PROJETO = [
  /(^|\/)(vitest|jest|playwright|cypress|karma)\.config\.[cm]?[jt]s$/i,
  /(^|\/)(conftest|factories)\.py$/i,
  /(^|\/)(pytest\.ini|tox\.ini)$/i,
  /(^|\/)\.mocharc\./i,
];
