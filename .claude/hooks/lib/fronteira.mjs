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

import { levaMarcador, normalizaCaminhos, pedacosDe, REDIRECCAO_INOFENSIVA, semCitacoes, semCorposDeHeredoc, substituicoes } from "./caminhos.mjs";
// O hook pede o contexto aqui, como antes; a normalizacao de caminhos vive em `caminhos.mjs`.
export { contextoFronteira, executaCrase } from "./caminhos.mjs";
// Os caminhos da fronteira (`CAMINHOS_FRONTEIRA`, `ehCaminhoFronteira`, `MAES`), o regex `FRONTEIRA`
// e a `resto()` vivem no modulo-FOLHA (#243): este ficheiro e o `caminhos.mjs` importavam-se um ao
// outro. So `CAMINHOS_FRONTEIRA` e `ehCaminhoFronteira` se reexportam daqui (sao os que tem quem os
// importe deste ficheiro); `MAES` e `resto` importam-se da folha. A `ATRIBUICAO_LARGA` (#546) ja ninguem a importa daqui
// (#580), e FICA: num `/upgrade` parcial a `lib/` chega antes dos hooks, e o guard dos branches ANTIGO rebentava no import.
import { escritaDoBloco, FRONTEIRA, NOMEIA, PALAVRAS_DE_BLOCO, resto } from "./fronteira-dados.mjs";
import { comandos } from "./comandos.mjs";
import { aJusante, inlineDe } from "./posicao.mjs";
import { recebeDe } from "./recebe.mjs";
import { valoresQueExecutam } from "./verbos-git.mjs";
// O PISO (os verbos de LEITURA, as regex do texto e as saidas do `git`) vive no `fronteira-piso.mjs` desde o #631.
import { ADIADA, CODIGO_INLINE, FIND_QUE_ESCREVE, GIT_QUE_ESCREVE as GIT_ESCREVE, INLINE_SEM_ISENCAO, LEITURA, OPACO, RECEBE_CODIGO, saidasDoGit } from "./fronteira-piso.mjs";
// Numa constante, e nao so dentro das template strings das duas regex do `git`: o `check-codigo-morto` nao ve esse uso,
// e dava o import por morto (o mesmo do #599). O valor e o mesmo; as linhas do `julga` nao mudam.
const GIT_QUE_ESCREVE = GIT_ESCREVE;
export { ATRIBUICAO_LARGA, CAMINHOS_FRONTEIRA, ehCaminhoFronteira } from "./fronteira-dados.mjs";

/** Este segmento so muda de directorio? Pelo verbo REAL, depois das cabecas (`if cd X`, `builtin
 *  cd X`) — e SEM redireccao nem substituicao: `cd /tmp > <fronteira>` trunca o ficheiro, e o
 *  `$(...)`/crase de `cd $(rm <fronteira>)` corre (a terceira leitura do #185 apanhou os dois). */
