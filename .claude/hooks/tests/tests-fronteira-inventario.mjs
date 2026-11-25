/**
 * INVENTARIO da fronteira: o que ela apanha e o que lhe escapa, medido — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * ## Porque existe
 *
 * O #101 abriu com **uma** forma de evasao. Um `/grill` encontrou sete. Tres auditorias
 * independentes encontraram mais nove, e duas delas apanharam alteracoes que eu ia fazer e que
 * **afrouxavam** a fronteira com a frase "nao enfraquece" escrita ao lado.
 *
 * A contagem subia a cada ronda de planeamento. Isso diz uma coisa: o problema nao se conhecia
 * o suficiente para ser planeado as pecas. Este ficheiro para de tentar corrigir e passa a
 * **registar** — cada forma medida, com o veredicto que ela tem HOJE.
 *
 * ## O que este ficheiro NAO e
 *
 * Nao e uma lista de defeitos a corrigir, nem um plano. E uma fotografia executavel. Metade dos
 * casos afirma que algo **passa**, e passar e, para esses, um **buraco aberto** — nao um
 * comportamento desejado.
 *
 * **Um caso de `ABERTO` a ficar vermelho e BOA NOTICIA**: significa que alguem o fechou. Quem o
 * vir vermelho deve mover a entrada para `FECHADO` e nao "corrigir o teste". Esta escrito aqui
 * porque a alternativa — um teste que afirma um bypass e fica verde para sempre — treina quem
 * vier a apaga-lo como se fosse regressao.
 *
 * ## Para que serve
 *
 * Qualquer alteracao a `lib/fronteira.mjs` passa a mostrar o efeito em TODAS as formas de uma
 * vez. Foi exactamente isso que faltou nas tres tentativas: eu mudava uma condicao e nao via o
 * que mais mudava.
 *
 * Quando este ficheiro nasceu era a UNICA rede: a varredura de mutacao nao cobria
 * `.claude/hooks/lib/`. Deixou de ser verdade no #136 (`v0.44.0`) — a decisao tem hoje os
 * seus oito sitios mutados, e o corpus GERADO (`tests-fronteira-gerado.mjs`) e uma terceira.
 */
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-inventario.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const H = ".claude/hooks/stop-verify.mjs";
const S = ".claude/hooks/tests/test-hooks.mjs";
const F = ".claude/hooks/lib/fronteira.mjs";

/**
 * O que a fronteira APANHA hoje. Rede de nao-regressao: qualquer um destes a passar e uma
 * permissao nova, e e o modo de falha que as tres auditorias apanharam em planos meus.
 */
const FECHADO = [
  ["escrita directa", `cp /tmp/x ${H}`, "verbo-nao-e-leitura:cp"],
  ["apagar com glob", "rm .claude/hooks/*.mjs", "verbo-nao-e-leitura:rm"],
  ["`./` inicial", `cp /tmp/x ./${H}`, "verbo-nao-e-leitura:cp"],
  ["`sed -i` sobre o settings", "sed -i '' s/a/b/ .claude/settings.json", "edita-no-sitio"],
  ["redireccao sem descritor", "echo '{}' > .claude/settings.json", "redireciona"],
  ["`git rm` sobre um hook", `git rm ${H}`, "git-que-escreve"],
  ["wrapper opaco com o caminho citado", `eval "rm ${H}"`, "citado-mas-executado"],
  ["pipe de leitura para `xargs rm`", "ls .claude/hooks/*.mjs | xargs rm", "wrapper-opaco"],
  ["interpretador inline no segmento que toca", `cat /tmp/x; node -e "console.log(1)" ${H}`, "codigo-inline"],
  // --- Fechadas pelo #101 (slice das cabecas inertes) ------------------------
  // As quatro nasceram em ABERTO e estao aqui porque FECHARAM, nao porque alguem as reescreveu.
  // As duas primeiras caem pela UNICA normalizacao (o `^git` passou a ver o verbo e nao a
  // cabeca nem o caminho); as duas do `find` pelo sub-verbo novo.
  ["leitura a frente NAO desarma o ramo do git", `cat .claude/settings.json && git rm ${H}`, "git-que-escreve"],
  ["`git` invocado por caminho", `/usr/bin/git rm ${H}`, "git-que-escreve"],
  ["`find -delete`", "find .claude/hooks/ -delete", "find-que-escreve"],
  ["`find -exec rm`", "find .githooks/ -type f -exec rm {} +", "find-que-escreve"],
  // A guarda que impede uma flag de COMER o alvo. Sem ela, o `-u` engolia a fronteira e o que
  // sobrava (`cat /tmp/y`) era uma leitura inocente de outro ficheiro. A Fase 4 mediu esta
  // mutacao como MORTA — a guarda existia e nada a exercitava.
  ["fronteira como VALOR de uma flag de cabeca", `sudo -u ${H} cat /tmp/y`, "verbo-nao-e-leitura:stop-verify.mjs"],
  ["o mesmo com `env -u`", `env -u ${F} cat /tmp/y`, "verbo-nao-e-leitura:fronteira.mjs"],
  // Nasceu em ABERTO (4.a leitura do #253). Fechou no #567: o `valoresQueExecutam` passou a ler TODAS as palavras git do
  // segmento, e nao so a 1.a — o isco do `-a` deixou de esconder o `-c` do git real.
  ["`exec -a git` a por um isco antes do git", `exec -a git git -c alias.x='!rm -rf ${H}' x`, "git-que-executa"],
];

