/**
 * Testes do proprio harness — {{PROJECT_NAME}}
 *
 * Espelha a funcao `avaliar()` de `test-harness.mjs`. NAO e um entry point: o
 * `test-guards.mjs` descobre-o em disco e chama `registar()`.
 *
 * PORQUE EXISTE: a varredura de mutacao mediu **0 de 9** sitios no `test-harness.mjs`.
 * Desligar qualquer uma das suas assercoes deixava as suites verdes — uma assercao a menos no
 * harness so torna os testes MAIS permissivos, e o ecra continua a dizer "todos passaram". O
 * ficheiro que decide o veredicto de ~280 testes era o unico do repo sem rede nenhuma, e
 * estar em `PARES` nao chegava: nao havia nada que uma mutacao pudesse partir.
 *
 * COMO FUNCIONA: `avaliar()` foi isolada como funcao pura (o que o guard fez + o que o teste
 * esperava -> lista de problemas). Aqui chama-se com entradas FABRICADAS, uma por sitio de
 * assercao, e exige-se a mensagem correspondente. Desligue-se um `problems.push` e um destes
 * casos fica vermelho — que e a definicao de estar coberto.
 *
 * O contra-caso importa tanto como os outros: um cenario SAO tem de devolver zero problemas.
 * Sem ele, um `avaliar()` que devolvesse sempre tudo passaria esta suite inteira.
 */
import { pathToFileURL } from "url";
import { avaliar, registarResultado } from "./test-harness.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-harness-self.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Cabecalho que o harness exige para aceitar que o guard chegou a correr. */
const CAB = "=== Doc Guards ===";
const semBaseline = new Set();

export function registar() {
  /**
   * @param nome     o cenario
   * @param entrada  o que `avaliar()` recebe
   * @param esperado fragmentos que TEM de aparecer nos problemas devolvidos
   * @param proibido fragmentos que NAO podem aparecer
   */
  const caso = (nome, entrada, esperado, proibido = []) => {
    let problems;
    try {
      problems = avaliar({ base: semBaseline, extra: {}, ...entrada });
    } catch (err) {
      registarResultado(nome, [`avaliar() rebentou: ${err.message}`], "");
      return;
    }
    const juntos = problems.join(" | ");
    const faltam = esperado.filter((t) => !juntos.includes(t)).map((t) => `devia reportar "${t}"; reportou: [${juntos}]`);
    const sobram = proibido.filter((t) => juntos.includes(t)).map((t) => `NAO devia reportar "${t}"; reportou: [${juntos}]`);
    registarResultado(nome, [...faltam, ...sobram], "");
  };

  // --- O contra-caso: um cenario sao nao produz problema nenhum ---------------
  // Sem isto, um `avaliar()` que devolvesse sempre todas as mensagens passava tudo o resto.
  caso(
    "harness: cenario sao devolve ZERO problemas",
    { code: 0, out: `${CAB}\n  OK    tudo bem\n`, expect: { code: 0, includes: ["tudo bem"] } },
    [],
    ["devia", "nao devia", "imprimiu WARN"]
  );

  // --- O guard nem chegou a correr -------------------------------------------
  caso(
    "harness: output sem o cabecalho do guard e reportado (rebentou?)",
    { code: 1, out: "SyntaxError: unexpected token\n", expect: { code: 1 } },
    ["o guard nao produziu output"]
  );

  // --- A invariante WARN <-> exit code ---------------------------------------
  // A mais importante das nove: sem ela, trocar a ultima linha do guard por um
  // `process.exit(0)` fixo dava a suite inteira verde.
  caso(
    "harness: WARN com exit 0 e reportado",
    { code: 0, out: `${CAB}\n  WARN  algo\n`, expect: { code: 1, includes: ["algo"] } },
    ["imprimiu WARN mas saiu 0"]
  );

  caso(
    "harness: exit != 0 sem WARN nenhum e reportado",
    { code: 1, out: `${CAB}\n  OK    nada de mal\n`, expect: { code: 0 } },
    ["nao imprimiu WARN mas saiu 1"]
  );

  // --- A afirmacao DIFERENCIAL -----------------------------------------------
  caso(
    "harness: teste que espera sucesso mas acrescenta avisos e reportado",
    { code: 1, out: `${CAB}\n  WARN  aviso novo\n`, expect: { code: 0 } },
    ["nao devia acrescentar avisos"]
  );

  // O texto esperado NAO pode estar no baseline, senao cai no ramo seguinte (o que explica a
  // causa) e este sitio fica por exercitar.
  caso(
    "harness: teste que espera aviso e nao ve nenhum novo e reportado",
    {
      code: 1,
      out: `${CAB}\n  WARN  x\n`,
      expect: { code: 1, includes: ["aviso inedito"] },
      base: new Set(["WARN  x"]),
    },
    ["devia acrescentar pelo menos um aviso novo"]
  );

  // A variante que explica a causa: o aviso ja estava no baseline. Sem esta mensagem, quem
  // le vai procurar o defeito no guard em vez de no repo.
  caso(
    "harness: aviso ja no baseline e reportado COM a explicacao",
    {
      code: 1,
      out: `${CAB}\n  WARN  contagem 5 errada\n`,
      expect: { code: 1, includes: ["contagem 5 errada"] },
      base: new Set(["WARN  contagem N errada"]),
    },
    ["o baseline JA avisava disto"]
  );

  caso(
    "harness: teste que espera aviso mas o guard saiu 0 e reportado",
    { code: 0, out: `${CAB}\n  WARN  algo novo\n`, expect: { code: 1, includes: ["algo novo"] } },
    ["devia sair != 0"]
  );

  // --- `includes` ao NIVEL DA LINHA ------------------------------------------
  // A causa-raiz de quatro rondas de defeitos: um teste `code: 1` satisfeito por uma linha
  // `NOTE` com o mesmo texto. O alvo tem de ser SO as linhas WARN.
  caso(
    "harness: includes nao e satisfeito por uma linha NOTE",
    { code: 1, out: `${CAB}\n  NOTE  o texto procurado\n  WARN  outra coisa\n`, expect: { code: 1, includes: ["o texto procurado"] } },
    ['linhas WARN devia conter "o texto procurado"']
  );

  caso(
    "harness: anyOut em falta e reportado",
    { code: 1, out: `${CAB}\n  WARN  algo\n`, expect: { code: 1, includes: ["algo"], anyOut: ["SKIP  Guard 99"] } },
    ['output devia conter "SKIP  Guard 99"']
  );

  // --- `excludes` tambem e DIFERENCIAL ---------------------------------------
  caso(
    "harness: excludes so dispara em ocorrencia NOVA",
    { code: 1, out: `${CAB}\n  WARN  proibido\n`, expect: { code: 1, includes: ["proibido"], excludes: ["proibido"] } },
    ["(ocorrencia nova, nao de baseline)"]
  );

  caso(
    "harness: excludes NAO dispara numa linha de baseline",
    {
      code: 1,
      out: `${CAB}\n  WARN  de baseline\n  WARN  novo\n`,
      expect: { code: 1, includes: ["novo"], excludes: ["de baseline"] },
      base: new Set(["WARN  de baseline"]),
    },
    [],
    ["ocorrencia nova"]
  );
}
