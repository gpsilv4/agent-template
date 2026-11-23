/**
 * A rede de arranque: um hook ligado VAZIO, EM FALTA, ou com uma lib vazia, avisa no `SessionStart` (#589) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: no derivado A, uma copia por redireccionamento do `$TPL` (`git show ... > f`) com o clone apagado
 * deixou seis hooks VAZIOS. Medido a 20 nov: um hook vazio sai `0`, e um que importe uma lib vazia sai `1` — no Claude
 * Code so o `2` bloqueia, logo os dois desligam a fronteira em silencio. O `SessionStart` nao pode bloquear; pode DIZER.
 *
 * A fixture COPIA o `session-context.mjs` e as suas libs para um repo temporario: o `correNoCwd` corre o hook do repo
 * real, e uma lib dele vazia (o caso B4) so se prova numa copia.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-hooks-vazios.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .claude/hooks/tests/test-hooks.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const HOOKS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AVISO = "FRONTEIRA DESLIGADA";

/** Um repo com o `session-context` e as suas libs COPIADOS, um hook `guarda.mjs` ligado no `settings.json` que importa
 *  `./lib/dep.mjs`, e o que `mexe(raiz)` mudar. Devolve `{ codigo, ctx }`. */
function arranca(mexe) {
  const raiz = mkdtempSync(join(tmpdir(), "hook-vazio-"));
  try {
    const h = join(raiz, ".claude/hooks");
    mkdirSync(join(h, "lib"), { recursive: true });
    for (const f of ["session-context.mjs", "lib/porcelain.mjs", "lib/protegidos.mjs"]) writeFileSync(join(h, f), readFileSync(join(HOOKS, f)));
    // Por namespace, e nao `{ x }`: o fecho do modo parcial le os nomes importados de um `import { }` em qualquer texto,
    // e isto e DADOS de uma fixture (a lib dela nao existe no repo).
    writeFileSync(join(h, "guarda.mjs"), 'import * as d from "./lib/dep.mjs";\nprocess.exit(d.x);\n');
    writeFileSync(join(h, "lib/dep.mjs"), "export const x = 0;\n");
    const ligado = (n) => ({ hooks: [{ type: "command", command: `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/${n}` }] });
    writeFileSync(join(raiz, ".claude/settings.json"), JSON.stringify({ hooks: { PreToolUse: [ligado("guarda.mjs")], SessionStart: [ligado("session-context.mjs")] } }));
    execFileSync("git", ["init", "-q", "-b", "feature/x"], { cwd: raiz });
    mexe?.(raiz);
    let codigo = 0, out = "";
    try {
      out = execFileSync("node", [join(h, "session-context.mjs")], { cwd: raiz, input: "{}", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: raiz } });
    } catch (err) {
      codigo = err?.status ?? -1;
      out = String(err?.stdout ?? "");
    }
    const ctx = out.trim() ? JSON.parse(out).hookSpecificOutput?.additionalContext ?? "" : "";
    return { codigo, ctx };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

export function registar({ test, eq, contem }) {
  const avisa = (r, ...trechos) => {
    eq(r.codigo, 0, "o SessionStart sai sempre 0 (o contrato)");
    contem(r.ctx, AVISO);
    for (const t of trechos) contem(r.ctx, t);
  };
  const calado = (r) => {
    eq(r.codigo, 0, "o SessionStart sai sempre 0 (o contrato)");
    if (r.ctx.includes(AVISO)) throw new Error(`nao devia avisar: ${r.ctx}`);
    contem(r.ctx, "Branch: **feature/x**");
  };
  const esvazia = (rel, conteudo = "") => (raiz) => writeFileSync(join(raiz, rel), conteudo);

  // Cada caso afirma a CATEGORIA ("vazio(s)" ou "em falta"): trocar as duas listas no hook tem de ficar vermelho.
  const VAZIO = "vazio(s): `", FALTA = "em falta: `";
  test("hooks vazios: o controlo — tudo cheio, nenhum aviso (#589)", () => calado(arranca()));
  test("hooks vazios: um hook ligado VAZIO avisa (#589)", () => avisa(arranca(esvazia(".claude/hooks/guarda.mjs")), VAZIO, ".claude/hooks/guarda.mjs"));
  test("hooks vazios: um hook ligado so com espacos conta como vazio (#589)", () =>
    avisa(arranca(esvazia(".claude/hooks/guarda.mjs", " \n\t \n")), VAZIO, ".claude/hooks/guarda.mjs"));
  test("hooks vazios: um hook ligado EM FALTA avisa (#589)", () =>
    avisa(arranca((raiz) => rmSync(join(raiz, ".claude/hooks/guarda.mjs"))), FALTA, ".claude/hooks/guarda.mjs"));
  test("hooks vazios: uma lib VAZIA que um hook ligado importa avisa (#589)", () =>
    avisa(arranca(esvazia(".claude/hooks/lib/dep.mjs")), VAZIO, ".claude/hooks/lib/dep.mjs"));
  test("hooks vazios: uma lib EM FALTA que um hook ligado importa avisa (#589)", () =>
    avisa(arranca((raiz) => rmSync(join(raiz, ".claude/hooks/lib/dep.mjs"))), FALTA, ".claude/hooks/lib/dep.mjs"));
  // Do leitor 1: um hook ligado no `settings.local.json`, e um import so por efeito (`import "./x.mjs"`).
  test("hooks vazios: um hook ligado no settings.local.json, vazio, avisa (#589)", () =>
    avisa(arranca((raiz) => {
      writeFileSync(join(raiz, ".claude/hooks/local.mjs"), "");
      writeFileSync(join(raiz, ".claude/settings.local.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "node .claude/hooks/local.mjs" }] }] } }));
    }), VAZIO, ".claude/hooks/local.mjs"));
  test("hooks vazios: uma lib importada so por efeito, vazia, avisa (#589)", () =>
    avisa(arranca((raiz) => {
      writeFileSync(join(raiz, ".claude/hooks/guarda.mjs"), 'import "./lib/efeito.mjs";\nprocess.exit(0);\n');
      writeFileSync(join(raiz, ".claude/hooks/lib/efeito.mjs"), "");
    }), VAZIO, ".claude/hooks/lib/efeito.mjs"));
  // Do leitor 1: o `allow` nomeia hooks, e nao os liga. Um hook tirado (ficheiro e chave `hooks`) com a entrada do
  // `allow` deixada NAO e a fronteira desligada — o Guard 11b tambem so le a chave `hooks`.
  test("hooks vazios: uma entrada do allow para um hook que nao existe nao avisa (#589)", () =>
    calado(arranca((raiz) => {
      const s = JSON.parse(readFileSync(join(raiz, ".claude/settings.json"), "utf8"));
      s.permissions = { allow: ["Bash(node .claude/hooks/tirado.mjs)"] };
      writeFileSync(join(raiz, ".claude/settings.json"), JSON.stringify(s));
    })));
  test("hooks vazios: um `.githooks/x.mjs` na chave hooks nao e um hook do Claude em falta (#589)", () =>
    calado(arranca((raiz) => {
      const s = JSON.parse(readFileSync(join(raiz, ".claude/settings.json"), "utf8"));
      s.hooks.Stop = [{ hooks: [{ type: "command", command: "node .githooks/x.mjs" }] }];
      writeFileSync(join(raiz, ".claude/settings.json"), JSON.stringify(s));
    })));
  // R4: o fecho dos imports e RECURSIVO — a lib de uma lib.
  test("hooks vazios: a lib de uma lib, vazia, avisa (#589)", () =>
    avisa(arranca((raiz) => {
      writeFileSync(join(raiz, ".claude/hooks/lib/dep.mjs"), 'export { x } from "./funda.mjs";\n');
      writeFileSync(join(raiz, ".claude/hooks/lib/funda.mjs"), "");
    }), ".claude/hooks/lib/funda.mjs"));
  // R5: so o que esta LIGADO e o que isso importa. Uma lib vazia que ninguem importa nao e a fronteira.
  test("hooks vazios: uma lib vazia que nenhum hook ligado importa nao avisa (#589)", () =>
    calado(arranca(esvazia(".claude/hooks/lib/solta.mjs"))));
  // B4: uma lib do PROPRIO `session-context` vazia — ele avisa, mantem o resto do contexto e sai 0.
  test("hooks vazios: com a lib de porcelain do proprio hook vazia, avisa e mantem o branch (#589)", () => {
    const r = arranca((raiz) => {
      esvazia(".claude/hooks/lib/porcelain.mjs")(raiz);
      // Ligada pelo `session-context`, que esta no `settings.json`: o fecho dos imports chega a ela.
    });
    avisa(r, ".claude/hooks/lib/porcelain.mjs");
    contem(r.ctx, "Branch: **feature/x**");
    // Sem a lib, a arvore nao se mediu: dizer "limpa" era uma afirmacao falsa (do leitor 1).
    if (/Arvore de trabalho limpa|Por commitar/.test(r.ctx)) throw new Error(`sem a lib, nao devia afirmar a arvore: ${r.ctx}`);
  });
  test("hooks vazios: com a lib dos protegidos vazia, avisa e mantem o branch (#589)", () => {
    const r = arranca(esvazia(".claude/hooks/lib/protegidos.mjs"));
    avisa(r, ".claude/hooks/lib/protegidos.mjs");
    contem(r.ctx, "Branch: **feature/x**");
  });
  // R1: um `settings.json` partido nao rebenta nada — o resto do contexto continua.
  test("hooks vazios: um settings.json partido fica calado, e o contexto continua (#589)", () =>
    calado(arranca(esvazia(".claude/settings.json", "{ partido"))));
}
