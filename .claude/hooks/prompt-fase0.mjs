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
    // "faz/faz o/faz a" + ticket|feature|bug|...
    "\\b(?:faz|fazer|faze)\\s+(?:o\\s+|a\\s+)?(?:ticket|tarefa|item|bug|feature|issue)\\b",
    // "implementa", "corrige", "resolve", "acrescenta", "cria" + alguma coisa
    "\\b(?:implementa|implementar|corrige|corrigir|resolve|resolver|acrescenta|acrescentar|adiciona|adicionar|refactoriza|refatoriza)\\b",
    // ingles, porque muita gente mistura
    "\\b(?:implement|fix|add|build|refactor)\\s+(?:the\\s+)?(?:ticket|task|bug|feature|issue)\\b",
    // "ticket B3", "B3" sozinho com verbo de arranque
    "\\b(?:comeca|comecar|arranca|arrancar|avanca|avancar)\\s+(?:o\\s+|a\\s+)?(?:ticket|item|sprint)\\b",
  ].join("|"),
  "i"
);

/** Formas que NAO sao ordens, mesmo contendo um verbo da lista. Sem isto, "como implementar
 *  isto?" e "porque nao corrigiste?" disparavam — e um lembrete numa pergunta e ruido. */
const PERGUNTAS = /^\s*(?:como|porque|porque\s+e\s+que|o\s+que|quando|onde|qual|quais|sera|achas|podes\s+explicar|explica|why|how|what|which|when)\b/i;

/** O pedido ja traz o plano? Entao a Fase 0 esta a ser feita e o lembrete e ruido. */
// O `\b` vive DENTRO de cada alternativa de palavra, nunca a frente do grupo: um `\b` antes
// de `\/plan` nao casa nunca, porque `/` e espaco sao os dois nao-palavra e nao ha fronteira
// entre eles. Um teste apanhou-o — e e a mesma armadilha que o `surface-patterns.mjs`
// documenta para o `if:` do CI.
const JA_PLANEIA = /(?:\b(?:plano|planear|planeia|fase\s*0)\b|explica\s+primeiro|antes\s+de\s+implementar|\/plan\b|\/grill\b)/i;

export function deveLembrar(prompt) {
  if (typeof prompt !== "string" || prompt.trim() === "") return false;
  const p = prompt.trim();
  if (PERGUNTAS.test(p)) return false;
  if (JA_PLANEIA.test(p)) return false;
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
