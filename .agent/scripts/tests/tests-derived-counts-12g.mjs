/**
 * Testes do Guard 12g (o INTERVALO de anti-padroes citado em prosa) — {{PROJECT_NAME}}
 *
 * Saiu do `tests-derived-counts.mjs` quando este chegou as 500 linhas (Guard 17) com as correcoes
 * do #177. MOVIMENTO, e nao reescrita: os casos sao os mesmos, so mudaram de casa.
 *
 * NAO e um entry point: o `test-guards.mjs` descobre-o e chama `registar()`.
 */
import { pathToFileURL } from "url";
import { test, readF, writeF } from "./harness/test-harness.mjs";
import { apagaCitacoes } from "./tests-derived-counts.mjs";
// A receita do "bootstrap concluido" e uma so, no harness (`TP8`): a terceira copia vivia no
// `test-guards.mjs` e ja tinha divergido uma vez (o `.mdc` em falta).
import { bootstrapado as derivado } from "./harness/projeto-derivado.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error("tests-derived-counts-12g.mjs nao e um entry point: nao corre testes por si.\nCorrer `node .agent/scripts/tests/test-guards.mjs`.");
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

export function registar() {
  // --- 12g: o INTERVALO de anti-padroes citado em prosa -----------------------
  // QUATRO copias a mao do mesmo intervalo, quatro valores errados, e nem entre si
  // concordavam (duas diziam 7, duas 8, existiam 9). O Guard 15 estava verde o tempo todo
  // porque verifica que cada citacao RESOLVE — `TP1` e `TP7` resolvem. "Estes sao todos" e
  // outra afirmacao, e ninguem a media.
  //
  // A copia cara era a do `review.md`: um item EXECUTAVEL que manda correr o grep de
  // deteccao "de cada entrada" e fechava o intervalo dois numeros antes do fim. Corriam-se 7
  // de 9 greps e marcava-se a caixa — e um dos dois que ficavam de fora e o TP8, "duas copias
  // da mesma regra a concordar a mao", ou seja, exactamente o defeito que a checklist deixava
  // de procurar.

  /** Acrescenta um anti-padrao do template ao catalogo **e a sua evidencia**.
   *
   *  Os dois, e nao so o catalogo: sem a seccao no `-why`, o Guard 18 avisa tambem e o teste
   *  ficava vermelho por duas razoes. Um `code: 1` que qualquer um dos dois guards produz nao
   *  prova nada sobre o 12g — e o TP1 na sua forma canonica.
   *
   *  O CABECALHO E MINIMO de proposito. A primeira versao somava ~46 bytes ao catalogo, que vive
   *  a menos de 30 do tecto do Guard 1e: o teste corria com um aviso de orcamento por cima, e
   *  quem o fosse depurar via ruido que nada tinha a ver com o que ele afirma. */
  /** O ultimo `TPn` definido NA FIXTURE. Derivado, e nao um numero escrito aqui: os tres casos
   *  abaixo fixavam o 9 e o 10, e no dia em que o catalogo real ganhou o `TP10` partiram-se os
   *  tres de uma vez — `TP3` textual, dentro da suite do guard que verifica intervalos. */
  const ultimoTP = (dir) =>
    Math.max(
      0,
      ...[...readF(dir, ".agent/rules/anti-patterns-template.md").matchAll(/^#{2,3}\s+TP(\d+)\b/gm)].map((m) => +m[1])
    );

  const acrescentaTP = (dir, n) => {
    const cab = `\n## TP${n} — x\n`;
    writeF(dir, ".agent/rules/anti-patterns-template.md", readF(dir, ".agent/rules/anti-patterns-template.md") + cab);
    writeF(dir, "src/docs/anti-patterns-why.md", readF(dir, "src/docs/anti-patterns-why.md") + cab);
  };

  /** ESCREVE o catalogo do projeto com exactamente as entradas pedidas, e a prosa que as
   *  declara. Escreve, nao acrescenta: o `simulate-derived.mjs` semeia um anti-padrao proprio
   *  para montar um "derivado com historia", logo acrescentar deixava a fixture a depender do
   *  que o repo base ja trazia — TP3, e foi assim que um destes testes reprovou so na simulacao
   *  de derivado, com a bateria local inteira verde. */
  // Antes, apagam-se as citacoes `APn` do resto — `.md` e `.mjs`, que o Guard 15 le os dois: num
  // derivado, as rules e os scripts citam os seus `AP` reais, e trocar o catalogo por um sintetico
  // punha-os a citar o que nao existe (#177).
  const catalogoDoProjeto = (dir, nums, prosa) =>
    apagaCitacoes(dir, /`?\bAP\d+\b`?/g, [".md", ".mjs"]) ||
    writeF(
      dir,
      ".agent/rules/anti-patterns.md",
      "# Anti-Padroes\n" + nums.map((n) => `\n## AP${n} — entrada ${n}\n`).join("") + `\n${prosa}\n`
    );

  test("G12g: o repo como esta passa — os intervalos batem com o que esta definido", null, {
    code: 0,
    includes: ["intervalo(s) de anti-padroes coerentes"],
  });

  // O CONTROLO NEGATIVO PRINCIPAL, e e o unico teste que distingue este guard de prosa:
  // acrescentar uma entrada **sem tocar em nenhum dos quatro textos** tem de acusar os quatro.
  // Sem ele, um guard que nunca avisasse passava em tudo o resto.
  test("G12g: um TP novo sem actualizar a prosa acusa TODOS os sitios", (dir) => {
    const fim = ultimoTP(dir);
    const novo = fim + 1;
    // A fixture ESCREVE a citacao nos ficheiros do projeto que o teste nomeia: um derivado
    // reescreve o `README` e o `review.md`, e o teste reprovava la sem nada partido (R7-F, #177).
    for (const f of [".agent/rules/anti-patterns.md", ".agent/workflows/review.md", "README.md"]) {
      writeF(dir, f, `${readF(dir, f)}\nOs anti-padroes do template (\`TP1\`-\`TP${fim}\`).\n`);
    }
    acrescentaTP(dir, novo);
    return {
      includes: [
        ".agent/rules/anti-patterns.md:",
        ".agent/rules/anti-patterns-template.md:",
        ".agent/workflows/review.md:",
        "README.md:",
        `o ultimo TP definido e o TP${novo}`,
      ],
      // A ARMADILHA, e esta escrita em disco: o `upgrade-why.md` diz "num projeto com oito
      // anti-padroes proprios", medicao correcta sobre OUTRO projeto. Um guard que lesse
      // contagens por extenso acusava-a — e acusar quem esta certo e como um guard se
      // desliga. Verificado aqui, com o guard a disparar, e nao no repo limpo.
      excludes: ["upgrade-why.md:"],
    };
  }, { code: 1 });

  // A decisao de desenho, e sem este caso ela era so um comentario: valida-se o extremo
  // SUPERIOR, logo um intervalo parcial que acabe no ultimo definido e legitimo e passa.
  test("G12g: intervalo parcial que acaba no ultimo definido NAO avisa", (dir) => {
    const fim = ultimoTP(dir);
    writeF(dir, ".agent/rules/exemplo-intervalo.md", `# Exemplo\n\nOs dois mais recentes (\`TP${fim - 1}\`-\`TP${fim}\`) sao sobre isto.\n`);
    return { excludes: [`acaba em ${fim}`] };
  }, { code: 0 });

  test("G12g: intervalo que mistura prefixos avisa", (dir) => {
    catalogoDoProjeto(dir, [1], "");
    writeF(dir, ".agent/rules/exemplo-intervalo.md", "# Exemplo\n\nVer `TP1`-`AP1`.\n");
  }, { code: 1, includes: ["mistura os prefixos TP e AP"] });

  // O caso do DERIVADO, que e para quem o template existe: prefixo proprio, numeracao propria.
  //
  // ESTE PAR SUBSTITUI UM TESTE QUE NAO MEDIA NADA, e a licao e cara. A versao anterior era so
  // o caso que passa, com `includes: ["intervalo(s) coerentes"]` e `code: 0` — e uma leitura
  // independente derrubou-a: inserindo `if (pref === "AP") continue;` no guard, que o cega por
  // completo ao prefixo dos derivados, a suite ficava **304 de 304 verde**. A mensagem do `ok()`
  // nao nomeia prefixos, logo os quatro intervalos `TP` do baseline ja a satisfaziam sozinhos.
  // TP1 na forma canonica, no teste que dizia por comentario ser a prova de que o guard nao
  // servia so ao template. A varredura de mutacao tambem nao o apanhava: nao ha `warn` neste
  // caminho para mutar.
  //
  // A correccao e o primeiro do par: afirma o prefixo PELO NOME, e reprova.
  test("G12g: derivado com intervalo AP desalinhado avisa, nomeando o AP", (dir) => {
    catalogoDoProjeto(dir, [1, 2, 3], "Os deste projeto (`AP1`-`AP2`) vivem aqui.");
  }, { code: 1, includes: ["o ultimo AP definido e o AP3"] });

  test("G12g: derivado com prefixo AP proprio e intervalo certo passa", (dir) => {
    catalogoDoProjeto(dir, [1, 2, 3], "Os deste projeto (`AP1`-`AP3`) vivem aqui.");
    return { includes: ["intervalo(s) de anti-padroes coerentes"] };
  }, { code: 0 });

  // O BURACO NO MEIO, e tambem veio da leitura independente, provado com uma fixture corrida:
  // `AP1` e `AP3` definidos, `AP2` apagado, prosa a dizer o intervalo inteiro — e a versao que
  // so validava o topo dava `EXIT=0`. A mentira "estes sao todos" tem duas pontas e esta e a de
  // dentro. Apagar uma entrada do meio e operacao normal: a rule manda migrar uma entrada
  // estavel para `core-rules.md`.
  test("G12g: buraco no MEIO do intervalo avisa", (dir) => {
    catalogoDoProjeto(dir, [1, 3], "Os deste projeto (`AP1`-`AP3`) vivem aqui.");
  }, { code: 1, includes: ["abrange AP2", "procura o que nao ha"] });

  // O separador `..`. Duas copias do repo estavam escritas assim e escapavam — uma delas 13
  // linhas abaixo de outra que este ticket ja tinha corrigido, no mesmo ficheiro.
  test("G12g: o separador `..` tambem declara um intervalo", (dir) => {
    writeF(dir, ".agent/rules/exemplo-intervalo.md", "# Exemplo\n\nOs `TP1`..`TP7` vivem la.\n");
    // Derivado, como os dois casos acima: este fixava o 9 e partiu-se no dia em que o catalogo
    // ganhou uma entrada. O que o caso afirma e que o separador `..` conta como intervalo — nao
    // qual e o ultimo numero do repo.
    return { includes: [`o ultimo TP definido e o TP${ultimoTP(dir)}`] };
  }, { code: 1 });

  // O `continue` do prefixo sem definicoes, que nao tinha teste nenhum — a leitura independente
  // trocou-o por um `warn` e a suite ficou verde na mesma. E alcancavel e barato: um derivado
  // que escreva o intervalo antes do primeiro cabecalho, ou seja o dia 1 de quem bootstrapa.
  //
  // O `code: 1` vem do Guard 15 (as duas pontas sao citacoes mortas) e NAO prova nada aqui — e
  // exactamente por isso que a afirmacao esta toda no `excludes`: o que este teste mede e o
  // SILENCIO do 12g, e que ele e deliberado em vez de acidental.
  //
  // O CATALOGO DO PROJETO ESVAZIA-SE A MAO, e custou uma reprovacao a aprender: a primeira
  // versao deste teste assumia que nao havia nenhum `AP` definido — verdade no template nu,
  // FALSA em qualquer derivado. O `simulate-derived.mjs` semeia um anti-padrao proprio para
  // montar um "derivado com historia", logo la o prefixo tem definicoes, o intervalo passava a
  // ser validado e o `excludes` caia. TP3 na forma canonica: o teste lia o estado do repo em
  // vez de o montar, e so a simulacao de derivado o apanhou — a bateria local inteira estava
  // verde. Esvaziar e seguro: o que a simulacao semeia nao e citado em lado nenhum.
  test("G12g: intervalo de um prefixo sem definicoes fica calado (quem o diz e o Guard 15)", (dir) => {
    writeF(dir, ".agent/rules/anti-patterns.md", "# Anti-Padroes\n\n(nenhum ainda)\n");
    writeF(dir, ".agent/rules/exemplo-intervalo.md", "# Exemplo\n\nVer `AP1`-`AP5`.\n");
    return { excludes: ["o ultimo AP definido", "abrange AP"] };
  }, { code: 1 });

  // Um intervalo dentro de um comentario HTML nao e uma afirmacao — e o exemplo ilustrativo
  // que quem acaba de bootstrapar ainda nao apagou. Avisar sobre uma linha que o markdown nem
  // mostra ensina a ignorar avisos, e e assim que um guard se gasta.
  test("G12g: intervalo dentro de comentario HTML nao e acusado", (dir) => {
    writeF(dir, ".agent/rules/exemplo-intervalo.md", "# Exemplo\n\n<!-- exemplo: `TP1`-`TP5` -->\n");
    return { excludes: ["acaba em 5"] };
  }, { code: 0 });

  // O `skip`, que e UM so. Houve uma tentativa de ter dois — este e um segundo para "nao ha
  // nenhuma definicao" — e o segundo so se conseguia exercitar limpando citacoes de mais de
  // vinte `.mjs` a mao, porque o Guard 15 varre codigo e nao so markdown. Um ramo cujo unico
  // estado possivel e o da fixture e um TP7 a nascer, e a correccao foi fundi-lo, nao
  // arranjar-lhe uma fixture maior. O estado sem definicoes cai aqui pelo mesmo caminho.
  test("G12g: definicoes sem nenhum intervalo em prosa faz skip", (dir) => {
    apagaCitacoes(dir, /`?(?:AP|TP)\d+`?\s*[-–]\s*`?(?:AP|TP)\d+`?/g);
    return { includes: ["nenhuma prosa cita um intervalo"] };
  }, { code: 0 });

  // Os SKIP do Guard 12 num projeto DERIVADO: vieram do `test-guards.mjs` no #171.
  test("G12d: num projeto DERIVADO a citacao ausente e SKIP, nao WARN", (dir) => {
    // O oposto do teste irmao: com o marcador de bootstrap presente, nao ter citacao do numero
    // de guards e normal — era este ramo que punha o CI de todos os consumidores vermelho.
    derivado(dir);
    writeF(dir, ".agent/BOOTSTRAP.md", "# Bootstrap\n\nSem citacoes de contagens.\n");
  }, { synthetic: true, code: 0, includes: ["SKIP  Guard 12d"] });

  test("G12e: num projeto DERIVADO a citacao ausente e SKIP, nao WARN", (dir) => {
    derivado(dir);
    writeF(dir, ".agent/BOOTSTRAP.md", "# Bootstrap\n\nSem contagens.\n");
    writeF(dir, "README.md", "# Projeto\n\nSem contagens.\n");
  }, { synthetic: true, code: 0, includes: ["SKIP  Guard 12e"] });

  // O CHANGELOG e um registo DATADO (R7-G, #177): um intervalo antigo nao e instrucao. O par:
  // no CHANGELOG nao avisa; o MESMO texto noutro `src/docs/` avisa — sem ele, o de cima passava
  // com um guard que deixasse de ler `src/docs` inteiro.
  const ANTIGO = (dir) => `\n## [v0.1.0] - antes\n\nOs \`TP1\`-\`TP${ultimoTP(dir) - 1}\` eram todos.\n`;
  test("G12g: um intervalo antigo no CHANGELOG nao avisa (e historia, nao instrucao)", (dir) => {
    writeF(dir, "src/docs/CHANGELOG.md", readF(dir, "src/docs/CHANGELOG.md") + ANTIGO(dir));
  }, { code: 0, excludes: ["CHANGELOG.md:"] });
  test("G12g: [controlo] o mesmo intervalo noutro documento de src/docs avisa", (dir) => {
    writeF(dir, "src/docs/notas.md", `# Notas\n${ANTIGO(dir)}`);
  }, { code: 1, includes: ["src/docs/notas.md:"] });
}
