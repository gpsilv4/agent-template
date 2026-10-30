/**
 * A TESOURA do `commit-msg` (#399), por commits VERDADEIROS: o hook so corta na tesoura com a forma que o git
 * escreve (comentarios e logo `diff `/`Submodule `, ou nada). Num `-m`/`-F` o git nao corta, e uma tesoura escrita a
 * mao escondia a atribuicao a IA e os nomes que o git guardava.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * Commits e nao mensagens escritas a mao: um caso "com a forma do `-v`" escrito aqui so provava que a regra aceita a
 * forma que ela propria descreve (o `plan-auditor` do #399). Cada caso monta um repo de fixture com o ponteiro, o
 * `lib/` e a lib da lista COPIADOS, uma lista num tmpdir (os nomes sao inventados) e o git sem a config de quem corre
 * (`TP3`). `GIT_EDITOR=true` com `-e -m`: o editor "aceita" a mensagem do `-m` com o template do git a volta.
 */
import { pathToFileURL } from "url";
import { spawnSync } from "child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { registarResultado } from "./harness/test-harness.mjs";
import { VARIAVEL } from "../lib/nomes-proibidos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-commit-msg-tesoura.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const TESOURA = "# ------------------------ >8 ------------------------";
const NOME = "projeto-secreto";

/** Um repo de fixture com o hook ligado; `fn` recebe `git(...)` (com o hook) e `semHook(...)` (para preparar). */
function comRepo(fn) {
  // O prefixo das fixtures do `test-commit-msg` (`lib/tmp-limpo.mjs`): um prefixo novo pedia uma entrada la.
  const dir = mkdtempSync(join(tmpdir(), "commit-msg-test-"));
  try {
    const raiz = join(dir, "repo");
    for (const rel of [".githooks/commit-msg", ".githooks/lib/commit-msg.mjs", ".agent/scripts/lib/nomes-proibidos.mjs", ".agent/scripts/lib/prefixo-commit.mjs"]) {
      mkdirSync(dirname(join(raiz, rel)), { recursive: true });
      copyFileSync(join(ROOT, rel), join(raiz, rel));
    }
    writeFileSync(join(dir, "lista"), `${NOME}\n`);
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k))),
      GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", LC_ALL: "C", GIT_EDITOR: "true", [VARIAVEL]: join(dir, "lista"),
    };
    const corre = (cwd, a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "protocol.file.allow=always", ...a], { cwd, env, encoding: "utf8" });
    corre(raiz, ["init", "-q", "-b", "trabalho"]);
    writeFileSync(join(raiz, ".git/info/exclude"), ".githooks/\n.agent/\n");
    const semHook = (...a) => corre(raiz, ["-c", "core.hooksPath=/dev/null", ...a]);
    const git = (...a) => corre(raiz, ["-c", `core.hooksPath=${join(raiz, ".githooks")}`, ...a]);
    return fn({ dir, raiz, git, semHook, corre });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Um ficheiro com o nome ja commitado (sem hook) e a linha APAGADA no stage: o diff do `-v` traz `-<nome>`. */
function apagaNomeVazado({ raiz, semHook }) {
  writeFileSync(join(raiz, "a.txt"), `um\n${NOME}\n`);
  semHook("add", "a.txt");
  semHook("commit", "-q", "-m", "base");
  writeFileSync(join(raiz, "a.txt"), "um\n");
  semHook("add", "a.txt");
}

/** Recusado pelo hook (status 1) e pela razao certa: um git que nao arranca, ou uma lista ilegivel, nao contam. */
const IA = "atribui o trabalho a uma ferramenta de IA";
const NOMEIA = "nomeia um nome da lista";
const recusou = (r, razao) => [
  ...(r.status === 1 ? [] : [`status ${r.status}, esperado 1 (a recusa do hook)`]),
  ...((r.stderr ?? "").includes(razao) ? [] : [`o stderr nao diz "${razao}": ${(r.stderr ?? "").trim().split("\n").slice(0, 2).join(" / ")}`]),
];
const passou = (r) => (r.status === 0 ? [] : [`o commit foi recusado (status ${r.status}): ${(r.stderr ?? "").trim().split("\n").slice(0, 3).join(" / ")}`]);
const semCommit = (git) => (git("rev-parse", "--verify", "-q", "HEAD").status === 0 ? ["ficou um commit"] : []);

