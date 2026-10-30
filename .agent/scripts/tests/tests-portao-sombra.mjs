/**
 * O PLANO da varredura no portao `Guard Tests` (#347; C1 em sombra, C2 em vigor desde o #393), corrido como o runner o corre.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`. (O nome ficou o do C1: mudar
 * o nome de um modulo de suite e uma mudanca de superficie que nao compra nada.)
 *
 * No C2 os shards so arrancam quando o plano da base diz que a varredura se aplica (o passo `plano` do `guard-tests`
 * escreve-o, o `if:` do `sweep` le-o). O portao e a AUTORIDADE: recalcula o plano a partir do commit BASE
 * (`lib/plano-ci.mjs`, copiado sozinho), exige o output do job IGUAL ao seu, e com `false` o `sweep` saltado, com
 * `true` o `sweep` verde e todos os shards medidos. Le-se o passo REAL do `ci.yml` (o extractor do
 * `tests-portao-ci.mjs`) e corre-se com `bash -e` (e um caso SEM o `-e`, #372) num repo git de fixture com DOIS
 * commits: a base ja tem o `varredura-shards.mjs` e o `plano-ci.mjs` reais (os da arvore de trabalho), e o HEAD muda
 * so o que cada caso diz — por isso um caso "so docs" chega a `false`, e o plano que corre e o da base.
 *
 * As linhas `plano: ...` afirmam-se: a medicao do salto (um PR sem maquinaria, antes da tag) le-as.
 */
