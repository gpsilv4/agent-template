/**
 * As regex que reconhecem o RUNNER das suites em paralelo e o CAMINHO de uma suite, presas umas as outras (#374a,
 * `TP8`). Testes de CARACTERIZACAO: fixam o que cada uma aceita HOJE, linha a linha.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE NAO UMA SO FONTE: construi-las por fragmentos apagava sitios da varredura (os pares do `passo-paralelo` e
 * do `surface-patterns` so casam regex LITERAIS) e tirava a independencia ao oraculo do `tests-suites-em-paralelo`,
 * que deixava de poder apanhar um defeito da regex que julga (o `plan-auditor` do #374). Ficam onde estao, e esta
 * tabela da o veredicto esperado de cada uma: mudar uma sem mudar as outras (ou sem escrever a diferenca aqui)
 * pinta a linha de vermelho.
 *
 * Cada regex e lida pelo caminho PUBLICO que ja tem, sem mudar codigo: o `RUNNER`/`SUITE` exportados, o `leArgs` do
 * runner, a nota da 2b (`emParalelo`), a contagem da superficie, o oraculo exportado, e o `repetidosPorJob`.
 */
import { pathToFileURL } from "url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { registarResultado } from "./harness/test-harness.mjs";
import { RUNNER, SUITE } from "../lib/passo-paralelo.mjs";
import { leArgs } from "../lib/suites-em-paralelo.mjs";
import { notasDaFormaDoCi } from "../lib/medida-upgrade-ci.mjs";
import { CONTAGENS } from "../lib/surface-patterns.mjs";
import { repetidosPorJob } from "../lib/medida-upgrade.mjs";
import { suitesQueOCICorre } from "./tests-suites-em-paralelo.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-regex-runner.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

const RUN = ".agent/scripts/lib/suites-em-paralelo.mjs";

/**
 * O DOMINIO DO RUNNER: cada linha e o veredicto de hoje, MEDIDO (nao deduzido). As diferencas sao DE PROPOSITO:
 *  - `emParalelo` (a nota da 2b) procura so o comando, com `\b`: aceita o `--max=` vazio e um comentario no fim, que
 *    o `RUNNER` (a linha inteira, para a particao) recusa. O `RUNNER` e a contagem aceitam o `--max=0`, que o runner
 *    recusa no `leArgs`. Inofensivos: o runner recusa um `--max` invalido, e o passo fica vermelho;
 *  - a contagem conta as SUITES da cadeia (o caminho do runner nao tem `test|check|sweep|simulate`): a 1.a pela
 *    alternativa do bloco `run: |`, a 2.a pelo lookbehind, que so casa depois de um runner reconhecido — 2, senao 1;
 *  - o oraculo, numa cadeia que a sua rede de seguranca NAO apanha (`node x/a.mjs`: ele tambem le qualquer
 *    `node ...tests/test-*.mjs` solto), da 2 quando reconhece o runner e 0 quando nao: igual ao `emParalelo`, texto a
 *    texto. Com um comentario no fim, ve o `\` que o bash ja tem dentro do comentario, e conta 2 (o runner real
 *    nao recebe suites, e reprova: vermelho, nao verde).
 */
const LINHAS = [
  [`exec node ${RUN} --`, { RUNNER: true, emParalelo: true, contagem: 2, oraculo: 2 }],
  [`node ${RUN} --`, { RUNNER: true, emParalelo: true, contagem: 2, oraculo: 2 }],
  [`node ./${RUN} --`, { RUNNER: true, emParalelo: true, contagem: 2, oraculo: 2 }],
  [`exec node ${RUN} --max=2 --`, { RUNNER: true, emParalelo: true, contagem: 2, oraculo: 2 }],
  [`exec node ${RUN} --max=0 --`, { RUNNER: true, emParalelo: true, contagem: 2, oraculo: 2 }],
  [`exec node ${RUN} --max= --`, { RUNNER: false, emParalelo: true, contagem: 1, oraculo: 2 }],
  [`exec  node  ${RUN}  --`, { RUNNER: true, emParalelo: true, contagem: 2, oraculo: 2 }],
  [`exec\tnode\t${RUN}\t--`, { RUNNER: true, emParalelo: true, contagem: 2, oraculo: 2 }],
  [`exec node ${RUN} -- # nota`, { RUNNER: false, emParalelo: true, contagem: 1, oraculo: 2 }],
  [`echo ${RUN} --`, { RUNNER: false, emParalelo: false, contagem: 1, oraculo: 0 }],
  ["node .agent/scripts/lib/outro.mjs --", { RUNNER: false, emParalelo: false, contagem: 1, oraculo: 0 }],
  [`node ${RUN}x --`, { RUNNER: false, emParalelo: false, contagem: 1, oraculo: 0 }],
];

/**
 * A forma de UMA linha, `- run: exec node <runner> -- node <suite>` (o `ci.yml` de um derivado na 2b-config): so a
 * nota da 2b a reconhece. A contagem da superficie da 0 e o oraculo perde a suite — o primeiro e um defeito, no seu
 * issue; aqui fica o comportamento de HOJE (o `/refactor`: o teste fixa, corrigir e outro ticket).
 */
const UMA_LINHA = [`- run: exec node ${RUN} -- node .agent/scripts/tests/test-a.mjs`, { RUNNER: false, emParalelo: true, contagem: 0, oraculo: 0 }];

