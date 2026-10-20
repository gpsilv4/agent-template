/**
 * O LEXER de posicao (`lib/posicao.mjs`), por estrutura — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: o `tests-fronteira-posicao.mjs` prova o veredicto pelo hook inteiro, e o piso (as regex do
 * `fronteira.mjs`) nega por cima de muitos erros do lexer — uma palavra mal cortada raramente muda um `deny`.
 * Aqui afirma-se a ESTRUTURA: que comandos, que palavras, o que e citado, o que e corpo de heredoc. E o que
 * fica vermelho quando a varredura muta o fim de uma substituicao, de umas aspas ou de um heredoc.
 */
import { pathToFileURL } from "url";
import { comandos, familiaDe, inlineDe } from "../lib/posicao.mjs";
import { NOMES_INTERPRETADOR } from "../lib/fronteira-dados.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-posicao.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** As palavras de cada comando, como a shell as entrega. */
const palavras = (t) => comandos(t).map((c) => c.argv.map((w) => w.texto));
const um = (t) => comandos(t)[0];

/** [nome, texto, comandos esperados (as palavras)] */
const ESTRUTURA = [
  ["separadores", "a 1; b 2 && c || d & e", [["a", "1"], ["b", "2"], ["c"], ["d"], ["e"]]],
  ["aspas simples e duplas juntam-se a palavra", `x 'a b'"c d"e`, [["x", "a bc de"]]],
  ["um `;` citado nao separa", `git commit -m "a; node -e x"`, [["git", "commit", "-m", "a; node -e x"]]],
  ["o escape tira o `\\`", "perl \\-Ix.pl -e 1", [["perl", "-Ix.pl", "-e", "1"]]],
  ["a continuacao de linha nao separa", "a \\\nb", [["a", "b"]]],
  ["um comentario nao e comando", "a # ; rm x", [["a"]]],
  // Descodificado como a shell o entrega: `-$'\x70e'` e `-pe`.
  ["`$'...'` com escapes", "echo $'a\\'b' -$'\\x70e' $'\\n' c", [["echo", "a'b", "-pe", "\n", "c"]]],
  // Um `<<` dentro de aspas e TEXTO: o `semCorposDeHeredoc` lia-o como heredoc (o contorno do inventario).
  ["`<<` citado nao abre heredoc", "echo '<<EOF'\nrm x\nEOF", [["echo", "<<EOF"], ["rm", "x"], ["EOF"]]],
  ["o corpo de um heredoc nao e comando", "cat <<'EOF'\nnode -pe x\nEOF\nls", [["cat"], ["ls"]]],
  ["dois heredocs na mesma linha", "a <<X <<Y\nnode -pe 1\nX\nnode -pe 2\nY\nb", [["a"], ["b"]]],
  ["um heredoc sem aspas: o texto do corpo nao e comando", "a <<X\nnode -pe 1\nX\nb", [["a"], ["b"]]],
  ["`$((...))` aritmetico nao e substituicao nem heredoc", "echo $((1<<2)) x", [["echo", "$((1<<2))", "x"]]],
  // O `(1+2)` daria um comando `1+2` se fosse lido como substituicao: e o caso que mata a mutacao do `aritmetica()`.
  ["`$((1+2))` aritmetico nao corre nada", `echo $((1+2)) "$((3+4))" x`, [["echo", "$((1+2))", "$((3+4))", "x"]]],
  ["`$((a); b)` e uma substituicao com subshell", "echo $((rm x); true)", [["echo", "$((rm x); true)"], ["rm", "x"], ["true"]]],
  ["`$(...)` corre: o interior vem depois", "echo $(rm x) y", [["echo", "$(rm x)", "y"], ["rm", "x"]]],
  ["`$(...)` dentro de aspas duplas corre", `echo "a $(rm x) b"`, [["echo", "a $(rm x) b"], ["rm", "x"]]],
  ["a crase corre", "echo `rm x`", [["echo", "`rm x`"], ["rm", "x"]]],
  ["`<(...)` corre", "diff <(rm x) y", [["diff", "<(rm x)", "y"], ["rm", "x"]]],
  ["um `)` citado dentro de `$(...)` nao fecha", `echo $(echo ")"; rm x)`, [["echo", `$(echo ")"; rm x)`], ["echo", ")"], ["rm", "x"]]],
  ["as redireccoes nao sao palavras", "echo x 2>/dev/null >f <g", [["echo", "x"]]],
];

