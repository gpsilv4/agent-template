/**
 * Testes do CLI da vista do backlog (`backlog-board.mjs`, #446): os argumentos, o `.gitignore`, o erro de leitura e o
 * `--vigiar` — {{PROJECT_NAME}}
 *
 * Cada caso corre o CLI numa COPIA (ele ancora-se no proprio caminho), num repo git descartavel com o prefixo
 * `board-test-` (`lib/tmp-limpo.mjs`). O `--vigiar` corre como processo filho: o teste espera pelo `a vigiar`, deixa
 * assentar o watch (o FSEvents do macOS arma-se depois de o `watch` devolver), mede pelo contador `gerada N` do stdout
 * (e nao pelos bytes), espera por polling com um prazo, e mata o filho num `finally` — um vigia vivo pendurava o CI.
 */
import { spawn, spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ACTIVE_OK, ARCHIVE_OK } from "./harness/test-backlog-harness.mjs";

const SCRIPTS = join(import.meta.dirname, "..");
const LIBS = ["backlog-itens.mjs", "backlog-calculo.mjs", "backlog-regras.mjs", "backlog-vista.mjs", "backlog-vista-pecas.mjs", "backlog-vista-assets.mjs"];
const SAIDA = ".agent/backlog-board.html";

let passed = 0;
const falhas = [];
async function caso(nome, fn) {
  try {
    const erros = await fn();
    if (erros.length) throw new Error(erros.join("\n          "));
    passed++;
    console.log(`  PASS  ${nome}`);
  } catch (err) {
    falhas.push(nome);
    console.log(`  FAIL  ${nome}\n          ${err instanceof Error ? err.message : String(err)}`);
  }
}
const espera = (cond, msg) => (cond ? [] : [msg]);
const git = (dir, args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

/** Uma copia do CLI e das libs, com o backlog valido, num repo git com a vista no `.gitignore` (ou sem git). */
function sandbox({ gitignore = true, comGit = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "board-test-"));
  mkdirSync(join(dir, ".agent/scripts/lib"), { recursive: true });
  mkdirSync(join(dir, ".agent/context"), { recursive: true });
  cpSync(join(SCRIPTS, "backlog-board.mjs"), join(dir, ".agent/scripts/backlog-board.mjs"));
  for (const l of LIBS) cpSync(join(SCRIPTS, "lib", l), join(dir, ".agent/scripts/lib", l));
  writeFileSync(join(dir, ".agent/context/backlog.md"), ACTIVE_OK);
  writeFileSync(join(dir, ".agent/context/backlog-archive.md"), ARCHIVE_OK);
  if (comGit) {
    git(dir, ["init", "-q"]);
    if (gitignore) writeFileSync(join(dir, ".gitignore"), `${SAIDA}\n${SAIDA}.tmp\n`);
  }
  return dir;
}
// Com um prazo: um CLI que devia recusar e arranca o vigia (uma recusa desligada) ficava pendurado; assim e uma falha.
const corre = (dir, args = []) => spawnSync("node", [join(dir, ".agent/scripts/backlog-board.mjs"), ...args], { cwd: dir, encoding: "utf8", timeout: 15000, killSignal: "SIGKILL" });
const vistaDe = (dir) => readFileSync(join(dir, SAIDA), "utf8");

