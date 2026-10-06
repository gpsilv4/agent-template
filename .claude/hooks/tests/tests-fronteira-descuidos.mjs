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
