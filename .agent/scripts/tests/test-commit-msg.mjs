#!/usr/bin/env node
/**
 * Testes do hook `commit-msg` — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS: por cada forma de atribuir codigo a uma IA numa mensagem de commit, monta
 * a mensagem e exige que o hook reprove; e por cada forma legitima, exige que passe. Um hook
 * que recusa o que devia passar e pior do que hook nenhum — treina toda a gente a usar
 * `--no-verify`, e ai deixa de haver rede.
 *
 * Sem dependencias e sem `package.json`: corre com `node`, como os restantes.
 *
 *   node .agent/scripts/tests/test-commit-msg.mjs
 *
 * Sai `!= 0` se algum teste falhar. Corre no job `guard-tests` do `ci.yml`.
 */

import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { VARIAVEL } from "../lib/nomes-proibidos.mjs";
import { casosDaProsa } from "./harness/casos-commit-msg-prosa.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const HOOK = join(ROOT, ".githooks/commit-msg");
// A lista de nomes proibidos (#375) e, por omissao, a de QUEM CORRE (`TP3`): cada execucao do hook corre sem a
// variavel e com uma `HOME` que nao existe — uma pasta que este repo nao tem. Com a variavel apontada para um
// ficheiro em falta ja nao seria "sem lista", e sim `ilegivel`. Os casos dos nomes, mais abaixo, montam a sua.
const semVariavel = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => k !== VARIAVEL));
// E sem o modo do CI (#394) de quem corre: herdado, mudava o assunto que o hook le.
const SEM_LISTA = { ...semVariavel(process.env), HOME: join(ROOT, ".agent/scripts/tests/nao-existe"), COMMIT_MSG_FINAL: "" };
// O git das fixtures sem o `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE`/`GIT_CONFIG*` de quem corre (`TP3`): dentro de um
// hook ou de um `rebase -x`, um `git -C <tmp> config --local` escrevia no repo de `GIT_DIR` — no clone real.
const semGit = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_/.test(k)));

let passed = 0;
const falhas = [];

/**
 * @param nome    descricao do cenario
 * @param msg     a mensagem de commit (null = nao escrever ficheiro nenhum)
 * @param expect  { code, includes?: string[], caminhoAusente?: boolean } — `includes` afirma
 *                contra o STDERR do hook,
 *                que e onde a recusa e explicada. Afirmar contra stdout+stderr juntos deixava
 *                um teste passar por causa de output que nao e o da recusa (o `TP1`).
 */
