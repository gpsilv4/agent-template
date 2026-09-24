/**
 * Testes do Guard 21 (no template, `.agent/context/` esta por estrear) — {{PROJECT_NAME}}
 *
 * Espelha `guards/context-virgem.mjs`. NAO e um entry point: o `test-guards.mjs` importa e
 * chama `registar()`.
 *
 * O QUE ESTE GUARD DEFENDE nao e visivel neste repo: e a promessa de que um projeto criado a
 * partir daqui nasce vazio. A falha nao produz nada de errado no template — produz um derivado
 * com o trabalho de outra pessoa dentro, e ninguem repara ate o criar. Por isso o controlo
 * negativo abaixo e o teste mais importante do ficheiro: ele prova que, ANTES do Guard 21, a
 * bateria inteira dava verde sobre um `implementation_plan.md` com 189 linhas de planeamento.
 */
import { rmSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync } from "fs";
import { pathToFileURL } from "url";
import { join } from "path";
import { tmpdir } from "os";
import { test, file, readF, writeF, GUARD, recongelarContexto, registarResultado } from "./harness/test-harness.mjs";
import { comoTemplate } from "./harness/projeto-derivado.mjs";
// A receita do "bootstrap concluido" vive no harness: estava escrita aqui E no
// `tests-placeholders.mjs`, a concordar a mao, e a lista de extensoes ja divergiu uma vez (`TP8`).
import { bootstrapado as derivado } from "./harness/projeto-derivado.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-context-virgem.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .agent/scripts/tests/test-guards.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. Ver `lib/registo.mjs`. */
export const entryPoint = "test-guards.mjs";

/** O ficheiro que foi de facto poluido na sessao que originou este guard. */
const ALVO = ".agent/context/implementation_plan.md";

/** O despejo, com a FORMA do que la foi escrito: planeamento de tickets, com IDs e caminhos.
 *  Nao e "texto qualquer" de proposito — um lorem ipsum nao teria apanhado o caso em que o
 *  conteudo se parece com o andaime. */
const PLANEAMENTO = [
  "",
  "## Sprint 3 — Fechar a rede dos guards",
  "",
  "| Ordem | ID | Descricao | Esforco |",
  "|-------|----|-----------|---------|",
  "| 1 | B12 | Guard que verifica a fronteira de escrita | M |",
  "| 2 | T4 | Fail-fast na varredura de mutacao | L |",
  "",
  "**Decisao**: comecar pelo B12 porque o T4 depende da medicao dele.",
  "",
].join("\n");

/**
 * Monta, na sandbox, a pre-condicao de que o Guard 21 depende: **este repo e o template**.
 *
 * PORQUE E OBRIGATORIO EM TODOS OS TESTES QUE ESPERAM AVISO (`TP3`): a sandbox e uma copia do
 * REPO, e o `ehDerivado()` tem dois sinais — o marcador presente, **ou** o `BOOTSTRAP.md`
 * ausente. Num projeto derivado que apagou o `BOOTSTRAP.md` (o bootstrap manda apaga-lo), a
 * copia satisfaz o segundo sinal, o guard salta, e todo o teste que espera WARN falha.
 *
 * Nao e teorico: verde no template nu, **vermelho no `simulate-upgrade.mjs`** — que monta um
 * consumidor a serio. O `tests-placeholders.mjs` traz a mesma cicatriz escrita no cabecalho do
 * seu primeiro teste, e eu repeti-a.
 *
 * As TRES coisas andam juntas e nenhuma chega sozinha:
 *   1. tirar o marcador;
 *   2. garantir o `BOOTSTRAP.md` (senao o segundo sinal continua a dizer "derivado");
 *   3. **re-congelar** — num derivado estes ficheiros tem conteudo do projeto, e sem isto o
 *      guard passava a avisar dos nove de uma vez, afogando o aviso que o teste afirma.
 *
 * Chama-se SEMPRE antes da mutacao: re-congelar depois de acrescentar ou apagar um ficheiro
 * congelava o proprio defeito que o teste quer ver.
 */

