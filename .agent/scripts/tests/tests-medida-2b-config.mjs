/**
 * Testes da 2b sobre a CONFIGURACAO do projeto: o `settings.json` (#301) e os jobs do `ci.yml` (#308) — {{PROJECT_NAME}}
 *
 * PORQUE VIVE A PARTE: o `tests-medida-2b.mjs` passou as 500 linhas com estes casos, e a fronteira e
 * natural — aquele mede o que o upgrade faz REPROVAR; este, o que o motor NAO toca (o `settings.json`
 * e o `ci.yml` sao do projeto) e a 2b tem de comparar com o template: as regras de `deny`/`ask` em
 * falta, e onde corre cada verificacao.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { exige, contraProjeto, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-medida-2b-config.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

/** Um passo que a bateria corre e que passa, para o `ci.yml` das fixtures ter algo a correr. */
const OUTRO = { ".agent/scripts/outro.mjs": 'console.log("  1 passaram, 0 falharam.");\n' };

export function registar() {
  // #301 (R7B-1): o motor nao toca no `settings.json`, e um derivado passou rondas sem o `ask` dos
  // hooks. A 2b lista as regras do template que faltam, literalmente.
  const SETTINGS = ".claude/settings.json";
  const perms = (deny, ask) => `${JSON.stringify({ permissions: { deny, ask, allow: [] } })}\n`;
  test("regras de deny/ask do template em falta no projeto aparecem na 2b (#301)", () =>
    exige(
      contraProjeto({
        hoje: { [SETTINGS]: perms(["Read(./.env)", "Read(~/.ssh/**)"], ["Bash(git push:*)", "Edit(./.claude/hooks/**)"]) },
        projeto: { [SETTINGS]: perms(["Read(./.env)"], ["Bash(git push:*)"]) },
      }),
      { codigo: 0, inclui: ["o `deny` do settings.json do template tem 1 regra(s)", "Read(~/.ssh/**)", "o `ask` do settings.json do template tem 1 regra(s)", "Edit(./.claude/hooks/**)"] }
    ));

  // O contra-caso: as mesmas regras dos dois lados (e uma do `ask` posta no `deny`, mais estrito) nao
  // se anunciam.
  test("as mesmas regras dos dois lados nao aparecem na 2b (#301)", () =>
    exige(
      contraProjeto({
        hoje: { [SETTINGS]: perms(["Read(./.env)"], ["Edit(./.claude/hooks/**)"]) },
        projeto: { [SETTINGS]: perms(["Read(./.env)", "Edit(./.claude/hooks/**)"], []) },
      }),
      { codigo: 0, exclui: ["do settings.json do template tem"] }
    ));

  // E a direcao contraria: uma regra do `deny` do template que o projeto so tem no `ask` e MAIS FRACA, e
  // falta (leitura independente do #301).
  test("uma regra do deny do template que o projeto so tem no ask aparece na 2b (#301)", () =>
    exige(
      contraProjeto({
        hoje: { [SETTINGS]: perms(["Bash(rm -rf:*)"], []) },
        projeto: { [SETTINGS]: perms([], ["Bash(rm -rf:*)"]) },
      }),
      { codigo: 0, inclui: ["o `deny` do settings.json do template tem 1 regra(s)", "Bash(rm -rf:*)"] }
    ));

  // #308: a varredura saiu do `guard-tests` para o job `sweep`. Um derivado sem ela (comentada, ou nunca
  // trazida) tem de continuar a aparecer — a NOTE existe por um derivado que passou seis rondas assim.
  test("a varredura no job `sweep` do template, ausente no projeto, sai como ausente (#308)", () =>
    exige(contraProjeto({
      hoje: { ".github/workflows/ci.yml": "jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/outro.mjs\n  sweep:\n    steps:\n      - run: |\n          node .agent/scripts/mutation-sweep.mjs\n", ...OUTRO },
      projeto: { ".github/workflows/ci.yml": "jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/outro.mjs\n", ...OUTRO },
    }), { codigo: 0, inclui: ["que o ci.yml deste projeto nao corre", ".agent/scripts/mutation-sweep.mjs"] }));

  // A COLOCACAO (#308, leitura independente): a uniao dos dois jobs nao via um derivado com a varredura
  // ainda no `guard-tests` — corria duas vezes, ou fora do check que a protecao exige.
  const ciDe = ({ guard = [], sweep = null, extra = "" }) =>
    "jobs:\n  guard-tests:\n    steps:\n" + guard.map((c) => `      - run: node ${c}\n`).join("") +
    (sweep === null ? "" : "  sweep:\n    steps:\n" + sweep.map((c) => `      - run: node ${c}\n`).join("")) + extra;
  const O = ".agent/scripts/outro.mjs";
  const V = ".agent/scripts/mutation-sweep.mjs";
  const TPL_SWEEP = { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V] }), ...OUTRO };
  test("a varredura ainda no `guard-tests` do projeto, no `sweep` do template, aparece (#308)", () =>
    exige(contraProjeto({ hoje: TPL_SWEEP, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O, V] }), ...OUTRO } }),
      { codigo: 0, inclui: [`${V} corre no job \`guard-tests\` deste projeto, e no \`sweep\` do template`] }));
  test("a varredura nos DOIS jobs do projeto aparece (corre 2x) (#308)", () =>
    exige(contraProjeto({ hoje: TPL_SWEEP, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O, V], sweep: [V] }), ...OUTRO } }),
      { codigo: 0, inclui: [`${V} corre no job \`guard-tests\` e \`sweep\` deste projeto`] }));
  // O contra-caso: a mesma colocacao nao se anuncia.
  test("a varredura no `sweep` dos dois lados nao aparece (#308)", () =>
    exige(contraProjeto({ hoje: TPL_SWEEP, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V] }), ...OUTRO } }),
      { codigo: 0, exclui: ["corre no job", "que o ci.yml deste projeto nao corre"] }));
  // Um comentario na linha do job nao a desfaz (#308, segunda leitura): antes, `  guard-tests:   # x`
  // dava `null` e a medicao do derivado morria com o `fatal`.
  test("um comentario na linha do job nao mata a medicao (#308)", () =>
    exige(contraProjeto({ hoje: TPL_SWEEP, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O, V] }).replace("  guard-tests:\n", "  guard-tests:   # as suites\n"), ...OUTRO } }),
      { codigo: 0, inclui: [`${V} corre no job \`guard-tests\` deste projeto`] }));

  // E a fronteira do job: um job DEPOIS do `sweep` nao e lido (o `split` parava so no seguinte ao `guard-tests`).
  test("um job depois do `sweep` nao entra na comparacao (#308)", () =>
    exige(contraProjeto({
      hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V], extra: "  depois:\n    steps:\n      - run: node .agent/scripts/depois.mjs\n" }), ...OUTRO },
      projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V] }), ...OUTRO },
    }), { codigo: 0, exclui: ["depois.mjs"] }));
}
