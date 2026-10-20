/**
 * Testes da 2b sobre a CONFIGURACAO do projeto: o `settings.json` (#301) e os jobs do `ci.yml` (#308) — {{PROJECT_NAME}}
 *
 * PORQUE VIVE A PARTE: o `tests-medida-2b.mjs` passou as 500 linhas com estes casos, e a fronteira e
 * natural — aquele mede o que o upgrade faz REPROVAR; este, o que o motor NAO toca (o `settings.json`
 * e o `ci.yml` sao do projeto) e a 2b tem de comparar com o template: as regras de `deny`/`ask` em
 * falta, e onde corre cada verificacao.
 *
 * NAO e um entry point. O `tests-medida-2b.mjs` importa-o e chama `registar()` no fim do seu (o
 * `test-simulate-upgrade.mjs`, que o corre, esta no limite das 500 linhas).
 */
import { readFileSync, rmSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { comFachada, fronteiraQueMuda } from "../lib/fronteira-upgrade.mjs";
import { comandosDoCI, repetidosPorJob } from "../lib/medida-upgrade.mjs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { exige, contraProjeto, test } from "./harness/test-upgrade-harness.mjs";
import { registar as registarFronteira317 } from "./tests-medida-2b-fronteira.mjs";

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

  // O `allow` (#317, item 25): so as regras que correm a maquinaria do template; o resto e do projeto.
  const comAllow = (allow) => `${JSON.stringify({ permissions: { deny: [], ask: [], allow } })}\n`;
  test("uma regra do allow que corre a maquinaria do template, em falta, aparece na 2b; as outras nao (#317)", () =>
    exige(
      contraProjeto({
        hoje: { [SETTINGS]: comAllow(["Bash(node .agent/scripts/lib/varredura-shards.mjs:*)", "Bash(npm run dev:*)"]) },
        projeto: { [SETTINGS]: comAllow([]) },
      }),
      { codigo: 0, inclui: ["o `allow` do settings.json do template tem 1 regra(s) da maquinaria", "Bash(node .agent/scripts/lib/varredura-shards.mjs:*)"], exclui: ["npm run dev"] }
    ));
  // Uma regra da maquinaria que o projeto pos no `ask` de proposito nao e "falta" (leituras do #317).
  test("uma regra do allow que o projeto tem no ask nao aparece (#317)", () =>
    exige(
      contraProjeto({
        hoje: { [SETTINGS]: comAllow(["Bash(node .agent/scripts/lib/varredura-shards.mjs:*)"]) },
        projeto: { [SETTINGS]: `${JSON.stringify({ permissions: { deny: [], ask: ["Bash(node .agent/scripts/lib/varredura-shards.mjs:*)"], allow: [] } })}\n` },
      }),
      { codigo: 0, exclui: ["o `allow` do settings.json do template"] }
    ));
  // Coberta por um prefixo do projeto (`Bash(x:*)`), como o Claude Code compara: medido no derivado privado B,
  // a comparacao literal pedia regras que ele ja tinha assim.
  test("uma regra do allow coberta por um prefixo do projeto nao aparece; a que nao e coberta, sim (#317)", () =>
    exige(
      contraProjeto({
        hoje: { [SETTINGS]: comAllow(["Bash(node .agent/scripts/mutation-sweep.mjs --list)", "Bash(node .agent/scripts/simulate-upgrade.mjs)"]) },
        projeto: { [SETTINGS]: comAllow(["Bash(node .agent/scripts/mutation-sweep.mjs:*)", "Bash(node .agent/scripts/simulate:*)"]) },
      }),
      { codigo: 0, inclui: ["tem 1 regra(s) da maquinaria", "Bash(node .agent/scripts/simulate-upgrade.mjs)"], exclui: ["mutation-sweep.mjs --list"] }
    ));
  test("a mesma regra do allow dos dois lados nao aparece (#317)", () =>
    exige(
      contraProjeto({
        hoje: { [SETTINGS]: comAllow(["Bash(node .agent/scripts/lib/varredura-shards.mjs:*)"]) },
        projeto: { [SETTINGS]: comAllow(["Bash(node .agent/scripts/lib/varredura-shards.mjs:*)"]) },
      }),
      { codigo: 0, exclui: ["o `allow` do settings.json do template"] }
    ));

  // Os dois existem e um nao se le: "nao comparei" tem de se dizer (auditoria do #308).
  test("um settings.json invalido no projeto diz que nao comparou (#308)", () =>
    exige(
      contraProjeto({ hoje: { [SETTINGS]: perms(["Read(./.env)"], []) }, projeto: { [SETTINGS]: "{ nao e json" } }),
      { codigo: 0, inclui: ["nao consegui comparar o `deny`/`ask`/`allow` com o do template"] }
    ));
  // ...e um projeto sem settings.json (sem Claude Code) nao tem nada a dizer.
  test("um projeto sem settings.json nao fala de deny/ask (#308)", () =>
    exige(
      contraProjeto({ hoje: { [SETTINGS]: perms(["Read(./.env)"], []) }, projeto: { [SETTINGS]: null } }),
      { codigo: 0, exclui: ["nao consegui comparar", "do settings.json do template tem"] }
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
  // Os SHARDS (#308, leitor): o comando e o mesmo dos dois lados, logo so uma NOTE propria os leva a
  // um derivado que ja tem o `sweep`. E nao se anuncia quando o projeto ja os tem, nem por um comentario.
  {
    const SHARDS = "    env:\n      SWEEP_SHARD: 1/2\n";
    const TPL_SHARDS = { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V] }) + SHARDS, ...OUTRO };
    test("o `sweep` em shards do template, sem shards no projeto, aparece (#308)", () =>
      exige(contraProjeto({ hoje: TPL_SHARDS, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V] }), ...OUTRO } }),
        { codigo: 0, inclui: ["reparte a varredura completa em shards"] }));
    test("o `sweep` em shards dos dois lados nao aparece; nem um SWEEP_SHARD comentado no template; nem sem `sweep` no projeto (#308)", () => [
      ...exige(contraProjeto({ hoje: TPL_SHARDS, projeto: TPL_SHARDS }), { codigo: 0, exclui: ["reparte a varredura completa em shards"] }),
      ...exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V] }) + "    # SWEEP_SHARD: 1/2\n", ...OUTRO }, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O], sweep: [V] }), ...OUTRO } }),
        { codigo: 0, exclui: ["reparte a varredura completa em shards"] }),
      // Sem `sweep` no projeto (a varredura desligada e decisao legitima): a NOTE nao lhe diz respeito.
      ...exige(contraProjeto({ hoje: TPL_SHARDS, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O] }), ...OUTRO } }),
        { codigo: 0, exclui: ["reparte a varredura completa em shards"] }),
    ]);
  }
  // A SUITE REPETIDA no mesmo job (#337): o passo em paralelo trazido sem tirar o antigo. A NOTE tem de SAIR
  // na 2b (a varredura `--skips` desliga-a e exige vermelho) — e nao sai quando a suite corre uma vez.
  {
    const S = ".agent/scripts/tests/test-dup.mjs";
    const SUITE_OK = { [S]: "// suite falsa: sai 0\n" };
    test("uma suite que corre 2x no mesmo job do projeto aparece na 2b (#337)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O, S] }), ...OUTRO, ...SUITE_OK }, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O, S, S] }), ...OUTRO, ...SUITE_OK } }),
        { codigo: 0, inclui: [`${S} corre 2x no job \`guard-tests\` deste projeto`] }));
    test("uma suite que corre uma vez nao aparece como repetida (#337)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O, S] }), ...OUTRO, ...SUITE_OK }, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O, S] }), ...OUTRO, ...SUITE_OK } }),
        { codigo: 0, exclui: ["corre 2x no job"] }));
    // O passo em paralelo no template e NAO no projeto: os conjuntos sao iguais, logo so esta NOTE o diz. E nao se
    // diz a quem ja o tem, nem por uma linha comentada.
    const PARALELO = "jobs:\n  guard-tests:\n    steps:\n      - run: node " + O + "\n      - name: Suites\n        run: |\n          exec node .agent/scripts/lib/suites-em-paralelo.mjs -- \\\n            node " + S + "\n";
    const MSG_PARALELO = "corre as suites num so passo, em paralelo";
    test("o passo em paralelo do template, que o projeto nao tem, aparece como opcional (#337)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": PARALELO, ...OUTRO, ...SUITE_OK }, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O, S] }), ...OUTRO, ...SUITE_OK } }),
        { codigo: 0, inclui: [MSG_PARALELO, "OPCIONAL", "SAEM"] }));
    test("o passo em paralelo que o projeto ja tem nao aparece (#337)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": PARALELO, ...OUTRO, ...SUITE_OK }, projeto: { ".github/workflows/ci.yml": PARALELO, ...OUTRO, ...SUITE_OK } }),
        { codigo: 0, exclui: [MSG_PARALELO] }));
    test("o passo em paralelo num `run:` de uma linha conta como presente (#337)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": PARALELO, ...OUTRO, ...SUITE_OK }, projeto: { ".github/workflows/ci.yml": "jobs:\n  guard-tests:\n    steps:\n      - run: node " + O + "\n      - run: exec node .agent/scripts/lib/suites-em-paralelo.mjs -- node " + S + "\n", ...OUTRO, ...SUITE_OK } }),
        { codigo: 0, exclui: [MSG_PARALELO] }));
    test("um `suites-em-paralelo.mjs` noutro sitio do projeto nao e o passo (#337)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": PARALELO, ...OUTRO, ...SUITE_OK }, projeto: { ".github/workflows/ci.yml": PARALELO.replace("node .agent/scripts/lib/", "node .github/"), ...OUTRO, ...SUITE_OK } }),
        { codigo: 0, inclui: [MSG_PARALELO] }));
    test("o passo em paralelo COMENTADO no projeto conta como ausente (#337)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": PARALELO, ...OUTRO, ...SUITE_OK }, projeto: { ".github/workflows/ci.yml": PARALELO.replace("          exec node", "          # exec node") + "      - run: node " + S + "\n", ...OUTRO, ...SUITE_OK } }),
        { codigo: 0, inclui: [MSG_PARALELO] }));
  }
  // Os jobs curtos da app (#347): a NOTE sai a quem os tem separados, e nao a quem ja os juntou.
  {
    const SEPARADOS = ciDe({ guard: [O] }).replace("jobs:\n", "jobs:\n  detect:\n    steps: []\n  unit-tests:\n    steps: []\n");
    test("os jobs curtos da app separados aparecem como opcionais (#347)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O] }), ...OUTRO }, projeto: { ".github/workflows/ci.yml": SEPARADOS, ...OUTRO } }),
        { codigo: 0, inclui: ["como passos de UM job, `Code Quality`", "OPCIONAL", "FORA desse job"] }));
    test("a app ja num job so nao aparece (#347)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O] }), ...OUTRO }, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O] }), ...OUTRO } }),
        { codigo: 0, exclui: ["como passos de UM job"] }));
    // O template TAMBEM com os jobs separados (uma tag antiga): nao ha nada a trazer.
    test("com os jobs separados nos dois lados nao aparece (#347)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": SEPARADOS, ...OUTRO }, projeto: { ".github/workflows/ci.yml": SEPARADOS, ...OUTRO } }),
        { codigo: 0, exclui: ["como passos de UM job"] }));
    // Sem o `detect` (um derivado que ja o tirou): os outros dois chegam (leitura do PR A — so `detect` + `unit-tests` eram testados).
    test("os testes unitarios e o audit separados, sem `detect`, aparecem (#347)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O] }), ...OUTRO }, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O] }).replace("jobs:\n", "jobs:\n  unit-tests:\n    steps: []\n  security-audit:\n    steps: []\n"), ...OUTRO } }),
        { codigo: 0, inclui: ["como passos de UM job, `Code Quality`"] }));
    // Um `detect:` SOZINHO pode ser outra coisa (um `paths-filter`): exige-se pelo menos dois dos tres ids.
    test("um job `detect` sozinho nao aparece (#347)", () =>
      exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": ciDe({ guard: [O] }), ...OUTRO }, projeto: { ".github/workflows/ci.yml": ciDe({ guard: [O] }).replace("jobs:\n", "jobs:\n  detect:\n    steps: []\n"), ...OUTRO } }),
        { codigo: 0, exclui: ["como passos de UM job"] }));
  }
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

  // #304 (R7B-2): a fronteira e passo do UTILIZADOR. A 2b deixa num staging a versao PROCESSADA pelo
  // motor (placeholders e constantes deste projeto) e imprime os comandos — nunca `cp "$TPL/..."`, que
  // trazia o template cru (duas leituras independentes do #304).
  const H = ".claude/hooks/h.mjs";
  const cpDe = (r, rel, como) => `cp '${join(r.fronteira, rel)}' '${rel}'   # ${como}`;
  const lido = (r, rel) => { try { return readFileSync(join(r.fronteira, rel), "utf8"); } catch { return null; } };
  test("um hook que o template mudou sai no staging, com o cp a partir dele (#304)", () => {
    const r = contraProjeto({ hoje: { [H]: "// hook novo\n" } });
    return [
      ...exige(r, { codigo: 0, inclui: ["--- A FRONTEIRA: passo do UTILIZADOR, fora do agente ---", "o upgrade muda 1 ficheiro(s) da fronteira", `cd '${r.proj}'`, cpDe(r, H, "muda")], exclui: ["$TPL"] }),
      ...(lido(r, H) === "// hook novo\n" ? [] : [`o staging nao tem a versao do upgrade: ${JSON.stringify(lido(r, H))}`]),
    ];
  });
  // O que o `cp "$TPL/..."` perdia: o placeholder substituido.
  test("o staging leva o hook com os placeholders ja substituidos (#304)", () => {
    // Montado por partes: um placeholder literal aqui seria ele proprio substituido pelo bootstrap.
    const r = contraProjeto({ hoje: { [H]: `// hook — {${"{"}PROJECT_NAME}}\n` } });
    const c = lido(r, H);
    // E a fixture nao deixa derivar o nome do projeto: o motor pos a FACHADA, e a 2b tem de o dizer —
    // copiar sem ler punha "EsteProjeto" nos cabecalhos (a `--skips` mostrou este sitio por cobrir).
    return [
      ...(c !== null && !c.includes("{{") ? [] : [`o staging ficou com o placeholder: ${JSON.stringify(c)}`]),
      ...exige(r, { codigo: 0, inclui: [`o nome do projeto nao se derivou: ${H} tem a fachada "EsteProjeto"`] }),
    ];
  });
  // ...e a constante do projeto (`IA` do `commit-msg`, em CONSTANTES_DO_PROJETO).
  const CM = ".githooks/lib/commit-msg.mjs";
  test("o staging leva a constante `IA` deste projeto, e nao a do template (#304)", () => {
    const r = contraProjeto({
      ontem: { [CM]: "const IA = /claude/i;\n// velho\n" },
      hoje: { [CM]: "const IA = /claude|novo/i;\n// NOVO\n" },
      projeto: { [CM]: "const IA = /claude|meubot/i;\n// velho\n" },
    });
    const c = lido(r, CM) ?? "";
    return c.includes("meubot") && c.includes("// NOVO") ? [] : [`o staging perdeu a constante do projeto: ${JSON.stringify(c)}`];
  });
  // Uma pasta que o projeto ainda nao tem: `mkdir -p` antes do `cp` (sem ela, o `commit-msg` partia).
  test("um ficheiro novo numa pasta que o projeto nao tem leva o mkdir -p (#304)", () => {
    // (A fixture ja tem `.githooks/lib/`; a que falta e `.claude/hooks/lib/`.)
    const r = contraProjeto({ hoje: { ".claude/hooks/lib/novo.mjs": "// novo\n" } });
    return exige(r, { codigo: 0, inclui: ["mkdir -p '.claude/hooks/lib'", cpDe(r, ".claude/hooks/lib/novo.mjs", "novo")] });
  });
  test("com a pasta ja no projeto, nao ha mkdir (#304)", () =>
    exige(contraProjeto({ hoje: { ".githooks/lib/novo.mjs": "// novo\n" } }), { codigo: 0, inclui: ["cp '"], exclui: ["mkdir -p"] }));
  // Um hook que o PROJETO alterou (um `SEGUROS` customizado) leva a nota: o `cp` esmagava-o.
  test("um hook que o projeto alterou leva a nota de comparar antes (#304)", () =>
    exige(contraProjeto({ ontem: { [H]: "// hook\n" }, projeto: { [H]: "// hook do projeto\n" }, hoje: { [H]: "// hook novo\n" } }),
      { codigo: 0, inclui: [`diff -u '${H}'`, "# o projeto ALTEROU-o: decidir antes", `# cp '`] , exclui: [`# muda — o projeto ALTEROU-o`] }));
  // O que SAIU do template sai pela mao do utilizador (o `rm` do agente e negado).
  test("um hook que saiu do template sai com o rm (#304)", () => {
    const r = contraProjeto({ ontem: { ".claude/hooks/velho.mjs": "// velho\n" }, hoje: { ".claude/hooks/velho.mjs": null } });
    return exige(r, { codigo: 0, inclui: ["rm '.claude/hooks/velho.mjs'   # sai", "a DESLIGAR da chave `hooks` do .claude/settings.json (a mao): .claude/hooks/velho.mjs"] });
  });
  // Um hook novo copiado e nao ligado nunca dispara.
  test("um hook NOVO pede para ser ligado na chave `hooks` (#304)", () =>
    exige(contraProjeto({ hoje: { ".claude/hooks/novo.mjs": "// novo\n" } }), { codigo: 0, inclui: ["a ligar na chave `hooks` do .claude/settings.json (a mao): .claude/hooks/novo.mjs"] }));
  // O contra-caso: sem mudancas na fronteira, nada a pedir ao utilizador.
  test("sem mudancas na fronteira a 2b nao pede nada ao utilizador (#304)", () =>
    exige(contraProjeto({ hoje: { "NOVO.md": "# doc\n" } }), { codigo: 0, inclui: ["a fronteira (.claude/hooks/, .githooks/, .claude/agents/) nao muda neste upgrade"], exclui: ["A FRONTEIRA", "da fronteira;"] }));
  // O `protegidos.json` MIGRADO do hook (#257) e a lista deste projeto: entra, e com os branches dele.
  const GUARD = ".claude/hooks/guard-protected-branch.mjs";
  const P = ".claude/hooks/protegidos.json";
  test("o protegidos.json migrado do hook entra no staging, com os branches do projeto (#304)", () => {
    const r = contraProjeto({
      ontem: { [GUARD]: 'const PROTEGIDOS_LISTA = ["main", "master", "develop"];\n' },
      projeto: { [GUARD]: 'const PROTEGIDOS_LISTA = ["main", "staging"];\n' },
    });
    return [
      ...exige(r, { codigo: 0, inclui: ["1 constante(s) preservada(s)", `${cpDe(r, P, "novo")} — os branches protegidos DESTE projeto, migrados do hook (#257)`] }),
      ...((lido(r, P) ?? "").includes("staging") ? [] : [`o staging nao tem os branches do projeto: ${JSON.stringify(lido(r, P))}`]),
    ];
  });
  // ...e um `protegidos.json` que o projeto JA tem e dele: nunca entra.
  test("o protegidos.json que o projeto ja tem nao entra (#304)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" }, projeto: { [P]: '["main","prod"]\n' } }), { codigo: 0, exclui: ["protegidos.json'"] }));
  // Segunda leitura do #304. O staging nunca dentro do projeto: com `--fronteira-em=.` (ou `$PWD`, ou
  // vazio) a propria 2b escrevia a fronteira, por um caminho que o hook nao ve.
  test("--fronteira-em dentro do projeto e recusado (#304)", () => {
    const r = contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: "" });
    // `.`: o simulador corre na pasta do template (cada `contraProjeto` cria um projeto novo, logo nao
    // ha como apontar para dentro do proximo) — e la dentro tambem e recusado.
    const dentro = contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: "." });
    return [
      ...exige(r, { codigo: 1, inclui: ["o staging tem de ficar FORA do projeto e do template"] }),
      ...(readFileSync(join(r.proj, H), "utf8") === "// hook\n" ? [] : ["a 2b escreveu o hook no projeto"]),
      ...exige(dentro, { codigo: 1, inclui: ["o staging tem de ficar FORA do projeto e do template"] }),
    ];
  });
  // Sem a opcao, o staging vai para uma pasta nova no tmpdir — que persiste, e por isso o teste a apaga.
  // Num TMPDIR so deste teste, apagado inteiro (#317): a limpeza dependia da regex casar, e por prefixo no
  // tmpdir do sistema apagava o staging de um `/upgrade` real corrido noutro terminal (leitura do #317).
  test("sem --fronteira-em o staging vai para o tmpdir (#304)", () => {
    const meu = mkdtempSync(join(tmpdir(), "sim-up-tmp-"));
    try {
      const r = contraProjeto({ hoje: { [H]: "// novo\n" }, fronteiraEm: null, tmp: meu });
      const m = /ficou em (\S*agent-template-fronteira-\S+) \(/.exec(r.out);
      return m && m[1].startsWith(meu) ? [] : [`o staging por omissao nao apareceu no TMPDIR dado: ${r.out.slice(0, 300)}`];
    } finally {
      rmSync(meu, { recursive: true, force: true });
    }
  });
  // Uma edicao POR COMMITAR num hook que o template nao mudou nao e "muda": a copia sai do commit.
  test("uma edicao por commitar no projeto nao vira um cp, e diz-se (#304)", () =>
    exige(contraProjeto({ hoje: { ".claude/hooks/outro.mjs": "// novo\n" }, sujoNoProjeto: { [H]: "// edicao por commitar\n" } }),
      { codigo: 0, inclui: ["este projeto tem alteracoes por commitar na fronteira"], exclui: [`'${H}'   # muda`] }));
  // O template sujo na fronteira: o staging leva-o, e a marca grava so o commit.
  test("o template com alteracoes por commitar na fronteira diz-se (#304)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" }, sujoNoTemplate: { ".claude/hooks/sujo.mjs": "// sujo\n" } }),
      { codigo: 0, inclui: ["o template tem alteracoes por commitar na fronteira"] }));
  test("o template limpo na fronteira nao o diz (#304)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" } }), { codigo: 0, exclui: ["o template tem alteracoes por commitar"] }));
  // A fachada do nome: um ficheiro do staging com "EsteProjeto" diz-se (funcao pura).
  test("comFachada apanha a fachada do nome no staging (#304)", () => {
    const st = mkdtempSync(join(tmpdir(), "sim-up-fachada-"));
    try {
      mkdirSync(join(st, ".claude/hooks"), { recursive: true });
      writeFileSync(join(st, ".claude/hooks/a.mjs"), "// a — EsteProjeto\n");
      writeFileSync(join(st, ".claude/hooks/b.mjs"), "// b — Projeto Real\n");
      const fora = comFachada(st, [{ rel: ".claude/hooks/a.mjs", como: "muda" }, { rel: ".claude/hooks/b.mjs", como: "novo" }, { rel: ".claude/hooks/c.mjs", como: "sai" }], "EsteProjeto");
      return JSON.stringify(fora) === JSON.stringify([".claude/hooks/a.mjs"]) ? [] : [`apanhou ${JSON.stringify(fora)}`];
    } finally {
      rmSync(st, { recursive: true, force: true });
    }
  });
  // A auditoria do #304 (os medios).
  // Um projeto SEM a camada Claude (nada em `.claude/`): os hooks e os agentes nao se aplicam.
  test("um projeto sem a camada Claude nao recebe hooks (#304)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" }, projeto: { [H]: null } }),
      { codigo: 0, inclui: ["este projeto nao tem a camada Claude (nada em .claude/)"], exclui: [`'${H}'   #`] }));
  // A 2b corrida outra vez na §3: o que o utilizador ja aplicou (igual ao staging, por commitar) nao se repete.
  test("a fronteira ja aplicada e por commitar nao se repete (#304)", () =>
    exige(contraProjeto({ hoje: { [H]: "// hook novo\n" }, sujoNoProjeto: { [H]: "// hook novo\n" } }),
      { codigo: 0, exclui: [`'${H}'   # muda`] }));
  // Um agente INTACTO com `tools:` novo: o motor actualiza-o na copia, e sai no bloco (o `ask` pede-o).
  const AG = ".claude/agents/leitor.md";
  test("um agente intacto com tools: novo sai no bloco da fronteira (#304)", () => {
    const r = contraProjeto({ ontem: { [AG]: "---\nname: leitor\ntools: Read\n---\n" }, hoje: { [AG]: "---\nname: leitor\ntools: Read, Grep\n---\n" } });
    return exige(r, { codigo: 0, inclui: [cpDe(r, AG, "muda")] });
  });
  // Puras: uma pasta que e symlink (`.githooks` -> `.husky`) e as colisoes de um ADOTADO ficam de fora;
  // um ficheiro NOVO que o projeto alterou tambem leva o `diff` (nao so os `muda`).
  test("fronteiraQueMuda: symlink e colisoes do adotado ficam de fora; novo alterado leva nota (#304)", () => {
    const base = mkdtempSync(join(tmpdir(), "sim-up-fronteira-pura-"));
    try {
      const [proj, copia] = [join(base, "proj"), join(base, "copia")];
      for (const d of [proj, copia]) {
        mkdirSync(join(d, ".husky"), { recursive: true });
        writeFileSync(join(d, ".husky/pre-commit"), d === proj ? "velho\n" : "novo\n");
        symlinkSync(".husky", join(d, ".githooks"));
        mkdirSync(join(d, ".claude/hooks"), { recursive: true });
      }
      writeFileSync(join(copia, ".claude/hooks/colisao.mjs"), "do template\n");
      writeFileSync(join(proj, ".claude/hooks/colisao.mjs"), "do projeto\n");
      writeFileSync(join(copia, ".claude/hooks/x.mjs"), "x\n");
      const fora = fronteiraQueMuda(proj, copia, { doProjeto: [".claude/hooks/colisao.mjs"], substituidos: [".claude/hooks/x.mjs"] });
      const esperado = [{ rel: ".claude/hooks/x.mjs", como: "novo", nota: "o projeto ALTEROU-o: comparar antes (diff)" }];
      return JSON.stringify(fora) === JSON.stringify(esperado) ? [] : [`deu ${JSON.stringify(fora)}`];
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
  // A leitura final do #304: os avisos de "por commitar" olham para TODA a fronteira (os agentes
  // incluidos), e dizem a verdade — onde o template tambem mudou, o `cp` ESMAGA a edicao.
  test("uma edicao por commitar num hook que o template TAMBEM mudou: o aviso diz que o cp a esmaga (#304)", () =>
    exige(contraProjeto({ hoje: { [H]: "// hook novo\n" }, sujoNoProjeto: { [H]: "// edicao local\n" } }),
      { codigo: 0, inclui: [`'${H}'   # muda`, "os cp/rm acima ESMAGAM-nas onde o template tambem mudou"] }));
  test("uma edicao por commitar num AGENTE tambem e avisada (#304)", () => {
    const r = contraProjeto({
      ontem: { [AG]: "---\nname: leitor\ntools: Read\n---\n" },
      hoje: { [AG]: "---\nname: leitor\ntools: Read, Grep\n---\n" },
      sujoNoProjeto: { [AG]: "---\nname: leitor\ntools: Read, Bash\n---\n" },
    });
    return exige(r, { codigo: 0, inclui: ["este projeto tem alteracoes por commitar na fronteira"] });
  });
  test("um agente por commitar no TEMPLATE tambem e avisado (#304)", () =>
    exige(contraProjeto({ hoje: { [H]: "// novo\n" }, sujoNoTemplate: { [AG]: "---\nname: leitor\ntools: Read\n---\n" } }),
      { codigo: 0, inclui: ["o template tem alteracoes por commitar na fronteira"] }));
  // As suites em PARALELO (#337): o `ci.yml` corre-as atraves de um despachante, uma por linha. A 2b le cada
  // suite, e NAO o despachante — sozinho, sem argumentos, so sabe reprovar, e a bateria ficava vermelha.
  test("o despachante das suites em paralelo nao entra na bateria; as suites dele, sim (#337)", () => {
    const raiz = mkdtempSync(join(tmpdir(), "sim-up-ci-"));
    try {
      mkdirSync(join(raiz, ".github/workflows"), { recursive: true });
      writeFileSync(
        join(raiz, ".github/workflows/ci.yml"),
        "jobs:\n  guard-tests:\n    steps:\n      - name: Suites\n        run: |\n          node .agent/scripts/lib/suites-em-paralelo.mjs -- \\\n            node .agent/scripts/tests/test-guards.mjs \\\n            node .agent/scripts/tests/test-backlog.mjs\n"
      );
      const c = comandosDoCI(raiz) ?? [];
      return [
        ...(c.some((x) => x.includes("suites-em-paralelo")) ? [`o despachante entrou: ${c.join(", ")}`] : []),
        ...(["test-guards.mjs", "test-backlog.mjs"].every((n) => c.some((x) => x.endsWith(n))) ? [] : [`faltam suites: ${c.join(", ")}`]),
      ];
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
  // O passo que SUBSTITUI outros (#337), trazido SEM tirar os antigos: cada suite corre 2x, verde, e so
  // a 2b o pode ver (o `comandosDe` tira os repetidos). E o `ci.yml` real DESTE repo nao repete nada — num derivado
  // tambem: uma suite repetida de proposito no mesmo job e o defeito que a NOTE existe para mostrar.
  test("a 2b ve uma suite que corre 2x no mesmo job, e o ci.yml do template nao tem nenhuma (#337)", () => {
    const raiz = mkdtempSync(join(tmpdir(), "sim-up-ci-"));
    try {
      mkdirSync(join(raiz, ".github/workflows"), { recursive: true });
      const paralelo = "      - name: Suites\n        run: |\n          node .agent/scripts/lib/suites-em-paralelo.mjs -- \\\n            node .agent/scripts/tests/test-guards.mjs \\\n            node .agent/scripts/tests/test-backlog.mjs\n";
      const ci = (passos) => writeFileSync(join(raiz, ".github/workflows/ci.yml"), "jobs:\n  guard-tests:\n    steps:\n" + passos);
      ci(paralelo + "      - run: node .agent/scripts/tests/test-guards.mjs\n");
      const com = repetidosPorJob(raiz);
      ci(paralelo);
      const sem = repetidosPorJob(raiz);
      const tpl = repetidosPorJob(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
      return [
        ...(JSON.stringify(com?.["guard-tests"]) === JSON.stringify([".agent/scripts/tests/test-guards.mjs"]) ? [] : [`o repetido nao foi visto: ${JSON.stringify(com)}`]),
        ...(sem?.["guard-tests"]?.length === 0 ? [] : [`sem repetidos deu ${JSON.stringify(sem)}`]),
        ...(tpl === null ? ["o ci.yml deste repo nao tem o job `guard-tests` (nao derivei nada)"] : Object.values(tpl).every((v) => v.length === 0) ? [] : [`o ci.yml deste repo repete: ${JSON.stringify(tpl)}`]),
      ];
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
  registarFronteira317({ H, P, cpDe, lido });
}