//  Sem contar as redireccoes INOFENSIVAS (`2>/dev/null`, `>&2`): `cd X 2>/dev/null && cat y` e leitura.
const soMudaDeDirectorio = (s) =>
  !/[<>`]|\$\(/.test(s.replace(REDIRECCAO_INOFENSIVA, " ")) &&
  ["cd", "pushd", "popd"].includes((resto(s.replace(/[()]/g, " "))[0] ?? "").replace(/^.*\//, ""));

// O texto citado — o que e texto, o que e caminho e o que o shell executa — le-se em
// `lib/caminhos.mjs` (`semCitacoes`). Saiu daqui quando este ficheiro chegou as 500 linhas (#229).

/** Marca um sitio de RECUSA. Devolve o rotulo tal e qual — nao faz nada.
 *
 *  PORQUE EXISTE, e nao e arrumacao: a varredura de mutacao desliga um sitio de recusa de cada
 *  vez e exige que a suite fique vermelha. Ela sabe fazer isso a **chamadas** (11 dos 13 sinais
 *  do `pares.mjs` sao chamadas; um e uma atribuicao), e as recusas deste ficheiro eram sete
 *  `return` em tres sintaxes diferentes — string literal, template literal e um ternario. Um
 *  regex que apanhasse as tres sem apanhar o `return null` era fragil, e uma lista de rotulos
 *  escrita a mao ao lado do codigo seria um `TP8` a espera de acontecer.
 *
 *  Com esta funcao, o sinal e `nega(` — a mesma forma que a ferramenta ja entende. O ficheiro
 *  passa a ter a forma que ela le, em vez de lhe ensinarmos sintaxe nova.
 *
 *  Ha precedente escrito no repo: a `avaliar()` do `test-harness.mjs` foi extraida como funcao
 *  pura **precisamente** para a varredura a poder cobrir, depois de medir 0/9 nesse ficheiro.
 *  O cabecalho dela di-lo. Esta e a mesma troca: uma linha de producao por uma rede. */
const nega = (rotulo) => rotulo;

/** O primeiro comando que corre codigo inline, por posicao (`posicao.mjs`, #336). Um `nega(` POR SINAL, e
 *  nao um so: a varredura muta cada chamada, e cada sinal tem o seu caso no `tests-fronteira-posicao.mjs`. */
//  A shell com `-c` leva o rotulo OPACO do ramo (`rotuloShell`), o mesmo que o `OPACO` lhe da quando a ve.
function negaInline(cmds, rotulo, qualquer = false, rotuloShell = rotulo) {
  const tipo = cmds.map((c) => inlineDe(c, qualquer)).find(Boolean);
  return tipo === "letra" ? nega(rotulo)
    : tipo === "data" ? nega(rotulo)
    : tipo === "deno" ? nega(rotulo)
    : tipo === "variavel" ? nega(rotulo)
    : tipo === "shell" ? nega(rotuloShell)
    : null;
}

/**
 * PORQUE e que este comando seria negado — o mesmo veredicto de `alteraFronteira()`, com o
 * nome da condicao que o produziu.
 *
 * PORQUE EXISTE: a decisao combina varias condicoes com alcances diferentes (umas por segmento,
 * outras sobre o comando inteiro), e bastava uma disparar para o comando ser negado com uma
 * razao generica. Quem levava com a negacao nao sabia qual — e das quatro negacoes de LEITURA
 * medidas numa sessao real, duas ficaram por explicar por nao haver forma de as diagnosticar.
 * Duas delas bloquearam passos que o proprio processo exige: correr a suite dos hooks, e
 * publicar um comentario sobre o assunto.
 *
 * Um agente que nao perceba a negacao ou desliga o hook — e perde a proteccao toda — ou salta a
 * verificacao. Nenhum dos dois e o que o hook quer, e os dois sao mais provaveis do que
 * investigar.
 *
 * Nasceu (#101) so para dizer PORQUE, sem mudar o que e negado. Desde o #185 decide tambem o que
 * a fronteira casa: os caminhos escritos de outra maneira normalizam-se antes (`normalizaCaminhos`).
 *
 * @param {string} texto o comando completo
 * @param {{raiz?: string, cwd?: string, prefixo?: string, home?: string}} [ctx] onde o comando corre
 *   (`contextoFronteira()`). Sem ele, os caminhos relativos resolvem-se contra a raiz e os
 *   absolutos ficam por resolver — e o que os testes usam, com valores fixos quando precisam.
 * @returns {string|null} o rotulo da condicao que nega, ou `null` se o comando passa
 */
export function porqueAltera(texto, ctx = {}) {
  // Uma excepcao a analisar NEGA. Sem isto caia no `catch` do hook, que sai com 0 — e permitia o
  // comando inteiro, o `git push --force` incluido (8000 `$(` aninhados, leitura do c004591).
  try {
    return julga(texto, ctx);
  } catch {
    return nega("erro-ao-analisar");
  }
}

/** Substituicoes a mais num comando que toca a fronteira: nega sem as abrir. Nenhum comando de
 *  trabalho chega perto, e abrir cada uma custa o texto que a envolve — milhares aninhadas sao
 *  segundos, e um hook lento e um hook que se desliga. */
const MAX_SUBSTITUICOES = 64;

/** Comandos que o git executaria, a mais disto num so comando: nega sem os julgar (o custo). */
const MAX_EXECUTADOS = 16;

function julga(texto, ctx, dentroDoGit = false) {
  // O que o git EXECUTA de uma opcao ou de uma variavel (#253) e um comando, e julga-se como um:
  // citado, o caminho era texto, e `git -c core.pager='rm <f>' log` apagava a fronteira.
  // UM nivel so: a recursao sem tecto crescia ~2,3x por `bisect run` (n=11: 98 ms; medido), e um
  // hook que excede o prazo PERMITE. Um comando executado que traga, ele proprio, opcoes que
  // executam nega sem se abrir — nenhum trabalho normal tem essa forma (2.a leitura do #253).
  // O tecto e a negacao aninhada so valem se o comando NOMEIA a fronteira: sem ela, um
  // `rebase -x 'git -c ... commit'` era negado com uma razao que fala da fronteira (3.a leitura).
  // Nomear e o NOME das pastas, e nao o regex estrito, que exige um separador antes:
  // `$PWD/.claude/hooks` nao o casava e a negacao aninhada desligava-se (4.a leitura).
  // Sem os CORPOS de heredoc (#317): o hook passa o comando inteiro, e o corpo de uma mensagem que cite
  // `git -c core.pager=...`, `eval` ou `xargs` nao e um comando. O que o heredoc faz fica a vista: o resto da
  // linha (`> <fronteira>`) e o que o shell executa num corpo sem aspas.
  const semCorpos = semCorposDeHeredoc(texto);
  if (!dentroDoGit) {
    const executados = valoresQueExecutam(semCorpos);
    const nomeia = NOMEIA.test(semCorpos);
    if (nomeia && executados.length > MAX_EXECUTADOS) return nega("git-que-executa");
    for (const { comando } of executados) {
      if ((nomeia && valoresQueExecutam(comando).length) || julga(comando, ctx, true)) return nega("git-que-executa");
    }
  }
  // Calculado UMA vez: cada chamada repete o regex dos heredocs, os `executados` e o `desaspa` (auditoria do #317).
  const citado = semCitacoes(texto);
  const visivel = normalizaCaminhos(citado, ctx);
  const opaco = OPACO.test(semCorpos);
  // SEM a isencao do script: com a fronteira so citada nao ha leitura legitima a salvar (a do ESLint
  // tem o caminho a vista), e cada isencao aqui era superficie nova sem proveito (quarta leitura do #317).
  // Sobre o texto COM as aspas e SEM os corpos de heredoc: sem as aspas, o `desaspa` apagava o NOME do
  // interpretador citado (`"node" -e`, `"$(command -v node)" -e`), e o `main` negava-os (2.a auditoria do #317).
  const inline = INLINE_SEM_ISENCAO.test(semCorpos);

  // A fronteira so aparece DENTRO de aspas ou de um heredoc: e texto. Excepto quando o
  // comando executa esse texto (`eval`, `sh -c`) ou o passa a um interpretador (`node -e`),
  // que foi como o `node -e "...writeFileSync('.claude/settings.json')..."` se escondia.
  if (!FRONTEIRA.test(visivel)) {
    if (!FRONTEIRA.test(texto)) return null;
    // So chegam aqui as crases que o `semCitacoes` NAO executou (#568): um comentario, um `<<\EOF`, um `<<'END-X'`.
    // A rede antiga (`` cd `rm -rf <fronteira>` ``) fica; um CAMINHO SOZINHO nao corre nada, e fica isento.
    const crases = (texto.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?^[\t ]*\2[\t ]*$/gm, " ")
      .replace(/'(?:[^'\\]|\\.)*'/g, " ").match(/`[^`]*`/g) ?? []).some((c) => {
      const dentro = c.slice(1, -1).trim();
      return FRONTEIRA.test(` ${dentro}`) && !/^[^\s;&|<>`$()]+$/.test(dentro);
    });
    // Um heredoc para um interpretador nega mesmo que o codigo so LEIA a fronteira: e a politica do `node -e`
    // (codigo inline que a cita), e o hook nao distingue ler de escrever dentro do codigo (#317, decidido).
    const recebe = RECEBE_CODIGO.test(citado);
    // O inline primeiro, pelo rotulo: a razao dele leva a nota do `jq`. O piso (a regex) e a posicao (#336), que
    // so ACRESCENTA: aqui a fronteira so esta citada, e um inline em QUALQUER comando nega, como sempre negou.
    if (inline) return nega("citado-mas-executado:inline");
    // Com `qualquer`: aqui conta qualquer palavra nao citada com nome de interpretador, e nao so as posicoes
    // conhecidas — um wrapper fora da lista (`rlwrap node -pe`) escondia-o. E a politica do piso para `-e`/`-p`/
    // `-c`, estendida as letras agrupadas: um inline num comando, e a fronteira so citada noutro, nega.
    const cmds = comandos(texto);
    const pos = negaInline(cmds, "citado-mas-executado:inline", true, "citado-mas-executado");
    if (pos) return pos;
    if (opaco || crases || recebe) return nega("citado-mas-executado");
    // Quem RECEBE codigo pelo stdin com uma cabeca, um executor ou um grupo antes (#566: `| env bash`, `nohup su <<EOF`),
    // por posicao. No FIM do ramo: so acrescenta, e nenhum rotulo muda.
    return cmds.some(recebeDe) ? nega("citado-mas-executado") : null;
  }

  // Por SEGMENTO, e com as citacoes ja removidas — senao um `|` dentro de aspas parte o
  // comando e o "verbo" do segmento seguinte e um pedaco do padrao de procura.
  // Antes do `tocam`: o segmento do `cd` sai dele, e e o `cd` que leva o corpo para a fronteira.
  if (ADIADA.test(visivel)) return nega("execucao-adiada");
  const segmentos = pedacosDe(visivel).pedacos.filter((p) => typeof p !== "string").map(([a, b]) => visivel.slice(a, b));
  // Um `cd`/`pushd`/`popd` so muda de directorio: o que corre DEPOIS ja e julgado com o directorio
  // novo (`normalizaCaminhos`, #185). Contado aqui, era o primeiro segmento a tocar e, quando o
  // verbo so se julgava no primeiro, `cd .claude/hooks && cp x y.mjs` passava pelo `cd`.
  const tocam = segmentos.filter((s) => FRONTEIRA.test(s) && !soMudaDeDirectorio(s));
  if (tocam.length === 0) return null;

  const alvo = tocam.join("\n");

  // UMA SO NORMALIZACAO, e este e o ponto do ticket. Com duas — `basename` no verbo, texto cru
  // nas regex ancoradas — `sudo /usr/bin/git rm <alvo>` passava: o verbo era `git` (que esta na
  // LEITURA) e o `^git` via `/usr/bin/git`. Um corpus GERADO contou **270** comandos assim, e
  // sao UM defeito multiplicado por {cabecas consumidas} x {formas de invocar por caminho}.
  // O corpus escrito a mao contara 5, porque tinha as duas metades em grupos separados e nunca
  // o produto das duas.
  // Os parenteses de uma subshell nao sao parte do verbo: `(cd X && ...)` dava o verbo `(cd`.
  // E o que corre DENTRO de cada `$(...)`/`<(...)` de um segmento que toca e julgado como um
  // segmento seu: `cat <f> $(rm -rf <f>)` passava pelo `cat` (ja no `main`). Pelo criterio do
  // marcador: um interior que nao escreve (`$(ls | sort)`, `$(date)`) nao conta.
  if ((alvo.match(/[$<>]\(/g) ?? []).length > MAX_SUBSTITUICOES) return nega("substituicoes-demais");
  const interiores = tocam
    .flatMap(substituicoes)
    .flatMap((i) => pedacosDe(i).pedacos.filter((p) => typeof p !== "string").map(([a, b]) => i.slice(a, b)))
    .map((s) => [s, resto(s.replace(/[()]/g, " "))])
    .filter(([s, toks]) => toks.length && levaMarcador(s, toks));
  const semCabeca = [...tocam.map((s) => resto(s.replace(/[()]/g, " "))), ...interiores.map(([, toks]) => toks)];
  const normaliza = (toks) =>
    toks.length === 0 ? "" : [toks[0].replace(/^.*\//, ""), ...toks.slice(1)].join(" ");
  const restoTexto = semCabeca.map(normaliza).join("\n");
  // O verbo de CADA segmento que toca, e nao so o do primeiro: `cat <f>; rm <f>` passava pela leitura
  // a frente, e o #185, ao fazer tocar mais leituras (a pasta sem barra, os caminhos reescritos),
  // alargou isso a `ls .claude/hooks; rm -rf .claude/hooks/`. O primeiro que nao le e o que nega.
  // A barra FINAL sai antes do nome base: `D=.claude/` (a pasta-mae reescrita) dava um rotulo vazio.
  const verbo = (t) => (t[0] ?? "").replace(/\/+$/, "").replace(/^.*\//, "");
  const primeiro = semCabeca.map(verbo).find((v) => !LEITURA.has(v)) ?? verbo(semCabeca[0]);
  const editaNoSitio = /\b(?:sed|perl|ruby|python3?)\b[^\n]*\s-[a-zA-Z]*i\b/.test(alvo);
  // O `inline` avalia-se sobre os segmentos que TOCAM a fronteira, e nao sobre o comando
  // inteiro. Duas leituras legitimas eram negadas por causa do alcance largo, as duas medidas
  // numa sessao real e diagnosticadas so porque a parte 1 (#101) pos o rotulo na mensagem:
  //
  //   `node <ficheiro>; grep -c x y`  — o `-c` do GREP era lido como sendo do `node`, porque
  //     o regex corre sobre a linha toda. As flags sao comuns: `grep -c`, `sort -c`, `cp -p`,
  //     `git log -p`.
  //   `cat <fronteira>; node -e "..."` — um interpretador inline noutro segmento, que nao toca
  //     a fronteira nenhuma, negava o `cat`.
  //
  // O `opaco` NAO se alinha, e a assimetria e deliberada. Com `|`, o segmento que toca a
  // fronteira **alimenta** o consumidor a jusante: em `ls <fronteira> | xargs rm`, quem apaga
  // e o `xargs`, que nao tem o caminho escrito. Alinhar os dois passava esse comando a
  // PERMITIDO — apagava a pasta dos hooks inteira. Foi uma leitura independente a dar o
  // contra-exemplo, e os casos dele sao os primeiros do `tests-fronteira-alcance.mjs`.
  const inlineNoAlvo = CODIGO_INLINE.test(alvo) || (INLINE_SEM_ISENCAO.test(alvo) && CODIGO_INLINE.test(citado));
  // Uma allowlist por BINARIO e grossa quando o binario tem sub-verbos que apagam: `git rm`,
  // `git restore` e `git checkout --` passavam por `git` estar na lista. Medido ao remover um
  // hook obsoleto, minutos depois de escrever esta verificacao.
  // Contra o `restoTexto` e nao contra o `alvo`: a ancora `^git` tem de ver o verbo, nao a
  // cabeca. E com `/m`, porque o `restoTexto` junta TODOS os segmentos que tocam — o que fecha,
  // de caminho, `cat .claude/settings.json && git rm <alvo>`, onde uma leitura a frente
  // desarmava o verbo.
  // E os que escrevem NUM CAMINHO sem `>` (#237): julgados pelo caminho de SAIDA, nao pela
  // mencao — `git diff --output=/tmp/p -- <fronteira>` le a fronteira e e trabalho normal.
  // Depois de um `cd` para dentro da fronteira, uma saida RELATIVA cai la: `cd .githooks && git diff
  // --output=commit-msg` (sem extensao, o `normalizaCaminhos` nao a reescreve). Falha fechado.
  const cdNaFronteira = segmentos.some((s) => soMudaDeDirectorio(s) && FRONTEIRA.test(s));
  const gitQueEscreve =
    new RegExp(String.raw`^git\b[^\n]*${GIT_QUE_ESCREVE}`, "m").test(restoTexto.trim()) ||
    semCabeca.some((toks) => saidasDoGit(toks).some((s) => FRONTEIRA.test(` ${s}`) || (cdNaFronteira && !s.startsWith("/"))));
  // O `find` esta na LEITURA e destroi — e, ao contrario do `git`, nao tinha verificacao de
  // sub-verbo nenhuma. O espelho correcto NAO e "`-exec` nega": isso negava
  // `find <f> -name '*.mjs' -exec grep -l X {} +`, que e leitura pura e trabalho normal, e um
  // guard que nega trabalho normal e contornado. O sub-verbo julga-se contra a MESMA `LEITURA`.
  //
  // Linha a linha, e nao um `/gm` ancorado: com `^find` e `g`, so o PRIMEIRO `-exec` de cada
  // linha era capturado, e `find <alvo> -exec grep -l X {} + -exec rm {} +` passava. E o mesmo
  // anti-padrao que a linha acima fecha para o `git` — uma leitura a frente a desarmar a
  // escrita — e reintroduzi-lo aqui no mesmo commit seria comico.
  //
  // E sobre o comando VISIVEL inteiro, nao sobre os segmentos: o `;` e separador no `split`,
  // logo `find <alvo> -exec grep -l X {} \; -exec rm {} \;` ficava com o segundo `-exec` fora
  // do `restoTexto` e passava. A forma `\;` e a mais portavel das duas, e reabria exactamente o
  // padrao — uma leitura a frente a desarmar a escrita — que a linha acima fecha para o `git`.
  // Apanhado pelo leitor independente (Fase 4) depois de eu escrever no comentario que
  // reintroduzi-lo "seria comico".
  const findQueEscreve =
    semCabeca.some((toks) => toks[0]?.replace(/^.*\//, "") === "find") &&
    (FIND_QUE_ESCREVE.test(visivel) ||
      [...visivel.matchAll(/\s-(?:exec|execdir|ok|okdir)\s+(\S+)/g)].some((m) => {
        const sub = m[1].replace(/^.*\//, "");
        // O sub-verbo julga-se pela MESMA allowlist — mas `git` e `node` estao nela e escrevem
        // com sub-verbo proprio. `find <alvo> -exec git rm {} +` passava por `git` ser leitura.
        if (!LEITURA.has(sub)) return true;
        const resto = m.input.slice(m.index + m[0].length);
        // O `{}` e cada ficheiro da fronteira que o `find` encontrou: qualquer saida do git conta
        // (`find .claude/hooks -exec git diff --output={} HEAD \;` truncava cada hook, #237).
        // So o que cai na fronteira: o `{}` e cada ficheiro dela, e `-exec git diff --output=/tmp/p {}
        // \;` e leitura (leitura independente do #237).
        return sub === "git"
          ? /^\s*(?:rm|mv|restore|checkout|clean|stash|config|apply|reset)\b/.test(resto) ||
              saidasDoGit(["git", ...resto.split(/\s+/).filter(Boolean)]).some((s) => s.includes("{}") || FRONTEIRA.test(` ${s}`))
          : sub === "node" && /^\s*(?:-e|-p|--eval|--print|-r|--require)\b/.test(resto);
      }));
  // Com DESCRITOR (#206): `2> <fronteira>`, `1>`, `2>>` e `>|` escrevem. O `[^>\d]` antigo existia para
  // nao confundir o `2>&1` — que continua a nao casar, porque depois do `&` vem um digito e nao um caminho.
  // O `>!` e o `>|` do zsh (o shell do Bash tool) tambem escrevem por cima do `noclobber`, e o
  // `>&!`/`>>&|` tambem (leitura do 81e5942).
  const redireciona = new RegExp(String.raw`(?:^|[^>])>{1,2}&?[|!]?&?\s*(?:\.\/)?(?:${NOMEIA.source})\/`).test(alvo) || /\btee\b/.test(alvo);

  // A ORDEM E A DA DECISAO, nao a de importancia: quem le quer saber o que disparou PRIMEIRO,
  // porque e essa a condicao a relaxar se a negacao for indevida. Varias podem ser verdade ao
  // mesmo tempo, e reporta-las todas dava uma lista sem accao.
  // Uma palavra-chave de shell (`{`, `while`, `done`) chega como verbo e esconde o que o bloco
  // corre. Se o hook VE uma escrita la dentro, e essa que se diz (#307): `{ rm -rf <f>; }` e
  // `} > <f>` levavam a razao de opacidade, e a de opacidade aconselha a reescrever o comando.
  // O veredicto nao muda: o ramo so ESCOLHE o rotulo, e nega num sitio so. Com um `return nega`
  // por condicao, cada um era mais um sitio onde uma regressao PERMITIA — tres deles sem teste
  // nenhum, medido com a varredura (leitura do #307).
  if (PALAVRAS_DE_BLOCO.has(primeiro)) {
    const escrito = semCabeca.map(escritaDoBloco).find(Boolean);
    // O `git`/`find` colado a palavra-chave (`{ git rm <f>; }`): os testes de cima ancoram no verbo do
    // segmento, que aqui e o `{`. Sem as palavras-chave a frente, ve-se — so para o ROTULO (#317).
    const semBloco = semCabeca.map((t) => {
      const i = t.findIndex((x) => !PALAVRAS_DE_BLOCO.has(x));
      return i < 0 ? [] : t.slice(i);
    });
    const gitNoBloco = semBloco.some((t) => new RegExp(String.raw`^git\b[^\n]*${GIT_QUE_ESCREVE}`).test(normaliza(t)));
    const findNoBloco = semBloco.some((t) => verbo(t) === "find") && FIND_QUE_ESCREVE.test(visivel);
    return nega(
      escrito ? `verbo-nao-e-leitura:${escrito}`
      : editaNoSitio ? "edita-no-sitio"
      : redireciona ? "redireciona"
      : gitQueEscreve || gitNoBloco ? "git-que-escreve"
      : findQueEscreve || findNoBloco ? "find-que-escreve"
      : `verbo-nao-e-leitura:${primeiro}`
    );
  }
  if (!LEITURA.has(primeiro)) return nega(`verbo-nao-e-leitura:${primeiro}`);
  if (editaNoSitio) return nega("edita-no-sitio");
  // Com a fronteira A VISTA, quem recebe codigo tambem e inline (auditoria do #317): `node - <fronteira> <<EOF`
  // escrevia o `argv` com o `node` na LEITURA. Sobre o comando INTEIRO, e nao so os segmentos que tocam (2.a
  // auditoria): o `|` parte segmentos, e `echo rm -rf <fronteira> | bash` tinha a fronteira so no `echo`.
  if (inlineNoAlvo) return nega("codigo-inline");
  // Um rotulo seu: quem RECEBE codigo (`| bash`, `node - <<EOF`) nao e um interpretador com codigo inline, e a
  // nota do `jq` que acompanha o `codigo-inline` nao lhe serve (auditoria do PR a).
  if (RECEBE_CODIGO.test(visivel)) return nega("recebe-codigo");
  // Pela posicao (#336), nos comandos dos segmentos que tocam — e em qualquer um cujo PROPRIO argv cite a
  // fronteira: `cat <f> | node -e "...<f>..."` tem o `node` num segmento que nao toca.
  // E a JUSANTE, por pipe, de um que a cita: `find <f> | python3 -c '...os.remove(l)...'` recebe o caminho pelo
  // stdin, e o codigo nao o cita (a leitura adversarial do #336). O cru E o texto (`.cl''aude`), e as redireccoes.
  // Tambem um bloco inteiro a jusante (`| while read l; do python3 -c ... "$l"; done`): `aJusante`.
  const cita = (c) =>
    c.argv.some((w) => NOMEIA.test(w.cru) || NOMEIA.test(w.texto)) || c.redir.some((r) => NOMEIA.test(r.alvo));
  const todos = comandos(texto);
  const citam = aJusante(todos, cita);
  const pos = negaInline([...tocam.flatMap((s) => comandos(s)), ...citam], "codigo-inline", false, "wrapper-opaco");
  if (pos) return pos;
  if (opaco) return nega("wrapper-opaco");
  if (redireciona) return nega("redireciona");
  if (gitQueEscreve) return nega("git-que-escreve");
  if (findQueEscreve) return nega("find-que-escreve");
  // O `recebeDe` (#566), no FIM e sobre TODOS os comandos — o alcance do piso (`RECEBE_CODIGO` sobre o comando inteiro):
  // `cat <f>; true | env bash` tem a fronteira so no `cat`.
  if (todos.some(recebeDe)) return nega("recebe-codigo");
  return null;
}

/**
 * @param {string} texto o comando completo
 * @returns {boolean} true se o comando ESCREVE na fronteira e deve ser negado
 */
export const alteraFronteira = (texto, ctx) => porqueAltera(texto, ctx) !== null;

// A MENSAGEM (as duas razoes e a escolha entre elas) vive em `./fronteira-dados.mjs` desde o #317;
// reexporta-se daqui para quem ja a importava deste modulo.
export { RAZAO_FRONTEIRA, RAZAO_OPACA, razaoDe } from "./fronteira-dados.mjs";
