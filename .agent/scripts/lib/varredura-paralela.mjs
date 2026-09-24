/**
 * O motor de medicao da varredura de mutacao — {{PROJECT_NAME}}
 *
 * Extraido do `mutation-sweep.mjs` quando este passou as 500 linhas (Guard 17). A fronteira nao e
 * so de tamanho, e a mesma do `lib/upgrade-mecanico.mjs`: **este modulo MEDE, quem o chama JULGA
 * e REPORTA**. Ele nao sabe o que e um veredicto, nao imprime nada e nao decide exit codes —
 * devolve numeros. Assim pode ser exercitado sem montar uma varredura inteira.
 *
 * PORQUE E PARALELO, e o que isso nao muda: os sitios sao embaracosamente independentes — cada um
 * e "desliga esta linha, corre esta suite, ve se fica vermelha". Corriam em serie por nenhuma
 * razao. Cada medicao continua a lancar um `node` real e a ler um exit code real do sistema;
 * **nenhuma assercao enfraquece**. O que se paralelizou foi a espera.
 *
 * PORQUE UMA COPIA POR WORKER — e esta e a linha que tem de existir ANTES do paralelismo, nao
 * depois: dois workers a mutarem ficheiros DIFERENTES da mesma arvore pisam-se entre a escrita e
 * a leitura. Foi medido num prototipo com 17 sitios e 8 workers: **11 alvos contaminados e 2
 * veredictos errados**, todos falsos `INCOMPLETA` — ou seja, a acusar cobertura que existe. Com
 * uma copia por worker: zero contaminacoes, e output byte-a-byte igual ao sequencial em 6
 * corridas repetidas.
 *
 * O custo dessa correccao: o repo sao ~1 MB e uma copia demora 0,06s. A copia unica nunca foi
 * optimizacao — era 0,03% do tempo de corrida, e pagava-se em correccao do resultado. Um vermelho
 * que nao e real ensina a re-correr em vez de investigar, e ai a rede deixou de valer.
 *
 * O QUE MANTEM O RESULTADO DETERMINISTICO: os sitios sao enumerados **antes** de haver
 * concorrencia, e cada resultado e indexado por `(alvo, linha)`. A ordem por que os workers
 * acabam nunca entra no que se devolve.
 *
 * A INVARIANTE DE QUE ISTO DEPENDE — que as suites sao isoladas umas das outras (tmpdir proprio,
 * sem portas, sem escrita em `process.env`) — era verdade por acidente e nada a verificava. Passou
 * a ser o **Guard 19** (`guards/isolamento.mjs`).
 */

import { writeFileSync } from "fs";
import { execFile } from "child_process";
import { cpus } from "os";
import { join } from "path";

/** Quantos processos em paralelo, a partir do que o utilizador pediu.
 *
 *  Medido neste repo: a curva satura a ~3,9x e o gargalo **nao e CPU** — cada teste faz `mkdtemp`
 *  mais a copia de ~150 ficheiros, logo e metadata de filesystem, que mais cores nao compram.
 *  Acima de 8 paga-se oversubscricao por ~7% de ganho.
 *
 *  `1` devolve o comportamento sequencial por inteiro, e existe para quem precise de comparar um
 *  resultado sem mudar mais nada. */
export function quantosWorkers(pedido) {
  const n = Number(pedido);
  return Math.max(1, Math.min(8, Number.isFinite(n) && n > 0 ? n : cpus().length || 1));
}

/** Corre uma suite e diz se passou. Nunca lanca: "falhou" e um resultado, nao um acidente. */
const passa = (suiteCopia, cwd) =>
  new Promise((resolve) => {
    execFile("node", [suiteCopia], { cwd }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: (stdout ?? "") + (stderr ?? "") })
    );
  });

/** A PROVA de que a suite ficou vermelha porque um TESTE apanhou a mutacao, e nao porque
 *  rebentou. As treze suites deste repo imprimem a mesma forma — medido, nao assumido. */
const PROVA_DE_FALHA = /^\s*FAIL\s/m;

/** N tarefas de cada vez, cada worker com um indice FIXO — e o indice e que lhe da a copia.
 *  Sem indice fixo, duas tarefas concorrentes podiam cair na mesma arvore, que e precisamente a
 *  contaminacao que este desenho existe para evitar. */
export async function emParalelo(lista, n, fn) {
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, lista.length) }, async (_, w) => {
      for (let k = proximo++; k < lista.length; k = proximo++) await fn(lista[k], w);
    })
  );
}

/**
 * Mede a cobertura de mutacao dos alvos de `medir`.
 *
 * @param medir   alvos ja resolvidos: `{ alvo, suite, src, linhas, visiveis, sitios, sinal, neutro }`.
 *                Tudo o que se decide SEM correr nada (alvo ausente, sinal errado, sem suite,
 *                linha ambigua) ja foi decidido por quem chama — aqui so entra o que e para medir.
 * @param copias  uma copia do repo por worker. `copias.length` **e** o grau de paralelismo.
 * @returns {Promise<{baselinesVermelhas: Array<{suite, falhas: string[]}>, resultados: Array<{alvo, suite, total, naoCobertos}>}>}
 *          `resultados` vem na ordem de `medir` — nunca na ordem por que os workers acabaram.
 */
