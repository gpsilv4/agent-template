/**
 * O guard com comandos ENORMES (#224) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: um hook `PreToolUse` que excede o timeout (600 s por omissao) PERMITE a chamada
 * — esta na documentacao de hooks do Claude Code. O `dentroDeAspas` relia o comando desde o inicio
 * por cada separador e parentese: `git push --force` seguido de 200 000 `)` levava 60 s, e a curva
 * chegava aos 600 s pouco depois. Um comando grande o bastante passava por falta de tempo.
 *
 * Duas redes: a analise de aspas numa so passagem (`zonasCitadas`), e um tecto de tamanho que nega
 * antes de qualquer analise. Os tempos sao generosos de proposito — o que se afirma e a ORDEM de
 * grandeza (antes: ~15 s com 99k caracteres; depois: dezenas de ms), nao um numero de maquina.
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-guard-tamanho.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** O tecto do hook. Escrito aqui tambem: se o hook o mudar, este teste tem de ser revisto. */
const MAX = 100_000;
/** Bem acima do que a analise linear gasta, e bem abaixo dos ~15 s da quadratica. */
const TECTO_MS = 3000;

export function registar({ test, corre, repo, eq, contem }) {
  const comRepo = (fn) => {
    const d = repo("feature/x");
    try {
      fn(d);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  test("tamanho: um comando acima do tecto e negado antes de qualquer analise (#224)", () =>
    comRepo((d) => {
      const r = corre({ tool_input: { command: `echo ${"a".repeat(MAX)}` }, cwd: d });
      eq(r.decisao, "deny", "um comando acima do tecto tem de ser negado");
      contem(r.razao, "grande demais", "a razao tem de dizer porque");
    }));

  test("tamanho: um comando no tecto ainda e analisado, e passa se for leitura (#224)", () =>
    comRepo((d) => {
      const cmd = `echo ${"a".repeat(MAX - 5)}`;
      eq(cmd.length, MAX, "o comando tem de ter exactamente o tecto");
      eq(corre({ tool_input: { command: cmd }, cwd: d }).decisao, "allow", "no tecto, uma leitura passa");
    }));

  test(`tamanho: force-push com 99k parenteses e negado em menos de ${TECTO_MS} ms (#224)`, () =>
    comRepo((d) => {
      const t0 = Date.now();
      const r = corre({ tool_input: { command: `git push --force origin main ${")".repeat(99_000)}` }, cwd: d });
      const ms = Date.now() - t0;
      eq(r.decisao, "deny", "o force-push tem de ser negado");
      eq(ms < TECTO_MS, true, `a analise levou ${ms} ms — voltou a ser quadratica? (era ~15 s)`);
    }));

  // Os separadores seguidos (`;;;`) colapsam num so: o caminho quadratico deles so aparece
  // INTERCALADOS. Medido: 7.2 s antes, ~0.1 s depois.
  test(`tamanho: force-push com 49k separadores intercalados e negado em menos de ${TECTO_MS} ms (#224)`, () =>
    comRepo((d) => {
      const t0 = Date.now();
      const r = corre({ tool_input: { command: `git push --force origin main ${"a;".repeat(49_000)}` }, cwd: d });
      const ms = Date.now() - t0;
      eq(r.decisao, "deny", "o force-push tem de ser negado");
      eq(ms < TECTO_MS, true, `a analise levou ${ms} ms — voltou a ser quadratica? (era ~7 s)`);
    }));
}
