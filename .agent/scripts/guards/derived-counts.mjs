/**
 * Guards de contagens derivadas (checklist sync-docs, fases do metodo) — {{PROJECT_NAME}}
 *
 * Extraido do `check-doc-versions.mjs` (911 linhas, contra a regra dos 500 que ele impoe).
 *
 * OS CORPOS ESTAO VERBATIM, indentacao original incluida: o refactor tem de ser auditavel
 * como um MOVIMENTO — o output do guard fica byte-a-byte igual — e nao como uma reescrita
 * onde um erro se esconde. Ver `guards/settings.mjs` para o mesmo raciocinio.
 *
 * Os avisos vivem aqui, logo este ficheiro esta em `PARES` no `mutation-sweep.mjs`.
 */

import { AP_FILES, CABECALHO_AP, semHtml } from "./anti-patterns.mjs";

/** Ficheiros onde uma contagem citada em prosa pode viver. Era uma lista duplicada entre os
 *  dois guards, e as duas versoes tinham DIVERGIDO: o 12c nao incluia `CLAUDE.md`/`GEMINI.md`,
 *  logo um numero errado na rule sempre-carregada passava — e o Guard 2 (paridade) tambem nao
 *  o apanha quando o erro esta igual nos dois espelhos. */
function ficheirosComProsa(listDir) {
  return [
    ...(listDir(".agent/rules", ".md") || []).map((f) => `.agent/rules/${f}.md`),
    ...(listDir(".agent/workflows", ".md") || []).map((f) => `.agent/workflows/${f}.md`),
    // `src/docs` INTEIRO e nao um ficheiro a mao: o `ticket-method-why.md` guarda numeros
    // medidos e estava fora do alcance dos guards so porque nao constava desta lista. Um
    // conjunto enumerado do disco nao esquece o ficheiro seguinte.
    ...(listDir("src/docs", ".md") || []).map((f) => `src/docs/${f}.md`),
    "CLAUDE.md",
    "GEMINI.md",
    "AGENTS.md",
    "README.md",
    "CONTRIBUTING.md",
    // O `BOOTSTRAP.md` entra na lista COMUM: o 12d ja o acrescentava com um `.concat()` a
    // parte e o 12e nao, logo uma citacao do numero de workflows ali passava. Unificado para
    // os quatro guards varrerem o mesmo conjunto.
    ".agent/BOOTSTRAP.md",
  ];
}

/** Guards 12 e 12c: numeros citados em prosa recalculados a partir da fonte.
 *  @returns {number} guards executados */
