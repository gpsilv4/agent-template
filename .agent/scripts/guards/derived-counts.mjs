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

/** Ficheiros onde uma contagem citada em prosa pode viver. Era uma lista duplicada entre os
 *  dois guards, e as duas versoes tinham DIVERGIDO: o 12c nao incluia `CLAUDE.md`/`GEMINI.md`,
 *  logo um numero errado na rule sempre-carregada passava — e o Guard 2 (paridade) tambem nao
 *  o apanha quando o erro esta igual nos dois espelhos. */
function ficheirosComProsa(listDir) {
  return [
    ...(listDir(".agent/rules", ".md") || []).map((f) => `.agent/rules/${f}.md`),
    ...(listDir(".agent/workflows", ".md") || []).map((f) => `.agent/workflows/${f}.md`),
    "src/docs/agent-guide.md",
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
export function guardDerivedCounts({ read, readMeaningful, warn, ok, skip, why, listDir }) {
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
        const m = /\((\d+)\s+pontos/.exec(linha);
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
        const digito = /(\d+)\s+fases/i.exec(linha);
        const palavra = /\b(tres|quatro|cinco|seis|sete|oito)\s+fases/i.exec(linha);
        if (!digito && !palavra) continue;
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
        const m = /(\d+)\s+guards\s+numerados/.exec(linha);
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
      warn("nenhum ficheiro cita o numero de guards numerados — a referencia desapareceu?");
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
    if (cit === 0) warn("nenhum ficheiro cita o numero de workflows — a referencia desapareceu?");
    else if (mal === 0) ok(`${cit} citacao(oes) de "N workflows/comandos" coerentes com ${nWorkflows}`);
  }
  guardsRun++;

  return guardsRun;
}