export async function medeCobertura({ medir, copias }) {
  const workers = copias.length;

  // --- 1. Baselines, uma por SUITE -------------------------------------------
  // A baseline e a mesma medicao para todos os alvos que partilham a suite, e corria uma vez por
  // ALVO: no repo real sao 28 alvos para 10 suites distintas — **18 corridas a medir o que ja
  // tinha sido medido**, das quais 10 do `test-guards.mjs` (~28s cada), perto de cinco minutos.
  //
  // Vem antes da fila: um alvo cuja suite ja esta vermelha nao se mede de todo, e sabe-lo primeiro
  // evita gastar workers a produzir vermelhos que nao significam nada.
  const suites = [...new Set(medir.map((m) => m.suite))];
  const baseline = new Map();
  await emParalelo(suites, workers, async (suite, w) => {
    // GUARDA-SE O `{ok, out}` INTEIRO, e nao so o `.ok`. O `passa()` devolve o texto da corrida
    // desde o #114, e este `.ok` deitava-o fora AQUI — quando chegava ao reporte ja so havia
    // nomes de suite, e a mensagem `BASELINE VERMELHA` so podia dizer que algo falhou, nunca o
    // que. A unica accao disponivel perante ela era RECORRER, que e o habito que um falso
    // vermelho num portao ensina.
    baseline.set(suite, await passa(join(copias[w], suite), copias[w]));
  });

  // Leva a RAZAO consigo, ja extraida. A extraccao vive aqui e nao em quem reporta porque e
  // MEDICAO — ler o output e dele tirar as linhas que interessam. O cabecalho do `mede()` no
  // `mutation-sweep.mjs` diz onde fica a fronteira: a medicao em `lib/`, a decisao sobre o que
  // cada numero significa la, que e onde vive o exit code. Deixar o filtro la passava o ficheiro
  // das 500 linhas do Guard 17, e teria sido a razao errada para o dividir.
  //
  // O TECTO DE CINCO e deliberado: uma suite vermelha pode ter dezenas de falhas, e despejar
  // todas afoga o resto do relatorio. Cinco chegam para reconhecer a causa; quem quiser o resto
  // corre a suite.
  const baselinesVermelhas = suites
    .filter((s) => !baseline.get(s).ok)
    .map((suite) => ({
      suite,
      falhas: (baseline.get(suite).out ?? "").split("\n").filter((l) => PROVA_DE_FALHA.test(l)).slice(0, 5).map((l) => l.trim()),
    }));
  const medidos = medir.filter((m) => baseline.get(m.suite).ok);

  // --- 2. A fila de (alvo, sitio) --------------------------------------------
  // Por ITEM e nao por alvo: por alvo, o maior sozinho (`guards/settings.mjs`, 22 sitios) fixava um
  // tecto de ~11 minutos que nenhum outro worker podia ajudar a baixar.
  const itens = medidos.flatMap((m, t) => m.sitios.map((i) => ({ t, i })));
  const naoCobertos = medidos.map(() => []);

  await emParalelo(itens, workers, async ({ t, i }, w) => {
    const m = medidos[t];
    const alvoCopia = join(copias[w], m.alvo);
    const mut = [...m.linhas];
    // Mutar pelo INDICE achado na linha sem strings, e nao por `replace` sobre a original: assim a
    // substituicao acerta sempre na chamada e nunca num literal de texto.
    const match = m.visiveis[i].match(m.sinal);
    mut[i] = m.linhas[i].slice(0, match.index) + m.neutro + m.linhas[i].slice(match.index + match[0].length);
    writeFileSync(alvoCopia, mut.join("\n"));
    const r = await passa(join(copias[w], m.suite), copias[w]);
    const ficouVermelha = !r.ok;
    // Repor ANTES de o worker pegar no item seguinte: o proximo item pode ser de outro alvo, e
    // uma copia deixada suja envenenava-o.
    writeFileSync(alvoCopia, m.src);
    const entrada = { ln: i + 1, txt: m.linhas[i].trim().slice(0, 90) };
    if (!ficouVermelha) naoCobertos[t].push(entrada);
    else if (!PROVA_DE_FALHA.test(r.out)) {
      // Vermelha SEM um unico `FAIL`: a suite rebentou, nao houve teste a apanhar nada. Contar
      // isto como cobertura e o defeito que o `pares.mjs` ja documentou duas vezes.
      console.log(`  REBENTOU  ${m.alvo}:${i + 1} saiu != 0 sem nenhum FAIL — nao e cobertura`);
      naoCobertos[t].push({ ...entrada, motivo: "rebentou" });
    }
  });

  return {
    baselinesVermelhas,
    resultados: medidos.map((m, t) => ({
      alvo: m.alvo,
      suite: m.suite,
      total: m.sitios.length,
      // Ordenado por linha: a ordem de conclusao dos workers nao pode aparecer no relatorio, senao
      // duas corridas da mesma arvore deixam de se poder comparar com um `diff`.
      naoCobertos: naoCobertos[t].sort((a, b) => a.ln - b.ln),
    })),
  };
}
