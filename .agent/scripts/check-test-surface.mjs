#!/usr/bin/env node
/**
 * Test Surface Checker — {{PROJECT_NAME}}
 *
 * Responde a UMA pergunta: entre a baseline e agora, a **superficie de teste** foi
 * enfraquecida?
 *
 * PORQUE EXISTE: um ciclo de correcao com o objetivo "ficar verde" tem uma solucao
 * degenerada — enfraquecer o teste em vez de corrigir o codigo (ver `AP4` em
 * `anti-patterns.md`). Apagar a assercao, marcar `skip`, ou **estreitar a selecao do runner**,
 * que remove falhas igualmente bem sem tocar em nenhum ficheiro de teste.
 *
 * O QUE ISTO E E O QUE NAO E: e uma verificacao **universal** — so precisa de `node` e `git`,
 * logo qualquer agente a corre e o CI corre-a para todos. No Claude Code existe tambem um
 * passo a correr — **nao** existe hook a negar a escrita de testes;
 * noutras ferramentas isto e o equivalente que se corre.
 *
 * Uso:
 *   node .agent/scripts/check-test-surface.mjs                 # vs a base do branch
 *   node .agent/scripts/check-test-surface.mjs <ref>           # vs um ref explicito
 *
 * Sai `!= 0` se encontrar enfraquecimento, e tambem se **nao conseguir medir** — um
 * verificador que nao sabe responder nao pode responder "esta tudo bem".
 */

import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- CONFIGURAR AO PROJETO ---------------------------------------------------
// A superficie congelada: onde vivem os testes E a configuracao que os seleciona.
// Congelar so os testes nao basta: estreitar o `include` do runner remove falhas
// igualmente bem. Adaptar no bootstrap a stack do projeto.
const TEST_GLOBS = [
  /(^|\/)(tests?|__tests__|spec|e2e)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /_test\.py$/i,
  /(^|\/)test_[^/]+\.py$/i,
  // `test-guards.mjs`, `tests-settings.mjs`, `test_algo.js`: nem o sufixo `.test.js` nem a
  // pasta `tests/` cobrem quem nomeia a suite pelo **prefixo**, que e como quase todas as
  // deste repo se chamam. Apagar TODAS dava "superficie intacta" com exit 0 — um gate a
  // afirmar que estava bem. E o `AP2` na sua forma mais cara.
  //
  // **A fracao nao se escreve aqui.** Foi escrita tres vezes e esteve errada tres vezes: "9
  // das 10" envelheceu ao dividir-se uma suite em duas; "todas menos uma" tambem estava
  // errada (duas eram visiveis, pela pasta `tests/`). Conta-se, nao se cita:
  //   git ls-files | grep -E '(^|/)tests?[-_][^/]+\.mjs$|(^|/)tests?/[^/]+\.mjs$'
  /(^|\/)tests?[-_][^/]+\.[cm]?[jt]sx?$/i,
];
// Configuracao **opaca**: mexer nela pode estreitar a selecao de testes de uma forma que
// nenhuma contagem apanha, logo qualquer alteracao pede confirmacao humana.
const CONFIG_GLOBS = [
  /(^|\/)(vitest|jest|playwright|cypress|karma)\.config\.[cm]?[jt]s$/i,
  /(^|\/)(conftest|factories)\.py$/i,
  // `pytest.ini`/`tox.ini` sao **so** configuracao de teste: qualquer alteracao merece
  // confirmacao. O `pyproject.toml` e o `setup.cfg` nao — misturam deps e versao com a
  // selecao de testes, logo passam para `CONFIG_CONTAVEIS` (um bump de versao dava exit 1
  // em qualquer projeto Python, medido).
  /(^|\/)(pytest\.ini|tox\.ini)$/i,
  /(^|\/)\.mocharc\./i,
];

