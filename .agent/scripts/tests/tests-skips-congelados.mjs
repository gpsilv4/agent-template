/**
 * O conjunto de `SKIP` da fixture sa esta CONGELADO — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-guards.mjs` importa e chama `registar()`.
 *
 * PORQUE EXISTE, e e a parte deste ticket que vale mais do que derivar listas: um guard que
 * SALTA passa por verde. Nao ha vermelho, nao ha aviso, o ecra diz "todos passaram" — e o
 * guard nunca correu.
 *
 * Aconteceu de facto. A lista de ficheiros que a sandbox sintetica copia e escrita a mao, e
 * quando lhe faltou o `src/docs/anti-patterns-why.md` o **Guard 18 deu SKIP em TODOS os
 * testes**. O comentario ao lado dessa lista ainda o regista: *"um guard que salta sempre passa
 * por verde sem nunca ter sido medido"*. Nada o apanhou na altura; apanhou-se a olho.
 *
 * As outras duas vezes que a mesma lista envelheceu falharam ALTO (o Guard 20 a avisar em todos
 * os testes, sete vermelhos de uma vez ao criar o `review-why.md`). Foi sorte: depende de o
 * guard em causa ter uma forma ruidosa de falhar. Este teste tira a sorte da equacao.
 *
 * PORQUE E UMA LISTA CONGELADA E NAO "ZERO SKIPS": nove sao legitimos e medidos — dois
 * ficheiros que o bootstrap gera e ainda nao existem (contados duas vezes, por serem tambem
 * `@import`), o Guard 3 sem `package.json`, o Guard 4 com a lista de termos banidos vazia, o
 * Guard 13 antes do bootstrap, o Guard 16 sem servidor MCP, e os guards de versoes de
 * dependencias com a lista de opt-in vazia. Um teste que exigisse zero seria desligado no
 * mesmo dia.
 *
 * E uma catraca, como os `TETOS` do Guard 17: congela o medido, e um `SKIP` NOVO fica vermelho
 * e nomeia-se. Um que DESAPARECA tambem — se um guard deixou de saltar, ou passou a medir mais
 * (bom, e a entrada sai da lista) ou a fixture mudou de forma (mau, e quer-se saber).
 */
import { pathToFileURL } from "url";
import { existsSync } from "fs";
import { join } from "path";
import { sandbox, runGuard, registarResultado } from "./harness/test-harness.mjs";
import { bootstrapado, comoTemplate } from "./harness/projeto-derivado.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-skips-congelados.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-guards.mjs";

/** Os `SKIP` que a fixture sa produz, com a RAZAO de cada um — sem ela, a proxima pessoa nao
 *  sabe qual pode desaparecer nem porque. Guardam-se por um fragmento estavel da mensagem: a
 *  frase inteira muda quando alguem a melhora, e um teste que reprove por isso e ruido.
 *
 *  SAO DOIS CONJUNTOS PORQUE HA DOIS ESTADOS, e a primeira versao deste modulo so conhecia um:
 *  assumia o template, e no `simulate-derived` ficou vermelha. `TP3` — o teste lia o estado do
 *  repo em vez de o montar, e a diferenca e exactamente de um: num derivado o Guard 13 deixa de
 *  saltar (o bootstrap correu) e o Guard 21 passa a saltar (aqueles ficheiros sao o estado do
 *  projeto). Nove dos dois lados, um trocado pelo outro. */
const COMUNS = [
  // A fixture nao tem app, nos dois estados.
  { chave: "Guard 3 (versoes) — sem package.json", vezes: 1 },
  { chave: "Guards de versoes de dependencias", vezes: 1 },
  // Listas de opt-in vazias: nem termos banidos proprios nem servidor MCP.
  { chave: "Guard 4 (termos banidos) — lista BANNED vazia", vezes: 1 },
  { chave: "Guard 16 (politica MCP) — nenhum servidor configurado", vezes: 1 },
];

