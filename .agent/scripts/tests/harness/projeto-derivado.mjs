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
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { recongelarContexto } from "./recongelar-contexto.mjs";

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

/**
 * O ESTADO INVERSO: forcar a copia a parecer o template por estrear.
 *
 * Vive ao lado do `bootstrapado()` porque e o seu par — os dois montam um dos dois lados do
 * `ehDerivado()`, e uma fixture que queira afirmar sobre ambos precisa dos dois.
 *
 * PORQUE E PRECISO: uma sandbox construida a partir de um repo que JA e derivado herda o
 * marcador, e entao as assercoes sobre "o template nu" medem outra coisa. Aconteceu duas vezes:
 * ao Guard 21 (que so salta num derivado) e ao conjunto de `SKIP` congelado, onde o Guard 13
 * deixa de saltar e o 21 passa a saltar — nove dos dois lados, um trocado pelo outro, e a
 * assercao ficava vermelha so no `simulate-derived`. E o `TP3` na sua forma mais dificil de
 * ver, porque o teste passa aqui.
 *
 * Estava escrita dentro do `tests-context-virgem.mjs`. Copia-la para o segundo consumidor era
 * o `TP8` — duas copias da mesma receita a concordar a mao — dentro do ticket que existe para
 * tirar listas a mao do caminho.
 *
 * @param {string} dir  raiz da sandbox
 */
export function comoTemplate(dir) {
  try {
    rmSync(join(dir, ".agent/.template-version"));
  } catch {
    /* no template nu nao existe — e o estado que queremos */
  }
  if (!existsSync(join(dir, ".agent/BOOTSTRAP.md"))) {
    // Sem contagens: os guards 12d/12e comparam citacoes com a fonte, e um ficheiro que nao
    // cita nada nao acrescenta aviso nenhum. Escrever numeros aqui a mao era o que eles
    // existem para apanhar.
    mkdirSync(join(dir, ".agent"), { recursive: true });
    writeFileSync(join(dir, ".agent/BOOTSTRAP.md"), "# Bootstrap\n\nMontado pela fixture para negar o segundo sinal do `ehDerivado()`.\n");
  }
  recongelarContexto(dir);
}