// Configuracao **contavel**: o que seleciona os testes NESTE repo nao e um `vitest.config`,
// e a lista de steps do `ci.yml` e a tabela `PARES` do `mutation-sweep.mjs`. Apagar um step
// do CI desliga uma suite inteira sem tocar em nenhum ficheiro de teste (invariante 2 do
// `AP4`). Estes entram na superficie mas **nunca** dao o aviso generico de "confirmar": o que
// deles interessa mede-se por contagem.
//
// A separacao nao e cosmetica. Na primeira versao estavam em `CONFIG_GLOBS` e qualquer
// alteracao a QUALQUER workflow do `.github/` — `dependabot-auto-merge.yml`, `e2e.yml`, que
// nao correm teste nenhum — dava WARN e exit 1. Medido num projeto derivado: dois falsos
// positivos que fechavam o gate.
const CONFIG_CONTAVEIS = [
  /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
  /(^|\/)mutation-sweep\.mjs$/,
  // Os instrumentos de medida tambem: o glob de prefixo exige `test`/`tests` no INICIO do
  // nome, logo os `check-*.mjs`, os `guards/*.mjs` e o harness ficavam fora da superficie
  // congelada — e desligar um aviso deles enfraquece a verificacao sem tocar num teste.
  /(^|\/)check-[^/]+\.mjs$/,
  /(^|\/)guards\/[^/]+\.mjs$/,
  /(^|\/)test-harness\.mjs$/,
  /(^|\/)(pyproject\.toml|setup\.cfg)$/i,
];

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
  { re: /process\.exit\(\s*1\s*\)/, msg: "veredicto do runner (process.exit(1))" },
  // Contar o `process.exit(1)` NAO basta: o ataque medido nao o apaga, torna-o
  // **inalcancavel** (`if (failures.length) {` -> `if (false) {`), e a contagem nao se move.
  // O que desaparece e a **referencia a contagem de falhas** — e essa desce.
  { re: /\b(?:failures|falhas|problemas)\.length/, msg: "referencias a contagem de falhas" },
  // Os proprios verificadores estao na superficie (ver `CONFIG_CONTAVEIS`): despromover um
  // `warn(` a `note(` num guard desliga o gate sem mudar o exit code de nenhum teste — a
  // variante do `AP1` que este repo documenta.
  { re: /\b(?:warn|fatal)\s*\(/, msg: "sitios de aviso" },
];

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
  { re: /^[ \t]*if:[ \t]*(?![ \t]*github\.event_name\b)/m, msg: "condicao `if:`" },
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

