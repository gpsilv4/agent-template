/**
 * O PASSO do plano da varredura no `guard-tests` (#347, C2), corrido como o runner o corre.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * O passo `Plano da varredura` decide se os shards do `sweep` arrancam: le o `lib/plano-ci.mjs` da BASE, corre-o sobre
 * o diff e escreve `aplica=true|false` no `$GITHUB_OUTPUT`. Tres coisas, cada uma com o seu controlo:
 *   - o PASSO, com `bash -e` num repo de fixture com base e HEAD: os nomes que o git poria entre aspas, as quebras de
 *     linha, a renomeacao, a base sem o plano, um plano que responde outra coisa, e fora de um PR;
 *   - a LIGACAO TEXTUAL ao portao (`TP8`): o passo e o portao leem a base com as mesmas linhas, letra a letra — se
 *     divergissem, o portao reprovava cada PR, ou aceitava um plano que nao e o seu;
 *   - a LIGACAO DOS OUTPUTS: o `if:` do `sweep`, o `outputs:` do `guard-tests`, o `id:` e a escrita do passo, e o
 *     `env:` do portao falam do mesmo output. O `outputs:` nao avisa no medidor da superficie (e cabecalho
 *     inofensivo, `superficie-gate.mjs`); quem o prende e isto, e o portao, que reprova um output vazio.
 * Num derivado sem o C2 (adotar e opcional) tudo diz SKIP; no template e exigido (`TP15`).
 */
import { pathToFileURL } from "url";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { passoDoCi, passoDoPortao } from "./tests-portao-ci.mjs";
import { fatiaDoJob, temPortaoC2 } from "./tests-portao-sombra.mjs";
import { correCorpo, gitEm } from "./harness/repo-descartavel.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-plano-passo.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const NOME = "Plano da varredura — os shards so arrancam quando se aplica";
const PLANO = ".agent/scripts/lib/plano-ci.mjs";

/** O que o HEAD acrescenta, por caso: um caminho (relativo ao repo) com o seu conteudo. */
const NOVOS = {
  maquinaria: ".agent/scripts/novo.mjs",
  docs: "src/docs/novo.md",
  // O git poe entre aspas um nome com `"`, `\` ou um caracter de controlo (o tab), qualquer que seja o `quotePath`.
  "aspas-docs": 'src/docs/a"b.md',
  "tab-docs": "src/docs/a\tb.md",
  "aspas-maquinaria": '.agent/scripts/a"b.mjs',
  // Uma quebra de linha no meio parte o nome em dois: o prefixo fica na primeira.
  "quebra-maquinaria": ".agent/scripts/a\nb.mjs",
  // A acabar numa quebra de linha: fica uma linha vazia no meio, que o plano recusa.
  "quebra-fim": "src/docs/a\n",
};

/**
 * Corre o `corpo` num repo com dois commits: a base com o plano (`o.basePlano`, `null` = sem ele) e o HEAD com o que
 * `o.head` diz ("renomeia" move um ficheiro da maquinaria para fora, com o conteudo identico).
 * @returns {{code: number, out: string, saida: string | null}} `saida`: o `$GITHUB_OUTPUT`, ou `null` se nao foi escrito
 */
