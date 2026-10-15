/**
 * Os SHARDS da varredura (#308): a fatia de cada maquina e a conferencia no portao.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * Tres camadas, porque cada uma falha de forma diferente:
 *   - `lib/varredura-fatia.mjs` — ler `--shard=k/n` e repartir os sitios. A propriedade que importa:
 *     para qualquer `n`, as fatias juntas sao TODOS os sitios, cada um uma vez.
 *   - `lib/varredura-shards.mjs` — o portao. Um caso por recusa, e o caso que existe para apanhar:
 *     um shard que nao correu, com os outros verdes.
 *   - o `mutation-sweep.mjs` com `--shard` sobre a fixture da varredura — a fatia chega de facto ao
 *     motor, e o relatorio que o portao le e escrito.
 */
import { pathToFileURL } from "url";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { qualShard, particao, totalDeSitios } from "../lib/varredura-fatia.mjs";
import { confere } from "../lib/varredura-shards.mjs";
import { sandbox, run } from "./harness/test-sweep-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-varredura-shards.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Um relatorio de shard, com o que o teste nao diz por omissao. */
const rel = (o) => ({ modo: "completa", k: 1, n: 1, total: 10, medidos: 10, aplicavel: true, ...o });
/** O caso passa se `confere()` der exactamente os problemas que contem `espera` (ou nenhum). */
const conferido = (nome, relatorios, espera) => {
  const p = confere(relatorios);
  registarResultado(
    `shards: ${nome}`,
    espera === null
      ? p.map((x) => `nao devia haver problemas: ${x}`)
      : p.some((x) => x.includes(espera))
        ? []
        : [`esperava um problema com "${espera}", veio: ${JSON.stringify(p)}`]
  );
};

