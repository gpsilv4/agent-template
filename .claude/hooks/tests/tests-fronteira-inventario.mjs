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
  // A normalizacao de caminho e o `cd` fecharam no #185: estao em `FECHADO_PELO_CAMINHO`. Ficam
  // estas formas, medidas pelo leitor independente do #185:
  ["DESCUIDO", "`cd` com o directorio entre aspas", `cd ".claude/hooks" && cp /tmp/x y.mjs`],
  ["DESCUIDO", "nome nu sem ponto, com o directorio dentro da fronteira", "cd .githooks && git rm commit-msg"],
  ["DESCUIDO", "`cd` por `$HOME`", "cd $HOME/proj/.claude/hooks && cp /tmp/x y.mjs"],
  ["DESCUIDO", "glob com o directorio dentro da fronteira", "cd .claude/hooks && rm *"],
  ["DESCUIDO", "`git clean` sem argumento, dentro da fronteira", "cd .claude/hooks && git clean -fdx"],
  ["DESCUIDO", "`git stash -u` dentro da fronteira", "cd .claude/hooks && git stash -u"],
  ["DESCUIDO", "a pasta-mae inteira", "rm -rf .claude"],
  ["DESCUIDO", "chavetas", "rm -rf .claude/{hooks,settings.json}"],
  ["DESCUIDO", "`cd -` de volta a fronteira", "cd .claude/hooks; cd /tmp; cd -; cp /tmp/x y.mjs"],
  ["DESCUIDO", "nome nu num ciclo dentro da fronteira", "while read f; do cd .claude/hooks; rm -rf lib; done"],
  // --- Aridade do julgamento: so o PRIMEIRO segmento que toca e julgado -------
  ["DESCUIDO", "prefixar com uma leitura desarma o verbo", `cat .claude/settings.json && cp /tmp/x ${H}`],
  // --- Ancoragem: regexes presos ao inicio do segmento ------------------------
  // --- Verbos de LEITURA que destroem -----------------------------------------
  // --- Redireccao com descritor explicito -------------------------------------
  // O `[^>\d]` do regex existe para nao confundir `2>&1`, e exclui qualquer descritor.
  ["DESCUIDO", "redireccao `2>`", "node /tmp/x 2> .claude/settings.json"],
  ["DESCUIDO", "redireccao `1>`", "node /tmp/x 1> .githooks/commit-msg"],
  // --- Contorno: exige escrever algo de proposito -----------------------------
  ["CONTORNO", "indireccao por variavel", "D=.claude; cp /tmp/x $D/hooks/y.mjs"],
  ["CONTORNO", "`script -c` re-interpreta uma string", `script -c "rm ${H}" /tmp/log`],
  ["CONTORNO", "`ssh` com o comando em aspas", `ssh host "rm ${H}"`],
];

/**
 * Leitura legitima que a fronteira NEGA hoje. Um guarda que nega trabalho de leitura treina a
 * ser contornado, e cinco destes foram medidos numa sessao real — dois bloquearam passos que o
 * proprio processo exige (correr a suite dos hooks, publicar um comentario sobre o assunto).
 */