export function registar() {
  registarResultado("commit-msg tesoura: num `-m`, uma atribuicao a IA abaixo de uma tesoura escrita a mao recusa, e nao fica commit (#399)",
    comRepo(({ git }) => {
      const r = git("commit", "-q", "--allow-empty", "-m", "feat: x", "-m", TESOURA, "-m", "Co-Authored-By: Claude <a@b>");
      return [...recusou(r, IA), ...semCommit(git)];
    }));

  registarResultado("commit-msg tesoura: num `-m`, um nome da lista abaixo de uma tesoura escrita a mao recusa (#399)",
    comRepo(({ git }) => {
      const r = git("commit", "-q", "--allow-empty", "-m", "feat: x", "-m", TESOURA, "-m", `visto no ${NOME}`);
      return [...recusou(r, NOMEIA), ...semCommit(git)];
    }));

  registarResultado("commit-msg tesoura: num `-m`, uma linha `diff ` que nao e a do git (`diff entre versoes`) nao faz a tesoura valer",
    comRepo(({ git }) => {
      const r = git("commit", "-q", "--allow-empty", "-m", "feat: x", "-m", `${TESOURA}\ndiff entre versoes\nCo-Authored-By: Claude <a@b>`);
      return [...recusou(r, IA), ...semCommit(git)];
    }));

  registarResultado("commit-msg tesoura: num `-m`, uma tesoura so com comentarios abaixo (a forma) nao esconde um `# <nome>` (#399)",
    comRepo(({ git }) => [...recusou(git("commit", "-q", "--allow-empty", "-m", "feat: x", "-m", `${TESOURA}\n# ${NOME}`), NOMEIA), ...semCommit(git)]));

  registarResultado("commit-msg tesoura: um `git commit -v` verdadeiro que APAGA um nome vazado passa (o diff abaixo da tesoura nao conta)",
    comRepo((ctx) => { apagaNomeVazado(ctx); return passou(ctx.git("commit", "-q", "-v", "-e", "-m", "fix: tirar")); }));

  registarResultado("commit-msg tesoura: com `commit.cleanup=scissors`, o `-v` que apaga um nome vazado passa",
    comRepo((ctx) => { apagaNomeVazado(ctx); return passou(ctx.git("-c", "commit.cleanup=scissors", "commit", "-q", "-v", "-e", "-m", "fix: tirar")); }));

  registarResultado("commit-msg tesoura: com `diff.submodule=log`, um `-v` com o submodulo (`Submodule s a..b:`) nao le os assuntos dele",
    comRepo(({ dir, raiz, git, semHook, corre }) => {
      const sub = join(dir, "sub");
      mkdirSync(sub);
      corre(sub, ["init", "-q", "-b", "trabalho"]);
      corre(sub, ["commit", "-q", "--allow-empty", "-m", "um"]);
      semHook("submodule", "add", "-q", sub, "s");
      semHook("commit", "-q", "-m", "com o submodulo");
      corre(sub, ["commit", "-q", "--allow-empty", "-m", `visto no ${NOME}`]);
      corre(join(raiz, "s"), ["pull", "-q"]);
      semHook("add", "s");
      return passou(git("-c", "diff.submodule=log", "commit", "-q", "-v", "-e", "-m", "chore: o submodulo"));
    }));

  registarResultado("commit-msg tesoura: com `commit.cleanup=scissors`, um branch com um nome da lista (o bloco de estado abaixo da tesoura) recusa",
    comRepo(({ raiz, git, semHook }) => {
      semHook("switch", "-q", "-c", `feature/${NOME}`);
      writeFileSync(join(raiz, "b.txt"), "x\n");
      semHook("add", "b.txt");
      return recusou(git("-c", "commit.cleanup=scissors", "commit", "-q", "-e", "-m", "feat: x"), NOMEIA);
    }));

  registarResultado("commit-msg tesoura: o controlo — o mesmo `commit.cleanup=scissors` num branch sem nomes passa",
    comRepo(({ raiz, git, semHook }) => {
      writeFileSync(join(raiz, "b.txt"), "x\n");
      semHook("add", "b.txt");
      return passou(git("-c", "commit.cleanup=scissors", "commit", "-q", "-e", "-m", "feat: x"));
    }));
}