/** As rules que a Fase 2.2 do bootstrap GERA. Se existem na sandbox, os guards leem-nas e nao
 *  saltam; se nao existem, saltam duas vezes cada — uma pelo ficheiro, outra pelo `@import` que
 *  o CLAUDE.md lhe faz.
 *
 *  DERIVADO DO DISCO, e nao escrito na lista congelada: e um eixo INDEPENDENTE do marcador de
 *  derivado, e foi o que fez a primeira versao deste modulo reprovar no `simulate-derived`. A
 *  `FIXTURE_PATHS` copia `.agent/rules` como PASTA, logo num repo derivado — onde o bootstrap
 *  ja as gerou — elas vao para a sandbox e os quatro `SKIP` desaparecem. Congelar a expectativa
 *  era congelar o estado deste repo, que e o `TP3` que este proprio ticket combate. */
const GERADAS_NO_BOOTSTRAP = ["business-logic.md", "pages-architecture.md"];
const porGerar = (dir) =>
  GERADAS_NO_BOOTSTRAP.filter((f) => !existsSync(join(dir, ".agent/rules", f))).map((f) => ({
    chave: `${f} — gerado no bootstrap`,
    vezes: 2,
  }));

/** O que distingue os dois estados, e e a medida do `ehDerivado()` vista pelos guards. */
const SO_TEMPLATE = [{ chave: "Guard 13 (placeholders) — bootstrap ainda nao correu", vezes: 1 }];
const SO_DERIVADO = [{ chave: "Guard 21 (.agent/context/ por estrear) — projeto derivado", vezes: 1 }];

export function registar() {
  /** Monta um estado, corre a bateria, e afirma sobre o conjunto de `SKIP` que ele produz. */
  const mede = (rotulo, montar, esperados) => {
    const dir = sandbox();
    montar(dir);
    const out = runGuard(dir).out ?? "";
    const linhas = out.split("\n").filter((l) => /\bSKIP\b/.test(l));
    const esp = [...esperados, ...porGerar(dir)];
    const afirma = (nome, problemas) => registarResultado(`skips (${rotulo}): ${nome}`, problemas, out);

    // 1. Nenhum SKIP a mais. E este que apanha a fixture incompleta: um ficheiro que falte faz o
    //    guard que o le saltar, e o salto aparece aqui com o nome dele.
    afirma("nenhum guard salta alem dos que a fixture justifica", linhas
      .filter((l) => !esp.some((e) => l.includes(e.chave)))
      .map((l) => `SKIP inesperado — ou a fixture esta incompleta, ou e legitimo e falta na lista: ${l.trim()}`));

    // NAO HA assercao "os esperados continuam todos la", e a ausencia dela e deliberada.
    //
    // Ela existiu, e foi REMOVIDA depois de tres falsos alarmes e zero achados. Falhava sempre
    // que um guard deixava de saltar por uma razao legitima, e as razoes sao eixos
    // independentes que se vao acumulando: o marcador de derivado (Guard 13 vs 21), as rules
    // que o bootstrap gera, e as listas de opt-in que um projeto preenche (o `BANNED` do
    // Guard 4, no passo do derivado que CONFIGUROU). Cada uma pedia a sua derivacao, e a
    // seguinte apareceria na mesma.
    //
    // E a direccao errada: **um guard que DEIXA de saltar passou a medir**, o que e bom. O
    // defeito que este modulo existe para apanhar e o inverso — um guard que COMECA a saltar
    // porque a fixture ficou incompleta, e le-se como verde. Esse e o ponto 1, e esse mede.
    //
    // O que se perde, dito por inteiro: uma entrada desta lista pode ficar obsoleta sem nada o
    // denunciar. E rot inofensivo — permite um `SKIP` que ja nao acontece — e o preco de um
    // aviso que saia sempre e mais alto: treina quem o le a ignora-lo.

    // 3. O CONTRA-CASO, e sem ele os dois de cima eram satisfeitos por um `out` vazio — o `TP2`
    //    a entrar pela porta do lado.
    afirma("a fixture produz de facto os skips que se medem", linhas.length > 0 ? [] : ["zero SKIP no output — o guard correu?"]);
  };

  // OS DOIS ESTADOS, montados e nao herdados. Correr so um foi o defeito da primeira versao.
  mede("template", comoTemplate, [...COMUNS, ...SO_TEMPLATE]);
  mede("derivado", bootstrapado, [...COMUNS, ...SO_DERIVADO]);
}