/**
 * NEGADO HOJE **PELA CABECA**, e nao pelo verbo real — o grupo mais importante deste ficheiro.
 *
 * Em todos estes, o primeiro token do segmento (`sudo`, `env`, `timeout`, `command`, ou uma
 * atribuicao) nao esta na `LEITURA`, e e isso que os nega. O verbo a seguir — `git rm`,
 * `find -delete`, `node` com `--require` — **nao chega a ser olhado**.
 *
 * ## Porque sao armadilhas, e nao casos normais
 *
 * Ha um trabalho pendente no #101 para corrigir um falso positivo real: `timeout 60 node <suite>`
 * e negado hoje, e nao devia ser. A correccao obvia — saltar a cabeca e julgar o token seguinte —
 * **faz todos estes passarem**, porque em todos o verbo real ou esta na `LEITURA` (`git`, `find`,
 * `node`) ou e alcancado por um regex ancorado no inicio do segmento (`^git`, que falha contra
 * `"sudo git rm …"`).
 *
 * Foi isso que uma auditoria independente apanhou num plano meu, e e a terceira vez que o mesmo
 * modo de falha — converter um `deny` num `allow` sem dar por isso — sobrevive ao meu
 * julgamento e morre na leitura de outro.
 *
 * ## Afirmam NEGADO, nao o ROTULO
 *
 * De proposito. A correccao **certa** muda o rotulo (passa a nomear `git`, `find`, `node` em vez
 * de `sudo`, `env`, `timeout`) e mantem a negacao — e continua verde. A correccao **ingenua**
 * mantem o rotulo impossivel e perde a negacao — e fica vermelha. Afirmar o rotulo trocava os
 * dois resultados.
 *
 * As tres ultimas sao de outra familia: variaveis de ambiente que fazem um binario de LEITURA
 * executar codigo arbitrario. Hoje negam por acidente — o `basename` do extractor deixa
 * `evil.js` como "verbo", que nao esta na `LEITURA`. Um acidente nao e uma proteccao.
 */
const FECHADO_PELA_CABECA = [
  // Os SEIS que o #101 passou a negar PELO VERBO REAL. O rotulo e parte da assercao, e foi
  // escrito na Fase 0 **antes** do codigo, e nao depois de ver o output. Bateram os SEIS que
  // tinham rotulo previsto; os outros tres (abaixo) nao tinham nenhum a bater.
  ["sudo + git rm", `sudo git rm ${H}`, "git-que-escreve"],
  ["env + git rm", `env git rm ${H}`, "git-que-escreve"],
  ["timeout + git restore", "timeout 5 git restore .claude/settings.json", "git-que-escreve"],
  ["command + git checkout --", `command git checkout -- ${H}`, "git-que-escreve"],
  ["env + find -delete", "env find .claude/hooks/ -delete", "find-que-escreve"],
  ["timeout + find -exec rm", "timeout 60 find .githooks/ -type f -exec rm {} +", "find-que-escreve"],
  // Os TRES que continuam negados PELO ACIDENTE do basename do valor (`evil.js` fica como
  // "verbo"). Afirmam so a NEGACAO, e e honesto dize-lo: o cabecalho deste ficheiro ja escreve
  // que "um acidente nao e uma proteccao". Nao pioraram nem melhoraram — e a slice das
  // atribuicoes que os resolve, e ate la a rede aqui e fina de proposito em vez de fingida.
  ["NODE_OPTIONS --require", `NODE_OPTIONS=--require=/tmp/evil.js node ${S}`, null],
  ["BASH_ENV", `BASH_ENV=/tmp/evil.sh bash ${S}`, null],
  ["LD_PRELOAD", `LD_PRELOAD=/tmp/evil.so cat ${H}`, null],
];

