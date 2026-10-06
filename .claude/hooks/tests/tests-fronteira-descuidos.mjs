/**
 * Os DESCUIDOS da fronteira fechados pelo criterio de corte (#223) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o criterio vive no `hooks-guide.md` — um DESCUIDO (sai de uma ferramenta ou de
 * habito) fecha-se; um CONTORNO regista-se e nao se persegue. Estes sao os descuidos que ele mandou
 * fechar: um caminho entre aspas, o `$HOME`, as pastas-MAE da fronteira (`rm -rf .claude` apaga os
 * hooks) e o `alias`. Vivem a parte porque o inventario estava perto das 500 linhas.
 *
 * O contexto e FIXO (`TP3`): a raiz, o `cwd` e a home nao dependem da maquina.
 */
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-descuidos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const CTX = { raiz: "/Users/g/proj", cwd: "/Users/g/proj", prefixo: "", home: "/Users/g" };
const RM = "verbo-nao-e-leitura:rm";
const CP = "verbo-nao-e-leitura:cp";

/** Escrevem na fronteira: tem de ser negados, com o rotulo esperado. */
const NEGADAS = [
  // Um caminho entre aspas e um caminho (o `semCitacoes` apagava-o como texto).
  ["`cd` com o directorio entre aspas", `cd ".claude/hooks" && cp /tmp/x y.mjs`, CP],
  ["`cd` entre aspas simples", "cd '.githooks' && rm pre-commit", RM],
  ["argumento entre aspas", `rm -rf ".claude/hooks"`, RM],
  ["a pasta-mae entre aspas simples", "rm -rf '.claude'", RM],
  ["`$HOME` dentro de aspas", `rm -rf "$HOME/proj/.claude"`, RM],
  ["`cd` para `$HOME` entre aspas", `cd "$HOME/proj/.claude/hooks" && rm -rf *`, RM],
  // A regressao da primeira versao, por regex: juntava a aspa que FECHA uma string com a que abre a
  // seguinte, e o `>` que trunca o settings desaparecia com as duas.
  ["duas strings vizinhas nao se juntam", `echo "a cd ";>.claude/settings.json;"z"`, "verbo-nao-e-leitura:settings.json"],
  ["duas strings vizinhas nao se juntam (simples)", "echo 'a cd ';>.claude/settings.json;'z'", "verbo-nao-e-leitura:settings.json"],
  // O `$HOME` e o `~` escrito de outra maneira.
  ["`cd` por `$HOME`", "cd $HOME/proj/.claude/hooks && cp /tmp/x y.mjs", CP],
  ["`${HOME}` no caminho", "cp /tmp/x ${HOME}/proj/.claude/hooks/y.mjs", CP],
  // As pastas-MAE: so o token inteiro, ou com `{`, ou com um glob no primeiro nome.
  ["a pasta-mae inteira", "rm -rf .claude", RM],
  ["a pasta-mae com barra", "mv .claude/ /tmp/c", "verbo-nao-e-leitura:mv"],
  ["chavetas", "rm -rf .claude/{hooks,settings.json}", RM],
  ["a pasta-mae por `~`", "rm -rf ~/proj/.claude", RM],
  ["a pasta-mae por caminho absoluto", "rm -rf /Users/g/proj/.claude", RM],
  ["a pasta-mae por `$PWD`", "rm -rf $PWD/.claude", RM],
  ["a pasta-mae com `/.`", "rm -rf .claude/.", RM],
  ["glob na pasta-mae", "rm -rf .claude/*", RM],
  ["glob no primeiro nome", "rm -rf .claude/h*", RM],
  ["`cd` para a pasta-mae e glob", "cd .claude && rm -rf *", RM],
  ["atribuicao com a pasta-mae", "D=.claude; cp /tmp/x $D/hooks/y.mjs", "verbo-nao-e-leitura:D=.claude"],
  // O `alias` sombreia um verbo de leitura: a classe das funcoes do #222. A forma que EXECUTA e a de
  // varias linhas — numa so linha, o bash e o zsh nao aplicam o alias (medido).
  ["`alias` que sombreia uma leitura", "shopt -s expand_aliases\nalias cat='rm -rf'\ncat .claude/hooks", "execucao-adiada"],
  ["`\\alias`", "\\alias ls='rm -rf'\nls .claude/hooks", "execucao-adiada"],
  ["`builtin alias`", "builtin alias ls='rm -rf'\nls .claude/hooks", "execucao-adiada"],
  // Da segunda leitura do PR #230 (ja passavam no `main`). O resto da linha do `<<` e comando — a
  // forma mais habitual de um agente escrever um ficheiro; e as aspas leem-se numa so passagem.
  ["heredoc com a redireccao na mesma linha", "cat <<'EOF' > .claude/hooks/x.mjs\nx\nEOF", "redireciona"],
  ["heredoc sem aspas com a redireccao", "cat <<EOF > .claude/settings.json\n{}\nEOF", "redireciona"],
  ["apostrofos em comentarios nao escondem o meio", "echo x # it's\nrm -rf .claude/hooks # it's", RM],
  ["`'a\\'` nao tem escape em aspas simples", "echo 'a\\' ; rm -rf .claude/hooks ; echo '\\b'", RM],
  ["glob que casa `hooks` e `settings`", "rm -rf .claude/[hs]*", RM],
  ["glob de um caracter", "rm .claude/?ooks", RM],
];