console.log("\n  Uma vez\n");
await caso("gera a vista, e diz onde esta", async () => {
  const dir = sandbox();
  try {
    const r = corre(dir);
    return [...espera(r.status === 0, `saiu ${r.status}: ${r.stderr}`), ...espera(existsSync(join(dir, SAIDA)) && vistaDe(dir).includes("<title>Backlog</title>"), "sem a vista"), ...espera(r.stdout.includes("gerada 1"), r.stdout)];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
for (const [nome, args, frase] of [
  ["um argumento desconhecido", ["--vigar"], "argumento desconhecido: --vigar"],
  ["o --espera sem o --vigiar", ["--espera=50"], "so fazem sentido com o --vigiar"],
  ["um --espera que nao e um inteiro", ["--vigiar", "--espera=abc"], "--espera quer um inteiro"],
  // `Number("")` e 0: sem a recusa, um `--batida=` vazio desligava a batida (e o CLI ficava a vigiar ate ao prazo).
  ["um --batida vazio", ["--vigiar", "--batida="], "--batida quer um inteiro"],
  // Acima de 2^31-1 ms o Node poe o intervalo a 1 ms.
  ["um --batida acima do tecto de um temporizador", ["--vigiar", "--batida=2147483648"], "--batida quer um inteiro"],
]) {
  await caso(`recusa: ${nome}`, async () => {
    const dir = sandbox();
    try {
      const r = corre(dir, args);
      return [...espera(r.status === 2, `saiu ${r.status}`), ...espera(r.stderr.includes(frase), r.stderr), ...espera(!existsSync(join(dir, SAIDA)), "gerou na mesma")];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

console.log("\n  Nunca se publica\n");
await caso("sem a linha no .gitignore, recusa (e nao gera)", async () => {
  const dir = sandbox({ gitignore: false });
  try {
    const r = corre(dir);
    return [...espera(r.status === 2 && r.stderr.includes("nao esta no .gitignore"), `${r.status}: ${r.stderr}`), ...espera(!existsSync(join(dir, SAIDA)), "gerou")];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
await caso("so com a linha da vista (sem a do temporario), recusa e nomeia o .tmp", async () => {
  const dir = sandbox({ gitignore: false });
  try {
    writeFileSync(join(dir, ".gitignore"), `${SAIDA}\n`);
    const r = corre(dir);
    return [...espera(r.status === 2 && r.stderr.includes(`${SAIDA}.tmp nao esta no .gitignore`), `${r.status}: ${r.stderr}`), ...espera(!existsSync(join(dir, SAIDA)), "gerou")];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
await caso("com a vista ja commitada, diz `git rm --cached`", async () => {
  const dir = sandbox({ gitignore: false });
  try {
    mkdirSync(join(dir, ".agent"), { recursive: true });
    writeFileSync(join(dir, SAIDA), "x");
    git(dir, ["add", SAIDA]);
    writeFileSync(join(dir, ".gitignore"), `${SAIDA}\n`);
    const r = corre(dir);
    return espera(r.status === 2 && r.stderr.includes("git rm --cached"), `${r.status}: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
await caso("CONTROLO: fora de um repo git, gera", async () => {
  const dir = sandbox({ comGit: false });
  try {
    const r = corre(dir);
    return espera(r.status === 0 && existsSync(join(dir, SAIDA)), `${r.status}: ${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log("\n  Um backlog que nao se le\n");
await caso("a vista anterior fica, com UMA faixa de erro (e nao acumula)", async () => {
  const dir = sandbox();
  try {
    corre(dir);
    // A vista anterior como a deixa um --vigiar morto a meio (`"vigiar":true`): o caminho de erro tem de a reescrever
    // com o modo de AGORA — senao o `"vigiar":false` abaixo ja la estava, e o caso nao provava nada.
    writeFileSync(join(dir, SAIDA), vistaDe(dir).replace('"vigiar":false', '"vigiar":true'));
    const ctx = join(dir, ".agent/context/backlog.md");
    rmSync(ctx);
    mkdirSync(ctx); // EISDIR: um erro de leitura que funciona tambem como root
    corre(dir);
    corre(dir);
    const v = vistaDe(dir);
    return [
      ...espera((v.match(/class="erro"/g) ?? []).length === 1, `faixas: ${(v.match(/class="erro"/g) ?? []).length}`),
      ...espera(v.includes("nao consegui ler o backlog"), "sem a mensagem"),
      ...espera(v.includes('href="#t-B2"'), "perdeu os cartoes da vista anterior"),
      // O JSON diz o erro (sem o "parou", que seria falso) e o modo de AGORA (uma vez: sem recarregar).
      ...espera(/"vigiar":false/.test(v) && /"erro":true/.test(v), "o JSON da vista anterior nao diz o erro"),
    ];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
await caso("sem uma vista anterior, a pagina e so o erro", async () => {
  const dir = sandbox();
  try {
    const ctx = join(dir, ".agent/context/backlog.md");
    rmSync(ctx);
    mkdirSync(ctx);
    const r = corre(dir);
    const v = vistaDe(dir);
    return [
      ...espera(r.status === 0, `saiu ${r.status}`),
      ...espera(v.includes("nao consegui ler o backlog") && !v.includes("quadro"), "a pagina"),
      // O charset (a mensagem pode ter acentos); e, gerada uma vez, sem refresh (o caso do --vigiar esta mais abaixo).
      ...espera(v.includes('<meta charset="utf-8">') && !v.includes("http-equiv"), `o esqueleto: ${v.slice(0, 160)}`),
    ];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log("\n  O --vigiar\n");
const ESPERA = 50;
const PRAZO = 20000;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/** Um vigia num processo filho: o contador `gerada N`, e a espera pelo `a vigiar`. */
function vigia(dir, batida = 0) {
  const p = spawn("node", [join(dir, ".agent/scripts/backlog-board.mjs"), "--vigiar", `--espera=${ESPERA}`, `--batida=${batida}`], { cwd: dir });
  const v = { p, saida: "", n: () => Math.max(0, ...[...v.saida.matchAll(/gerada (\d+)/g)].map((m) => Number(m[1]))) };
  p.stdout.on("data", (d) => (v.saida += d));
  p.stderr.on("data", (d) => (v.saida += d));
  return v;
}
async function ate(cond, prazo = PRAZO) {
  const fim = Date.now() + prazo;
  while (Date.now() < fim) {
    if (cond()) return true;
    await dorme(25);
  }
  return cond();
}
/** Grava ate o contador passar `base` (o 1.o evento pode perder-se enquanto o watch arma), com um prazo. */
async function gravaAteMudar(v, base, grava) {
  const fim = Date.now() + PRAZO;
  while (Date.now() < fim) {
    grava();
    if (await ate(() => v.n() > base, ESPERA * 20)) return true;
  }
  return false;
}
async function comVigia(fn, prep = () => {}, batida = 0) {
  const dir = sandbox();
  prep(dir);
  const v = vigia(dir, batida);
  try {
    if (!(await ate(() => v.saida.includes("a vigiar")))) return [`o vigia nao arrancou: ${v.saida}`];
    await dorme(ESPERA * 2); // assentar o watch antes de medir a linha de base
    return await fn(dir, v);
  } finally {
    v.p.kill("SIGKILL");
    await ate(() => v.p.exitCode !== null || v.p.signalCode !== null, 5000);
    rmSync(dir, { recursive: true, force: true });
  }
}
const ctxDe = (dir, f) => join(dir, ".agent/context", f);

await caso("com o --vigiar e sem vista anterior, a pagina de erro recarrega-se sozinha (nao tem o script da vista)", async () =>
  comVigia(
    async (dir) => espera(await ate(() => existsSync(join(dir, SAIDA)) && vistaDe(dir).includes('<meta http-equiv="refresh" content="5">')), `sem refresh: ${existsSync(join(dir, SAIDA)) ? vistaDe(dir).slice(0, 200) : "sem vista"}`),
    (dir) => {
      rmSync(ctxDe(dir, "backlog.md"));
      mkdirSync(ctxDe(dir, "backlog.md"));
    }
  ));
await caso("gravar no sitio volta a gerar", async () =>
  comVigia(async (dir, v) => {
    const base = v.n();
    return espera(await gravaAteMudar(v, base, () => writeFileSync(ctxDe(dir, "backlog.md"), `${ACTIVE_OK}\n`)), `nao voltou a gerar: ${v.saida}`);
  }));
await caso("gravar por rename (um editor) volta a gerar, e o seguinte tambem (o watch nao ficou no inode antigo)", async () =>
  comVigia(async (dir, v) => {
    const grava = () => {
      writeFileSync(ctxDe(dir, "x.tmp"), `${ACTIVE_OK}\n`);
      renameSync(ctxDe(dir, "x.tmp"), ctxDe(dir, "backlog.md"));
    };
    const b1 = v.n();
    const um = await gravaAteMudar(v, b1, grava);
    const b2 = v.n();
    const dois = await gravaAteMudar(v, b2, grava);
    return [...espera(um, "o 1.o rename"), ...espera(dois, "o 2.o rename (o watch perdeu o ficheiro)")];
  }));
await caso("o arquivo criado depois de arrancar volta a gerar", async () =>
  comVigia(
    async (dir, v) => espera(await gravaAteMudar(v, v.n(), () => writeFileSync(ctxDe(dir, "backlog-archive.md"), ARCHIVE_OK)), `nao voltou a gerar: ${v.saida}`),
    (dir) => rmSync(ctxDe(dir, "backlog-archive.md"))
  ));
await caso("CONTROLO: sem gravar (ou a gravar outro ficheiro), nao volta a gerar", async () =>
  comVigia(async (dir, v) => {
    const base = v.n();
    writeFileSync(ctxDe(dir, "outro.md"), "x");
    await dorme(ESPERA * 10);
    const semRazao = v.n() !== base;
    // E o evento do `outro.md` ja teria chegado: uma gravacao no backlog a seguir sobe o contador em EXATAMENTE um.
    const subiu = await gravaAteMudar(v, base, () => writeFileSync(ctxDe(dir, "backlog.md"), `${ACTIVE_OK}\n`));
    return [...espera(!semRazao, `voltou a gerar sem razao: ${base} -> ${v.n()}`), ...espera(subiu && v.n() === base + 1, `depois da gravacao: ${base} -> ${v.n()} (esperava +1)`)];
  }));
await caso("com o --vigiar, a pagina sabe-o (o texto e o JSON)", async () => comVigia(async (dir) => espera(vistaDe(dir).includes("atualizada sozinha") && vistaDe(dir).includes('"vigiar":true'), "a pagina")));
await caso("a batida volta a gerar sem gravacoes (para a hora); com --batida=0, nao (o controlo e o caso acima)", async () =>
  comVigia(
    async (_dir, v) => {
      const base = v.n();
      return espera(await ate(() => v.n() >= base + 2, 10000), `a batida nao gerou: ${base} -> ${v.n()}`);
    },
    () => {},
    200
  ));
// Os dois sinais que o issue nomeia: o Ctrl+C (SIGINT) e o de quem fecha o terminal ou o processo (SIGTERM).
for (const sinal of ["SIGTERM", "SIGINT"]) {
  await caso(`ao sair por ${sinal}, a pagina final ja nao recarrega ("gerada uma vez", e o JSON sem o --vigiar)`, async () =>
    comVigia(async (dir, v) => {
      v.p.kill(sinal);
      await ate(() => v.p.exitCode !== null, 10000);
      const final = vistaDe(dir);
      return [...espera(v.p.exitCode === 0, `saiu ${v.p.exitCode} (${v.p.signalCode})`), ...espera(final.includes("volte a gerar depois de mexer") && final.includes('"vigiar":false'), "a pagina final ainda vigia")];
    }));
}

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