export function registar() {
  // --- A fatia -------------------------------------------------------------------------
  registarResultado("shards: --shard le k/n, e sem a opcao nao ha shard", [
    ...(JSON.stringify(qualShard("2/3")) === '{"k":2,"n":3}' ? [] : [`2/3 deu ${JSON.stringify(qualShard("2/3"))}`]),
    ...(qualShard(undefined) === null ? [] : ["sem a opcao devia ser null"]),
  ]);
  registarResultado(
    "shards: --shard mal escrito e um erro, nunca uma fatia",
    ["3/2", "0/2", "1/0", "1", "a/b", "1/2/3", ""].filter((v) => !qualShard(v)?.erro).map((v) => `"${v}" passou`)
  );
  // A propriedade de que tudo depende: para qualquer n, as fatias juntas sao TODOS os sitios, uma
  // vez cada. Sobre alvos de tamanhos desiguais, incluindo um que fica sem sitios num shard.
  {
    const medir = [{ alvo: "a", sitios: [3, 9, 12] }, { alvo: "b", sitios: [1] }, { alvo: "c", sitios: [4, 5, 6, 7, 8] }];
    const todos = medir.flatMap((m) => m.sitios.map((i) => `${m.alvo}:${i}`)).sort();
    const problemas = [];
    for (let n = 1; n <= 8; n++) {
      const vistos = [];
      for (let k = 1; k <= n; k++) for (const m of particao(medir, { k, n })) vistos.push(...m.sitios.map((i) => `${m.alvo}:${i}`));
      if (vistos.sort().join() !== todos.join()) problemas.push(`n=${n}: as fatias deram ${vistos.length} de ${todos.length} (ou repetidos)`);
    }
    if (totalDeSitios(medir) !== 9) problemas.push(`totalDeSitios deu ${totalDeSitios(medir)}, nao 9`);
    if (medir[0].sitios.length !== 3) problemas.push("a particao mutou o `medir` que recebeu");
    registarResultado("shards: as fatias juntas sao todos os sitios, uma vez cada (n = 1..8)", problemas);
    // O contra-caso: um alvo sem sitios na fatia SAI — nao se lhe corre baseline nem prova.
    const fatia = particao(medir, { k: 2, n: 8 });
    registarResultado(
      "shards: um alvo sem sitios na fatia sai dela",
      fatia.every((m) => m.sitios.length > 0) && fatia.length === 1 ? [] : [`a fatia 2/8 deu ${JSON.stringify(fatia)}`]
    );
  }

  // --- O portao: um caso por recusa ----------------------------------------------------
  conferido("dois shards que somam o total passam", [rel({ k: 1, n: 2, medidos: 6 }), rel({ k: 2, n: 2, medidos: 4 })], null);
  conferido("nao aplicavel em todos os shards passa", [rel({ k: 1, n: 2, aplicavel: false }), rel({ k: 2, n: 2, aplicavel: false })], null);
  conferido("nenhum relatorio reprova", [], "nenhum relatorio");
  // O caso pelo qual o portao existe: o shard 2 nao correu, e o 1 esta verde sozinho.
  conferido("um shard que NAO correu reprova", [rel({ k: 1, n: 2, medidos: 6 })], "esperado exactamente 1,2");
  conferido("um shard repetido reprova", [rel({ k: 1, n: 2, medidos: 5 }), rel({ k: 1, n: 2, medidos: 5 })], "esperado exactamente 1,2");
  conferido("shards que nao concordam no n reprovam", [rel({ k: 1, n: 2 }), rel({ k: 2, n: 3 })], "numero de shards");
  conferido("uns correram e outros nao: reprova", [rel({ k: 1, n: 2, medidos: 6 }), rel({ k: 2, n: 2, aplicavel: false })], "nao aplicavel");
  conferido("totais diferentes reprovam", [rel({ k: 1, n: 2, total: 10, medidos: 5 }), rel({ k: 2, n: 2, total: 11, medidos: 5 })], "totais diferentes");
  conferido("a soma abaixo do total reprova", [rel({ k: 1, n: 2, medidos: 5 }), rel({ k: 2, n: 2, medidos: 4 })], "9 de 10 sitios");
  // Os modos conferem-se em separado: a `--skips` de um shard nao completa a completa.
  conferido("cada modo confere-se sozinho", [rel({ k: 1, n: 2, medidos: 6 }), rel({ modo: "skips", k: 1, n: 1, total: 3, medidos: 3 })], "completa: shards 1 de 2");

  // --- O portao pela linha de comando, como o CI o chama --------------------------------
  {
    const dir = mkdtempSync(join(tmpdir(), "shards-test-"));
    const cli = join(ROOT, ".agent/scripts/lib/varredura-shards.mjs");
    const corre = () => {
      try {
        return { code: 0, out: execFileSync("node", [cli, dir], { encoding: "utf8", stdio: "pipe" }) };
      } catch (err) {
        return { code: err.status ?? 1, out: String(err.stdout ?? "") };
      }
    };
    try {
      writeFileSync(join(dir, "completa-1.json"), JSON.stringify(rel({ k: 1, n: 2, medidos: 6 })));
      const so1 = corre();
      writeFileSync(join(dir, "completa-2.json"), JSON.stringify(rel({ k: 2, n: 2, medidos: 4 })));
      const os2 = corre();
      writeFileSync(join(dir, "estragado.json"), "{ nao e json");
      const estragado = corre();
      registarResultado("shards: o portao pela linha de comando", [
        ...(so1.code === 1 && so1.out.includes("FALHA") ? [] : [`so o shard 1: exit ${so1.code}`]),
        ...(os2.code === 0 && os2.out.includes("6 de 10") ? [] : [`os dois: exit ${os2.code}, ${os2.out}`]),
        ...(estragado.code === 1 && estragado.out.includes("nao consegui ler estragado.json") ? [] : [`relatorio ilegivel: exit ${estragado.code}`]),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // --- Ponta a ponta: a fatia chega ao motor e o relatorio e escrito -------------------
  // A fixture da varredura tem dois sitios, um coberto e outro nao: o shard 1/2 mede so o coberto,
  // o 2/2 so o outro. Cada um reprova (ou nao) pela SUA fatia — e o relatorio diz o que mediu.
  {
    const casos = [1, 2].map((k) => {
      const dir = sandbox();
      try {
        const r = run(dir, [`--shard=${k}/2`], { SWEEP_RELATORIO: "relatorio.json" });
        let relatorio = null;
        try {
          relatorio = JSON.parse(readFileSync(join(dir, "relatorio.json"), "utf8"));
        } catch {
          relatorio = null;
        }
        return { k, ...r, relatorio };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    const problemas = [];
    for (const c of casos) {
      if (c.relatorio?.k !== c.k || c.relatorio?.n !== 2 || c.relatorio?.total !== 2 || c.relatorio?.medidos !== 1)
        problemas.push(`shard ${c.k}/2: relatorio ${JSON.stringify(c.relatorio)}`);
    }
    if (!casos[0].out.includes("1 sitios medidos (shard 1/2, de 2)")) problemas.push(`shard 1/2: ${casos[0].out.slice(-300)}`);
    if (casos[1].code !== 1 || !casos[1].out.includes("INCOMPLETA")) problemas.push(`shard 2/2 devia reprovar o sitio por cobrir: exit ${casos[1].code}`);
    if (confere(casos.map((c) => c.relatorio).filter(Boolean)).length) problemas.push("os dois relatorios reais nao passaram no portao");
    registarResultado("shards: --shard sobre a fixture da varredura reparte, reprova a fatia e escreve o relatorio", problemas);
  }

  // O caminho que o CI USA: o shard por ambiente (`SWEEP_SHARD`), sem `--shard` (auditoria do #308).
  // Sem isto, partir o `?? process.env` deixava cada shard do CI a varrer tudo, e so o portao do PR
  // seguinte o dizia.
  {
    const dir = sandbox();
    try {
      const r = run(dir, [], { SWEEP_SHARD: "2/2", SWEEP_RELATORIO: "relatorio.json" });
      let relatorio = null;
      try {
        relatorio = JSON.parse(readFileSync(join(dir, "relatorio.json"), "utf8"));
      } catch {
        relatorio = null;
      }
      registarResultado(
        "shards: SWEEP_SHARD no ambiente reparte como o --shard (o caminho do CI)",
        relatorio?.k === 2 && relatorio?.n === 2 && relatorio?.medidos === 1 && r.out.includes("INCOMPLETA") ? [] : [`relatorio ${JSON.stringify(relatorio)}, exit ${r.code}`]
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // As SUITES nao herdam o shard (leitor do #308): o job exporta `SWEEP_SHARD`/`SWEEP_RELATORIO`, e
  // herdados, a propria suite da varredura corria partida — baseline vermelha nos dois shards. A suite
  // falsa reprova se os vir; a varredura corre com eles no ambiente (a fatia 1/1 e tudo).
  {
    const dir = sandbox({ segundoSitio: false });
    try {
      const f = join(dir, ".agent/scripts/fake-test.mjs");
      writeFileSync(f, 'if (process.env.SWEEP_SHARD || process.env.SWEEP_RELATORIO) { console.log("  FAIL  a suite herdou o shard"); process.exit(1); }\n' + readFileSync(f, "utf8"));
      const r = run(dir, [], { SWEEP_SHARD: "1/1", SWEEP_RELATORIO: "relatorio.json" });
      registarResultado(
        "shards: as suites lancadas pela varredura nao herdam SWEEP_SHARD/SWEEP_RELATORIO",
        r.code === 0 && !r.out.includes("BASELINE VERMELHA") ? [] : [`exit ${r.code}: ${r.out.slice(-300)}`]
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  // `--list` com um shard mal escrito tambem reprova: sai pelo sitio do `--only` sem alvos.
  {
    const dir = sandbox({ segundoSitio: false });
    try {
      const r = run(dir, ["--list", "--shard=3/2"]);
      registarResultado("shards: --list com --shard mal escrito reprova", r.code === 1 && r.out.includes("SHARD INVALIDO") ? [] : [`exit ${r.code}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