export function guardDerivedCounts({ read, readMeaningful, warn, ok, skip, why, listDir, ehDerivado }) {
  let guardsRun = 0;

// --- Guard 12: o tamanho da checklist de sync-docs e dado DERIVADO ---
// A checklist vive num ficheiro; o seu tamanho ("N pontos") esta citado em prosa noutros
// quatro. Nada os ligava: a checklist cresceu para 25 e as quatro citacoes ficaram em 24,
// sem nenhum guard a notar. Aqui recalcula-se a partir da fonte e compara-se com cada
// citacao — mesma logica dos contadores do backlog.
const syncDocs = readMeaningful(".agent/rules/sync-docs.md");
if (syncDocs) {
  // 12a: a numeracao e o invariante que se quebra a mao ao inserir um ponto no meio.
  const nums = [...syncDocs.matchAll(/^(\d+)\. \[ \]/gm)].map((m) => Number(m[1]));
  if (nums.length === 0) {
    warn(".agent/rules/sync-docs.md nao tem pontos de checklist (`N. [ ]`) — a checklist esta vazia ou mudou de formato");
  } else {
    const esperado = nums.map((_, i) => i + 1);
    const desalinhado = nums.findIndex((n, i) => n !== esperado[i]);
    if (desalinhado !== -1) {
      warn(
        `.agent/rules/sync-docs.md: numeracao da checklist quebrada — ` +
          `o ponto #${desalinhado + 1} esta escrito como "${nums[desalinhado]}." ` +
          `(sequencia lida: ${nums.join(", ")})`
      );
    } else {
      ok(`checklist sync-docs numerada 1-${nums.length} sem saltos`);
    }

    // 12b: cada citacao em prosa tem de igualar a contagem real.
    const total = nums.length;
    const alvos = ficheirosComProsa(listDir);
    let citacoes = 0;
    let erradas = 0;
    for (const f of alvos) {
      const c = read(f);
      if (c === null) continue;
      // "(N pontos" tambem descreve outras contagens (ex: o relatorio de fecho de sprint
      // tem 6). So conta como citacao DESTA checklist se a mesma linha falar de sync-docs.
      for (const linha of c.split("\n")) {
        if (!linha.includes("sync-docs")) continue;
        const m = /\((\d+)\s+(?:pontos|points)/i.exec(linha);
        if (!m) continue;
        citacoes++;
        if (Number(m[1]) !== total) {
          warn(`${f} diz "(${m[1]} pontos" mas a checklist de sync-docs.md tem ${total}`);
          erradas++;
        }
      }
    }
    if (citacoes === 0) {
      warn(`nenhum ficheiro cita o tamanho da checklist ("(N pontos") — o ponteiro obrigatorio em process-rules.md desapareceu?`);
    } else if (erradas === 0) {
      ok(`${citacoes} citacao(oes) de "(N pontos" coerentes com ${total}`);
    }
  }
  guardsRun++;
} else {
  skip(`Guard 12 — ${why(".agent/rules/sync-docs.md")}`);
}

// --- Guard 12c: o numero de fases do metodo por ticket e dado DERIVADO ---
// Mesmo defeito do 12b, encontrado a olho: o ficheiro tem 6 fases (0 a 5) e tres sitios
// diziam "5 fases", enumerando cinco. A que faltava em todos era a Fase 4 (o leitor
// independente) — a mais cara, e portanto a que mais convem esquecer. Num ficheiro que diz
// "nenhuma se salta", omitir uma dos resumos e pior do que uma gralha.
const metodo = readMeaningful(".agent/rules/ticket-method.md");
if (metodo) {
  const fases = [...metodo.matchAll(/^##\s*Fase\s+(\d+)\b/gm)].map((m) => Number(m[1]));
  if (fases.length === 0) {
    warn(".agent/rules/ticket-method.md nao tem cabecalhos `## Fase N` — o metodo mudou de formato?");
  } else {
    // A numeracao comeca em 0 e nao deve ter saltos: uma fase renumerada a mao quebra as
    // referencias "Fase N" espalhadas pelos workflows.
    const esperado = fases.map((_, i) => i);
    const mau = fases.findIndex((n, i) => n !== esperado[i]);
    if (mau !== -1) {
      warn(
        `.agent/rules/ticket-method.md: fases numeradas [${fases.join(", ")}] — esperado 0..${fases.length - 1} sem saltos`
      );
    }

    const total = fases.length;
    const alvos = ficheirosComProsa(listDir);
    // Formas em que o total aparece: "6 fases", "as 6 fases", "Seis fases". O mapa cobre so
    // as formas que a prosa usa; fora do intervalo, `esperadoPalavra` fica `undefined` e a
    // mensagem passa a omitir o parentese em vez de dizer "(undefined)".
    const PALAVRA = { 3: "tres", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito",
                      9: "nove", 10: "dez", 11: "onze", 12: "doze" };
    let citacoes = 0;
    let erradas = 0;
    for (const f of alvos) {
      const c = read(f);
      if (c === null) continue;
      for (const linha of c.split("\n")) {
        // Bilingue de proposito: o `.agent/` esta em portugues mas o `README.md` esta em
        // ingles, logo um padrao so-portugues deixava passar tudo o que estivesse la — e
        // deixou: o README dizia "5-phase" com o metodo a ter 6 fases, e nenhum guard o viu.
        const digito = /(\d+)[- ]\s*(?:fases|phases|phase)\b/i.exec(linha);
        const palavra = /\b(tres|quatro|cinco|seis|sete|oito)\s+fases/i.exec(linha);
        if (!digito && !palavra) continue;
        // ANCORA (so a forma por PALAVRA): "N fases" nem sempre e o TOTAL — "tres fases
        // escalam por tamanho" fala de tres DAS fases e e prosa correta. As citacoes reais do
        // total trazem o intervalo ao lado ("0-5", "(0 a 5)", "(0)").
        // A forma com DIGITO fica sem ancora de proposito: "6 fases"/"5-phase" e sempre uma
        // afirmacao sobre o total, e exigir-lhe o intervalo abria um falso negativo real —
        // reescrever o README para `6-phase method` sem `0-5` saia da cobertura em silencio,
        // que e o defeito que este guard foi criado para apanhar.
        //
        // O FALSO NEGATIVO que a ancora custa, medido e aceite: uma linha por palavra que
        // ENUMERA sem trazer o intervalo — `"Cinco fases: explicar · desenvolver · ..."` — fica
        // de fora, e pode estar errada. Aconteceu num derivado, no ficheiro que explica o metodo.
        //
        // Nao se corrige dispensando a ancora quando a linha enumera, e a razao e concreta:
        // `"tres fases escalam por tamanho: S · M · L"` tambem enumera, tambem tem a contagem
        // de itens a bater com a palavra, e e prosa CORRECTA. Nenhum discriminador textual as
        // separa — a diferenca e semantica (o sujeito de uma sao ALGUMAS fases, o da outra e o
        // total). Dispensar a ancora poe a segunda a reprovar, e um falso positivo num guard
        // custa mais do que este falso negativo: ensina a ignorar guards.
        //
        // Fica escrito em vez de tapado. Quem escrever um resumo por palavra que seja o total
        // poe-lhe o intervalo ao lado — e e o que o resto do repo ja faz.
        if (!digito && !/\b0\s*(?:a|to|ate|-|–)\s*\d\b|\(0\)/i.test(linha)) continue;
        citacoes++;
        const escrito = digito ? Number(digito[1]) : null;
        const esperadoPalavra = PALAVRA[total];
        if (digito && escrito !== total) {
          warn(`${f} diz "${escrito} fases" mas ${".agent/rules/ticket-method.md"} tem ${total}`);
          erradas++;
        } else if (palavra && palavra[1].toLowerCase() !== esperadoPalavra) {
          const sufixo = esperadoPalavra ? ` (${esperadoPalavra})` : "";
          warn(`${f} diz "${palavra[1]} fases" mas o metodo tem ${total}${sufixo}`);
          erradas++;
        }
      }
    }
    if (citacoes === 0) {
      warn(`nenhum ficheiro cita o numero de fases do metodo — o ponteiro obrigatorio em process-rules.md desapareceu?`);
    } else if (erradas === 0) {
      ok(`${citacoes} citacao(oes) de "N fases" coerentes com ${total}`);
    }
  }
  guardsRun++;
} else {
  skip(`Guard 12c — ${why(".agent/rules/ticket-method.md")}`);
}


  // --- Guard 12d: o numero de guards numerados e dado DERIVADO ---
  // Terceira instancia do mesmo padrao (checklist, fases, e agora isto): o `BOOTSTRAP.md`
  // dizia "11 guards numerados" quando existiam 14. O numero era mantido a mao.
  const fontes = [
    ".agent/scripts/check-doc-versions.mjs",
    ...(listDir(".agent/scripts/guards", ".mjs") || []).map((f) => `.agent/scripts/guards/${f}.mjs`),
  ];
  const numerados = new Set();
  for (const f of fontes) {
    const c = read(f);
    if (c === null) continue;
    // `^\\s*` e `(?:Guard )?`: a versao anterior exigia coluna 0 e a palavra "Guard", logo o
    // proprio 12d (indentado, escrito `// --- Guard 12d:`) nao se contava, e reindentar um
    // cabecalho — a limpeza obvia depois do refactor verbatim — derrubava a contagem.
    for (const m of c.matchAll(/^\s*\/\/ --- (?:Guard )?(\d+[a-z]?):/gm)) numerados.add(m[1]);
  }
  if (numerados.size === 0) {
    warn("nao encontrei nenhum cabecalho `// --- Guard N:` — os guards mudaram de formato?");
  } else {
    let cit = 0;
    let mal = 0;
    for (const f of ficheirosComProsa(listDir)) {
      const c = read(f);
      if (c === null) continue;
      for (const linha of c.split("\n")) {
        const m = /(\d+)\s+(?:guards\s+numerados|numbered\s+guards)/i.exec(linha);
        if (!m) continue;
        cit++;
        if (Number(m[1]) !== numerados.size) {
          warn(`${f} diz "${m[1]} guards numerados" mas existem ${numerados.size}`);
          mal++;
        }
      }
    }
    if (cit === 0) {
      // Os guards 12b e 12c tem este ramo; o 12d nao tinha, logo apagar a citacao fazia o
      // guard passar em silencio — sem OK e sem WARN — enquanto `guardsRun` continuava a
      // contar. Um guard que nao verifica nada tem de o dizer.
      //
      // MAS: num projeto DERIVADO nao ha citacao nenhuma para desaparecer. As unicas do
      // template vivem no `BOOTSTRAP.md` (que o bootstrap manda apagar) e no `README.md`
      // (que manda substituir) — logo este ramo reprovava TODOS os consumidores no primeiro
      // PR, por terem seguido a documentacao. Medido. A distincao certa e entre "a citacao
      // foi removida do template" (defeito) e "este projeto nunca teve uma" (normal).
      if (ehDerivado()) {
        skip("Guard 12d (N guards numerados) — projeto derivado sem citacao propria");
      } else {
        warn("nenhum ficheiro cita o numero de guards numerados — a referencia desapareceu?");
      }
    } else if (mal === 0) {
      ok(`${cit} citacao(oes) de "N guards numerados" coerentes com ${numerados.size}`);
    }
  }
  guardsRun++;

  // --- Guard 12e: o numero de workflows/comandos e dado DERIVADO ---
  // Quarta instancia do padrao. `11 workflows` e `11 commands` ficaram atras quando o
  // `/upgrade` fez 12 — e o numero ja estava calculado nos guards 6/7/9, so nao era comparado
  // com a prosa.
  const nWorkflows = (listDir(".agent/workflows", ".md") || []).length;
  if (nWorkflows === 0) {
    warn("nao encontrei workflows em .agent/workflows — a pasta mudou de sitio?");
  } else {
    let cit = 0;
    let mal = 0;
    for (const f of ficheirosComProsa(listDir)) {
      const c = read(f);
      if (c === null) continue;
      for (const linha of c.split("\n")) {
        const m = /(\d+)\s+(workflows|comandos|commands)\b/i.exec(linha);
        if (!m) continue;
        cit++;
        if (Number(m[1]) !== nWorkflows) {
          warn(`${f} diz "${m[1]} ${m[2]}" mas existem ${nWorkflows} workflows`);
          mal++;
        }
      }
    }
    if (cit === 0) {
      // Mesma razao do 12d: num derivado a citacao nunca existiu, e reprovar por isso
      // partia o CI de quem seguiu o bootstrap a letra.
      if (ehDerivado()) skip("Guard 12e (N workflows) — projeto derivado sem citacao propria");
      else warn("nenhum ficheiro cita o numero de workflows — a referencia desapareceu?");
    } else if (mal === 0) ok(`${cit} citacao(oes) de "N workflows/comandos" coerentes com ${nWorkflows}`);
  }
  guardsRun++;

  // --- Guard 12f: contagens de FICHEIROS citadas em prosa ---
  // Quinta instancia do padrao, e a que mais derivou: o inventario do `README.md` tinha QUATRO
  // contagens erradas ao fim de seis releases. Nada as media — os guards acima cobrem
  // checklists, fases, guards e workflows, e o inventario de ficheiros ficou de fora.
  //
  // PORQUE COMPARA COM A ARVORE E NAO COM O DISCO, e foi medido: as fixtures dos Guards 19 e 20
  // escrevem `.mjs` falsos em `.agent/scripts/` e em `.agent/scripts/tests/` — e bem, e assim
  // que se testa a maquinaria. Contra o disco, SETE testes ficavam vermelhos com uma mensagem a
  // falar do README, a quilometros da causa, e toda a fixture futura pagava o mesmo imposto.
  // Contar o disco das pastas da propria maquinaria esta acoplado as fixtures dela.
  //
  // O QUE ISTO NAO APANHA, dito por inteiro: um ficheiro acrescentado ao disco e nunca listado
  // na arvore. Foram seis, encontrados a mao na mesma passagem. Essa classe precisava de
  // comparar disco com arvore, e ai o acoplamento volta — fica para o `/review`, escrito em vez
  // de tapado. Os dois numeros que o README citava sobre `tests/` foram REMOVIDOS: um numero que
  // nao se consegue derivar barato nao se escreve, que e a mesma decisao tomada no `review.md`.
  // A contagem da RAIZ de `.agent/scripts/` nao se mede em disco, e a razao e medida: as fixtures
  // dos Guards 19 e 20 escrevem `.mjs` falsos nessa pasta — e bem, e assim que se testa a
  // maquinaria. Contra o disco, sete testes ficavam vermelhos com uma mensagem a falar do
  // README, a quilometros da causa, e toda a fixture futura pagava o mesmo imposto.
  //
  // Compara-se antes com a ARVORE do proprio ficheiro: "dizes 8, e listas 8". Sem acoplamento
  // nenhum a fixtures, e apanha o defeito REAL — quando a raiz passou de 7 para 8 entradas, a
  // arvore foi actualizada e a prosa nao. Era exactamente esta divergencia.
  for (const alvo of ficheirosComProsa(listDir)) {
    const c = read(alvo);
    if (c === null) continue;
    const m = /(\d+)\s+entry points at the root/i.exec(c);
    if (!m) continue;
    // As entradas da arvore sao as linhas que apontam para um `.mjs` no nivel da raiz de
    // `scripts/` — quatro espacos de indentacao, sem pasta pelo meio.
    const naArvore = [...c.matchAll(/^ {4}[├└]── ([\w-]+\.mjs)\s/gm)].length;
    if (naArvore === 0) {
      warn(`${alvo} cita "${m[1]} entry points" mas nao tem arvore que os liste — o bloco mudou de forma?`);
    } else if (Number(m[1]) !== naArvore) {
      warn(`${alvo} diz "${m[1]} entry points at the root" mas a arvore dele lista ${naArvore}`);
    } else {
      ok(`"${naArvore} entry points at the root" coerente com a arvore de ${alvo}`);
    }
  }
  guardsRun++;

  // --- Guard 12g: o INTERVALO de anti-padroes citado em prosa e dado DERIVADO ---
  // Sexta instancia do mesmo padrao, e a mais cara de todas porque um dos sitios e EXECUTAVEL:
  // o item do `/review` que manda correr o grep de deteccao "de cada entrada" fechava o
  // intervalo dois numeros antes do fim, logo corriam-se 7 de 9 greps e marcava-se a caixa. Um
  // dos dois que ficavam de fora e o anti-padrao "duas copias da mesma regra a concordar a
  // mao" — ou seja, o defeito que a checklist deixava de procurar era este.
  //
  // PORQUE O GUARD 15 NAO CHEGA, e e a licao: ele verifica que cada citacao RESOLVE, e as duas
  // pontas resolviam. "Estes sao todos" e outra afirmacao, e ninguem a media. OITO copias a
  // mao, e nem entre si concordavam — quatro foram corrigidas a olho e as outras quatro so
  // apareceram na leitura independente, uma delas SEIS linhas abaixo de uma ja corrigida, no
  // mesmo ficheiro. Quem corrige copias a mao a olho deixa copias por corrigir: e a
  // demonstracao do porque isto tinha de virar guard.
  //
  // O CONJUNTO, e nao so o extremo. A primeira versao validava so o topo, e uma leitura
  // independente derrubou-a com uma fixture: o primeiro e o terceiro definidos, o do meio
  // apagado, prosa a declarar o intervalo inteiro — tudo verde. A mentira "estes sao todos" tem
  // duas formas e esta e a de dentro; apagar uma entrada do meio e operacao normal (a propria
  // rule manda migrar uma entrada estavel para `core-rules.md`). No template o Guard 15 tapava-a
  // por acidente, porque cada entrada esta citada a solta nalgum ficheiro; NUM DERIVADO nao tapa
  // nada — e o derivado e para quem isto existe.
  //
  // (Os IDs concretos nao se escrevem neste ficheiro. O Guard 15 varre-o e uma citacao ao
  // prefixo do projeto e uma citacao morta no template — foi o que aconteceu a este comentario
  // na primeira versao. O cabecalho do `anti-patterns.mjs` ja avisava.)
  //
  // O extremo INFERIOR nao se valida a parte: cai no mesmo teste de pertenca do conjunto.
  //
  // NAO VALIDA CONTAGENS POR EXTENSO, e a razao esta em disco: `src/docs/upgrade-why.md` diz
  // "num projeto com oito anti-padroes proprios", que e uma medicao correcta sobre OUTRO
  // projeto. Um guard que leia numeros por extenso acusa-a. A saida foi apagar as contagens por
  // extenso que duplicavam um intervalo — remover a copia, nao arranjar-lhe um segundo
  // verificador. Nao eram uma, eram duas, e a segunda so apareceu na leitura independente.
  //
  // `semHtml`: um intervalo dentro de um exemplo comentado nao e uma afirmacao. Sem isto, quem
  // acabou de bootstrapar levava um aviso sobre uma linha que o markdown nem mostra.
  //
  // O IMPOSTO DE LER PROSA, e este guard cobrou-o ao proprio autor na primeira hora: a
  // evidencia que descreve este defeito citava o intervalo errado como **citacao historica**, e
  // levou aviso. Esta certo — em texto corrido, um intervalo literal e indistinguivel de uma
  // declaracao, e nao ha contexto que os separe de forma fiavel. A saida e escrever a frase de
  // outra maneira ("um intervalo que acabasse no setimo"), nunca isentar o ficheiro: isentar os
  // `-why.md` abria o vao exactamente onde a evidencia vive, e e de la que as regras se
  // defendem. Quem acrescentar um `-why` com historia de intervalos paga o mesmo imposto.
  const porPrefixo = new Map();
  for (const f of AP_FILES) {
    const c = read(f);
    if (c === null) continue;
    for (const m of semHtml(c).matchAll(new RegExp(CABECALHO_AP.source, "gm"))) {
      const pref = m[1].slice(0, 2);
      if (!porPrefixo.has(pref)) porPrefixo.set(pref, new Set());
      porPrefixo.get(pref).add(Number(m[1].slice(2)));
    }
  }
  {
    // UM SO `skip`, e a fusao foi medida. O ramo separado para "nao ha nenhuma definicao" so se
    // conseguia exercitar limpando as citacoes de mais de vinte `.mjs` a mao — ou seja, o unico
    // estado que o alcancava era o da propria fixture. E o TP7 a nascer: um ramo cuja
    // justificacao ia ser prosa. Sem definicoes, cada intervalo cai no `continue` de baixo e o
    // contador de validados fica a zero, que e o mesmo destino por um caminho que existe.
    // OS SEPARADORES: hifen, trace curto e `..`. O `..` entrou depois de uma leitura
    // independente encontrar DUAS copias escritas assim — uma delas 13 linhas abaixo de uma que
    // este ticket ja tinha corrigido, no mesmo ficheiro, e o guard passou-lhe ao lado. Um
    // alfabeto de separadores curto demais e uma blocklist a fingir de allowlist (`TP6`).
    //
    // O travessao longo fica DE FORA, e e deliberado: em portugues ele e o marcador de aposto —
    // "o `TP1` — e o `TP9` tambem — sao..." passava a ler-se como intervalo. Aceita-se o falso
    // negativo teorico (zero ocorrencias no repo) para nao pagar um falso positivo na forma de
    // pontuacao mais comum da lingua em que este repo escreve.
    const INTERVALO_AP = /`?((?:AP|TP))(\d+)`?\s*(?:[-–]|\.\.)\s*`?((?:AP|TP))(\d+)`?/g;
    let validados = 0;
    let mal = 0;
    for (const alvo of ficheirosComProsa(listDir)) {
      const bruto = read(alvo);
      if (bruto === null) continue;
      semHtml(bruto)
        .split("\n")
        .forEach((linha, i) => {
          for (const m of linha.matchAll(INTERVALO_AP)) {
            const [, pref, ini, prefFim, fim] = m;
            if (pref !== prefFim) {
              warn(`${alvo}:${i + 1}: o intervalo ${m[0]} mistura os prefixos ${pref} e ${prefFim} — cada prefixo tem a sua numeracao`);
              mal++;
              // Conta como observado: senao um repo cujos unicos intervalos fossem mistos
              // imprimia o `skip` "nao havia nada a verificar" por cima do aviso que este guard
              // acabou de dar, e a regra deste repo e que um skip diz a verdade sobre si.
              validados++;
              continue;
            }
            const definidos = porPrefixo.get(pref);
            // Prefixo sem nenhuma definicao: o Guard 15 ja reprova as duas pontas como citacoes
            // mortas, e com o numero concreto em vez do intervalo. Avisar aqui tambem era dizer
            // o mesmo por duas bocas — e quem le passa a procurar dois defeitos onde ha um.
            // Alcancavel e barato: um derivado que escreva o intervalo antes do primeiro
            // cabecalho, que e o dia 1 de quem bootstrapa. Tem teste proprio.
            if (definidos === undefined) continue;
            validados++;
            const topo = Math.max(...definidos);
            if (Number(fim) !== topo) {
              warn(`${alvo}:${i + 1}: o intervalo ${m[0]} acaba em ${fim} mas o ultimo ${pref} definido e o ${pref}${topo} — quem seguir a instrucao trata ${topo - Number(fim)} entrada(s) como inexistentes`);
              mal++;
              continue;
            }
            // O buraco no MEIO. Um intervalo promete tudo o que abrange, e quem seguir a
            // instrucao vai procurar cada um deles.
            const emFalta = [];
            for (let k = Number(ini); k <= Number(fim); k++) if (!definidos.has(k)) emFalta.push(`${pref}${k}`);
            if (emFalta.length) {
              warn(`${alvo}:${i + 1}: o intervalo ${m[0]} abrange ${emFalta.join(", ")}, que nao esta(o) definido(s) — quem seguir a instrucao procura o que nao ha`);
              mal++;
            }
          }
        });
    }
    if (validados === 0) {
      skip("Guard 12g — nenhuma prosa cita um intervalo de anti-padroes com prefixo definido");
    } else if (mal === 0) {
      ok(`${validados} intervalo(s) de anti-padroes coerentes com o que esta definido`);
    }
  }
  guardsRun++;

  return guardsRun;
}
