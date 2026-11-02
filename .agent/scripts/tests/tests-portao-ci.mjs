/**
 * O SHELL do portao `Guard Tests` do `ci.yml` (#347, PR B), corrido como o runner o corre.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * O `if:` de job do `guard-tests` deixa saltar as suites no push de um merge num repo PRIVADO. O portao
 * nao confia nesse `if:`: recalcula o salto no seu shell, e reprova qualquer outro `skipped`. Se o
 * recalculo partir — ou o `if:` for alargado num PR futuro —, um push ficava verde sem medir nada (`TP2`).
 * Por isso le-se o passo REAL do `ci.yml` (e nao uma copia), e corre-se com `bash -e`, como o runner (e o corpo
 * abre com `set -eu`, para falhar fechado tambem sem ele, #372), para
 * cada combinacao do evento. A mensagem do merge passa pelo `.githooks/commit-msg` real.
 */
import { pathToFileURL } from "url";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";
import { correCorpo, gitEm } from "./harness/repo-descartavel.mjs";
import { VARIAVEL } from "../lib/nomes-proibidos.mjs";
import { concurrencyDeTopo, problemasDaConcurrency } from "../lib/marcas-yaml.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-portao-ci.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const PASSO = "Suites e varredura verdes, e todos os shards mediram";

/** O passo do portao (ver `passoDoCi`). */
export const passoDoPortao = (ci) => passoDoCi(ci, PASSO);

/** O passo `- name: <nome>` de um job do `ci.yml`: as linhas entre o `- name:` e o `run: |` (o `id:`, o `env:`) e o
 *  corpo do `run: |` sem a indentacao — ou `null` se o passo nao existir. O `tests-plano-passo.mjs` le assim o passo
 *  do plano (#347, C2). */
export function passoDoCi(ci, nome) {
  const ls = ci.split(/\r?\n/);
  const i = ls.indexOf(`      - name: ${nome}`);
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
  // A mensagem do merge e a final (#394): sem isto, um `#394 update` no topo era saltado como comentario.
  'COMMIT_MSG_FINAL: "1"',
];
/** Os valores LITERAIS do `env:` do passo (`X: "v"`), dados ao shell como o runner os da: um tirado do `ci.yml` tem de
 *  mudar o que o shell faz, e nao so o caso que le o `env:`. */
export const literaisDoEnv = (env) => Object.fromEntries(env.map((l) => /^(\w+): "([^"]*)"$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
/** O ramo do salto (#347, PR B). Um derivado que trouxe os scripts pelo `/upgrade` sem adotar o salto (e
 *  OPCIONAL) tem o portao antigo: ai nao ha nada a testar, e o teste diz SKIP em vez de reprovar. */
const RAMO_DO_SALTO = /if \[ "\$SUITES" = skipped \]; then/;

const LIMPA = "Merge pull request #93 from dono/fix/x\n\nfix(x): corrige y\n";
const COM_IA = `${LIMPA}\nCo-Authored-By: Claude <noreply@anthropic.com>\n`;
/** O push de um merge num privado: o caso que pode saltar. Cada caso de salto muda UMA condicao (o "vazio"
 *  e o contexto que falta, de proposito duas). */
const MERGE = { SUITES: "skipped", VARREDURA: "skipped", EVENTO: "push", PRIVADO: "true", COMMITTER: "web-flow" };

/** Cada vermelho diz PORQUE (#372 A4): so o exit deixava passar um vermelho por outra razao. Os cinco que caem no
 *  mesmo `::error::` do salto afirmam tambem a parte que muda — a mensagem sozinha nao dizia que condicao falhou. */
