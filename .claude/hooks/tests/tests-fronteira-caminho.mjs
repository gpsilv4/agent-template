/**
 * INVENTARIO da fronteira, os CAMINHOS (#185): o caminho escrito de outra maneira, e o segmento que corre noutro
 * directorio — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * Vivia no `tests-fronteira-inventario.mjs`, que chegou as 498 linhas (#631): movido sem mudar uma linha, com os mesmos
 * nomes de teste (`inventario/caminho: ...`). O cabecalho de la explica o inventario; aqui ficam os casos do #185,
 * que tem o seu proprio contexto fixo (`CTX`, `DENTRO`).
 */
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-caminho.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/**
 * FECHADOS pelo #185: o caminho estava la, escrito de outra maneira, ou o segmento que escreve
 * corria noutro directorio. Nasceram em `ABERTO`. O contexto e FIXO — a raiz, o `cwd` e a home
 * do hook real vem do `contextoFronteira()`, e aqui nao dependem da maquina (`TP3`).
 */
const CTX = { raiz: "/Users/g/proj", cwd: "/Users/g/proj", prefixo: "", home: "/Users/g" };
const CP = "verbo-nao-e-leitura:cp";
const FECHADO_PELO_CAMINHO = [
  ["`../` pelo meio", "cp /tmp/x .agent/scripts/../../.claude/hooks/y.mjs", CTX, CP],
  ["barra dupla", "cp /tmp/x .claude//hooks/y.mjs", CTX, CP],
  ["`/./` pelo meio", "cp /tmp/x .claude/./hooks/y.mjs", CTX, CP],
  ["caminho absoluto", "cp /tmp/x /Users/g/proj/.claude/hooks/y.mjs", CTX, CP],
  ["til", "cp /tmp/x ~/proj/.claude/hooks/y.mjs", CTX, CP],
  ["`$PWD`", "cp /tmp/x $PWD/.claude/hooks/y.mjs", CTX, CP],
  ["`cd` noutro segmento", "cd .claude/hooks && cp /tmp/x y.mjs", CTX, CP],
  ["`cd` em subshell", "(cd .claude/hooks && cp /tmp/x y.mjs)", CTX, CP],
  ["`cwd` numa subpasta, `../` para a fronteira", "cp /tmp/x ../.claude/hooks/y.mjs", { ...CTX, cwd: "/Users/g/proj/.agent", prefixo: ".agent" }, CP],
  // Do leitor independente do #185 — o mais grave ja passava ANTES: a pasta sem a barra final.
  ["apagar a pasta inteira", "rm -rf .claude/hooks", {}, "verbo-nao-e-leitura:rm"],
  ["apagar o `.githooks`", "rm -rf .githooks", {}, "verbo-nao-e-leitura:rm"],
  // #568: era um controlo. A crase em aspas duplas EXECUTA, tambem com um caminho sozinho — o shell corre-o.
  ["crase em aspas duplas a citar um caminho", "git commit -m \"fix: o `.claude/hooks` agora nega\"", CTX, "verbo-nao-e-leitura:hooks"],
  ["mover a pasta", "mv .claude/hooks /tmp/h", {}, "verbo-nao-e-leitura:mv"],
  // O texto CITADO nao passa pela normalizacao: aqui so o regex com a pasta sem barra o apanha.
  ["apagar a pasta, citado e executado", `eval "rm -rf .claude/hooks"`, {}, "citado-mas-executado"],
  ["`cd` e apagar o `.`", "cd .claude/hooks && rm -rf .", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` e `find . -delete`", "cd .claude/hooks && find . -delete", CTX, "find-que-escreve"],
  ["`cd` acima e `git rm` da pasta", "cd .claude && git rm -r hooks", CTX, "git-que-escreve"],
  ["`cd` e `git rm` de um ficheiro", "cd .claude/hooks && git rm x.mjs", CTX, "git-que-escreve"],
  ["`cd` e `git checkout -- .`", "cd .claude/hooks && git checkout main -- .", CTX, "git-que-escreve"],
  ["`cwd` dentro da fronteira e `git rm`", "git rm x.mjs", { ...CTX, cwd: "/Users/g/proj/.claude/hooks", prefixo: ".claude/hooks" }, "git-que-escreve"],
  ["o `cwd` por symlink da raiz", "cp /tmp/x .claude//hooks/y.mjs", { raiz: "/private/tmp/p", cwd: "/tmp/p", prefixo: "", home: "/Users/g" }, CP],
  ["`$(...)` dentro da subshell nao a fecha", "(cd .claude/hooks && echo $(date) && cp /tmp/x y.mjs)", CTX, CP],
  ["uma subshell com redireccao fecha", "cd .claude/hooks && (cd /tmp && ls) >/dev/null && cp /tmp/x y.mjs", CTX, CP],
  // O `cd` atras de uma cabeca ou de `then`/`do` segue-se pelo verbo REAL (o `resto()`).
  ["`cd` dentro de um `if`", "if cd .claude/hooks; then cp /tmp/x y.mjs; fi", CTX, CP],
  ["`builtin cd`", "builtin cd .claude/hooks && cp /tmp/x y.mjs", CTX, CP],
  ["`cd` depois de `then`", "if true; then cd .claude/hooks; cp /tmp/x y.mjs; fi", CTX, CP],
  ["`$(a; b)` dentro da subshell nao a fecha", "(cd .claude/hooks && echo $(date; true) && cp /tmp/x y.mjs)", CTX, CP],
  ["redireccao sem espaco", "echo x >.claude/settings.json", {}, "redireciona"],
  // Da terceira leitura do #185. Os quatro primeiros eram REGRESSOES da versao refeita: o segmento
  // do `cd` saia inteiro do `tocam` e levava a redireccao e o `$(...)` que estavam nele.
  ["`cd` com redireccao para a fronteira", "cd /tmp > .claude/settings.json", CTX, "verbo-nao-e-leitura:cd"],
  ["`cd` com redireccao sem espaco", "cd /tmp >.claude/settings.json", CTX, "verbo-nao-e-leitura:cd"],
  ["`popd` com redireccao", "popd > .githooks/pre-commit", CTX, "verbo-nao-e-leitura:popd"],
  ["`cd` com `$(...)` que escreve", "cd /tmp $(rm .claude/settings.json)", CTX, "verbo-nao-e-leitura:cd"],
  ["`do` dentro de uma palavra nao separa", "rm -rf x-do cat .claude/hooks", CTX, "verbo-nao-e-leitura:rm"],
  ["`then` dentro de uma palavra nao separa", "rm -rf x.then cat .claude/hooks", CTX, "verbo-nao-e-leitura:rm"],
  ["redireccao nua depois de um `cd`", "cd .claude/hooks && > x.mjs", CTX, "verbo-nao-e-leitura:>"],
  // Desde o #229 a crase e julgada como um `$(...)`: o rotulo e o do verbo de la de dentro.
  ["crase que executa", "cd `rm -rf .claude/hooks`", CTX, "verbo-nao-e-leitura:cd"],
  ["crase em aspas duplas que escreve", "git commit -m \"x `rm -rf .claude/hooks`\"", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` com `2>/dev/null` e ESCREVER", "cd .claude/hooks 2>/dev/null && cp /tmp/x y.mjs", CTX, CP],
  // As sete "crase com um caminho e mais um comando" da quinta leitura vivem em
  // `tests-fronteira-descuidos.mjs` (#229): o rotulo passou a depender da forma, e o que se afirma e a negacao.
  // Da leitura final do PR: com o `cd` fora do `tocam`, o que vinha depois sem forma de caminho
  // passava (no `main`, o segmento do `cd` negava). Depois de um `cd` explicito para dentro, cada
  // segmento leva o directorio — e os seis primeiros, que estavam em `ABERTO`, fecharam com isto.
  ["nome nu sem ponto, dentro da fronteira", "cd .githooks && git rm commit-msg", CTX, "git-que-escreve"],
  ["glob dentro da fronteira", "cd .claude/hooks && rm *", CTX, "verbo-nao-e-leitura:rm"],
  ["`git clean` sem argumento, dentro", "cd .claude/hooks && git clean -fdx", CTX, "git-que-escreve"],
  ["`git stash -u` dentro", "cd .claude/hooks && git stash -u", CTX, "git-que-escreve"],
  ["nome nu num ciclo dentro", "while read f; do cd .claude/hooks; rm -rf lib; done", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` com barra e glob", "cd .claude/hooks/ && rm -rf *", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` com barra, em subshell", "(cd .claude/hooks/ && rm -rf *)", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` e redireccao para nome nu", "cd .githooks/ && echo x > pre-commit", CTX, "redireciona"],
  ["`pushd` e glob", "pushd .claude/hooks/ && rm *", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` e um `for` que apaga", "cd .claude/hooks/ && for f in *; do rm $f; done", CTX, "verbo-nao-e-leitura:rm"],
  // E o verbo julga-se em CADA segmento que toca, nao so no primeiro: uma leitura a frente desarmava
  // a escrita de tras (a parte da aridade do #206).
  ["prefixar com uma leitura desarma o verbo", "cat .claude/settings.json && cp /tmp/x .claude/hooks/y.mjs", CTX, CP],
  ["ler e apagar a pasta", "ls .claude/hooks; rm -rf .claude/hooks/", CTX, "verbo-nao-e-leitura:rm"],
  ["ler e apagar, em linhas", "cat .githooks\nrm -rf .githooks/", CTX, "verbo-nao-e-leitura:rm"],
  ["`then` como argumento e depois apagar", "grep -r then .claude/hooks; rm -rf .claude/settings.json", CTX, "verbo-nao-e-leitura:rm"],
  // Da leitura do a8cfbd4: o que corre DENTRO de `$(...)`/`<(...)` e julgado (`substituicoes`). Os
  // dois primeiros o `main` negava pelo `cd`; os outros ja passavam no `main`.
  ["`cd` e `$(...)` que apaga", "cd .claude/hooks/ && echo $(rm -rf *)", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` e `<(...)` que apaga", "cd .claude/hooks/ && cat <(rm -rf *)", CTX, "verbo-nao-e-leitura:rm"],
  ["`$(...)` que apaga a fronteira", "echo $(rm -rf .claude/hooks/)", CTX, "verbo-nao-e-leitura:rm"],
  ["ler e `$(...)` que apaga", "cat .claude/hooks/x.mjs $(rm -rf .claude/hooks/)", CTX, "verbo-nao-e-leitura:rm"],
  ["`$(...)` aninhado", "cat .claude/hooks/x $(echo $(rm y))", CTX, "verbo-nao-e-leitura:rm"],
  ["`$(...)` com `git rm`", "echo $(git rm .claude/hooks/x)", CTX, "git-que-escreve"],
  // O marcador fica fora do que nao escreve, mas nao destes: `sort -o`, `uniq in out`, um `while`
  // ou `{` cujo comando escreve, e um verbo inofensivo com uma substituicao dentro.
  ["`sort -o` dentro", "cd .claude/hooks && sort -o x y", CTX, "verbo-nao-e-leitura:sort"],
  ["`uniq` com saida dentro", "cd .claude/hooks && uniq a b", CTX, "verbo-nao-e-leitura:uniq"],
  // O rotulo e o do comando la dentro, e ja nao o da palavra-chave (#307): o `rm` esta a vista.
  ["`while` cujo comando apaga", "cd .claude/hooks && while rm x; do :; done", CTX, "verbo-nao-e-leitura:rm"],
  ["chavetas que apagam", "cd .claude/hooks && { rm x; }", CTX, "verbo-nao-e-leitura:rm"],
  ["`export` com `$(...)` que apaga", "cd .claude/hooks && export X=$(rm -rf *)", CTX, "verbo-nao-e-leitura:export"],
  ["`sleep` com `$(...)` que apaga", "cd .claude/hooks && sleep $(rm -rf *)", CTX, "verbo-nao-e-leitura:sleep"],
  ["`tee` a jusante", "cd .claude/hooks && cat x | tee y", CTX, "verbo-nao-e-leitura:tee"],
  // Das leituras do c004591 e do 65a7fdd: estas formas escreviam (medido no `sort` do macOS) e
  // passavam com uma allowlist das flags. O `sort`/`uniq` deixaram de dispensar o marcador.
  ["`sort --out=`", "cd .githooks && sort --out=pre-commit /tmp/evil", CTX, "verbo-nao-e-leitura:sort"],
  ["`sort --o` abreviado", "cd .githooks && echo hi | sort --o pre-commit", CTX, "verbo-nao-e-leitura:sort"],
  ["`sort \"-o\"` entre aspas", "cd .githooks && sort \"-o\" pre-commit /tmp/evil", CTX, "verbo-nao-e-leitura:sort"],
  ["`sort --compress-program`", "cd .githooks && sort -S1K --compress-program=sh /tmp/evil", CTX, "verbo-nao-e-leitura:sort"],
  ["`uniq -` com saida", "cd .githooks && cat /tmp/evil | uniq - pre-commit", CTX, "verbo-nao-e-leitura:uniq"],
  ["`uniq -- -` com saida", "cd .githooks && printf x | uniq -- - commit-msg", CTX, "verbo-nao-e-leitura:uniq"],
  ["`sort -o` dentro de `$(...)`", "cd .claude/hooks && echo $(sort -o x y)", CTX, "verbo-nao-e-leitura:sort"],
  // Da leitura do 65a7fdd: `-tt` e `-t` com valor colado, e o `-o` seguinte escreve; um `$O` expande
  // para uma flag; e uma redireccao de saida dentro de `$(...)` com verbo inofensivo.
  ["`sort -tt -o`", "cd .githooks && sort -tt -o pre-commit /tmp/evil", CTX, "verbo-nao-e-leitura:sort"],
  ["`sort -rtk -o`", "cd .githooks && sort -rtk -o pre-commit /tmp/evil", CTX, "verbo-nao-e-leitura:sort"],
  ["`$(sort -tt -o <fronteira>)`", "cat /tmp/x $(sort -tt -o .claude/settings.json /tmp/a)", CTX, "verbo-nao-e-leitura:sort"],
  ["`sort $O`", "cd .githooks && O=-o && sort $O pre-commit /tmp/e", CTX, "verbo-nao-e-leitura:sort"],
  ["`$(true 1>...)`", "cat /tmp/x $(true 1>.claude/settings.json)", CTX, "verbo-nao-e-leitura:true"],
  ["`$(: 1>...)` depois de um `cd`", "cd .githooks && echo $(: 1>pre-commit)", CTX, "verbo-nao-e-leitura::"],
  // Da leitura do 024753a. Uma funcao ou um `trap` correm o corpo noutro sitio: o verbo escrito deixa
  // de dizer o que corre (`true(){ rm; }` sombreia o `true` isento). E `>&<nome>` escreve `<nome>`.
  ["funcao com o nome de um verbo isento", "true(){ rm -rf *; }; cd .claude/hooks && true", CTX, "execucao-adiada"],
  ["`function` com o nome de um verbo isento", "function date { rm -rf *; }; cd .claude/hooks && date", CTX, "execucao-adiada"],
  ["funcao definida depois do `cd`", "cd .claude/hooks && tr() { rm -rf *; } && tr a b", CTX, "execucao-adiada"],
  ["funcao com o nome de uma leitura", "cat(){ rm -rf .claude/hooks; }; cat .claude/hooks/x", CTX, "execucao-adiada"],
  ["`trap` antes do `cd`", "trap \"rm -rf *\" EXIT; cd .claude/hooks", CTX, "execucao-adiada"],
  ["`trap` dentro de um `if`", "if true; then trap \"rm *\" EXIT; fi; cd .claude/hooks", CTX, "execucao-adiada"],
  ["`trap` com a fronteira citada", "trap \"rm .claude/hooks/x\" EXIT; ls", CTX, "citado-mas-executado"],
  ["`>&2x` depois de um `cd`", "cd .claude/hooks && true >&2x", CTX, "verbo-nao-e-leitura:true"],
  ["`>&1x` numa leitura", "cd .claude/hooks && cat a >&1x", CTX, "redireciona"],
  ["`>&<fronteira>`", "cat .claude/hooks/x >&.claude/hooks/y", CTX, "redireciona"],
  // As redireccoes do #206 (descritor, `>|`/`>!`, colado, alvo entre aspas) vivem no seu ficheiro:
  // `tests-fronteira-redireccoes.mjs`.
  // Os DESCUIDO que o #223 fechou (aspas, `$HOME`, pastas-mae, `alias`) vivem no seu ficheiro:
  // `tests-fronteira-descuidos.mjs`.
  // `$((cmd) )` NAO e aritmetica — so fecha em `))` colados — e corre (ja passava no `main`).
  ["`$((cmd) )` e substituicao", "cat .claude/hooks/x $((rm -rf .claude/hooks/y) )", CTX, "verbo-nao-e-leitura:rm"],
  ["`$((cmd); ...)` depois de um `cd`", "cd .claude/hooks && echo $((rm -rf *); true)", CTX, "verbo-nao-e-leitura:rm"],
  // Sem tecto, 8000 `$(` aninhados rebentavam a pilha, e o `catch` do hook permitia o comando
  // INTEIRO — o `cp` para a fronteira, e um `git push --force`, que estivesse ao lado.
  ["substituicoes aninhadas a mais", `false && cat .claude/hooks/x ${"$(".repeat(8000)}true${")".repeat(8000)}; cp /tmp/e .githooks/pre-commit`, CTX, "substituicoes-demais"],
  ["uma excepcao a analisar nega", "cp /tmp/x .claude/hooks/y.mjs", { get prefixo() { throw new Error("contexto avariado"); } }, "erro-ao-analisar"],
];

/** Os CONTROLOS do #185: a normalizacao nao pode negar o que nao toca a fronteira. Os de baixo
 *  foram negados pela primeira versao — o directorio dentro da fronteira fazia de qualquer palavra
 *  nua um caminho. */
const DENTRO = { ...CTX, cwd: "/Users/g/proj/.claude/hooks", prefixo: ".claude/hooks" };
const CONTROLO_CAMINHO = [
  ["`../` para fora do repo", "cp /tmp/x ../.claude/hooks/y.mjs", CTX],
  ["absoluto noutro repo", "cp /tmp/x /Users/g/outro/.claude/hooks/y.mjs", CTX],
  ["`cd` para fora da fronteira, e depois escrever", "cd /tmp && cp a b", CTX],
  ["a subshell repoe o directorio", "(cd .claude/hooks && ls) && cp /tmp/a b", CTX],
  ["`cd` para a fronteira, e depois LER", "cd .claude/hooks && cat y.mjs", CTX],
  ["ler pelo caminho absoluto", "cat /Users/g/proj/.claude/settings.json", CTX],
  ["`timeout 60` a correr a suite", "cd .claude/hooks && timeout 60 node tests/test-hooks.mjs", CTX],
  ["`sleep 1` e ler", "cd .claude/hooks && sleep 1 && cat x", CTX],
  // `cd <fronteira> && X=y cat a` saiu daqui para `FALSO_POSITIVO`: e a classe da atribuicao.
  // Da leitura do a8cfbd4: o marcador negava estas, que o `main` deixava passar (sem a barra).
  ["`|| true`", "cd .claude/hooks && node a.mjs | grep -c ok || true", CTX],
  ["`|| exit 1` num ciclo", "cd .claude/hooks && for f in tests/*.mjs; do node $f || exit 1; done", CTX],
  ["filtros", "cd .claude/hooks && node a.mjs | tr a b | cut -d: -f1 | column -t", CTX],
  ["`| while read`", "cd .claude/hooks && node a.mjs | while read l; do echo $l; done", CTX],
  ["`status=$?`", "cd .claude/hooks && node a.mjs; status=$?", CTX],
  ["`set -e` e `export`", "cd .claude/hooks && set -e && export X=1 && node tests/a.mjs", CTX],
  ["linha de comentario", "cd .claude/hooks\n# nota\nls", CTX],
  ["`$((...))` nao e comando", "cd .claude/hooks && echo $((1+2))", CTX],
  ["`<(...)` que le", "diff <(git show main:.claude/hooks/x.mjs) .claude/hooks/x.mjs", CTX],
  ["`$(...)` que le", "wc -l $(git ls-files .claude/hooks)", CTX],
  // Da leitura do c004591: o interior de uma substituicao julga-se pelo criterio do marcador.
  ["`$(... | tr ...)`", "cat .claude/hooks/x $(echo a | tr a b)", CTX],
  ["`$(date)`", "cd .claude/hooks && echo $(date +%s) && ls", CTX],
  ["`2>/dev/null` e `2>&1` antes de um filtro", "cd .claude/hooks && node t.mjs 2>/dev/null | cut -c1-80 && node t.mjs 2>&1 | tr a b", CTX],
  ["`2>/dev/null` no proprio filtro", "cd .claude/hooks && ls | tr a b 2>/dev/null || true >&2", CTX],
  // Da leitura do 024753a: o `function` como ARGUMENTO nao define nada, e um descritor nao e ficheiro.
  ["`function` como argumento", "grep -n function .claude/hooks/lib/fronteira.mjs", CTX],
  ["descritores `2>&1` e `>&2-`", "cd .claude/hooks && node t.mjs 2>&1 >&2- | cat", CTX],
  ["`</dev/null` no `cd`", "cd .claude/hooks </dev/null && cat x", CTX],
  ["`pushd`/`popd` repoem", "pushd .claude/hooks; popd; cp /tmp/a b", CTX],
  ["`cwd` dentro: `gh`", "gh pr view 220", DENTRO],
  ["`cwd` dentro: `npm`", "npm run lint", DENTRO],
  ["pasta com outro nome que comeca igual", "rm -rf .claude/hooks-old", {}],
  // A primeira versao refeita negava estas leituras pelo `cd` atras de uma cabeca.
  ["`if cd` e LER", "if cd .claude/hooks; then cat y; fi", CTX],
  ["`builtin cd` e LER", "builtin cd .claude/hooks && cat y", CTX],
  ["`command cd` e LER", "command cd .claude/hooks && cat y", CTX],
  ["`time cd` e LER", "time cd .claude/hooks && cat y", CTX],
  // A crase so EXECUTA fora de aspas simples e de heredoc; e um `do` num nome de ficheiro nao parte.
  ["crase num heredoc citado", "cat <<'EOF'\n`rm .claude/hooks/x`\nEOF", CTX],
  ["crase entre aspas simples", "echo 'a `rm .claude/hooks/x`'", CTX],
  ["`-do` num nome de ficheiro", "cat .claude/hooks/x-do", CTX],
  ["`cd` para a fronteira e redireccionar para fora", "cd .claude/hooks && cat x.mjs > /tmp/y", CTX],
  // Da quarta leitura: tres leituras comuns que a terceira correccao passou a negar.
  ["`cd` com `2>/dev/null` e LER", "cd .claude/hooks 2>/dev/null && cat fronteira.mjs", CTX],
  ["`pushd`/`popd` em silencio e LER", "pushd .claude/hooks > /dev/null && ls; popd > /dev/null", CTX],
  ["`then` como argumento", "grep -r then .claude/hooks", CTX],
];

export function registar({ test, eq }) {
  for (const [nome, comando, ctx, rotulo] of FECHADO_PELO_CAMINHO) {
    test(`inventario/caminho: ${nome}`, () => {
      eq(porqueAltera(comando, ctx), rotulo, `"${comando}" tinha de ser negado por ${rotulo} (#185)`);
    });
  }
  for (const [nome, comando, ctx] of CONTROLO_CAMINHO) {
    test(`inventario/caminho (controlo): ${nome}`, () => {
      eq(porqueAltera(comando, ctx), null, `"${comando}" nao toca a fronteira e foi negado (#185)`);
    });
  }
}
