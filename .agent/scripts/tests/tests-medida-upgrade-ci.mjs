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
/** O C2 (#347): o `if:` do `sweep` na forma exacta, e o portao a ler o output do job. */
const IF_PLANO = "    if: github.event_name == 'pull_request' && needs.guard-tests.outputs.aplica == 'true'\n";
const PORTAO_PLANO = "          PLANO_JOB: ${{ needs.guard-tests.outputs.aplica }}\n";

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

  // O PLANO da varredura (#347, C2): "ja tem" = o `if:` exacto E o portao a ler o `PLANO_JOB`. A meias, a nota.
  const C2 = IF_PLANO + PORTAO_PLANO;
  registarResultado("2b CI: o plano so no template da a nota (#347 C2)", so(notas({ ciLa: C2 }), "quando o plano da base diz"));
  registarResultado("2b CI: o plano nos dois lados, nao (#347 C2)", nenhuma(notas({ ciLa: C2, ciAqui: C2 })));
  registarResultado("2b CI: so o `if:` do plano no projeto (a meias) da a nota (#347 C2)", so(notas({ ciLa: C2, ciAqui: IF_PLANO }), "quando o plano da base diz"));
  registarResultado("2b CI: so o portao do plano no projeto (a meias) da a nota (#347 C2)", so(notas({ ciLa: C2, ciAqui: PORTAO_PLANO }), "quando o plano da base diz"));
  // A forma e a da isencao: um `if:` com uma cauda no projeto nao e "ja adotado" (e e o que o `check-test-surface` reprova).
  registarResultado("2b CI: o `if:` do plano noutra forma no projeto da a nota (#347 C2)", so(notas({ ciLa: C2, ciAqui: IF_PLANO.replace("'true'", "'true' && true") + PORTAO_PLANO }), "forma EXACTA"));
  registarResultado("2b CI: um template sem o portao do plano nao da a nota (#347 C2)", nenhuma(notas({ ciLa: IF_PLANO })));
  {
    const [n = ""] = notas({ ciLa: C2 });
    registarResultado("2b CI: a nota do plano avisa a meia adocao e o `sweep` em `push` (#347 C2, R5/R6)", ["VERMELHO cada PR sem maquinaria", "o shell sem o passo e o `if:`", "varrer tambem em `push`", "forma EXACTA", "TIRAR do passo da varredura o corpo antigo"].filter((t) => !n.includes(t)).map((t) => `a nota nao diz "${t}"`));
  }
  // O shell do portao e UM so, e hoje traz o C2 (leitura 2 do C2): a nota do salto do merge, seguida a letra, trazia o
  // plano sem o passo — cada PR vermelho. Tem de o dizer.
  {
    const [n = ""] = notas({ ciLa: IF_MERGE + PORTAO });
    registarResultado("2b CI: a nota do salto do merge diz que o shell do portao traz o plano (#347 C2)", n.includes("traz TAMBEM o plano da varredura") ? [] : ["a nota do salto do merge nao avisa que o shell traz o C2"]);
  }

  // O salto do push de um merge num privado (#347, PR B): "ja tem" = o `if:` E o shell do portao.
  registarResultado("2b CI: o salto do merge so no template da a nota (#347)", so(notas({ ciLa: IF_MERGE + PORTAO }), "push de um merge num repo privado"));
  // O que a nota MANDA trazer nao inclui o `Secret Scan` (#372): mandado, cada `/upgrade` reintroduzia nos derivados
  // um push que salta a varredura de segredos. O `simulate-upgrade` so mede que a nota aparece, nao o que diz.
  {
    const [n = ""] = notas({ ciLa: IF_MERGE + PORTAO });
    const [ordem, aviso] = n.split("O `Secret Scan` NAO salta");
    registarResultado("2b CI: a nota do salto do merge nao manda trazer o `if:` do `Secret Scan` (#372)", [
      ...(aviso === undefined ? ["a nota nao diz que o `Secret Scan` nao salta"] : []),
      ...(/Secret Scan|tres `if:`/.test(ordem) ? ["a parte que manda trazer os `if:` nomeia o `Secret Scan` (ou tres jobs)"] : []),
    ]);
  }
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

  // O TITULO do PR e a mensagem final (#394): "ja tem" = o `PR_TITULO` E os dois `COMMIT_MSG_FINAL` (passo e portao).
  const TITULO = "          COMMIT_MSG_FINAL: \"1\"\n          PR_TITULO: ${{ github.event.pull_request.title }}\n";
  const FINAL = "          COMMIT_MSG_FINAL: \"1\"\n";
  registarResultado("2b CI: o titulo do PR so no template da a nota (#394)", so(notas({ ciLa: TITULO + FINAL }), "verifica o TITULO do PR"));
  registarResultado("2b CI: o titulo do PR nos dois lados, nao (#394)", nenhuma(notas({ ciLa: TITULO + FINAL, ciAqui: TITULO + FINAL })));
  registarResultado("2b CI: o passo novo sem o `COMMIT_MSG_FINAL` do portao (a meias) da a nota (#394)", so(notas({ ciLa: TITULO + FINAL, ciAqui: TITULO }), "verifica o TITULO do PR"));

  // A ORDEM, que era a de antes de sair do `medida-upgrade.mjs`.
  const todas = notas({ repetidos: { "guard-tests": ["node x.mjs"] }, guardLa: PARALELO, ciLa: SHARDS + C2 + IF_MERGE + PORTAO, ciAqui: "jobs:\n  detect:\n  unit-tests:\n" });
  const ordem = ["corre 2x no job", "em paralelo", "reparte a varredura", "quando o plano da base diz", "push de um merge", "passos de UM job"];
  registarResultado("2b CI: as seis notas saem pela ordem de sempre (#347)", todas.length === 6 && ordem.every((t, i) => todas[i].includes(t)) ? [] : [`sairam: ${JSON.stringify(todas.map((n) => n.slice(0, 40)))}`]);
}