function test(nome, msg, expect) {
  const dir = mkdtempSync(join(tmpdir(), "commit-msg-test-"));
  try {
    const args = [HOOK];
    if (expect.caminhoAusente) {
      // Caminho que o git passaria mas que nao existe: o hook tem de reprovar, nao passar.
      args.push(join(dir, "NAO-EXISTE"));
    } else if (msg !== null) {
      const f = join(dir, "COMMIT_EDITMSG");
      writeFileSync(f, msg);
      args.push(f);
    }
    let code = 0;
    let err = "";
    try {
      execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: SEM_LISTA, cwd: dir });
    } catch (e) {
      code = e.status ?? -1;
      err = e.stderr ?? "";
    }
    const problemas = [];
    if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
    for (const s of expect.includes ?? []) {
      if (!err.includes(s)) problemas.push(`o stderr devia conter "${s}"`);
    }
    if (problemas.length) {
      falhas.push({ nome, problemas, err });
      console.log(`  FAIL  ${nome}`);
      for (const p of problemas) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${nome}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== Testes do hook commit-msg ===\n");

// --- O que tem de PASSAR -------------------------------------------------------
// Metade do valor deste hook esta aqui. Um hook que reprova mensagens legitimas e abandonado.

test("mensagem normal passa", "fix(scripts): corrigir o guard\n", { code: 0 });

test("co-autor HUMANO passa", "feat: x\n\nCo-Authored-By: Maria Silva <maria@exemplo.pt>\n", { code: 0 });

// O ficheiro promete, por escrito, que "um co-autor humano passa". Nao prometia o suficiente:
// `aider` casava DENTRO de "Haider" e recusava o commit de uma pessoa real. Um hook que
// recusa um humano ensina a contorna-lo com `--no-verify`, e ai deixa de haver hook.
test("co-autor humano cujo APELIDO contem um nome de IA passa",
  "feat: x\n\nCo-Authored-By: Ali Haider <ali@exemplo.pt>\n", { code: 0 });
test("co-autor humano chamado Grokowski passa",
  "feat: x\n\nCo-Authored-By: Jan Grokowski <jan@exemplo.pl>\n", { code: 0 });
test("co-autor humano chamado Cordeiro passa",
  "feat: x\n\nCo-Authored-By: Luis Cordeiro <luis@exemplo.pt>\n", { code: 0 });

// AMBIGUIDADE ASSUMIDA, e nao um defeito por fechar: `Devin` e `Cody` sao ao mesmo tempo
// agentes e nomes proprios correntes. Nenhuma ancora os distingue. Fica a recusar, porque a
// mensagem do hook nomeia a linha e manda ajustar a lista (nao `--no-verify`) — e um humano
// assim chamado resolve-o uma vez, no repo dele. Este teste existe para que a escolha seja
// EXPLICITA: quem a inverter parte um teste e tem de dizer porque.
test("co-autor chamado Devin recusa (ambiguidade assumida)",
  "feat: x\n\nCo-Authored-By: Devin Jones <d@exemplo.pt>\n", { code: 1 });

// Os agentes que a lista nao conhecia ate hoje.
for (const nome of ["Codex", "Cline", "Jules", "Junie", "Qwen Coder", "Roo Code"]) {
  test(`atribuicao a ${nome} recusa`, `feat: x\n\nCo-Authored-By: ${nome} <x@exemplo.com>\n`, { code: 1 });
}

// #289: os nomes curtos SEM ancora casavam DENTRO de nomes de pessoa — a classe do Haider.
test("co-autor humano chamado Claudete passa",
  "feat: x\n\nCo-Authored-By: Claudete Silva <c@exemplo.pt>\n", { code: 0 });
test("co-autor humano chamado Geminiano passa",
  "feat: x\n\nCo-Authored-By: Joao Geminiano <j@exemplo.pt>\n", { code: 0 });
// A mesma ambiguidade do Devin: o nome proprio E o nome da ferramenta. Fixada, como a dele.
test("co-autor chamado Claude recusa (ambiguidade assumida, como o Devin)",
  "feat: x\n\nCo-Authored-By: Claude Dupont <claude@exemplo.fr>\n", { code: 1 });

// #289: a prosa contra a atribuicao ("built with", "generated with", os trailers colados, as linhas patologicas):
// os casos vivem em `harness/casos-commit-msg-prosa.mjs` (#400).
casosDaProsa(test);

// Uma mensagem escrita no Windows (CRLF, `git commit -F`) escapava a TODAS as formas menos ao emoji:
// o `\r` no fim de cada linha partia o `(.+)$`. Lacuna antiga, encontrada no #289.
test("trailer com CRLF reprova", "fix: x\r\n\r\nCo-Authored-By: Claude <noreply@anthropic.com>\r\n", { code: 1 });
test("trailer com CR sozinho (Mac antigo) reprova", "fix: x\r\rCo-Authored-By: Claude <noreply@anthropic.com>\r", { code: 1 });
test("`generated with` com CRLF reprova", "fix: x\r\n\r\nGenerated with Claude Code\r\n", { code: 1 });

// O outro lado: as formas reais de atribuicao CONTINUAM a reprovar.
for (const linha of [
  "Made with Cursor",
  "🤖 Generated with Claude Code",
  "Generated with [Claude Code](https://claude.com/claude-code)",
  "Generated by GitHub Copilot",
  "Written with ChatGPT (gpt-4o)",
  "Created with gpt-4o.",
  "Built with Claude Opus 4.5",
  "Made with claude-code <noreply@anthropic.com>",
  "- Generated with Gemini 2.5 Pro",
  // Da leitura independente do #289: formas reais escritas a mao que um criterio "o valor e SO o
  // nome da ferramenta" deixava passar. Cada uma e recusada pelo hook antigo; nenhuma pode regredir.
  "**Generated with Claude Code**",
  "_Generated with Claude Code_",
  "Generated with `Claude Code`",
  'Generated with "Claude Code"',
  "Generated with Claude Code - https://claude.ai/code",
  "Generated with Claude Code by Anthropic",
  "Generated with Claude Code, reviewed by me",
  "Generated with Claude Code and reviewed by a human",
  "Created with the help of Claude",
  "Generated with AI (Claude)",
  "Made with love by Claude Code",
  "Generated with Gemini Code Assist",
  "Generated with Windsurf Cascade",
  "Generated by GitHub Copilot coding agent",
  "Generated with GPT-5 Codex",
  "Generated with OpenAI o3",
  "Generated with Claude Code ✨",
  "Generated with ClaudeCode",
  "Written with copilot assistance",
  // O nome em minusculas seguido de um CONECTOR continua a ser atribuicao, nao prosa.
  "Generated with copilot and reviewed by me",
  "made with claude by the team",
  // Segunda passagem de leituras: conectores e produtos em minusculas, e o sufixo `-assisted`.
  "Generated with Claude then edited by me",
  "Generated with Copilot suggestions",
  "Generated with copilot workspace",
  "Generated with cursor composer",
  "Made with windsurf cascade",
  "Built with lovable dev",
  "Generated with ChatGPT plus",
  "Written with Claude-assisted edits",
  "Generated with claude code-review",
  // Cada um isola UMA decisao (controlo negativo medido): a maiuscula sozinha, o sufixo de autoria
  // sozinho, o conector sozinho — os de cima recusavam por mais do que uma razao.
  "Generated with Claude conversations",
  "Generated with claude-assisted tooling",
  "Generated with claude then edited by me",
  // Terceira leitura do #289: a excecao API/SDK so vale para `built`, e nao atravessa pontuacao.
  "Generated with Claude Code via the API",
  "Generated with Claude using the Anthropic API",
  "Generated with Claude Code. Updated the API client",
  // Mesmo com `built`, a janela da API nao atravessa a pontuacao (isola essa decisao).
  "Built with Claude Code. Updated the API client",
  // O URL a seguir a um nome em MINUSCULAS (o caso que isola o lookahead).
  // Um URL que NAO contem o nome: com `claude.ai` o teste passava pela segunda ocorrencia, e nao
  // isolava o lookahead (controlo negativo medido).
  "Generated with claude https://example.com/agent",
  // Uma palavra seguinte com maiuscula, digito ou `_` nao e um substantivo comum.
  "Generated with copilot Workspace",
  "Generated with cursor page_size",
  // Um identificador de modelo (com digitos) nunca e um substantivo comum.
  "Written with gpt-4o prompts",
  "Generated with claude-3-5-sonnet tools",
  // O ponto a seguir ao nome e pontuacao, nao parte dele.
  "made with claude. pagination is next",
]) {
  test(`atribuicao \`${linha}\` reprova`, `fix: x\n\n${linha}\n`, { code: 1 });
}

test("prosa que fala de geracao passa", "docs: explicar como o relatorio e gerado pelo script\n", { code: 0 });

// O texto de ajuda que o git acrescenta ao ficheiro vem comentado com `#` e NAO entra na
// mensagem final. Se o hook o lesse, qualquer commit interactivo podia disparar.
//
// As formas usadas aqui sao as NAO ANCORADAS de proposito. A primeira versao deste teste
// punha um `# Co-Authored-By:` comentado — e esse padrao comeca com `^\s*`, logo ja nao casa
// uma linha que comeca por `#`, filtro ou nao. O teste ficava verde com o filtro ligado **e**
// desligado: nao afirmava nada, que e o `TP1`. Apanhado pelo controlo negativo.
test("comentario do git com `generated with` nao conta", "fix: x\n\n# Generated with [Claude Code](https://claude.com)\n", { code: 0 });

test("comentario do git com o emoji de robo nao conta", "fix: x\n\n# 🤖 texto de ajuda\n", { code: 0 });

// --- O que tem de REPROVAR -----------------------------------------------------
// A forma que motivou o hook: escrita por um agente, num commit feito com `-F`.
test("`Co-Authored-By` de IA reprova", "fix: x\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n", {
  code: 1,
  includes: ["COMMIT RECUSADO", "Co-Authored-By"],
});

for (const [nome, valor] of [
  ["Copilot", "GitHub Copilot <copilot@github.com>"],
  ["Gemini", "Gemini <noreply@google.com>"],
  ["Cursor", "Cursor <agent@cursor.sh>"],
  ["gpt-4", "gpt-4 <bot@openai.com>"],
]) {
  test(`\`Co-Authored-By\` de ${nome} reprova`, `fix: x\n\nCo-Authored-By: ${valor}\n`, { code: 1 });
}

test("`Generated with [ferramenta]` reprova", "fix: x\n\nGenerated with [Claude Code](https://claude.com/claude-code)\n", {
  code: 1,
  includes: ["generated with"],
});

test("emoji de robo reprova sozinho", "fix: x\n\n🤖 qualquer coisa\n", { code: 1, includes: ["emoji de robo"] });

test("`Assisted-By` de IA reprova", "fix: x\n\nAssisted-By: gpt-4\n", { code: 1 });

// O trailer no MEIO do corpo, e nao no fim: um hook que so olhasse a ultima linha falhava.
test("atribuicao no meio do corpo reprova", "fix: x\n\nCo-Authored-By: Claude <a@b>\n\nmais texto depois\n", { code: 1 });

// --- "Nao consegui medir" tem de REPROVAR --------------------------------------
// Um hook que nao consegue ler a mensagem e deixa passar e o `TP2`: "nao ha nada" nao e
// "nao consegui ler". Aqui o custo de falhar fechado e um commit repetido; o de falhar aberto
// e uma mensagem imutavel errada.
test("sem o argumento do git reprova", null, { code: 1, includes: ["nao consigo verificar"] });

test("ficheiro da mensagem ausente reprova", null, {
  code: 1,
  caminhoAusente: true,
  includes: ["nao consegui ler"],
});

// --- A mensagem de recusa tem de ser accionavel --------------------------------
// Sem isto, quem leva a recusa nao sabe o que fazer e alcanca o `--no-verify`.
test("a recusa diz a regra, o ficheiro e o que fazer", "fix: x\n\nCo-Authored-By: Claude <a@b>\n", {
  code: 1,
  includes: ["process-rules.md", ".githooks/commit-msg", ".githooks/lib/commit-msg.mjs", "Apagar as linhas acima"],
});

// --- O PONTEIRO, chamado pelo git como no uso real (#278) ----------------------
// O `.githooks/commit-msg` so importa `lib/commit-msg.mjs`. O git chama-o pelo nome, num repo com
// `core.hooksPath`: e assim que se prova o import relativo — e que, sem o `lib/`, o commit FALHA
// em vez de passar sem verificacao (falha fechada).
function commitComHooks(nome, hooks, msg, esperaRecusa, motivo) {
  const dir = mkdtempSync(join(tmpdir(), "commit-msg-test-"));
  try {
    const g = (...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], {
      cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...SEM_LISTA, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    });
    g("init", "-q");
    g("config", "core.hooksPath", hooks(dir));
    let recusado = false;
    let err = "";
    try {
      g("commit", "-q", "--allow-empty", "-m", msg);
    } catch (e) {
      recusado = true;
      err = e.stderr ?? "";
    }
    if (recusado === esperaRecusa && (!motivo || err.includes(motivo))) {
      passed++;
      console.log(`  PASS  ${nome}`);
    } else {
      falhas.push({ nome, problemas: [], err });
      console.log(`  FAIL  ${nome}`);
      console.log(`          o commit ${recusado ? "foi recusado" : "passou"}${motivo ? ` (motivo esperado: ${motivo})` : ""}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const HOOKS = join(ROOT, ".githooks");
commitComHooks("o git chama o ponteiro, que recusa uma atribuicao a IA", () => HOOKS,
  "fix: x\n\nCo-Authored-By: Claude <a@b>\n", true);
commitComHooks("o git chama o ponteiro, que aceita uma mensagem limpa", () => HOOKS, "fix: x\n", false);
commitComHooks("o git chama o ponteiro, que recusa um assunto sem o prefixo Conventional Commits (#394)", () => HOOKS, "update stuff\n", true, "Conventional Commits");
commitComHooks("sem o `lib/`, o ponteiro FALHA e o commit nao passa (falha fechada)", (dir) => {
  const h = join(dir, "hooks-sem-lib");
  mkdirSync(h);
  copyFileSync(HOOK, join(h, "commit-msg"));
  chmodSync(join(h, "commit-msg"), 0o755);
  return h;
}, "fix: x\n", true, "lib/commit-msg.mjs");

// --- Os NOMES PROIBIDOS (#375) --------------------------------------------------
// Cada caso monta um repo de fixture com o ponteiro, o `lib/` e a lib da lista COPIADOS: o hook resolve a raiz
// pelo seu proprio sitio, logo uma lista "dentro do repo" fica dentro da fixture, nunca deste repo. Os nomes
// sao inventados. A recusa cita linhas, e o nome nunca aparece nela (`naoInclui`). `onde: "omissao"` corre sem a
// variavel e com uma HOME vazia (o "sem lista" real); `desligado` liga o interruptor LOCAL do repo da fixture.
// O PREFIXO (#394) corre na mesma fixture: `contributing` e o `CONTRIBUTING.md` do repo do commit, `final` o modo do CI.
function testNomes(nome, { msg, lista, onde = "fora", semLib = false, semPrefixo = false, contributing, final = false, desligado = false, comentario, hooksNoutro = false }, expect) {
  const dir = mkdtempSync(join(tmpdir(), "commit-msg-test-"));
  try {
    const raiz = join(dir, "repo");
    // `hooksNoutro`: o `core.hooksPath` aponta para os hooks de OUTRO clone — o commit e no `raiz`, o hook vive fora.
    const base = hooksNoutro ? join(dir, "outro") : raiz;
    mkdirSync(raiz, { recursive: true });
    const libs = [...(semLib ? [] : [".agent/scripts/lib/nomes-proibidos.mjs"]), ...(semPrefixo ? [] : [".agent/scripts/lib/prefixo-commit.mjs"])];
    for (const rel of [".githooks/commit-msg", ".githooks/lib/commit-msg.mjs", ...libs]) {
      mkdirSync(dirname(join(base, rel)), { recursive: true });
      copyFileSync(join(ROOT, rel), join(base, rel));
    }
    if (contributing === null) mkdirSync(join(raiz, "CONTRIBUTING.md"));
    else if (contributing !== undefined) writeFileSync(join(raiz, "CONTRIBUTING.md"), contributing);
    const caminho = onde === "dentro" ? join(raiz, "lista") : join(dir, "lista");
    if (onde === "pasta") mkdirSync(caminho);
    else if (lista !== undefined) writeFileSync(caminho, lista);
    writeFileSync(join(dir, "MSG"), msg);
    const isolado = { ...semGit(process.env), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", COMMIT_MSG_FINAL: final ? "1" : "" };
    if (desligado || comentario) {
      const git = (...a) => execFileSync("git", ["-C", raiz, ...a], { stdio: "ignore", env: isolado });
      git("init", "-q");
      if (desligado) git("config", "--local", "agent-template.nomesProibidos", "desligado");
      if (comentario) git("config", "--local", "core.commentChar", comentario);
    }
    // Como o git o corre: na raiz da worktree (o hook decide o interruptor e o "dentro do repo" pela cwd).
    const env = onde === "omissao" ? { ...semVariavel(isolado), HOME: join(dir, "home") } : { ...isolado, [VARIAVEL]: caminho };
    // `spawnSync`, e nao `execFileSync`: o stderr de um hook que PASSA tambem se afirma (o aviso do desligado).
    const r = spawnSync(process.execPath, [join(base, ".githooks/commit-msg"), join(dir, "MSG")], { encoding: "utf8", env, cwd: raiz });
    const code = r.status ?? -1;
    const err = r.stderr ?? "";
    const problemas = [];
    if (code !== expect.code) problemas.push(`exit ${code}, esperado ${expect.code}`);
    for (const s of expect.includes ?? []) if (!err.includes(s)) problemas.push(`o stderr devia conter "${s}"`);
    for (const s of expect.naoInclui ?? []) if (err.toLowerCase().includes(s.toLowerCase())) problemas.push(`o stderr NAO devia conter "${s}"`);
    if (problemas.length) {
      falhas.push({ nome, problemas, err });
      console.log(`  FAIL  ${nome}`);
      for (const p of problemas) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${nome}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const LISTA = "# privados\nprojeto-secreto\n";
testNomes("nomes: um nome da lista no corpo recusa, e a recusa cita as linhas e nao o nome",
  { msg: "fix: x\n\nvisto no Projeto Secreto\n", lista: LISTA },
  { code: 1, includes: ["linha 3 da mensagem: o nome da linha 2 da lista"], naoInclui: ["projeto secreto", "projeto-secreto"] });
testNomes("nomes: uma variante (sublinhado) no titulo recusa", { msg: "fix(projeto_secreto): x\n", lista: LISTA }, { code: 1, includes: ["linha 1 da mensagem"] });
testNomes("nomes: uma mensagem limpa passa com a lista", { msg: "fix: projetos secretos em geral\n", lista: LISTA }, { code: 0 });
testNomes("nomes: sem lista passa CALADO (o CI corre isto sem lista)", { msg: "fix: projeto-secreto\n", onde: "omissao" }, { code: 0, naoInclui: ["lista"] });
testNomes("nomes: a variavel apontada para um ficheiro em falta recusa (quem a definiu disse que ha lista)", { msg: "fix: x\n" }, { code: 1, includes: ["nao se consegue ler"] });
testNomes("nomes: num repo DESLIGADO (`git config --local`) passa, mas DIZ que esta desligado", { msg: "fix: projeto-secreto\n", lista: LISTA, desligado: true },
  { code: 0, includes: ["DESLIGADOS neste repo"], naoInclui: ["projeto-secreto"] });
testNomes("nomes: com os hooks noutro clone (`core.hooksPath`), o interruptor que conta e o do repo do COMMIT",
  { msg: "fix: projeto-secreto\n", lista: LISTA, desligado: true, hooksNoutro: true }, { code: 0, includes: ["DESLIGADOS neste repo"] });
testNomes("nomes: a recusa diz que quem desliga e o UTILIZADOR, sem o comando literal (um agente le-a)", { msg: "fix: projeto-secreto\n", lista: LISTA },
  { code: 1, includes: ["UTILIZADOR, nunca um agente", "O contrato da lista de nomes proibidos"], naoInclui: ["git config --local"] });
testNomes("nomes: uma linha `#339 ...` (que o `-m` mantem na mensagem) tambem e lida, e recusa",
  { msg: "fix: x\n\n#339 visto no projeto-secreto\n", lista: LISTA }, { code: 1, includes: ["linha 3 da mensagem"] });
testNomes("nomes: a tesoura segue o `core.commentChar` do repo (`;`)",
  { msg: "fix: tirar um nome vazado\n; ------------------------ >8 ------------------------\ndiff --git a/f b/f\n-projeto-secreto\n", lista: LISTA, comentario: ";" }, { code: 0 });
testNomes("nomes: com um nome E uma atribuicao a IA, recusa pelo nome, e o nome nao sai na linha da IA",
  { msg: "fix: x\n\nCo-Authored-By: Claude <bot@projeto-secreto.com>\n", lista: LISTA },
  { code: 1, includes: ["nomeia um nome da lista"], naoInclui: ["projeto-secreto", "Co-Authored-By"] });
testNomes("nomes: o diff abaixo da tesoura do `git commit -v` nao conta (apagar um nome vazado passa)",
  { msg: "fix: tirar um nome vazado\n# ------------------------ >8 ------------------------\n# Do not modify or remove the line above.\ndiff --git a/f b/f\n-projeto-secreto\n", lista: LISTA }, { code: 0 });
testNomes("nomes: a linha da mensagem e a do FICHEIRO, contando os comentarios do git",
  { msg: "# um comentario do template\nfix: x\n\nvisto no projeto-secreto\n", lista: LISTA }, { code: 1, includes: ["linha 4 da mensagem"] });
testNomes("nomes: uma lista vazia recusa, com a razao", { msg: "fix: x\n", lista: "# so isto\n\n" }, { code: 1, includes: ["nao tem nenhum nome"] });
testNomes("nomes: uma lista ilegivel (uma pasta) recusa", { msg: "fix: x\n", onde: "pasta" }, { code: 1, includes: ["nao se consegue ler"] });
testNomes("nomes: uma lista DENTRO do repo recusa", { msg: "fix: x\n", lista: LISTA, onde: "dentro" }, { code: 1, includes: ["DENTRO do repo"] });
testNomes("nomes: sem a lib da lista (um derivado antigo) recusa com a razao, nao rebenta", { msg: "fix: x\n", lista: LISTA, semLib: true },
  { code: 1, includes: ["nao consegui carregar a lista", "/upgrade"] });

// --- O PREFIXO Conventional Commits (#394), pelo hook. A tabela pura e o passo do CI: `tests-commit-msg-prefixo.mjs`.
const TABELA = "# C\n\n### Types\n\n| Type | When |\n|------|------|\n| `feat` | x |\n| `fix` | x |\n| `build` | x |\n\n## Outra\n\n| `wip` | x |\n";
const PREFIXO = "nao segue o Conventional Commits";
testNomes("prefixo: `update stuff` recusa, e a recusa diz porque e da um exemplo (#394)", { msg: "update stuff\n", onde: "omissao" },
  { code: 1, includes: [PREFIXO, "Assunto: update stuff", "nao tem a forma", "Exemplo: feat(dashboard)"] });
testNomes("prefixo: sem tabela passa pela forma, e DI-LO (#394)", { msg: "qualquer: x\n", onde: "omissao" }, { code: 0, includes: ["sem a tabela `### Types`"] });
testNomes("prefixo: um type acrescentado a tabela do projeto passa (#394)", { msg: "build: x\n", onde: "omissao", contributing: TABELA }, { code: 0, naoInclui: ["sem a tabela"] });
testNomes("prefixo: um type fora da tabela (so noutra seccao) recusa, e lista os types (#394)", { msg: "wip: x\n", onde: "omissao", contributing: TABELA },
  { code: 1, includes: ["`wip` nao esta na tabela", "feat, fix, build"] });
testNomes("prefixo: a tabela em CRLF le-se (#394)", { msg: "build: x\n", onde: "omissao", contributing: TABELA.replace(/\n/g, "\r\n") }, { code: 0, naoInclui: ["sem a tabela"] });
testNomes("prefixo: os NOMES vem antes, e a recusa do prefixo nao imprime um nome proibido (#394)", { msg: "update projeto-secreto\n", lista: LISTA },
  { code: 1, includes: ["nomeia um nome da lista"], naoInclui: ["projeto-secreto", "Conventional Commits"] });
testNomes("prefixo: so comentarios (a desistencia no editor) passa calado, e o git aborta (#394)", { msg: "# nada\n", onde: "omissao" }, { code: 0, naoInclui: ["RECUSADO"] });
testNomes("prefixo: a tabela sem nenhuma linha de type recusa (nao consegui ler) (#394)", { msg: "feat: x\n", onde: "omissao", contributing: "### Types\n\n| Type | Q |\n|---|---|\nnenhuma\n" },
  { code: 1, includes: ["nao consegui ler a tabela"] });
testNomes("prefixo: um `CONTRIBUTING.md` ilegivel (uma pasta) recusa (#394)", { msg: "feat: x\n", onde: "omissao", contributing: null }, { code: 1, includes: ["nao consegui ler a tabela"] });
testNomes("prefixo: com o git, uma linha `#` no topo e um comentario e o assunto e a seguinte (#394)", { msg: "#394 update\nfeat: x\n", onde: "omissao" }, { code: 0 });
testNomes("prefixo: no modo do CI (`COMMIT_MSG_FINAL`) a linha `#` e o assunto, e recusa (#394)", { msg: "#394 update\nfeat: x\n", onde: "omissao", final: true },
  { code: 1, includes: [PREFIXO, "#394 update"] });
testNomes("prefixo: o comentario segue o `core.commentChar` do repo (`;`) (#394)", { msg: "; um comentario\nfeat: x\n", onde: "omissao", comentario: ";" }, { code: 0 });
// Um METACARACTERE como `core.commentChar` (#400): numa regex sem escape, `^.` fazia de cada linha um comentario e a
// atribuicao passava. Le-se por `startsWith`: so as linhas que comecam por `.`.
testNomes("comentario: um `core.commentChar` `.` nao faz de cada linha um comentario (#400)", { msg: ". nota\nfeat: x\n\nCo-Authored-By: Claude <a@b>\n", onde: "omissao", comentario: "." },
  { code: 1, includes: ["atribui o trabalho a uma ferramenta de IA"] });
testNomes("prefixo: sem a lib do prefixo (um derivado antigo) recusa com a razao, nao rebenta (#394)", { msg: "feat: x\n", onde: "omissao", semPrefixo: true },
  { code: 1, includes: ["prefixo-commit.mjs", "/upgrade"] });

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
console.log("");
if (falhas.length) {
  for (const { nome, err } of falhas) {
    console.log(`--- stderr de "${nome}" ---`);
    console.log(err);
  }
  console.log("  Ha testes do hook commit-msg a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do hook commit-msg passaram.\n");
