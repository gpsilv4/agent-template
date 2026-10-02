/**
 * Testes do modo `--projeto`: a medicao da seccao 2b num DERIVADO — {{PROJECT_NAME}}
 *
 * O instrumento vive em `lib/medida-upgrade.mjs`. A pergunta que ele responde — *o que e que
 * este upgrade faz reprovar neste projeto?* — poe-se do lado do consumidor, que e o unico sitio
 * onde o `/upgrade` corre, e era ai que o comando nomeado pela seccao 2b **saltava**.
 *
 * NAO e um entry point. O `test-simulate-upgrade.mjs` importa-o e chama `registar()` —
 * explicitamente, e nao por descoberta: aquela suite tem contadores proprios.
 *
 * PORQUE VIVE A PARTE: a suite chegou as 510 linhas e a catraca do Guard 17 manda dividir antes
 * de acrescentar. A fronteira nao e so de tamanho — estes casos falam com o modo `--projeto` e
 * com a medicao; os que ficaram la falam com o simulador e com o motor.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { git, corre, exige, contraProjeto, limpaTmpsDaSuite, test } from "./harness/test-upgrade-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-medida-2b.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-simulate-upgrade.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-simulate-upgrade.mjs";

export function registar() {
  // --- O modo `--projeto`: a medicao da seccao 2b DE DENTRO de um derivado ----------
  //
  // O que se exercita aqui vive em `lib/medida-upgrade.mjs` (o instrumento) e, do outro lado,
  // em `lib/projeto-de-ontem.mjs` (a fixture do modo template). Sao os dois modulos que o
  // `lib/mapa-suites.mjs` manda verificar com esta suite.
  //
  // PORQUE ISTO EXISTE: a seccao 2b nomeia um comando, e o comando nomeado SALTAVA num projeto
  // derivado — que e o unico sitio onde o `/upgrade` corre. Quem seguisse a seccao a letra via
  // um `SKIP`, lia-o como "nada a medir" e avancava. Foi assim que o #75 chegou a um consumidor.

  test("aponta para algo que nao e um projeto derivado -> REPROVA", () => {
    const r = contraProjeto({ projeto: { ".agent/rules/anti-patterns.md": null } });
    // Um caminho sem `.agent/` de todo: o guarda tem de o dizer, e nao seguir a medir o vazio.
    const fora = corre(r.tpl, ["--projeto=/caminho/que/nao/existe"]);
    return exige(fora, { codigo: 1, inclui: ["nao parece um projeto derivado"] });
  });

  test("projeto sem marca utilizavel (Modo B) -> REPROVA a dizer que nao mede", () =>
    exige(contraProjeto({ marca: null }), { codigo: 1, inclui: ["Modo B", "nao se mede"] }));

  test("marca a apontar para um commit que o template nao tem -> REPROVA", () =>
    exige(contraProjeto({ marca: "template: x\ncommit: 0000000000000000000000000000000000000000\n" }), {
      codigo: 1,
      inclui: ["nao existe no template"],
    }));

  // A marca que o BOOTSTRAP.md manda escrever quando nao apurou o SHA. Sem este ramo,
  // `desconhecido` era tratado como uma referencia e o motor lia TODOS os ficheiros como novos —
  // uma lista enorme e errada, sem um erro no ecra (`TP2`).
  test("marca com `commit: desconhecido` nao conta como versao -> REPROVA", () =>
    exige(contraProjeto({ marca: "template: x\ncommit: desconhecido\n" }), { codigo: 1, inclui: ["Modo B"] }));

  // --- o que a 2b promete: o que PASSA a reprovar ----------------------------------
  const CI_COM_NOVO =
    "jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/stub.mjs\n" +
    "      - run: node .agent/scripts/apertado.mjs\n";

  test("verificador NOVO que reprova aparece na lista da 2b", () =>
    exige(
      contraProjeto({
        hoje: {
          ".agent/scripts/apertado.mjs": 'console.log("  WARN  limiar apertado");\nprocess.exit(1);\n',
          ".github/workflows/ci.yml": CI_COM_NOVO,
        },
      }),
      { codigo: 0, inclui: ["PASSA A REPROVAR", "apertado.mjs"] }
    ));

  // O CONTRA-CASO, e sem ele o de cima era satisfeito por listar tudo o que esta vermelho: um
  // projeto real ja pode estar vermelho por razoes suas, e imputar isso ao upgrade e culpa-lo do
  // que ele nao fez. Quem lesse a lista aprendia a desconfiar dela.
  test("o que JA reprovava antes do upgrade NAO e imputado ao upgrade", () =>
    exige(
      contraProjeto({
        projeto: { ".agent/scripts/stub.mjs": 'console.log("  WARN  ja estava vermelho");\nprocess.exit(1);\n' },
        hoje: { ".agent/scripts/stub.mjs": 'console.log("  WARN  ja estava vermelho");\nprocess.exit(1);\n' },
      }),
      { codigo: 0, inclui: ["ja reprovam antes do upgrade"], exclui: ["PASSA A REPROVAR  .agent/scripts/stub.mjs"] }
    ));

  test("upgrade puramente aditivo diz-o em vez de nao dizer nada", () =>
    exige(contraProjeto({ hoje: { "NOVO.md": "# so um doc\n" } }), {
      codigo: 0,
      inclui: ["puramente aditivo"],
    }));

  // A promessa mais importante do modo: mede-se ANTES de aplicar, e quem decide e o utilizador.
  // Um instrumento de medicao que altera o que mede nao e um instrumento.
  test("o projeto NAO e tocado pela medicao", () => {
    const r = contraProjeto({ hoje: { ".agent/scripts/novo-doc.mjs": "// novo\n" } });
    const sujo = git(r.proj, ["status", "--porcelain"]).trim();
    return sujo === "" ? [] : [`a medicao mexeu no projeto: ${sujo}`];
  });

  // Um caminho com `.agent/` mas SEM `.git`: passa o guarda da forma e falha a copia. Sem esta
  // recusa, o archive saia vazio e a medicao corria sobre uma pasta sem nada — 0 verificacoes a
  // reprovar, que se le como "este upgrade nao parte nada" (`TP2`).
  test("projeto sem `.git` -> REPROVA em vez de medir uma copia vazia", () => {
    const r = contraProjeto();
    // O `finally` la em baixo nao e zelo: este era o unico tmpdir desta suite que ficava para
    // tras depois do registo das fixtures, e apareceu a MEDIR o delta de pastas antes e depois
    // de uma corrida (22 -> 1). Uma fuga de uma pasta por corrida e invisivel ate a varredura de
    // mutacao correr a suite dezenas de vezes.
    const semGit = mkdtempSync(join(tmpdir(), "sim-up-sem-git-"));
    mkdirSync(join(semGit, ".agent"), { recursive: true });
    // O SHA e REAL, tirado do template: a recusa da marca vem ANTES desta, logo um sha inventado
    // fazia o teste passar pelo ramo errado — verde a medir outra coisa (`TP1`).
    writeFileSync(join(semGit, ".agent/.template-version"), `commit: ${git(r.tpl, ["rev-parse", "HEAD"]).trim()}\n`);
    try {
      return exige(corre(r.tpl, [`--projeto=${semGit}`]), {
        codigo: 1,
        inclui: ["nao consegui copiar a arvore deste projeto"],
      });
    } finally {
      rmSync(semGit, { recursive: true, force: true });
    }
  });

  // As DUAS listas de comandos tem a sua recusa, e as duas sao precisas: derivar zero comandos e
  // indistinguivel de "tudo passou" se ninguem o disser. Um projeto que tenha renomeado o job fica
  // com a medicao a dizer sempre "puramente aditivo".
  test("projeto sem job `guard-tests` no ci.yml -> REPROVA", () =>
    exige(contraProjeto({ projeto: { ".github/workflows/ci.yml": "jobs:\n  outro:\n    steps: []\n" } }), {
      codigo: 1,
      inclui: ["ci.yml DESTE projeto"],
    }));

  test("template sem job `guard-tests` no ci.yml -> REPROVA", () =>
    exige(contraProjeto({ hoje: { ".github/workflows/ci.yml": "jobs:\n  outro:\n    steps: []\n" } }), {
      codigo: 1,
      inclui: ["guard-tests"],
    }));

  // --- Um passo COMENTADO no ci.yml do projeto conta como ausente ------------------
  //
  // O caso que custou SEIS RONDAS a um consumidor: a varredura de mutacao estava comentada no
  // `ci.yml` dele, com uma justificacao escrita ao lado, e a categoria `.github/workflows/*` do
  // `/upgrade` manda trazer "so os jobs em falta". Quem comparou fez isso — passo a passo,
  // contra o que la estava — e um passo comentado **nao aparece como em falta: aparece como
  // presente**.
  //
  // O `comandosDoCI` ja deitava fora as linhas comentadas dos dois lados; o que faltava era
  // subtrair os conjuntos e dizer o resultado.
  // O template da fixture corre `stub.mjs`. Aqui o PROJETO tem esse mesmo passo comentado (e
  // outro activo, senao a medicao recusa por nao derivar comando nenhum): o `stub.mjs` tem de
  // aparecer como algo que o template corre e este projeto nao.
  const CI_PROJETO = (stubComentado) =>
    "jobs:\n  guard-tests:\n    steps:\n" +
    "      - run: node .agent/scripts/outro.mjs\n" +
    `      ${stubComentado ? "# " : ""}- run: node .agent/scripts/stub.mjs\n`;
  const OUTRO = { ".agent/scripts/outro.mjs": 'console.log("  1 passaram, 0 falharam.");\n' };

  test("passo COMENTADO no ci.yml do projeto sai como ausente", () =>
    exige(contraProjeto({ projeto: { ".github/workflows/ci.yml": CI_PROJETO(true), ...OUTRO } }), {
      codigo: 0,
      inclui: ["stub.mjs", "COMENTADA"],
    }));

  // O CONTRA-CASO: o MESMO passo, activo, nao pode ser anunciado. Sem ele, o de cima era
  // satisfeito por uma medicao que acusasse toda a gente — e um aviso que grita sempre e
  // desligado na primeira semana.
  //
  // A primeira versao deste par passou com o defeito presente: eu esperava um comando que a
  // fixture nao usa, logo o contra-caso verificava a ausencia de texto que nunca la estaria.
  // E o `TP1` — assercao satisfeita por outra coisa.
  test("o mesmo passo ACTIVO nao e anunciado como ausente", () => {
    const r = contraProjeto({ projeto: { ".github/workflows/ci.yml": CI_PROJETO(false), ...OUTRO } });
    return r.out.includes("que o ci.yml deste projeto nao corre")
      ? [`anunciou uma ausencia com os dois lados a correr o mesmo: ${r.out.slice(0, 200)}`]
      : [];
  });

  // CONTROLO DE RECURSOS, e nasceu de uma medicao e nao de uma suspeita: estes testes deixaram
  // **1508 pastas** em `tmpdir` num unico dia. Cada `contraProjeto()` cria duas, e a varredura de
  // mutacao corre a suite uma vez por sitio desligado — o que multiplica qualquer fuga por dezenas.
  // O custo nao e o disco: uma fuga igual ja inflou uma medicao de tempo em 3x, e uma medicao
  // errada e pior do que nenhuma.
  //
  // `base` propria de proposito: contar `sim-up-*` no `tmpdir()` do sistema era um teste a
  // depender do estado da maquina (`TP3`) — outra corrida ao mesmo tempo pintava-o de vermelho.
  test("as fixtures do modo --projeto nao ficam para tras", () => {
    const base = mkdtempSync(join(tmpdir(), "fuga-2b-"));
    try {
      contraProjeto({ base });
      const criadas = readdirSync(base).length;
      if (criadas === 0) return ["a fixture nao criou nada — o teste nao esta a medir a fuga"];
      limpaTmpsDaSuite();
      const sobraram = readdirSync(base);
      return sobraram.length === 0 ? [] : [`ficaram ${sobraram.length} pasta(s): ${sobraram.join(", ")}`];
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  // --- um passo COMENTADO no ci.yml e uma decisao do projeto -----------------------
  //
  // Achado a correr a Fase 0 num consumidor REAL, com nove releases de atraso. O regex corria
  // sobre o texto inteiro do job e nao distinguia `run:` de `#   run:`, logo a medicao corria
  // a varredura de mutacao que aquele projeto tinha DESLIGADO — duas vezes, ~14 min cada, com
  // as suites aninhadas la dentro. Nenhuma suite sintetica o podia apanhar: o `ci.yml` do
  // template nao tem uma unica linha `run:` comentada.
  test("passo COMENTADO no ci.yml do projeto nao entra na medicao", () => {
    // O passo comentado vive SO do lado do template (`hoje`), e nao nos dois.
    //
    // A primeira versao punha-o em ambos, e **passava com o defeito reposto** — apanhado a fazer
    // o controlo negativo. Com o passo nos dois lados, um comando indevidamente apanhado falha no
    // ANTES (ausente na copia do projeto) e no DEPOIS, e a subtraccao da baseline esconde-o: a
    // assercao ficava satisfeita por outro mecanismo (`TP1`). So do lado do template, o comando
    // nao esta no antes — logo, se for apanhado, aparece mesmo no delta.
    return exige(
      contraProjeto({
        hoje: {
          ".github/workflows/ci.yml":
            "jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/stub.mjs\n" +
            "      # - run: node .agent/scripts/desligado.mjs\n",
          ".agent/scripts/desligado.mjs": 'console.log("  WARN  nao devia ter corrido");\nprocess.exit(1);\n',
        },
      }),
      { codigo: 0, exclui: ["desligado.mjs"] }
    );
  });

  // O CONTRA-CASO, e sem ele o de cima era satisfeito por um filtro que deitasse fora tudo: um
  // comentario DEPOIS do comando e um passo activo com uma nota ao lado, e tem de continuar a
  // ser corrido. Trocar um falso positivo por um falso negativo nao e corrigir.
  test("comentario ao LADO de um passo activo nao o desliga", () => {
    const ci =
      "jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/stub.mjs\n" +
      "      - run: node .agent/scripts/apertado.mjs  # o guard novo\n";
    return exige(
      contraProjeto({
        hoje: {
          ".github/workflows/ci.yml": ci,
          ".agent/scripts/apertado.mjs": 'console.log("  WARN  limiar apertado");\nprocess.exit(1);\n',
        },
      }),
      { codigo: 0, inclui: ["PASSA A REPROVAR", "apertado.mjs"] }
    );
  });


  // --- A 2b mostra TODAS as reprovacoes, linha a linha (#175) -----------------------
  //
  // Guardava so a primeira linha de cada comando, e o "antes" era um conjunto de COMANDOS. No
  // derivado real a 2b mostrou 2 linhas onde a bateria tinha 19 — e entre as escondidas estava um
  // guard do proprio projeto desligado pelo upgrade (R7-A).
  const CI_UM = (cmd) => `jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/${cmd}\n`;
  const imprime = (...linhas) => linhas.map((l) => `console.log(${JSON.stringify(l)});\n`).join("") + "process.exit(1);\n";

  test("dois FAIL novos no mesmo comando saem os dois, e o que ja reprovava nao", () =>
    exige(
      contraProjeto({
        projeto: { ".github/workflows/ci.yml": CI_UM("multi.mjs"), ".agent/scripts/multi.mjs": imprime("  WARN  antigo") },
        hoje: {
          ".github/workflows/ci.yml": CI_UM("multi.mjs"),
          ".agent/scripts/multi.mjs": imprime("  WARN  antigo", "  WARN  novo-um", "  FAIL  novo-dois"),
        },
      }),
      { codigo: 0, inclui: ["novo-um", "novo-dois"], exclui: ["WARN  antigo"] }
    ));

  // A linha de RESUMO comeca por `WARNING:` e casava `^WARN`: linha a linha, contava como achado.
  test("a linha de resumo `WARNING:` nao conta como reprovacao", () =>
    exige(
      contraProjeto({
        hoje: {
          ".github/workflows/ci.yml": CI_UM("resumo.mjs"),
          ".agent/scripts/resumo.mjs": imprime("  WARN  real", "WARNING: ha divergencias/avisos de documentacao."),
        },
      }),
      { codigo: 0, inclui: ["WARN  real"], exclui: ["WARNING: ha divergencias"] }
    ));

  // Um crash nao tem linhas de aviso. Sem a sentinela, um comando que rebenta sumia da lista.
  test("um comando que rebenta sem linhas de aviso sai como `exit N`", () =>
    exige(
      contraProjeto({ hoje: { ".github/workflows/ci.yml": CI_UM("rebenta.mjs"), ".agent/scripts/rebenta.mjs": "process.exit(3);\n" } }),
      { codigo: 0, inclui: ["rebenta.mjs", "exit 3"] }
    ));

  // Normalizar os numeros escondia `31 -> 33`, que e uma regressao. Sai, anotada.
  test("uma linha que so mudou nos numeros SAI, anotada, e nao se esconde", () =>
    exige(
      contraProjeto({
        projeto: { ".github/workflows/ci.yml": CI_UM("conta.mjs"), ".agent/scripts/conta.mjs": imprime("  WARN  existem 31") },
        hoje: { ".github/workflows/ci.yml": CI_UM("conta.mjs"), ".agent/scripts/conta.mjs": imprime("  WARN  existem 33") },
      }),
      { codigo: 0, inclui: ["existem 33", "mudou so em numeros"] }
    ));

  // --- Os blocos `run: |` contam (#184) --------------------------------------------
  //
  // A varredura do template vive num bloco, dentro de um `if`, e so `run: node X` numa linha era
  // lido. A forma copiada do `ci.yml` real, e nao uma linha sintetica que passasse por acaso.
  const CI_BLOCO = (corpo) =>
    "jobs:\n  guard-tests:\n    steps:\n      - run: node .agent/scripts/stub.mjs\n" +
    "      - name: bloco\n        run: |\n          set -euo pipefail\n          if true; then\n" +
    `            ${corpo}\n          fi\n`;

  test("um comando dentro de um bloco `run: |` e medido", () =>
    exige(
      contraProjeto({
        hoje: {
          ".github/workflows/ci.yml": CI_BLOCO("node .agent/scripts/bloco.mjs"),
          ".agent/scripts/bloco.mjs": imprime("  WARN  do bloco"),
        },
      }),
      { codigo: 0, inclui: ["PASSA A REPROVAR", "bloco.mjs"] }
    ));

  // O caso das seis rondas: o projeto tem a varredura COMENTADA. A NOTE tem de a nomear — e a
  // bateria NAO a corre (minutos; mede as suites), o que a fixture prova com uma que reprova.
  test("a varredura num bloco, comentada no projeto, e NOMEADA e nao corre", () =>
    exige(
      contraProjeto({
        projeto: { ".github/workflows/ci.yml": CI_BLOCO("# node .agent/scripts/mutation-sweep.mjs") },
        hoje: {
          ".github/workflows/ci.yml": CI_BLOCO("node .agent/scripts/mutation-sweep.mjs"),
          ".agent/scripts/mutation-sweep.mjs": imprime("  WARN  a varredura correu"),
        },
      }),
      { codigo: 0, inclui: ["mutation-sweep.mjs", "COMENTADA", "nao corre"], exclui: ["a varredura correu"] }
    ));

  // O job SEGUINTE nao e do `guard-tests`: o `split` levava todos os que vinham depois.
  test("um comando de OUTRO job, depois do guard-tests, nao entra", () =>
    exige(
      contraProjeto({
        hoje: {
          ".github/workflows/ci.yml": CI_UM("stub.mjs") + "  outro:\n    steps:\n      - run: node .agent/scripts/fora.mjs\n",
          ".agent/scripts/fora.mjs": imprime("  WARN  de outro job"),
        },
      }),
      { codigo: 0, exclui: ["fora.mjs"] }
    ));
}
