/**
 * Hook `commit-msg`: nenhuma mensagem de commit atribui codigo a uma IA — {{PROJECT_NAME}}
 *
 * A LOGICA do hook. O ficheiro do evento (`.githooks/commit-msg`) e so um ponteiro que a importa:
 * o git exige o nome exato do evento, sem extensao, e o CodeQL escolhe os ficheiros PELA extensao
 * — com a logica la dentro, era codigo que o CI corre e que nenhuma analise lia (#278).
 *
 * PORQUE EXISTE: o `process-rules.md` diz "NUNCA adicionar `Co-Authored-By` (de qualquer agente
 * IA)" desde sempre, e um agente escreveu-o na mesma. Uma mensagem de commit e **imutavel**
 * depois de mergeada: e a categoria de erro onde a prosa custa mais e corrige menos.
 *
 * PORQUE UM HOOK DO GIT, E NAO UM DO CLAUDE CODE: um `PreToolUse` inspecciona a linha de
 * comando, logo ve `git commit -m "..."` e **nao** ve `git commit -F ficheiro` sem abrir o
 * ficheiro — e foi exactamente por `-F` que a regra foi violada. Este hook recebe a mensagem
 * **final**, venha ela de `-m`, `-F`, `--amend`, `-c`, do editor ou de um squash. E vale para
 * qualquer ferramenta e qualquer pessoa, nao so para um agente.
 *
 * COMO SE LIGA (uma vez por clone — o git nao versiona `.git/hooks`):
 *
 *     git config core.hooksPath .githooks
 *
 * O `/setup` e o `BOOTSTRAP.md` mandam correr isto. Quem nao o correr fica sem a rede: e a
 * mesma limitacao honesta que o `TP4` descreve para o gate da superficie de teste — a
 * autoridade que nao depende de configuracao local e o **CI**.
 *
 * BLOCKLIST, E DE PROPOSITO — o `TP6` diz que um allowlist falha fechado e e preferivel, mas
 * aqui o allowlist nao existe: nao ha forma de enumerar os humanos legitimos, e um
 * `Co-Authored-By` de uma pessoa **tem** de passar. Logo enumera-se o que e IA. A lista falha
 * aberta por construcao: um modelo novo com nome novo passa ate alguem o acrescentar. Esta
 * escrita para ser facil de estender, e a mensagem de recusa diz onde.
 */

import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

/** A raiz do repo DESTE ficheiro (`.githooks/lib/`): e dela que vem a lib da lista. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** O repo do COMMIT: o git corre o hook na raiz da worktree. E outro que o `RAIZ` quando o `core.hooksPath` aponta
 *  para os hooks de outro clone — e e este que decide o interruptor e o "lista dentro do repo" (#375). */
const REPO = process.cwd();

/** O caracter de comentario do git (`core.commentChar`, `#` por omissao; `auto` escolhe um que a mensagem nao
 *  use, e entao a tesoura e os comentarios ficam no `#` que a maioria tem). */
