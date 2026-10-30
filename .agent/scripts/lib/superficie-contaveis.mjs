/**
 * A configuracao CONTAVEL da superficie de teste do `check-test-surface.mjs` — {{PROJECT_NAME}}
 *
 * Saiu do `check-test-surface.mjs` quando ele chegou as 497 linhas (o Guard 17, #400). E do TEMPLATE (os instrumentos
 * de medida deste repo), e nao do projeto: a stack do consumidor vive em `config/superficie-de-teste.mjs`. Nao tem
 * sitios de recusa; cada glob e um sitio da varredura pelo par em `lib/pares.mjs` (o neutro `/(?!)/ || `), logo um
 * glob novo pede um caso que o prenda.
 *
 * Configuracao **contavel**: o que seleciona os testes NESTE repo nao e um `vitest.config`,
 * e a lista de steps do `ci.yml` e a tabela `PARES` de `lib/pares.mjs`. Apagar um step
 * do CI desliga uma suite inteira sem tocar em nenhum ficheiro de teste (invariante 2 do
 * `TP4`). Estes entram na superficie mas **nunca** dao o aviso generico de "confirmar": o que
 * deles interessa mede-se por contagem.
 *
 * A separacao nao e cosmetica. Na primeira versao estavam em `CONFIG_GLOBS` e qualquer
 * alteracao a QUALQUER workflow do `.github/` — `dependabot-auto-merge.yml`, `e2e.yml`, que
 * nao correm teste nenhum — dava WARN e exit 1. Medido num projeto derivado: dois falsos
 * positivos que fechavam o gate.
 */
export const CONFIG_CONTAVEIS = [
  /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
  /(^|\/)mutation-sweep\.mjs$/,
  // Os instrumentos de medida tambem: o glob de prefixo exige `test`/`tests` no INICIO do
  // nome, logo os `check-*.mjs` e os `guards/*.mjs` ficavam fora da superficie
  // congelada — e desligar um aviso deles enfraquece a verificacao sem tocar num teste.
  /(^|\/)check-[^/]+\.mjs$/,
  /(^|\/)guards\/[^/]+\.mjs$/,
  // O harness nao tem linha propria: `test-harness.mjs` ja casa o glob de prefixo
  // (`tests?[-_]`), e a superficie e a UNIAO das listas. Uma entrada que outra cobre nao se
  // pode testar — desliga-la nunca muda nada (#183, medido).
  // Os HOOKS, pela mesmissima razao que os `check-*` e os `guards/*` acima: sao codigo de
  // enforcement, e desligar uma decisao deles enfraquece a rede sem tocar num teste. Ficavam
  // de fora porque os globs de teste so apanham `.claude/hooks/tests/` (a pasta `tests/`) —
  // as suites estavam na superficie e o que elas testam nao. Apagar o
  // `guard-protected-branch.mjs` nao produzia uma palavra.
  /(^|\/)\.claude\/hooks\/[^/]+\.mjs$/,
  // `.claude/hooks/lib/` pela MESMA razao que `.agent/scripts/lib/` acima — e a lacuna foi
  // fechada de um lado e deixada aberta do outro. Medido no CI: extrair a verificacao de
  // fronteira para `lib/fronteira.mjs` leu-se como perda de 6 casos no ficheiro de origem,
  // porque o destino nao estava na superficie. O `[^/]+` do padrao acima nao alcanca `lib/`.
  /(^|\/)\.claude\/hooks\/lib\/[^/]+\.mjs$/,
  // O `.githooks/` nao tem extensao (o git exige o nome exato do evento), logo nao ha sufixo
  // por onde o apanhar.
  /(^|\/)\.githooks\/[^/]+$/,
  // E a logica deles em `lib/` (#278): o `commit-msg` e um ponteiro, e o que decide vive la.
  /(^|\/)\.githooks\/lib\/[^/]+\.mjs$/,
  // As tabelas de padroes deste verificador (`lib/surface-patterns.mjs`) ficam na superficie
  // pelo glob de `lib/` abaixo. Tinham linha propria de antes de se mudarem para la — redundante
  // desde entao, e por isso impossivel de testar (#183).
  // `lib/`: os modulos partilhados. A mesma lacuna, encontrada ao extrair a tabela `PARES`
  // para `lib/pares.mjs` — a extracao lia-se como perda de 19 pares porque o destino nao
  // estava na superficie. E ja valia antes disso para o `lib/registo.mjs`, que **e** o
  // invariante 2 do `TP4` (a seleccao do runner) e estava fora da superficie congelada.
  // Ancorado a `.agent/scripts/`: sem isso casava `src/lib/utils.mjs` e `packages/x/lib/y.mjs`
  // de qualquer projeto derivado, e apagar um ficheiro normal da app dava
  // "ficheiro da superficie de teste APAGADO" com exit 1 — a mesma classe de falso positivo
  // que o comentario acima ja documenta ter fechado uma vez.
  /(^|\/)\.agent\/scripts\/lib\/[^/]+\.mjs$/,
  // `.agent/scripts/config/`: a configuracao do PROJETO, que a matriz de propagacao ja nomeia
  // como o sitio preferido para tudo o que e decisao e nao logica. Estava FORA da superficie
  // congelada — medido com uma sonda: um ficheiro novo la dentro dava "1 ficheiro alterado,
  // nenhum na superficie".
  //
  // Isso e um vao, e cresce: o que vive nesta pasta decide COMO as verificacoes correm. O
  // `ALVOS_REPROVAM` do `config/bundles.mjs` liga e desliga um gate inteiro, e desliga-lo nao
  // produzia uma palavra — nem contagem, nem aviso. E o invariante 2 do `TP4` (estreitar a
  // seleccao sem tocar num teste) aplicado a um directorio que foi criado depois de o
  // verificador existir.
  //
  // Em CONTAVEIS e nao em GLOBS: o que aqui interessa mede-se por contagem, e o aviso generico
  // de "confirmar" em cada alteracao a configuracao do proprio projeto seria ruido diario.
  /(^|\/)\.agent\/scripts\/config\/[^/]+\.mjs$/,
  // E o `package.json` (#296): so os scripts de TESTE contam (`lib/surface-patterns.mjs`), sem o generico.
  /(^|\/)(pyproject\.toml|setup\.cfg|package\.json)$/i,
];
