/**
 * Registo de suites por DESCOBERTA em disco.
 *
 * PORQUE EXISTE (AP4, invariante 2 — "estreitar a seleccao do runner"):
 * os entry points chamavam cada modulo a mao (`registarBypasses(...)`, `registarBudgets()`).
 * Essas chamadas ERAM a seleccao do runner deste repo, e nada as contava. Medido numa
 * auditoria: comentar UMA linha em `.claude/hooks/tests/test-hooks.mjs` levava a suite de
 * **156 para 39 testes**, com `exit 0` e a imprimir "Todos os testes dos hooks passaram";
 * o mesmo em `test-guards.mjs` (172 -> 159). O `check-test-surface.mjs` nao via nada: o
 * numero de `test(` dentro dos `tests-*.mjs` nao desce quando ninguem os chama.
 *
 * A resposta certa e a que o proprio `AP4` prescreve — **retirar a capacidade, nao pedir
 * contencao**. Aqui nao ha linha para comentar: os modulos sao lidos do disco. Acrescentar
 * um `tests-*.mjs` passa a ser suficiente para ele correr; apaga-lo e a unica forma de o
 * tirar da suite, e isso o `check-test-surface.mjs` ja ve.
 *
 * Falha SEMPRE fechado (AP2): zero modulos descobertos, um modulo sem `registar()`, ou um
 * modulo que nao contribui nenhum teste sao todos `exit 1` com a razao dita — nunca um
 * "nao havia nada a correr" silencioso.
 */
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

/** Recusa com a razao e o que fazer. Nunca "passa por nao ter conseguido medir". */
function fatal(msg) {
  console.error(`\nFALHA no registo de suites: ${msg}\n`);
  process.exit(1);
}

/** Os modulos de teste ao lado do entry point, por ordem estavel (o output e comparado
 *  entre corridas). Nao segue subpastas: um `tests-*.mjs` vive sempre ao lado de quem o
 *  corre. */
