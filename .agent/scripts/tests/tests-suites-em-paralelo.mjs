/**
 * As suites do `Guard Suites` em paralelo (#337): `lib/suites-em-paralelo.mjs`.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * O que tem de ser verdade para correr em paralelo nao custar validacao: correm TODAS; uma que reprova
 * (por exit, por sinal, ou porque nem arranca) poe o passo vermelho, e nao esconde as outras; a saida
 * de cada uma sai inteira e pela ordem dada; o tecto e respeitado; so SUITES se aceitam; e sem
 * comandos o passo reprova (um passo que nao mede nada nao fica verde).
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { leArgs, quantasDeCadaVez, TECTO } from "../lib/suites-em-paralelo.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-suites-em-paralelo.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const RUNNER = join(ROOT, ".agent/scripts/lib/suites-em-paralelo.mjs");

/** Corre o runner com `args` na pasta `dir` (onde estao as suites falsas); devolve `{ code, out }`. */
function corre(dir, args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [RUNNER, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } }) };
  } catch (err) {
    return { code: err.status ?? -1, out: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
}

/**
 * Corre o runner e, quando a saida DELE ja tem `gatilho`, escreve `solta` no registo: uma suite com
 * `esperaPor: "solta"` so acaba DEPOIS de o runner ter anunciado a outra. E a unica barreira que prova uma
 * ORDEM de saida: esperar pelo `fim` da outra no registo deixava uma corrida (a outra ainda tinha de sair e
 * o runner de receber o `close`) — medido, falhava 1 vez em 4 com a maquina carregada.
 */
function correComGatilho(dir, args, gatilho) {
  const prog = `import { spawn } from "child_process"; import { appendFileSync } from "fs";
const p = spawn(process.execPath, ${JSON.stringify([RUNNER, ...args])}, { cwd: ${JSON.stringify(dir)}, env: { ...process.env, GITHUB_ACTIONS: "" } });
let out = "", solto = false;
const ve = (d) => { out += d; if (!solto && out.includes(${JSON.stringify(gatilho)})) { solto = true; appendFileSync(${JSON.stringify(join(dir, "registo"))}, "solta\\n"); } };
p.stdout.on("data", ve); p.stderr.on("data", ve);
const code = await new Promise((r) => p.on("close", (c) => r(c)));
console.log(JSON.stringify({ code, out }));`;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", prog], { encoding: "utf8", timeout: 60000 }));
}

/**
 * Uma suite falsa num caminho que o runner aceita (`.agent/scripts/tests/test-<nome>.mjs`, relativo a `dir`).
 * Escreve `inicio`/`fim` num registo partilhado e, com `espera`, so acaba quando o registo ja tem `espera`
 * inicios — ou, com `esperaPor`, quando ja tem esse texto. Sao BARREIRAS, e nao tempos fixos: a ordem e a
 * sobreposicao provam-se sem depender da carga da maquina (as suites correm agora em paralelo com outras,
 * e num runner de 2 cores). O `tecto` so conta quando a barreira NAO pode chegar (o caso `--max=1`).
 */
const suite = (dir, nome, { codigo = 0, espera = 0, esperaPor = "", tecto = 15000, mata = false, pendura = false, neto = false, volume = 0 } = {}) => {
  const rel = `.agent/scripts/tests/test-${nome}.mjs`;
  mkdirSync(join(dir, ".agent/scripts/tests"), { recursive: true });
  const reg = JSON.stringify(join(dir, "registo"));
  writeFileSync(
    join(dir, rel),
    `import { appendFileSync, readFileSync } from "fs";\n` +
      (neto ? `import { spawn } from "child_process";\nspawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "neto-${nome}"], { stdio: "ignore" });\n` : "") +
      `appendFileSync(${reg}, "inicio ${nome}\\n");\n` +
      `console.log("saida de ${nome}");\n` +
      (volume ? `process.stdout.write("x".repeat(${volume}) + "\\n");\n` : "") +
      `const ate = Date.now() + ${tecto};\n` +
      `const pronta = () => { const r = readFileSync(${reg}, "utf8"); return ${JSON.stringify(esperaPor)} ? r.includes(${JSON.stringify(esperaPor)}) : (r.match(/inicio/g) || []).length >= ${espera}; };\n` +
      `while ((${espera} > 0 || ${JSON.stringify(esperaPor)}) && Date.now() < ate && !pronta()) await new Promise((r) => setTimeout(r, 20));\n` +
      (pendura ? `await new Promise(() => setInterval(() => {}, 1000));\n` : "") +
      `appendFileSync(${reg}, "fim ${nome}\\n");\n` +
      (mata ? `process.kill(process.pid, "SIGKILL");\n` : `process.exit(${codigo});\n`)
  );
  return ["node", rel];
};

export function registar() {
  registarResultado("suites em paralelo: le `--max` antes do `--` e pares `node <suite>` depois", [
    ...(JSON.stringify(leArgs(["--max=2", "--", "node", ".agent/scripts/tests/test-a.mjs", "node", ".claude/hooks/tests/test-hooks.mjs"])) ===
    JSON.stringify({ max: "2", comandos: [["node", ".agent/scripts/tests/test-a.mjs"], ["node", ".claude/hooks/tests/test-hooks.mjs"]], erros: [] })
      ? []
      : ["a forma valida nao foi lida"]),
  ]);
  // So SUITES: um prefixo no `allow` nao pode virar "corre qualquer `node x.mjs`", e nada se engole.
  registarResultado("suites em paralelo: tudo o que nao e uma suite e um erro, e nao se engole", [
    ["sem `--`", ["node", ".agent/scripts/tests/test-a.mjs"]],
    ["um script fora das suites", ["--", "node", ".agent/scripts/check-backlog.mjs"]],
    ["um caminho que sai da pasta", ["--", "node", ".agent/scripts/tests/../../../x/test-a.mjs"]],
    ["uma suite de fora do repo", ["--", "node", "/tmp/x/.agent/scripts/tests/test-a.mjs"]],
    ["outro programa",["--", "bash", ".agent/scripts/tests/test-a.mjs"]],
    ["um `node` sem suite no fim", ["--", "node", ".agent/scripts/tests/test-a.mjs", "node"]],
    ["um argumento a mais", ["--", "node", ".agent/scripts/tests/test-a.mjs", "--x"]],
    ["uma opcao desconhecida", ["--y", "--", "node", ".agent/scripts/tests/test-a.mjs"]],
  ].flatMap(([nome, args]) => (leArgs(args).erros.length ? [] : [`${nome} passou: ${args.join(" ")}`])));
  registarResultado("suites em paralelo: o tecto e min(4, cores), `--max` valido manda, nunca menos de 1", [
    ...(quantasDeCadaVez(undefined, 10) === TECTO ? [] : [`10 cores deu ${quantasDeCadaVez(undefined, 10)}`]),
    ...(quantasDeCadaVez(undefined, 2) === 2 ? [] : ["2 cores devia dar 2"]),
    ...(quantasDeCadaVez(undefined, 1) === 1 ? [] : ["1 core devia dar 1"]),
    ...(quantasDeCadaVez("3", 10) === 3 ? [] : ["--max=3 devia mandar"]),
    ...(quantasDeCadaVez("0", 10) === TECTO && quantasDeCadaVez("x", 10) === TECTO ? [] : ["um --max invalido devia cair no tecto"]),
  ]);
  // Num processo a parte e sincrono: o `registarResultado` nao espera por promessas, e uma passava sempre.
  registarResultado("suites em paralelo: um programa que nao arranca conta como reprovado", (() => {
    const prog = `import { correTodas } from ${JSON.stringify(pathToFileURL(RUNNER).href)};\n` +
      `const rs = await correTodas([["binario-que-nao-existe-337"]], 1, () => {});\nconsole.log(rs[0].codigo);\n`;
    const codigo = execFileSync(process.execPath, ["--input-type=module", "-e", prog], { encoding: "utf8" }).trim();
    return codigo !== "0" ? [] : ["um arranque falhado deu codigo 0"];
  })());

  const dir = mkdtempSync(join(tmpdir(), "paralelo-test-"));
  try {
    // Todas correm, e uma que reprova poe o passo vermelho SEM esconder as outras.
    {
      const r = corre(dir, ["--", ...suite(dir, "a"), ...suite(dir, "b", { codigo: 1 }), ...suite(dir, "c")]);
      registarResultado("suites em paralelo: uma que reprova poe o passo vermelho, e as outras correm e aparecem", [
        ...(r.code === 1 ? [] : [`exit ${r.code}`]),
        ...["saida de a", "saida de b", "saida de c"].filter((t) => !r.out.includes(t)).map((t) => `falta "${t}"`),
        ...(r.out.includes("1 suite(s) reprovaram") && r.out.includes("test-b.mjs") ? [] : ["o resumo nao nomeia a que reprovou"]),
      ]);
    }
    // Morta por um SINAL (o OOM-kill): `code` e `null`, e tem de reprovar e dizer o sinal.
    {
      const r = corre(dir, ["--", ...suite(dir, "morta", { mata: true }), ...suite(dir, "viva")]);
      registarResultado("suites em paralelo: uma suite morta por um sinal reprova, e diz o sinal", r.code === 1 && r.out.includes("sinal SIGKILL") && r.out.includes("saida de viva") ? [] : [`exit ${r.code}: ${r.out.slice(-300)}`]);
    }
    {
      const r = corre(dir, ["--", ...suite(dir, "d"), ...suite(dir, "e")]);
      registarResultado("suites em paralelo: todas a passar dao verde", r.code === 0 && r.out.includes("Todas passaram") ? [] : [`exit ${r.code}: ${r.out.slice(-200)}`]);
    }
    // Pela ORDEM dada no bloco inteiro, mesmo quando a primeira acaba depois da segunda; e cada uma que
    // acaba da logo a sua linha de estado (uma pendurada nao esconde as outras).
    {
      writeFileSync(join(dir, "registo"), "");
      const r = correComGatilho(dir, ["--max=2", "--", ...suite(dir, "lenta", { esperaPor: "solta" }), ...suite(dir, "rapida")], "test-rapida.mjs passou");
      const [i, j] = [r.out.indexOf("saida de lenta"), r.out.indexOf("saida de rapida")];
      const estadoRapida = r.out.indexOf("test-rapida.mjs passou");
      registarResultado("suites em paralelo: o bloco sai pela ordem dada, e o estado sai quando cada uma acaba", [
        ...(i >= 0 && j > i ? [] : [`ordem errada (lenta ${i}, rapida ${j})`]),
        ...(estadoRapida >= 0 && estadoRapida < i ? [] : ["o estado da rapida nao saiu antes do bloco da lenta"]),
      ]);
    }
    // O TECTO, por BARREIRA: com 2, as duas primeiras esperam uma pela outra e sobrepoem-se; com 1, nunca.
    {
      // Com 1, a barreira nunca chega (e esse o ponto): o `tecto` curto e o que a deixa acabar.
      const ordem = (max) => {
        writeFileSync(join(dir, "registo"), "");
        const tecto = max === 1 ? 1500 : 15000;
        corre(dir, [`--max=${max}`, "--", ...suite(dir, "x", { espera: 2, tecto }), ...suite(dir, "y", { espera: 2, tecto }), ...suite(dir, "z")]);
        return readFileSync(join(dir, "registo"), "utf8").trim().split("\n").map((l) => l.split(" ")[0]);
      };
      const sobrepoe = (seq) => seq.some((v, k) => v === "inicio" && seq[k + 1] === "inicio");
      const [um, dois] = [ordem(1), ordem(2)];
      registarResultado("suites em paralelo: o tecto e respeitado (1 = em serie; 2 = sobrepostas)", [
        ...(!sobrepoe(um) ? [] : [`com --max=1 houve duas ao mesmo tempo: ${um.join(",")}`]),
        ...(sobrepoe(dois) ? [] : [`com --max=2 nunca se sobrepuseram: ${dois.join(",")}`]),
      ]);
    }
    // A que REPROVA sai logo, inteira, sem esperar pela vez dela: se a primeira da lista pendurar, o
    // diagnostico de uma reprovacao real nao fica preso atras dela (auditoria do #337).
    {
      writeFileSync(join(dir, "registo"), "");
      const r = correComGatilho(dir, ["--max=2", "--", ...suite(dir, "demora", { esperaPor: "solta" }), ...suite(dir, "falha", { codigo: 1 })], "test-falha.mjs REPROVOU");
      const [i, j] = [r.out.indexOf("saida de falha"), r.out.indexOf("saida de demora")];
      registarResultado("suites em paralelo: o bloco de uma que reprova sai logo, antes do de uma mais lenta que vem antes", [
        ...(r.code === 1 ? [] : [`exit ${r.code}`]),
        ...(i >= 0 && j > i ? [] : [`o bloco da que reprovou nao saiu primeiro (falha ${i}, demora ${j})`]),
        ...(r.out.split("saida de falha").length === 2 ? [] : ["o bloco da que reprovou saiu duas vezes"]),
      ]);
    }
    // CANCELADO (o timeout do job manda SIGTERM): diz quais ainda corriam, despeja o que escreveram, mata-as
    // COM o que lancaram, nao arranca a que estava em fila, e reprova. Duas penduradas ocupam os 2 lugares
    // (`--max=2`, explicito: nao depende dos cores), e a `fila` espera por um.
    {
      writeFileSync(join(dir, "registo"), "");
      // Nomes UNICOS: o `pgrep` ve a linha de comando (caminho RELATIVO), e duas corridas em paralelo nao se confundem.
      const [a, b, fila] = ["a", "b", "fila"].map((x) => `${x}-${process.pid}`);
      const args = ["--max=2", "--", ...suite(dir, "acaba"), ...suite(dir, a, { pendura: true, neto: true, volume: 300000 }), ...suite(dir, b, { pendura: true }), ...suite(dir, fila)];
      // Solta o SIGTERM so quando o runner ja anunciou a `acaba` E as duas penduradas ja arrancaram (barreiras, sem relogio).
      const prog = `import { spawn } from "child_process"; import { readFileSync } from "fs";
const p = spawn(process.execPath, ${JSON.stringify([RUNNER, ...args])}, { cwd: ${JSON.stringify(dir)}, env: { ...process.env, GITHUB_ACTIONS: "" } });
let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
const reg = () => readFileSync(${JSON.stringify(join(dir, "registo"))}, "utf8");
const ate = Date.now() + 20000;
while (Date.now() < ate && !(out.includes("test-acaba.mjs passou") && reg().includes("inicio ${a}") && reg().includes("inicio ${b}"))) await new Promise((r) => setTimeout(r, 20));
const fechou = new Promise((r) => p.on("close", (c) => r(c)));
p.kill("SIGTERM");
// O despejo (300 KB) nao cabe no pipe: com a leitura PAUSADA, o runner so pode sair depois de as mortas
// fecharem — e a corrida em que, sem a flag runner.cancelado, a fila arrancava e as mortas saiam outra vez.
p.stdout.pause();
await new Promise((r) => setTimeout(r, 1500));
p.stdout.resume();
const codigo = await fechou;
console.log(JSON.stringify({ codigo, out: out.replace(/x{1000,}/g, "<volume>") }));`;
      const { codigo, out } = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", prog], { encoding: "utf8", timeout: 45000 }));
      // Vivos por padrao. Um `pgrep` que nao existe NAO e "nenhum vivo": reprova, senao a assercao passava sem medir.
      const vivos = (padrao) => {
        try {
          return execFileSync("pgrep", ["-f", padrao], { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
        } catch (err) {
          if (err.status === 1) return [];
          throw new Error(`pgrep indisponivel: ${err.message}`);
        }
      };
      let problemas = [];
      try {
        // Um padrao por nome: o `pgrep` le regex POSIX (sem `(?:`).
        const orfas = [...[a, b, fila].map((x) => `test-${x}\\.mjs`), `neto-${a}`].flatMap((x) => vivos(x));
        // Uma orfa (o defeito que isto prende) nao fica a correr para sempre depois do teste.
        for (const o of orfas) try { process.kill(Number(o), "SIGKILL"); } catch { /* ja morreu */ }
        problemas = [
          ...(codigo === 1 ? [] : [`exit ${codigo}`]),
          ...(out.includes("interrompido por SIGTERM com 2 suite(s)") && out.includes(`test-${a}.mjs`) && out.includes(`test-${b}.mjs`) ? [] : ["nao nomeou as duas penduradas"]),
          ...(out.includes("INTERROMPIDA") && out.includes(`saida de ${a}`) ? [] : ["nao despejou o que a pendurada escreveu"]),
          ...(out.split("INTERROMPIDA").length === 3 ? [] : ["o despejo nao saiu exactamente uma vez por pendurada"]),
          ...(out.includes("test-acaba.mjs passou") ? [] : ["perdeu o estado da que ja tinha acabado"]),
          ...(!readFileSync(join(dir, "registo"), "utf8").includes(`inicio ${fila}`) ? [] : ["a que estava em FILA arrancou depois do cancelamento"]),
          ...(!/REPROVOU \(sinal SIGKILL\)/.test(out) ? [] : ["as mortas sairam outra vez como REPROVOU"]),
          ...(orfas.length === 0 ? [] : [`ficaram processos vivos (pids ${orfas.join(", ")})`]),
        ];
      } catch (err) {
        problemas = [err instanceof Error ? err.message : String(err)];
      }
      registarResultado("suites em paralelo: cancelado, nomeia e despeja as penduradas, mata-as com os netos, nao arranca a fila, e reprova", problemas);
    }
    // Um argumento que nao e uma suite REPROVA, e nada corre.
    {
      const r = corre(dir, ["--", ...suite(dir, "g"), "node", ".agent/scripts/check-backlog.mjs"]);
      registarResultado("suites em paralelo: um argumento que nao e uma suite reprova o passo", r.code === 1 && r.out.includes("nao e uma suite") ? [] : [`exit ${r.code}: ${r.out.slice(-200)}`]);
    }
    // Sem comandos nao ha medicao: o passo reprova.
    {
      const r = corre(dir, ["--"]);
      registarResultado("suites em paralelo: sem comandos o passo reprova", r.code === 1 && r.out.includes("nenhuma suite para correr") ? [] : [`exit ${r.code}`]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
