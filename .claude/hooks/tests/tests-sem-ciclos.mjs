/**
 * Os modulos dos hooks nao se importam em ciclo (#243) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `caminhos.mjs` e o `fronteira.mjs` importavam-se um ao outro. Num ciclo, o
 * primeiro a ser avaliado ve o outro a meio: um `const` novo no topo de qualquer dos dois
 * rebentava com TDZ, e o erro caia no `catch` do hook — que PERMITE. O partilhado foi para um
 * modulo-folha (`lib/fronteira-dados.mjs`); isto reprova se um ciclo voltar entre os hooks e o
 * `lib/` deles (um modulo de fora entra sem arestas: hoje nenhum de `.agent/scripts/` os importa).
 *
 * Le os `import`/`export ... from` estaticos com caminho relativo; um `import()` dinamico nao
 * cria o problema (avalia-se depois), e nao conta.
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { dirname, join, resolve, relative } from "path";
import { fileURLToPath, pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-sem-ciclos.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const HOOKS = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Os imports estaticos relativos de um ficheiro, resolvidos para caminhos absolutos. */
const importsDe = (f) =>
  [...readFileSync(f, "utf8").matchAll(/^\s*(?:import|export)\b[^;'"]*?(?:from\s*)?["'](\.{1,2}\/[^"']+)["']/gm)]
    .map((m) => resolve(dirname(f), m[1]))
    .filter((p) => existsSync(p));

/** O primeiro ciclo encontrado no grafo `{ ficheiro: [importados] }`, como lista, ou `null`. */
export function primeiroCiclo(grafo) {
  const estado = new Map(); // 1 = na pilha, 2 = visto
  const pilha = [];
  const visita = (n) => {
    if (estado.get(n) === 1) return [...pilha.slice(pilha.indexOf(n)), n];
    if (estado.get(n) === 2) return null;
    estado.set(n, 1);
    pilha.push(n);
    for (const m of grafo[n] ?? []) {
      const c = visita(m);
      if (c) return c;
    }
    pilha.pop();
    estado.set(n, 2);
    return null;
  };
  for (const n of Object.keys(grafo)) {
    const c = visita(n);
    if (c) return c;
  }
  return null;
}

export function registar({ test, eq }) {
  test("sem-ciclos: o detector apanha um ciclo, e nao inventa um", () => {
    eq(JSON.stringify(primeiroCiclo({ a: ["b"], b: ["a"] })), JSON.stringify(["a", "b", "a"]), "a -> b -> a");
    eq(JSON.stringify(primeiroCiclo({ a: ["b", "c"], b: ["c"], c: [] })), "null", "um diamante nao e ciclo");
  });

  test("sem-ciclos: os hooks e a `lib/` deles nao se importam em ciclo", () => {
    const ficheiros = [
      ...readdirSync(HOOKS).filter((n) => n.endsWith(".mjs")).map((n) => join(HOOKS, n)),
      ...readdirSync(join(HOOKS, "lib")).filter((n) => n.endsWith(".mjs")).map((n) => join(HOOKS, "lib", n)),
    ];
    const grafo = Object.fromEntries(ficheiros.map((f) => [f, importsDe(f)]));
    const ciclo = primeiroCiclo(grafo);
    eq(ciclo && ciclo.map((f) => relative(HOOKS, f)).join(" -> "), null, "ciclo de imports");
    // Sem isto o teste passava a ler zero imports — por exemplo, se o regex deixasse de casar.
    eq(grafo[join(HOOKS, "lib", "caminhos.mjs")].some((p) => p.endsWith("fronteira-dados.mjs")), true, "o caminhos.mjs le da folha");
  });
}
