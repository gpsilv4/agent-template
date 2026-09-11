/**
 * Guards da serie 1 — {{PROJECT_NAME}}
 *
 * Tres orcamentos de bytes (1, 1b, 1c) **e** a copia das Fronteiras nos ponteiros finos (1d).
 * O 1d nao e um orcamento: vive aqui porque e o resto do bloco que saiu do ficheiro de
 * entrada, e separa-lo criava um modulo de um guard so. Dito por escrito para o proximo leitor
 * nao concluir do nome do ficheiro que tudo aqui mede bytes.
 *
 * PORQUE OS ORCAMENTOS EXISTEM: o que o agente carrega a cada sessao e o que ele paga a cada
 * sessao. Uma rule que cresce sem limite incha o contexto em silencio, e o efeito nao aparece
 * em nenhum teste — aparece na qualidade das respostas. Os limiares diferem por tier: uma rule
 * importada entra em TODAS as sessoes, uma de referencia entra por ticket.
 *
 * PORQUE ESTAO NUM MODULO PROPRIO: o `check-doc-versions.mjs` passou o flag das 500 linhas, e
 * este era o bloco mais coeso de la. A entrada em `PARES` do `mutation-sweep.mjs` e
 * obrigatoria — os avisos passaram a viver aqui.
 */

/**
 * @returns {number} guards executados
 */
