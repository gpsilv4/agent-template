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
 *
 * ## O QUE ESTA FIXTURE **NAO** MONTA, e vale saber antes de confiar nela
 *
 * As duas rules que o bootstrap **gera** — `business-logic.md` e `pages-architecture.md` — ficam
 * **ausentes**. A Fase 2 do `BOOTSTRAP.md` escreve-as a partir das respostas do projeto, e isso
 * exigia inventar conteudo de dominio; aqui so se substituem placeholders no que ja existe.
 *
 * A consequencia e concreta e ja mordeu uma medicao: o orcamento de contexto de um projeto
 * derivado **nao se pode medir por aqui**. Medido com esta fixture da 32 028 bytes — MENOS do
 * que o template nu (32 312), porque os placeholders encolhem ao ser substituidos — e o numero
 * parece tranquilizador exactamente por lhe faltarem as duas rules que o inflam. As duas passam
 * pelo mesmo tecto de 12 000 das rules obrigatorias (`guards/budgets.mjs`), logo o pior caso
 * conforme de um derivado sao ~56 KB por sessao, e nao 32.
 *
 * Fica escrito aqui, e nao so no issue, porque quem usar esta fixture para medir orcamento vai
 * obter um numero que parece uma resposta.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { recongelarContexto } from "./recongelar-contexto.mjs";
import { PRISTINOS } from "../../guards/context-virgem.mjs";

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
    // Cita o numero de workflows, DERIVADO do disco e nao escrito a mao. O de um template real
    // cita-o, e num template ZERO citacoes e aviso do 12e. Sem ela, um derivado que substituiu o
    // `README` (a §2.7 manda-o, e era a outra citacao) ficava aqui com um aviso que nao e do teste
    // — medido no `simulate-derived` (#177).
    const n = existsSync(join(dir, ".agent/workflows")) ? readdirSync(join(dir, ".agent/workflows")).filter((f) => f.endsWith(".md")).length : 0;
    mkdirSync(join(dir, ".agent"), { recursive: true });
    writeFileSync(join(dir, ".agent/BOOTSTRAP.md"), `# Bootstrap\n\nMontado pela fixture para negar o segundo sinal do \`ehDerivado()\`. O template traz ${n} workflows.\n`);
  }
  // O `.agent/context/` de um template so tem o andaime. Um derivado tem la ficheiros SEUS (um
  // `backlog-detail.md`), e deixa-los punha o Guard 21 a acusar "sem entrada em PRISTINOS" numa
  // fixture que diz montar um template (R7-F, #177). Sai o que nao e andaime.
  const ctx = join(dir, ".agent/context");
  if (existsSync(ctx)) {
    for (const f of readdirSync(ctx, { recursive: true, withFileTypes: true })) {
      const rel = `.agent/context/${join(f.parentPath ?? f.path, f.name).slice(ctx.length + 1)}`;
      if (f.isFile() && !(rel in PRISTINOS)) rmSync(join(dir, rel));
    }
  }
  recongelarContexto(dir);
}