const SALTO = "saltaram fora do push de um merge num privado";
const CASOS = [
  { nome: "o push de um merge num privado, com a mensagem limpa, passa", env: MERGE, msg: LIMPA, verde: true },
  { nome: "o push de um merge num privado com atribuicao a IA reprova", env: MERGE, msg: COM_IA, verde: false, diz: ["COMMIT RECUSADO"] },
  // O `-F` sem editor guarda a linha `#`: no `main` ela e o assunto (#394).
  { nome: "o push de um merge num privado com o assunto `#394 update` reprova (#394)", env: MERGE, msg: "#394 update\n\nfix(x): y\n", verde: false, diz: ["nao segue o Conventional Commits"], final: true },
  // So o evento muda: sem isto, apagar a condicao do evento passava (o `COMMITTER` vazio ja reprovava).
  { nome: "suites saltadas num PR reprovam", env: { ...MERGE, EVENTO: "pull_request" }, msg: LIMPA, verde: false, diz: [SALTO, "(pull_request,"] },
  { nome: "suites saltadas num repo publico reprovam", env: { ...MERGE, PRIVADO: "false" }, msg: LIMPA, verde: false, diz: [SALTO, "privado=false"] },
  { nome: "suites saltadas num push directo (outro committer) reprovam", env: { ...MERGE, COMMITTER: "dono" }, msg: LIMPA, verde: false, diz: [SALTO, "committer=dono"] },
  { nome: "suites saltadas sem o contexto do evento (vazio) reprovam", env: { ...MERGE, PRIVADO: "", COMMITTER: "" }, msg: LIMPA, verde: false, diz: [SALTO, "privado=, committer=,"] },
  { nome: "suites saltadas com a varredura vermelha reprovam", env: { ...MERGE, VARREDURA: "failure" }, msg: LIMPA, verde: false, diz: [SALTO, "varredura=failure"] },
  { nome: "suites vermelhas reprovam", env: { ...MERGE, SUITES: "failure" }, msg: LIMPA, verde: false, diz: ["nao passaram: failure"] },
  { nome: "suites verdes num push, sem varredura, passam (como antes)", env: { ...MERGE, SUITES: "success", COMMITTER: "dono" }, msg: COM_IA, verde: true },
  // (O PR com as suites verdes e a varredura saltada vive no `tests-portao-sombra.mjs` desde o C2: o ramo do PR le a
  // BASE, e a fixture deste modulo tem um so commit. LIMITE aceite (leitura 2 do C2): num derivado com o salto do
  // merge e SEM o C2 esse caso nao corre — so existe em quem copiou o `main`, porque nenhuma tag teve um sem o outro.)
];

/** Corre o corpo num repo git descartavel com a `mensagem` no HEAD e o `.githooks/` real — com as libs que o
 *  `commit-msg` importa (os nomes, #375; o prefixo, #394), como no checkout do CI, e sem lista (no CI nao ha nenhuma). */