export function guardBudgets({ read, warn, note, ok, skip, listDir }) {
  let corridos = 0;

  // --- Guard 1: orcamento de bytes das rules sempre-carregadas ---
  // Duas listas distintas: a ausencia de uma rule OBRIGATORIA e um defeito (o `@import`
  // em CLAUDE.md fica pendurado); a das duas geradas no bootstrap e esperada.
  const REQUIRED_RULES = ["core-rules.md", "process-rules.md", "anti-patterns.md"];
  const BOOTSTRAP_RULES = ["business-logic.md", "pages-architecture.md"];
  const RULES_WARN_BYTES = 11500;
  const RULES_MAX_BYTES = 12000;

  function checkRuleBytes(file) {
    const content = read(file);
    if (content === null) return null;
    // Normalizar CRLF antes de medir: um clone com `core.autocrlf=true` acrescenta um byte por
    // linha, e `process-rules.md` mudava de OK para NOTE so por isso — o gate passava a depender
    // da plataforma de quem o corre em vez do conteudo. Este e o numero que o agente carrega.
    const bytes = Buffer.byteLength(content.replace(/\r\n/g, "\n"), "utf8");
    if (content.trim() === "") {
      warn(`${file} = ${bytes} bytes mas esta VAZIO — e uma rule importada em CLAUDE.md/GEMINI.md`);
      return bytes;
    }
    if (bytes > RULES_MAX_BYTES) {
      warn(`${file} = ${bytes} bytes > ${RULES_MAX_BYTES} — condensar; mover detalhe para src/docs/ ou ficheiro nao-carregado`);
    } else if (bytes > RULES_WARN_BYTES) {
      note(`${file} = ${bytes} bytes (perto do limite ${RULES_MAX_BYTES})`);
    } else {
      ok(`${file} = ${bytes} bytes`);
    }
    return bytes;
  }

  for (const f of REQUIRED_RULES) {
    const file = `.agent/rules/${f}`;
    if (checkRuleBytes(file) === null) {
      warn(`${file} NAO EXISTE — e uma rule obrigatoria e esta importada em CLAUDE.md/GEMINI.md`);
    }
    corridos++;
  }
  for (const f of BOOTSTRAP_RULES) {
    const file = `.agent/rules/${f}`;
    if (checkRuleBytes(file) === null) skip(`${file} — gerado no bootstrap, ainda nao existe`);
    else corridos++;
  }

  // --- Guard 1b: orcamento das rules NAO carregadas ---
  // O Guard 1 orcamenta so as rules importadas. As de referencia (`sync-docs`, `ticket-method`,
  // `scripts-guide`) nao tinham limite NENHUM — e uma delas chegou aos 16 KB sem nada avisar,
  // apesar de ser reaberta por inteiro a cada ticket `M`/`L`.
  //
  // Os limiares nao sao os mesmos de proposito: uma rule carregada entra no contexto a **cada
  // sessao**; uma de referencia entra **por ticket**, logo pode ser maior. Mas passar do tamanho
  // de uma rule carregada e sinal de que a referencia esta a virar manual — e a partir de 20 KB
  // deixa de ser lida e passa a ser consultada por `grep`, o que e outra coisa.
  // O gate esta a 14000 e nao a 20000 por uma razao medida: o pico historico de uma rule de
  // referencia neste repo e **14259 bytes** (`ticket-method.md`, commit `92b745d`), e com o
  // gate em 20000 passava com um NOTE e exit `0` — o guard nao apanhava aquilo para que foi
  // criado. A 14000 reprova-o por 259 bytes.
  //
  // (Uma versao anterior deste comentario dizia 16239 bytes. Uma leitura independente varreu o
  // historico: esse tamanho nunca existiu num ficheiro commitado. Um numero escrito a mao a
  // justificar um limiar e o `AP1` aplicado a um comentario.)
  //
  // O NOTE esta a 12500 e nao a 12000 porque o tamanho de trabalho de uma referencia aqui e
  // ~12 KB (o `ticket-method.md` vive nos 11958): com o NOTE em 12000 a proxima frase que se
  // acrescentasse a esse ficheiro produzia ruido. Acima de 20000 a mensagem e mais dura; o
  // gate e o mesmo.
  const REF_NOTE_BYTES = 12500;
  const REF_MAX_BYTES = 14000;
  const REF_ABANDONO_BYTES = 20000;
  const CARREGADAS = new Set([...REQUIRED_RULES, ...BOOTSTRAP_RULES]);
  const refs = (listDir(".agent/rules", ".md") || []).filter((f) => !CARREGADAS.has(`${f}.md`));
  if (refs.length === 0) {
    skip("Guard 1b — nao ha rules de referencia em .agent/rules");
  } else {
    for (const nome of refs) {
      const file = `.agent/rules/${nome}.md`;
      const c = read(file);
      if (c === null) continue;
      const bytes = Buffer.byteLength(c.replace(/\r\n/g, "\n"), "utf8");
      if (bytes > REF_ABANDONO_BYTES) {
        warn(`${file} = ${bytes} bytes > ${REF_ABANDONO_BYTES} — a este tamanho deixa de ser lida e passa a ser consultada por grep, que e outra coisa; separar instrucoes de evidencia (a evidencia e para src/docs/)`);
      } else if (bytes > REF_MAX_BYTES) {
        warn(`${file} = ${bytes} bytes > ${REF_MAX_BYTES} — referencia grande demais para ser reaberta a cada ticket; separar instrucoes de evidencia (a evidencia e para src/docs/)`);
      } else if (bytes > REF_NOTE_BYTES) {
        note(`${file} = ${bytes} bytes (maior que uma rule carregada; considerar separar)`);
      } else {
        ok(`${file} = ${bytes} bytes (referencia)`);
      }
    }
    corridos++;
  }

  // --- Guard 1c: o CONTEXTO carregado a cada sessao ---
  // Orcamenta **so** os `@imports` de `.agent/context/`. As rules tem dono proprio — o Guard 1
  // orcamenta cada uma a 12 000 — e o contexto nao tem dono nenhum: e a metade que cresce
  // sozinha. Somar as duas num total unico media dois problemas com remedios diferentes num
  // numero que nao apontava para nenhum deles.
  //
  // O total unico anterior (64 000) era **inalcancavel por construcao**, e isso apareceu ao
  // correr o `/upgrade` num projeto real: cinco rules, cada uma dentro do que o Guard 1 lhes
  // permite, mais o `CLAUDE.md`, dao 63 680 — sobravam **320 bytes** para os seis ficheiros de
  // contexto (o proprio template usa 5 352). Um projeto que cumprisse o Guard 1 por inteiro nao
  // podia cumprir o 1c, e a unica saida era subir o limiar: a solucao degenerada que este repo
  // existe para impedir.
  //
  // O TETO E DERIVADO dos limites de arquivamento que a `process-rules.md` ja impoe, e nao do
  // tamanho que os ficheiros tem hoje — calibrar pelo presente e escrever "esta bem assim".
  // `decisions` ~150 linhas (~12k) + `walkthrough` ~200 (~16k) + os tres substituidos a cada
  // feature (~6k) dao ~34k antes do backlog; o backlog ativo de um projeto real leva isso aos
  // ~48k. Um projeto derivado ajusta estes numeros a partir das suas proprias regras.
  const CONTEXTO_NOTE = 36000;
  const CONTEXTO_MAX = 48000;
  {
    const raiz = read("CLAUDE.md");
    if (raiz === null) {
      skip("Guard 1c — sem CLAUDE.md");
    } else {
      const bytesDe = (c) => Buffer.byteLength(c.replace(/\r\n/g, "\n"), "utf8");
      let contexto = 0;
      let outros = bytesDe(raiz);
      let vistos = 0;
      const ausentes = [];
      for (const m of raiz.matchAll(/^@(\S+)/gm)) {
        const c = read(m[1]);
        if (c === null) {
          ausentes.push(m[1]);
          continue;
        }
        if (m[1].startsWith(".agent/context/")) {
          contexto += bytesDe(c);
          vistos++;
        } else {
          outros += bytesDe(c);
        }
      }
      const nota = ausentes.length ? ` (${ausentes.length} import(s) gerado(s) no bootstrap ainda ausente(s))` : "";
      if (vistos === 0) {
        // Zero imports de contexto e legitimo (um projeto pode nao os importar), mas tem de o
        // DIZER: um orcamento que mede zero nao pode sair como "esta bem" — e o `AP2`.
        skip(`Guard 1c — nenhum @import de .agent/context/ em CLAUDE.md${nota}`);
      } else {
        if (contexto > CONTEXTO_MAX) {
          warn(`contexto carregado = ${contexto} bytes > ${CONTEXTO_MAX}${nota} — arquivar historico inerte ou mover evidencia para src/docs/`);
        } else if (contexto > CONTEXTO_NOTE) {
          note(`contexto carregado = ${contexto} bytes (perto do limite ${CONTEXTO_MAX})${nota}`);
        } else {
          ok(`contexto carregado = ${contexto} bytes${nota}`);
        }
        // A outra metade continua visivel, sem gate proprio: o custo por sessao e a soma, e
        // esconde-la seria trocar um numero que nao apontava para nada por nenhum numero.
        note(`  ...dos quais rules + CLAUDE.md = ${outros} bytes; total por sessao = ${contexto + outros}`);
        corridos++;
      }
    }
  }

  // --- Guard 1d: as Fronteiras copiadas nos ponteiros finos ---
  // O `.cursor/rules/*.mdc` e o `.github/copilot-instructions.md` sao ponteiros para o
  // `AGENTS.md`. Mas **nao esta verificado** que o Cursor e o Copilot SIGAM um ponteiro em
  // markdown — o Claude Code segue `@imports` porque e uma funcionalidade dele; os outros podem
  // simplesmente ler o ficheiro que lhes e dado. Se nao seguirem, esses agentes recebiam um mapa
  // de pastas e **zero regras**.
  //
  // A resposta e nao depender disso: as Fronteiras estao copiadas nos dois ficheiros. Copia
  // significa divergencia, logo este guard compara-as com a do `CLAUDE.md`. A duplicacao aqui e
  // **forcada** (cada tool le so o seu ficheiro), e a regra do repo para duplicacao forcada e
  // verifica-la, nao proibi-la — a mesma logica dos contadores do backlog.
  {
    const fronteirasDe = (c) => {
      const m = /^## Fronteiras \(prioridade maxima\)\n\n([\s\S]*?)\n\n>/m.exec(c.replace(/\r\n/g, "\n"));
      return m ? m[1].trim() : null;
    };
    const raiz = read("CLAUDE.md");
    const base = raiz === null ? null : fronteirasDe(raiz);
    const PONTEIROS = [".cursor/rules/project.mdc", ".github/copilot-instructions.md"];
    if (base === null) {
      skip("Guard 1d — sem CLAUDE.md ou sem bloco de Fronteiras para comparar");
    } else {
      let vistos = 0;
      for (const f of PONTEIROS) {
        const c = read(f);
        if (c === null) {
          skip(`${f} — ponteiro ausente (o tool correspondente nao esta configurado)`);
          continue;
        }
        const copia = fronteirasDe(c);
        if (copia === null) {
          warn(`${f} nao tem o bloco "## Fronteiras" — um tool que nao siga o ponteiro para AGENTS.md fica sem regra nenhuma`);
        } else if (copia !== base) {
          warn(`${f}: as Fronteiras divergem do CLAUDE.md — a copia envelheceu`);
        } else {
          ok(`${f} = Fronteiras iguais ao CLAUDE.md`);
        }
        vistos++;
      }
      if (vistos === 0) skip("Guard 1d — nenhum ponteiro fino presente");
      else corridos++;
    }
  }



  return corridos;
}
