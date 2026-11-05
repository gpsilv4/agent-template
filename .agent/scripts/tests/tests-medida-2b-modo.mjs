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
const SEM_SETTINGS = "este projeto nao tem o .claude/settings.json";
const LIGAR = "hook(s) que o template liga e este projeto nao";

// A LIGACAO dos hooks no parcial (#454). O template liga UM hook em DOIS sitios, e tem um `deny`: a linha do `deny` em
// falta e a prova de que o ramo correu ate a ligacao (o `fatal` e um `TypeError` saem os dois com 1).
const HOOK = ".claude/hooks/guard-x.mjs";
const liga = (sitios) => {
  const hooks = {};
  for (const [evento, matcher] of sitios) {
    const h = { hooks: [{ type: "command", command: `node "$CLAUDE_PROJECT_DIR/${HOOK}"` }] };
    (hooks[evento] ??= []).push(matcher ? { matcher, ...h } : h);
  }
  return hooks;
};
const SET_LA = JSON.stringify({ permissions: { deny: ["Read(./.env)"] }, hooks: liga([["PreToolUse", "Bash"], ["PostToolUse"]]) });
const DENY = "o `deny` do settings.json do template tem 1 regra(s)";
const comLigacao = (settingsDoProjeto, extra = {}) =>
  contraProjeto({ ontem: { ".claude/settings.json": SET_LA, [HOOK]: "// hook\n" }, projeto: { ...SEM_JOB, ".claude/settings.json": settingsDoProjeto, ...extra } });

function casosDaLigacao() {
  test("ligacao: o projeto nao liga o hook -> a nota lista os DOIS sitios do template", () =>
    exige(comLigacao(JSON.stringify({ permissions: {} })), {
      codigo: 1,
      inclui: [PARCIAL, DENY, `${LIGAR}, a ligar na chave \`hooks\``, `${HOOK} -> PostToolUse, PreToolUse (Bash)`],
      exclui: [SEM_SETTINGS, "ainda nao copiado"],
    }));

  test("ligacao: CONTROLO — o projeto liga o hook nos dois sitios -> sem nota (e o ramo correu ate ao fim)", () =>
    exige(comLigacao(JSON.stringify({ permissions: {}, hooks: liga([["PreToolUse", "Bash"], ["PostToolUse"]]) })), {
      codigo: 1,
      inclui: [PARCIAL, DENY],
      exclui: [LIGAR, SEM_SETTINGS],
    }));

  // Por SITIO e nao por hook: comparar a lista inteira (o `feito()` do completo) daria o hook todo como em falta.
  test("ligacao: o projeto liga o hook so num sitio -> a nota lista so o que falta", () =>
    exige(comLigacao(JSON.stringify({ hooks: liga([["PreToolUse", "Bash"]]) })), {
      codigo: 1,
      inclui: [DENY, `${HOOK} -> PostToolUse`],
      exclui: ["PreToolUse (Bash)"],
    }));

  test("ligacao: o evento ligado SEM matcher no projeto cobre o matcher do template -> sem nota", () =>
    exige(comLigacao(JSON.stringify({ hooks: liga([["PreToolUse"], ["PostToolUse"]]) })), {
      codigo: 1,
      // O `PARCIAL` vem do `fatal` DEPOIS da ligacao: sem ele, um `TypeError` na funcao passava por "sem nota".
      inclui: [DENY, PARCIAL],
      exclui: [LIGAR],
    }));

  // A parte LITERAL do matcher: comparar so pelo evento passava os casos acima e calava estes dois.
  test("ligacao: o projeto liga o hook no mesmo evento com OUTRO matcher -> o do template continua em falta", () =>
    exige(comLigacao(JSON.stringify({ hooks: liga([["PreToolUse", "Edit"], ["PostToolUse"]]) })), {
      codigo: 1,
      inclui: [`${HOOK} -> PreToolUse (Bash)`],
      exclui: ["PostToolUse"],
    }));

  test("ligacao: o template liga SEM matcher e o projeto so com um -> o evento sem matcher continua em falta", () =>
    exige(comLigacao(JSON.stringify({ hooks: liga([["PreToolUse", "Bash"], ["PostToolUse", "Bash"]]) })), {
      codigo: 1,
      inclui: [`${HOOK} -> PostToolUse`],
      exclui: ["PreToolUse (Bash)", "PostToolUse (Bash)"],
    }));

  test("ligacao: o settings do TEMPLATE nao e um objeto JSON -> 'nao consegui comparar', e nenhuma lista", () =>
    exige(
      contraProjeto({ ontem: { ".claude/settings.json": "[]", [HOOK]: "// hook\n" }, projeto: { ...SEM_JOB, ".claude/settings.json": "{}" } }),
      { codigo: 1, inclui: [PARCIAL, "o .claude/settings.json do template nao e um objeto JSON"], exclui: [LIGAR] }
    ));

  // Na CONTRADICAO nao se sabe o modo, e as notas citam os passos do parcial: so o `deny`/`ask` sai.
  test("ligacao: na contradicao (marca `modo: completo`, sem o job) -> sem as notas da ligacao", () =>
    exige(
      contraProjeto({
        ontem: { ".claude/settings.json": SET_LA, [HOOK]: "// hook\n" },
        projeto: { ...SEM_JOB, ".claude/settings.json": null },
        naMarca: "modo: completo\n",
      }),
      { codigo: 1, inclui: ["a marca e o disco contradizem-se"], exclui: [LIGAR, SEM_SETTINGS] }
    ));

  test("ligacao: o projeto sem settings.json -> a nota explicita, e nenhuma lista", () =>
    exige(comLigacao(null), { codigo: 1, inclui: [PARCIAL, SEM_SETTINGS, "upgrade-parcial.md, §3 passo 5"], exclui: [LIGAR] }));

  // `"null"` e JSON valido, e o `ligacoes` le-o como "nada ligado": sem o teste do objeto, a lista dizia que falta tudo.
  test("ligacao: o settings do projeto nao e um objeto JSON -> 'nao consegui comparar', e nenhuma lista", () =>
    exige(comLigacao("null"), { codigo: 1, inclui: ["nao consegui comparar os hooks ligados"], exclui: [LIGAR, SEM_SETTINGS] }));

  test("ligacao: o ficheiro do hook ainda nao esta no projeto -> listado e MARCADO", () =>
    exige(comLigacao(JSON.stringify({}), { [HOOK]: null }), {
      codigo: 1,
      inclui: [`${HOOK} -> PostToolUse, PreToolUse (Bash) (ficheiro ainda nao copiado: §3 passo 3)`],
    }));
}

export function registar() {
  // Sem settings dos DOIS lados (o template sintetico nao o tem): nenhuma nota da ligacao — o controlo da nota "sem settings".
  test("modo: projeto sem o job `guard-tests` e sem `modo:` -> parcial, explica e sai != 0", () =>
    exige(contraProjeto({ projeto: SEM_JOB }), {
      codigo: 1,
      inclui: [PARCIAL, "nao tem o job `guard-tests`", "src/docs/upgrade-parcial.md", ".githooks/commit-msg", "check-backlog.mjs"],
      exclui: ["ci.yml DESTE projeto", SEM_SETTINGS, LIGAR],
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

  casosDaLigacao();

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