function git(args) {
  // `core.quotepath=false`: sem isto o git escapa caminhos nao-ASCII
  // (`"tests/\303\251.test.js"`), o `existsSync` desse literal falha e um ficheiro que
  // ninguem apagou e reportado como APAGADO — o gate fechava por razao errada.
  // `stderr: "ignore"`: um `git show <base>:<ficheiro-novo>` falha de proposito (e assim que
  // se descobre que o ficheiro nao existia na baseline), e o `fatal: ...` do git ia para o
  // log. Uma corrida VERDE com uma linha que parece erro treina quem a le a ignorar o output
  // — apareceu no primeiro CI deste gate. Os erros que importam sobem por excecao e sao
  // reportados pelo `fatal()` daqui.
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

let problemas = 0;
const warn = (m) => {
  console.log(`  WARN  ${m}`);
  problemas++;
};
const ok = (m) => console.log(`  OK    ${m}`);
/** Nao consegui medir: avisa e sai `!= 0` na hora. Existe como FUNCAO e nao como
 *  `console.log` + `process.exit` soltos porque a varredura de mutacao procura sitios de
 *  aviso por nome: escritos a mao, tres destes ficavam fora da contagem e a varredura
 *  anunciava "cobertura completa" a medir metade dos sitios — o mesmo defeito que um
 *  wrapper `flag()` ja tinha causado neste repo. */
const fatal = (m, extra) => {
  console.log(`  WARN  ${m}`);
  if (extra) console.log(extra);
  console.log("");
  process.exit(1);
};

console.log("\n=== Test Surface Check ===\n");


// A baseline: argumento explicito, ou a base do branch atual. **Falhar se nao resolver** —
// um `git` que nao responde nao autoriza um veredicto de "nada mudou".
let base = process.argv[2];
try {
  if (!base) {
    // Detached HEAD tratado explicitamente: o `symbolic-ref` lanca, o catch de baixo
    // apanhava-o e dizia `baseline "(auto)" nao resolve`, o que atribui a culpa a coisa
    // errada. Quem esta em detached tem de passar o ref, e a mensagem tem de o dizer.
    if (git(["rev-parse", "--abbrev-ref", "HEAD"]) === "HEAD") {
      fatal(
        "HEAD esta detached, logo nao ha branch de onde derivar a baseline",
        "        passar um ref explicito: node .agent/scripts/check-test-surface.mjs <ref>"
      );
    }
    const head = git(["symbolic-ref", "--short", "HEAD"]);
    // Os remote-tracking refs entram na lista, e nao por elegancia: num projeto **derivado**
    // acabado de clonar, o branch de trabalho e `fix/...` e nao existe `main` LOCAL — so
    // `origin/main`. Sem estes candidatos o verificador nao conseguia medir e saia `!= 0` no
    // dia 1 de cada consumidor, com uma mensagem que nao dizia o que fazer. Medido a correr
    // o bootstrap: e a classe do `AP3` (verde no template, vermelho no derivado).
    const principal = ["main", "master", "develop", "origin/main", "origin/master", "origin/develop", "origin/HEAD"].find((b) => {
      try {
        git(["rev-parse", "--verify", `${b}^{commit}`]);
        return true;
      } catch {
        return false;
      }
    });
    if (!principal) {
      fatal(
        "nao encontrei um branch principal (main/master/develop, local ou em origin/) para servir de baseline",
        "        passar um ref explicito: node .agent/scripts/check-test-surface.mjs <ref>"
      );
    }
    base = head === principal ? `${principal}^` : git(["merge-base", principal, "HEAD"]);
  }
  git(["rev-parse", "--verify", `${base}^{commit}`]);
} catch (err) {
  fatal(
    `baseline "${base ?? "(auto)"}" nao resolve: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
    "        sem baseline nao ha medicao — e uma medicao ausente nao e um OK"
  );
}
console.log(`  baseline: ${base}\n`);

// A superficie tem de ter existido **na baseline**. Se os `TEST_GLOBS` nao casavam nada la —
// o estado de um projeto derivado ate alguem seguir o `BOOTSTRAP.md` §2.4 — este verificador
// imprimia `superficie de teste intacta` e saia `0`, **para sempre**, sobre uma suite apagada.
// E o `AP2` aplicado a si mesmo, e a unica mitigacao era prosa.
//
// Olha para a BASELINE e nao para o disco de proposito: apagar o unico ficheiro de teste
// deixa o disco sem superficie, mas isso e **enfraquecimento** e tem a sua propria mensagem
// (`APAGADO`). O que este bloco distingue e "os globs nunca viram nada" — ma configuracao.
// A primeira versao media o disco e roubava a mensagem ao caso do APAGADO; dois testes
// existentes apanharam-no.
{
  let naBaseline = [];
  try {
    naBaseline = git(["ls-tree", "-r", "--name-only", base]).split("\n").filter(Boolean);
  } catch (err) {
    fatal(`o git nao conseguiu listar os ficheiros da baseline: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
  const superficie = naBaseline.filter((f) => TEST_GLOBS.some((r) => r.test(f)));
  if (superficie.length === 0) {
    fatal(
      `os TEST_GLOBS nao casam nenhum ficheiro de teste em ${base} — nao ha superficie para medir`,
      "        adaptar TEST_GLOBS a stack deste projeto (ver BOOTSTRAP.md, 'Adaptar o check-test-surface.mjs')"
    );
  }
  console.log(`  superficie na baseline: ${superficie.length} ficheiro(s)\n`);
}

const eConfigOpaca = (f) => CONFIG_GLOBS.some((r) => r.test(f));
const naSuperficie = (f) =>
  TEST_GLOBS.some((r) => r.test(f)) || eConfigOpaca(f) || CONFIG_CONTAVEIS.some((r) => r.test(f));

let alterados;
try {
  // `${base}` e nao `${base}..HEAD`: compara a baseline com a **arvore de trabalho**. Com
  // `..HEAD` o verificador ignorava tudo o que nao estivesse commitado — ou seja, "correr
  // antes de commit" nao media exatamente o que estava a ser commitado. No CI as duas formas
  // coincidem (arvore limpa), logo nao ha perda.
  alterados = git(["diff", "--name-only", base]).split("\n").filter(Boolean);
  // Os NAO RASTREADOS nao aparecem no `git diff`, logo a afirmacao "compara com a arvore de
  // trabalho" so valia para caminhos rastreados: um `vitest.config.ts` novo que estreitasse a
  // selecao passava sem aviso enquanto nao fosse ao `git add`. Uniao com os untracked.
  const naoRastreados = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  alterados = [...new Set([...alterados, ...naoRastreados])];
} catch (err) {
  fatal(`o git nao conseguiu listar as alteracoes: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
}

const tocados = alterados.filter(naSuperficie);
if (tocados.length === 0) {
  ok(`superficie de teste intacta (${alterados.length} ficheiro(s) alterado(s), nenhum na superficie)`);
} else {
  for (const f of tocados) {
    const config = eConfigOpaca(f);
    // Comparar a CONTAGEM de cada marca entre a baseline e agora, e nao as linhas do diff.
    // Com `--unified=0`, EDITAR uma linha que ja tinha um `skip` aparece como linha
    // acrescentada — e dava falso positivo em qualquer alteracao a um teste ja desativado.
    // O que interessa e se a marca ficou MAIS frequente.
    // As marcas contam-se com o conteudo das STRINGS retirado. Uma marca dentro de aspas e
    // **dados**, nao uma diretiva: a suite deste proprio verificador tem `test.skip(...)`
    // dentro de fixtures, e sem isto ela sinalizava-se a si mesma — medido a correr o gate
    // num projeto derivado. Uma desativacao a serio (`it.skip(`) fica sempre FORA das aspas,
    // logo continua a contar; e `test("nome"` tambem, porque a chamada nao esta entre aspas.
    // Os escapes contam: um `\'` dentro de uma string desalinhava um emparelhamento ingenuo
    // e a marca seguinte ficava exposta. Medido na propria suite deste verificador, que tem
    // fixtures com aspas escapadas — o gate sinalizava-a a si mesmo num projeto derivado.
    // Duas correcoes de uma leitura independente:
    //   - os COMENTARIOS saem primeiro. Um apostrofo num comentario (`// don't skip`)
    //     emparelhava com o proximo da linha e apagava o que estivesse pelo meio. E comentar
    //     um teste **e** enfraquece-lo, logo tira-lo faz a contagem descer, que e o correto.
    //   - o backtick passa a ser limitado a LINHA (`[^`\\\n]`). Um backtick solitario apagava
    //     tudo ate ao proximo, atravessando linhas — e neste repo os comentarios sao densos
    //     em identificadores entre backticks.
    const semComentarios = (t) => t.replace(/^[ \t]*(?:\/\/|\*\/?|\/\*).*$/gm, "");
    const semStrings = (t) =>
      semComentarios(t).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\\n]|\\.)*`/g, '""');
    const conta = (texto, re) => {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      return (semStrings(texto).match(g) || []).length;
    };
    // EXISTIA vs conteudo: um ficheiro de teste **vazio** que e apagado tem conteudo "" na
    // baseline, e depender da truthiness dava-lhe a mensagem vaga em vez de "APAGADO".
    // M8: distinguir "nao existia na baseline" de "nao consegui ler".
    //
    // A versao anterior lia qualquer falha do `git show` como "ficheiro novo". Num clone
    // parcial (`--filter=blob:none`) ou com o objeto ausente isso corria nas duas direcoes
    // erradas ao mesmo tempo: `antes = ""` fazia com que nada pudesse **descer** (exit 0
    // sobre uma suite esvaziada) e, ao mesmo tempo, qualquer `skip` **pre-existente** contava
    // como acrescentado (falso positivo). E o `AP2`: "nao ha nada" nao e "nao consegui ler".
    let antes = "";
    let existiaAntes = true;
    // `ls-tree` e nao `cat-file -e`: o `-e` resolve o caminho **e** verifica o blob, logo
    // falhava nas duas situacoes e nao as separava. O `ls-tree` le so a arvore — responde
    // "o caminho existia na baseline?" sem depender de o conteudo estar disponivel.
    const existeNaBaseline = (() => {
      try {
        return git(["ls-tree", "--name-only", base, "--", f]).trim() !== "";
      } catch {
        return false;
      }
    })();
    if (existeNaBaseline) antes = git(["show", `${base}:${f}`]);
    else existiaAntes = false; // ausente da baseline: zero marcas antes, e correto
    // Sem `try` em volta do `show`, de proposito. Para um ficheiro chegar aqui tem de estar
    // na lista do `git diff base`, e o diff **ja leu os dois blobs** para os comparar: se o
    // blob da baseline nao existisse, o diff falhava primeiro e o `fatal` de "nao conseguiu
    // listar as alteracoes" ja teria disparado. Uma versao anterior punha aqui um `fatal`
    // proprio para o caso do clone parcial; tentei alcanca-lo com um teste e nao e
    // alcancavel. Codigo de defesa que nenhum teste pode cobrir e peso morto — e a varredura
    // de mutacao reprova-o, com razao.
    let agora = "";
    const noDisco = join(ROOT, f);
    if (existsSync(noDisco)) {
      agora = readFileSync(noDisco, "utf8");
    } else {
      // Estava na baseline e ja nao esta em HEAD: foi APAGADO. E a forma mais brutal de
      // enfraquecer, e merece nome proprio. (Um ficheiro ausente das DUAS arvores nao pode
      // aparecer no `git diff`, logo nao ha terceiro caso.)
      warn(`${f}: ficheiro da superficie de teste APAGADO desde ${base}${existiaAntes ? "" : " (e ausente da baseline — verificar a mao)"}`);
      continue;
    }
    const achadas = MARCAS.filter((m) => conta(agora, m.re) > conta(antes, m.re));
    const desceram = CONTAGENS.filter((c) => conta(agora, c.re) < conta(antes, c.re));
    const notas = [
      ...achadas.map((a) => `${a.msg} acrescentado(s)`),
      ...desceram.map((d) => `${d.msg}: ${conta(antes, d.re)} -> ${conta(agora, d.re)}`),
    ];
    // O aviso generico de configuracao e o ULTIMO recurso: se o ficheiro tem invariantes
    // contaveis (steps do CI, pares da varredura), a descida ja foi medida acima e repetir um
    // "confirmar" a cada edicao de CI treina quem o le a ignora-lo.
    const contavel = CONTAGENS.some((c) => conta(antes, c.re) > 0);
    if (notas.length) {
      warn(`${f}: ${notas.join("; ")} desde ${base}`);
    } else if (config && !contavel) {
      warn(`${f}: configuracao do runner alterada — confirmar que a selecao de testes nao ficou mais estreita`);
    } else {
      ok(`${f} alterado, sem marcas de enfraquecimento`);
    }
  }
}

console.log("");
if (problemas > 0) {
  console.log(`WARNING: ${problemas} sinal(is) de enfraquecimento da superficie de teste.`);
  console.log("         Corrigir o codigo, nao o teste. Ver AP4 em .agent/rules/anti-patterns.md\n");
} else {
  console.log("  Superficie de teste nao enfraquecida.\n");
}
process.exit(problemas > 0 ? 1 : 0);
