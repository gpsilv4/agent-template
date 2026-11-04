/**
 * Testes da 2b sobre o MODO do projeto (#429): parcial, contradicao, completo — {{PROJECT_NAME}}
 *
 * O `simulate-upgrade --projeto` so mede um projeto com a maquinaria. Sem ela (o modo parcial), ou com a marca e o
 * disco a contradizerem-se, EXPLICA e sai != 0: um 0 que nao mediu nada era um portao a passar sobre nada. A regra
 * vive em `lib/modo-upgrade.mjs` (os seus casos estao no `test-modo-upgrade.mjs`); aqui, a ponta: a mensagem e o
 * codigo que o simulador da em cada resultado, e a ORDEM das recusas (a marca ilegivel primeiro, como hoje).
 *
 * PORQUE VIVE A PARTE: o `tests-medida-2b.mjs` estava a 454 linhas. NAO e um entry point: o `tests-medida-2b.mjs`
 * importa-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { exige, contraProjeto, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-medida-2b-modo.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

const SEM_JOB = { ".github/workflows/ci.yml": "jobs:\n  outro:\n    steps: []\n" };
// O job INTEIRO comentado: o leitor da 2b deita fora as linhas comentadas, logo conta como ausente.
const JOB_COMENTADO = { ".github/workflows/ci.yml": "jobs:\n#  guard-tests:\n#    steps:\n#      - run: node .agent/scripts/stub.mjs\n  outro:\n    steps: []\n" };
// O job presente e SEM comandos: o completo que nao deriva nada (a recusa antiga, que fica para este caso).
const JOB_VAZIO = { ".github/workflows/ci.yml": "jobs:\n  guard-tests:\n    steps: []\n" };
const PARCIAL = "projeto sem a maquinaria: modo parcial, nada medido aqui";

export function registar() {
  test("modo: projeto sem o job `guard-tests` e sem `modo:` -> parcial, explica e sai != 0", () =>
    exige(contraProjeto({ projeto: SEM_JOB }), {
      codigo: 1,
      inclui: [PARCIAL, "nao tem o job `guard-tests`", "src/docs/upgrade-parcial.md", ".githooks/commit-msg", "check-backlog.mjs"],
      exclui: ["ci.yml DESTE projeto"],
    }));

  // A FRONTEIRA de permissoes vem na mesma no parcial: o `deny`/`ask` em falta lista-se antes de sair (o Guard 11 nao
  // vem, e um `node -e` a mao que cite o `settings.json` e negado pelo hook). O `allow` e o da maquinaria: nao se lista.
  test("modo: no parcial, lista o `deny` do template em falta no projeto (e nao o `allow` da maquinaria)", () => {
    const SET_TPL = JSON.stringify({ permissions: { deny: ["Edit(./.claude/settings.json)"], allow: ["Bash(node .agent/scripts/x.mjs)"] } });
    return exige(contraProjeto({ ontem: { ".claude/settings.json": SET_TPL }, projeto: { ...SEM_JOB, ".claude/settings.json": "{}" } }), {
      codigo: 1,
      inclui: [PARCIAL, "o `deny` do settings.json do template tem 1 regra(s)", "Edit(./.claude/settings.json)"],
      exclui: ["o `allow` do settings.json"],
    });
  });

  test("modo: o job `guard-tests` inteiro COMENTADO conta como ausente -> parcial", () =>
    exige(contraProjeto({ projeto: JOB_COMENTADO }), { codigo: 1, inclui: [PARCIAL] }));

  test("modo: `modo: parcial` na marca e o ci.yml sem o job -> parcial", () =>
    exige(contraProjeto({ projeto: SEM_JOB, naMarca: "modo: parcial\n" }), { codigo: 1, inclui: [PARCIAL, "a marca diz `modo: parcial`"] }));

  test("modo: `modo: parcial` na marca e o ci.yml COM o job -> contradicao, sai != 0", () =>
    exige(contraProjeto({ naMarca: "modo: parcial\n" }), {
      codigo: 1,
      inclui: ["a marca e o disco contradizem-se", "`modo: parcial`", "tem o job `guard-tests`"],
      exclui: [PARCIAL],
    }));

  test("modo: `modo: completo` na marca e o ci.yml SEM o job -> contradicao, sai != 0", () =>
    exige(contraProjeto({ projeto: SEM_JOB, naMarca: "modo: completo\n" }), {
      codigo: 1,
      inclui: ["a marca e o disco contradizem-se", "`modo: completo`", "nao tem o job `guard-tests`"],
      exclui: [PARCIAL],
    }));

  test("modo: completo com o job sem comandos -> a recusa antiga (nao derivei comandos), e nao o parcial", () =>
    exige(contraProjeto({ projeto: JOB_VAZIO }), { codigo: 1, inclui: ["nao derivei comandos do job `guard-tests` do ci.yml DESTE projeto"], exclui: [PARCIAL] }));

  // A ORDEM: sem marca utilizavel e o Modo B, seja qual for o job. O modo so se le com uma marca.
  test("modo: sem marca e sem o job -> a mensagem do Modo B, e nao a do parcial", () =>
    exige(contraProjeto({ marca: null, projeto: SEM_JOB }), { codigo: 1, inclui: ["Modo B", "nao se mede"], exclui: [PARCIAL] }));
}