export function registar({ test, eq }) {
  for (const [nome, texto, esperado] of ESTRUTURA) {
    test(`posicao/lexer: ${nome}`, () => eq(JSON.stringify(palavras(texto)), JSON.stringify(esperado), JSON.stringify(texto)));
  }

  test("posicao/lexer: o heredoc pertence ao comando e diz se a etiqueta e citada", () => {
    const c = um("cat <<'EOF' > f\nlinha\nEOF");
    eq(JSON.stringify(c.heredoc), JSON.stringify({ corpo: "linha", citado: true }), "heredoc citado");
    eq(c.redir[0]?.alvo, "f", "a redireccao a seguir ao `<<` continua a ver o alvo");
    eq(um("cat <<EOF\nx\nEOF").heredoc?.citado, false, "etiqueta sem aspas");
  });
  test("posicao/lexer: num heredoc SEM aspas o `$(...)` do corpo corre; com aspas nao", () => {
    eq(JSON.stringify(palavras("cat <<EOF\n$(rm x)\nEOF")), JSON.stringify([["cat"], ["rm", "x"]]), "sem aspas");
    eq(JSON.stringify(palavras("cat <<'EOF'\n$(rm x)\nEOF")), JSON.stringify([["cat"]]), "com aspas");
  });
  test("posicao/lexer: o pipe liga os comandos, e o `||` nao e pipe", () => {
    const [a, b] = comandos("a | b");
    eq(`${a.pipePara} ${b.pipeDe}`, "true true", "a | b");
    const [c, d] = comandos("c || d");
    eq(`${c.pipePara} ${d.pipeDe}`, "false false", "c || d");
  });
  test("posicao/lexer: a palavra citada sabe que o e, e guarda o texto cru", () => {
    const w = um(`node -e "x y"`).argv[2];
    eq(`${w.citada} ${w.cru}`, `true "x y"`, "citada");
    eq(um("node -e x").argv[2].citada, false, "nao citada");
  });

  // A tabela de familias do lexer e os NOMES da folha sao duas listas: prendem-se aqui (`TP8`). Um nome novo
  // nos `NOMES_INTERPRETADOR` sem familia no `posicao.mjs` ficava sem cobertura nenhuma, sem sinal.
  test("posicao/lexer: cada interpretador dos NOMES da folha tem familia no lexer", () => {
    const nomes = NOMES_INTERPRETADOR.split("|").map((a) => a.replace(/\(\?:[^)]*\)\??|\?/g, ""));
    eq(nomes.length > 10, true, "os NOMES nao se partiram (TP2)");
    eq(nomes.filter((n) => !familiaDe(n)).join(", "), "", "sem familia");
  });

  // --- Quem corre codigo inline, por posicao ---------------------------------------------------
  /** [texto, sinal esperado] — o primeiro comando do texto (o `inlineDe` de cada um, o primeiro que da). */
  // `(c) => inlineDe(c)`, e nao `.map(inlineDe)`: o `map` passava o INDICE como `qualquer`, e do 2.o comando em
  // diante os casos de posicao ficavam verdes sem a posicao (leitura da 3.a passagem).
  const sinal = (t) => comandos(t).map((c) => inlineDe(c)).find(Boolean) ?? null;
  // O tecto de voltas, que so se ve pelo SINAL: sem ele o `verboEm` acabava no `node` e dava `letra`.
  test("posicao/inline: `env A=1` x70 antes do interpretador passa o tecto de voltas -> variavel", () =>
    eq(sinal(`${"env A=1 ".repeat(70)}node -pe 1`), "variavel", "tecto"));
  for (const [texto, esperado] of [
    ["node -pe 1", "letra"],
    ["perl -le 1", "letra"],
    ["perl -E 1", "letra"],
    ["python3.12 -Ic 1", "letra"],
    ["/usr/bin/ruby -ne 1", "letra"],
    ["php -r 1", "letra"],
    [`"node" -pe 1`, "letra"],
    ["node --eval=1", "letra"],
    ["node --import=data:text/javascript,1", "data"],
    ["node --import data:text/javascript,1 x", "data"],
    ["deno eval 1", "deno"],
    ["deno run x.ts", null],
    ["$N -c 1", "variavel"],
    ["$(command -v node) -pe 1", "variavel"],
    // A isencao estrita do script: so IMEDIATAMENTE a seguir ao interpretador (#317).
    ["node x.mjs -e 1", null],
    ["node -r /tmp/x.js -e 1", "letra"],
    ["node --title x.js -e 1", "letra"],
    [`node "x.mjs" -e 1`, "letra"],
    // So o run de letras a cabeca do grupo: o valor colado de `-I` nao conta como letras.
    ["perl -I/usr/lib/perl5 x.pl", null],
    ["python3 -IW x.py", null],
    // Por posicao: as palavras-chave, as atribuicoes, as cabecas e os executores conhecidos.
    ["{ node -pe 1; }", "letra"],
    ["for i in 1; do node -pe 1; done", "letra"],
    ["if x; then node -pe 1; fi", "letra"],
    ["exec node -pe 1", "letra"],
    ["FOO=1 sudo -u me node -pe 1", "letra"],
    ["find . -exec node -pe 1 \\;", "letra"],
    ["npx node -pe 1", "letra"],
    ["pnpm exec node -pe 1", "letra"],
    ["uv run python -c 1", "letra"],
    ["env -S 'node -pe 1'", "letra"],
    // ...e NAO em qualquer palavra: um `node` que e argumento nao corre nada.
    ["find . -name node -exec cat {} \\;", null],
    ["git log --grep node -pS x", null],
    ["echo node -pe 1", null],
    [`git commit -m "node -pe 1"`, null],
    // O que corre dentro de uma substituicao conta.
    ["echo $(node -pe 1)", "letra"],
  ]) {
    test(`posicao/inline: ${JSON.stringify(texto)} -> ${esperado}`, () => eq(sinal(texto), esperado, texto));
  }
}
