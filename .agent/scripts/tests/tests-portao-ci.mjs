/**
 * O SHELL do portao `Guard Tests` do `ci.yml` (#347, PR B), corrido como o runner o corre.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * O `if:` de job do `guard-tests` deixa saltar as suites no push de um merge num repo PRIVADO. O portao
 * nao confia nesse `if:`: recalcula o salto no seu shell, e reprova qualquer outro `skipped`. Se o
 * recalculo partir — ou o `if:` for alargado num PR futuro —, um push ficava verde sem medir nada (`TP2`).
 * Por isso le-se o passo REAL do `ci.yml` (e nao uma copia), e corre-se com `bash -e`, como o runner, para
 * cada combinacao do evento. A mensagem do merge passa pelo `.githooks/commit-msg` real.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-portao-ci.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const PASSO = "      - name: Suites e varredura verdes, e todos os shards mediram";

/** O passo do portao: as linhas entre o `- name:` e o `run: |` (o `env:`) e o corpo do `run: |` sem a
 *  indentacao — ou `null` se o passo nao existir. */
export function passoDoPortao(ci) {
  const ls = ci.split(/\r?\n/);
  const i = ls.indexOf(PASSO);
  if (i < 0) return null;
  const r = ls.findIndex((l, j) => j > i && /^        run: \|$/.test(l));
  if (r < 0 || ls.slice(i + 1, r).some((l) => /^      - /.test(l))) return null;
  const corpo = [];
  for (let k = r + 1; k < ls.length && (ls[k] === "" || /^          /.test(ls[k])); k++) corpo.push(ls[k].slice(10));
  return { env: ls.slice(i + 1, r).map((l) => l.trim()), corpo: corpo.join("\n") };
}

/** O `env:` que o shell le tem de vir dos campos certos do evento: um `author` no lugar do `committer`, ou o
 *  `PRIVADO` de outro campo, passava os casos do shell (que injectam os valores). */
const ENV_DO_PORTAO = [
  "PRIVADO: ${{ github.event.repository.private }}",
  "COMMITTER: ${{ github.event.head_commit.committer.username }}",
  "EVENTO: ${{ github.event_name }}",
  "SUITES: ${{ needs.guard-tests.result }}",
  "VARREDURA: ${{ needs.sweep.result }}",
];
/** O ramo do salto (#347, PR B). Um derivado que trouxe os scripts pelo `/upgrade` sem adotar o salto (e
 *  OPCIONAL) tem o portao antigo: ai nao ha nada a testar, e o teste diz SKIP em vez de reprovar. */
const RAMO_DO_SALTO = /if \[ "\$SUITES" = skipped \]; then/;

const LIMPA = "Merge pull request #93 from dono/fix/x\n\nfix(x): corrige y\n";
const COM_IA = `${LIMPA}\nCo-Authored-By: Claude <noreply@anthropic.com>\n`;
/** O push de um merge num privado: o caso que pode saltar. Cada caso de salto muda UMA condicao (o "vazio"
 *  e o contexto que falta, de proposito duas). */
const MERGE = { SUITES: "skipped", VARREDURA: "skipped", EVENTO: "push", PRIVADO: "true", COMMITTER: "web-flow" };