/**
 * O que ESCAPA hoje. Cada entrada leva a CLASSE, porque e ela que decide se entra no ambito: o
 * `CLAUDE.md` diz que os hooks sao *"uma barreira contra o **descuido**, nao contra quem a
 * queira contornar"*, e essa linha nunca foi escrita em casos concretos.
 *
 *   DESCUIDO  — sai de uma ferramenta ou de habito, sem intencao de evadir
 *   CONTORNO  — exige escrever alguma coisa de proposito para fugir a verificacao
 */
const ABERTO = [
  // O criterio de corte vive no `hooks-guide.md` (#223): um DESCUIDO fecha-se; um CONTORNO
  // regista-se e nao se persegue; uma classe que volta sempre com mais uma forma ganha issue proprio.
  // Os DESCUIDO fecharam no #223 e no #229 (o comando que corre dentro de texto citado): estao em
  // `tests-fronteira-descuidos.mjs`. Ficam os contornos.
  // --- Ancoragem: regexes presos ao inicio do segmento ------------------------
  // --- Verbos de LEITURA que destroem -----------------------------------------
  // A redireccao com descritor (`2>`, `1>`) fechou no #206: esta em `FECHADO_PELO_CAMINHO` (`tests-fronteira-caminho.mjs`).
  // --- Contorno: exige escrever algo de proposito -----------------------------
  // A forma `D=.claude; cp ... $D/hooks/...` fechou no #223, de passagem: a atribuicao contem a
  // pasta-mae inteira. Parte-se o nome e volta a passar — e um contorno, e regista-se.
  ["CONTORNO", "indireccao por variavel", "D=.cla; cp /tmp/x ${D}ude/hooks/y.mjs"],
  // Sair da raiz e voltar pelo nome da pasta (`cd ..` e o repo de outra maneira): o `cd ..` deixa o
  // directorio por saber, e ninguem o escreve por habito para apagar a fronteira (#223).
  ["CONTORNO", "sair da raiz e voltar pelo nome", "cd .. && rm -rf proj/.claude"],
  // O `cd -` volta ao directorio anterior: ninguem o escreve por habito para escrever la (#223).
  ["CONTORNO", "`cd -` de volta a fronteira", "cd .claude/hooks; cd /tmp; cd -; cp /tmp/x y.mjs"],
  // Da leitura do a995596: uma barra a partir o caminho (#223 — a classe do contorno). As aspas vazias
  // (`>""<caminho>`) fecharam com as aspas no alvo, e estao em `FECHADO_PELO_CAMINHO` (`tests-fronteira-caminho.mjs`).
  ["CONTORNO", "barra a escapar o caminho", "cat /tmp/x >\\.claude/settings.json"],
  // Da leitura do #237: a opcao curta COLADA ao caminho. O `FRONTEIRA` so reconhece um caminho
  // depois de um separador, e alarga-lo mexia na regex que serve todas as outras regras. A forma
  // separada (`-o <caminho>`) e o `--output=` fecharam e estao no `tests-fronteira-descuidos.mjs`.
  ["CONTORNO", "`git archive -o` colado ao caminho", "git archive -o.claude/settings.json HEAD"],
  // Da segunda leitura do PR #231 (#229), ja no `main`: um `<<` DENTRO de aspas lido como heredoc
  // (a regex corre antes das aspas), e o `)` de um padrao de `case` a fechar o `$(...)`. Os dois
  // exigem montar a estrutura de proposito.
  ["CONTORNO", "`<<` citado lido como heredoc", "echo '<<EOF'\nrm -rf .claude/hooks\nEOF"],
  ["CONTORNO", "`case` dentro de `$(...)`", `echo "$(case a in a) rm .claude/hooks/x;; esac)"`],
  // Da terceira leitura do PR #231, ja no `main`: um `\)` ou `\(` escapado dentro do `$(...)` conta
  // no seguidor de directorios; e `$$'` e lido como um `$'` ANSI-C.
  ["CONTORNO", "parentese escapado dentro de `$(...)`", `(cd .claude/hooks; echo "$(echo \\))"; rm -rf *)`],
  ["CONTORNO", "`$$'` lido como ANSI-C", "echo $$'\\'; rm -rf .claude/hooks; echo 'x'"],
  ["CONTORNO", "`script -c` re-interpreta uma string", `script -c "rm ${H}" /tmp/log`],
  ["CONTORNO", "`ssh` com o comando em aspas", `ssh host "rm ${H}"`],
  // Do #253: o que o git EXECUTA de uma opcao fechou (`git-que-executa`); o `--config-env` le o
  // valor de OUTRA variavel, que tem de ser montada de proposito a parte.
  ["CONTORNO", "`git --config-env` com o comando noutra variavel", `X='rm ${H}' git --config-env=core.pager=X log`],
  ["CONTORNO", "`export` noutra instrucao, depois o git", `export GIT_PAGER='rm ${H}'; git -p log`],
  // O `foreach` e apanhado (`tests-bypasses.mjs`); um caminho prefixado por uma VARIAVEL nao e
  // reconhecido em lado nenhum, dentro ou fora do git.
  ["CONTORNO", "`submodule foreach` com o caminho atras de `$toplevel`", `git submodule foreach 'rm -f $toplevel/${H}'`],
  // Da 4.a leitura do #253: a classe "o que o git executa" voltou com mais quatro formas em cada
  // leitura. Pelo criterio do `hooks-guide.md`, um contorno regista-se e nao se persegue.
  ["CONTORNO", "`GIT_CONFIG_PARAMETERS` com o escape `'\\''`", `GIT_CONFIG_PARAMETERS="'alias.x=!rm -rf '\\''${H}'\\'''" git x`],
  ["CONTORNO", "`git clone -c` depois do verbo", `git clone -c core.sshCommand='rm -rf ${H}' ssh://h/r z`],
  ["CONTORNO", "opcao abreviada a duas letras (`--ex`)", `git rebase --ex 'rm -rf ${H}' HEAD~1`],
  // Da 5.a leitura: o nome partido por aspas, num git aninhado — a classe de `D=.cla; ${D}ude`.
  ["CONTORNO", "nome da pasta partido por aspas num git aninhado", `git rebase -x "git -c alias.y='!rm -rf .cl\\"\\"aude/hooks' y" HEAD~1`],
  // #576 (o Medio 1 do leitor do fecho do `/audit` da v0.63.6): um payload aritmetico guardado ENTRE PLICAS numa variavel
  // corre quando o bash le a variavel num contexto aritmetico — e o hook le texto, e as plicas sao texto. Medido a 23 nov
  // (payload `touch`): o bash 3.2.57 corre estas sete (o bash 5 nao foi medido); o zsh 5.9, a shell do Bash DESTA maquina,
  // nenhuma — num projeto com bash, estao vivas. Fecha-lo era M-L (marcador a atribuicao com `$(`/crase entre plicas num
  // comando com `cd` para a fronteira, ~1 dia, `fronteira.mjs` no limite) e ficava aberto noutras leituras: registado.
  // O `X[Y]=1` solto fechou no M3; o `let`/`declare -i`/`((..))`/`: $((Y))` negam so pelo verbo (`tests-atribuicoes.mjs`).
  ...["echo ${A[Y]}", "X=${A[Y]}", "[[ Y -eq 0 ]]", "read X[Y] </dev/null", "echo $((Y))", "echo ${S:Y}", "echo $[Y]"].map((f) =>
    ["CONTORNO", `payload aritmetico entre plicas, depois de um \`cd\`: \`${f}\` (#576)`, `Y='a[$(rm -rf x)]'; cd .claude/hooks && ${f}`]),
  ["CONTORNO", "payload aritmetico entre plicas que nomeia a fronteira, sem `cd` (#576)", "Y='a[$(rm -rf .claude/hooks/x)]'; echo ${A[Y]}"],
];

