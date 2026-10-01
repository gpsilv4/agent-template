/**
 * Contadores e relatorio de uma suite de guards — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-harness.mjs` importa-o e reexporta o que os `tests-*.mjs` usam.
 *
 * ## Porque vive a parte
 *
 * Isto saiu do `test-harness.mjs` por uma razao medida, nao por gosto de arrumacao: o ficheiro
 * chegou as 510 linhas e o Guard 17 poe o limite em 500. A alternativa era congelar a entrada
 * em `TETOS`, e `TETOS` e uma **catraca, nao uma isencao** — so aceita numeros a descer.
 *
 * A costura nao e arbitraria. O `test-harness.mjs` monta FIXTURES e corre o guard; isto CONTA
 * e RELATA. Sao as duas unicas coisas la dentro que precisam de estado mutavel partilhado, e
 * sao as unicas que um segundo harness poderia querer sem trazer as fixtures atras.
 *
 * ## Os contadores ficam AQUI, e nao se exportam
 *
 * `passed` e `failures` sao deste modulo e so se mexem por estas funcoes. Exporta-los daria
 * bindings so-leitura, e quem incrementasse de fora rebentava com `passed is not defined` —
 * ja aconteceu, e e por isso que esta escrito.
 */
import { pathToFileURL } from "url";
import { FAIL_FAST_ENV } from "../../lib/varredura-paralela.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "relatorio.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

let passed = 0;
const failures = [];

/**
 * MODO FAIL-FAST: sair ao primeiro `FAIL` em vez de correr a suite ate ao fim.
 *
 * So a varredura de mutacao o liga, e so na corrida MUTADA — nunca na baseline, onde o verde
 * so significa alguma coisa se for sobre a suite inteira executada. Na corrida mutada o
 * veredicto de um sitio e binario ("algum teste apanhou isto?") e mediu-se que **54%** da
 * suite corria DEPOIS de esse veredicto estar decidido.
 *
 * **Na semantica nao enfraquece, e a assimetria e o argumento**: sair mais cedo so pode
 * acontecer a uma suite que **ja ia ficar vermelha**. Nao ha caminho por onde isto torne verde
 * o que era vermelho.
 *
 * `process.env` LIDO e explicitamente legitimo no Guard 19 — so a escrita e acusada.
 */
// DERIVADO do `FAIL_FAST_ENV` do motor, e nao a chave escrita outra vez (#157, `TP8`): eram duas
// copias a concordar a mao, presas so pelo `tests-fail-fast.mjs`. As quatro suites que nao
// usam este relatorio importam ESTA constante.
export const FAIL_FAST = Object.entries(FAIL_FAST_ENV).every(([k, v]) => process.env[k] === v);

/**
 * O UNICO sitio que regista uma falha.
 *
 * Eram tres a fazer o mesmo a mao — o `test()`, o `catch` do setup dentro dele, e o
 * `registarResultado()`. Um fail-fast posto em dois deles deixava uma classe inteira de testes
 * a correr ate ao fim, **sem sinal nenhum** de que o modo nao estava a agir: a varredura ficava
 * correcta e lenta, que e o defeito mais dificil de notar.
 *
 * A linha `FAIL <nome>` sai ANTES de qualquer saida antecipada, e isso e obrigatorio e nao
 * estetico: a varredura exige `/^\s*FAIL\s/m` na saida (`lib/varredura-paralela.mjs`) para
 * distinguir "um teste apanhou a mutacao" de "a suite rebentou". Sair antes de a imprimir fazia
 * TODOS os sitios cobertos passarem a contar como rebentados.
 */
export function falhou(name, problems, out) {
  failures.push({ name, problems, out });
  console.log(`  FAIL  ${name}`);
  for (const p of problems) console.log(`          ${p}`);
  if (FAIL_FAST) resumo();
}

/** O gemeo do `falhou`, para o caminho verde. Existe para os contadores nao sairem daqui. */
export function passou(name) {
  passed++;
  console.log(`  PASS  ${name}`);
}

/** Registar um resultado sem passar pelo `test()` — para os blocos da baseline, que montam a
 *  fixture a mao. */
export function registarResultado(name, problems, out) {
  if (problems.length) falhou(name, problems, out);
  else passou(name);
}

/** Total de testes ja corridos (passados + falhados). E como o registo por descoberta mede o
 *  contributo de cada modulo: um `tests-*.mjs` que nao mova este numero nao registou nada e
 *  reprova, em vez de passar por registado. */
export const contagem = () => passed + failures.length;

/** Imprime o resumo e sai. */
export function resumo() {
  console.log("");
  // O modo NUNCA e invisivel: quem le uma contagem baixa tem de saber porque e baixa. Sem esta
  // linha, `12 passaram` em vez de `309 passaram` parecia uma suite a desaparecer em silencio —
  // que e precisamente a forma como um fail-fast avariado certificaria o nada.
  // E as DUAS frases, e nao uma: "saiu ao primeiro FAIL" numa corrida que foi verde ate ao fim
  // e uma mentira, e a primeira versao dizia-a. Quem la o relatorio da varredura tem de poder
  // distinguir "parou cedo porque apanhou" de "correu tudo e nao apanhou nada" — e essa e
  // exactamente a distincao que a varredura usa para decidir se um sitio esta coberto.
  if (FAIL_FAST) {
    console.log(
      failures.length
        ? `  MODO FAIL-FAST: saiu ao primeiro FAIL, depois de ${contagem()} teste(s).`
        : `  MODO FAIL-FAST activo: nenhum FAIL, logo a suite correu inteira (${contagem()} testes).`
    );
  }
  console.log(`  ${passed} passaram, ${failures.length} falharam.`);
  if (failures.length) {
    console.log("\n--- Detalhe das falhas ---");
    for (const f of failures) {
      console.log(`\n[${f.name}]`);
      for (const p of f.problems) console.log(`  ${p}`);
      console.log(f.out.split("\n").map((l) => `    | ${l}`).join("\n"));
    }
    console.log("");
    process.exit(1);
  }
  console.log("\nTodos os testes dos guards passaram.\n");
  process.exit(0);
}
