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
/** Uma ORDEM de implementacao, ancorada ao **inicio de oracao**.
 *
 *  A versao anterior casava `fix|add|build|change|write|cria|muda|resolve|corrige` em
 *  QUALQUER posicao. Medido: disparava em **14 de 15** frases de conversa normal
 *  ("obrigado, ja resolve", "o build esta a falhar", "esse write esta errado") e calava-se em
 *  **6 de 6** ordens reais. Um lembrete que aparece em quase todos os prompts ensina a
 *  ignora-lo — e o custo que o cabecalho deste ficheiro diz querer evitar.
 *
 *  A causa-raiz nao foi a regex: foi o corpus de teste, escrito a partir dos exemplos de um
 *  revisor em vez do espaco de entrada. Testava o que a implementacao fazia. Ver a suite.
 *
 *  Agora: o verbo tem de abrir a oracao (inicio do prompt, ou depois de `.`/`;`/`,`/newline/
 *  `e `/`and `/`depois `), e aceita a 2a pessoa (`implementas`) e o infinitivo pedido
 *  ("podes implementar"). */
const INICIO_DE_ORACAO = "(?:^|[\\n.;,]\\s*|\\b(?:e|and|depois|then|agora|now|por favor|please)\\s+)";

const VERBOS_PT = "implementa|implementar|implementas|corrige|corrigir|corriges|resolve|resolver|resolves|acrescenta|acrescentar|acrescentas|adiciona|adicionar|adicionas|refactoriza|refatoriza|escreve|escrever|escreves|cria|criar|crias|muda|mudar|mudas|altera|alterar|alteras|apaga|apagar|remove|remover";
const VERBOS_EN = "implement|refactor|rewrite|migrate";
/** Em ingles, `fix`/`add`/`build`/`change`/`write` sao substantivos comuns — so contam com um
 *  objecto a seguir e a abrir a oracao. */
const VERBOS_EN_COM_OBJETO = "fix|add|build|change|write|create|update|remove|delete";

const ORDENS = new RegExp(
  [
    `${INICIO_DE_ORACAO}(?:${VERBOS_PT})\\b`,
    `${INICIO_DE_ORACAO}(?:${VERBOS_EN})\\b`,
    `${INICIO_DE_ORACAO}(?:${VERBOS_EN_COM_OBJETO})\\s+(?:the\\s+|a\\s+|an\\s+)?\\w`,
    // Pedido educado: "podes implementar o X?", "consegues corrigir o Y?"
    `\\b(?:podes|pode|consegues|queres|could\\s+you|can\\s+you|please)\\s+(?:\\w+\\s+){0,2}(?:${VERBOS_PT}|${VERBOS_EN})\\b`,
    // Verbo de arranque + ticket/sprint ou um ID (`B3`, `F12`).
    `${INICIO_DE_ORACAO}(?:faz|fazer|faze|comeca|comecar|arranca|arrancar|avanca|avancar|trata)\\b[^\\n]{0,20}?\\b(?:ticket|tarefa|item|sprint|issue|[A-Za-z]{1,4}\\d+)\\b`,
  ].join("|"),
  "i"
);

/** Perguntas abertas: "como implementar isto?" nao e uma ordem. */
const PERGUNTAS = /^\s*(?:como|porque|porque\s+e\s+que|o\s+que|quando|onde|qual|quais|sera|achas|podes\s+explicar|explica|why|how|what|which|when)\b/i;

/** Uma pergunta com sujeito a frente ("este script adiciona a linha certa?") escapa ao
 *  ancoramento em `^`. Mas **a ordem educada tambem acaba em `?`** — "Podes implementar o
 *  filtro?" e um pedido de trabalho, e suprimi-lo perdia a forma mais comum de todas
 *  (medido: 2 dos 6 falsos negativos). So suprime quando NAO ha pedido educado. */
const TERMINA_EM_PERGUNTA = /\?\s*$/;
const PEDIDO_EDUCADO = /\b(?:podes|pode|consegues|queres|could\s+you|can\s+you|please)\b/i;

/** O pedido ja traz o plano? Entao a Fase 0 esta a ser feita e o lembrete e ruido. */
const JA_PLANEIA = /(?:\/plan\b|\/grill\b|\b(?:explica|faz|mostra|apresenta|escreve)\s+(?:me\s+)?(?:primeiro\s+)?o?\s*plano\b|\bantes\s+de\s+implementar\b|\bfase\s*0\b)/i;

/** Bookkeeping: acrescentar uma linha ao backlog/CHANGELOG e trabalho que o `process-rules.md`
 *  manda fazer, nao uma implementacao. **Mas so suprime quando o artefacto e o OBJECTO do
 *  verbo** — "implementa o ticket B3 do backlog" e uma ordem a serio, e a versao anterior
 *  calava-se nela (medido: 3 falsos negativos, na forma canonica deste template).
 *  `(?<![\w-])` mantem `check-backlog` fora: e um script, nao o documento. */
const BOOKKEEPING =
  /\b(?:adiciona|adicionar|acrescenta|acrescentar|regista|registar|atualiza|atualizar|move|mover)\s+(?:\w+\s+){0,3}(?:ao|no|na|a|o)?\s*(?<![\w-])(?:backlog|changelog|session\.md|task\.md|decisions\.md|walkthrough)\b/i;

/** Pedidos de AVALIACAO, nao de implementacao: "reve o diff e diz se corrige o B3" manda
 *  olhar, nao corrigir. */
const AVALIACAO = /^\s*(?:rev[e\u00ea]|revisa|analisa|analisar|verifica|verificar|confirma|confirmar|avalia|avaliar|compara|comparar|l[e\u00ea]|mostra|mostrar|diz|lista|listar)\b|\b(?:diz\s+se|v[e\u00ea]\s+se|verifica\s+se)\b/i;

export function deveLembrar(prompt) {
  if (typeof prompt !== "string" || prompt.trim() === "") return false;
  const p = prompt.trim();
  if (PERGUNTAS.test(p)) return false;
  if (TERMINA_EM_PERGUNTA.test(p) && !PEDIDO_EDUCADO.test(p)) return false;
  if (JA_PLANEIA.test(p)) return false;
  // Bookkeeping SO suprime quando e a unica coisa pedida. "corrige o bug B7 **e depois**
  // atualiza o backlog" e uma ordem com uma tarefa de registo colada — tirar a clausula e
  // voltar a perguntar e o que distingue as duas.
  if (BOOKKEEPING.test(p) && !ORDENS.test(p.replace(BOOKKEEPING, " "))) return false;
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