/**
 * Leitura legitima que a fronteira NEGA hoje. Um guarda que nega trabalho de leitura treina a
 * ser contornado, e cinco destes foram medidos numa sessao real — dois bloquearam passos que o
 * proprio processo exige (correr a suite dos hooks, publicar um comentario sobre o assunto).
 */
const FALSO_POSITIVO = [
  ["`for` a encabecar", `for f in ${F}; do cat $f; done`],
  ["atribuicao de ambiente", `FOO=1 node ${S}`],
  // A mesma classe, depois de um `cd` para a fronteira (#185): o segmento leva o directorio e o
  // `resto()` nunca consome uma atribuicao — falha FECHADO, de proposito.
  ["atribuicao de ambiente, depois de um `cd` para a fronteira", "cd .claude/hooks && X=y cat a"],
  // O `sort` e o `uniq` nao dispensam o marcador (#185): escrevem, e a allowlist das flags deles teve
  // um buraco novo em cada uma de tres leituras. Negar estas e o preco aceite — ver `SEM_MARCADOR`.
  ["`| sort | uniq -c` depois de um `cd` para a fronteira", "cd .claude/hooks && node tests/test-hooks.mjs | sort | uniq -c"],
  ["`<(sort ...)` da fronteira", "diff <(sort .claude/hooks/a.mjs) <(sort .claude/hooks/b.mjs)"],
  ["`$(ls | sort)` depois de um `cd` para a fronteira", "cd .claude/hooks && wc -l $(ls | sort)"],
];

