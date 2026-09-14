#!/usr/bin/env node
/**
 * UserPromptSubmit: lembrar a Fase 0 quando o pedido e "implementa X" — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: das ~30 regras que este projeto declara nao-negociaveis, **13 sao so
 * prosa** — e o metodo de trabalho por ticket inteiro esta entre elas. A Fase 0 ("explicar e
 * esperar aprovacao") nao tem guard, nao tem hook e nao tem CI: depende de o agente se
 * lembrar. O `CLAUDE.md` afirma que "a rede tem tres camadas"; para o nucleo da proposta de
 * valor do template, tinha zero.
 *
 * Este hook fecha a primeira dessas regras. Quando o pedido parece uma ordem de
 * implementacao ("faz o ticket B3", "implementa o export", "corrige o bug do login"),
 * devolve em `additionalContext` um lembrete do que a Fase 0 exige — **antes** de o agente
 * comecar a responder, que e o unico momento em que ainda da para mudar de rumo.
 *
 * O QUE NAO FAZ, e de propósito:
 *   - **nao bloqueia**. Um `exit 2` aqui recusaria o prompt do utilizador, e o custo de um
 *     falso positivo (recusar trabalho legitimo) e muito maior do que o de um lembrete a
 *     mais. O utilizador continua a mandar;
 *   - **nao decide o tamanho do ticket**. Diz o que cada tamanho exige e deixa o agente
 *     classificar — quem tem o contexto do ticket e ele, nao uma regex;
 *   - **nao dispara em perguntas**. "como funciona o X?" nao e uma ordem de implementacao.
 *
 * FALHA ABERTA: qualquer problema sai `0` calado. Um hook avariado no caminho de CADA
 * prompt seria a pior classe de defeito deste repo.
 */
import { readFileSync } from "fs";

/** Verbos de ordem de implementacao, no imperativo e na 2a/3a pessoa que se usam em chat.
 *  Deliberadamente ESTREITO: e melhor nao disparar do que disparar em conversa. */
const ORDENS = new RegExp(
  [
    // Verbo de implementacao, ISOLADO. O ramo ingles exigia um substantivo da lista
    // (`ticket|task|bug|...`) e o portugues nao — logo em ingles o hook so disparava se
    // alguem escrevesse a palavra "ticket", que ninguem escreve. Alinhados.
    "\\b(?:implementa|implementar|corrige|corrigir|resolve|resolver|acrescenta|acrescentar|adiciona|adicionar|refactoriza|refatoriza|escreve|escrever|cria|criar|muda|mudar|altera|alterar)\\b",
    "\\b(?:implement|fix|add|build|refactor|write|create|change)\\b",
    // Verbo de arranque + ticket/item/sprint **ou um ID**. O comentario prometia
    // `"B3" sozinho com verbo de arranque` e a regex exigia a palavra literal — o ID sozinho,
    // que e a forma que este template ensina a usar, nunca casava.
    "\\b(?:faz|fazer|faze|comeca|comecar|arranca|arrancar|avanca|avancar|trata)\\b[^\\n]{0,20}?\\b(?:ticket|tarefa|item|sprint|issue|[A-Za-z]{1,4}\\d+)\\b",
  ].join("|"),
  "i"
);

/** Objectos de bookkeeping: acrescentar uma linha ao backlog ou ao CHANGELOG e trabalho que o
 *  proprio `process-rules.md` manda fazer, nao uma implementacao. Sem isto o hook disparava
 *  exactamente em quem esta a seguir o processo — e ruido a cada prompt ensina a ignorar o
 *  lembrete. */
// `(?<![\w-])`: `check-backlog` e um SCRIPT, nao o documento. Sem isto, "muda o
// check-backlog para aceitar XL" — uma ordem de implementacao a serio — era suprimida.
const BOOKKEEPING = /(?<![\w-])(?:backlog|changelog|session\.md|task\.md|decisions\.md|walkthrough|contadores)\b/i;

/** Pedidos de AVALIACAO, nao de implementacao. "reve o diff e diz se alguma coisa corrige o
 *  bug B3" contem `corrige` mas nao manda corrigir nada — manda olhar. Um lembrete de Fase 0
 *  aqui e ruido no caminho de um prompt que nao vai tocar em codigo. */