function corre(corpo, env, mensagem) {
  const dir = mkdtempSync(join(tmpdir(), "portao-ci-test-"));
  try {
    const repo = join(dir, "repo");
    mkdirSync(repo);
    cpSync(join(ROOT, ".githooks"), join(repo, ".githooks"), { recursive: true });
    mkdirSync(join(repo, ".agent/scripts/lib"), { recursive: true });
    for (const lib of [".agent/scripts/lib/nomes-proibidos.mjs", ".agent/scripts/lib/prefixo-commit.mjs"]) cpSync(join(ROOT, lib), join(repo, lib));
    env = { ...env, HOME: join(dir, "home-sem-lista") };
    const git = gitEm(repo);
    git(["init", "-q"]);
    git(["add", "-A"]);
    writeFileSync(join(dir, "msg"), mensagem);
    git(["commit", "-q", "-F", join(dir, "msg")]);
    return correCorpo(corpo, { cwd: repo, env, runnerTemp: dir, semVars: [VARIAVEL] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function registar() {
  // O extractor sobre YAML sintetico: corre em qualquer projeto (um derivado sem o salto da SKIP abaixo, e um
  // modulo sem nenhum teste reprova no registo). Nao pode ler o `run:` de OUTRO passo, nem cortar o corpo.
  {
    const p = (corpo, entre = "        env:\n          A: b\n") => `jobs:\n  g:\n    steps:\n      - name: ${PASSO}\n${entre}        run: |\n${corpo}\n      - run: depois\n`;
    const lido = passoDoPortao(p("          linha 1\n\n          linha 3"));
    registarResultado("portao: o extractor le o env: e o corpo inteiro do passo, ate ao passo seguinte (#347)", [
      ...(lido?.corpo === "linha 1\n\nlinha 3" ? [] : [`corpo lido: ${JSON.stringify(lido?.corpo)}`]),
      ...(JSON.stringify(lido?.env) === JSON.stringify(["env:", "A: b"]) ? [] : [`env lido: ${JSON.stringify(lido?.env)}`]),
    ]);
    registarResultado("portao: o extractor nao le o `run: |` de outro passo, nem um passo que nao existe (#347)", [
      ...(passoDoPortao(p("          x", "        uses: a/b@v1\n      - name: outro\n")) === null ? [] : ["leu o `run:` do passo seguinte"]),
      ...(passoDoPortao("jobs:\n  g:\n    steps:\n      - run: x\n") === null ? [] : ["inventou um passo"]),
    ]);
  }
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
  // O `COMMIT_MSG_FINAL` (#394) e do `ci.yml` do PROJETO, que o `/upgrade` nao reescreve: num derivado que ainda nao o
  // trouxe (a nota da 2b manda), SKIP com o nome — e nao FAIL (`TP15`). No template, falta e FAIL.
  const FINAL = 'COMMIT_MSG_FINAL: "1"';
  const semFinal = !passo.env.includes(FINAL) && ehDerivado(lerRaiz);
  if (semFinal) console.log("  SKIP  portao: o `env:` do portao deste projeto nao tem o `COMMIT_MSG_FINAL` (#394, a nota da 2b do `/upgrade`)");
  registarResultado("portao: o `env:` do passo le os campos certos do evento (#347)",
    ENV_DO_PORTAO.filter((e) => !passo.env.includes(e) && !(semFinal && e === FINAL)).map((e) => `falta \`${e}\` no env: do passo`));
  // O extractor nao pode devolver um corpo que passa tudo por estar vazio ou cortado.
  registarResultado("portao: o corpo lido e o shell inteiro do passo", /varredura-shards\.mjs/.test(corpo) && /commit-msg/.test(corpo) ? [] : ["o corpo lido nao tem o `varredura-shards` e o `commit-msg`"]);
  for (const c of CASOS) {
    if (semFinal && c.final) continue;
    const r = corre(corpo, { ...literaisDoEnv(passo.env), ...c.env }, c.msg);
    registarResultado(`portao: ${c.nome} (#347)`, [
      ...((r.code === 0) === c.verde ? [] : [`esperava ${c.verde ? "verde" : "vermelho"}, saiu ${r.code}`]),
      ...(c.diz ?? []).filter((t) => !r.out.includes(t)).map((t) => `o vermelho nao foi o esperado: faltou "${t}"`),
    ]);
  }

  // O `secret-scan` corre em TODO o push (#372 A1): com o salto do merge, um commit pela UI web no `main` (o mesmo
  // committer `web-flow`) nunca era varrido. No template, o job tem de existir e nao saltar; num derivado, SKIP (`TP15`).
  // NENHUMA tag publicou o salto no `secret-scan` (entrou e saiu entre a v0.60.0 e a v0.61.0): so um projeto que o
  // copiou do `main` o tem, e ai nada o avisa — tira-se a mao.
  const p = problemasDoSecretScan(ci);
  if (p.length && ehDerivado(lerRaiz)) {
    console.log(`  SKIP  portao: ${p[0]} — num derivado, tirar a mao (#372)`);
    registarResultado("portao: o `secret-scan` num derivado, nada a medir (#372)", []);
  } else {
    registarResultado("portao: o `secret-scan` existe e nao salta o push do merge num privado (#372)", p);
  }
  // O controlo: o `if:` do salto, posto num `secret-scan` sintetico, tem de reprovar; um ficheiro sem o job tambem.
  const sint = (cond) => `jobs:\n  secret-scan:\n    name: Secret Scan\n${cond}    runs-on: ubuntu-latest\n`;
  registarResultado("portao: o `if:` do salto no `secret-scan`, e o job em falta, reprovam (controlo, #372)", [
    ...(problemasDoSecretScan(sint("")).length === 0 ? [] : ["o `secret-scan` limpo reprovou"]),
    ...(problemasDoSecretScan(sint("    if: github.event_name == 'pull_request' || github.event.head_commit.committer.username != 'web-flow'\n")).length > 0 ? [] : ["o `if:` do salto passou"]),
    ...(problemasDoSecretScan("jobs:\n  outro:\n    runs-on: x\n").length > 0 ? [] : ["um ci.yml sem o `secret-scan` passou"]),
  ]);

  // O `concurrency:` de topo (#427): um grupo por commit num push, e o cancelamento so num PR (`problemasDaConcurrency`).
  // No template reprova; num derivado com o bloco noutra forma, SKIP (a 2b da a nota, `TP15`); sem bloco, nada se
  // agrupa nem se cancela, e passa.
  const bloco = concurrencyDeTopo(ci);
  const c = bloco === null ? ["o ci.yml nao tem o `concurrency:` de topo"] : problemasDaConcurrency(bloco);
  if (c.length && ehDerivado(lerRaiz)) {
    if (bloco !== null) console.log(`  SKIP  portao: ${c[0]} — num derivado, a nota da 2b do \`/upgrade\` (#427)`);
    registarResultado("portao: o `concurrency:` num derivado, nada a medir (#427)", []);
  } else {
    registarResultado("portao: o `concurrency:` da um grupo a cada push e so cancela num PR (#427)", c);
  }
  // As verificacoes da app correm TODAS numa corrida vermelha (#428): o `!cancelled()` nas cinco, o `id: install`, e o
  // `case "$INSTALOU"` nas quatro que precisam do `node_modules`. No template reprova; num derivado sem isto, SKIP (`TP15`).
  const q = problemasDoNaoCancelado(ci);
  if (q.length && ehDerivado(lerRaiz)) {
    console.log(`  SKIP  portao: ${q[0]} — num derivado, a nota da 2b do \`/upgrade\` (#428, opcional)`);
    registarResultado("portao: as verificacoes da app num derivado, nada a medir (#428)", []);
  } else {
    registarResultado("portao: as verificacoes da app correm todas numa corrida vermelha, e saltam sem o `Install` (#428)", q);
    // O shell do `TypeScript` corrido como o runner: com o `Install` vermelho sai 0 sem chamar o `npx`; com ele verde, chama.
    const ts = passoDoCi(ci, "TypeScript");
    if (ts !== null) {
      const dir = mkdtempSync(join(tmpdir(), "portao-ci-test-"));
      try {
        mkdirSync(join(dir, "bin"));
        writeFileSync(join(dir, "bin", "npx"), `#!/bin/sh\ntouch "${join(dir, "chamado")}"\nexit 7\n`, { mode: 0o755 });
        writeFileSync(join(dir, "tsconfig.json"), "{}\n");
        const corre = (instalou) => correCorpo(ts.corpo, { cwd: dir, runnerTemp: dir, env: { INSTALOU: instalou, TEM_APP: "true", PATH: `${join(dir, "bin")}:${process.env.PATH}` } });
        const sem = corre("failure");
        const saltado = corre("skipped");
        const vazio = corre("");
        const semChamou = leOuNull(join(dir, "chamado")) !== null;
        const com = corre("success");
        registarResultado("portao: o `TypeScript` com o `Install` vermelho sai 0 sem chamar o `npx`, com o valor vazio reprova, e com ele verde chama-o (#428)", [
          ...(sem.code === 0 && saltado.code === 0 && !semChamou ? [] : [`com INSTALOU=failure/skipped: exit ${sem.code}/${saltado.code}, npx chamado: ${semChamou}`]),
          ...(vazio.code === 1 && vazio.out.includes("::error::INSTALOU=''") ? [] : [`com INSTALOU vazio (um \`id:\` mudado): exit ${vazio.code}, esperava 1 com o erro`]),
          ...(com.code === 7 && leOuNull(join(dir, "chamado")) !== null ? [] : [`com INSTALOU=success: exit ${com.code} (esperava o 7 do npx falso)`]),
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }
  const qs = (checks) => `jobs:\n  quality:\n    steps:\n      - name: Install\n        id: install\n        run: npm ci\n${checks}`;
  const GATE = '          case "$INSTALOU" in success) ;; failure|skipped|cancelled) echo s; exit 0;; *) echo "::error::x"; exit 1;; esac\n';
  const chk = (nome, comIf = true, comGate = true) => `      - name: ${nome}\n${comIf ? "        if: ${{ !cancelled() }}\n" : ""}        env:\n${comGate ? "          INSTALOU: ${{ steps.install.conclusion }}\n" : ""}        run: |\n${comGate ? GATE : ""}          npx tsc\n`;
  const AUDIT = "      - name: Audit\n        if: ${{ !cancelled() }}\n        run: npm audit\n";
  const todos = (f) => ["TypeScript", "Lint", "Build", "Unit Tests"].map(f).join("") + AUDIT;
  registarResultado("portao: as verificacoes sem o `if:`, sem o gate do `Install`, ou o `Install` sem `id:`, reprovam (controlo, #428)", [
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n)))).length === 0 ? [] : [`a forma do template reprovou: ${problemasDoNaoCancelado(qs(todos((n) => chk(n))))[0]}`]),
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n, n !== "Lint")))).length > 0 ? [] : ["o `Lint` sem o `if:` passou"]),
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n, true, n !== "Build")))).length > 0 ? [] : ["o `Build` sem o gate do `Install` passou"]),
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n))).replace("        id: install\n", "")).length > 0 ? [] : ["o `Install` sem `id:` passou"]),
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n))).replace(AUDIT, "      - name: Audit\n        run: npm audit\n")).length > 0 ? [] : ["o `Audit` sem o `if:` passou"]),
    // A leitura independente do #428: o gate que falha ABERTO (`*) exit 0`), o `outcome` no lugar do `conclusion`, e o
    // `case` DEPOIS do comando, passavam.
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n))).split(GATE).join('          case "$INSTALOU" in success) ;; *) exit 0;; esac\n')).length > 0 ? [] : ["o gate que falha aberto passou"]),
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n))).split("steps.install.conclusion").join("steps.install.outcome")).length > 0 ? [] : ["o gate a ler o `outcome` passou"]),
    ...(problemasDoNaoCancelado(qs(todos((n) => chk(n))).split(`${GATE}          npx tsc\n`).join(`          npx tsc\n${GATE}`)).length > 0 ? [] : ["o gate depois do comando passou"]),
  ]);
  const conc = (g, v) => `on: push\nconcurrency:\n  group: ${g}\n  cancel-in-progress: ${v}\njobs:\n  x:\n    runs-on: y\n`;
  const SHA = "ci-${{ github.event.pull_request.number || github.sha }}";
  const PR = "${{ github.event_name == 'pull_request' }}";
  const reprova = (t) => { const b = concurrencyDeTopo(t); return b === null || problemasDaConcurrency(b).length > 0; };
  registarResultado("portao: so o grupo por commit com o cancelamento so nos PRs passa (controlo, #427)", [
    ...(reprova(conc(SHA, PR)) ? ["a forma do template reprovou"] : []),
    ...(reprova(conc(SHA, `"${PR}"`)) ? ["o valor entre aspas reprovou"] : []),
    ...(reprova(conc(SHA, "true")) ? [] : ["`cancel-in-progress: true` passou"]),
    ...(reprova(conc(SHA, "true # x")) ? [] : ["`true` com um comentario passou"]),
    ...(reprova(conc(SHA, "false")) ? [] : ["`false` (sem o cancelamento nos PRs) passou"]),
    ...(reprova(conc("ci-${{ github.ref }}", PR)) ? [] : ["o grupo do ref (o run pendente cancelado num burst) passou"]),
    ...(reprova("on: push\njobs:\n  x:\n    runs-on: y\n") ? [] : ["um ci.yml sem `concurrency:` passou"]),
    ...(reprova(`on: push\njobs:\n  x:\n    concurrency:\n      group: ${SHA}\n      cancel-in-progress: ${PR}\n    runs-on: y\n`) ? [] : ["um `concurrency:` so de JOB passou como o de topo"]),
  ]);
}