/**
 * O DOMINIO DO CAMINHO de uma suite. O `SUITE` do `passo-paralelo` (uma linha `node <caminho>`) e o do runner (um
 * argumento, pelo `leArgs`) concordam em tudo, com espaco ou tab (`SUITEtab`). O `repetidosPorJob` (a 2b) e a rede
 * de seguranca do oraculo (um `node ...tests/test-*.mjs` solto) sao mais largos DE PROPOSITO: procuram, nao validam
 * o que corre — aceitam qualquer pasta `tests/`, na raiz tambem, e o `./` a frente.
 */
const CAMINHOS = [
  [".agent/scripts/tests/test-guards.mjs", { SUITE: true, SUITEtab: true, leArgs: true, repetidos: true, oraculo: 1 }],
  [".claude/hooks/tests/test-hooks.mjs", { SUITE: true, SUITEtab: true, leArgs: true, repetidos: true, oraculo: 1 }],
  [".agent/scripts/tests/tests-portao-ci.mjs", { SUITE: false, SUITEtab: false, leArgs: false, repetidos: false, oraculo: 0 }],
  ["scripts/tests/test-x.mjs", { SUITE: false, SUITEtab: false, leArgs: false, repetidos: true, oraculo: 1 }],
  ["outro/tests/test-x.mjs", { SUITE: false, SUITEtab: false, leArgs: false, repetidos: true, oraculo: 1 }],
  ["tests/test-x.mjs", { SUITE: false, SUITEtab: false, leArgs: false, repetidos: true, oraculo: 1 }],
  [".agent/scripts/tests/test-.mjs", { SUITE: false, SUITEtab: false, leArgs: false, repetidos: false, oraculo: 0 }],
  [".agent/scripts/lib/test-x.mjs", { SUITE: false, SUITEtab: false, leArgs: false, repetidos: false, oraculo: 0 }],
  ["./.agent/scripts/tests/test-x.mjs", { SUITE: false, SUITEtab: false, leArgs: false, repetidos: true, oraculo: 1 }],
];

// O `contados` tem um gemeo no `tests-surface-blocos.mjs` (o R14). Ficam os dois de proposito: o R14 prende a
// PARTICAO (o `partePasso`, com a continuacao das linhas) a contagem; este prende as REGEX cruas umas as outras.
const conta = CONTAGENS.find((c) => c.msg === "steps de verificacao no CI").re;
const contados = (t) => (t.match(new RegExp(conta.source, conta.flags.includes("g") ? conta.flags : `${conta.flags}g`)) ?? []).length;
const ciCom = (linha) => `jobs:\n  guard-tests:\n    steps:\n      - name: suites\n        run: |\n          ${linha} \\\n            node .agent/scripts/tests/test-a.mjs \\\n            node .agent/scripts/tests/test-b.mjs\n`;
/** Uma cadeia de caminhos que nao sao suites: so a regex de runner do oraculo os pode ler (#374a). */
const ciCadeiaLivre = (linha) => `jobs:\n  guard-tests:\n    steps:\n      - name: suites\n        run: |\n          ${linha} \\\n            node x/a.mjs \\\n            node x/b.mjs\n`;

/** As diferencas entre o obtido e o esperado de uma linha, ou `[]`. */
const difere = (rotulo, obtido, esperado) =>
  Object.entries(esperado).filter(([k, v]) => obtido[k] !== v).map(([k, v]) => `${rotulo}: ${k} deu ${JSON.stringify(obtido[k])}, esperado ${JSON.stringify(v)}`);

/** A nota da 2b sobre o paralelo, para `guardLa` com a linha `l` (os outros lados vazios: so ela pode sair). */
const emParalelo = (l) => {
  const notas = [];
  notasDaFormaDoCi({ ciAqui: "", ciLa: "", guardAqui: "", guardLa: `          ${l}\n`, repetidos: null, sweepAqui: undefined, note: (m) => notas.push(m) });
  return notas.some((n) => n.includes("em paralelo"));
};

export function registar() {
  registarResultado("regex do runner: as quatro leem cada linha como a tabela diz (#374)", LINHAS.flatMap(([l, esperado]) =>
    difere(JSON.stringify(l), {
      RUNNER: RUNNER.test(l),
      emParalelo: emParalelo(l),
      contagem: contados(ciCom(l)),
      oraculo: suitesQueOCICorre(ciCadeiaLivre(l)).size,
    }, esperado)));
  {
    const [l, esperado] = UMA_LINHA;
    const ci = `jobs:\n  guard-tests:\n    steps:\n      ${l}\n`;
    registarResultado("regex do runner: a forma de uma so linha, como a tabela diz (#374)", difere(JSON.stringify(l), {
      RUNNER: RUNNER.test(l),
      emParalelo: emParalelo(l),
      contagem: contados(ci),
      oraculo: suitesQueOCICorre(ci).size,
    }, esperado));
  }

  const dir = mkdtempSync(join(tmpdir(), "regex-runner-test-"));
  try {
    registarResultado("regex do caminho de uma suite: as quatro leem cada caminho como a tabela diz (#374)", CAMINHOS.flatMap(([c, esperado]) => {
      mkdirSync(join(dir, ".github/workflows"), { recursive: true });
      writeFileSync(join(dir, ".github/workflows/ci.yml"), `jobs:\n  guard-tests:\n    steps:\n      - run: node ${c}\n      - run: node ${c}\n  sweep:\n    steps:\n      - run: echo\n`);
      return difere(JSON.stringify(c), {
        SUITE: SUITE.test(`node ${c}`),
        SUITEtab: SUITE.test(`node\t${c}`),
        leArgs: leArgs(["--", "node", c]).erros.length === 0,
        repetidos: (repetidosPorJob(dir)?.["guard-tests"] ?? []).length > 0,
        oraculo: suitesQueOCICorre(`jobs:\n  guard-tests:\n    steps:\n      - run: node ${c}\n`).size,
      }, esperado);
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