/**
 * CORRIGIDOS pelo #101. Nasceram em `FALSO_POSITIVO` — negados sem razao — e migraram para aqui
 * quando deixaram de o ser.
 *
 * **Migraram, nao foram apagados.** Uma entrada que sai do ficheiro deixa de ser afirmada por
 * coisa nenhuma, e uma regressao que reponha a negacao passa com a suite verde (`TP4`). Aqui a
 * assercao inverte-se: exige-se que PASSEM.
 *
 * Os que FICARAM em `FALSO_POSITIVO` — `for` e a atribuicao — nao e por esquecimento: cada um e
 * uma classe propria, com o contra-exemplo medido que o tira deste ambito. O do `cd` saiu no #185:
 * o `cd` deixou de contar como segmento que toca, e o que corre depois e julgado no sitio certo.
 */
const CORRIGIDO = [
  ["`cd` para uma subpasta da fronteira", `cd .claude/hooks/tests && node test-hooks.mjs`],
  ["`if` a encabecar o segmento", `if grep -q FRONTEIRA ${F}; then echo ok; fi`],
  ["`time`", `time node ${S}`],
  ["`timeout`", `timeout 60 node ${S}`],
  ["`env`", `env node ${S}`],
  ["`command`", `command cat ${F}`],
];

// Os casos do #185 (os caminhos escritos de outra maneira, `FECHADO_PELO_CAMINHO` e `CONTROLO_CAMINHO`) vivem no
// `tests-fronteira-caminho.mjs` desde o #631: este ficheiro chegou as 498 linhas.

export function registar({ test, eq }) {
  for (const [nome, comando, rotulo] of FECHADO) {
    test(`inventario/fechado: ${nome}`, () => {
      eq(porqueAltera(comando), rotulo, `"${comando}" tinha de ser negado por ${rotulo}`);
    });
  }

  // Afirma a NEGACAO, nunca o rotulo — ver o cabecalho do grupo. A correccao certa muda o
  // rotulo e mantem isto verde; a ingenua perde a negacao e poe-o vermelho.
  for (const [nome, comando, rotulo] of FECHADO_PELA_CABECA) {
    test(`inventario/cabeca: ${nome}`, () => {
      const r = porqueAltera(comando);
      eq(r !== null, true,
        `"${comando}" passou a ser PERMITIDO — a correccao do verbo tem de o negar pelo verbo REAL, nao pela cabeca (#101)`);
      // O rotulo so se afirma onde ele foi PREVISTO. Nos tres com `null` a negacao vem do
      // acidente do basename, e afirmar `verbo-nao-e-leitura:evil.js` era prender a suite a um
      // acidente — quando a slice das atribuicoes o corrigir, o rotulo muda e o teste devia
      // ficar verde, nao vermelho.
      if (rotulo !== null) {
        eq(r, rotulo,
          `"${comando}" e negado por "${r}" e devia ser por "${rotulo}" — negar pela cabeca em vez do verbo real e o defeito que este grupo existe para apanhar (#101)`);
      }
    });
  }

  for (const [classe, nome, comando] of ABERTO) {
    // A mensagem de falha diz o que fazer, porque vermelho AQUI e boa noticia.
    test(`inventario/ABERTO [${classe}]: ${nome}`, () => {
      eq(
        porqueAltera(comando),
        null,
        `"${comando}" ja NAO passa — se foi fechado de proposito, mover a entrada de ABERTO para FECHADO (#101)`
      );
    });
  }

  for (const [nome, comando] of CORRIGIDO) {
    test(`inventario/corrigido: ${nome}`, () => {
      eq(
        porqueAltera(comando),
        null,
        `"${comando}" voltou a ser NEGADO — era um falso positivo corrigido pelo #101. Nao ` +
          `mexer na assercao: corrigir o codigo, ou mover a entrada de volta com a razao`
      );
    });
  }

  for (const [nome, comando] of FALSO_POSITIVO) {
    test(`inventario/falso-positivo: ${nome}`, () => {
      const r = porqueAltera(comando);
      eq(
        r === null,
        false,
        `"${comando}" ja passa — se foi corrigido, tirar a entrada de FALSO_POSITIVO (#101)`
      );
    });
  }
}
