/**
 * A SOMBRA do plano no portao `Guard Tests` (#347, C1), corrida como o runner a corre.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * Num PR com a varredura verde, o portao calcula o plano da varredura a partir do commit BASE (`lib/plano-ci.mjs`,
 * copiado sozinho) e exige que CONCORDE com o que os shards decidiram. Le-se o passo REAL do `ci.yml` (o
 * extractor do `tests-portao-ci.mjs`) e corre-se com `bash -e` num repo git de fixture com DOIS commits: a base ja
 * tem o `varredura-shards.mjs` e o `plano-ci.mjs` reais (os da arvore de trabalho), e o HEAD muda so o que cada
 * caso diz — por isso um caso "so docs" chega a `false`, e o plano que corre e o da base.
 *
 * As linhas `sombra: concorda` e `sombra: desligada` afirmam-se nos DOIS sentidos: a medicao do C2 le-as, e um
 * "desligada" contado como "concorda" provava o que nao aconteceu.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { passoDoPortao } from "./tests-portao-ci.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-portao-sombra.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const ISOLADO = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const PLANO = ".agent/scripts/lib/plano-ci.mjs";
const SHARDS = ".agent/scripts/lib/varredura-shards.mjs";
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
 * @returns {{code: number, out: string}}
 */
function corre(corpo, env, o) {
  const dir = mkdtempSync(join(tmpdir(), "portao-sombra-test-"));
  try {
    const repo = join(dir, "repo");
    const escreve = (rel, txt) => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), txt); };
    mkdirSync(repo);
    cpSync(join(ROOT, SHARDS), join(repo, SHARDS), { recursive: true });
    if (o.basePlano !== null) escreve(PLANO, o.basePlano);
    escreve(".agent/scripts/x.mjs", "export const x = 1;\n");
    escreve("src/docs/a.md", "# a\n");
    const git = (args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, stdio: "pipe", env: { ...process.env, ...ISOLADO } });
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
    relatorios(o.aplicavel).forEach((r, i) => writeFileSync(join(pasta, `r${i}.json`), JSON.stringify(r)));
    // Um `VARREDURA_PLANO` de quem corre os testes nao entra: e o caso que o `unset` do portao cobre, e o
    // `herdado` abaixo testa-o de proposito.
    const { VARREDURA_PLANO: _fora, ...semPlano } = process.env;
    try {
      const out = execFileSync("bash", ["-e", "-c", corpo], { cwd: repo, stdio: "pipe", env: { ...semPlano, ...ISOLADO, ...env, RUNNER_TEMP: dir } }).toString();
      return { code: 0, out };
    } catch (err) {
      return { code: typeof err.status === "number" ? err.status : -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PR = { SUITES: "success", VARREDURA: "success", EVENTO: "pull_request", PRIVADO: "false", COMMITTER: "" };
const CONCORDA = "sombra: concorda";
const DESLIGADA = "sombra: desligada";

export function registar() {
  const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
  const ci = lerRaiz(".github/workflows/ci.yml");
  const passo = ci === null ? null : passoDoPortao(ci);
  const temSombra = passo !== null && /VARREDURA_PLANO/.test(passo.corpo);
  // Um derivado que trouxe os scripts sem o portao novo (adotar e opcional): nada a testar aqui.
  if (!temSombra && ehDerivado(lerRaiz)) {
    console.log("  SKIP  portao: o ci.yml deste projeto nao tem a sombra do plano no portao `Guard Tests` (#347, opcional)");
    registarResultado("portao: sem a sombra num derivado, nada a medir (#347)", []);
    return;
  }
  registarResultado("portao: o shell do portao tem a sombra do plano (#347)", temSombra ? [] : ["o corpo do portao nao tem o `VARREDURA_PLANO`"]);
  if (!temSombra) return;
  const plano = lerRaiz(PLANO);
  const casos = [
    { nome: "maquinaria tocada e os shards mediram: verde, e concorda", env: PR, o: { head: "maquinaria", aplicavel: true, basePlano: plano }, verde: true, tem: `${CONCORDA} (plano=true)`, sem: DESLIGADA },
    { nome: "maquinaria tocada e os shards disseram \"nao aplicavel\": vermelho", env: PR, o: { head: "maquinaria", aplicavel: false, basePlano: plano }, verde: false },
    { nome: "so docs e os shards disseram \"nao aplicavel\": verde, e concorda", env: PR, o: { head: "docs", aplicavel: false, basePlano: plano }, verde: true, tem: `${CONCORDA} (plano=false)`, sem: DESLIGADA },
    { nome: "so docs e os shards mediram: vermelho", env: PR, o: { head: "docs", aplicavel: true, basePlano: plano }, verde: false },
    // O MESMO diff do `sweep` (com renomeacoes): o destino fora da maquinaria e o unico caminho listado.
    { nome: "um ficheiro renomeado para fora da maquinaria, \"nao aplicavel\": verde (o diff do `sweep`)", env: PR, o: { head: "renomeia", aplicavel: false, basePlano: plano }, verde: true, tem: `${CONCORDA} (plano=false)` },
    // O PR muda o seu proprio plano para "nunca": o portao le o da BASE, e a maquinaria tocada discorda.
    { nome: "o plano do PR mudado para \"nunca\" nao conta: le-se o da base (vermelho)", env: PR, o: { head: "maquinaria", aplicavel: false, basePlano: plano, headPlano: PLANO_NUNCA }, verde: false },
    { nome: "um plano que responde outra coisa que true/false: vermelho", env: PR, o: { head: "maquinaria", aplicavel: true, basePlano: PLANO_QUE_MENTE }, verde: false },
    { nome: "um HEAD sem pai: vermelho", env: PR, o: { semPai: true, aplicavel: true, basePlano: plano }, verde: false },
    { nome: "a base sem o plano: a sombra desliga-se, e di-lo", env: PR, o: { head: "docs", aplicavel: false, basePlano: null }, verde: true, tem: DESLIGADA, sem: CONCORDA },
    // Um `push` com a varredura verde (um derivado que tirou o `if:` do `sweep`): se o plano corresse, discordava.
    { nome: "um push com a varredura verde: sem plano, como antes", env: { ...PR, EVENTO: "push" }, o: { head: "maquinaria", aplicavel: false, basePlano: plano }, verde: true, sem: "sombra:" },
    // Um `VARREDURA_PLANO` herdado de cima (as duas leituras do C1): sem o `unset`, este push dizia "concorda".
    { nome: "um VARREDURA_PLANO herdado nao conta: o push continua sem sombra", env: { ...PR, EVENTO: "push", VARREDURA_PLANO: "false" }, o: { head: "maquinaria", aplicavel: false, basePlano: plano }, verde: true, sem: "sombra:" },
  ];
  // O `fetch-depth: 2` do checkout do portao: tira-lo dava vermelho no CI (o `HEAD^1`), mas nunca aqui (a fixture
  // tem a historia toda) — fica fixado pelo texto (leitura 1 do C1).
  const gate = ci.slice(ci.indexOf("\n  guard-gate:\n"), ci.indexOf("\n  simulators:\n"));
  registarResultado("portao: o checkout do portao traz a base (`fetch-depth: 2`) (#347)", /- uses: actions\/checkout@\S+\n\s+with:\n\s+fetch-depth: 2\n/.test(gate) ? [] : ["o checkout do `guard-gate` nao tem `fetch-depth: 2`"]);
  for (const c of casos) {
    const r = corre(passo.corpo, c.env, c.o);
    registarResultado(`portao: ${c.nome} (#347)`, [
      ...((r.code === 0) === c.verde ? [] : [`esperava ${c.verde ? "verde" : "vermelho"}, saiu ${r.code}: ${r.out.trim().split("\n").slice(-2).join(" | ")}`]),
      ...(c.tem && !r.out.includes(c.tem) ? [`faltou a linha "${c.tem}"`] : []),
      ...(c.sem && r.out.includes(c.sem) ? [`nao devia ter "${c.sem}"`] : []),
    ]);
  }
}
