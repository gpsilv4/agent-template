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
  // A forma unica do `PLANO_JOB` (#400): com um comentario e "ja tem"; com uma cauda (`&& y`), que antes contava, nao.
  registarResultado("2b CI: o portao do plano com um comentario YAML conta como adotado (#400)", nenhuma(notas({ ciLa: C2, ciAqui: IF_PLANO + PORTAO_PLANO.replace("}}\n", "}} # x\n") })));
  registarResultado("2b CI: o portao do plano com espacos no fim conta como adotado (#400)", nenhuma(notas({ ciLa: C2, ciAqui: IF_PLANO + PORTAO_PLANO.replace("}}\n", "}}  \n") })));
  registarResultado("2b CI: o portao do plano com uma cauda (`}} && y`) nao conta, e da a nota (#400)", so(notas({ ciLa: C2, ciAqui: IF_PLANO + PORTAO_PLANO.replace("}}\n", "}} && y\n") }), "quando o plano da base diz"));
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

  // O `concurrency:` de TOPO (#427): um grupo por commit num push, e o cancelamento so num PR. So o bloco de topo conta.
  const conc = (g, v) => `on: push\nconcurrency:\n  group: ${g}\n  cancel-in-progress: ${v}\njobs:\n`;
  const NOVO = conc("ci-${{ github.event.pull_request.number || github.sha }}", "${{ github.event_name == 'pull_request' }}");
  const VELHO = conc("ci-${{ github.event.pull_request.number || github.ref }}", "true");
  const COM = "o `concurrency:` do template da a cada push o seu grupo";
  registarResultado("2b CI: o projeto com o grupo do ref e `true` da a nota, com as duas razoes (#427)", [
    ...so(notas({ ciLa: NOVO, ciAqui: VELHO }), COM),
    ...["`github.sha`", "nao e so dos PRs"].filter((t) => !(notas({ ciLa: NOVO, ciAqui: VELHO })[0] ?? "").includes(t)).map((t) => `a nota nao diz "${t}"`),
  ]);
  registarResultado("2b CI: `true` com um comentario YAML tambem da a nota (#427)", so(notas({ ciLa: NOVO, ciAqui: VELHO.replace("true\n", "true # x\n") }), COM));
  registarResultado("2b CI: `false` com o grupo do ref da a nota (o pendente cancelado num burst) (#427)", so(notas({ ciLa: NOVO, ciAqui: VELHO.replace("true\n", "false\n") }), COM));
  registarResultado("2b CI: a forma do template nos dois lados, nao (#427)", nenhuma(notas({ ciLa: NOVO, ciAqui: NOVO })));
  registarResultado("2b CI: um projeto sem `concurrency:` de topo, nao (#427)", nenhuma(notas({ ciLa: NOVO, ciAqui: "on: push\njobs:\n" })));
  registarResultado("2b CI: um `true` num `concurrency:` de JOB, com o topo certo, nao (#427)",
    nenhuma(notas({ ciLa: NOVO, ciAqui: `${NOVO}  deploy:\n    concurrency:\n      group: deploy\n      cancel-in-progress: true\n` })));
  registarResultado("2b CI: um template sem a forma nova nao da a nota (#427)", nenhuma(notas({ ciLa: VELHO, ciAqui: VELHO })));

  // As verificacoes da app numa corrida vermelha (#428): passo a passo, pelo nome. Cada passo e "nao" (sem nada), "if"
  // (o `if:` sem o gate do `Install`) ou "ok" (o `if:` e o gate); `null` tira o passo.
  const passo = (nome, e) => (e === null ? "" : `      - name: ${nome}\n${e !== "nao" ? "        if: ${{ !cancelled() }}\n" : ""}${e === "ok" ? "        env:\n          INSTALOU: ${{ steps.install.conclusion }}\n" : ""}        run: npm test\n`);
  const qual = (a, b) => `jobs:\n  quality:\n    steps:\n${passo("Lint", a)}${passo("Build", b)}`;
  const NC = "corre todas as verificacoes do `Code Quality`";
  registarResultado("2b CI: o `!cancelled()` so no template da a nota (#428)", so(notas({ ciLa: qual("ok", "ok"), ciAqui: qual("nao", "nao") }), NC));
  registarResultado("2b CI: o `!cancelled()` a meias no projeto da a nota (#428)", so(notas({ ciLa: qual("ok", "ok"), ciAqui: qual("ok", "nao") }), NC));
  registarResultado("2b CI: o `if:` sem o gate do `Install` da a nota (a adocao a meias perigosa, #428)", so(notas({ ciLa: qual("ok", "ok"), ciAqui: qual("if", "if") }), "sem o gate do `Install`: Lint, Build"));
  registarResultado("2b CI: o `!cancelled()` e o gate em todas, nos dois lados, nao (#428)", nenhuma(notas({ ciLa: qual("ok", "ok"), ciAqui: qual("ok", "ok") })));
  registarResultado("2b CI: um passo que o projeto tirou nao e \"a meias\" (#428)", nenhuma(notas({ ciLa: qual("ok", "ok"), ciAqui: qual("ok", null) })));
  registarResultado("2b CI: um projeto sem o job `quality`, ou um template sem a forma, nao (#428)", [
    ...nenhuma(notas({ ciLa: qual("ok", "ok"), ciAqui: "jobs:\n  build:\n" })),
    ...nenhuma(notas({ ciLa: qual("nao", "nao"), ciAqui: qual("nao", "nao") })),
  ]);
  {
    const [n = ""] = notas({ ciLa: qual("ok", "ok"), ciAqui: qual("nao", "nao") });
    registarResultado("2b CI: a nota do `!cancelled()` manda trazer o gate do `Install` e diz a forma exacta (#428)",
      ["`id: install`", "`case \"$INSTALOU\"`", "forma EXACTA", "OPCIONAL"].filter((t) => !n.includes(t)).map((t) => `a nota nao diz "${t}"`));
  }

  // O PACOTE de um job (#477): um job `ci` E um `guard-tests` com `needs: ci`. As tres notas do portao (o plano, o salto
  // do merge, o titulo) calam-se, e sai a do pacote. O sinal e positivo: um CI completo sem `guard-gate` (o de antes do
  // #308) continua a recebe-las — e o controlo de que a condicao nao e "sem portao".
  {
    const PORTAO_TODO = C2 + IF_MERGE + PORTAO + TITULO + FINAL;
    const PAC = "jobs:\n  ci:\n    name: CI\n  guard-tests:\n    needs: ci\n";
    const PACOTE = "CI do pacote de um job";
    registarResultado("2b CI: o pacote de um job cala as notas do portao e da a sua (#477)", so(notas({ ciLa: PORTAO_TODO, ciAqui: PAC + TITULO, guardAqui: "    needs: ci\n" }), PACOTE));
    registarResultado("2b CI: `needs: [ci]` tambem e o pacote (#477)", so(notas({ ciLa: PORTAO_TODO, ciAqui: PAC + TITULO, guardAqui: "    needs: [ci]\n" }), PACOTE));
    const semNeeds = notas({ ciLa: PORTAO_TODO, ciAqui: PAC + TITULO, guardAqui: "    runs-on: x\n" });
    registarResultado("2b CI: um job `ci` sem o `needs: ci` no `guard-tests` nao e o pacote: as tres notas voltam (#477)",
      semNeeds.length === 3 && !semNeeds.some((n) => n.includes(PACOTE)) ? [] : [`sairam: ${JSON.stringify(semNeeds.map((n) => n.slice(0, 40)))}`]);
    const semCi = notas({ ciLa: PORTAO_TODO, ciAqui: "jobs:\n  guard-tests:\n    needs: ci\n" + TITULO, guardAqui: "    needs: ci\n" });
    registarResultado("2b CI: um `needs: ci` sem o job `ci` nao e o pacote (#477)", semCi.some((n) => n.includes(PACOTE)) ? ["saiu a nota do pacote"] : []);
    const antigo = notas({ ciLa: PORTAO_TODO, ciAqui: "jobs:\n  quality:\n  guard-tests:\n" + FINAL, guardAqui: "    runs-on: x\n" });
    registarResultado("2b CI: um CI completo de antes do `guard-gate` (#308) continua a receber as tres notas (#477)",
      ["quando o plano da base diz", "push de um merge", "verifica o TITULO do PR"].filter((t) => !antigo.some((n) => n.includes(t))).map((t) => `faltou "${t}"`));
  }

  // A ORDEM, que era a de antes de sair do `medida-upgrade.mjs`.
  const todas = notas({ repetidos: { "guard-tests": ["node x.mjs"] }, guardLa: PARALELO, ciLa: NOVO + SHARDS + C2 + IF_MERGE + PORTAO, ciAqui: `${VELHO}  detect:\n  unit-tests:\n` });
  const ordem = ["corre 2x no job", "em paralelo", "reparte a varredura", "quando o plano da base diz", "push de um merge", COM, "passos de UM job"];
  registarResultado("2b CI: as sete notas saem pela ordem de sempre (#347, #427)", todas.length === 7 && ordem.every((t, i) => todas[i].includes(t)) ? [] : [`sairam: ${JSON.stringify(todas.map((n) => n.slice(0, 40)))}`]);
}