const CASOS = [
  { nome: "o push de um merge num privado, com a mensagem limpa, passa", env: MERGE, msg: LIMPA, verde: true },
  { nome: "o push de um merge num privado com atribuicao a IA reprova", env: MERGE, msg: COM_IA, verde: false },
  // So o evento muda: sem isto, apagar a condicao do evento passava (o `COMMITTER` vazio ja reprovava).
  { nome: "suites saltadas num PR reprovam", env: { ...MERGE, EVENTO: "pull_request" }, msg: LIMPA, verde: false },
  { nome: "suites saltadas num repo publico reprovam", env: { ...MERGE, PRIVADO: "false" }, msg: LIMPA, verde: false },
  { nome: "suites saltadas num push directo (outro committer) reprovam", env: { ...MERGE, COMMITTER: "dono" }, msg: LIMPA, verde: false },
  { nome: "suites saltadas sem o contexto do evento (vazio) reprovam", env: { ...MERGE, PRIVADO: "", COMMITTER: "" }, msg: LIMPA, verde: false },
  { nome: "suites saltadas com a varredura vermelha reprovam", env: { ...MERGE, VARREDURA: "failure" }, msg: LIMPA, verde: false },
  { nome: "suites vermelhas reprovam", env: { ...MERGE, SUITES: "failure" }, msg: LIMPA, verde: false },
  { nome: "suites verdes num push, sem varredura, passam (como antes)", env: { ...MERGE, SUITES: "success", COMMITTER: "dono" }, msg: COM_IA, verde: true },
  { nome: "suites verdes num PR com a varredura saltada reprovam (como antes)", env: { ...MERGE, SUITES: "success", EVENTO: "pull_request" }, msg: LIMPA, verde: false },
];

/** O git e o shell sem a configuracao de quem corre (um `commit.gpgsign` global partia o commit da fixture),
 *  como nas outras suites que montam repos. */
const ISOLADO = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

/** Corre o corpo num repo git descartavel com a `mensagem` no HEAD e o `.githooks/` real. */
function corre(corpo, env, mensagem) {
  const dir = mkdtempSync(join(tmpdir(), "portao-ci-test-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo);
    cpSync(join(ROOT, ".githooks"), join(repo, ".githooks"), { recursive: true });
    const git = (args) => execFileSync("git", args, { cwd: repo, stdio: "pipe", env: { ...process.env, ...ISOLADO } });
    git(["init", "-q"]);
    git(["-c", "user.name=t", "-c", "user.email=t@t", "add", "-A"]);
    writeFileSync(join(dir, "msg"), mensagem);
    git(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-F", join(dir, "msg")]);
    try {
      execFileSync("bash", ["-e", "-c", corpo], { cwd: repo, stdio: "pipe", env: { ...process.env, ...ISOLADO, ...env, RUNNER_TEMP: dir } });
      return 0;
    } catch (err) {
      return typeof err.status === "number" ? err.status : -1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function registar() {
  const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
  const ci = lerRaiz(".github/workflows/ci.yml");
  const passo = ci === null ? null : passoDoPortao(ci);
  if ((passo === null || !RAMO_DO_SALTO.test(passo.corpo)) && ehDerivado(lerRaiz)) {
    console.log("  SKIP  portao: o ci.yml deste projeto nao tem o portao `Guard Tests` com o salto do push de um merge (#347, opcional)");
    return;
  }
  registarResultado("portao: o passo do `Guard Tests` existe no ci.yml e le-se", passo === null ? ["nao encontrei o `run: |` do passo do portao"] : []);
  if (passo === null) return;
  const corpo = passo.corpo;
  registarResultado("portao: o shell tem o ramo do salto (#347)", RAMO_DO_SALTO.test(corpo) ? [] : ["o corpo nao tem o `if [ \"$SUITES\" = skipped ]`"]);
  registarResultado("portao: o `env:` do passo le os campos certos do evento (#347)", ENV_DO_PORTAO.filter((e) => !passo.env.includes(e)).map((e) => `falta \`${e}\` no env: do passo`));
  // O extractor nao pode devolver um corpo que passa tudo por estar vazio ou cortado.
  registarResultado("portao: o corpo lido e o shell inteiro do passo", /varredura-shards\.mjs/.test(corpo) && /commit-msg/.test(corpo) ? [] : ["o corpo lido nao tem o `varredura-shards` e o `commit-msg`"]);
  for (const c of CASOS) {
    const rc = corre(corpo, c.env, c.msg);
    registarResultado(`portao: ${c.nome} (#347)`, (rc === 0) === c.verde ? [] : [`esperava ${c.verde ? "verde" : "vermelho"}, saiu ${rc}`]);
  }
}
