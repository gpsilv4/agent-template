/**
 * O guard com comandos ENORMES (#224) — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: um hook `PreToolUse` que excede o timeout (600 s por omissao) PERMITE a chamada
 * — esta na documentacao de hooks do Claude Code. O `dentroDeAspas` relia o comando desde o inicio
 * por cada separador e parentese: `git push --force` seguido de 200 000 `)` levava 60 s, e a curva
 * chegava aos 600 s pouco depois. Um comando grande o bastante passava por falta de tempo.
 *
 * Duas redes: a analise de aspas numa so passagem (`zonasCitadas`), e um tecto de tamanho que nega
 * antes de qualquer analise. Os tempos sao generosos de proposito — o que se afirma e a ORDEM de
 * grandeza (antes: ~15 s com 99k caracteres; depois: dezenas de ms), nao um numero de maquina.
 */
import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-guard-tamanho.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

/** O tecto do hook. Escrito aqui tambem: se o hook o mudar, este teste tem de ser revisto. */
const MAX = 100_000;
/** Bem acima do que a analise linear gasta, e bem abaixo dos ~15 s da quadratica. */
const TECTO_MS = 3000;

export function registar({ test, corre, repo, eq, contem }) {
  const comRepo = (fn) => {
    const d = repo("feature/x");
    try {
      fn(d);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  test("tamanho: um comando acima do tecto e negado antes de qualquer analise (#224)", () =>
    comRepo((d) => {
      const r = corre({ tool_input: { command: `echo ${"a".repeat(MAX)}` }, cwd: d });
      eq(r.decisao, "deny", "um comando acima do tecto tem de ser negado");
      contem(r.razao, "grande demais", "a razao tem de dizer porque");
    }));

  test("tamanho: um comando no tecto ainda e analisado, e passa se for leitura (#224)", () =>
    comRepo((d) => {
      const cmd = `echo ${"a".repeat(MAX - 5)}`;
      eq(cmd.length, MAX, "o comando tem de ter exactamente o tecto");
      eq(corre({ tool_input: { command: cmd }, cwd: d }).decisao, "allow", "no tecto, uma leitura passa");
    }));

  test(`tamanho: force-push com 99k parenteses e negado em menos de ${TECTO_MS} ms (#224)`, () =>
    comRepo((d) => {
      const t0 = Date.now();
      const r = corre({ tool_input: { command: `git push --force origin main ${")".repeat(99_000)}` }, cwd: d });
      const ms = Date.now() - t0;
      eq(r.decisao, "deny", "o force-push tem de ser negado");
      eq(ms < TECTO_MS, true, `a analise levou ${ms} ms — voltou a ser quadratica? (era ~15 s)`);
    }));

  // Os separadores seguidos (`;;;`) colapsam num so: o caminho quadratico deles so aparece
  // INTERCALADOS. Medido: 7.2 s antes, ~0.1 s depois.
  test(`tamanho: force-push com 49k separadores intercalados e negado em menos de ${TECTO_MS} ms (#224)`, () =>
    comRepo((d) => {
      const t0 = Date.now();
      const r = corre({ tool_input: { command: `git push --force origin main ${"a;".repeat(49_000)}` }, cwd: d });
      const ms = Date.now() - t0;
      eq(r.decisao, "deny", "o force-push tem de ser negado");
      eq(ms < TECTO_MS, true, `a analise levou ${ms} ms — voltou a ser quadratica? (era ~7 s)`);
    }));

  // O regex dos heredocs tinha `\s` no terminador, que casa o `\n`: cada `<<TAG` sem terminador
  // percorria as linhas em branco ate ao fim, e ~19k caracteres passavam dos 600 s — ABAIXO do
  // tecto. Apanhado pela leitura independente do PR #226.
  test(`tamanho: heredocs sem terminador com linhas em branco respondem em menos de ${TECTO_MS} ms (#224)`, () =>
    comRepo((d) => {
      const cmd = `git push --force origin main\n${"a<<EOF\n".repeat(400)}${"\n".repeat(8000)}`;
      const t0 = Date.now();
      const r = corre({ tool_input: { command: cmd }, cwd: d });
      const ms = Date.now() - t0;
      eq(r.decisao, "deny", "o force-push tem de ser negado");
      eq(ms < TECTO_MS, true, `a analise levou ${ms} ms — o regex dos heredocs voltou a ser quadratico? (era ~0.5 s por <<)`);
    }));

  // --- O PRAZO (#227): perseguir cada caminho lento e uma corrida sem fim; esgotado o prazo, nega.
  // O `corre` do entry point nao passa ambiente: o prazo encurta-se aqui, por `GUARD_PRAZO_MS`.
  const HOOK = fileURLToPath(new URL("../guard-protected-branch.mjs", import.meta.url));
  const correComPrazo = (cmd, prazoMs, cwd) => {
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_input: { command: cmd }, cwd }),
      encoding: "utf8",
      env: { ...process.env, GUARD_PRAZO_MS: String(prazoMs) },
    });
    const d = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput ?? {} : {};
    return { decisao: d.permissionDecision ?? "allow", razao: d.permissionDecisionReason ?? "" };
  };
  // Uma leitura (seria PERMITIDA) que leva ~5 s: `2>&` repetido e quadratico no `porqueAltera`.
  const LENTO = `echo x ${"2>&".repeat(20_000)}`;

  test("prazo: uma analise que passa do prazo e NEGADA, e dentro do prazo (#227)", () =>
    comRepo((d) => {
      const t0 = Date.now();
      const r = correComPrazo(LENTO, 300, d);
      const ms = Date.now() - t0;
      eq(r.decisao, "deny", "passado o prazo, o guard tem de negar — um hook em timeout PERMITE");
      contem(r.razao, "demasiado lento", "a razao tem de dizer porque");
      eq(ms < TECTO_MS, true, `levou ${ms} ms — o prazo era de 300 ms`);
    }));

  test("prazo: um comando longo e rapido passa pelo worker e e PERMITIDO (#227)", () =>
    comRepo((d) => eq(correComPrazo(`echo ${"a".repeat(10_000)}`, 5000, d).decisao, "allow", "uma leitura rapida passa")));

  test("prazo: o worker passa a negacao ao processo principal (#227)", () =>
    comRepo((d) => {
      const r = correComPrazo(`git push --force origin main ${"a ".repeat(5000)}`, 5000, d);
      eq(r.decisao, "deny", "o force-push decidido no worker tem de chegar como negacao");
      contem(r.razao, "Force-push", "a razao do worker tem de chegar inteira");
    }));

  test("diretorios: mais de 50 directorios distintos e negado (#227)", () =>
    comRepo((d) => {
      const cmd = `${Array.from({ length: 51 }, (_, i) => `cd /tmp/d${i}`).join("; ")}; git commit -m x`;
      const r = corre({ tool_input: { command: cmd }, cwd: d });
      eq(r.decisao, "deny", "51 directorios tem de ser negado");
      contem(r.razao, "directorios", "a razao tem de dizer porque");
    }));

  // A FUGA que este teste dos 51 revelou (ja no `main`): o caminho do `cd` era `\S+`, e levava o `;`
  // colado — `cd <repo-em-main>; git commit` verificava o branch de `<repo>;`, que nao e repo nenhum.
  for (const [nome, sep] of [["`;` colado ao caminho", "; "], ["`;` e outro `cd` antes", "; cd /tmp; cd "]]) {
    test(`diretorios: ${nome} nao esconde um repo em main (#227)`, () => {
      const f = repo("feature/x");
      const m = repo("main");
      try {
        const cmd = sep.startsWith(";") && sep.includes("cd") ? `cd /tmp${sep}${m}; git commit -m x` : `cd ${m}${sep}git commit -m x`;
        eq(corre({ tool_input: { command: cmd }, cwd: f }).decisao, "deny", `"${cmd}" comita em main e tem de ser negado`);
      } finally {
        rmSync(f, { recursive: true, force: true });
        rmSync(m, { recursive: true, force: true });
      }
    });
  }

  // Da leitura do PR #228: o caminho com escapes (a primeira correccao cortava-o na barra — regressao),
  // e as formas que o regex nunca viu (ja no `main`): `{`, `then`, flags antes do caminho, `>` colado.
  const formasDoCd = [
    ["chavetas", (m) => `{ cd ${m}; git commit -m x; }`],
    ["`then`", (m) => `if true; then cd ${m}; git commit -m x; fi`],
    ["`cd -P`", (m) => `cd -P ${m}; git commit -m x`],
    ["`cd --`", (m) => `cd -- ${m}; git commit -m x`],
    ["`>` colado ao caminho", (m) => `pushd ${m}>/dev/null; git commit -m x`],
  ];
  for (const [nome, forma] of formasDoCd) {
    test(`diretorios: ${nome} nao esconde um repo em main (#227)`, () => {
      const f = repo("feature/x");
      const m = repo("main");
      try {
        const cmd = forma(m);
        eq(corre({ tool_input: { command: cmd }, cwd: f }).decisao, "deny", `"${cmd}" comita em main e tem de ser negado`);
      } finally {
        rmSync(f, { recursive: true, force: true });
        rmSync(m, { recursive: true, force: true });
      }
    });
  }

  test("diretorios: um caminho com `\\(` escapado e o repo, nao um corte na barra (#227)", () => {
    const f = repo("feature/x");
    const m = repo("main", "m(1)");
    try {
      const cmd = `cd ${m}/m\\(1\\) && git commit -m x`;
      eq(corre({ tool_input: { command: cmd }, cwd: f }).decisao, "deny", `"${cmd}" comita em main e tem de ser negado`);
    } finally {
      rmSync(f, { recursive: true, force: true });
      rmSync(m, { recursive: true, force: true });
    }
  });

  // Um `git` que nao responde (HEAD num FIFO, montagem de rede pendurada) prendia o worker para la do
  // prazo: o processo nao saia. Agora o `git` tem tecto, e o branch DESCONHECIDO nega.
  test("diretorios: um `git` que nao responde e negado, e nao pendura o guard (#227)", () => {
    const f = repo("feature/x");
    const p = mkdtempSync(join(tmpdir(), "hook-fifo-"));
    try {
      mkdirSync(join(p, ".git"));
      execFileSync("mkfifo", [join(p, ".git", "HEAD")]);
      // O hook corre com o seu PROPRIO tecto: sem o do `git`, ficava pendurado no FIFO, e a suite
      // inteira pendurava sem um FAIL — um controlo negativo que nao reprova (medido).
      const r = spawnSync(process.execPath, [HOOK], {
        input: JSON.stringify({ tool_input: { command: `cd ${p}; git commit -m x` }, cwd: f }),
        encoding: "utf8",
        timeout: 15_000,
        killSignal: "SIGKILL",
      });
      eq(r.error?.code === "ETIMEDOUT" || r.signal === "SIGKILL", false, "o guard pendurou no `git` — o tecto de 5 s nao esta la");
      contem(r.stdout, "nao respondeu", "um branch que nao se consegue ler tem de ser negado, com a razao");
    } finally {
      rmSync(f, { recursive: true, force: true });
      rmSync(p, { recursive: true, force: true });
    }
  });

  test("prazo: um GUARD_PRAZO_MS negativo e ignorado, e nao nega tudo (#227)", () =>
    comRepo((d) => eq(correComPrazo(`echo ${"a".repeat(5000)}`, -5, d).decisao, "allow", "um prazo negativo cai nos 30 s")));

  test("diretorios: 50 directorios ainda se verificam um a um (#227)", () =>
    comRepo((d) => {
      const cmd = `${Array.from({ length: 49 }, (_, i) => `cd /tmp/d${i}`).join("; ")}; git commit -m x`;
      eq(corre({ tool_input: { command: cmd }, cwd: d }).decisao, "allow", "49 + o cwd = 50 passa (feature/x nao e protegido)");
    }));
}