const AVALIACAO = /^\s*(?:rev[eê]|revisa|revê|analisa|analisar|verifica|verificar|confirma|confirmar|avalia|avaliar|compara|comparar|l[eê]|mostra|mostrar|diz|lista|listar)\b|\b(?:diz\s+se|v[eê]\s+se|verifica\s+se)\b/i;

/** Formas que NAO sao ordens, mesmo contendo um verbo da lista. Sem isto, "como implementar
 *  isto?" e "porque nao corrigiste?" disparavam — e um lembrete numa pergunta e ruido. */
const PERGUNTAS = /^\s*(?:como|porque|porque\s+e\s+que|o\s+que|quando|onde|qual|quais|sera|achas|podes\s+explicar|explica|why|how|what|which|when)\b/i;

/** Uma pergunta com sujeito a frente ("este script adiciona a linha certa?") escapava ao
 *  ancoramento em `^`. Terminar em `?` e o sinal mais fiavel e mais barato. */
const TERMINA_EM_PERGUNTA = /\?\s*$/;

/** O pedido ja traz o plano? Entao a Fase 0 esta a ser feita e o lembrete e ruido. */
// O `\b` vive DENTRO de cada alternativa de palavra, nunca a frente do grupo: um `\b` antes
// de `\/plan` nao casa nunca, porque `/` e espaco sao os dois nao-palavra e nao ha fronteira
// entre eles. Um teste apanhou-o — e e a mesma armadilha que o `surface-patterns.mjs`
// documenta para o `if:` do CI.
const JA_PLANEIA = /(?:\/plan\b|\/grill\b|\b(?:explica|faz|mostra|apresenta|escreve)\s+(?:me\s+)?(?:primeiro\s+)?o?\s*plano\b|\bantes\s+de\s+implementar\b|\bfase\s*0\b)/i;

export function deveLembrar(prompt) {
  if (typeof prompt !== "string" || prompt.trim() === "") return false;
  const p = prompt.trim();
  if (PERGUNTAS.test(p) || TERMINA_EM_PERGUNTA.test(p)) return false;
  if (JA_PLANEIA.test(p)) return false;
  if (BOOKKEEPING.test(p)) return false;
  if (AVALIACAO.test(p)) return false;
  // Negacao explicita: "nao implementar nada ainda, so analisa".
  if (/\bn[\u00e3a]o\s+(?:implement|corrig|acrescent|adicion|mud|alter)\w*/i.test(p)) return false;
  return ORDENS.test(p);
}

const LEMBRETE = [
  "Este pedido parece uma ordem de implementacao. Antes de tocar no codigo, a **Fase 0** do",
  "`.agent/rules/ticket-method.md` exige: o problema, os ficheiros que vao mudar, a abordagem,",
  "**as alternativas rejeitadas e porque**, e o que conta como \"pronto\" em criterios testaveis.",
  "Depois **espera-se pela aprovacao** — nao se comeca a implementar a seguir a explicacao.",
  "",
  "A forma escala com o tamanho:",
  "  `S` (mudar um numero/texto) -> explicacao no chat",
  "  `M`                          -> `.agent/context/implementation_plan.md`",
  "  `L` ou nucleo do dominio     -> ficheiro + `/grill` ANTES, e `plan-auditor` depois",
  "",
  "Se o pedido for ambiguo, correr `.agent/workflows/grill.md` primeiro: interrogar antes de",
  "planear custa menos do que descobrir o desacordo no code review.",
  "",
  "(Lembrete automatico do hook `UserPromptSubmit`. Se ja estas em Fase 0, ignora.)",
].join("\n");

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // sem payload legivel nao ha nada a decidir
  }
  if (!deveLembrar(payload?.prompt)) return;

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: LEMBRETE,
      },
    })
  );
}

// Nao corre ao ser importado pela suite.
if (process.argv[1] && process.argv[1].endsWith("prompt-fase0.mjs")) {
  try {
    main();
  } catch {
    /* falha aberta: este hook esta no caminho de CADA prompt */
  }
  process.exit(0);
}
