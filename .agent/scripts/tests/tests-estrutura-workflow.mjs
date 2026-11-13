/**
 * Os defeitos de ESTRUTURA do gate (`lib/estrutura-workflow.mjs`, `defeitosDeEstrutura`), pela funcao pura (#382).
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`. E o DONO do alvo na varredura
 * (`tests-<alvo>.mjs`): corre primeiro, e cada `defeito(` desligado morre aqui em milissegundos — e nao numa corrida
 * inteira do `test-test-surface`, que tambem os ve de ponta a ponta, como `warn` do gate (`tests-surface-gate.mjs`).
 * Os casos vieram de la tal e qual (#382); os dois da varredura (em dois jobs, e sem agregador) sao novos.
 *
 * Cada defeito tem o par: o workflow que o faz sair, e o mesmo sem a causa, que nao.
 */
import { join } from "path";
import { pathToFileURL } from "url";
import { registarResultado, ROOT } from "./harness/test-harness.mjs";
import { defeitosDeEstrutura, colisoesEntreWorkflows, colisoesNovas, jobsDe, semComentario } from "../lib/estrutura-workflow.mjs";
import { SIMULADORES, blocoDoJob, semSimuladores, temSimuladores } from "./harness/simuladores-ci.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-estrutura-workflow.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** O `if:` de PR (#460), na forma isenta do `check-test-surface`. */
const SO_PR = /^[ \t]*if:[ \t]*github\.event_name == 'pull_request'[ \t]*$/;

/** Os problemas dos SIMULADORES no `ci.yml` (#460): cada job existe com o `if:` de PR nas chaves do PROPRIO job (os
 *  passos tambem o tem, e uma regex no texto do bloco via-o la, `TP1`), e cada comando aparece UMA vez, no seu job. */
export function simuladoresDoCi(ci) {
  const jobs = jobsDe(ci);
  const problemas = [];
  for (const id of Object.keys(SIMULADORES)) {
    const j = jobs.find((x) => x.id === id);
    if (!j) problemas.push(`o job \`${id}\` nao esta no ci.yml`);
    else if (!j.cru.map(semComentario).some((l) => SO_PR.test(l))) problemas.push(`o job \`${id}\` sem o \`if:\` de PR nas chaves do job`);
  }
  // Uma linha de comando: o `run:` de uma linha, ou uma linha do corpo de um `run: |`, sem espacos.
  const usos = jobs.flatMap((j) => j.ls.map((l) => ({ id: j.id, c: l.replace(/^[ \t]*(?:-[ \t]+)?run:[ \t]*/, "").trim() })));
  for (const [id, cmd] of Object.entries(SIMULADORES)) {
    const onde = usos.filter((u) => u.c === cmd).map((u) => u.id);
    if (onde.length === 0) problemas.push(`o comando \`${cmd}\` esta em falta no ci.yml`);
    else if (onde.length > 1 || onde[0] !== id) problemas.push(`o comando \`${cmd}\` aparece ${onde.length} vez(es), em ${onde.join(", ")}, e nao so no job \`${id}\``);
  }
  return problemas;
}

/** A lista `shard:` do `sweep` tem de ser exatamente `1..de` da perna `completa` (#460): hoje so o portao o apanhava,
 *  em runtime. Sem o `sweep`, ou sem chave `shard:`, nada a comparar; uma chave que nao se le (em bloco, uma
 *  expressao) reprova, em vez de passar sem comparar (`TP2`, leitor do #460). */
export function fatiasDoSweep(ci) {
  const sweep = blocoDoJob(ci, "sweep");
  if (!sweep || !/^[ \t]*shard[ \t]*:/m.test(sweep)) return [];
  const lista = /^[ \t]*shard:[ \t]*\[([^\]]*)\][ \t]*(?:#.*)?$/m.exec(sweep);
  if (!lista) return ["nao li a lista `shard: [...]` do `sweep` (em bloco, ou uma expressao) — sem ela, as fatias nao se comparam com o `de:`"];
  const de = /-[ \t]*modo:[ \t]*completa[ \t]*\n[ \t]*de:[ \t]*(\d+)/.exec(sweep);
  const esperado = de ? Array.from({ length: Number(de[1]) }, (_, k) => String(k + 1)).join(",") : "?";
  const tem = lista[1].split(",").map((s) => s.trim()).join(",");
  return tem === esperado ? [] : [`a lista \`shard: [${tem}]\` do \`sweep\` nao e 1..de (\`de: ${de ? de[1] : "?"}\`)`];
}