/** #229 — o que o shell EXECUTA dentro de texto citado: `$(...)` e crases entre aspas duplas, num
 *  heredoc sem aspas, e a crase fora de aspas, que passou a ser julgada como um `$(...)`. Afirma-se
 *  a NEGACAO, e nao o rotulo: ele e o do verbo de la de dentro, e muda com a forma. */
const EXECUTADO_EM_TEXTO = [
  ["`$(...)` num heredoc sem aspas", "cat <<EOF\n$(rm .claude/settings.json)\nEOF"],
  ["crase num heredoc sem aspas", "cat <<EOF > /tmp/x\n`rm -rf .claude/hooks`\nEOF"],
  ["`$(...)` entre aspas duplas, depois de um `cd`", `cd .claude/hooks && echo "$(rm -rf *)"`],
  ["crase entre aspas duplas", "echo \"x `rm -rf .claude/hooks` y\""],
  ["relativo dentro da crase, depois de um `cd`", "cd .claude 2>/dev/null; echo `rm settings.json`"],
  ["crase num verbo sem marcador, depois de um `cd`", "cd .githooks && true `cp /tmp/evil pre-commit`"],
  // Da quinta leitura do #185: a isencao da crase so vale para UM caminho sozinho.
  ...[
    "echo `.claude/hooks/x.mjs; rm -rf .claude/hooks`",
    "`.githooks/x && rm .githooks/y`",
    "echo \"`.claude/hooks/x.mjs > .claude/settings.json`\"",
    "echo `.githooks/pre-commit | tee .githooks/pre-commit`",
    "echo `.claude/settings.json\nrm -rf .claude/hooks`",
    "echo `.claude/hooks/a.mjs$(rm -rf .claude/hooks)`",
    "echo `.claude/hooks/x.mjs&&rm -rf .claude/hooks`",
  ].map((c, i) => [`crase com um caminho e mais um comando (${i + 1})`, c]),
  // Da leitura do 193a9a9. Dentro de um `$(...)` abre-se um contexto de aspas NOVO: o `)` ou o `"`
  // citados la dentro nao fecham nada, e o `rm` corre (medido em bash e zsh).
  ["aspas dentro de `$(...)` em aspas duplas", `echo "$(echo "x"; rm -rf .claude/hooks)"`],
  ["`)` citado dentro de `$(...)`", `echo "$(echo ")"; rm -rf .claude/hooks)"`],
  ["`)` em aspas simples dentro de `$(...)`", `echo "$(echo ')'; rm -rf .claude/hooks)"`],
  ["aspas aninhadas depois de um `cd`", `cd .claude/hooks && echo "$(echo "x"; rm -rf *)"`],
  // Um `(` CITADO dentro do `$(...)` nao abre nada: contado, a substituicao nunca fechava e engolia o
  // `rm` que vem DEPOIS dela — e que corre.
  ["`(` citado dentro de `$(...)` nao engole o resto", `echo "$(echo "(")"; rm -rf .claude/hooks`],
  // O de dentro julga-se no directorio do comando de fora, e nao no do `cd` seguinte.
  ["`cd` a seguir nao muda o directorio do de dentro", `cd .claude/hooks && echo "$(rm -rf *)" ; cd /tmp`],
  ["dentro de uma subshell", `(cd .claude && echo "$(rm *)") && ls`],
  // Pre-existentes: o delimitador `\\EOF` ou com `-` nao casava, e o corpo era lido como comando — um
  // apostrofo la dentro desemparelhava o resto; e o `$'...'` (ANSI-C) tem escapes.
  ["delimitador `\\EOF`", "cat <<\\EOF > /tmp/x\nit's\nEOF\nrm -rf .claude/hooks # '"],
  ["delimitador com `-`", "cat <<'END-X' > /tmp/x\nit's\nEND-X\nrm -rf .claude/hooks # '"],
  ["`$'...'` com `\\'`", "echo $'x\\' y'; rm -rf .claude/hooks; echo 'z'"],
  // `"$(pwd)/..."` e `"$(git rev-parse --show-toplevel)/..."` sao caminhos, escritos por um comando.
  ["`$(git rev-parse --show-toplevel)` no caminho", `rm "$(git rev-parse --show-toplevel)/.claude/settings.json"`],
  ["`$(pwd)` no caminho", `rm -rf "$(pwd)/.claude/hooks"`],
  ["`$(pwd)` no alvo de uma redireccao", `echo x > "$(pwd)/.claude/settings.json"`],
  // Da segunda leitura do PR #231. O de dentro corre numa SUBSHELL: um `cd` la dentro nao muda o
  // directorio de quem chamou — despejado como linha nua, mudava-o, e o resto passava.
  ["`cd` dentro de `\"$(...)\"` nao muda o directorio", `cd .claude/hooks && node t.mjs "$(cd ../.. && pwd)" && cp /tmp/x y.mjs`],
  ["`cd` dentro de `\"$(...)\"` e um `rm` a seguir", `cd .claude/hooks && echo "$(cd /tmp)" && rm y.mjs`],
  ["`cd` dentro de `\"$(...)\"` numa subshell", `(cd .claude/hooks; echo "$(cd /tmp)"; rm x.mjs)`],
  ["`cd` no corpo de um heredoc sem aspas", "cd .claude/hooks\ncat <<EOF\n$(cd /tmp)\nEOF\nrm y.mjs"],
  // `$'...'` dentro de `$(...)` tem escapes: `$'\\''` nao abre aspas.
  ["`$'...'` dentro de `$(...)`", "echo \"$(echo $'\\'')\" ; rm .claude/hooks/x ; echo \"'\""],
  // Um delimitador de heredoc com `+` ou `:` tambem e um delimitador.
  ["delimitador com `+`", "cat <<'END+X'\nit's\nEND+X\nrm -rf .claude/hooks\necho ok #'"],
  // O que NAO e heredoc nao engole as linhas seguintes (leitura do c4c0de7).
  ["`<<` aritmetico nao e heredoc", "echo $((1<<$n))\nrm -rf .claude/hooks\n$n"],
  ["`<<=` aritmetico nao e heredoc", "((a<<=2))\nrm -rf .claude/hooks\n=2"],
  ["here-string `<<<` nao e heredoc", "cat <<<$x\nrm -rf .claude/hooks\n$x"],
  ["here-string `<<<` sem `$`", "cat <<<x\nrm -rf .claude/hooks\nx"],
];

