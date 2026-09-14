#!/usr/bin/env node
/**
 * SessionStart(compact): reinjectar as Fronteiras DEPOIS de a janela ser compactada — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: este template gasta tres guards (1/1b/1c) a orcamentar os bytes que entram
 * em cada sessao, e o `CLAUDE.md` importa as rules para elas estarem SEMPRE presentes. Numa
 * sessao longa a compactacao descarta o historico — e as rules com ele. A partir dai o agente
 * continua a trabalhar **sem as regras que o projeto considera nao-negociaveis**, e nada no
 * ecra o diz.
 *
 * Era a lacuna mais grave do desenho: todo o investimento em engenharia de contexto podia ser
 * anulado em silencio, e o unico sinal seria o agente comecar a violar regras que "sabia" ha
 * dez minutos.
 *
 * O QUE FAZ: le o bloco **Fronteiras** do `CLAUDE.md` — a seccao que o proprio ficheiro marca
 * como "prioridade maxima" — e devolve-o em `additionalContext`. NAO reinjecta as rules
 * inteiras: sao ~26 KB e faze-lo derrotava o proposito da compactacao. As Fronteiras sao
 * ~600 bytes e sao o que nao pode desaparecer.
 *
 * PORQUE `SessionStart` COM `matcher: "compact"` E NAO `PreCompact`. A primeira versao deste
 * hook usava `PreCompact` e **nao entregava nada**: a documentacao do Claude Code lista os
 * eventos que honram `additionalContext` e o `PreCompact` nao consta — a seccao dele so diz
 * que campos sao descartados. Uma auditoria independente apanhou-o; a afirmacao "o evento
 * PreCompact honra" nunca tinha sido medida, num repo cuja regra e medir.
 *
 * E o evento certo tambem por desenho: injectar ANTES da compactacao significa que a propria
 * injeccao e compactada. `SessionStart(compact)` dispara **depois**, que e quando as rules ja
 * desapareceram e a reinjeccao vale alguma coisa.
 *
 * FALHA ABERTA, de propósito: qualquer problema (sem `CLAUDE.md`, seccao renomeada, JSON
 * invalido a entrada) sai `0` sem dizer nada. Um hook avariado nunca deve impedir uma
 * compactacao — o custo de nao reinjectar e uma sessao com menos contexto; o custo de
 * rebentar aqui e uma sessao que nao consegue continuar.
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

/** Raiz ancorada ao ficheiro, nunca ao `cwd` (AP2). */
const RAIZ_HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** O `cwd` da sessao: do payload, senao o do processo (e como os outros hooks deste repo
 *  leem o projeto medido), senao a raiz do proprio hook. Sem o `process.cwd()` no meio, um
 *  payload sem `cwd` fazia o hook ler o CLAUDE.md do repo ONDE O HOOK VIVE em vez do repo
 *  que esta a ser compactado — e num teste isso significa medir o repo errado. */
function raizDoProjeto(payload) {
  const cwd = payload?.cwd ?? process.cwd() ?? null;
  if (!cwd) return RAIZ_HOOK;
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).replace(/\n+$/, "");
  } catch {
    return cwd;
  }
}

/** O bloco `## Fronteiras ...` ate ao proximo `##`. Devolve null se nao existir — o que e
 *  informacao e nao um erro: um projeto derivado pode ter renomeado a seccao. Exportado para
 *  a suite o poder exercitar sem correr o processo. */
export function fronteiras(md) {
  if (typeof md !== "string") return null;
  // Um `## Exemplo` DENTRO de um bloco de codigo cercado nao e um heading — mas o regex via-o
  // como tal e truncava ali, reinjectando metade das Fronteiras (e uma cerca por fechar) em
  // silencio, porque o hook falha aberto. Num template cujas Fronteiras falam de comandos, um
  // exemplo cercado e provavel. As cercas sao neutralizadas antes de procurar o heading, e o
  // corpo e recortado do texto ORIGINAL pelos indices — para nao devolver o texto mascarado.
  const mascarado = md.replace(/^```[\s\S]*?^```/gm, (b) => b.replace(/^##/gm, "@@"));
  const m = /^##\s+Fronteiras\b[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(mascarado);
  if (m) {
    const corpoOriginal = md.slice(m.index + m[0].length - m[1].length, m.index + m[0].length).trim();
    return corpoOriginal === "" ? null : corpoOriginal;
  }
  if (!m) return null;
  const corpo = m[1].trim();
  return corpo === "" ? null : corpo;
}

function main() {
  let payload = null;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    /* sem payload legivel: segue com a raiz do hook */
  }

  const raiz = raizDoProjeto(payload);
  let md;
  try {
    md = readFileSync(join(raiz, "CLAUDE.md"), "utf8");
  } catch {
    return; // sem CLAUDE.md nao ha nada a reinjectar
  }

  const bloco = fronteiras(md);
  if (!bloco) return;

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "A janela foi compactada e as rules importadas pelo CLAUDE.md sairam do contexto.\n" +
          "As Fronteiras do projeto (prioridade maxima) continuam a valer:\n\n" +
          bloco +
          "\n\nO detalhe vive em `.agent/rules/` — reabrir on-demand em vez de assumir.",
      },
    })
  );
}

// Nao corre ao ser importado pela suite.
if (process.argv[1] && process.argv[1].endsWith("reinject-fronteiras.mjs")) {
  try {
    main();
  } catch {
    /* falha aberta: uma compactacao nunca deve ser bloqueada por este hook */
  }
  process.exit(0);
}
