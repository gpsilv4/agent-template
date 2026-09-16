/**
 * Harness do simulador de `/upgrade` — {{PROJECT_NAME}}
 *
 * Os construtores de fixture do `test-simulate-upgrade.mjs`. **NAO e um entry point**: nao corre
 * testes, so os monta.
 *
 * PORQUE VIVE A PARTE: a suite passou as 500 linhas e foi congelada em `TETOS` — e a catraca
 * exigiu a divisao a proxima vez que ela cresceu ("Dividir antes de acrescentar"). Levantar o
 * teto para acomodar crescimento proprio esvazia a catraca; extrair e o que o `core-rules.md`
 * manda. E o mesmo padrao do `test-surface-harness.mjs`: um harness **importa-se**, nao precisa
 * de descoberta.
 *
 * E rende mais do que linhas: tres defeitos da ronda 4 viveram em construtores de fixture (que
 * nao mutavam nada, ou que liam o repo em vez de montarem o que queriam medir). Aqui podem ser
 * exercitados sem montar a simulacao inteira.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { aplicaUpgradeMecanico } from "./lib/upgrade-mecanico.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SIMULADOR = resolve(AQUI, "simulate-upgrade.mjs");

export const git = (dir, args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** Um repo git minimo que passa o guarda "sou o template?": tem `BOOTSTRAP.md` e nao tem
 *  marca. O conteudo e o minimo para o simulador chegar ao passo que se quer medir. */
export function repo({ comTag = null, comMarca = false, semBootstrap = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sim-up-"));
  mkdirSync(join(dir, ".agent", "scripts"), { recursive: true });
  if (!semBootstrap) writeFileSync(join(dir, ".agent/BOOTSTRAP.md"), "# Bootstrap\n");
  if (comMarca) writeFileSync(join(dir, ".agent/.template-version"), "sha: abc1234\n");
  writeFileSync(join(dir, "README.md"), "# repo\n");
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t"]);
  git(dir, ["config", "user.name", "t"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "inicial"]);
  if (comTag) {
    git(dir, ["tag", comTag]);
    // Sem um commit A SEGUIR a tag, a tag E o HEAD — que e o caso do "delta vazio".
  }
  return dir;
}

/** Corre o simulador DENTRO de `dir`. O simulador resolve a raiz a partir do seu proprio
 *  caminho, logo tem de ser copiado para la — correr o daqui mediria ESTE repo. */
export function corre(dir) {
  mkdirSync(join(dir, ".agent", "scripts", "lib"), { recursive: true });
  for (const [de, para] of [
    [SIMULADOR, ".agent/scripts/simulate-upgrade.mjs"],
    [resolve(AQUI, "lib", "upgrade-mecanico.mjs"), ".agent/scripts/lib/upgrade-mecanico.mjs"],
  ]) {
    writeFileSync(join(dir, para), readFileSync(de, "utf8"));
  }
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, ".agent/scripts/simulate-upgrade.mjs")], { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

export const exige = ({ code, out }, { codigo, inclui = [], exclui = [] }) => {
  const p = [];
  if (code !== codigo) p.push(`exit ${code}, esperado ${codigo}`);
  for (const t of inclui) if (!out.includes(t)) p.push(`output devia conter ${JSON.stringify(t)}`);
  for (const t of exclui) if (out.includes(t)) p.push(`output NAO devia conter ${JSON.stringify(t)}`);
  if (p.length) p.push(`--- output ---\n${out.slice(0, 700)}`);
  return p;
};

console.log("\n=== Testes do simulador de /upgrade ===\n");
export const BASE = {
  ".agent/scripts/x.mjs": "// script\n",
  ".claude/hooks/h.mjs": "// hook\n",
  ".agent/rules/anti-patterns-template.md": "# Template\n\n## TP1 — um\n",
  // O ID e MONTADO: escrito por extenso, este ficheiro passava a CITAR um anti-padrao que o
  // template nu nao define, e o Guard 15 reprovava o repo. E a convencao do
  // `tests-anti-patterns.mjs`, e foi o guard que a exigiu aqui tambem.
  ".agent/rules/anti-patterns.md": `# Projeto\n\n> cabecalho\n\n---\n\n## ${"AP" + "1"} — meu\n`,
};

export function cenario({ ontem, hoje, consumidor = null, constantes = [] }) {
  ontem = { ...BASE, ...ontem };
  hoje = { ...BASE, ...hoje };
  if (consumidor) consumidor = { ...BASE, ...consumidor };
  const root = mkdtempSync(join(tmpdir(), "sim-up-root-"));
  for (const [rel, c] of Object.entries(ontem)) {
    if (c === null) continue; // `null` = este ficheiro NAO existe, e e isso que se mede
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), c);
  }
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "ontem"]);
  git(root, ["tag", "v1.0.0"]);
  for (const [rel, c] of Object.entries(hoje)) {
    if (c === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), c);
  }

  const dir = mkdtempSync(join(tmpdir(), "sim-up-cons-"));
  for (const [rel, c] of Object.entries(consumidor ?? ontem)) {
    if (c === null) continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), c);
  }
  mkdirSync(join(dir, ".agent", "context"), { recursive: true });
  writeFileSync(join(dir, ".agent/context/session.md"), "# estado do projeto\n");

  const razoes = [];
  const medido = aplicaUpgradeMecanico({
    dir,
    root,
    tag: "v1.0.0",
    fatal: (m) => {
      // A razao VAI na excepcao. Sem isto, um caso que rebentasse dizia so "__fatal__" e
      // obrigava a instrumentar o motor para se perceber porque — foi o que aconteceu.
      razoes.push(m);
      throw new Error(`__fatal__: ${m}`);
    },
    substituto: "Consumidor",
    constantes,
  });
  return { dir, root, medido, razoes, ler: (rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : null) };
}

export const limpa = (c) => {
  for (const d of [c?.dir, c?.root]) if (d) rmSync(d, { recursive: true, force: true });
};

