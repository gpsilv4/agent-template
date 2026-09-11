/**
 * As tabelas de padroes do Test Surface Checker — {{PROJECT_NAME}}
 *
 * `CONTAGENS` (o que **nao pode descer**) e `MARCAS` (o que **nao pode aparecer**). Sao DADOS,
 * nao decisoes: nenhuma linha daqui reprova nada, e e por isso que vivem separadas — o
 * `check-test-surface.mjs` passou o flag das 500 linhas e as tabelas eram metade dele.
 *
 * Porque NAO se chama `check-*.mjs` nem vive em `guards/`: a descoberta do `mutation-sweep.mjs`
 * varre esses dois padroes e exige uma entrada em `PARES` para cada ficheiro que encontra. Um
 * ficheiro sem sitios de aviso — e este nao tem nenhum — reprova ali com `SINAL ERRADO`, e com
 * razao: um par que casa zero sitios esta desatualizado. Medido antes de escolher o nome.
 *
 * Mas ele **continua na superficie congelada**: ha uma entrada em `CONFIG_CONTAVEIS` para este
 * caminho. Sem ela, apagar metade das tabelas — que e desligar o detetor — nao mexia em nenhuma
 * contagem vigiada. Era esse o risco de extrair, e e ela que o fecha.
 *
 * Adaptar ao vocabulario do projeto no bootstrap: o que interessa e que os nomes contados sejam
 * os que o projeto **usa** para declarar um teste e uma assercao.
 */

