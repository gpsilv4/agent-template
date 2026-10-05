/**
 * As REDIRECCOES para a fronteira (#206) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `tests-fronteira-inventario.mjs` passou as 500 linhas com estes casos. Vivem a
 * parte porque sao uma familia so — como o shell escreve um ficheiro sem verbo nenhum que o diga:
 * com descritor (`2>`, `1>`), por cima do `noclobber` (`>|`, e o `>!` do zsh, o shell do Bash tool),
 * colado ao caminho, e com o alvo entre aspas. Todos passavam no `main`; nasceram em `ABERTO` ou nas
 * leituras independentes do PR #225.
 *
 * O contexto e FIXO, como no inventario (`TP3`): nao depende da maquina.
 */
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-redireccoes.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const CTX = { raiz: "/Users/g/proj", cwd: "/Users/g/proj", prefixo: "", home: "/Users/g" };

/** Escrevem na fronteira: tem de ser negados, com o rotulo esperado. */
const NEGADAS = [
  // O `[^>\d]` antigo do `redireciona`, posto para nao confundir o `2>&1`, excluia qualquer descritor.
  ["redireccao `2>`", "node /tmp/x 2> .claude/settings.json", "redireciona"],
  ["redireccao `1>`", "node /tmp/x 1> .githooks/commit-msg", "redireciona"],
  ["redireccao `2>>`", "node /tmp/x 2>> .claude/hooks/log", "redireciona"],
  ["redireccao `2>` sem espaco", "node /tmp/x 2>.claude/settings.json", "redireciona"],
  ["redireccao `>|`", "echo x >| .claude/settings.json", "redireciona"],
  ["`2>` depois de um `cd`", "cd .githooks && node x 2> pre-commit", "redireciona"],
  // Um `>` ESCAPADO antes do `|` e literal, e o `|` e um pipe: sem contar o escape, o `rm` ficava
  // escondido atras do `echo` (regressao do primeiro commit do PR, apanhada pela leitura).
  ["`\\>|` e um pipe", "echo \\>|rm -rf .claude/hooks/", "verbo-nao-e-leitura:rm"],
  ["`a\\>|` e um pipe", "echo a\\>|cp /tmp/x .claude/settings.json", "verbo-nao-e-leitura:cp"],
  // O `>!` do zsh, e `>|`/`>&`/`>!` colados ao caminho.
  ["`>!` do zsh", "echo x >! .claude/settings.json", "redireciona"],
  ["`2>!` e `>>!`", "echo x 2>! .claude/settings.json; echo y >>! .claude/settings.json", "redireciona"],
  ["`>!` colado", "echo x >!.claude/settings.json", "redireciona"],
  ["`>|` colado", "cat /tmp/x >|.claude/settings.json", "redireciona"],
  ["`2>|` colado", "cat /tmp/x 2>|.claude/settings.json", "redireciona"],
  ["`>&` colado", "echo x >&.githooks/pre-commit", "redireciona"],
  ["`>|` colado depois de um `cd`", "cd .githooks && echo x >|pre-commit", "redireciona"],
  ["`>!` colado depois de um `cd`", "cd .githooks && echo x >!pre-commit", "redireciona"],
  ["`>&!` do zsh", "echo x >&!.claude/settings.json; echo y >>&! .claude/settings.json", "redireciona"],
  ["`>&|` colado e uma redireccao, nao um pipe", "echo x >&|.claude/settings.json", "redireciona"],
  ["`>&!` colado depois de um `cd`", "cd .githooks && cat a >&!pre-commit", "redireciona"],
  // O alvo ENTRE ASPAS: o `semCitacoes` apagava-o como texto, e pôr aspas num caminho e habito.
  ["alvo entre aspas duplas", "echo x > \".claude/settings.json\"", "redireciona"],
  ["alvo entre aspas simples, colado", "echo x >'.claude/settings.json'", "redireciona"],
  ["`>|` com o alvo entre aspas", "echo x >|\".claude/settings.json\"", "redireciona"],
  ["aspas vazias antes do caminho", "cat /tmp/x >\"\".claude/settings.json", "redireciona"],
];

/** Nao escrevem na fronteira: um descritor, `/dev/null`, ou um ficheiro FORA. Tem de passar. */
const PERMITIDAS = [
  ["`2>&1` e `>&2-` a correr da fronteira", "node .claude/hooks/tests/x.mjs 2>&1 >&2-"],
  ["`2>/tmp/log` a correr da fronteira", "node .claude/hooks/tests/x.mjs 2>/tmp/log"],
  ["`2>&1 > /tmp/y` a ler da fronteira", "cat .claude/hooks/x 2>&1 > /tmp/y"],
  ["`>|` para fora a correr da fronteira", "node .claude/hooks/a.mjs >| /tmp/y"],
  ["`>|` sem espaco e um alvo, nao um pipe", "cat x>|rm"],
  // Em `\\>|` a barra e literal e o `>` real: e um alvo (o ficheiro `rm`), nao um pipe.
  ["`\\\\>|` e um alvo, nao um pipe", "echo \\\\>|rm -rf .claude/hooks/"],
  ["texto com `>` e aspas dentro de outras aspas", "git commit -m \"x > '.claude/hooks/y'\""],
  ["alvo entre aspas FORA", "cat .claude/hooks/x > \"/tmp/o\""],
  ["`[`/`[[` sao leituras", "[ ! -f .claude/settings.json ] && [[ -f .claude/hooks/a ]] && echo no"],
];

export function registar({ test, eq }) {
  for (const [nome, comando, rotulo] of NEGADAS) {
    test(`redireccao: ${nome}`, () => {
      eq(porqueAltera(comando, CTX), rotulo, `"${comando}" tinha de ser negado por ${rotulo} (#206)`);
    });
  }
  for (const [nome, comando] of PERMITIDAS) {
    test(`redireccao (controlo): ${nome}`, () => {
      eq(porqueAltera(comando, CTX), null, `"${comando}" nao escreve na fronteira e foi negado (#206)`);
    });
  }
}
