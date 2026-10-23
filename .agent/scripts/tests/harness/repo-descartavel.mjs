/**
 * O repo git descartavel onde os testes do portao `Guard Tests` correm o shell REAL do `ci.yml` — {{PROJECT_NAME}}
 *
 * Estava escrito duas vezes, igual, no `tests-portao-ci.mjs` e no `tests-portao-sombra.mjs` (#371 A9, `TP8`).
 * NAO cria a pasta: cada suite faz o seu `mkdtempSync(join(tmpdir(), "<prefixo>"))` com o prefixo LITERAL, porque
 * e assim que o `test-tmp-limpo.mjs` os ve (um prefixo passado por parametro deixava de ser visto, e um mudado
 * de futuro passava calado).
 */
import { execFileSync } from "child_process";

/** O git e o shell sem a configuracao de quem corre (um `commit.gpgsign` global partia o commit da fixture). */
export const ISOLADO = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

/** Um `git` no `repo`, com um autor fixo e sem os hooks de quem corre. */
export const gitEm = (repo) => (args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, stdio: "pipe", env: { ...process.env, ...ISOLADO } });

/**
 * Corre o `corpo` do passo como o runner o corre: `bash -e -c` (o shell por omissao do GitHub), ou so `bash -c`
 * com `semE`, para provar que o corpo falha fechado POR SI (#372 A2). `semVars`: as variaveis de quem corre os
 * testes que NAO entram (um `VARREDURA_PLANO` herdado e um caso que o portao tem de cobrir, nao ruido). Devolve
 * `{ code, out }`; nunca lanca.
 */
export function correCorpo(corpo, { cwd, env = {}, runnerTemp, semE = false, semVars = [] }) {
  const herdado = { ...process.env };
  for (const k of semVars) delete herdado[k];
  try {
    const out = execFileSync("bash", [...(semE ? [] : ["-e"]), "-c", corpo], { cwd, stdio: "pipe", env: { ...herdado, ...ISOLADO, ...env, RUNNER_TEMP: runnerTemp } }).toString();
    return { code: 0, out };
  } catch (err) {
    return { code: typeof err.status === "number" ? err.status : -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}
