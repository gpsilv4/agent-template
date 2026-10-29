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
import { defeitosDeEstrutura, colisoesEntreWorkflows, colisoesNovas } from "../lib/estrutura-workflow.mjs";
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
  // O que o bootstrap deixa: o `ci.yml` do TEMPLATE sem o job `simulators` (o §2.7 remove-o) nao tem
  // defeitos. So no template: num derivado, o `ci.yml` e do projeto.
  {
    const lerRaiz = (rel) => leOuNull(join(ROOT, rel));
    const ci = lerRaiz(".github/workflows/ci.yml");
    if (ehDerivado(lerRaiz) || ci === null) console.log("  SKIP  gate: o ci.yml do template sem o `simulators` (so no template)");
    else {
      const semSimuladores = ci.replace(/^  simulators:[\s\S]*?(?=^  [\w-]+:[ \t]*(?:#.*)?$)/m, "");
      registarResultado("gate: o ci.yml do template, sem o job `simulators` (o bootstrap), nao tem defeitos de estrutura (#308)", [
        ...(semSimuladores !== ci ? [] : ["nao encontrei o job `simulators` para o tirar"]),
        ...defeitosDeEstrutura(semSimuladores),
        ...defeitosDeEstrutura(ci),
      ]);
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