/** Trabalho normal: tem de passar. A pasta-mae so conta como token inteiro, e o texto citado que
 *  nao e um caminho continua texto. */
const PERMITIDAS = [
  ["ler a pasta-mae", "ls -la .claude/ && find .claude -name '*.md' && git add .claude"],
  ["`du` e `tree` da pasta-mae", "du -sh .claude && tree .claude"],
  ["escrever em `.claude/commands/`", "mkdir -p .claude/agents && cp /tmp/x .claude/commands/x.md"],
  ["apagar dentro de `.claude/commands/`", "rm -rf .claude/commands/old"],
  ["`cd` para a pasta-mae e LER", "cd .claude && cat settings.json"],
  ["`alias` como argumento", "grep -r alias .claude/hooks"],
  ["`cd` entre aspas para fora", `cd "/tmp/a b" && rm x`],
  ["`cd` citado numa mensagem de commit", `git commit -m "cd '.claude/hooks'"`],
  ["comando citado numa mensagem de commit", `git commit -m 'fix: cd ".claude/hooks" && rm x'`],
  ["aspas escapadas dentro de aspas", `echo "cd \\".claude/hooks\\""`],
  ["um padrao entre aspas", `grep -rn "x" .claude/hooks && git log --grep=".claude/hooks"`],
  // So perde as aspas o que e CAMINHO (ou alvo de redireccao): sem aspas, o `stash` daqui era lido
  // como o sub-verbo do `git` que escreve.
  ["texto citado que nao e caminho continua texto", `git grep "stash" .claude/hooks`],
  ["`.claude` dentro de um padrao do `sed`", `sed -i "s/.claude/x/" /tmp/f`],
  ["apostrofo num heredoc com aspas", "cat <<'EOF'\nit's .claude/hooks\nEOF"],
  // Um padrao com metacaracteres e um padrao, e nao um caminho: sem aspas, o `|` partia o comando.
  ["alternancia num `grep`", `grep -n ".claude/hooks|.githooks" README.md`],
  ["alternancia num `rg`, aspas simples", "rg '.githooks|.claude' -l"],
  ["grupo num `grep -E`", `grep -E "(.claude|.githooks)/" -r src`],
  ["`>` dentro de um padrao", `grep -n ">.claude/hooks" x.md`],
  ["comentario no fim de uma leitura", "node .claude/hooks/tests/test-hooks.mjs # corre a suite"],
  ["um `rm` no corpo de uma mensagem por heredoc", "git commit -F- <<'EOF'\nmsg com rm -rf .claude/hooks\nEOF"],
  // Um glob que nao pode casar nenhum nome da fronteira nao e a pasta-mae.
  ["glob de extensao na pasta-mae", "cp .claude/*.md /tmp/ && rm .claude/*.bak"],
  // #229: o que nao EXECUTA continua texto — aspas simples, heredocs com aspas, escapes, e uma crase
  // que e so um caminho.
  ["`$(...)` entre aspas simples", "echo 'a $(rm .claude/hooks/x)'"],
  ["`$(...)` num heredoc com aspas", "cat <<'EOF'\n$(rm .claude/settings.json)\nEOF"],
  ["crase no corpo de uma mensagem por heredoc", "git commit -F- <<'EOF'\nmsg com `rm -rf .claude/hooks`\nEOF"],
  ["`\\$(` escapado em aspas duplas", `echo "\\$(rm .claude/settings.json)"`],
  ["crase que e so um caminho", "git commit -m \"fix: o `.claude/hooks` agora nega\""],
  ["`$(date)` em aspas duplas, a ler da fronteira", `cat .claude/hooks/x | grep "$(date)"`],
  // O que corre dentro de aspas e julgado A PARTE: o verbo de fora, que so recebe o texto, nao e
  // julgado por uma leitura la dentro (leitura do 193a9a9 — era o passo de publicar a suite).
  ["publicar um ficheiro da fronteira", `gh issue create --title x --body "$(cat .claude/hooks/README.md)"`],
  ["publicar o resultado da suite", `gh pr comment 1 --body "$(node .claude/hooks/tests/test-hooks.mjs 2>&1 | tail -5)"`],
  ["a lista da fronteira como argumento", `npx eslint "$(git ls-files .claude/hooks)"`],
  ["copiar para um temporario", `cat .claude/hooks/x.mjs > "$(mktemp)"`],
  ["o corpo de um PR por heredoc", "gh pr create --body \"$(cat <<'EOF'\nTexto com `.claude/hooks` e $(x)\nEOF\n)\""],
  ["aspas aninhadas que leem", `echo "$(git log -1 --format="%h")" .claude/hooks/x`],
  ["uma crase numa mensagem que toca a fronteira", "git commit -m \"docs: corre `npm test` antes\" -- .claude/hooks/x.mjs"],
  ["o corpo de `<<\\EOF` e literal", "cat <<\\EOF\n$(rm .claude/settings.json)\nEOF"],
  // O de dentro le-se pelas mesmas regras de aspas: o `|` de um padrao citado nao parte nada.
  ["um padrao com `|` dentro de `$(...)`", `gh pr comment 1 --body "$(grep -E "a|b" .claude/hooks/x)"`],
  ["um padrao com `|` dentro de uma crase", 'echo `grep "a|b" .claude/hooks/x`'],
  ["`cd` para a fronteira dentro de `\"$(...)\"`, e um `rm` fora", `echo "$(cd .claude/hooks)" ; rm y.mjs`],
];

