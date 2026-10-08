#!/usr/bin/env node
/**
 * Testes do criador de Releases (`.github/scripts/release-da-tag.sh`) — {{PROJECT_NAME}}
 *
 * O que se afirma: os ARGUMENTOS que o script passa ao `gh release create`, para cada tipo de tag.
 * Um erro aqui so se via no Release seguinte, publicado e visivel (#277): uma `rc` como "Latest",
 * uma correcao antiga (`v1.0.1` publicada depois da `v1.2.0`) a roubar a "Latest", notas contadas
 * desde a `rc` e nao desde a versao final, ou o titulo de um commit qualquer numa tag leve.
 *
 * Um repo sintetico (o `origin` e ele proprio, para o `git fetch --tags`) e um `gh` FALSO no
 * `PATH`, que imprime um argumento por linha. Nada sai para a rede.
 *
 *   node .agent/scripts/tests/test-release-da-tag.mjs
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(AQUI, "..", "..", "..");
const SCRIPT = join(ROOT, ".github/scripts/release-da-tag.sh");

let passed = 0;
const falhas = [];

// `gh release view <tag>` so diz que existe para a tag em `EXISTE_TAG` (um `view` sem a tag mostrava
// o mais recente, e todas saiam "ja existe"); `gh release create` imprime cada argumento numa linha
// `ARG:`, que e o que os testes leem.
const GH_FALSO = `#!/bin/bash
if [ "$1 $2" = "release view" ]; then [ -n "$3" ] && [ "$3" = "\${EXISTE_TAG:-}" ] && exit 0 || exit 1; fi
for a in "$@"; do printf 'ARG:%s\\n' "$a"; done
`;

const sandbox = mkdtempSync(join(tmpdir(), "release-test-"));
try {
  const repo = join(sandbox, "repo");
  const bin = join(sandbox, "bin");
  mkdirSync(repo);
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), GH_FALSO);
  chmodSync(join(bin, "gh"), 0o755);

  const g = (...a) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "tag.gpgSign=false", "-c", "commit.gpgSign=false", ...a], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  g("init", "-q", "-b", "main");
  g("commit", "-q", "--allow-empty", "-m", "c1");
  g("tag", "-a", "v1.0.0", "-m", "v1.0.0 — primeira", "-m", "corpo da primeira");
  g("commit", "-q", "--allow-empty", "-m", "fix: algo do commit", "-m", "corpo do commit");
  g("tag", "-a", "v1.1.0-rc1", "-m", "rc");
  g("tag", "v1.1.0"); // LEVE: sem mensagem
  g("commit", "-q", "--allow-empty", "-m", "c3");
  g("tag", "-a", "v1.2.0", "-m", "Sem prefixo no titulo");
  g("tag", "-a", "v1.0.1", "-m", "v1.0.1 — correcao antiga", "HEAD~2"); // publicada DEPOIS da v1.2.0
  g("tag", "-a", "v1.3.0-rc1", "-m", "rc acima da final mais alta"); // uma rc nunca e a "maior"
  g("remote", "add", "origin", repo);

  /** Corre o script para `tag` e devolve `{ code, out, args }` (os argumentos do `gh`). */
  const corre = (tag, env = {}, cwd = repo) => {
    const opts = { cwd, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env } };
    let code = 0;
    let out;
    try {
      out = execFileSync("bash", [SCRIPT, tag], { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      code = err.status ?? -1;
      out = (err.stdout ?? "") + (err.stderr ?? "");
    }
    const args = out.split("\n").filter((l) => l.startsWith("ARG:")).map((l) => l.slice(4));
    return { code, out, args };
  };
  /** O valor que segue `flag` nos argumentos, ou `undefined`. */
  const valor = (args, flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

  function test(nome, tag, verifica, env, cwd) {
    const r = corre(tag, env, cwd);
    // Os posicionais: `release create <tag>` (um `edit`, ou a tag em falta, nao cria este Release).
    const posicionais = (a) => (a.length && a.slice(0, 3).join(" ") !== `release create ${tag}` ? [`posicionais: ${a.slice(0, 3).join(" ")}`] : []);
    const p = r.code === 0 ? [...posicionais(r.args), ...verifica(r)] : [`exit ${r.code}`];
    if (p.length) {
      falhas.push(nome);
      console.log(`  FAIL  ${nome}`);
      for (const x of p) console.log(`          ${x}`);
      console.log(r.out.split("\n").map((l) => `          | ${l}`).join("\n"));
    } else {
      passed++;
      console.log(`  PASS  ${nome}`);
    }
  }
  const espera = (cond, msg) => (cond ? [] : [msg]);

  test("tag anotada: titulo e notas da tag; a primeira nao tem anterior", "v1.0.0", ({ args }) => [
    ...espera(valor(args, "--title") === "v1.0.0 — primeira", `titulo: ${valor(args, "--title")}`),
    ...espera(valor(args, "--notes") === "corpo da primeira", `notas: ${valor(args, "--notes")}`),
    ...espera(!args.includes("--notes-start-tag"), "a primeira versao nao tem anterior"),
    ...espera(args.includes("--generate-notes") && args.includes("--verify-tag"), "falta --generate-notes/--verify-tag"),
  ]);
  test("pre-release: --prerelease e NUNCA Latest; anterior e a versao FINAL", "v1.1.0-rc1", ({ args }) => [
    ...espera(args.includes("--prerelease"), "falta --prerelease"),
    ...espera(args.includes("--latest=false") && !args.includes("--latest=true"), "uma rc nunca e Latest"),
    ...espera(valor(args, "--notes-start-tag") === "v1.0.1", `anterior: ${valor(args, "--notes-start-tag")}`),
  ]);
  test("tag LEVE: avisa e o titulo e so o nome (nao o de um commit)", "v1.1.0", ({ args, out }) => [
    ...espera(out.includes("::warning::"), "falta o ::warning::"),
    ...espera(valor(args, "--title") === "v1.1.0", `titulo: ${valor(args, "--title")}`),
    ...espera(valor(args, "--notes") === "", `notas de uma tag leve vem do commit: ${valor(args, "--notes")}`),
    ...espera(!args.includes("--prerelease"), "uma final nao e pre-release"),
    // Logo abaixo dela esta a `v1.1.0-rc1`: as notas contam desde a FINAL anterior, nao da rc.
    ...espera(valor(args, "--notes-start-tag") === "v1.0.1", `anterior: ${valor(args, "--notes-start-tag")}`),
  ]);
  test("a versao final MAIS ALTA e a Latest; notas desde a final anterior (nao a rc)", "v1.2.0", ({ args }) => [
    ...espera(args.includes("--latest=true"), "a mais alta tem de ser Latest"),
    ...espera(valor(args, "--title") === "v1.2.0 — Sem prefixo no titulo", `titulo: ${valor(args, "--title")}`),
    ...espera(valor(args, "--notes-start-tag") === "v1.1.0", `anterior: ${valor(args, "--notes-start-tag")}`),
  ]);
  test("correcao antiga publicada depois NAO rouba a Latest", "v1.0.1", ({ args }) => [
    ...espera(args.includes("--latest=false") && !args.includes("--latest=true"), "uma final que nao e a mais alta nao e Latest"),
    ...espera(valor(args, "--notes-start-tag") === "v1.0.0", `anterior: ${valor(args, "--notes-start-tag")}`),
  ]);
  test("Release ja existente: nao faz nada (idempotente)", "v1.2.0", ({ args, out }) => [
    ...espera(args.length === 0, "nao devia chamar o gh release create"),
    ...espera(out.includes("ja existe"), "devia dize-lo"),
  ], { EXISTE_TAG: "v1.2.0" });
  test("OUTRO Release existente nao impede criar este", "v1.2.0", ({ args }) => [
    ...espera(args.includes("--latest=true"), "devia criar o Release da v1.2.0"),
  ], { EXISTE_TAG: "v1.0.0" });
  // Um CLONE com as tags atrasadas: o upstream ganha a `v1.3.0` depois do clone. So o
  // `git fetch --tags` a traz, e sem ela a `v1.2.0` sairia como a Latest. Vai no fim: muda o upstream.
  const clone = join(sandbox, "clone");
  execFileSync("git", ["clone", "-q", repo, clone], { stdio: "ignore" });
  g("tag", "-a", "v1.3.0", "-m", "v1.3.0 — so no upstream");
  test("as tags do origin contam: um clone atrasado nao faz Latest uma versao que ja nao e a mais alta", "v1.2.0", ({ args }) => [
    ...espera(args.includes("--latest=false") && !args.includes("--latest=true"), "a v1.3.0 do origin e a mais alta"),
  ], {}, clone);
  // No clone a `v1.0.0` e LEVE e no origin e anotada (o que um checkout de tag pode trazer): o
  // `--force` do fetch repoe a anotada, e o titulo vem da mensagem dela.
  execFileSync("git", ["tag", "-f", "v1.0.0", "v1.0.0^{commit}"], { cwd: clone, stdio: "ignore" });
  test("no clone a tag e leve e no origin anotada: o titulo vem da anotada", "v1.0.0", ({ args, out }) => [
    ...espera(valor(args, "--title") === "v1.0.0 — primeira", `titulo: ${valor(args, "--title")}`),
    ...espera(!out.includes("::warning::"), "nao devia avisar de tag leve"),
  ], {}, clone);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
if (falhas.length) process.exit(1);
console.log("\n  Todos os testes do criador de Releases passaram.");