export function registar() {
  // --- O caso que originou o guard -------------------------------------------
  test("G21: planeamento despejado no implementation_plan.md avisa", (dir) => {
    comoTemplate(dir);
    writeF(dir, ALVO, readF(dir, ALVO) + PLANEAMENTO);
  }, {
    code: 1,
    includes: [`${ALVO}: DEIXOU DE ESTAR POR ESTREAR`, "Trabalho pendente vive num ISSUE"],
  });

  // --- CONTROLO NEGATIVO PERMANENTE ------------------------------------------
  // Sem isto, o teste de cima podia estar a ser satisfeito por qualquer outra verificacao
  // (`TP1`) — e a afirmacao que importa ("nada apanhava isto") ficava por medir. Aqui
  // remove-se a CHAMADA do Guard 21 do orquestrador na sandbox, deixando tudo o resto de pe,
  // e exige-se que a mesma poluicao saia VERDE. E a medida exata do buraco que este ticket
  // fecha.
  //
  // A linha do comentario `// --- Guard 21:` fica: e dela que o Guard 12d deriva a contagem
  // de guards numerados, e removendo-a o teste ficaria vermelho pela razao errada (a citacao
  // do numero de guards numerados deixaria de bater). O numero NAO se escreve aqui: escrito,
  // era mais uma copia a mao a envelhecer — esta dizia 28 quando ja eram 29.
  test("G21: [controlo negativo] sem o Guard 21, a mesma poluicao sai VERDE", (dir) => {
    comoTemplate(dir);
    writeF(dir, ALVO, readF(dir, ALVO) + PLANEAMENTO);
    const src = readF(dir, GUARD);
    const semChamada = src.replace(/^guardsRun \+= guardContextVirgem\(.*\n/m, "");
    if (semChamada === src) {
      throw new Error("nao encontrei a chamada `guardsRun += guardContextVirgem(` — mudou de forma");
    }
    writeF(dir, GUARD, semChamada);
  }, {
    // Exit 0 e zero avisos novos: a bateria INTEIRA, menos o Guard 21, nao ve as 10 linhas de
    // planeamento. Se um dia outro guard passar a ve-las, este teste fica vermelho e a
    // justificacao do Guard 21 tem de ser reescrita — que e o comportamento correcto.
    code: 0,
    excludes: ["DEIXOU DE ESTAR POR ESTREAR"],
  });

  // --- O caso que um TECTO DE BYTES nao apanharia ----------------------------
  // A alternativa considerada no cabecalho do guard era um limite de bytes por ficheiro. Este
  // teste e a medida de porque nao: o andaime e substituido por conteudo do MESMO tamanho, e um
  // tecto de bytes daria verde. O hash nao.
  test("G21: conteudo do mesmo tamanho que o andaime tambem avisa", (dir) => {
    comoTemplate(dir);
    const original = readF(dir, ALVO);
    // Mesmo numero de bytes, conteudo completamente diferente.
    const poluido = ("Plano do sprint 3: fechar a rede dos guards. Ver o issue B12 e o T4. ".repeat(20)).slice(0, Buffer.byteLength(original, "utf8"));
    if (Buffer.byteLength(poluido, "utf8") !== Buffer.byteLength(original, "utf8")) {
      throw new Error("a fixture nao conseguiu igualar o tamanho — o teste mediria outra coisa");
    }
    writeF(dir, ALVO, poluido);
    return { includes: [`${Buffer.byteLength(original, "utf8")} bytes`] };
  }, { code: 1, includes: [`${ALVO}: DEIXOU DE ESTAR POR ESTREAR`] });

  // --- O conjunto e FECHADO --------------------------------------------------
  test("G21: ficheiro novo em .agent/context/ sem entrada avisa", (dir) => {
    comoTemplate(dir);
    writeF(dir, ".agent/context/plano-do-sprint.md", "# Plano\n\nTickets B12 e T4.\n");
  }, { code: 1, includes: [".agent/context/plano-do-sprint.md: ficheiro em .agent/context/ sem entrada em PRISTINOS"] });

  // A extensao nao pode ser a fronteira: quem despeja notas nao se limita a `.md`.
  test("G21: ficheiro sem extensao .md na pasta tambem e apanhado", (dir) => {
    comoTemplate(dir);
    writeF(dir, ".agent/context/notas.txt", "notas soltas do sprint\n");
  }, { code: 1, includes: [".agent/context/notas.txt: ficheiro em .agent/context/ sem entrada em PRISTINOS"] });

  // ...mas o ruido do SISTEMA OPERATIVO nao e conteudo, e reprova-lo era ensinar a ignorar o
  // guard: basta uma visita do Finder. O contra-caso esta logo abaixo — o filtro nao pode ser
  // tao largo que deixe passar um ficheiro a serio.
  test("G21: ruido do SO em .agent/context/ nao e falso positivo", (dir) => {
    comoTemplate(dir);
    writeF(dir, ".agent/context/.DS_Store", "\0ruido do Finder\0");
    writeF(dir, ".agent/context/Thumbs.db", "ruido do Explorer");
    writeF(dir, ".agent/context/.session.md.swp", "swap do vim");
    writeF(dir, ".agent/context/task.md~", "backup do editor");
  }, { code: 0, includes: ["9 ficheiros de .agent/context/ por estrear"], excludes: ["sem entrada em PRISTINOS"] });

  test("G21: [contra-prova] o filtro de ruido nao deixa passar um ficheiro a serio", (dir) => {
    comoTemplate(dir);
    writeF(dir, ".agent/context/.DS_Store", "ruido");
    writeF(dir, ".agent/context/plano.md", "# Plano\n\nSprint 3: B12 e T4.\n");
  }, { code: 1, includes: [".agent/context/plano.md: ficheiro em .agent/context/ sem entrada em PRISTINOS"] });

  // A varredura desce: uma subpasta era o esconderijo obvio.
  test("G21: ficheiro numa SUBPASTA de .agent/context/ e apanhado", (dir) => {
    comoTemplate(dir);
    writeF(dir, ".agent/context/rascunhos/plano.md", "# Rascunho\n\nFase 0 do B12.\n");
  }, { code: 1, includes: [".agent/context/rascunhos/plano.md: ficheiro em .agent/context/ sem entrada em PRISTINOS"] });

  // --- O inverso: entrada congelada sem ficheiro -----------------------------
  // Sem este ramo, apagar um ficheiro de contexto do template saia calado e cada derivado
  // nascia sem ele.
  test("G21: ficheiro de contexto APAGADO avisa (nao passa calado)", (dir) => {
    comoTemplate(dir);
    rmSync(file(dir, ".agent/context/walkthrough-archive.md"));
  }, {
    // O `walkthrough-archive.md` e dos que NAO estao importados no CLAUDE.md, de proposito:
    // com um ficheiro importado, o aviso do Guard 8 satisfazia a assercao sozinho (`TP1`) e
    // este ramo podia ser apagado sem nada ficar vermelho.
    code: 1,
    includes: [".agent/context/walkthrough-archive.md: congelado em PRISTINOS mas NAO EXISTE em disco"],
  });

  test("G21: pasta .agent/context/ inteira ausente avisa (nao e SKIP)", (dir) => {
    comoTemplate(dir);
    rmSync(file(dir, ".agent/context"), { recursive: true });
  }, { code: 1, includes: [".agent/context/ NAO EXISTE"] });

  // --- Num projeto DERIVADO o guard nao tem sentido --------------------------
  // E o ponto onde um guard mal desenhado poria o CI de todos os consumidores vermelho: la,
  // estes ficheiros DEVEM ter conteudo.
  test("G21: num projeto DERIVADO com contexto preenchido da SKIP visivel", (dir) => {
    derivado(dir);
    writeF(dir, ALVO, readF(dir, ALVO) + PLANEAMENTO);
    writeF(dir, ".agent/context/session.md", "# Session\n\nSprint 3 em curso, B12 a meio.\n");
  }, {
    code: 0,
    includes: ["SKIP  Guard 21 (.agent/context/ por estrear) — projeto derivado"],
    excludes: ["DEIXOU DE ESTAR POR ESTREAR"],
  });

  // --- Um clone Windows nao pode ficar vermelho ------------------------------
  // Sem a normalizacao de CRLF, um clone com `core.autocrlf=true` mudava o hash de TODOS os
  // nove ficheiros e o guard reprovava pela plataforma de quem o corre. Mesma armadilha que o
  // `guards/budgets.mjs` ja documenta para a contagem de bytes.
  test("G21: clone com line endings do Windows nao fica vermelho", (dir) => {
    comoTemplate(dir);
    for (const f of readdirSync(file(dir, ".agent/context"))) {
      const p = file(dir, `.agent/context/${f}`);
      const b = readFileSync(p, "utf8");
      if (!b.includes("\r\n")) writeFileSync(p, b.replace(/\n/g, "\r\n"));
    }
  }, { code: 0, excludes: ["DEIXOU DE ESTAR POR ESTREAR"] });

  // CONTRA-PROVA da normalizacao: ela nao pode ser tao larga que engula conteudo. Um ficheiro
  // em CRLF **com planeamento la dentro** continua a ter de reprovar — senao bastava converter
  // os finais de linha para contornar o guard.
  test("G21: CRLF nao e passe livre — com conteudo, continua a avisar", (dir) => {
    comoTemplate(dir);
    writeF(dir, ALVO, (readF(dir, ALVO) + PLANEAMENTO).replace(/\n/g, "\r\n"));
  }, { code: 1, includes: [`${ALVO}: DEIXOU DE ESTAR POR ESTREAR`] });

  // --- O guard continua ARMADO na fixture sintetica, depois do re-congelamento -------------
  // O `syntheticSandbox()` re-congela `PRISTINOS` a partir do `session.md` que ele proprio
  // escreve, senao a fixture "limpa por construcao" avisaria sempre. Faltava a terceira ponta:
  // ninguem afirmava que o guard AINDA reprova la dentro. Sem este teste, uma versao futura do
  // `recongelarContexto` que ficasse larga de mais — a regex a engolir mais do que a tabela —
  // desarmava o Guard 21 na fixture sintetica **sem nada ficar vermelho**, porque o baseline
  // sintetico e capturado no arranque e absorve qualquer aviso que ja la esteja.
  test("G21: [armado] sujar o contexto DEPOIS do re-congelamento avisa na fixture sintetica", (dir) => {
    writeF(dir, ".agent/context/session.md", "# Session\n\nSprint 3 em curso: B12 a meio, T4 por comecar.\n");
  }, {
    synthetic: true,
    code: 1,
    includes: [".agent/context/session.md: DEIXOU DE ESTAR POR ESTREAR"],
  });

  // --- O construtor de fixture tem de RECUSAR quando nao consegue fazer o seu trabalho ------
  // Nao passa pelo `test()`: o que se mede aqui nao e o output do guard, e o comportamento do
  // `recongelarContexto()` chamado diretamente. Sem esta recusa, uma fixture que nao consegue
  // re-congelar segue em frente e o teste seguinte passa a medir um aviso do Guard 21 em vez do
  // que afirma — e o unico `throw` do modulo, logo e ele que a varredura de mutacao desliga.
  {
    const dir = mkdtempSync(join(tmpdir(), "guard-test-recongelar-"));
    const problems = [];
    try {
      const mod = ".agent/scripts/guards/context-virgem.mjs";
      mkdirSync(join(dir, ".agent/scripts/guards"), { recursive: true });

      // (a) bloco `PRISTINOS` irreconhecivel -> tem de rebentar, nao seguir calado.
      writeFileSync(join(dir, mod), "// sem tabela nenhuma\nexport const OUTRA = {};\n");
      let rebentou = false;
      try {
        recongelarContexto(dir);
      } catch (err) {
        rebentou = /nao encontrei o bloco PRISTINOS/.test(err.message);
      }
      if (!rebentou) problems.push("com o bloco PRISTINOS ausente, devia lancar e nao lancou");

      // (b) sem a camada dos guards -> devolve em silencio, sem rebentar. E o caso legitimo
      //     (uma fixture que nao copia os guards), e trata-lo como erro punha vermelho a
      //     montar fixtures que nao tem nada a ver com o Guard 21.
      const vazio = mkdtempSync(join(tmpdir(), "guard-test-recongelar-"));
      try {
        recongelarContexto(vazio);
      } catch (err) {
        problems.push(`sem a camada dos guards nao devia lancar: ${err.message}`);
      } finally {
        rmSync(vazio, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    registarResultado("G21: recongelarContexto recusa quando o patch nao aplica", problems, "");
  }
}