function caracterDeComentario() {
  try {
    const c = execFileSync("git", ["config", "--get", "core.commentChar"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return c && c !== "auto" ? c : "#";
  } catch {
    return "#";
  }
}

/** Os NOMES PROIBIDOS (#375): a lista vive fora do repo, e a lib que a le em `.agent/scripts/lib/` (o `/upgrade`
 *  copia essa pasta sozinho; esta vai para a fronteira). Importada assim, e nao no topo, para uma lib em falta
 *  (um derivado antigo) RECUSAR com a razao em vez de rebentar com um `ERR_MODULE_NOT_FOUND` sem contexto. */
let nomes;
let erroDaLib;
try {
  nomes = await import(pathToFileURL(join(RAIZ, ".agent/scripts/lib/nomes-proibidos.mjs")).href);
} catch (err) {
  erroDaLib = err;
}

/** Recusa o commit: imprime e sai `!= 0`. Existe como FUNCAO e nao como `console.error` +
 *  `process.exit` soltos pela mesma razao que o `fatal()` dos verificadores deste repo — a
 *  varredura de mutacao procura sitios por nome, e dezasseis `console.error` soltos faziam-na
 *  contar cada linha de formatacao como um sitio a cobrir. Medido: `7/16`, com as nove por
 *  cobrir a serem linhas em branco. Com uma funcao, os sitios sao as DECISOES. */
function recusar(titulo, detalhe = []) {
  console.error("");
  console.error(`  ${titulo}`);
  console.error("");
  for (const l of detalhe) console.error(`  ${l}`);
  console.error("");
  process.exit(1);
}

/** Nomes que identificam uma ferramenta de IA. Acrescentar aqui quando aparecer outro.
 *
 *  `\b` em TODOS os nomes curtos que sao tambem nomes de pessoa ou pedacos de palavra. Medido:
 *  `aider` casava dentro de **Haider** e recusava o commit de `Ali Haider`; `devin` e `cody` sao
 *  nomes proprios correntes. Um hook que recusa uma pessoa real ensina a contorna-lo com
 *  `--no-verify`, e ai deixa de haver hook. Os nomes longos e inequivocos (`anthropic`,
 *  `sourcegraph`) nao precisam de ancora.
 *
 *  NUMA SO LINHA, de proposito (#278): e uma constante do PROJETO (`CONSTANTES_DO_PROJETO`, em
 *  `.agent/scripts/lib/upgrade-categorias.mjs`) — o `/upgrade` copia este ficheiro e repoe por
 *  cima a lista que o projeto tiver alterado, e le-a pela linha `const IA = ...;`. */
const IA = /\bclaude(?:[_-]?(?:code|ai|bot|agent|opus|sonnet|haiku))?(?:[_-]?\d[\w.]*)?\b|anthropic|chatgpt|openai|gpt-[0-9]|\b(?:github)?copilot(?:chat|bot)?\b|\bgemini(?:cli|ai|pro|flash|code\w*)?(?:[_-]?\d[\w.]*)?\b|\bbard\b|\bcursor(?:ai|agent)?\b|\bcodeium\b|\bwindsurf|\bdevin\b|\baider\b|sourcegraph|\bcody\b|\bllama\b|\bmistral\b|deepseek|\bgrok\b|\bcodex\b|\bcline\b|\broo\s?code\b|\bjules\b|\bjunie\b|ampcode|\bqwen\b|\bkimi\b|\btabnine|\breplit\b|\blovable\b|bolt\.new|\btrae\b|augmentcode/i;

/** Nas linhas "generated with", o que separa a PROSA da atribuicao (#289). E prosa, e passa:
 *  - o nome todo em MINUSCULAS, sem digitos, seguido de um substantivo comum em minusculas:
 *    `cursor pagination`, `gemini style prompts`, `cursor-based pagination` — a ferramenta como
 *    palavra, nao como nome;
 *  - um produto CONSTRUIDO com o modelo — so com o verbo `built` — com `API`/`SDK` nas palavras
 *    seguintes, sem atravessar pontuacao (`Built with Gemini API`, `the Claude Agent SDK`).
 *  Tudo o resto recusa: o nome com maiuscula (`Claude then edited`, `Copilot suggestions`), no fim
 *  da frase, seguido de pontuacao, URL, de uma palavra com maiuscula/digito/`_`, um identificador de
 *  modelo (`gpt-4o prompts`), um sufixo de autoria (`claude-assisted`) ou uma palavra de
 *  `NAO_E_PROSA` — de produto (`code`, `workspace`) ou que liga a atribuicao ao resto (`by`, `and`,
 *  `then`). Prosa com o nome em maiuscula (`replies generated by Gemini`) ou seguido de um conector
 *  (`cursor and offset pagination`) e recusa ASSUMIDA, como a do `Devin`: tem a forma de
 *  `This PR was generated with Claude Code`, ou de `copilot and reviewed by me`.
 *
 *  Pelo que vem DEPOIS do nome, e nao "o valor e so o nome" (deixava passar `**Generated with
 *  Claude Code**`, medido). Sem backtracking catastrofico — so repeticoes LIMITADAS e sobre classes
 *  disjuntas, e cada caracter do valor visto um numero constante de vezes: o CI corre isto sobre as
 *  mensagens de um PR, e uma versao anterior pendurava numa linha com URLs colados. */
const NAO_E_PROSA = /^(?:code|agent|ai|assist|assistant|assistance|help|support|chat|cli|coding|pro|max|opus|sonnet|haiku|flash|ultra|mini|turbo|plus|model|models|workspace|composer|cascade|desktop|app|canvas|advanced|edits|suggestions|autocomplete|dev|and|or|but|then|as|after|at|while|during|so|which|that|by|from|via|with|using|under|for|to|the|a|an|in|on)$/;
const PRODUTO_QUE_USA = /^(?:[ \t]+[\w'’-]+){0,4}?[ \t]+(?:apis?|sdks?)\b/i;
const SUFIXO_DE_AUTORIA = /-(?:assisted|generated|written|authored|made|powered|driven)\b/i;
/** As flags da `IA` sem `g`/`y`: com elas o `test` guardava `lastIndex` entre linhas, e um trailer
 *  a seguir a outro que casou passava. Um derivado que tire o `i` mantem essa decisao. */
const FLAGS = IA.flags.replace(/[gy]/g, "");
const IA_UMA = new RegExp(IA.source, FLAGS);
const IA_TODAS = new RegExp(IA.source, `${FLAGS}g`);

/** Alguma ferramenta no valor que NAO seja prosa? `construido`: o verbo e `built`. */
function atribuiAUmaFerramenta(valor, construido) {
  let fim = 0;
  for (const m of valor.matchAll(IA_TODAS)) {
    // Uma ocorrencia DENTRO do sufixo da anterior (`claude-claude-...`) ja foi decidida: sem isto,
    // cada uma relia o sufixo inteiro, e uma linha longa custava tempo quadratico.
    if (m.index < fim) continue;
    // `gpt-4o`, `claude-3-5-sonnet`, `OpenAI's`: o resto do nome nao e a palavra seguinte. O ponto
    // so conta dentro do nome (`4.5`); seguido de espaco e pontuacao.
    const sufixo = /^(?:[\w'’-]|\.(?=\w))*/.exec(valor.slice(m.index + m[0].length))[0];
    fim = m.index + m[0].length + sufixo.length;
    if (SUFIXO_DE_AUTORIA.test(sufixo)) return true;
    const resto = valor.slice(fim);
    if (construido && PRODUTO_QUE_USA.test(resto)) continue;
    // Um identificador de modelo nunca e um substantivo comum.
    if (/\d/.test(m[0] + sufixo)) return true;
    // Um URL a seguir ao nome (`Claude https://...`) e atribuicao, nao a palavra `https`.
    const palavra = /^[ \t]+([A-Za-z][\w-]*)(?!:\/\/)\b/.exec(resto)?.[1];
    const emMinusculas = m[0] === m[0].toLowerCase();
    if (emMinusculas && palavra && /^[a-z][a-z-]*$/.test(palavra) && !NAO_E_PROSA.test(palavra.split("-")[0])) continue;
    return true;
  }
  return false;
}

/** Formas conhecidas de atribuir autoria numa mensagem de commit. `decide` recebe o valor e diz
 *  se e atribuicao; por omissao, se casa a `IA`. */
const FORMAS = [
  {
    // O trailer canonico. So reprova quando o valor **e** uma IA: um co-autor humano passa.
    re: /^\s*co-authored-by:\s*(.+)$/i,
    valor: (m) => m[1],
    nome: "trailer `Co-Authored-By`",
  },
  {
    re: /^\s*(?:signed-off-by|assisted-by|generated-by|authored-by):\s*(.+)$/i,
    valor: (m) => m[1],
    nome: "trailer de autoria",
  },
  {
    // "Generated with X", "Made with X", com ou sem o emoji e com ou sem link markdown, em
    // QUALQUER sitio da linha. Ancorar o verbo ao inicio deixava passar `This PR was generated
    // with Claude Code`, `1. Generated with ...`, `- [x] Generated with ...` (medido no #289), e
    // custava tempo quadratico numa linha de hifens. O valor e tudo o que segue o PRIMEIRO
    // verbo, logo uma atribuicao mais a frente (`Built with love, generated with Claude Code`)
    // esta nele; quem decide e `atribuiAUmaFerramenta`.
    re: /(generated|created|made|written|built)\s+(?:with|by)\s+(.+)$/i,
    valor: (m) => m[2],
    decide: (v, m) => atribuiAUmaFerramenta(v, /^built$/i.test(m[1])),
    nome: "linha de \"generated with\"",
  },
  {
    // O emoji de robo sozinho ja e atribuicao: nenhum commit deste repo precisa dele.
    re: /(🤖)/u,
    valor: (m) => m[1],
    decide: () => true,
    nome: "emoji de robo",
  },
];

/**
 * Recusa uma mensagem que nomeie uma entrada da lista de NOMES PROIBIDOS (#375). Sem lista, passa calado: o CI
 * corre este hook sobre cada mensagem de um PR, e la nunca ha lista (quem o diz e o comando
 * `check-textos-publicos.mjs`). Num repo DESLIGADO (`git config --local`), tambem: num repo privado os nomes podem
 * ser legitimos. Uma lista que existe e nao serve recusa. Corre ANTES da verificacao da IA, que imprime a linha:
 * com um nome nela, era por ai que ele saia. As recusas citam as LINHAS, nunca o nome: quem as le pode ser um agente.
 * @param {{ texto: string, n: number }[]} linhas  a mensagem, sem os comentarios do git, com a linha do FICHEIRO
 */
function verificaNomes(linhas) {
  if (!nomes) {
    recusar("COMMIT RECUSADO — nao consegui carregar a lista de nomes proibidos.", [
      `\`.agent/scripts/lib/nomes-proibidos.mjs\`: ${erroDaLib instanceof Error ? erroDaLib.message : String(erroDaLib)}`,
      "Um projeto anterior a v0.61.0: o `/upgrade` traz a lib (o `.agent/scripts/` copia-se sozinho).",
    ]);
  }
  const lista = nomes.carregaLista({ raiz: REPO });
  if (lista.estado === "sem-lista") return;
  // Desligado passa, mas DIZ-O: calado, um interruptor ligado por engano ficava invisivel para sempre.
  if (lista.estado === "desligado") {
    console.error(`  commit-msg: os nomes proibidos estao DESLIGADOS neste repo (git config --local ${nomes.INTERRUPTOR}).`);
    return;
  }
  if (lista.estado !== "ok") {
    recusar(`COMMIT RECUSADO — ${nomes.RAZOES[lista.estado]}.`, [
      `A lista: ${lista.caminho} (\`$${nomes.VARIAVEL}\` muda o caminho).`,
      "Corrigir a lista, ou retira-la (sem lista nao ha verificacao). Nunca com --no-verify.",
    ]);
  }
  const re = nomes.padroes(lista.nomes);
  const achados = linhas.flatMap((l) => nomes.encontra(l.texto, re).map((n) => `linha ${l.n} da mensagem: o nome da linha ${n} da lista`));
  if (achados.length === 0) return;
  recusar("COMMIT RECUSADO — a mensagem nomeia um nome da lista de nomes proibidos.", [
    ...achados,
    "",
    `A lista: ${lista.caminho}. Reescrever essas linhas da mensagem e repetir o commit.`,
    "Uma mensagem de commit e imutavel depois de mergeada, e um repo publico nao a esquece.",
    "Num repo PRIVADO, onde estes nomes podem ser legitimos, quem decide desligar e o UTILIZADOR, nunca um agente:",
    "o interruptor esta em `src/docs/upgrade-why.md`, \"O contrato da lista de nomes proibidos (#375)\".",
  ]);
}

/**
 * Corre o hook sobre o ficheiro da mensagem que o git passa (`$1`). Sai `0` se a mensagem esta
 * limpa; recusa (sai `1`) se atribui o trabalho a uma IA, ou se nao a consegue ler.
 * @param {string | undefined} caminho
 */
export function correr(caminho) {
  // Sem argumento nao ha nada para ler. Reprovar, e nao deixar passar: um hook que "nao
  // conseguiu medir" a dizer OK e o `TP2` aplicado a si proprio.
  if (!caminho) recusar("commit-msg: o git nao passou o ficheiro da mensagem — nao consigo verificar.");

  let msg = "";
  try {
    msg = readFileSync(caminho, "utf8");
  } catch (err) {
    recusar(`commit-msg: nao consegui ler ${caminho}: ${err.message}`);
  }

  // Os comentarios do git (`#` no inicio da linha) ficam fora da verificacao da IA — senao o texto de ajuda do
  // proprio git podia disparar o hook. (Com o editor o git apaga-os; com `-m`/`-F` nao, e os nomes leem-nos.)
  // `\r\n` (Windows) e `\r` sozinho: uma mensagem escrita assim (`git commit -F`) deixava um `\r`
  // na linha, e o `(.+)$` das formas deixava de casar — escapava tudo menos o emoji (#289).
  // A TESOURA do `git commit -v` (`# --- >8 ---`): o git apaga tudo abaixo dela, e o diff que la vem nao comeca
  // por `#`. Sem o corte, apagar um nome vazado de um ficheiro (`-nome` no diff) recusava o commit que o tira.
  // Cada linha guarda o numero que tem no FICHEIRO, antes de sairem os comentarios: e esse que a recusa cita.
  // A tesoura e os comentarios seguem o `core.commentChar` do repo.
  // So conta a tesoura com a FORMA que o git escreve (#399): comentarios e logo um `diff --git`/`--cc`/`--combined` ou
  // um `Submodule ` (o `diff.submodule=log`, medido), ou nada.
  // Num `-m`/`-F` o git nao corta, e uma tesoura escrita a mao escondia o que vinha depois. Corta-se so o diff: os
  // comentarios entre a tesoura e ele (o bloco de estado do `commit.cleanup=scissors`) leem-se, como acima dela.
  // Limite: uma tesoura forjada seguida de uma dessas linhas passa (barreira contra o descuido). E as linhas `#` nao
  // contam para a atribuicao, embora com `-m` o git as guarde (ja antes do #399).
  const c = caracterDeComentario().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const comentario = new RegExp(`^${c}`);
  const todas = msg.split(/\r\n|\r|\n/);
  const inicioDoDiff = (i) => {
    let j = i + 1;
    while (j < todas.length && comentario.test(todas[j])) j++;
    return todas.slice(j).every((l) => l.trim() === "") || /^(?:diff --(?:git|cc|combined) |Submodule )/.test(todas[j]) ? j : -1;
  };
  const tesoura = todas.findIndex((l, i) => new RegExp(`^${c} -+ >8 -+$`).test(l) && inicioDoDiff(i) >= 0);
  const acima = (tesoura >= 0 ? todas.slice(0, inicioDoDiff(tesoura)) : todas).map((texto, i) => ({ texto, n: i + 1 }));
  const linhas = acima.filter(({ texto }) => !new RegExp(`^\\s*${c}`).test(texto));

  // Os NOMES leem TODAS as linhas acima do diff, comentarios incluidos: com `-m`/`-F` e sem editor, o git
  // so limpa espacos (`--cleanup=whitespace`), e uma linha `#339 ...` FICA na mensagem. Um nome num comentario
  // que o git apagaria (o branch no texto de estado) tambem recusa: falha fechado.
  verificaNomes(acima);

  const achados = [];
  for (const { texto: linha, n } of linhas) {
    for (const f of FORMAS) {
      const m = linha.match(f.re);
      if (!m) continue;
      // Cada forma decide pelo seu `decide`; por omissao (os trailers), basta casar a `IA` — e
      // so ela, senao um co-autor humano era recusado.
      if (!(f.decide ?? ((v) => IA_UMA.test(v)))(f.valor(m), m)) continue;
      achados.push({ n, linha: linha.trim(), forma: f.nome });
    }
  }

  if (achados.length === 0) process.exit(0);

  recusar("COMMIT RECUSADO — a mensagem atribui o trabalho a uma ferramenta de IA.", [
    ...achados.flatMap((a) => [`  linha ${a.n} (${a.forma}):`, `    ${a.linha}`]),
    "",
    "A regra esta em `.agent/rules/process-rules.md` (Regra de Git): commits limpos, so com",
    "o conteudo descritivo da alteracao. Uma mensagem de commit e imutavel depois de mergeada",
    "— por isso isto reprova aqui, e nao no review.",
    "",
    "Apagar as linhas acima e repetir o commit.",
    "Falso positivo? Nunca com --no-verify. Depende da forma que disparou:",
    "  - numa linha \"generated with\" que e prosa: reformular a frase. Tirar o nome da lista",
    "    desarmava tambem os trailers;",
    "  - num trailer de um co-autor humano cujo nome casa a lista: a lista `IA` vive em",
    "    `.githooks/lib/commit-msg.mjs` (o `.githooks/commit-msg` importa-a) — ajustar la.",
  ]);
}
