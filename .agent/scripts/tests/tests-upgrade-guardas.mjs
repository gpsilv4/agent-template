/**
 * Os GUARDAS do simulador de `/upgrade` que saem ANTES de medir — {{PROJECT_NAME}}
 *
 * Sem tags, uma tag igual ao HEAD, o `TEMPLATE_VERSION` atras da tag, um derivado com marca, sem `BOOTSTRAP.md`:
 * cada um destes casos para o simulador antes de montar o que quer que seja. Sairam do `test-simulate-upgrade.mjs`
 * quando ele chegou as 500 linhas (o Guard 17; #374b), tal e qual: so usam o `repo`/`corre`/`exige`/`git` do harness.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { rmSync, writeFileSync } from "fs";
import { join } from "path";
import { git, repo, corre, exige, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-upgrade-guardas.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-simulate-upgrade.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

export function registar() {
  // --- Os guardas que saem ANTES de medir -----------------------------------------

  // Sem tags nao ha baseline, e sem baseline nao ha medicao. Passar aqui seria dar por
  // verificado um upgrade que nunca chegou a ser montado — o `TP2` na ferramenta escrita
  // para o apanhar.
  test("sem tags acessiveis, REPROVA a dizer que nao mediu", () => {
    const dir = repo();
    try {
      return exige(corre(dir), { codigo: 1, inclui: ["nao ha tags acessiveis", "sem baseline nao ha medicao"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A tag IGUAL ao HEAD acontece logo a seguir a marcar uma release. Sem delta nao ha upgrade
  // nenhum a simular, e um OK aqui era sucesso sobre zero trabalho.
  test("tag identica ao HEAD (delta vazio), REPROVA", () => {
    const dir = repo({ comTag: "v9.9.9" });
    try {
      return exige(corre(dir), { codigo: 1, inclui: ["e identica ao HEAD", "nao ha upgrade a simular"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // O CONTRA-CASO do anterior: com um commit depois da tag ha delta, e o simulador passa deste
  // guarda. Sem ele, um simulador que reprovasse SEMPRE passava o teste de cima.
  test("com delta, PASSA deste guarda (nao reprova por baseline)", () => {
    const dir = repo({ comTag: "v9.9.9" });
    try {
      writeFileSync(join(dir, "NOVO.md"), "# novo\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-qm", "depois da tag"]);
      return exige(corre(dir), { codigo: 1, exclui: ["nao ha upgrade a simular", "nao ha tags acessiveis"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // M6 do #195: o `.agent/TEMPLATE_VERSION` nao pode ficar ATRAS da ultima tag — e o que o bootstrap
  // grava num projeto criado com "Use this template". A frente, ou igual, passa: entre o passo do
  // /deploy que o sobe e a tag, a versao nova ja esta escrita.
  //
  // A fixture minima sai 1 por outras razoes, logo o exit code nao distingue nada: um `warn` trocado
  // por `note` deixava o caso "atras" verde (#241). O que distingue e a CONTAGEM de avisos — atras
  // conta um a mais do que igual; a frente, e fora do formato `vX.Y.Z`, contam o mesmo.
  test("TEMPLATE_VERSION com a ultima tag v9.9.9: so ATRAS conta um problema a mais", () => {
    const medeCom = (declarada) => {
      const dir = repo({ comTag: "v9.9.9" });
      try {
        writeFileSync(join(dir, ".agent/TEMPLATE_VERSION"), `${declarada}\n`);
        git(dir, ["add", "-A"]);
        git(dir, ["commit", "-qm", "depois da tag"]);
        const r = corre(dir);
        // As linhas `WARN`, e nao o `WARNING: N` do fim: a fixture sai por um `fatal` antes dele.
        return { ...r, problemas: r.out.split("\n").filter((l) => l.startsWith("  WARN  ")).length };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const [atras, igual, frente, foraDoFormato] = ["v9.8.0", "v9.9.9", "v10.0.0", "9.9"].map(medeCom);
    return [
      ...exige(atras, { codigo: 1, inclui: ["WARN  .agent/TEMPLATE_VERSION diz v9.8.0, ATRAS da ultima tag v9.9.9"] }),
      ...exige(igual, { codigo: 1, inclui: ["nao esta atras da ultima tag"], exclui: ["ATRAS da ultima tag"] }),
      ...exige(frente, { codigo: 1, inclui: ["nao esta atras da ultima tag"], exclui: ["ATRAS da ultima tag"] }),
      ...exige(foraDoFormato, { codigo: 1, inclui: ["NOTE  .agent/TEMPLATE_VERSION (9.9) ou a tag v9.9.9 fora do formato"] }),
      ...(atras.problemas === igual.problemas + 1 ? [] : [`atras conta ${atras.problemas} problema(s), igual ${igual.problemas}: o aviso nao conta`]),
      ...(frente.problemas === igual.problemas ? [] : [`a frente conta ${frente.problemas}, igual ${igual.problemas}`]),
      ...(foraDoFormato.problemas === igual.problemas ? [] : [`fora do formato conta ${foraDoFormato.problemas}, igual ${igual.problemas}`]),
    ];
  });

  // Este script e COPIADO para todos os projetos derivados. La, "a ultima tag antes do HEAD"
  // sao as releases DESSE projeto — mediria projeto-v1 -> projeto-v2. Pior que inutil: media
  // uma coisa a fingir que media outra. Sai 0 com a razao VISIVEL.
  test("num projeto derivado (com marca), da SKIP visivel e sai 0", () => {
    const dir = repo({ comMarca: true, comTag: "v1.0.0" });
    try {
      return exige(corre(dir), { codigo: 0, inclui: ["SKIP  simulacao de /upgrade — este repo e um projeto derivado, nao o template"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // O outro sinal do mesmo facto: o bootstrap manda apagar o `BOOTSTRAP.md`. Qualquer um dos
  // dois basta — olhar so para um deixava metade dos derivados a correr a simulacao errada.
  test("sem BOOTSTRAP.md (o outro sinal de derivado), tambem da SKIP", () => {
    const dir = repo({ semBootstrap: true, comTag: "v1.0.0" });
    try {
      return exige(corre(dir), { codigo: 0, inclui: ["SKIP  simulacao de /upgrade — este repo e um projeto derivado, nao o template"] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
