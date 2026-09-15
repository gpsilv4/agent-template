/**
 * A fronteira nao se reescreve a si propria — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: o `deny` do `.claude/settings.json` cobre `Edit`/`Write` e **nao cobre
 * `Bash`**. Um `sed -i`, um `>`, um `node -e`, um `mv`, um `rm`, um `chmod` ou um `git rm`
 * sobre `.claude/settings.json`, `.claude/hooks/` ou `.githooks/` reescreviam a fronteira sem
 * passar por nenhuma das duas ferramentas — e o `BOOTSTRAP.md` vendia essa linha como "sem
 * ela, o agente alarga as proprias permissoes". Vendia mais do que entregava.
 *
 * DESENHO: **allowlist dos verbos de leitura**, nao blocklist dos de escrita (`TP6`). As
 * formas de escrever um ficheiro em shell nao sao enumeraveis — redireccao, `tee`, `sed -i`,
 * `perl -i`, `mv`, `cp`, `dd`, `install`, um interpretador qualquer. As de LER sao poucas.
 *
 * TRES FALSOS POSITIVOS, TODOS MEDIDOS AO USAR A PROPRIA VERIFICACAO, no mesmo dia em que
 * nasceu — e e por isso que este ficheiro existe a parte, com testes proprios:
 *   1. negava `for s in a b; do node .claude/hooks/tests/test-hooks.mjs; done`, porque olhava
 *      para o primeiro verbo da LINHA e nao do segmento. Correr a suite dos hooks e trabalho
 *      normal;
 *   2. um `|` dentro de aspas (`grep 'a\|b' .claude/hooks/x`) partia o comando e produzia um
 *      segmento cujo "verbo" era um pedaco do padrao de procura;
 *   3. negava escrever um ficheiro noutro sitio cujo CONTEUDO mencionava a fronteira — um
 *      heredoc a documentar esta mesma regra.
 *
 * O principio que sai dai: um caminho **citado** e texto; so um caminho em posicao de
 * ARGUMENTO e um alvo. Um guard que nega trabalho normal e contornado, e ai deixa de
 * proteger o que interessa.
 *
 * O caminho que fica deliberadamente aberto e a ferramenta `Edit`: o `settings.json` esta em
 * `deny` e os hooks em `ask`, logo a alteracao legitima passa por uma aprovacao humana.
 */

/** Os caminhos que constituem a fronteira. */
const FRONTEIRA = /(?:^|[\s"'`=(])(?:\.\/)?(?:\.claude\/(?:settings(?:\.local)?\.json|hooks\/)|\.githooks\/)/;

/** Verbos que apenas LEEM. Tudo o que nao esta aqui e tratado como escrita. */
const LEITURA = new Set([
  "cat", "bat", "less", "more", "head", "tail", "wc", "grep", "rg", "egrep", "fgrep", "awk",
  "sed", "jq", "diff", "cmp", "md5", "md5sum", "shasum", "sha256sum", "file", "stat", "ls",
  "find", "realpath", "dirname", "basename", "node", "test", "wl-copy", "pbcopy", "echo", "printf",
  // `git` le e encena; o destrutivo dele ja e tratado pela lista SEGUROS do hook. Sem ele,
  // `git diff .claude/settings.json` era negado — e e precisamente o que se quer poder correr.
  "git",
]);

/** Corpos de heredoc e conteudo entre aspas sao TEXTO, nao argumentos. Substituidos por vazio
 *  antes de procurar a fronteira: e o que separa "escrever um ficheiro que a menciona" de
 *  "escrever a fronteira". O comprimento nao interessa aqui — so a presenca. */
const semCitacoes = (t) =>
  t
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?^[\t ]*\2[\t ]*$/gm, " <<HEREDOC ")
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, ' "" ');

/** Wrappers que executam o que lhes chega em texto: ai o conteudo citado **e** comando. */
const OPACO = /\b(?:eval|xargs)\b|\b(?:sh|bash|zsh|dash|ksh)\b[^\n]*\s-c\b/;

/** Interpretadores a correr codigo INLINE. Correr um FICHEIRO e leitura; `-e` escreve. */
const CODIGO_INLINE = /\b(?:node|deno|bun|python3?|ruby|perl|php)\b[^\n]*\s(?:-e|-p|--eval|--print|-c)\b/;

/**
 * @param {string} texto o comando completo
 * @returns {boolean} true se o comando ESCREVE na fronteira e deve ser negado
 */
export function alteraFronteira(texto) {
  const visivel = semCitacoes(texto);
  const opaco = OPACO.test(texto);
  const inline = CODIGO_INLINE.test(texto);

  // A fronteira so aparece DENTRO de aspas ou de um heredoc: e texto. Excepto quando o
  // comando executa esse texto (`eval`, `sh -c`) ou o passa a um interpretador (`node -e`),
  // que foi como o `node -e "...writeFileSync('.claude/settings.json')..."` se escondia.
  if (!FRONTEIRA.test(visivel)) return FRONTEIRA.test(texto) && (opaco || inline);

  // Por SEGMENTO, e com as citacoes ja removidas — senao um `|` dentro de aspas parte o
  // comando e o "verbo" do segmento seguinte e um pedaco do padrao de procura.
  const segmentos = visivel.split(/(?:&&|\|\||[;|\n])+|\bdo\b|\bthen\b/);
  const tocam = segmentos.filter((s) => FRONTEIRA.test(s));
  if (tocam.length === 0) return false;

  const alvo = tocam.join("\n");
  const primeiro = tocam[0].trim().split(/\s+/)[0].replace(/^.*\//, "");
  const editaNoSitio = /\b(?:sed|perl|ruby|python3?)\b[^\n]*\s-[a-zA-Z]*i\b/.test(alvo);
  // Uma allowlist por BINARIO e grossa quando o binario tem sub-verbos que apagam: `git rm`,
  // `git restore` e `git checkout --` passavam por `git` estar na lista. Medido ao remover um
  // hook obsoleto, minutos depois de escrever esta verificacao.
  const gitQueEscreve = /^git\b[^\n]*\s(?:rm|mv|restore|checkout|clean|stash)\b/.test(alvo.trim());
  const redireciona = /(?:^|[^>\d])>{1,2}\s*(?:\.\/)?(?:\.claude|\.githooks)\//.test(alvo) || /\btee\b/.test(alvo);

  return !LEITURA.has(primeiro) || editaNoSitio || inline || opaco || redireciona || gitQueEscreve;
}

/** A razao, escrita uma vez e usada pelo hook e pelos testes. */
export const RAZAO_FRONTEIRA =
  "A configuracao de fronteira (`.claude/settings.json`, `.claude/hooks/`, `.githooks/`) nao " +
  "se altera por `Bash`. O `deny` do settings so cobre `Edit`/`Write`, logo esta verificacao " +
  "existe para fechar o resto — um agente que reescreva a propria fronteira deixa a sessao " +
  "seguinte sem nenhuma. Editar com a ferramenta `Edit` (que pede aprovacao para os hooks e " +
  "recusa o settings), ou a mao, fora do agente.";