const FALSO_POSITIVO = [
  ["`for` a encabecar", `for f in ${F}; do cat $f; done`],
  ["atribuicao de ambiente", `FOO=1 node ${S}`],
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

/**
 * FECHADOS pelo #185: o caminho estava la, escrito de outra maneira, ou o segmento que escreve
 * corria noutro directorio. Nasceram em `ABERTO`. O contexto e FIXO — a raiz, o `cwd` e a home
 * do hook real vem do `contextoFronteira()`, e aqui nao dependem da maquina (`TP3`).
 */
const CTX = { raiz: "/Users/g/proj", cwd: "/Users/g/proj", prefixo: "", home: "/Users/g" };
const CP = "verbo-nao-e-leitura:cp";
const FECHADO_PELO_CAMINHO = [
  ["`../` pelo meio", "cp /tmp/x .agent/scripts/../../.claude/hooks/y.mjs", CTX, CP],
  ["barra dupla", "cp /tmp/x .claude//hooks/y.mjs", CTX, CP],
  ["`/./` pelo meio", "cp /tmp/x .claude/./hooks/y.mjs", CTX, CP],
  ["caminho absoluto", "cp /tmp/x /Users/g/proj/.claude/hooks/y.mjs", CTX, CP],
  ["til", "cp /tmp/x ~/proj/.claude/hooks/y.mjs", CTX, CP],
  ["`$PWD`", "cp /tmp/x $PWD/.claude/hooks/y.mjs", CTX, CP],
  ["`cd` noutro segmento", "cd .claude/hooks && cp /tmp/x y.mjs", CTX, CP],
  ["`cd` em subshell", "(cd .claude/hooks && cp /tmp/x y.mjs)", CTX, CP],
  ["`cwd` numa subpasta, `../` para a fronteira", "cp /tmp/x ../.claude/hooks/y.mjs", { ...CTX, cwd: "/Users/g/proj/.agent", prefixo: ".agent" }, CP],
  // Do leitor independente do #185 — o mais grave ja passava ANTES: a pasta sem a barra final.
  ["apagar a pasta inteira", "rm -rf .claude/hooks", {}, "verbo-nao-e-leitura:rm"],
  ["apagar o `.githooks`", "rm -rf .githooks", {}, "verbo-nao-e-leitura:rm"],
  ["mover a pasta", "mv .claude/hooks /tmp/h", {}, "verbo-nao-e-leitura:mv"],
  // O texto CITADO nao passa pela normalizacao: aqui so o regex com a pasta sem barra o apanha.
  ["apagar a pasta, citado e executado", `eval "rm -rf .claude/hooks"`, {}, "citado-mas-executado"],
  ["`cd` e apagar o `.`", "cd .claude/hooks && rm -rf .", CTX, "verbo-nao-e-leitura:rm"],
  ["`cd` e `find . -delete`", "cd .claude/hooks && find . -delete", CTX, "find-que-escreve"],
  ["`cd` acima e `git rm` da pasta", "cd .claude && git rm -r hooks", CTX, "git-que-escreve"],
  ["`cd` e `git rm` de um ficheiro", "cd .claude/hooks && git rm x.mjs", CTX, "git-que-escreve"],
  ["`cd` e `git checkout -- .`", "cd .claude/hooks && git checkout main -- .", CTX, "git-que-escreve"],
  ["`cwd` dentro da fronteira e `git rm`", "git rm x.mjs", { ...CTX, cwd: "/Users/g/proj/.claude/hooks", prefixo: ".claude/hooks" }, "git-que-escreve"],
  ["o `cwd` por symlink da raiz", "cp /tmp/x .claude//hooks/y.mjs", { raiz: "/private/tmp/p", cwd: "/tmp/p", prefixo: "", home: "/Users/g" }, CP],
  ["`$(...)` dentro da subshell nao a fecha", "(cd .claude/hooks && echo $(date) && cp /tmp/x y.mjs)", CTX, CP],
  ["uma subshell com redireccao fecha", "cd .claude/hooks && (cd /tmp && ls) >/dev/null && cp /tmp/x y.mjs", CTX, CP],
  // O `cd` atras de uma cabeca ou de `then`/`do` segue-se pelo verbo REAL (o `resto()`).
  ["`cd` dentro de um `if`", "if cd .claude/hooks; then cp /tmp/x y.mjs; fi", CTX, CP],
  ["`builtin cd`", "builtin cd .claude/hooks && cp /tmp/x y.mjs", CTX, CP],
  ["`cd` depois de `then`", "if true; then cd .claude/hooks; cp /tmp/x y.mjs; fi", CTX, CP],
  ["`$(a; b)` dentro da subshell nao a fecha", "(cd .claude/hooks && echo $(date; true) && cp /tmp/x y.mjs)", CTX, CP],
  ["redireccao sem espaco", "echo x >.claude/settings.json", {}, "redireciona"],
  // Da terceira leitura do #185. Os quatro primeiros eram REGRESSOES da versao refeita: o segmento
  // do `cd` saia inteiro do `tocam` e levava a redireccao e o `$(...)` que estavam nele.
  ["`cd` com redireccao para a fronteira", "cd /tmp > .claude/settings.json", CTX, "verbo-nao-e-leitura:cd"],
  ["`cd` com redireccao sem espaco", "cd /tmp >.claude/settings.json", CTX, "verbo-nao-e-leitura:cd"],
  ["`popd` com redireccao", "popd > .githooks/pre-commit", CTX, "verbo-nao-e-leitura:popd"],
  ["`cd` com `$(...)` que escreve", "cd /tmp $(rm .claude/settings.json)", CTX, "verbo-nao-e-leitura:cd"],
  ["`do` dentro de uma palavra nao separa", "rm -rf x-do cat .claude/hooks", CTX, "verbo-nao-e-leitura:rm"],
  ["`then` dentro de uma palavra nao separa", "rm -rf x.then cat .claude/hooks", CTX, "verbo-nao-e-leitura:rm"],
  ["redireccao nua depois de um `cd`", "cd .claude/hooks && > x.mjs", CTX, "verbo-nao-e-leitura:>"],
  ["crase que executa", "cd `rm -rf .claude/hooks`", CTX, "citado-mas-executado"],
];

/** Os CONTROLOS do #185: a normalizacao nao pode negar o que nao toca a fronteira. Os de baixo
 *  foram negados pela primeira versao — o directorio dentro da fronteira fazia de qualquer palavra
 *  nua um caminho. */
const DENTRO = { ...CTX, cwd: "/Users/g/proj/.claude/hooks", prefixo: ".claude/hooks" };
const CONTROLO_CAMINHO = [
  ["`../` para fora do repo", "cp /tmp/x ../.claude/hooks/y.mjs", CTX],
  ["absoluto noutro repo", "cp /tmp/x /Users/g/outro/.claude/hooks/y.mjs", CTX],
  ["`cd` para fora da fronteira, e depois escrever", "cd /tmp && cp a b", CTX],
  ["a subshell repoe o directorio", "(cd .claude/hooks && ls) && cp /tmp/a b", CTX],
  ["`cd` para a fronteira, e depois LER", "cd .claude/hooks && cat y.mjs", CTX],
  ["ler pelo caminho absoluto", "cat /Users/g/proj/.claude/settings.json", CTX],
  ["`timeout 60` a correr a suite", "cd .claude/hooks && timeout 60 node tests/test-hooks.mjs", CTX],
  ["`sleep 1` e ler", "cd .claude/hooks && sleep 1 && cat x", CTX],
  ["atribuicao e ler", "cd .claude/hooks && X=y cat a", CTX],
  ["`pushd`/`popd` repoem", "pushd .claude/hooks; popd; cp /tmp/a b", CTX],
  ["`cwd` dentro: `gh`", "gh pr view 220", DENTRO],
  ["`cwd` dentro: `npm`", "npm run lint", DENTRO],
  ["pasta com outro nome que comeca igual", "rm -rf .claude/hooks-old", {}],
  // A primeira versao refeita negava estas leituras pelo `cd` atras de uma cabeca.
  ["`if cd` e LER", "if cd .claude/hooks; then cat y; fi", CTX],
  ["`builtin cd` e LER", "builtin cd .claude/hooks && cat y", CTX],
  ["`command cd` e LER", "command cd .claude/hooks && cat y", CTX],
  ["`time cd` e LER", "time cd .claude/hooks && cat y", CTX],
  // A crase so EXECUTA fora de aspas simples e de heredoc; e um `do` num nome de ficheiro nao parte.
  ["crase num heredoc citado", "cat <<'EOF'\n`rm .claude/hooks/x`\nEOF", CTX],
  ["crase entre aspas simples", "echo 'a `rm .claude/hooks/x`'", CTX],
  ["`-do` num nome de ficheiro", "cat .claude/hooks/x-do", CTX],
  ["`cd` para a fronteira e redireccionar para fora", "cd .claude/hooks && cat x.mjs > /tmp/y", CTX],
];

export function registar({ test, eq }) {
  for (const [nome, comando, ctx, rotulo] of FECHADO_PELO_CAMINHO) {
    test(`inventario/caminho: ${nome}`, () => {
      eq(porqueAltera(comando, ctx), rotulo, `"${comando}" tinha de ser negado por ${rotulo} (#185)`);
    });
  }
  for (const [nome, comando, ctx] of CONTROLO_CAMINHO) {
    test(`inventario/caminho (controlo): ${nome}`, () => {
      eq(porqueAltera(comando, ctx), null, `"${comando}" nao toca a fronteira e foi negado (#185)`);
    });
  }
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