function corre(corpo, evento, o) {
  const dir = mkdtempSync(join(tmpdir(), "plano-passo-test-"));
  try {
    const repo = join(dir, "repo");
    const escreve = (rel, txt) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), txt); };
    mkdirSync(repo);
    if (o.basePlano !== null) escreve(PLANO, o.basePlano);
    escreve(".agent/scripts/x.mjs", "export const x = 1;\n");
    escreve("src/docs/a.md", "# a\n");
    const git = gitEm(repo);
    git(["init", "-q"]);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "base"]);
    if (o.head === "renomeia") git(["mv", ".agent/scripts/x.mjs", "x-fora.mjs"]);
    else escreve(NOVOS[o.head], "novo\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "head"]);
    const saida = join(dir, "github-output");
    const r = correCorpo(corpo, { cwd: repo, env: { EVENTO: evento, GITHUB_OUTPUT: saida }, runnerTemp: dir });
    return { ...r, saida: existsSync(saida) ? readFileSync(saida, "utf8") : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** As linhas que leem a BASE, no passo e no portao: cada uma tem de existir UMA vez em cada, e igual (A4). */
// Tambem a linha que CORRE o plano e o `true` da base sem ele (leitura 1 do C2): sem elas, o portao a ler outro ficheiro
// (`tocados.z`) passava aqui e so ficava vermelho no CI.
const LINHAS_DA_BASE = [/^base=/, /^lista=/, /^plano=true$/, /^mkdir -p "\$RUNNER_TEMP\/plano"$/, /^git show /, /^git -c core\.quotePath=false diff /, /^tr /, /^plano="\$\(node /];
export function linhasQueDivergem(passo, portao) {
  const de = (corpo, re) => corpo.split("\n").map((l) => l.trim()).filter((l) => re.test(l));
  return LINHAS_DA_BASE.flatMap((re) => {
    const a = de(passo, re);
    const b = de(portao, re);
    if (a.length !== 1 || b.length !== 1) return [`a linha ${re} aparece ${a.length}x no passo e ${b.length}x no portao — esperava 1 em cada`];
    return a[0] === b[0] ? [] : [`o passo e o portao leem a base de forma diferente: \`${a[0]}\` / \`${b[0]}\``];
  });
}

/** O `if:` do `sweep`, o `outputs:` do `guard-tests`, o passo com o `id:`, a escrita e o `env:` do portao (A5). */
export function ligacaoDosOutputs(ci) {
  const x = /^    if:.*needs\.guard-tests\.outputs\.([\w-]+) == 'true'/m.exec(fatiaDoJob(ci, "sweep"))?.[1];
  if (!x) return ["o `if:` do job `sweep` nao le `needs.guard-tests.outputs.<x> == 'true'`"];
  const m = new RegExp(String.raw`\n    outputs:\n(?:      .*\n)*?      ${x}: \$\{\{ steps\.([\w-]+)\.outputs\.([\w-]+) \}\}\n`).exec(fatiaDoJob(ci, "guard-tests"));
  if (!m) return [`o \`guard-tests\` nao declara \`outputs: ${x}: \${{ steps.<id>.outputs.<y> }}\``];
  const [, id, y] = m;
  const passo = passoDoCi(ci, NOME);
  const problemas = [];
  if (!passo?.env.includes(`id: ${id}`)) problemas.push(`o passo do plano nao tem \`id: ${id}\` (o que o \`outputs:\` le)`);
  if (!new RegExp(String.raw`^echo "${y}=[^"]*" >> "\$GITHUB_OUTPUT"$`, "m").test(passo?.corpo ?? "")) problemas.push(`o passo do plano nao escreve \`${y}=\` no \`$GITHUB_OUTPUT\``);
  if (!passoDoPortao(ci)?.env.includes(`PLANO_JOB: \${{ needs.guard-tests.outputs.${x} }}`)) problemas.push(`o \`env:\` do portao nao le \`needs.guard-tests.outputs.${x}\``);
  return problemas;
}

export function registar() {
  const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
  const ci = lerRaiz(".github/workflows/ci.yml");
  const passo = ci === null ? null : passoDoCi(ci, NOME);
  if (passo === null && ehDerivado(lerRaiz)) {
    console.log("  SKIP  plano: o ci.yml deste projeto nao tem o passo do plano no `guard-tests` (#347 C2, opcional)");
    registarResultado("plano: sem o passo do plano num derivado, nada a medir (#347 C2)", []);
    return;
  }
  registarResultado("plano: o passo do plano existe no `guard-tests` e le-se (#347 C2)", passo === null ? [`nao encontrei o \`run: |\` do passo \`${NOME}\``] : []);
  if (passo === null) return;
  const plano = lerRaiz(PLANO);

  // --- O passo --------------------------------------------------------------------------------------------
  const PR = "pull_request";
  const casos = [
    { nome: "maquinaria tocada: aplica", o: { head: "maquinaria", basePlano: plano }, saida: "aplica=true\n" },
    { nome: "so docs: nao aplica", o: { head: "docs", basePlano: plano }, saida: "aplica=false\n" },
    { nome: "um ficheiro renomeado para fora da maquinaria: aplica (`--no-renames`)", o: { head: "renomeia", basePlano: plano }, saida: "aplica=true\n" },
    { nome: "um nome com `\"` fora da maquinaria: nao aplica", o: { head: "aspas-docs", basePlano: plano }, saida: "aplica=false\n" },
    { nome: "um nome com um tab fora da maquinaria: nao aplica", o: { head: "tab-docs", basePlano: plano }, saida: "aplica=false\n" },
    { nome: "um nome com `\"` na maquinaria: aplica (o `-z`)", o: { head: "aspas-maquinaria", basePlano: plano }, saida: "aplica=true\n", semZ: true },
    { nome: "um nome com uma quebra de linha na maquinaria: aplica", o: { head: "quebra-maquinaria", basePlano: plano }, saida: "aplica=true\n" },
    { nome: "um nome a acabar numa quebra de linha: vermelho, sem escrever", o: { head: "quebra-fim", basePlano: plano }, verde: false, diz: "linha vazia no meio" },
    { nome: "a base sem o plano: aplica tudo", o: { head: "docs", basePlano: null }, saida: "aplica=true\n" },
    { nome: "um plano da base que responde outra coisa: vermelho, sem escrever", o: { head: "maquinaria", basePlano: 'console.log("talvez");\n' }, verde: false, diz: "o plano da base respondeu" },
  ];
  for (const c of casos) {
    const r = corre(passo.corpo, PR, c.o);
    const verde = c.verde ?? true;
    registarResultado(`plano: o passo — ${c.nome} (#347 C2)`, [
      ...((r.code === 0) === verde ? [] : [`esperava ${verde ? "verde" : "vermelho"}, saiu ${r.code}: ${r.out.trim().split("\n").slice(-2).join(" | ")}`]),
      ...(verde ? (r.saida === c.saida ? [] : [`o $GITHUB_OUTPUT foi ${JSON.stringify(r.saida)}, esperava ${JSON.stringify(c.saida)}`]) : r.saida ? [`escreveu ${JSON.stringify(r.saida)} num vermelho`] : []),
      ...(c.diz && !r.out.includes(c.diz) ? [`o vermelho nao foi o esperado: faltou "${c.diz}"`] : []),
    ]);
    // O controlo do `-z`: sem ele, o git poe o nome entre aspas, a linha deixa de comecar pelo prefixo, e da `false`.
    // Ancorado ao `--no-renames -z` do diff: um `/ -z /` solto apanhava primeiro o `[ -z "$lista" ]` (medido: o
    // controlo invertia o teste da base e "provava" o que nao mudou).
    if (c.semZ) {
      const sem = passo.corpo.replace(" --no-renames -z ", " --no-renames ");
      const s = corre(sem, PR, c.o);
      registarResultado("plano: o passo sem o `-z` le um nome com `\"` na maquinaria como `false` (controlo)", sem !== passo.corpo && s.saida === "aplica=false\n" ? [] : [`o controlo deu ${JSON.stringify(s.saida)}: o caso nao prova o \`-z\``]);
    }
  }
  // Fora de um PR nao escreve nada (o `sweep` e so de PR, e salta). O controlo: o mesmo repo, num PR, escreve.
  const fora = corre(passo.corpo, "push", { head: "maquinaria", basePlano: plano });
  registarResultado("plano: o passo fora de um PR sai 0 sem escrever (#347 C2)", fora.code === 0 && fora.saida === null ? [] : [`saiu ${fora.code} e escreveu ${JSON.stringify(fora.saida)}`]);
  const dentro = corre(passo.corpo, PR, { head: "maquinaria", basePlano: plano });
  registarResultado("plano: o mesmo repo num PR escreve (controlo do caso de fora)", dentro.saida === "aplica=true\n" ? [] : [`escreveu ${JSON.stringify(dentro.saida)}`]);

  // --- A ligacao textual ao portao (A4) --------------------------------------------------------------------
  const portao = passoDoPortao(ci);
  if (!temPortaoC2(portao)) {
    registarResultado("plano: o passo tem o portao do C2 a recalcular o plano (#347 C2)", ["o passo do plano existe, e o portao nao le o `PLANO_JOB`: metade do C2 (cada PR sem maquinaria ficava vermelho)"]);
    return;
  }
  registarResultado("plano: o passo e o portao leem a base com as mesmas linhas (#347 C2, A4)", linhasQueDivergem(passo.corpo, portao.corpo));
  for (const [nome, de, para] of [
    ["a base lida doutra forma no portao", "HEAD^1)", "HEAD~1)"],
    ["o diff do portao sem o `--no-renames`", " --no-renames -z", " -z"],
    ["o `tr` do portao diferente", "tr '\\0' '\\n'", "tr -d '\\0'"],
    ["o portao a correr o plano sobre outro ficheiro", '"$RUNNER_TEMP/plano/tocados.txt")"', '"$RUNNER_TEMP/plano/tocados.z")"'],
    ["o portao com a base sem plano a dar outra coisa", "plano=true\n", "plano=false\n"],
  ]) {
    const m = portao.corpo.replace(de, para);
    registarResultado(`plano: ${nome} reprova (controlo, A4)`, m !== portao.corpo && linhasQueDivergem(passo.corpo, m).length > 0 ? [] : [`o controlo ${m === portao.corpo ? "nao mudou o corpo" : "passou"}`]);
  }

  // --- A ligacao dos outputs (A5) ----------------------------------------------------------------------------
  registarResultado("plano: o `if:` do `sweep`, o `outputs:`, o passo e o portao falam do mesmo output (#347 C2, A5)", ligacaoDosOutputs(ci));
  for (const [nome, de, para] of [
    ["outro output no `if:` do `sweep`", "needs.guard-tests.outputs.aplica == 'true'", "needs.guard-tests.outputs.x == 'true'"],
    ["o `outputs:` a ler outro passo", "steps.plano.outputs.aplica", "steps.outro.outputs.aplica"],
    ["o `outputs:` a ler outra chave", "steps.plano.outputs.aplica", "steps.plano.outputs.x"],
    ["o passo com outro `id:`", "        id: plano\n", "        id: outro\n"],
    ["o passo a escrever outra chave", 'echo "aplica=$plano" >> "$GITHUB_OUTPUT"', 'echo "x=$plano" >> "$GITHUB_OUTPUT"'],
    ["o portao a ler outro output", "PLANO_JOB: ${{ needs.guard-tests.outputs.aplica }}", "PLANO_JOB: ${{ needs.guard-tests.outputs.x }}"],
  ]) {
    const m = ci.replace(de, para);
    registarResultado(`plano: ${nome} reprova (controlo, A5)`, m !== ci && ligacaoDosOutputs(m).length > 0 ? [] : [`o controlo ${m === ci ? "nao mudou o ci.yml" : "passou"}`]);
  }
}
