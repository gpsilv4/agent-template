/**
 * Montar, numa sandbox, o estado "bootstrap concluido" — {{PROJECT_NAME}}
 *
 * NAO e um entry point e nao corre testes: e um construtor de fixture.
 *
 * PORQUE EXISTE (TP8): esta receita estava escrita duas vezes, em duas suites, a concordar a
 * mao — o `tests-placeholders.mjs` chamava-lhe `bootstrapado()` e o `tests-context-virgem.mjs`
 * `derivado()`. As duas copias tinham a MESMA lista de extensoes, a MESMA regex de placeholder e
 * o MESMO marcador, e a lista ja divergiu uma vez na historia deste repo: faltava o `.mdc` nas
 * duas, e a regra do Cursor ficava com o placeholder para sempre. Tres sitios tinham de
 * concordar (as duas suites e a Fase 2.1 do `BOOTSTRAP.md`); agora sao dois.
 *
 * AS DUAS COISAS ANDAM JUNTAS, e e o ponto todo da funcao: escrever o marcador sozinho liga o
 * Guard 13 numa fixture que ainda tem `{{ ... }}` por todo o lado, e o teste falha por avisos de
 * placeholders que nada tem a ver com o que afirma. Um derivado a serio ja os substituiu.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

/** Os tipos que a Fase 2.1 do `BOOTSTRAP.md` manda varrer. Se esta lista ficar curta, sobram
 *  placeholders — e e exactamente o defeito que ja aconteceu com o `.mdc`. */
const SUBSTITUIVEIS = /\.(md|mdc|mjs|json|yml|toml)$/;
const SEM_EXTENSAO = new Set(["LICENSE", "CODEOWNERS"]);

/**
 * Substitui todos os placeholders da sandbox e escreve `.agent/.template-version`.
 *
 * O literal de um placeholder NAO se escreve aqui — nem sequer num comentario. A Fase 2.1 do
 * bootstrap varre os `.mjs` e substituia-o, logo esta frase passava a dizer disparate em todos
 * os projetos derivados. O `simulate-upgrade.mjs` reprova quem o faca, e foi ele que apanhou
 * esta linha.
 *
 * @param {string} dir  raiz da sandbox
 * @param {string} [valor="VALOR"]  o que substitui cada placeholder
 */
export function bootstrapado(dir, valor = "VALOR") {
  const anda = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const sub = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        anda(sub);
        continue;
      }
      if (!SUBSTITUIVEIS.test(e.name) && !SEM_EXTENSAO.has(e.name) && !sub.startsWith(".githooks/")) continue;
      const c = readFileSync(join(dir, sub), "utf8");
      // `(?!args\})`: o `{{args}}` dos command templates do Gemini nao e um placeholder do
      // bootstrap. Estava nas duas copias, e e o tipo de detalhe que uma delas perderia.
      const novo = c.replace(/\{\{(?!args\})[A-Z_]+\}\}/g, valor);
      if (novo !== c) writeFileSync(join(dir, sub), novo);
    }
  };
  anda("");
  const marca = join(dir, ".agent/.template-version");
  mkdirSync(dirname(marca), { recursive: true });
  writeFileSync(marca, "sha: abc1234\nversao: v0.3.0\n");
}