export function descobreModulos(dir) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // "Nao consegui ler" != "nao ha nada" — o AP2 em forma pura.
    fatal(`nao consegui ler ${dir}: ${err.message}`);
  }
  return entradas
    .filter((e) => e.isFile() && /^tests-.*\.mjs$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Importa e regista todos os modulos descobertos.
 *
 * @param {object}   o
 * @param {string}   o.dir       pasta do entry point (normalmente `dirname(fileURLToPath(import.meta.url))`)
 * @param {object}   o.ctx       contexto passado a cada `registar(ctx)`. Modulos que nao
 *                               precisem dele ignoram o argumento — e por isso que os dois
 *                               formatos historicos (`registar()` e `registar({...})`)
 *                               convivem sem cada entry point ter de saber qual e qual.
 * @param {Function} o.contagem  devolve o total de testes ja corridos. E como se mede o
 *                               contributo de cada modulo — sem isto, um modulo cujo
 *                               `registar()` rebentasse a meio passaria por registado.
 * @returns {Promise<string[]>}  nomes dos modulos registados
 */
export async function registaDescobertos({ dir, entryPoint, ctx = {}, contagem, conhecidos }) {
  if (typeof contagem !== "function") fatal("registaDescobertos precisa de `contagem()` para medir o contributo de cada modulo");
  if (!entryPoint) fatal("registaDescobertos precisa de `entryPoint` — sem ele nao sabe que modulos sao seus");
  // `conhecidos` era OPCIONAL (`if (conhecidos && ...)`), logo um entry point que o
  // esquecesse perdia a rede em silencio. Medido: apagar a linha `conhecidos:` e escrever
  // `test-guardz.mjs` num modulo levava a suite de 196 para 133 testes, com exit 0 e "todos
  // passaram". Uma rede opcional nao e uma rede.
  if (!Array.isArray(conhecidos) || conhecidos.length === 0) {
    fatal("registaDescobertos precisa de `conhecidos` — a lista dos entry points do repo. Sem ela, um `entryPoint` mal escrito desliga uma suite em silencio");
  }

  const nomes = descobreModulos(dir);
  if (nomes.length === 0) {
    fatal(
      `nao descobri nenhum \`tests-*.mjs\` em ${dir}.\n` +
        `  Ou a pasta mudou de sitio, ou a convencao de nomes mudou. Enquanto isto nao for\n` +
        `  resolvido a suite estaria a correr menos do que diz — logo reprova em vez de passar.`
    );
  }

  const registados = [];
  const deOutros = [];
  for (const nome of nomes) {
    let mod;
    try {
      mod = await import(pathToFileURL(join(dir, nome)).href);
    } catch (err) {
      fatal(`${nome} nao importa: ${err.message}`);
    }

    // `entryPoint` e obrigatorio em cada modulo: dois entry points partilham a pasta
    // `.agent/scripts/` e sem a declaracao cada um apanhava os modulos do outro. Filtrar
    // por heuristica de nome seria adivinhar; um modulo que nao declare nada reprova, para
    // nao poder ser silenciosamente ignorado por nenhum dos dois.
    if (typeof mod.entryPoint !== "string" || !mod.entryPoint) {
      fatal(
        `${nome} nao exporta \`entryPoint\`.\n` +
          `  Cada modulo declara a que entry point pertence (ex: export const entryPoint = "test-guards.mjs").\n` +
          `  Sem isso, um modulo novo ficaria por correr sem ninguem notar.`
      );
    }
    if (mod.entryPoint !== entryPoint) {
      // Um modulo declarado para OUTRO entry point e legitimo — os dois partilham a pasta.
      // Mas um `entryPoint` que nao corresponde a entry point NENHUM significa que o modulo
      // nao e corrido por ninguem, e isso nao pode ser silencioso: era o mesmo buraco que
      // este ficheiro veio fechar, com outro caractere. Medido por uma leitura independente:
      // trocar `"test-guards.mjs"` por `"test-guard.mjs"` num modulo levava a suite de 188
      // para 171 testes, com `exit 0` e "Todos os testes dos guards passaram".
      // Tambem reprova quando o entry point declarado e conhecido mas vive NOUTRA PASTA: o
      // modulo nunca seria descoberto por ele (a descoberta e por pasta), logo nao corre em
      // lado nenhum. Medido: `tests-budgets.mjs` a declarar `test-hooks.mjs` levava a suite
      // de 196 para 179, verde, e o `test-hooks` nao o apanhava porque esta noutra pasta.
      // O criterio e "existe como ficheiro NESTA pasta", nao um padrao de nome: a descoberta
      // e por pasta, logo um modulo cujo entry point declarado nao esta aqui nao e corrido
      // por ninguem. Um padrao de nome assumiria a convencao e partia em fixtures legitimas.
      const aqui = existsSync(join(dir, mod.entryPoint));
      if (!conhecidos.includes(mod.entryPoint) || !aqui) {
        fatal(
          `${nome} declara \`entryPoint: "${mod.entryPoint}"\`, que nao e um entry point DESTA pasta.\n` +
            `  Conhecidos no repo: ${conhecidos.join(", ")}. Existe nesta pasta: ${aqui ? "sim" : "NAO"}.\n` +
            `  Um modulo com um entry point que nao existe nao e corrido por ninguem — e um\n` +
            `  erro de escrita desliga a suite inteira em silencio.`
        );
      }
      deOutros.push(nome);
      continue;
    }

    if (typeof mod.registar !== "function") {
      fatal(`${nome} nao exporta \`registar()\` — todo o modulo \`tests-*.mjs\` tem de o exportar`);
    }

    const antes = contagem();
    mod.registar(ctx);
    const depois = contagem();
    if (depois === antes) {
      fatal(
        `${nome} nao registou nenhum teste.\n` +
          `  Um modulo de testes que nao corre nada e ruido que da falsa cobertura: ou tem\n` +
          `  testes, ou nao existe.`
      );
    }
    registados.push(nome);
  }

  if (registados.length === 0) {
    fatal(
      `nenhum dos ${nomes.length} modulo(s) em ${dir} declara \`entryPoint: "${entryPoint}"\`.\n` +
        `  Um entry point sem modulos proprios estaria a correr so os seus testes inline e a\n` +
        `  dizer que correu tudo — reprova em vez de passar (AP2).`
    );
  }
  return { registados, deOutros };
}

/** Linha de rodape para o entry point dizer o que correu. Sem isto, a descoberta e
 *  invisivel e ninguem nota que um modulo deixou de ser encontrado. */
export function resumoDescoberta(registados, deOutros = []) {
  const meus = `  (${registados.length} modulo(s) de teste descoberto(s): ${registados.join(", ")})`;
  // `deOutros` era construido e nunca lido — a mitigacao chegou a ser escrita e ficou pelo
  // caminho. Um modulo saltado tem de ser VISIVEL, mesmo quando o salto e legitimo.
  return deOutros.length ? `${meus}\n  (${deOutros.length} de outro entry point: ${deOutros.join(", ")})` : meus;
}
