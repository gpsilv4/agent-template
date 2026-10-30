/**
 * O repo git descartavel onde os testes do portao `Guard Tests` correm o shell REAL do `ci.yml` — {{PROJECT_NAME}}
 *
 * Estava escrito duas vezes, igual, no `tests-portao-ci.mjs` e no `tests-portao-sombra.mjs` (#371 A9, `TP8`).
 * NAO cria a pasta: cada suite faz o seu `mkdtempSync(join(tmpdir(), "<prefixo>"))` com o prefixo LITERAL, porque
 * e assim que o `test-tmp-limpo.mjs` os ve (um prefixo passado por parametro deixava de ser visto, e um mudado
 * de futuro passava calado).
 */
import { execFileSync } from "child_process";
import { accessSync, constants, mkdirSync, writeFileSync } from "fs";
import { delimiter, join } from "path";

/** O git e o shell sem a configuracao de quem corre (um `commit.gpgsign` global partia o commit da fixture). */
export const ISOLADO = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

/** Um `git` no `repo`, com um autor fixo e sem os hooks de quem corre. */
export const gitEm = (repo) => (args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, stdio: "pipe", env: { ...process.env, ...ISOLADO } });

/** As frases que o git falso traduz (de -> para), com acentos: sem eles, a alternativa ASCII de um teste casava. */
export const TRADUCOES = [
  ["Needed a single revision", "É necessária uma única revisão"],
  ["not a git repository", "não é um repositório git"],
  ["gitfile does not point to a valid repository", "o ficheiro .git não aponta para um repositório válido"],
];
/** A frase do git TRADUZIDA? O controlo prova-o pela positiva: so "nao esta a inglesa" passava com uma frase nova do
 *  git que o `sed` nao conhece (o caso do git 2.56, #393), sem ter traduzido nada (`TP2`). */
export const traduzida = (frase) => TRADUCOES.some(([, para]) => frase.includes(para));

/**
 * Um `git` que TRADUZ (#400): poe-se a frente no `PATH`, chama o git real e reescreve em portugues, com acentos, as
 * frases que os testes leem. Nesta maquina e nos runners o git nao vem traduzido, e um caso com `LANG=pt_PT` nao media
 * nada (o precedente: `.claude/hooks/tests/tests-textos-publicos.mjs`). Cria `<pasta>/git-que-traduz/git` e devolve a
 * pasta a por no `PATH` (ou `null`, sem git no `PATH`). O git real resolve-se ANTES, pelo caminho absoluto: pelo nome,
 * o falso chamava-se a si proprio.
 */
export function gitQueTraduz(pasta) {
  const real = (process.env.PATH ?? "").split(delimiter).map((d) => join(d, "git")).find((p) => {
    try {
      accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  // Sem git no `PATH`, `null`: quem chama regista a falha com a razao (o harness monta, nao decide veredictos).
  if (!real) return null;
  const d = join(pasta, "git-que-traduz");
  mkdirSync(d, { recursive: true });
  const troca = TRADUCOES.map(([de, para]) => `-e 's/${de}/${para}/'`).join(" ");
  // Entre aspas SIMPLES: uma pasta do `PATH` com `"`, `$` ou um acento grave nao parte nem expande o script.
  const sh = `#!/bin/sh\nerr=$(mktemp)\n'${real.replace(/'/g, "'\\''")}' "$@" 2>"$err"\ns=$?\nsed ${troca} "$err" >&2\nrm -f "$err"\nexit $s\n`;
  writeFileSync(join(d, "git"), sh, { mode: 0o755 });
  return d;
}

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