/** Negados de proposito — o preco aceite, e nao um defeito por corrigir. Afirma-se a NEGACAO: se
 *  um deles passar a passar, foi uma escolha, e a entrada sai daqui com a razao. */
const FALSOS_POSITIVOS_ACEITES = [
  // Depois de um `cd` para a pasta-mae, cada segmento que pode escrever e julgado: um caminho
  // completo para `.claude/commands/` continua livre.
  ["escrever depois de `cd .claude`", "cd .claude && cp /tmp/x commands/y.md"],
  // Ja eram negados com `.claude/hooks`: copiar DA fronteira, um `for` a encabecar, e o
  // `git-que-escreve`, que olha para qualquer palavra e nao so para o sub-verbo.
  ["copiar a pasta-mae", "cp -r .claude /tmp/backup"],
  ["`for` sobre as pastas", "for d in .agent .claude; do ls $d; done"],
  ["`git grep` por uma palavra de sub-verbo", "git grep -n checkout -- .agent .claude"],
  ["`mkdir` da pasta-mae", "mkdir -p .claude"],
  // Uma string simples com um caminho da fronteira e um caminho — mesmo num titulo sem espacos.
  ["titulo do `gh` que e so um caminho", `gh pr create --title ".claude/hooks" --body "x"`],
];

export function registar({ test, eq }) {
  for (const [nome, comando, rotulo] of NEGADAS) {
    test(`descuido: ${nome}`, () => {
      eq(porqueAltera(comando, CTX), rotulo, `"${comando}" tinha de ser negado por ${rotulo} (#223)`);
    });
  }
  for (const [nome, comando] of EXECUTADO_EM_TEXTO) {
    test(`citado-executado: ${nome}`, () => {
      eq(porqueAltera(comando, CTX) !== null, true, `"${comando}" executa dentro de texto citado e passou (#229)`);
    });
  }
  for (const [nome, comando] of PERMITIDAS) {
    test(`descuido (controlo): ${nome}`, () => {
      eq(porqueAltera(comando, CTX), null, `"${comando}" e trabalho normal e foi negado (#223)`);
    });
  }
  for (const [nome, comando] of FALSOS_POSITIVOS_ACEITES) {
    test(`descuido (falso positivo aceite): ${nome}`, () => {
      eq(porqueAltera(comando, CTX) !== null, true, `"${comando}" ja passa — se foi de proposito, tirar daqui com a razao (#223)`);
    });
  }
}