import { pathToFileURL } from "url";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { delimiter, dirname, join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { passoDoPortao } from "./tests-portao-ci.mjs";
import { PLANO_JOB_DO_PORTAO } from "../lib/marcas-yaml.mjs";
import { jobsDe, passosDe } from "../lib/estrutura-workflow.mjs";
import { correCorpo, gitEm, gitQueTraduz, traduzida } from "./harness/repo-descartavel.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-portao-sombra.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const PLANO = ".agent/scripts/lib/plano-ci.mjs";
const SHARDS = ".agent/scripts/lib/varredura-shards.mjs";
/** O que o `varredura-shards` importa (#373): a fixture copia-o com ele, senao cada caso rebentava no import. */
const EH_MAIN = ".agent/scripts/lib/eh-main.mjs";
/** Um plano que responde sempre `false` (o PR a tentar mudar a regra), e um que responde outra coisa. */
const PLANO_NUNCA = 'console.log("false");\n';
const PLANO_QUE_MENTE = 'console.log("talvez");\n';

/** Os relatorios dos 3 shards: todos aplicaveis, com as contas certas, ou todos "nao aplicavel". */
function relatorios(aplicavel) {
  const r = (modo, k, n, total, medidos) => (aplicavel ? { modo, k, n, total, medidos, aplicavel } : { modo, k, n, aplicavel });
  return [r("completa", 1, 2, 10, 6), r("completa", 2, 2, 10, 4), r("skips", 1, 1, 3, 3)];
}

/**
 * Corre o `corpo` num repo de fixture. `o.head`: o que o HEAD muda — "maquinaria", "docs", "renomeia" (com o
 * conteudo identico, para a deteccao de renomeacoes do git disparar), ou nada (`semPai`: so um commit).
 * `o.basePlano`: o conteudo do plano na base (`null` = a base nao o tem); `o.headPlano`: o do HEAD, se mudar.
 * `o.aplicavel`: os relatorios dos shards (`undefined` = nenhum, o `sweep` saltou).
 * @returns {{code: number, out: string}}
 */
function corre(corpo, env, o, { semE = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "portao-sombra-test-"));
  try {
    const repo = join(dir, "repo");
    const escreve = (rel, txt) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), txt); };
    mkdirSync(repo);
    cpSync(join(ROOT, SHARDS), join(repo, SHARDS), { recursive: true });
    cpSync(join(ROOT, EH_MAIN), join(repo, EH_MAIN));
    if (o.basePlano !== null) escreve(PLANO, o.basePlano);
    escreve(".agent/scripts/x.mjs", "export const x = 1;\n");
    escreve("src/docs/a.md", "# a\n");
    const git = gitEm(repo);
    git(["init", "-q"]);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "base"]);
    if (!o.semPai) {
      if (o.head === "maquinaria") escreve(".agent/scripts/x.mjs", "export const x = 2;\n");
      if (o.head === "docs") escreve("src/docs/a.md", "# a, mudado\n");
      if (o.head === "renomeia") git(["mv", ".agent/scripts/x.mjs", "x-fora.mjs"]);
      if (o.headPlano !== undefined) escreve(PLANO, o.headPlano);
      git(["add", "-A"]);
      git(["commit", "-q", "-m", "head"]);
    }
    const pasta = join(dir, "varredura");
    mkdirSync(pasta);
    if (o.aplicavel !== undefined) relatorios(o.aplicavel).forEach((r, i) => writeFileSync(join(pasta, `r${i}.json`), JSON.stringify(r)));
    // Um `VARREDURA_PLANO` de quem corre os testes nao entra: e o caso que o `unset` do portao cobre, e o
    // `herdado` abaixo testa-o de proposito.
    return correCorpo(corpo, { cwd: repo, env, runnerTemp: dir, semE, semVars: ["VARREDURA_PLANO"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Um PR com a varredura a correr (plano `true` no job e shards verdes), e um em que ela saltou (plano `false`). */
const PR = { SUITES: "success", VARREDURA: "success", PLANO_JOB: "true", EVENTO: "pull_request", PRIVADO: "false", COMMITTER: "" };
const PR_SALTOU = { ...PR, VARREDURA: "skipped", PLANO_JOB: "false" };
/** O texto do job `id` do `ci.yml`, ate ao job SEGUINTE, qualquer que seja (#372 A8, `TP15`): ate ao `simulators:`
 *  assumia a ordem do template, e num derivado (sem esse job) ia ate ao fim do ficheiro. Sem o job: `""`. */
export function fatiaDoJob(ci, id) {
  const ini = ci.indexOf(`\n  ${id}:\n`);
  if (ini < 0) return "";
  const prox = ci.slice(ini + 1).search(/\n  [\w-]+:[ \t]*(?:#.*)?\n/);
  return prox < 0 ? ci.slice(ini) : ci.slice(ini, ini + 1 + prox);
}

/** O `actions/checkout` do `guard-gate` traz a base (`fetch-depth: 2`)? `null` se sim, senao a razao. Pelo leitor de
 *  jobs e passos do gate (#400): uma regex sobre o texto dizia "nao tem" de um SHA com comentario, de outra chave antes,
 *  de um comentario depois, ou do `name:` antes do `uses:`. Os passos em flow nao se leem, e isso reprova (`TP2`). */
export function checkoutTrazBase(ci) {
  const job = jobsDe(ci).find((j) => j.id === "guard-gate");
  if (!job) return "nao encontrei o job `guard-gate`";
  const passos = passosDe(job.ls);
  if (passos === null) return "nao consegui ler os passos do `guard-gate` (em flow)";
  const checkout = passos.find((p) => p.ls.some((l) => /^[ \t]*(?:-[ \t]+)?uses:[ \t]*actions\/checkout@/.test(l)));
  if (!checkout) return "o `guard-gate` nao tem o passo do `actions/checkout`";
  return checkout.ls.some((l) => /^[ \t]*fetch-depth:[ \t]*2[ \t]*$/.test(l)) ? null : "o checkout do `guard-gate` nao tem `fetch-depth: 2`";
}

/** Cada vermelho afirma-se pela SUA mensagem (#372 A4): so o exit deixava passar um vermelho por outra razao. */
const DISCORDA = "decidiu o contrario";
const OUTRO_PLANO = "os shards decidiram por outro plano";
const NAO_SALTOU = "e o `sweep` nao saltou";
const NAO_PASSOU = "a varredura de mutacao nao passou (pull_request): skipped";
const APLICA = "plano: aplica (plano=true)";
const NAO_APLICA = "plano: nao aplicavel (plano=false)";
const SEM_PLANO = "plano: a base nao tem o plano (aplica tudo)";
/** A linha que faz o `varredura-shards` conferir o plano (N2): os controlos tiram-na. */
const EXPORTA = /^[ \t]*export VARREDURA_PLANO=true\n/m;

/** O portao do C2 reconhece-se pelo output do job no `env:` (o `VARREDURA_PLANO` tambem estava no C1). */
export const temPortaoC2 = (passo) => passo !== null && passo.env.some((l) => PLANO_JOB_DO_PORTAO.test(l));

export function registar() {
  const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
  const ci = lerRaiz(".github/workflows/ci.yml");
  const passo = ci === null ? null : passoDoPortao(ci);
  // Um derivado que trouxe os scripts sem o portao novo (adotar e opcional): nada a testar aqui (`TP15`).
  if (!temPortaoC2(passo) && ehDerivado(lerRaiz)) {
    console.log("  SKIP  portao: o ci.yml deste projeto nao tem o plano da varredura no portao `Guard Tests` (#347 C2, opcional)");
    registarResultado("portao: sem o plano num derivado, nada a medir (#347)", []);
    return;
  }
  registarResultado("portao: o portao le o plano do job (`PLANO_JOB`) no `env:` (#347 C2)", temPortaoC2(passo) ? [] : ["o `env:` do portao nao tem `PLANO_JOB: ${{ needs.guard-tests.outputs.aplica }}`"]);
  registarResultado("portao: o discriminador do C2 reprova um `env:` sem o output, ou com outro (controlo)", [
    ...(temPortaoC2({ env: ["VARREDURA: ${{ needs.sweep.result }}"] }) ? ["um portao sem `PLANO_JOB` passou por C2"] : []),
    ...(temPortaoC2({ env: ["PLANO_JOB: ${{ needs.guard-tests.outputs.x }}"] }) ? ["um `PLANO_JOB` de outro output passou"] : []),
    // A forma unica (#400): um comentario YAML conta; um `#` colado e uma cauda sao outro valor.
    ...(temPortaoC2({ env: ["PLANO_JOB: ${{ needs.guard-tests.outputs.aplica }} # o plano"] }) ? [] : ["um `PLANO_JOB` com um comentario nao contou"]),
    ...(temPortaoC2({ env: ["PLANO_JOB: ${{ needs.guard-tests.outputs.aplica }}#x"] }) ? ["um `PLANO_JOB` com um `#` colado (valor, nao comentario) passou"] : []),
  ]);
  if (!temPortaoC2(passo)) return;
  const plano = lerRaiz(PLANO);
  const casos = [
    { nome: "maquinaria tocada e os shards mediram: verde, e diz que aplica", env: PR, o: { head: "maquinaria", aplicavel: true, basePlano: plano }, verde: true, tem: APLICA },
    // N2: com o plano `true`, um `sweep` verde com todos os relatorios "nao aplicavel" nao mediu nada (`TP2`).
    { nome: "plano true e os shards todos \"nao aplicavel\": vermelho (N2)", env: PR, o: { head: "maquinaria", aplicavel: false, basePlano: plano }, verde: false, diz: DISCORDA, controlo: true },
    { nome: "so docs e o `sweep` saltou: verde, e diz que nao se aplica", env: PR_SALTOU, o: { head: "docs", basePlano: plano }, verde: true, tem: NAO_APLICA },
    { nome: "so docs e o `sweep` correu: vermelho", env: { ...PR, PLANO_JOB: "false" }, o: { head: "docs", aplicavel: true, basePlano: plano }, verde: false, diz: NAO_SALTOU },
    { nome: "maquinaria tocada e o `sweep` saltou: vermelho", env: { ...PR, VARREDURA: "skipped" }, o: { head: "maquinaria", basePlano: plano }, verde: false, diz: NAO_PASSOU },
    // O output do job perdido (um re-run parcial, um `id` errado, um `outputs:` mal escrito) chega vazio (A1).
    { nome: "o output do job vazio: vermelho", env: { ...PR, PLANO_JOB: "" }, o: { head: "maquinaria", aplicavel: true, basePlano: plano }, verde: false, diz: OUTRO_PLANO },
    // O caso que o C2 tem de apanhar: o job disse `false` (os shards saltaram) e a base diz `true`.
    { nome: "o job diz false e a base diz true: vermelho", env: PR_SALTOU, o: { head: "maquinaria", basePlano: plano }, verde: false, diz: OUTRO_PLANO },
    // `--no-renames` (A2 da v2): o caminho antigo, dentro da maquinaria, entra no diff. No C1 este caso era verde com `false`.
    { nome: "um ficheiro renomeado para fora da maquinaria: aplica", env: PR, o: { head: "renomeia", aplicavel: true, basePlano: plano }, verde: true, tem: APLICA, renomes: true },
    // O PR muda o seu proprio plano para "nunca": o portao le o da BASE.
    { nome: "o plano do PR mudado para \"nunca\" nao conta: le-se o da base (vermelho)", env: PR_SALTOU, o: { head: "maquinaria", basePlano: plano, headPlano: PLANO_NUNCA }, verde: false, diz: OUTRO_PLANO },
    { nome: "um plano que responde outra coisa que true/false: vermelho", env: PR, o: { head: "maquinaria", aplicavel: true, basePlano: PLANO_QUE_MENTE }, verde: false, diz: "o plano da base respondeu" },
    // O texto do git DERIVA-SE (#400, `TP8`): fixo, dependia da lingua e da versao do git.
    { nome: "um HEAD sem pai: vermelho", env: PR, o: { semPai: true, aplicavel: true, basePlano: plano }, verde: false, dizDoGit: true },
    { nome: "a base sem o plano e os shards mediram: verde, e di-lo", env: PR, o: { head: "docs", aplicavel: true, basePlano: null }, verde: true, tem: SEM_PLANO },
    // A5 da 3.a passagem: o buraco do N2 pelo ramo da base sem plano.
    { nome: "a base sem o plano e os shards todos \"nao aplicavel\": vermelho (A5)", env: PR, o: { head: "docs", aplicavel: false, basePlano: null }, verde: false, diz: DISCORDA, controlo: true },
    { nome: "a base sem o plano e o `sweep` saltou: vermelho", env: { ...PR, VARREDURA: "skipped" }, o: { head: "docs", basePlano: null }, verde: false, diz: NAO_PASSOU },
    // Um `push` com a varredura verde (um derivado que varre no push): sem plano, como antes.
    { nome: "um push com a varredura verde: sem plano, como antes", env: { ...PR, EVENTO: "push", PLANO_JOB: "" }, o: { head: "maquinaria", aplicavel: true, basePlano: plano }, verde: true, sem: "plano:" },
    // Um `VARREDURA_PLANO=false` herdado de cima: sem o `unset`, o `varredura-shards` reprovava os relatorios que mediram.
    { nome: "um VARREDURA_PLANO herdado nao conta: o push continua verde", env: { ...PR, EVENTO: "push", PLANO_JOB: "", VARREDURA_PLANO: "false" }, o: { head: "maquinaria", aplicavel: true, basePlano: plano }, verde: true, sem: "plano:" },
    { nome: "um push com a varredura saltada: verde", env: { ...PR, EVENTO: "push", PLANO_JOB: "", VARREDURA: "skipped" }, o: { head: "maquinaria", basePlano: plano }, verde: true, sem: "plano:" },
  ];
  // O `fetch-depth: 2` do checkout do portao: tira-lo dava vermelho no CI (o `HEAD^1`), mas nunca aqui (a fixture
  // tem a historia toda) — fica fixado pelo texto (leitura 1 do C1).
  // O controlo da fatia: num `ci.yml` sem `simulators` (a forma de um derivado), o `fetch-depth` do job SEGUINTE nao
  // pode contar como o do `guard-gate` — a fatia antiga, ate ao `simulators:`, ia ate ao fim e encontrava-o.
  const sintetico = "jobs:\n  guard-gate:\n    steps:\n      - uses: actions/checkout@v7\n  secret-scan:\n    steps:\n      - uses: actions/checkout@v7\n        with:\n          fetch-depth: 2\n";
  registarResultado("portao: a fatia do `guard-gate` acaba no job seguinte, sem `simulators` (#372)", [
    ...(/fetch-depth/.test(fatiaDoJob(sintetico, "guard-gate")) ? ["a fatia apanhou o `fetch-depth` do job seguinte"] : []),
    ...(checkoutTrazBase(sintetico) === null ? ["o leitor do checkout apanhou o `fetch-depth` do job seguinte"] : []),
  ]);
  { const p = checkoutTrazBase(ci); registarResultado("portao: o checkout do portao traz a base (`fetch-depth: 2`) (#347)", p === null ? [] : [p]); }
  // As formas que a regex antiga lia mal (#400): um SHA com comentario (a do Dependabot), outra chave antes, um
  // comentario depois, e o `name:` antes do `uses:` passam; um checkout sem a base, ou com ela noutro passo, nao.
  {
    const job = (passos) => `jobs:\n  guard-gate:\n    steps:\n${passos}  outro:\n    steps:\n      - run: x\n`;
    const COM = "        with:\n          fetch-depth: 2\n";
    const passam = {
      "um SHA com comentario": `      - uses: actions/checkout@0123abcd # v7\n${COM}`,
      "outra chave antes": "      - uses: actions/checkout@v7\n        with:\n          persist-credentials: false\n          fetch-depth: 2\n",
      "um comentario depois": "      - uses: actions/checkout@v7\n        with:\n          fetch-depth: 2 # a base\n",
      "o `name:` antes do `uses:`": `      - name: Checkout\n        uses: actions/checkout@v7\n${COM}`,
    };
    const reprovam = {
      "sem `fetch-depth`": "      - uses: actions/checkout@v7\n",
      "`fetch-depth: 1`": "      - uses: actions/checkout@v7\n        with:\n          fetch-depth: 1\n",
      "o `fetch-depth: 2` noutro passo": `      - uses: actions/checkout@v7\n      - uses: actions/setup-node@v4\n${COM}`,
    };
    // Os passos em flow na linha do `steps:` (a forma que o `passosDe` nao le): reprova, e pela razao certa.
    const flow = checkoutTrazBase("jobs:\n  guard-gate:\n    steps: [ { uses: actions/checkout@v7, with: { fetch-depth: 2 } } ]\n  outro:\n    steps:\n      - run: x\n");
    registarResultado("portao: o checkout le-se pelos passos do job: as formas certas passam, as outras reprovam (#400)", [
      ...Object.entries(passam).filter(([, t]) => checkoutTrazBase(job(t)) !== null).map(([n, t]) => `${n}: ${checkoutTrazBase(job(t))}`),
      ...Object.entries(reprovam).filter(([, t]) => checkoutTrazBase(job(t)) === null).map(([n]) => `${n} passou`),
      ...(flow?.includes("em flow") ? [] : [`os passos em flow: ${flow ?? "passaram"}`]),
    ]);
  }
  const veredicto = (r, c) => [
    ...((r.code === 0) === c.verde ? [] : [`esperava ${c.verde ? "verde" : "vermelho"}, saiu ${r.code}: ${r.out.trim().split("\n").slice(-2).join(" | ")}`]),
    ...(c.tem && !r.out.includes(c.tem) ? [`faltou a linha "${c.tem}"`] : []),
    ...(c.sem && r.out.includes(c.sem) ? [`nao devia ter "${c.sem}"`] : []),
    ...(c.diz && !r.out.includes(c.diz) ? [`o vermelho nao foi o esperado: faltou "${c.diz}"`] : []),
  ];
  // O que o git DIZ, perguntado ao mesmo git: o comando lido do corpo (se o portao passar a outra forma, reprova aqui
  // a dize-lo, e nao continua a perguntar pela antiga), corrido no mesmo repo e com o mesmo `env`. Tem de falhar e
  // dizer alguma coisa: uma linha vazia estava contida em qualquer saida (`TP2`).
  const doGit = (c) => {
    const cmd = /\bgit rev-parse --verify HEAD\^1(?=\))/.exec(passo.corpo)?.[0];
    if (!cmd) return { erro: "nao encontrei o `git rev-parse --verify HEAD^1` no corpo do portao" };
    const r = corre(cmd, c.env, c.o);
    const linha = r.out.trim().split("\n")[0] ?? "";
    return r.code !== 0 && linha.trim() !== "" ? { linha } : { erro: `o comando derivado saiu ${r.code}, a dizer "${linha}"` };
  };
  for (const c of casos) {
    const d = c.dizDoGit ? doGit(c) : null;
    registarResultado(`portao: ${c.nome} (#347)`, [...(d?.erro ? [d.erro] : []), ...veredicto(corre(passo.corpo, c.env, c.o), d?.linha ? { ...c, diz: d.linha } : c)]);
    // O CONTROLO da lingua (#400): com um git que traduz, o texto derivado continua a casar, e o antigo (fixo) nao.
    if (c.dizDoGit) {
      const pasta = mkdtempSync(join(tmpdir(), "portao-sombra-test-"));
      try {
        const falso = gitQueTraduz(pasta);
        const env = { ...c.env, PATH: `${falso}${delimiter}${process.env.PATH}` };
        const t = falso === null ? { erro: "nao encontrei o git no PATH para o falso o chamar" } : doGit({ ...c, env });
        const r = corre(passo.corpo, env, c.o);
        registarResultado("portao: com um git que traduz, o texto derivado casa e o literal antigo nao (controlo, #400)", [
          ...(t.erro ? [t.erro] : []),
          ...(t.linha && r.code !== 0 && r.out.includes(t.linha) ? [] : ["o vermelho nao trouxe a frase do git traduzido"]),
          ...(t.linha && traduzida(t.linha) ? [] : [`o git falso nao traduziu ("${t.linha ?? ""}"): o controlo nao mede nada`]),
        ]);
      } finally {
        rmSync(pasta, { recursive: true, force: true });
      }
    }
    // Os CONTROLOS medidos: sem o `export VARREDURA_PLANO=true`, os relatorios "nao aplicavel" passavam (o N2 e o
    // A5 provam a linha); sem o `--no-renames`, a renomeacao para fora da maquinaria dava `false` e outro plano.
    if (c.controlo) {
      const sem = passo.corpo.replace(EXPORTA, "");
      const r = corre(sem, c.env, c.o);
      registarResultado(`portao: o mesmo sem o \`export VARREDURA_PLANO=true\` fica verde (controlo) — ${c.nome}`, sem !== passo.corpo && r.code === 0 ? [] : [`o controlo saiu ${r.code}${sem === passo.corpo ? " (o corpo nao tem a linha)" : ""}: o caso nao prova o export`]);
    }
    if (c.renomes) {
      const sem = passo.corpo.replace(/ --no-renames/g, "");
      const r = corre(sem, c.env, c.o);
      registarResultado("portao: o mesmo sem o `--no-renames` reprova por outro plano (controlo)", sem !== passo.corpo && r.code !== 0 && r.out.includes(OUTRO_PLANO) ? [] : [`o controlo saiu ${r.code}: o caso nao prova o \`--no-renames\``]);
    }
  }

  // O portao falha fechado POR SI (#372 A2): um `defaults: run: shell:` sem `-e` num derivado punha-o verde com
  // os shards a reprovar. Corre-se SEM o `-e` do runner, e o controlo tira a primeira linha (o `set -eu`) e tem
  // de ficar verde — senao o caso nao mede nada.
  const SET = /^set -eu\n/;
  const vermelho = { head: "maquinaria", aplicavel: false, basePlano: plano };
  const r = corre(passo.corpo, PR, vermelho, { semE: true });
  registarResultado("portao: sem o `-e` do runner, os shards \"nao aplicavel\" com o plano true continuam vermelhos (#372)", [
    ...(SET.test(passo.corpo) ? [] : ["o corpo do portao nao abre com `set -eu`"]),
    ...(r.code !== 0 && r.out.includes(DISCORDA) ? [] : [`esperava vermelho com "${DISCORDA}", saiu ${r.code}`]),
  ]);
  const semSet = corre(passo.corpo.replace(SET, ""), PR, vermelho, { semE: true });
  registarResultado("portao: o mesmo corpo sem o `set -eu` e sem o `-e` fica verde (controlo, #372)", semSet.code === 0 ? [] : [`o controlo saiu ${semSet.code}: o caso acima nao prova o \`set -eu\``]);
}