// O que **nao pode descer**: apagar assercoes ou casos de teste enfraquece a superficie sem
// deixar nenhuma marca de `skip` para trás. Sem isto, cortar uma suite de 328 para 62 linhas
// passava com exit 0. Adaptar ao vocabulario do projeto no bootstrap: o que interessa e que
// os nomes contados sejam os que o projeto **usa** para declarar um teste e uma assercao.
const CONTAGENS = [
  { re: /\b(?:it|test|describe|context)\s*\(/, msg: "casos de teste" },
  { re: /\bdef\s+test_\w+/, msg: "casos de teste (python)" },
  { re: /\b(?:expect|assert\w*)\s*\(/, msg: "assercoes (expect/assert)" },
  // O vocabulario DESTE repo. Sem estas linhas a contagem de assercoes era **zero em todas
  // as suites** (o `expect(`/`assert(` nao aparece em nenhuma, fora de fixtures), e
  // esvaziar os `includes: [...]` de `test-guards.mjs` passava com `sem marcas de
  // enfraquecimento` e exit 0 — medido. Um gate que conta um vocabulario que o projeto nao
  // usa mede zero, e zero nao desce. Adaptar ao harness do projeto derivado.
  // `\[[^\]]` e nao `\[`: o ataque medido foi trocar `includes: ["x"]` por `includes: []`,
  // que mantem o `includes: [` e portanto a contagem. So os arrays NAO VAZIOS contam.
  { re: /\b(?:includes|excludes)\s*:\s*\[[^\]]/, msg: "assercoes (includes/excludes)" },
  { re: /\b(?:eq|contem)\s*\(/, msg: "assercoes (eq/contem)" },
  { re: /\bthrow new Error\s*\(/, msg: "assercoes (throw)" },
  // `test.each([...])` com a tabela esvaziada para `[]` mantem o `test(` e nao corre nada —
  // a mesma forma do `includes: []`. So as tabelas NAO VAZIAS contam.
  { re: /\.each\s*\(\s*\[[^\]]/, msg: "tabelas `each` nao vazias" },
  // A2: a "configuracao do runner" deste repo conta-se assim.
  // O `-?` e o `\b` nao sao cosmetica: a primeira versao exigia `run:` depois de so espacos
  // e `alvo:` no inicio da linha, logo media a forma que eu por acaso tinha escrito e nao a
  // forma YAML/JS equivalente (`- run:` inline, `{ alvo: ... }` na mesma linha). Um teste com
  // a outra forma apanhou-o.
  { re: /^\s*-?\s*run:\s*node\s+\S*test/m, msg: "steps de teste no CI" },
  { re: /\balvo:\s*"/, msg: "pares alvo/suite da varredura" },
  // A selecao de testes dentro de um `pyproject.toml`/`setup.cfg`, que trazem muito mais que
  // isso: estreitar o `testpaths` ou o `addopts` conta; mudar a versao ou as deps, nao.
  { re: /^\s*(?:testpaths|addopts|python_files|python_classes|python_functions)\s*=/m, msg: "selecao de testes do pytest" },
  // A forma mais eficaz de enfraquecer TODAS as suites de uma vez nao move nenhuma das
  // contagens acima: trocar `if (failures.length) {` por `if (false) {` no harness desliga o
  // veredicto e todas as suites passam a sair 0 para sempre. Medido: o gate dizia "sem marcas
  // de enfraquecimento" e saia 0. E o invariante 1 do `AP4` ("o veredicto assenta no exit code
  // do runner"), que este verificador nao protegia.
  // `zero: true` — so conta como enfraquecimento se chegar a **zero**, nao se apenas descer.
  // Consolidar tres `console.log` + `process.exit(1)` num helper faz a contagem cair de 3 para
  // 1 e e um refactor legitimo; medido num projeto derivado, dava WARN. O invariante real nao
  // e "nao pode descer", e **"o runner tem de ter um caminho de saida != 0"**. Apagar o unico
  // `process.exit(1)` continua apanhado; as outras duas deteccoes (a referencia a contagem de
  // falhas, e a condicao literalmente falsa) cobrem o ataque de o tornar inalcancavel.
  { re: /process\.exit\(\s*1\s*\)/, msg: "veredicto do runner (process.exit(1))", zero: true },
  // Contar o `process.exit(1)` NAO basta: o ataque medido nao o apaga, torna-o
  // **inalcancavel** (`if (failures.length) {` -> `if (false) {`), e a contagem nao se move.
  // O que desaparece e a **referencia a contagem de falhas** — e essa desce.
  { re: /\b(?:failures|falhas|problemas)\.length/, msg: "referencias a contagem de falhas" },
  // Os proprios verificadores estao na superficie (ver `CONFIG_CONTAVEIS`): despromover um
  // `warn(` a `note(` num guard desliga o gate sem mudar o exit code de nenhum teste — a
  // variante do `AP1` que este repo documenta.
  { re: /\b(?:warn|fatal)\s*\(/, msg: "sitios de aviso" },
];

// NOTA sobre este ficheiro se contar a si mesmo: ele esta na superficie congelada (ver
// `CONFIG_CONTAVEIS`), logo os padroes abaixo sao aplicados ao seu proprio codigo. Ha uma
// assimetria medida que convem saber antes de acrescentar uma entrada:
//   - um padrao `/\bfoo\b/` **nao** casa a sua propria definicao: no texto-fonte o `\b` sao
//     dois caracteres e o `b` e uma letra, logo nao ha fronteira de palavra antes de `foo`;
//   - um padrao com alternacao — `/\b(?:xit|xdescribe|xtest)\b/` — **casa-se a si mesmo**
//     (medido: tres ocorrencias), porque o `?:` e o `|` a volta nao sao caracteres de palavra.
// Consequencia pratica: acrescentar uma entrada do segundo tipo faz este ficheiro sinalizar-se
// no PR que a acrescenta. Nao e defeito — mudar o detetor merece um olhar humano —, mas e
// melhor saber porque acontece com umas entradas e nao com outras.

// Marcas de enfraquecimento. Procuradas **so** nas linhas ACRESCENTADAS da superficie
// congelada — nunca no codigo de producao, senao um `.skip(offset)` de paginacao ou um
// `only` de uma query dao falso positivo.
const MARCAS = [
  // Neutralizar um step de teste **sem o apagar**: a contagem de steps nao se move e nenhuma
  // marca de `skip` aparece. Medido: `|| true` num step do `ci.yml` passava com exit 0. As
  // tres formas abaixo removem falhas sem tocar em nenhum ficheiro de teste.
  { re: /run:[^\n]*\|\|\s*true/, msg: "step de teste neutralizado com `|| true`" },
  { re: /^\s*continue-on-error:\s*true/m, msg: "`continue-on-error: true`" },
  // DUAS falhas empilhadas na versao anterior desta linha, e cada uma sozinha ja matava a
  // excecao do `pull_request`:
  //   1. `\s*` e guloso mas recua: o lookahead falhava, o `\s*` voltava a largura ZERO, e
  //      passava a ser avaliado sobre " github…" (com espaco a frente), que nao casa a
  //      excecao. O match produzido era so `"        if:"`.
  //   2. A mortal: o `conta()` aplica `semStrings()` **antes** do regex, logo a linha
  //      comparada e `if: github.event_name == ""` — o literal `'pull_request'` **nao existe
  //      la** e a excecao nao poderia casar nem com o `\s*` corrigido.
  // Medido no `ci.yml` deste repo: acrescentar o step gated por `pull_request` — o caso de
  // uso para que a excecao foi escrita — levava a contagem de 4 para 5 e dava exit 1.
  // Agora ancora em `github.event_name`, que sobrevive ao `semStrings`, e o `[ \t]*` **dentro**
  // do lookahead e o que impede o recuo a largura zero de a contornar.
  // `cru: true` e o que torna a excecao possivel: ela cita um literal, e no texto
  // normalizado `'pull_request'` e `'push'` sao indistinguiveis. Assim so o gating em
  // `pull_request` e excluido — um step gated a `push` **conta**, porque deixa de correr em
  // PRs, e isso e enfraquecimento. O `[ \t]*` dentro do lookahead impede o recuo a largura
  // zero de o contornar.
  // A excecao tem de cobrir as formas em que a MESMA condicao se escreve, e ha tres eixos
  // independentes que se combinam. Cada um, sozinho, ja a fazia falhar:
  //   1. espacos a volta do `==` — o GHA nao os exige (`github.event_name=='pull_request'`);
  //   2. o wrapper da expressao — `${{ … }}`, que e a forma mais idiomatica de GHA;
  //   3. o wrapper do escalar YAML — `if: "…"`. (A nota anterior dizia que aspas duplas nao
  //      entravam "porque o GHA so aceita plicas". Isso e verdade do literal 'pull_request'
  //      DENTRO da expressao, e nao das aspas do escalar YAML que a envolve: um comentario a
  //      fechar um caso que continuava aberto.)
  // Medido: 14 formas (7 a excluir, 7 a contar), todas certas. O `push` em cada uma das
  // formas tem de CONTAR — e o que impede a "correcao" preguicosa de ancorar em
  // `github.event_name` sozinho, que foi o erro de uma ronda anterior.
  // O primeiro `[ \t]*` vive DENTRO do lookahead de proposito: fora dele o motor recua a
  // largura zero, avalia a excecao sobre `" github…"` e ela deixa de casar — foi assim que
  // esta entrada nasceu morta, e repetiu-se ao acrescentar o wrapper das aspas.
  //
  // A excecao esta ancorada nos DOIS extremos, e o fim e tao importante como o principio: uma
  // versao que olhasse so ao prefixo excluia `== 'pull_request' && false`, que e sabotagem
  // pura escrita como se fosse o gate legitimo. Com o `$`, **qualquer** cauda colada a
  // condicao volta a contar — inclusive um composto legitimo como `&& matrix.node == 20`, e
  // esse e o comportamento pretendido: um step que deixa de correr em parte dos PRs reduz o
  // que se verifica num PR, e a excecao existe so para o caso em que nada se perde.
  // O `(["']?)…\1` faz o par das aspas do escalar YAML casar (nao aceita abrir com `"` e
  // fechar com `'`), e o `(?:#[^\n]*)?` deixa passar um comentario YAML na cauda, que nao
  // muda a condicao. Medido: 21 formas (10 a excluir, 11 a contar), todas certas.
  { re: /^[ \t]*if:[ \t]*(?![ \t]*(["']?)[ \t]*(?:\$\{\{[ \t]*)?github\.event_name[ \t]*==[ \t]*'pull_request'[ \t]*(?:\}\})?[ \t]*\1[ \t]*(?:#[^\n]*)?$)/m, msg: "condicao `if:`", cru: true },
  // Uma condicao literalmente falsa na superficie congelada e sabotagem, nao codigo: e a
  // forma canonica de desligar um veredicto sem apagar nada.
  { re: /\b(?:if|while)\s*\(\s*(?:false|0)\s*\)/, msg: "condicao literalmente falsa" },
  { re: /\b(?:it|test|describe|context)\.(?:skip|only|todo)\b/, msg: "seleccao/desativacao de teste" },
  { re: /\b(?:xit|xdescribe|xtest)\b/, msg: "teste desativado (x-prefixo)" },
  // `skipIf`/`runIf`/`failing` do vitest: o `\b` do padrao acima falha antes do `If`, logo
  // `it.skipIf(true)` passava. E `concurrent.skip` tem o modificador pelo meio.
  { re: /\b(?:it|test|describe|context)\.(?:skipIf|runIf|failing)\b/, msg: "desativacao condicional (skipIf/runIf/failing)" },
  { re: /\b(?:it|test|describe|context)\.(?:concurrent|sequential|extend)\.(?:skip|only|todo)\b/, msg: "skip/only com modificador pelo meio" },
  { re: /@pytest\.mark\.(?:skip|xfail)\b/, msg: "marca pytest de skip/xfail" },
  { re: /\.(?:skip|only)\s*\(\s*\)/, msg: "skip()/only() sem argumento" },
  { re: /\b(?:pytest\.skip|unittest\.skip)\b/, msg: "skip programatico" },
];
export { CONTAGENS, MARCAS };