/** As chaves de um passo `- name: <nome>` do `ci.yml`, sem indentacao, ate ao passo seguinte; `null` se nao existir. */
function chavesDoPasso(ci, nome) {
  const ls = ci.split(/\r?\n/);
  const i = ls.indexOf(`      - name: ${nome}`);
  if (i < 0) return null;
  const fim = ls.findIndex((l, j) => j > i && l.trim() && !/^        /.test(l));
  return ls.slice(i + 1, fim < 0 ? ls.length : fim).map((l) => l.trim());
}

/** Os problemas das verificacoes da app no `ci.yml` (#428): o `!cancelled()` nas cinco, o `id: install`, e o gate do
 *  `Install` (o `env:` e o `case`) nas quatro que precisam do `node_modules`. */
export function problemasDoNaoCancelado(ci) {
  const out = [];
  const IF = "if: ${{ !cancelled() }}";
  const install = chavesDoPasso(ci, "Install");
  if (install === null || !install.includes("id: install")) out.push("o passo `Install` nao tem `id: install`");
  for (const nome of ["TypeScript", "Lint", "Build", "Unit Tests", "Audit"]) {
    const ks = chavesDoPasso(ci, nome);
    if (ks === null) {
      out.push(`o passo \`${nome}\` nao existe`);
      continue;
    }
    if (!ks.includes(IF)) out.push(`o passo \`${nome}\` nao tem \`${IF}\`: uma falha antes dele esconde-o`);
    if (nome === "Audit") continue;
    // O gate e a PRIMEIRA linha do corpo (antes do comando), le o `conclusion`, e falha FECHADO (`*) ... exit 1`).
    const primeira = passoDoCi(ci, nome)?.corpo.split("\n").find((l) => l.trim()) ?? "";
    const fechado = /^case "\$INSTALOU" in success\) ;; failure\|skipped\|cancelled\) .*exit 0;; \*\) .*exit 1;; esac$/.test(primeira);
    if (!ks.includes("INSTALOU: ${{ steps.install.conclusion }}") || !fechado) {
      out.push(`o passo \`${nome}\` nao abre com o gate do \`Install\` (o \`env: INSTALOU\` do \`conclusion\`, e o \`case\` que falha fechado): correria sem \`node_modules\`, ou saltava em silencio`);
    }
  }
  return out;
}

/** Os problemas do job `secret-scan` do `ci.yml` (#372 A1): tem de existir, e nao pode ter o `if:` do salto do merge. */
export function problemasDoSecretScan(ci) {
  const job = /\n  secret-scan:[ \t]*\r?\n((?:    .*\r?\n|\r?\n)*)/.exec(ci)?.[1] ?? null;
  if (job === null) return ["o ci.yml nao tem o job `secret-scan`"];
  return /^    if:.*committer\.username/m.test(job) ? ["o job `secret-scan` tem o `if:` do salto do merge: um commit pela UI web no `main` nunca era varrido"] : [];
}
