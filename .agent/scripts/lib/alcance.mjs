/**
 * O ALCANCE dos guards, derivado do disco — {{PROJECT_NAME}}
 *
 * ## Porque existe
 *
 * Tres guards varrem o repo a procura de coisas diferentes, e cada um tem a sua lista de pastas
 * **escrita a mao**:
 *
 *   Guard 13 (`guards/placeholders.mjs`)   placeholders `{{ }}` esquecidos   16 pastas
 *   Guard 15 (`guards/anti-patterns.mjs`)  citacoes `TP` que resolvem        11 pastas
 *   Serie 12 (`guards/derived-counts.mjs`) contagens em prosa coerentes       3 pastas
 *
 * **As diferencas nao sao todas defeito** — os tres perguntam coisas diferentes. O defeito e
 * que uma pasta em falta **nao produz erro nenhum: produz silencio**. E a classe ja apareceu
 * CINCO vezes:
 *
 *   1-3. as tres do historico do #117 (hooks, `scripts/lib`, `tests/` e `tests/harness`);
 *   4.   `.claude/hooks/lib/` fora do Guard 15 (#136);
 *   5.   e a mais instrutiva: ao extrair codigo para `lib/` durante o #136, a contagem do
 *        proprio Guard 15 **DESCEU** de 136 para 135. Mover codigo tirava-o da rede, e so
 *        apareceu porque alguem foi verificar uma diferenca de 1.
 *
 * Duas delas estavam **vivas** quando este modulo nasceu: `.agent/scripts/config/` fora do
 * Guard 13 com placeholders nos dois ficheiros, e `.agent/scripts/tests/` fora do Guard 15 com
 * **30** ficheiros a citar anti-padroes.
 *
 * ## O que este modulo NAO faz
 *
 * Nao iguala os tres alcances, e nao substitui as listas. Deriva a **base** — que pastas do repo
 * contem ficheiros que um dado guard deveria olhar — para que o teste do alcance possa exigir
 * que cada uma esteja **coberta ou explicitamente excluida com a razao**.
 *
 * Tapar a sexta lacuna a mao custava o mesmo que tapou as cinco. O que muda aqui e a omissao
 * passar de silenciosa a vermelha.
 */
import { readFileSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";

/** Pastas que nunca entram: nao sao do repo, ou nao sao editadas por pessoas. */
const IGNORA = new Set([".git", "node_modules", "dist", "build", "coverage", ".next"]);

/** Extensoes que um guard pode ter de olhar. O `.toml` vem dos comandos do Gemini, o `.mdc` das
 *  rules do Cursor — e os dois ja estiveram fora de uma lista a mao. */
const EXTENSOES = /\.(?:md|mdc|mjs|toml|ya?ml)$/;

/**
 * Varre o repo e devolve, por PASTA, os ficheiros cujo conteudo casa `interessa`.
 *
 * A pergunta e sempre a mesma — "que pastas tem ficheiros que este guard deveria olhar?" — e a
 * resposta vem do DISCO, nao de uma lista. Uma pasta nova com conteudo relevante aparece aqui
 * no dia em que nasce, sem ninguem se lembrar de nada.
 *
 * @param {string} raiz a raiz do repo
 * @param {(src: string, rel: string) => boolean} interessa o que torna um ficheiro relevante
 * @returns {Map<string, string[]>|null} pasta -> ficheiros VERSIONADOS e relevantes; `null`
 *          se a arvore nao estiver versionada (ai nao ha resposta honesta a dar)
 */
export function pastasComCandidatos(raiz, interessa) {
  const encontradas = new Map();
  // AO GIT PRIMEIRO, e nao ao disco. A primeira versao varria o filesystem e acusava ficheiros
  // IGNORADOS — relatorios locais que ninguem publica — como lacunas de alcance. Um guard cuida
  // do que o repo ENTREGA, e o que o repo entrega e o que esta versionado.
  //
  // O FALLBACK existe porque um projeto DERIVADO acabado de bootstrapar ainda nao commitou nada:
  // ali `git ls-files` devolve vazio e o mapa saia vazio, o que fazia o contra-caso desta suite
  // reprovar. Foi o `simulate-derived` a dize-lo — a assercao dependia deste repo estar
  // versionado, que e o `TP3`. Numa arvore por versionar nao ha ficheiros ignorados a confundir,
  // logo o disco e uma fonte honesta la.
  const listados = versionados(raiz);
  // SEM GIT NAO HA RESPOSTA, e devolve-se `null` em vez de adivinhar. O primeiro fallback andava
  // no disco, e isso reintroduzia o defeito que o git resolveu: a fixture do `simulate-derived` e
  // uma COPIA deste repo sem `.git`, logo trazia os ficheiros locais IGNORADOS atras e eles
  // apareciam como lacunas de alcance. Um `null` deixa quem chama anunciar um SKIP visivel; um
  // fallback silencioso trocava um falso negativo por um falso positivo.
  if (listados === null) return null;
  for (const rel of listados) {
    if (!EXTENSOES.test(rel) && !/(?:^|\/)CODEOWNERS$/.test(rel)) continue;
    if (rel.split("/").some((seg) => IGNORA.has(seg))) continue;
    let src;
    try {
      src = readFileSync(join(raiz, rel), "utf8");
    } catch {
      continue;
    }
    if (!interessa(src, rel)) continue;
    const pasta = dirname(rel) === "." ? "." : dirname(rel);
    const nome = rel.slice(rel.lastIndexOf("/") + 1);
    encontradas.set(pasta, (encontradas.get(pasta) ?? []).concat(nome));
  }
  return encontradas;
}

/** Os ficheiros que o git conhece, ou `null` se nao houver git (ou nada versionado). */
function versionados(raiz) {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\0")
      .filter(Boolean);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Um ficheiro com placeholders por substituir — o que o Guard 13 procura. */
export const TEM_PLACEHOLDER = (src) => /\{\{\s*[A-Z_]+\s*\}\}/.test(src);

/** Um ficheiro que CITA um anti-padrao — o que o Guard 15 tem de conseguir resolver.
 *
 *  O `(?![\w-])` impede que um ID de um digito case dentro de um de dois, e que a palavra
 *  case dentro de um identificador. A definicao vive nos catalogos; aqui so se pergunta
 *  quem a MENCIONA. (Este comentario nao da exemplos com IDs: um ID inventado num exemplo
 *  e uma citacao morta aos olhos do Guard 15 — medido, neste mesmo ficheiro.) */
export const CITA_ANTIPADRAO = (src) => /\b(?:TP|AP)\d+(?![\w-])/.test(src);

/** Um ficheiro com uma CONTAGEM escrita em prosa — o que a serie 12 verifica.
 *
 *  Deliberadamente estreito: so as formas que a serie 12 sabe derivar. Alargar isto sem alargar
 *  o guard produzia uma lista de pastas que ele nao consegue verificar, que e pior que nenhuma. */
export const TEM_CONTAGEM_EM_PROSA = (src) =>
  /\b\d+\s+(?:pontos|fases|guards numerados|workflows|comandos)\b/.test(src);

/** Existe? (para nao acusar uma pasta que o bootstrap ainda nao criou) */
export const existe = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
