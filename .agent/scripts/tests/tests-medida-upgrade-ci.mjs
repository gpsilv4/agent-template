/**
 * As notas da FORMA do `ci.yml` na seccao 2b (`lib/medida-upgrade-ci.mjs`, #347 C0), uma a uma.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`. E o DONO do alvo
 * na varredura (`tests-<alvo>.mjs`): corre primeiro, e como a funcao e pura cada `note()` desligada morre
 * aqui em milissegundos — e nao numa corrida inteira da suite do upgrade, que tambem as ve de ponta a ponta
 * (`tests-medida-2b-config.mjs`).
 *
 * Cada nota tem o par: a diferenca que a faz sair, e o mesmo texto dos dois lados, que nao.
 */
import { pathToFileURL } from "url";
import { registarResultado } from "./harness/test-harness.mjs";
import { notasDaFormaDoCi } from "../lib/medida-upgrade-ci.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-medida-upgrade-ci.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const IF_MERGE = "    if: github.event_name == 'pull_request' || !github.event.repository.private || github.event.head_commit.committer.username != 'web-flow'\n";
const PORTAO = '          [ "$COMMITTER" = web-flow ]\n';
const PARALELO = "          exec node .agent/scripts/lib/suites-em-paralelo.mjs -- x\n";
const SHARDS = "          SWEEP_SHARD: 1/2\n";
const VARRE = ["node .agent/scripts/mutation-sweep.mjs"];

/** As notas que saem com os dois lados por omissao IGUAIS (nada a dizer) e `o` a mudar um deles. */
function notas(o) {
  const ns = [];
  notasDaFormaDoCi({ ciAqui: "", ciLa: "", guardAqui: "", guardLa: "", repetidos: null, sweepAqui: VARRE, ...o, note: (m) => ns.push(m) });
  return ns;
}
/** O caso passa se sair exactamente uma nota, e com `trecho`. */
const so = (ns, trecho) => (ns.length === 1 && ns[0].includes(trecho) ? [] : [`esperava uma nota com "${trecho}", sairam: ${JSON.stringify(ns.map((n) => n.slice(0, 60)))}`]);
const nenhuma = (ns) => (ns.length === 0 ? [] : [`nao devia sair nota, sairam: ${JSON.stringify(ns.map((n) => n.slice(0, 60)))}`]);

export function registar() {
  registarResultado("2b CI: os dois lados vazios nao dao nota nenhuma (#347)", nenhuma(notas({})));

  // Os REPETIDOS (#337): um passo que corre 2x no mesmo job.
  registarResultado("2b CI: um passo repetido no projeto da a nota (#347)", so(notas({ repetidos: { "guard-tests": ["node x.mjs"] } }), "corre 2x no job `guard-tests`"));
  registarResultado("2b CI: sem repetidos, nao (#347)", nenhuma(notas({ repetidos: {} })));

  // O PASSO EM PARALELO (#337): o template tem-no, o projeto nao. Comentado conta como ausente.
  registarResultado("2b CI: o paralelo so no template da a nota (#347)", so(notas({ guardLa: PARALELO }), "em paralelo"));
  registarResultado("2b CI: o paralelo nos dois lados, nao (#347)", nenhuma(notas({ guardLa: PARALELO, guardAqui: PARALELO })));
  registarResultado("2b CI: o paralelo comentado no template nao conta (#347)", nenhuma(notas({ guardLa: `#${PARALELO}` })));

  // Os SHARDS (#308): so a quem tem o `sweep` com a varredura.
  registarResultado("2b CI: os shards so no template da a nota (#347)", so(notas({ ciLa: SHARDS }), "reparte a varredura"));
  registarResultado("2b CI: os shards nos dois lados, nao (#347)", nenhuma(notas({ ciLa: SHARDS, ciAqui: SHARDS })));
  registarResultado("2b CI: os shards, num projeto sem a varredura no `sweep`, nao (#347)", nenhuma(notas({ ciLa: SHARDS, sweepAqui: undefined })));
  // Um `sweep` que existe mas corre OUTRA coisa (leitura do C0): sem isto, afrouxar para `sweepAqui?.length` passava.
  registarResultado("2b CI: os shards, num `sweep` sem a varredura de mutacao, nao (#347)", nenhuma(notas({ ciLa: SHARDS, sweepAqui: ["node .agent/scripts/outro.mjs"] })));

  // O salto do push de um merge num privado (#347, PR B): "ja tem" = o `if:` E o shell do portao.
  registarResultado("2b CI: o salto do merge so no template da a nota (#347)", so(notas({ ciLa: IF_MERGE + PORTAO }), "push de um merge num repo privado"));
  registarResultado("2b CI: o salto do merge nos dois lados, nao (#347)", nenhuma(notas({ ciLa: IF_MERGE + PORTAO, ciAqui: IF_MERGE + PORTAO })));
  registarResultado("2b CI: so o `if:` do salto no projeto (a meias) da a nota (#347)", so(notas({ ciLa: IF_MERGE + PORTAO, ciAqui: IF_MERGE }), "push de um merge num repo privado"));
  // O simetrico (leitura do C0): so o shell do portao, sem os `if:`. Sem ele, tirar a metade `if:` passava.
  registarResultado("2b CI: so o shell do portao no projeto (a meias) da a nota (#347)", so(notas({ ciLa: IF_MERGE + PORTAO, ciAqui: PORTAO }), "push de um merge num repo privado"));

  // Os jobs CURTOS da app (#347, PR A): pelo menos dois dos tres ids no projeto, e nenhum no template.
  registarResultado("2b CI: dois jobs curtos no projeto da a nota (#347)", so(notas({ ciAqui: "jobs:\n  detect:\n  unit-tests:\n" }), "passos de UM job"));
  registarResultado("2b CI: um `detect` sozinho, nao (#347)", nenhuma(notas({ ciAqui: "jobs:\n  detect:\n" })));
  // So ids de JOB (a 2 espacos), e nao chaves aninhadas (leitura do C0): com `^\s*`, `    detect:` contava.
  registarResultado("2b CI: `detect`/`unit-tests` aninhados (nao sao jobs), nao (#347)", nenhuma(notas({ ciAqui: "jobs:\n  x:\n    detect:\n    unit-tests:\n" })));
  registarResultado("2b CI: os jobs curtos nos dois lados, nao (#347)", nenhuma(notas({ ciAqui: "jobs:\n  detect:\n  unit-tests:\n", ciLa: "jobs:\n  detect:\n" })));

  // A ORDEM, que era a de antes de sair do `medida-upgrade.mjs`.
  const todas = notas({ repetidos: { "guard-tests": ["node x.mjs"] }, guardLa: PARALELO, ciLa: SHARDS + IF_MERGE + PORTAO, ciAqui: "jobs:\n  detect:\n  unit-tests:\n" });
  const ordem = ["corre 2x no job", "em paralelo", "reparte a varredura", "push de um merge", "passos de UM job"];
  registarResultado("2b CI: as cinco notas saem pela ordem de sempre (#347)", todas.length === 5 && ordem.every((t, i) => todas[i].includes(t)) ? [] : [`sairam: ${JSON.stringify(todas.map((n) => n.slice(0, 40)))}`]);
}
