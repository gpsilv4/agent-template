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
 * Mas ele **continua na superficie congelada**, pelo glob de `.agent/scripts/lib/` do
 * `CONFIG_CONTAVEIS`. Sem ele, apagar metade das tabelas — que e desligar o detetor — nao mexia
 * em nenhuma contagem vigiada. Era esse o risco de extrair, e e esse glob que o fecha.
 *
 * Adaptar ao vocabulario do projeto no bootstrap: o que interessa e que os nomes contados sejam
 * os que o projeto **usa** para declarar um teste e uma assercao.
 *
 * **Cada entrada tem de ter um teste que a exija** (#183). Tem par em `PARES` — nao pelos avisos,
 * que continua sem ter, mas pelas ENTRADAS: a varredura desliga cada uma e reprova se nenhum teste
 * o notar. Uma entrada que o projeto acrescente leva o seu teste num `tests-surface-*.mjs` dele
 * (o `/upgrade` nunca o apaga, e a descoberta encontra-o). Escrever cada entrada na forma
 * `{ re: /.../, ... }`, com o `re` primeiro: e por ai que a varredura a encontra.
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
  // `[^\]]` exigia array NAO VAZIO — e `includes: [""]` e nao vazio. Medido: trocar cada
  // assercao por `[""]` em quatro modulos deixou **196/196 e 227/227 verdes**, com todas as
  // assercoes vacuas (`.includes("")` e sempre verdadeiro) e a contagem intacta. Era a
  // chave-mestra: com ela, qualquer outro enfraquecimento fica barato de esconder.
  // Agora exige-se **conteudo** dentro das aspas, nao so um elemento.
  // `cru: true` e obrigatorio aqui: o `conta()` aplica `semStrings()` antes do padrao, logo
  // `["x"]` chega como `[""]` e a distincao entre assercao real e vacua seria impossivel.
  // E o mesmo mecanismo que a entrada do `if:` ja usava, pela mesma razao.
  { re: /\b(?:includes|excludes)\s*:\s*\[\s*["'`][^"'`\]]/, msg: "assercoes (includes/excludes)", cru: true },
  // Mesma classe: `contem(x, "")` passa sempre. Exige-se um segundo argumento com conteudo.
  { re: /\b(?:eq|contem)\s*\([^,)]+,\s*["'`][^"'`)]/, msg: "assercoes (eq/contem)", cru: true },
  { re: /\bthrow new Error\s*\(/, msg: "assercoes (throw)" },
  // `test.each([...])` com a tabela esvaziada para `[]` mantem o `test(` e nao corre nada —
  // a mesma forma do `includes: []`. So as tabelas NAO VAZIAS contam.
  { re: /\.each\s*\(\s*\[[^\]]/, msg: "tabelas `each` nao vazias" },
  // O vocabulario do HARNESS deste repo (#359): o `registarResultado(` regista um resultado ja avaliado, e nenhuma
  // entrada acima o contava (227 chamadas) — apagar um passava calado. O registo e o contentor; as afirmacoes vivem
  // dentro dele, no idioma `c ? [] : ["msg"]` (e no inverso `c ? ["msg"] : []`), e as tabelas de casos percorridas
  // por um ciclo tem uma linha por caso (`{ nome: ... }`, ou `["rotulo", ..., { esperado }]`). Conta as tres
  // formas: no template, 227 + 370 + 86 = 683 (medido com o `semStrings`, que deixa a mensagem como `""`).
  // **Uma entrada e nao tres**, pela razao da dos passos do CI (#153): um refactor entre formas que mantem um item
  // contavel por caso (testes MOVIDOS entre ficheiros, o #382; uma divisao nas 500 linhas, o #385) nao desce.
  // Nos ultimos 12 merges e em 40 commits de cada derivado medido: 0 descidas. Uma descida NAO tem saida (como
  // todas as `CONTAGENS`: so o `verificaGate` le o trailer) — explica-se no PR. Desce sem perder nada (limites
  // assumidos): trocar a mensagem de um idioma por uma variavel (`c ? [] : [msg]`); consolidar linhas do idioma
  // num `.filter().map()`; partir uma linha de tabela por varias linhas; passar 5 registos soltos para 1 registo
  // num ciclo sobre 5 linhas (10 -> 7); passar uma verificacao para outra entrada (`registarResultado(n, c ? [] :
  // ["m"])` -> `test(..., { includes: ["m"] })`: esta desce 2, as outras sobem); renomear o helper do harness; e o
  // inverso partido por um formatador (`? [\n "m"\n] : []`: a mensagem para no `\n`, e o idioma direito nao).
  // ESCONDE (limite, de todas as `CONTAGENS`, mais barato aqui por serem tres formas): apagar um caso e acrescentar,
  // num ficheiro tocado, um item de outra forma (uma linha `{ nome: ... }` de dados) mantem o total. NAO conta: uma tabela sem objeto no fim (`["a", "b"],`), uma linha de
  // tabela partida, uma afirmacao fora do idioma, e uma condicao trocada por uma constante (`true ? [] : ["x"]`
  // mantem a contagem). Fora das pastas de testes casa em `lib/fora-do-template.mjs` (1) e `lib/saida-upgrade.mjs`
  // (4): o idioma com uma string, que tambem e codigo que nao deve desaparecer calado.
  // So `nome` na linha de objeto, e nao `name`: nas suites das apps derivadas, `{ name:` sao dados (medido).
  // Linear, com tres cuidados medidos (o teste de tempo prende-os): `[ \t]` e nao `\s` nas ancoras de linha (20 mil
  // linhas de 200 espacos: 257 s -> 62 ms); o `,{` da linha de tabela num LOOKAHEAD, e nao em sequencia (50 mil
  // `, {` numa linha: 10,9 s -> 2 ms); e a mensagem do inverso para no `?` (50 mil `?[""`: 14,9 s -> 2 ms). Os dois
  // ultimos nao mudam nenhuma contagem do repo (683 = 683, ficheiro a ficheiro).
  { re: /(?<!function\s+)\bregistarResultado\s*\(|\?\s*\[\]\s*:\s*\[\s*""|\?\s*\[\s*""[^\]\n?]*\]\s*:\s*\[\]|^[ \t]*\{[ \t]*nome[ \t]*:|^[ \t]*\[[ \t]*""(?=[^\n]*,[ \t]*\{)[^\n]*\}[ \t]*\],?[ \t]*(?:\/\/.*)?$/m, msg: "registos, assercoes e linhas de casos (registarResultado)" },
  // As CHAMADAS dos modulos de casos (#419): o #400 (b) moveu blocos de casos de duas suites para `tests/harness/casos-*.mjs`,
  // que a suite chama no sitio (`casosDaProsa(test);`). Apagar a chamada (e o import) tirava os casos sem nenhuma
  // contagem descer: a suite nao perdia nenhum `test(`, e o modulo ficava. Conta cada chamada `casosX(test)`.
  // A DEFINICAO nao conta: `function casosX(test)` pelo lookbehind (o do #359), e qualquer forma seguida de `{` (um
  // metodo `casosX(test) {`, um `function* casosX(test) {`) pelo `(?!\s*\{)` no fim. Contada, uma definicao vazia
  // acrescentada escondia uma chamada apagada, e renomear o parametro de uma dava um alarme falso. O `\b` A FRENTE: com ele o lookbehind so se tenta num
  // inicio de palavra, e `meuscasosX(test)` nao conta (o teste de tempo prende-o). Sem `cru` (de proposito, ao contrario
  // de entradas vizinhas): conta-se com as strings apagadas, logo as fixtures `'casosX(test);'` dos testes nao contam.
  // Medido: 0 ocorrencias nos dois derivados (todo o historico); no template, so as 3 chamadas do #400 (b).
  // Limites (escritos): NAO se ve um modulo `casos-*` novo sem chamada nenhuma, a chamada movida para um ficheiro que
  // nao corre (da NOTE: "movido" nao e "corre"), uma chamada mantida e tornada inutil (`return;` no topo, uma
  // closure que nunca corre), nem a chamada dentro de um comentario de bloco em varias linhas (o `semComentarios` so
  // apaga as linhas que COMECAM por `//`, `*` ou `/*`: limite de todas as `CONTAGENS`). AVISA num refactor legitimo, sem
  // saida por trailer: renomear sem o prefixo `casos`, um alias (`casosDaProsa(t)`), um import de namespace
  // (`casos.prosa(test)`), um argumento a mais (`casosDaProsa(test, opcoes)`) e um espaco antes do `(` — explica-se no PR.
  { re: /\b(?<!function\s+)casos[A-Z]\w*\(\s*test\s*\)(?!\s*\{)/, msg: "chamadas de modulos de casos (casos*(test))" },
  // A2: a "configuracao do runner" deste repo conta-se assim.
  // O `-?` e o `\b` nao sao cosmetica: a primeira versao exigia `run:` depois de so espacos
  // e `alvo:` no inicio da linha, logo media a forma que eu por acaso tinha escrito e nao a
  // forma YAML/JS equivalente (`- run:` inline, `{ alvo: ... }` na mesma linha). Um teste com
  // a outra forma apanhou-o.
  // `\S*test` so casava os steps que TESTAM os guards; os que os APLICAM
  // (`check-doc-versions`, `check-backlog`) podiam ser apagados do `ci.yml` sem a superficie
  // reagir — medido. Um guard aplicado e superficie tanto como um teste.
  //
  // DUAS FORMAS, UMA ENTRADA (#153). A primeira alternativa e a de cima: o `node` na mesma
  // linha do `run:`. A segunda e o BLOCO (`run: |` / `run: >`) com o `node` numa linha do
  // corpo — sem ela, **apagar o step da varredura de mutacao, o gate mais caro do CI, passava
  // verde**, tal como o do `commit-msg` (medido sobre o `ci.yml` real: 21 -> 21).
  // **Uma entrada e nao duas**, porque o `totalDesceu` e por `msg`: com duas, passar um step de
  // `run: node x` para `run: |` (para lhe acrescentar `set -euo pipefail`, a evolucao por que
  // os dois steps em causa passaram) dava 21 -> 20 numa e 2 -> 3 na outra, e reprovava um
  // refactor legitimo. Achado do leitor independente; ha um teste que o prende.
  // O bloco conta UMA vez por step: o match vai do `run:` a PRIMEIRA invocacao de um verificador no
  // corpo e para ai (o prefixo `[^#\n"']*?` e preguicoso, #383: guloso, comia as suites anteriores
  // da mesma linha); as outras suites da linha do runner contam pela 4.a alternativa.
  // EXCEPTO as LINHAS DE CONTINUACAO (#337): a seguir a uma linha que acaba em `\`, uma linha que comeca
  // por `node <verificador>` e mais uma suite do mesmo comando — a forma do `suites-em-paralelo.mjs`, que
  // corre as 17 num passo. Sem esta 3.a alternativa o bloco contava 1, a contagem descia 17 -> 1, e apagar
  // uma suite da lista deixava de fazer descer nada: a defesa sem saida passava a ter saida. Cada suite conta
  // 1, como quando era um passo. So conta se a cadeia de `\` NASCE numa linha que e o proprio
  // `node ...suites-em-paralelo.mjs --` (2.a leitura): trocar o `node` dela por `echo`, ou apaga-la, deixava
  // as suites por correr e a contagem igual. O lookbehind so anda pelas linhas da cadeia (17), sem ambiguidade.
  // A linha do runner pode ja trazer suites antes do `\` (a forma mista, #383): a primeira conta pelo bloco
  // (quando e o primeiro verificador dele), as outras pela 4.a.
  // A 4.a (#383): as suites na MESMA linha do runner, `exec node <runner> -- node <a> node <b>` (num `run:` de
  // uma linha, entre aspas, ou no corpo de um bloco). Fica FORA do `^(?:...)`, porque o match comeca a meio da
  // linha. Tres cuidados medidos, por o lookbehind correr onde o motor tenta a alternativa: a ancora `(?<=\S)`
  // (sem ela o `[ \t]+` era tentado em cada espaco da indentacao: o teste das 2000 colunas, 7,7 s -> 6 ms); o
  // lookahead da suite ANTES do lookbehind (uma linha de `node x` sem verificador fica linear); e o TETO
  // `{0,50}` (sem ele, 30 mil suites numa linha = 50 s). LIMITE do teto: numa linha com mais de 51 suites as
  // seguintes nao contam; a cadeia da 3.a nao tem teto (so corre no inicio de cada linha), logo na forma mista
  // contam as das linhas seguintes. Um token colado a `;`/`&`/`|` fecha a cadeia (o que vem depois nao e
  // argumento do runner). NAO conta (limitacoes assumidas): `echo x; exec node <runner> -- ...` (o runner a meio
  // da linha: na forma de uma linha nao conta; num bloco conta so a primeira suite, pelo bloco) e uma suite
  // depois de `&&` sem `exec` (o bash corre-a; com `exec`, nunca corre). CONTA A MAIS (limitacao assumida, como
  // a 3.a): a linha do runner fora de um `run:` (num bloco de `env:`, num `name: |`) — a regex nao le o YAML;
  // passar o passo para la nao faz descer. E um efeito no gate: um workflow cuja UNICA coisa contavel e a forma de
  // uma linha passa a ser contavel, e entra no gate (`superficie-gate.mjs`: mudar essa linha pede o trailer).
  //   `\1[ \t]+` — so linhas MAIS indentadas que o `run:` sao corpo (o `\1` captura a
  //                indentacao dele), logo o match nao atravessa para o step seguinte;
  //   `[^#\n"']*?` — o que vem antes do `node` nao pode ter um `#` (nem uma aspa, #295; e preguicoso,
  //                #383): o `semComentarios` so tira
  //                comentarios JS, nao os do YAML, e um `# node x-test.mjs` (linha inteira
  //                ou no fim de outra) nao pode contar como step;
  //   `\.githooks\/` — o `commit-msg` e um verificador que nao se chama `check-*`;
  //   `[-+0-9]*` e `(?:#.*)?` no cabecalho — `|-`, `|2` e um comentario depois do `|` sao
  //                YAML valido; `\r?\n` — um checkout CRLF lia 2 -> 0 contra a baseline LF (e o
  //                `.` do JS nao casa `\r`, logo o corpo tambem precisa dele);
  //   `^[ \t]*(?:-[ \t]*)?run:` na forma de uma linha — era `^\s*-?\s*run:`, e os dois `\s*`
  //                seguidos disputavam a indentacao em cada inicio de linha (quadratico,
  //                medido no teste de 2000 espacos). Para contar e equivalente: um `-` sozinho
  //                numa linha deixa o `run:` da seguinte casar por si.
  // **Cada parte e DISJUNTA, de proposito.** A primeira versao (`([ \t]*)-?[ \t]*run:` e um
  // corpo `\1[ \t]+.*\n|[ \t]*\n`) deixava o `\1` ficar com qualquer prefixo da indentacao e
  // uma linha so de espacos casar as duas alternativas — backtracking exponencial, medido:
  // > 120 s sobre o `ci.yml` real. Aqui o `\1` e forcado a indentacao inteira (o caracter a
  // seguir tem de ser `-` ou `r`), a linha de corpo exige um `\S` (um `(?![ \t])` deixava
  // passar o `\n`: 20 linhas so de espacos = 114 ms), a linha em branco e a outra alternativa,
  // e o `(?![ \t])` da linha final impede o `[ \t]+` e o `[^#\n]*` de disputarem a
  // indentacao (quadratico: 2000 espacos de indentacao = 9 s). Ha testes de tempo que o prendem.
  // Conta-se sobre o texto CRU (#295), mas nunca depois de uma aspa: `echo "skip node x-test.mjs"` no
  // lugar do passo nao conta (fazia a contagem nao descer). NAO conta (limitacao assumida): `node --flag x`. A forma de uma linha tem a mesma cegueira.
  {
    re: /^(?:[ \t]*(?:-[ \t]*)?run:\s*["']?node\s+\S*(?:test|check|sweep|simulate)|([ \t]*)(?:-[ \t]+)?run:[ \t]*[|>][-+0-9]*[ \t]*(?:#.*)?\r?\n(?:\1[ \t]+\S.*\r?\n|[ \t]*\r?\n)*?\1[ \t]+(?![ \t])(?:[^#\n"']*?[\s;&|(])?node[ \t]+\S*(?:test|check|sweep|simulate|\.githooks\/)|(?<=^[ \t]*(?:exec[ \t]+)?node[ \t]+(?:\.\/)?\.agent\/scripts\/lib\/suites-em-paralelo\.mjs(?:[ \t]+--max=\d+)?[ \t]+--(?:[ \t]+node[ \t]+[^\s;&|]+)*[ \t]*\\[ \t]*\r?\n(?:[ \t]+node[ \t]+\S+[ \t]*\\[ \t]*\r?\n)*)[ \t]+(?![ \t])node[ \t]+\S*(?:test|check|sweep|simulate|\.githooks\/))|(?<=\S)[ \t]+(?=node[ \t]+\S*(?:test|check|sweep|simulate|\.githooks\/))(?<=^[ \t]*(?:-[ \t]*)?(?:run:[ \t]*["']?)?(?:exec[ \t]+)?node[ \t]+(?:\.\/)?\.agent\/scripts\/lib\/suites-em-paralelo\.mjs(?:[ \t]+--max=\d+)?[ \t]+--(?:[ \t]+node[ \t]+[^\s;&|]+){0,50}[ \t]+)node[ \t]+\S*(?:test|check|sweep|simulate|\.githooks\/)/m,
    msg: "steps de verificacao no CI",
    // CRU (#295): com as strings tiradas, `run: 'node .../test-x.mjs'` ficava `run: ''` e passar um
    // passo a aspas fazia a contagem descer (alarme falso) — e voltar a tira-las escondia a descida.
    cru: true,
  },
  { re: /\balvo:\s*"/, msg: "pares alvo/suite da varredura" },
  // Os SCRIPTS de teste do `package.json` (#296): os NOMES que o BOOTSTRAP fixa e o CI chama, com o
  // runner como COMANDO (no inicio, ou depois de `&&`; `echo vitest` e `exit 0; vitest` nao correm testes)
  // (`test`, `test:unit`, `test:e2e`, `test:security`, `test:all` — o `ci.yml` faz `if scripts?.['test:unit']
  // ... else skipping`), e so com um RUNNER no valor. Apagar, renomear (`test:units`) ou trocar o
  // valor por `true`/`echo ok` faz descer; um `test:watch` (o CI nao o corre), deps e versao nao contam
  // — o ruido que tirou o `pyproject.toml` dos GLOBS. CRU: num `package.json` tudo e string.
  { re: /^[ \t]*"(?:test|test:(?:unit|e2e|security|all))"[ \t]*:[ \t]*"(?:(?:[^"\\\n]|\\.)*?&&)?[ \t]*(?:(?:cross-env|env)[ \t]+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S*[ \t]+)*(?:vitest|jest|mocha|ava|jasmine|tap|uvu|wdio|testcafe|karma[ \t]+start|playwright[ \t]+test|cypress[ \t]+run|node[ \t]+--test|tsx[ \t]+--test|(?:bun|deno|ng|react-scripts|craco)[ \t]+test|vue-cli-service[ \t]+test|pytest|run-[sp]|npm-run-all|concurrently|lerna[ \t]+run[ \t]+test|turbo[ \t]+(?:run[ \t]+)?test|nx[ \t]+(?:test|(?:run-many|affected)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.:\/-]+)?)*?[ \t]+--?t(?:arget)?[ \t]+test)|(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:run[ \t]+)?(?:t|test))\b/m, msg: "scripts de teste do package.json (os que o CI corre, com um runner)", cru: true },
  // A selecao de testes dentro de um `pyproject.toml`/`setup.cfg`, que trazem muito mais que
  // isso: estreitar o `testpaths` ou o `addopts` conta; mudar a versao ou as deps, nao.
  { re: /^\s*(?:testpaths|addopts|python_files|python_classes|python_functions)\s*=/m, msg: "selecao de testes do pytest" },
  // A forma mais eficaz de enfraquecer TODAS as suites de uma vez nao move nenhuma das
  // contagens acima: trocar `if (failures.length) {` por `if (false) {` no harness desliga o
  // veredicto e todas as suites passam a sair 0 para sempre. Medido: o gate dizia "sem marcas
  // de enfraquecimento" e saia 0. E o invariante 1 do `TP4` ("o veredicto assenta no exit code
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
  // variante do `TP1` que este repo documenta.
  { re: /\b(?:warn|fatal)\s*\(/, msg: "sitios de aviso" },
  // A mesma ideia do lado dos HOOKS: o que eles tem nao e um `warn(`, e uma decisao de
  // negacao. Reduzir o numero de negacoes no `guard-protected-branch.mjs` enfraquece a rede
  // sem que nenhum teste tenha de ser tocado. `cru` porque a chave e um literal e o
  // `semStrings` apagava-a.
  { re: /permissionDecision\s*:\s*["']deny["']/, msg: "decisoes de negacao dos hooks", cru: true },
  // O invariante 2 do `TP4` ("estreitar a seleccao do runner") na forma que ESTE repo tem.
  // Os entry points chamavam cada modulo `tests-*.mjs` a mao; comentar uma dessas linhas
  // levava `test-hooks.mjs` de 156 para 39 testes com exit 0 e "todos passaram" — medido
  // numa auditoria. A seleccao passou a ser DESCOBERTA em disco (`lib/registo.mjs`), o que
  // tira as cinco linhas comentaveis mas deixa uma: a propria chamada a descoberta.
  // `zero: true` fecha-a — o invariante nao e "o numero nao desce" (tres entry points
  // podiam legitimamente virar dois), e **"tem de existir descoberta em algum sitio"**.
  { re: /\bregistaDescobertos\s*\(/, msg: "registo de suites por descoberta", zero: true },
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
  // marca de `skip` aparece. Medido: `|| true` num step do `ci.yml` passava com exit 0.
  // A marca LARGA: qualquer comando numa linha `run:` (o runner de qualquer stack: `make test`).
  { re: /run:[^\n]*\|\|\s*(?:true|:|exit\s+0)(?=[\s;)&|"'}]|$)/, msg: "step de teste neutralizado com `|| true`" },
  // Qualquer valor que nao seja `false` (`"false"`, `${{ false }}`) desliga a falha, ou pode
  // desliga-la: `true`, `True`, `${{ !false }}`, `${{ matrix.x }}` (#281). O idioma da matriz e
  // legitimo e raro: um novo pede confirmacao. Le o texto CRU (`"false"` nao pode virar `""`), e por
  // isso so nos workflows: as fixtures dos testes escrevem `continue-on-error` dentro de strings.
  { re: /^\s*continue-on-error:\s*(?!["']?false["']?\s*(?:#|$)|["']?\$\{\{\s*false\s*\}\}["']?\s*(?:#|$))\S/im, msg: "`continue-on-error: true`", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  // As marcas seguintes sao SO dos workflows (`so`, #281): em JavaScript `x || true` e `a | b` sao
  // codigo normal, e um `.yml` de fixture nao corre nada. Leem o texto CRU e saltam as linhas de
  // comentario. As duas primeiras so contam nas linhas que CORREM uma verificacao — as suites deste
  // repo (`node ...test`, `node .githooks/...`, com `test`/`check` como palavra: nao `latest`) e os
  // runners de um derivado (`npm test`/`t`, `npm run test|lint|build|typecheck` — nao `lint:fix` —,
  // `pnpm -r test`, `pnpm exec vitest`, `npx [--yes] tsc|vitest|jest|playwright test`, `pytest` — nao
  // `pip install pytest`): um `grep ... || true` noutro comando e shell normal (o `ci.yml` deste repo
  // tem um), e reprova-lo era o falso alarme que ensina a ignorar o gate. As flags do grupo sem ambiguidade
  // (`--?\w`, e o argumento nao e outra flag): `-{1,2}[\w-]+` dava backtracking exponencial (#295). O grupo repete-se nas
  // duas entradas DE PROPOSITO: a varredura de mutacao so ve entradas `{ re: /.../ }` literais.
  //  - a falha engolida (tambem no corpo de um `run: |`): QUALQUER `||` depois do runner, no mesmo
  //    comando (o segmento acaba num `;` ou num comentario; um `||` dentro de `${{ ... }}` e uma
  //    expressao do GitHub, nao shell), menos os ramos que mantem a falha: `exit` com codigo != 0 ou
  //    com uma variavel (`exit $rc`, `exit $?`), `exit` sozinho, `var=$?`, `false`, ou um grupo
  //    `{ ...; exit 1; }`/`( ... && false)`. So o RAMO: um `exit 1` noutro `||` da linha, ou num
  //    comentario, nao desculpa um `|| true`; e num grupo o `$?` e o do comando anterior (`echo`).
  { re: /^(?![ \t]*#)[^\n]*(?:\bnode[ \t]+\S*?(?<![a-zA-Z])(?:tests?|checks?|sweep|simulate)(?![a-z])[^\s;|&]*|\bnode[ \t]+\S*\.githooks\/[^\s;|&]*|\b(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:t\b|test\b|run(?:-script)?[ \t]+(?:test|lint(?!:fix)|build|typecheck)[^\s;|&]*|exec[ \t]+(?:vitest|jest)\b|vitest\b|jest\b)|\bnpx(?:[ \t]+-\S+)*[ \t]+(?:tsc|vitest|jest|playwright[ \t]+test)(?![\w-])|(?<!install[ \t]{1,20})\bpytest\b)(?:[^;#\n]|(?<=\S)#)*?(?<!\$\{\{[^}\n]*)\|\|[ \t]*(?!exit[ \t]+["']?(?:[1-9]|\$))(?!exit[ \t]*(?:$|[;)&|}]))(?!\w+=\$\?)(?!false\b)(?![{(][^})\n]*\b(?:exit[ \t]+["']?[1-9]|false\b))\S/m, msg: "falha engolida (`|| true`, `|| :`, `|| echo`, ...)", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  //  - a saida canalizada (`|`, e `|&`, cujo `&` ja casa o `\S`) no mesmo comando (o `|` entre aspas,
  //    `grep -E 'a|b'`, nao conta): a shell por omissao do GitHub Actions e `bash -e {0}`, sem
  //    `pipefail`, logo o exit e o do ultimo comando. Com `shell: bash` ou `set -o pipefail` (o `ci.yml`
  //    deste repo usa-o) a falha NAO se perde — dai o aviso pedir confirmacao (e reprova na mesma).
  { re: /^(?![ \t]*#)[^\n]*(?:\bnode[ \t]+\S*?(?<![a-zA-Z])(?:tests?|checks?|sweep|simulate)(?![a-z])[^\s;|&]*|\bnode[ \t]+\S*\.githooks\/[^\s;|&]*|\b(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:t\b|test\b|run(?:-script)?[ \t]+(?:test|lint(?!:fix)|build|typecheck)[^\s;|&]*|exec[ \t]+(?:vitest|jest)\b|vitest\b|jest\b)|\bnpx(?:[ \t]+-\S+)*[ \t]+(?:tsc|vitest|jest|playwright[ \t]+test)(?![\w-])|(?<!install[ \t]{1,20})\bpytest\b)(?:[^|;#\n'"]|'[^'\n]*'|"[^"\n]*"|\|\||(?<=\S)#)*\|(?!\|)[ \t]*\S/m, msg: "saida de um step canalizada (`| tee`, `| cat`, ...): sem `pipefail` esconde a falha — confirmar", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  //  - `set +e` (ou `+o errexit`) desliga o `-e` da shell no resto do bloco: um runner que falhe ja nao
  //    para o passo. Nao exige runner na linha.
  { re: /^(?![ \t]*#)[^\n]*\bset[ \t]+(?:\+[a-zA-Z]*e|\+o[ \t]+errexit\b)/m, msg: "`set +e` (o passo deixa de parar numa falha)", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  // As formas de LINHA do #295 (parte 2 do #285). Le o texto JA normalizado pelo `paraMarcas` (as
  // continuacoes `\` juntas dentro de um `run:`, e os `run: >`/simples dobrados numa linha, cortada
  // no primeiro `#`), logo veem o comando como o runner o executa. O grupo de runners e o das duas
  // entradas acima, copiado de proposito (a varredura so ve entradas literais), com as flags sem
  // ambiguidade (`--?\w`, e o argumento de uma flag nao pode ser outra): `-{1,2}[\w-]+` lia `--a` de
  // duas formas, e 40 flags sem runner no fim davam backtracking exponencial (segunda leitura).
  //  - argumentos que ESTREITAM a selecao de testes, no mesmo comando que o runner: correm-se menos
  //    testes sem tocar em nenhum (`TP4`). Sem o `tsc`, cujo `-t` e o `--target`; um `-t`/`-k` noutro
  //    comando (`tar -t`) nao conta. LIMITES: um caminho posicional (`vitest run src/um`) nao se ve, e
  //    o `--project` fica de fora de proposito — `--project=${{ inputs.project || 'chromium' }}` e
  //    idioma corrente do Playwright, e avisar nele era o alarme falso mais provavel num derivado.
  { re: /^(?![ \t]*#)[^\n]*(?:\bnode[ \t]+\S*?(?<![a-zA-Z])(?:tests?|checks?|sweep|simulate)(?![a-z])[^\s;|&]*|\bnode[ \t]+\S*\.githooks\/[^\s;|&]*|\b(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:t\b|test\b|run(?:-script)?[ \t]+(?:test|lint(?!:fix)|build|typecheck)[^\s;|&]*|exec[ \t]+(?:vitest|jest)\b|vitest\b|jest\b)|\bnpx(?:[ \t]+-\S+)*[ \t]+(?:vitest|jest|playwright[ \t]+test)(?![\w-])|(?<!install[ \t]{1,20})\bpytest\b)[^\n;|&]*?[ \t](?:--passWithNoTests|--testNamePattern|--testPathPattern\w*|--grep[\w-]*|--lf|--last-failed|--onlyChanged|--only-changed|--changed\w*|--findRelatedTests|-[tkgm])(?=[\s=]|$)/m, msg: "runner com a selecao de testes estreitada na linha de comando — confirmar", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  //  - uma `shell:` com `{0}` que nao para numa falha: uma shell (`bash`, `sh`, `zsh`, ...) SEM o `-e`
  //    (o default do GitHub e `bash -e {0}`), ou um programa que nao e shell nem interprete (`true -e
  //    {0}` desliga o passo inteiro). `pwsh`, `powershell`, `cmd`, `python` e `node` tem a semantica
  //    deles e nao contam; `shell: bash` (sem `{0}`) tambem nao. O `(?![ \t])` depois do `[ \t]*`
  //    impede o recuo que testava as exclusoes sobre `" pwsh"` (com o espaco) e as deixava passar; a aspa
  //    vive DENTRO de cada exclusao pela mesma razao (`shell: "bash -e {0}"`). O caminho (`/bin/bash`),
  //    o `env` e o `-o errexit` sao outras formas do mesmo `-e`.
  { re: /^(?![ \t]*#)[ \t]*shell:[ \t]*(?![ \t])(?!["']?(?:\S*\/)?(?:env[ \t]+)?(?:ba|z|k|da)?sh\b[^\n#]*(?:[ \t]-[a-zA-Z]*e|[ \t]-o[ \t]+errexit\b))(?!["']?(?:\S*\/)?(?:pwsh|powershell|cmd|python3?|node)\b)[^\n#]*\{0\}/m, msg: "`shell:` que nao para numa falha (sem o `-e`, ou nao e uma shell) — confirmar", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  //  - o comando de teste usado como CONDICAO: `if npm test`, `if ! npm test`, `while`/`until`, `! npm
  //    test` (tambem depois de uma aspa: `run: '! npm test'`) — o `-e` nao para numa falha dentro de uma
  //    condicao. O `!` so no inicio de um comando (`[ ! -f x ]` e `echo "Pronto! ..."` nao contam).
  { re: /^(?![ \t]*#)[^\n]*(?:\b(?:if|while|until)[ \t]+(?:![ \t]+)?|(?:^|[;&|("'])[ \t]*![ \t]+)(?:\bnode[ \t]+\S*?(?<![a-zA-Z])(?:tests?|checks?|sweep|simulate)(?![a-z])[^\s;|&]*|\bnode[ \t]+\S*\.githooks\/[^\s;|&]*|\b(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:t\b|test\b|run(?:-script)?[ \t]+(?:test|lint(?!:fix)|build|typecheck)[^\s;|&]*|exec[ \t]+(?:vitest|jest)\b|vitest\b|jest\b)|\bnpx(?:[ \t]+-\S+)*[ \t]+(?:tsc|vitest|jest|playwright[ \t]+test)(?![\w-])|(?<!install[ \t]{1,20})\bpytest\b)/m, msg: "comando de teste usado como condicao (`if`/`while`/`until`/`!`): a falha nao para o passo — confirmar", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  //  - ...ou a meio de um `&&` com MAIS comandos depois no mesmo bloco (a proxima linha com a mesma
  //    indentacao, saltando brancas e comentarios, que nao seja uma chave YAML — e o que exclui o `run:`
  //    de uma linha, cujo vizinho e sempre uma chave do passo): o `-e` nao para a meio
  //    de um `&&`. Num `run:` de UMA linha, ou na ultima linha do bloco, a falha e o exit do passo e
  //    nao conta — a segunda leitura mediu o alarme falso em `run: npm ci && npm test && npm run build`.
  //    LIMITE: um heredoc (`npm test && cat <<EOF` + `chave: valor`) le-se como chave YAML e nao conta.
  //    O `\r` fica fora das classes `[^...]`: aceita-lo deixava cada `\r\n#` ler-se de duas formas, e o
  //    CodeQL apanhou o backtracking exponencial no PR #298 (`js/redos`).
  { re: /^([ \t]*)(?![ \t#])[^\n]*(?:\bnode[ \t]+\S*?(?<![a-zA-Z])(?:tests?|checks?|sweep|simulate)(?![a-z])[^\s;|&]*|\bnode[ \t]+\S*\.githooks\/[^\s;|&]*|\b(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:t\b|test\b|run(?:-script)?[ \t]+(?:test|lint(?!:fix)|build|typecheck)[^\s;|&]*|exec[ \t]+(?:vitest|jest)\b|vitest\b|jest\b)|\bnpx(?:[ \t]+-\S+)*[ \t]+(?:tsc|vitest|jest|playwright[ \t]+test)(?![\w-])|(?<!install[ \t]{1,20})\bpytest\b)[^\r\n;|#]*&&[^\r\n]*(?:\r?\n[ \t]*(?:#[^\r\n]*)?)*?\r?\n\1(?![ \t#])(?![\w-]+[ \t]*:(?:[ \t]|$))\S/m, msg: "comando de teste usado como condicao de um `&&` com mais comandos depois: a falha nao para o passo — confirmar", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  //  - um comando de teste num PASSO ou JOB com `continue-on-error` nao-falso (#296): o
  //    `paraMarcas` poe `@@coe@@;` a frente dos comandos desse bloco. A marca `continue-on-error: true`
  //    conta por ficheiro, logo MOVER a chave do passo `Audit` para o de teste deixava a contagem
  //    igual — esta conta onde ela esta. So o `@@coe@@` (sempre tolerado): o `@@coe?@@` (condicional)
  //    nao conta, mas passa-lo a `true` sobe. O `npm run test:audit` fica fora (informativo de proposito).
  { re: /^(?![ \t]*#)[^\n]*@@coe@@;[^\n]*(?:\bnode[ \t]+\S*?(?<![a-zA-Z])(?:tests?|checks?|sweep|simulate)(?![a-z])[^\s;|&]*|\bnode[ \t]+\S*\.githooks\/[^\s;|&]*|\b(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:t\b|test\b|run(?:-script)?[ \t]+(?:test(?!:audit\b)|lint(?!:fix)|build|typecheck)[^\s;|&]*|exec[ \t]+(?:vitest|jest)\b|vitest\b|jest\b)|\bnpx(?:[ \t]+-\S+)*[ \t]+(?:tsc|vitest|jest|playwright[ \t]+test)(?![\w-])|(?<!install[ \t]{1,20})\bpytest\b)/m, msg: "comando de teste num passo ou job com `continue-on-error`: a falha nao reprova — confirmar", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
  // Os scripts de TESTE do `package.json` (#296), os mesmos nomes: o valor neutralizado (`|| :` incluido, e
  // as aspas escapadas `\"` atravessam-se), ou um argumento que estreita a selecao DEPOIS do runner (um
  // `-t` de outra ferramenta, `wait-on -t 60000 ... && playwright test`, nao conta).
  { re: /^[ \t]*"(?:test|test:(?:unit|e2e|security|all))"[ \t]*:[ \t]*"(?:[^"\\\n]|\\.)*(?:\|\|[ \t]*(?:(?:true|exit[ \t]+0|echo)\b|:)|;[ \t]*(?:(?:true|exit[ \t]+0|echo)\b|:))/m, msg: "script de teste do package.json neutralizado (`|| true`, `; true`, ...)", cru: true, so: /(^|\/)package\.json$/i },
  { re: /^[ \t]*"(?:test|test:(?:unit|e2e|security|all))"[ \t]*:[ \t]*"(?:(?:[^"\\\n]|\\.)*?&&)?[ \t]*(?:(?:cross-env|env)[ \t]+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S*[ \t]+)*(?:vitest|jest|mocha|ava|jasmine|tap|uvu|wdio|testcafe|karma[ \t]+start|playwright[ \t]+test|cypress[ \t]+run|node[ \t]+--test|tsx[ \t]+--test|(?:bun|deno|ng|react-scripts|craco)[ \t]+test|vue-cli-service[ \t]+test|pytest|run-[sp]|npm-run-all|concurrently|lerna[ \t]+run[ \t]+test|turbo[ \t]+(?:run[ \t]+)?test|nx[ \t]+(?:test|(?:run-many|affected)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.:\/-]+)?)*?[ \t]+--?t(?:arget)?[ \t]+test)|(?:npm|pnpm|yarn)(?:[ \t]+--?\w[\w-]*(?:[ \t]+(?!-)[\w@.\/-]+)?)*[ \t]+(?:run[ \t]+)?(?:t|test))\b(?:[^"\\\n&;|]|\\.)*?[ \t](?:--passWithNoTests|--testNamePattern|--testPathPattern\w*|--grep[\w-]*|--lf|--last-failed|--onlyChanged|--only-changed|--changed\w*|--findRelatedTests|-[tkgm])(?=[\s="\\]|$)/m, msg: "script de teste do package.json com a selecao estreitada — confirmar", cru: true, so: /(^|\/)package\.json$/i },
  //  - um passo em flow mapping com `if:`/`continue-on-error:`/`shell:` (`- {name: t, if: false, run: ...}`, a
  //    chave tambem entre aspas): nao abre a linha e escapa as marcas dessas chaves. Nao exige runner. So
  //    com a chave E um `run:`/`uses:` no mesmo `{}`: uma entrada de matriz (`- { os: x, shell: msys2 }`)
  //    e idioma corrente e nao conta.
  //    (O `-` do item ja chega aqui como espaco: o `paraMarcas` troca-o.)
  { re: /^[ \t]*\{(?=[^\n]*\b(?:run|uses)["']?[ \t]*:)[^\n]*["']?\b(?:if|continue-on-error|shell)["']?[ \t]*:/m, msg: "passo em flow mapping com `if:`/`continue-on-error:`/`shell:` — confirmar", cru: true, so: /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i },
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
  // O `(["']?)…\2` faz o par das aspas do escalar YAML casar (nao aceita abrir com `"` e
  // fechar com `'`), e o `(?:#[^\n]*)?` deixa passar um comentario YAML na cauda, que nao
  // muda a condicao. Medido: 21 formas (10 a excluir, 11 a contar), todas certas — antes da
  // continuacao, cujos casos tem testes proprios em `tests-surface-marks.mjs`.
  //
  // E a CONTINUACAO (#277): o `$` so ancora a primeira linha, e o YAML junta ao escalar uma linha
  // seguinte mais indentada (`if: github.event_name == 'pull_request'` + `\n    && false`). A
  // excecao recusa-a: depois do `$`, nenhuma linha seguinte (saltando as em branco) mais indentada
  // que a chave (`\1`, a indentacao capturada) que nao seja comentario.
  //
  // O `if: always()` de um job AGREGADOR (#308) nao conta, mas a excecao NAO vive aqui: este regex
  // nao sabe de que job e a linha, e num `deploy` a jusante dos testes o `always()` e enfraquecimento.
  // Vive no `paraMarcas` (`lib/marcas-yaml.mjs`, `agregadoresSempre`), que so o neutraliza num job que
  // le `needs.<X>.result`.
  { re: /^([ \t]*)if:[ \t]*(?![ \t]*(["']?)[ \t]*(?:\$\{\{[ \t]*)?github\.event_name[ \t]*==[ \t]*'pull_request'[ \t]*(?:\}\})?[ \t]*\2[ \t]*(?:#[^\n]*)?$(?!(?:\r?\n[ \t]*)*\r?\n\1[ \t]+[^\s#]))/m, msg: "condicao `if:`", cru: true },
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
