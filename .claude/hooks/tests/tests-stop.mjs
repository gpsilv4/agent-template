#!/usr/bin/env node
/**
 * Testes do hook `stop-verify` — {{PROJECT_NAME}}
 *
 * O que se afirma: o hook do fim de turno diz **que verificacao ficou em divida** para o que foi
 * de facto tocado — nem a mais, nem a menos. Um aviso que grita sempre treina quem o le a
 * ignora-lo; um que se cala esconde trabalho por verificar.
 *
 * NAO e um entry point. O `test-hooks.mjs` importa-o por descoberta e chama `registar()`.
 *
 * PORQUE VIVE A PARTE: o `test-hooks.mjs` passou o seu tecto congelado (696) e a catraca do
 * Guard 17 manda **dividir antes de acrescentar**. A fronteira nao e so de tamanho — estes casos
 * falam todos com o `stop-verify`, e os que ficaram la falam com o guard de branch e com os
 * outros hooks.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { pathToFileURL } from "url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-stop.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

export function registar({ test, repo, correNoCwd, commitarEModificar, STOP }) {
  // --- Um ficheiro APAGADO nao gera comando -------------------------------------
  //
  // Uma regra `suiteDeSi` manda correr o PROPRIO ficheiro tocado. Numa migracao o `git status`
  // lista os caminhos de origem como apagados, e o hook emitia `node <caminho-que-ja-nao-existe>`
  // como instrucao de verificacao. Medido numa migracao real, do lado de um consumidor.
  test("stop: ficheiro APAGADO nao entra na divida", () => {
    const d = repo("feature/x");
    try {
      // Uma suite de entry point: casa a regra `suiteDeSi`, que e a que mandava correr o alvo.
      // Commitado e APAGADO, sem o modificar pelo meio — o `git rm` recusa-se com alteracoes
      // locais, e o que se quer medir e o estado `D`, nao um conflito de fixture.
      const rel = ".agent/scripts/tests/test-guards.mjs";
      mkdirSync(dirname(join(d, rel)), { recursive: true });
      writeFileSync(join(d, rel), "// suite\n");
      execFileSync("git", ["add", rel], { cwd: d });
      execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "add"], { cwd: d });
      execFileSync("git", ["rm", "-q", rel], { cwd: d });
      const r = correNoCwd(STOP, d);
      if (r.ctx.includes("test-guards.mjs")) {
        throw new Error(`mandou correr um ficheiro apagado: ${r.ctx.slice(0, 160)}`);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // O CONTRA-CASO: o mesmo ficheiro MODIFICADO tem de continuar a gerar divida. Sem ele, o de
  // cima era satisfeito por um hook que deixasse de ver as suites de todo.
  test("stop: o mesmo ficheiro MODIFICADO continua a gerar divida", () => {
    const d = repo("feature/x");
    try {
      commitarEModificar(d, ".agent/scripts/tests/test-guards.mjs");
      const r = correNoCwd(STOP, d);
      if (!r.ctx.includes("test-guards.mjs")) {
        throw new Error(`devia pedir a suite tocada; disse: ${r.ctx.slice(0, 160)}`);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  /** Commita `rel` e apaga-o com `git rm`, sem o modificar pelo meio — o `git rm` recusa-se com
   *  alteracoes locais, e o que se quer medir e o estado `D`, nao um conflito de fixture. */
  const commitarEApagar = (d, rel) => {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), "// conteudo\n");
    execFileSync("git", ["add", rel], { cwd: d });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "add"], { cwd: d });
    execFileSync("git", ["rm", "-q", rel], { cwd: d });
  };

  // OS DOIS CONTRA-CASOS QUE FALTAVAM, e que apanharam a primeira versao da correcao acima.
  //
  // Deitar fora o caminho apagado calava o comando impossivel — e, com ele, mais duas coisas que
  // ninguem tinha pedido para calar. O contra-caso do MODIFICADO nao lhes tocava: o defeito vivia
  // no ramo do APAGADO, e um contra-caso no ramo vizinho nao o visita nunca.
  test("stop: ficheiro APAGADO com regra `verifica` continua a dever a suite", () => {
    const d = repo("feature/x");
    try {
      // A suite que a tabela nomeia EXISTE e nao foi apagada; e ela que tem de correr. Apagar um
      // modulo exige a sua suite mais do que modifica-lo: e a mudanca maxima que se lhe pode fazer.
      commitarEApagar(d, ".agent/scripts/lib/pares.mjs");
      const r = correNoCwd(STOP, d);
      if (!r.ctx.includes("test-mutation-sweep.mjs")) {
        throw new Error(`apagar o modulo nao pode calar a suite que o cobre; disse: ${r.ctx.slice(0, 200)}`);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("stop: APAGAR um ficheiro da fronteira continua a avisar que a fronteira mexeu", () => {
    const d = repo("feature/x");
    try {
      // Remover um guard e a forma mais completa de o afrouxar. Um aviso de fronteira que se cala
      // precisamente aqui esta a proteger tudo menos o caso que importa.
      commitarEApagar(d, ".claude/hooks/guard-protected-branch.mjs");
      const r = correNoCwd(STOP, d);
      if (!r.ctx.includes("FRONTEIRA ALTERADA")) {
        throw new Error(`apagar um hook da fronteira tem de avisar; disse: ${r.ctx.slice(0, 200)}`);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // --- A marca de "ja disse isto" pertence ao repo medido ------------------------
  test("stop: a marca fica no repo medido, nao no repo do hook", () => {
    const d = repo("feature/x");
    try {
      commitarEModificar(d, ".agent/rules/core-rules.md");
      correNoCwd(STOP, d);
      if (!existsSync(join(d, ".claude/state/stop-verify.last")))
        throw new Error("a marca nao ficou no repo medido — vai calar avisos de outro repo");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test("stop: divida identica cala-se; divida diferente volta a falar", () => {
    const d = repo("feature/x");
    try {
      commitarEModificar(d, ".agent/rules/core-rules.md");
      if (correNoCwd(STOP, d).vazio) throw new Error("a primeira vez tem de falar");
      if (!correNoCwd(STOP, d).vazio) throw new Error("divida identica devia calar-se");
      commitarEModificar(d, ".agent/scripts/mutation-sweep.mjs", "// muda\n");
      if (correNoCwd(STOP, d).vazio) throw new Error("divida NOVA tem de voltar a falar");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
}