export function registar() {
  // A VARREDURA (#382): as suites no `guard`, a varredura no `sweep`, e um agregador que le o resultado dele. Cada
  // defeito difere da base so na sua causa: um segundo job a varrer, ou o agregador que deixa de existir.
  {
    const guard = (extra) => `jobs:\n  guard:\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/tests/test-guards.mjs\n${extra}`;
    const sweep = "  sweep:\n    needs: guard\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/mutation-sweep.mjs\n";
    const agrega = "  gate:\n    needs: [guard, sweep]\n    runs-on: y\n    steps:\n      - env:\n          R: ${{ needs.sweep.result }}\n        run: echo \"$R\"\n";
    const base = guard("") + sweep + agrega;
    const dois = guard("      - run: node .agent/scripts/mutation-sweep.mjs\n") + sweep + agrega;
    const semAgregador = guard("") + sweep;
    const so = (t, texto) => (JSON.stringify(defeitosDeEstrutura(t).map((d) => d.includes(texto))) === "[true]" ? [] : [`esperava so "${texto}": ${JSON.stringify(defeitosDeEstrutura(t))}`]);
    registarResultado("estrutura: a varredura em dois jobs, ou sem um agregador que a leia, e um defeito; a base nao (#382)", [
      ...(defeitosDeEstrutura(base).length === 0 ? [] : [`a base deu defeitos: ${JSON.stringify(defeitosDeEstrutura(base))}`]),
      ...so(dois, "a varredura de mutacao corre em 2 jobs (`guard`, `sweep`)"),
      ...so(semAgregador, "a varredura corre no job `sweep`, sem as suites e sem um agregador que leia `needs.sweep.result`"),
    ]);
  }
  registarResultado("gate: nomes com `#` entre aspas, aliases e `needs:` em varias linhas leem-se certo (#308)", [
    ...(defeitosDeEstrutura('jobs:\n  a:\n    name: "Shard #1"\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/x.mjs\n  b:\n    name: "Shard #2"\n    runs-on: y\n').length === 0 ? [] : ["`\"Shard #1\"` e `\"Shard #2\"` colidiram"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: y\n  b:\n    needs: *deps\n    runs-on: y\n").length === 0 ? [] : ["um alias foi lido como um job em falta"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: y\n  b:\n    needs: [\n      a,\n      zz]\n    runs-on: y\n").some((d) => d.includes("`needs: zz`")) ? [] : ["o `needs:` em varias linhas nao foi lido"]),
  ]);
  // Os SHARDS (#308): a matriz repartida sem o portao que confere os relatorios e falha aberta; com ele,
  // nada a dizer; e um `SWEEP_SHARD` so num comentario nao reparte nada.
  {
    const shards = "jobs:\n  sweep:\n    runs-on: y\n    steps:\n      - env:\n          SWEEP_SHARD: 1/2\n        run: node .agent/scripts/mutation-sweep.mjs\n";
    const portao = "  gate:\n    runs-on: y\n    needs: [sweep]\n    steps:\n      - env:\n          V: ${{ needs.sweep.result }}\n        run: node .agent/scripts/lib/varredura-shards.mjs x\n";
    // O portao num job que NAO agrega (nao le `needs.sweep.result`): nenhuma protecao o exige.
    const aParte = "  conta:\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/lib/varredura-shards.mjs x\n";
    const diz = (t) => defeitosDeEstrutura(t).some((d) => d.includes("nenhum job AGREGADOR confere os relatorios"));
    registarResultado("gate: shards sem o portao num agregador sao um defeito; com ele, nao (#308)", [
      ...(diz(shards) ? [] : ["a matriz em shards sem portao passou"]),
      ...(!diz(shards + portao) ? [] : ["com o portao num agregador, continuou a reprovar"]),
      ...(diz(shards + aParte) ? [] : ["o portao num job a parte, que nao agrega, passou"]),
      ...(!diz(shards.replace("SWEEP_SHARD: 1/2", "# SWEEP_SHARD: 1/2")) ? [] : ["um SWEEP_SHARD comentado contou"]),
    ]);
  }
  // Os MODOS (#317): cada modo da matriz do `sweep` tem de chegar ao portao; os dois jeitos de os escrever.
  {
    const matriz = "jobs:\n  sweep:\n    runs-on: y\n    strategy:\n      matrix:\n        modo: [completa]\n        include:\n          - modo: skips\n    steps:\n      - env:\n          SWEEP_SHARD: 1/2\n        run: node .agent/scripts/mutation-sweep.mjs\n";
    const portao = (args) => `  gate:\n    runs-on: y\n    needs: [sweep]\n    steps:\n      - env:\n          V: \${{ needs.sweep.result }}\n        run: node .agent/scripts/lib/varredura-shards.mjs x${args}\n`;
    const faltam = (t) => defeitosDeEstrutura(t).find((d) => d.includes("nao recebe o(s) modo(s)")) ?? "";
    registarResultado("gate: o portao recebe todos os modos da matriz (#317)", [
      ...(faltam(matriz + portao("")).includes("completa, skips") ? [] : [`sem modos devia faltar completa e skips: "${faltam(matriz + portao(""))}"`]),
      ...(faltam(matriz + portao(" completa")).includes("modo(s) skips da matriz") ? [] : ["o modo do `include` nao foi lido"]),
      ...(faltam(matriz + portao(" completa skips")) === "" ? [] : ["com os dois modos, continuou a reprovar"]),
    ]);
  }
  // As outras formas de YAML (leituras do #317): leem-se, e o que nao se le FALHA FECHADO.
  {
    const job = (m) => `jobs:\n  sweep:\n    runs-on: y\n    strategy:\n      matrix:\n${m}    steps:\n      - env:\n          SWEEP_SHARD: 1/2\n        run: node .agent/scripts/mutation-sweep.mjs\n`;
    const gate = (args) => `  gate:\n    runs-on: y\n    needs: [sweep]\n    steps:\n      - env:\n          V: \${{ needs.sweep.result }}\n        run: node .agent/scripts/lib/varredura-shards.mjs x${args}\n`;
    const defeitos = (t) => defeitosDeEstrutura(t).filter((d) => /modo|modos/.test(d));
    const limpo = (nome, m, args) => (defeitos(job(m) + gate(args)).length === 0 ? [] : [`${nome}: ${defeitos(job(m) + gate(args)).join(" | ")}`]);
    const diz = (nome, m, args, texto) => (defeitos(job(m) + gate(args)).some((d) => d.includes(texto)) ? [] : [`${nome}: esperava "${texto}"`]);
    registarResultado("gate: os modos leem-se em todas as formas de YAML, e o que nao se le reprova (#317)", [
      ...limpo("lista com aspas", '        modo: ["completa", "skips"]\n', " completa skips"),
      ...limpo("escalar com aspas", "        include:\n          - modo: 'skips'\n          - modo: \"completa\"\n", " completa skips"),
      ...limpo("mapa em linha", "        include:\n          - { modo: completa, shard: 1 }\n          - { modo: skips, shard: 1 }\n", " completa skips"),
      ...limpo("lista em bloco", "        modo:\n          - completa\n          - skips\n", " completa skips"),
      ...limpo("portao com aspas e continuacao", "        modo: [completa, skips]\n", ' \\\n          "completa" \'skips\''),
      // A expressao num `modo:`, ao lado de um que se le (o ramo do ilegivel: sem ele, ficava so o `skips`); e uma
      // matriz sem `modo:` nenhum (o da lista vazia) (#382).
      ...diz("modo de uma expressao", "        modo: ${{ fromJSON(x) }}\n        include:\n          - modo: skips\n", " skips", "nao consegui ler os modos da matriz"),
      ...diz("matriz sem `modo` legivel", "        matrix: ${{ fromJSON(x) }}\n", " completa", "nao consegui ler os modos da matriz"),
      ...diz("portao com uma variavel", "        modo: [completa]\n", " $MODOS", "nao consegui ler os modos que o portao recebe"),
      ...diz("um modo a mais no portao", "        modo: [completa]\n", " completa skips", "exige o(s) modo(s) skips, que a matriz nao tem"),
    ]);
  }
  // O que o bootstrap deixa: o `ci.yml` do TEMPLATE sem os tres jobs dos simuladores (o §2.7 remove-os, #460) nao
  // tem defeitos. So no template: num derivado, o `ci.yml` e do projeto.
  {
    const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
    const ci = lerRaiz(".github/workflows/ci.yml");
    if (ehDerivado(lerRaiz) || ci === null) console.log("  SKIP  gate: o ci.yml do template sem os simuladores, e os simuladores e as fatias dele (so no template)");
    else {
      const sem = semSimuladores(ci);
      registarResultado("gate: o ci.yml do template, sem os jobs dos simuladores (o bootstrap), nao tem defeitos de estrutura (#308, #460)", [
        ...Object.keys(SIMULADORES).filter((id) => blocoDoJob(ci, id) === undefined).map((id) => `o job \`${id}\` nao esta no ci.yml`),
        ...(temSimuladores(sem) ? ["ficou um job dos simuladores depois de os tirar"] : []),
        ...defeitosDeEstrutura(sem),
        ...defeitosDeEstrutura(ci),
      ]);
      // O PORTAO nao espera por eles (#460): um `needs:` para um job que o bootstrap remove invalida o workflow inteiro.
      const comNeeds = ci.replace(/^(    needs: \[guard-tests, sweep)\]/m, "$1, simulate-derived]");
      registarResultado("gate: o portao com `needs:` para um simulador parte o ci.yml do bootstrap (controlo, #460)", [
        ...(comNeeds === ci ? ["o controlo nao mudou o `needs:` do portao"] : []),
        ...(defeitosDeEstrutura(comNeeds).length === 0 ? [] : ["com os jobs todos, o `needs:` novo ja devia ser valido"]),
        ...(defeitosDeEstrutura(semSimuladores(comNeeds)).some((d) => d.includes("`needs: simulate-derived`")) ? [] : ["sem os simuladores, o `needs:` partido nao foi visto"]),
      ]);
      // As FRONTEIRAS (leitor do #460): o comentario de cabecalho do job seguinte e dele, e um id entre aspas ou com um
      // ponto e um cabecalho. Os controlos sao os mesmos textos sem a fronteira certa (a regex antiga).
      {
        const doisJobs = "jobs:\n  simulate-upgrade:\n    runs-on: x\n\n  # o comentario do seguinte\n  seguinte:\n    runs-on: y\n";
        const comAspas = "jobs:\n  simulate-upgrade:\n    runs-on: x\n  \"a.b\":\n    runs-on: y\n";
        registarResultado("gate: o bloco de um simulador acaba antes do comentario do job seguinte, e num id entre aspas (#460)", [
          ...(blocoDoJob(doisJobs, "simulate-upgrade").includes("comentario do seguinte") ? ["o comentario do job seguinte ficou no bloco"] : []),
          ...(semSimuladores(doisJobs).includes("# o comentario do seguinte") ? [] : ["o comentario do job seguinte saiu com o simulador"]),
          ...(semSimuladores(comAspas).includes('"a.b":') ? [] : ["o job `\"a.b\"` saiu com o simulador"]),
          ...(semSimuladores("jobs:\n  # do simulador\n  simulate-upgrade:\n    runs-on: x\n  b:\n    runs-on: y\n").includes("do simulador") ? ["o comentario do simulador ficou orfao"] : []),
        ]);
      }
      registarResultado("gate: um job dos simuladores no FIM do ficheiro tambem sai (#460)",
        temSimuladores(semSimuladores("jobs:\n  a:\n    runs-on: x\n  simulate-upgrade:\n    runs-on: x\n")) ? ["o ultimo job ficou"] : []);
      // NENHUMA VERIFICACAO SAIU (#460): cada comando, uma vez, no seu job, e o job so num PR. E as fatias da varredura.
      registarResultado("gate: os tres simuladores, cada um no seu job e so num PR, e as fatias da varredura 1..de (#460)", [...simuladoresDoCi(ci), ...fatiasDoSweep(ci)]);
      // O MESMO ci.yml com CRLF (um checkout com `core.autocrlf`) le-se igual: os jobs saem, e nada reprova sem causa.
      {
        const crlf = ci.replace(/\r?\n/g, "\r\n");
        registarResultado("gate: o ci.yml com CRLF le-se como com LF — os simuladores, as fatias e o que o bootstrap deixa (#460)", [
          ...simuladoresDoCi(crlf), ...fatiasDoSweep(crlf),
          ...(temSimuladores(semSimuladores(crlf)) ? ["com CRLF, ficou um job dos simuladores depois de os tirar"] : []),
          ...(Object.keys(SIMULADORES).every((id) => blocoDoJob(crlf, id) !== undefined) ? [] : ["com CRLF, um job dos simuladores nao se leu"]),
        ]);
      }
      const mutado = (de, para) => { const m = ci.replace(de, para); return m === ci ? null : m; };
      for (const [nome, m, esperado] of [
        ["sem o comando do derivado privado", mutado(/^.*SIMULATE_PRIVADO=1 node \.agent\/scripts\/simulate-derived\.mjs.*\n/m, ""), "em falta"],
        ["sem o `if:` de PR do job `simulate-upgrade` (os dos passos ficam)", mutado(/(^  simulate-upgrade:[^\n]*\n(?:(?!  \S)[^\n]*\n)*?)    if: github\.event_name == 'pull_request'[^\n]*\n/m, "$1"), "`simulate-upgrade` sem o `if:`"],
        ["o `simulate-upgrade.mjs` no job `simulate-derived`", mutado(/^([ \t]*)node \.agent\/scripts\/simulate-derived\.mjs\n/m, "$1node .agent/scripts/simulate-derived.mjs\n$1node .agent/scripts/simulate-upgrade.mjs\n"), "2 vez(es)"],
        ["a lista `shard:` sem o 3 com `de: 3`", mutado(/^(\s*shard: \[1, 2), 3\]/m, "$1]"), "nao e 1.."],
        ["a lista `shard:` sem o 3, num ci.yml com CRLF", mutado(/^(\s*shard: \[1, 2), 3\]/m, "$1]")?.replace(/\n/g, "\r\n") ?? null, "nao e 1.."],
        ["a lista `shard:` em bloco", mutado(/^([ \t]*)shard: \[1, 2, 3\]/m, "$1shard:\n$1  - 1\n$1  - 2\n$1  - 3"), "nao li a lista"],
      ]) {
        const ps = m === null ? null : [...simuladoresDoCi(m), ...fatiasDoSweep(m)];
        registarResultado(`gate: ${nome} reprova (controlo, #460)`,
          ps === null ? ["o controlo nao mudou o ci.yml"] : ps.some((p) => p.includes(esperado)) ? [] : [`esperava "${esperado}": ${JSON.stringify(ps)}`]);
      }
    }
  }
  registarResultado("gate: defeitosDeEstrutura le o `needs:` em bloco, e o id como nome quando falta o `name:` (#308)", [
    ...(JSON.stringify(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n  b:\n    needs:\n      - a\n      - c\n    runs-on: x\n")) === JSON.stringify(["o job `b` tem `needs: c`, e o job `c` nao existe — o GitHub rejeita o workflow inteiro"]) ? [] : ["o `needs:` em bloco nao foi lido"]),
    // So contam colisoes que envolvam a maquinaria (#308, segunda leitura): com ela no `a`, colide; sem ela, nao.
    ...(JSON.stringify(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n    steps:\n      - run: node .agent/scripts/x.mjs\n  b:\n    name: a\n    runs-on: x\n").map((d) => d.includes("tem o mesmo nome de check, `a`"))) === "[true]" ? [] : ["o id `a` (com maquinaria) e o `name: a` deviam colidir"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n  b:\n    name: a\n    runs-on: x\n").length === 0 ? [] : ["uma colisao sem maquinaria avisou"]),
    ...(defeitosDeEstrutura("jobs:\n  a:\n    runs-on: x\n  b:\n    needs: a\n    runs-on: x\n").length === 0 ? [] : ["um workflow certo deu defeitos"]),
  ]);
  // O mesmo nome de check ENTRE workflows (#355): o `texto` tocado contra um outro (`ci.yml`). Uma linha por caso,
  // com o numero de colisoes esperado num objeto no fim (a forma que a superficie conta, #359).
  {
    const portao = (nome, on = "push") => `on: ${on}\njobs:\n  guard:\n    name: ${nome}\n    runs-on: y\n    steps:\n      - run: node .agent/scripts/tests/test-guards.mjs\n`;
    const falso = (corpo, on = "push") => `on: ${on}\njobs:\n  fake:\n${corpo}    runs-on: y\n    steps:\n      - run: echo ok\n`;
    const N = "    name: Guard Tests\n";
    const BLOCO = "\n  workflow_call:\n    inputs:\n      x:\n        type: string\n";
    for (const [nome, texto, outro, { n }] of [
      ["um job com o nome do portao noutro workflow colide", falso(N), portao("Guard Tests"), { n: 1 }],
      ["com outro nome, nao (controlo)", falso("    name: Outra\n"), portao("Guard Tests"), { n: 0 }],
      ["dois jobs sem maquinaria com o mesmo nome nao colidem (o `Detect Project` de um derivado)", falso("    name: Detect Project\n"), falso("    name: Detect Project\n"), { n: 0 }],
      ["um job sem `name:` cujo id e o nome do portao colide", "on: push\njobs:\n  guard-tests:\n    runs-on: y\n", portao("guard-tests"), { n: 1 }],
      ["outra caixa e espacos colidem (falha para o lado de avisar)", falso('    name: "guard TESTS "\n'), portao("Guard Tests"), { n: 1 }],
      ["um nome nao literal nao colide", falso("    name: ${{ 'Guard Tests' }}\n"), portao("Guard Tests"), { n: 0 }],
      ["um job de matriz nao tem o nome nu: nao colide", falso(N + "    strategy:\n      matrix:\n        os: [a]\n"), portao("Guard Tests"), { n: 0 }],
      ["um job que chama um reutilizavel nao tem o nome nu: nao colide", "on: push\njobs:\n  fake:\n    name: Guard Tests\n    uses: ./.github/workflows/x.yml\n", portao("Guard Tests"), { n: 0 }],
      ["o outro so `workflow_call` nao colide", falso(N), portao("Guard Tests", "workflow_call"), { n: 0 }],
      ["o outro so `[workflow_call]` nao colide", falso(N), portao("Guard Tests", "[workflow_call]"), { n: 0 }],
      ["o outro so `workflow_call` em bloco, com `inputs:`, nao colide", falso(N), portao("Guard Tests", BLOCO), { n: 0 }],
      ["o tocado so `workflow_call` nao colide", falso(N, "workflow_call"), portao("Guard Tests"), { n: 0 }],
      ["`workflow_call` com outro gatilho colide", falso(N), portao("Guard Tests", "[push, workflow_call]"), { n: 1 }],
      ["`workflow_call` em bloco com outro gatilho colide", falso(N), portao("Guard Tests", BLOCO + "  push:\n"), { n: 1 }],
      ["um `on:` ilegivel conta (falha fechada)", falso(N), portao("Guard Tests", "*gatilhos"), { n: 1 }],
      ["sem `on:` conta (falha fechada)", falso(N), portao("Guard Tests").replace("on: push\n", ""), { n: 1 }],
      ["um `on:` vazio conta (falha fechada)", falso(N), portao("Guard Tests", ""), { n: 1 }],
      ["`strategy:` sem `matrix:` (um `matrix:` num `env:`) tem o nome nu: colide", falso(N + "    strategy:\n      fail-fast: false\n    env:\n      matrix: x\n"), portao("Guard Tests"), { n: 1 }],
      ["a matriz em flow no `strategy:` nao colide", falso(N + "    strategy: { matrix: { os: [a] } }\n"), portao("Guard Tests"), { n: 0 }],
      ["o nome com uma ancora (`&n`) le-se como o YAML: colide", falso("    name: &n Guard Tests\n"), portao("Guard Tests"), { n: 1 }],
      ["o nome com a tag `!!str` colide", falso("    name: !!str Guard Tests\n"), portao("Guard Tests"), { n: 1 }],
      ["o nome com um escape entre aspas duplas colide", falso('    name: "Guard\\x20Tests"\n'), portao("Guard Tests"), { n: 1 }],
      // As aspas e os escapes lidos como o YAML (#420): cada caso com a forma que a leitura ingenua errava.
      ["`\\\"` dentro das aspas duplas le-se como uma aspa: colide", falso('    name: "Guard \\"x\\""\n'), portao('Guard "x"'), { n: 1 }],
      ["aspas duplas que nao fecham nao se leem: nao colide, nem com outro igual", falso('    name: "Guard Tests\n'), portao('"Guard Tests'), { n: 0 }],
      ["aspas simples que nao fecham, acabadas em `''`, nao se leem: nao colide", falso("    name: 'Guard Tests''\n"), portao("Guard Tests"), { n: 0 }],
      ["`\\\\x41` e uma barra e `x41`, nao um `A`: colide com o literal `Guard\\x41`", falso('    name: "Guard\\\\x41"\n'), portao("Guard\\x41"), { n: 1 }],
      ["a tag antes da ancora le-se como o YAML: colide", falso("    name: !!str &n Guard Tests\n"), portao("Guard Tests"), { n: 1 }],
      ["a tag nao especifica `!` le-se como o YAML: colide", falso("    name: ! Guard Tests\n"), portao("Guard Tests"), { n: 1 }],
      ["um nome entre aspas que comeca por `!` e literal: colide", falso("    name: '!Gate'\n"), portao('"!Gate"'), { n: 1 }],
      ["um bloco `on:` com uma chave ilegivel conta (falha fechada)", falso(N), portao("Guard Tests", BLOCO + "  <<: *x\n"), { n: 1 }],
      ["`[workflow_call,` partido por linhas, com outro gatilho, colide", falso(N), portao("Guard Tests", "[workflow_call,\n    push]"), { n: 1 }],
      ["o tocado e o portao, e o outro tem o nome: colide (o lado do `ci.yml`)", portao("Deploy"), falso("    name: Deploy\n"), { n: 1 }],
    ]) {
      const c = colisoesEntreWorkflows(texto, [{ f: ".github/workflows/ci.yml", texto: outro }]);
      registarResultado(`estrutura: entre workflows — ${nome} (#355)`, c.size === n ? [] : [`esperava ${n} colisao(oes), deu ${c.size}: ${JSON.stringify([...c.values()])}`]);
    }
    const outros = [{ f: ".github/workflows/ci.yml", texto: portao("Guard Tests") }];
    const ms = colisoesEntreWorkflows(falso(N), [...outros, { f: ".github/workflows/d.yml", texto: portao("Guard Tests") }]).get("guard tests") ?? [];
    // Os dois lados mudam no MESMO PR (a leitura adversarial): o `Build` repetido, sem portao na base, passa a
    // ter maquinaria nos dois. O antes contra os outros da BASE ve-o como novo.
    const build = (q) => portao("Build").replace("node .agent/scripts/tests/test-guards.mjs", q);
    const baseB = [{ f: ".github/workflows/deploy.yml", texto: build("echo ok") }], agoraB = [{ f: ".github/workflows/deploy.yml", texto: portao("Build") }];
    const outroId = (x) => x.replace("  fake:", "  falso:");
    registarResultado("estrutura: entre workflows — as mensagens, e so os novos contam (#355)", [
      ...(ms.length === 2 && ms[0].includes("o job `fake` tem o mesmo nome de check, `Guard Tests`, que o job `guard` (portao) de `.github/workflows/ci.yml`") && ms[1].includes("de `.github/workflows/d.yml`") ? [] : [`dois ficheiros com o portao: ${JSON.stringify(ms)}`]),
      ...(colisoesNovas(falso("    name: Outra\n"), outros, falso(N), outros).length === 1 ? [] : ["a colisao introduzida nao contou como nova"]),
      ...(colisoesNovas(falso(N), outros, falso(N), outros).length === 0 ? [] : ["uma colisao que ja existia contou como nova"]),
      ...(colisoesNovas(build("echo ok"), baseB, portao("Build"), agoraB).length === 1 ? [] : ["os dois lados a ganhar a maquinaria no mesmo PR passaram calados"]),
      ...(colisoesNovas(falso(N), outros, outroId(falso(N)), outros).length === 0 ? [] : ["mudar o id do job fez renascer uma colisao antiga"]),
    ]);
  }
}
