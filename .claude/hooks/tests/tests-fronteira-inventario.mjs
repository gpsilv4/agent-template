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
 * que mais mudava. E nao ha outra rede — a varredura de mutacao **nao cobre**
 * `.claude/hooks/lib/` (medido; e o #136).
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
  // --- Normalizacao de caminho: o caminho esta la, escrito de outra maneira ----
  ["DESCUIDO", "`../` pelo meio", `cp /tmp/x .agent/scripts/../../.claude/hooks/y.mjs`],
  ["DESCUIDO", "barra dupla", "cp /tmp/x .claude//hooks/y.mjs"],
  ["DESCUIDO", "`/./` pelo meio", "cp /tmp/x .claude/./hooks/y.mjs"],
  ["DESCUIDO", "caminho absoluto", "cp /tmp/x /Users/g/proj/.claude/hooks/y.mjs"],
  ["DESCUIDO", "til", "cp /tmp/x ~/proj/.claude/hooks/y.mjs"],
  // --- Directorio de trabalho: o segmento que escreve nao tem o caminho -------
  ["DESCUIDO", "`cd` noutro segmento", "cd .claude/hooks && cp /tmp/x y.mjs"],
  ["DESCUIDO", "`cd` em subshell", "(cd .claude/hooks && cp /tmp/x y.mjs)"],
  // --- Aridade do julgamento: so o PRIMEIRO segmento que toca e julgado -------
  ["DESCUIDO", "prefixar com uma leitura desarma o verbo", `cat .claude/settings.json && cp /tmp/x ${H}`],
  ["DESCUIDO", "o mesmo, contra o ramo do git", `cat .claude/settings.json && git rm ${H}`],
  // --- Ancoragem: regexes presos ao inicio do segmento ------------------------
  ["DESCUIDO", "`git` invocado por caminho", `/usr/bin/git rm ${H}`],
  // --- Verbos de LEITURA que destroem -----------------------------------------
  ["DESCUIDO", "`find -delete`", "find .claude/hooks/ -delete"],
  ["DESCUIDO", "`find -exec rm`", "find .githooks/ -type f -exec rm {} +"],
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
  ["`if` a encabecar o segmento", `if grep -q FRONTEIRA ${F}; then echo ok; fi`],
  ["`for` a encabecar", `for f in ${F}; do cat $f; done`],
  ["`time`", `time node ${S}`],
  ["`timeout`", `timeout 60 node ${S}`],
  ["`env`", `env node ${S}`],
  ["`command`", `command cat ${F}`],
  ["atribuicao de ambiente", `FOO=1 node ${S}`],
  ["`cd` para uma subpasta da fronteira", `cd .claude/hooks/tests && node test-hooks.mjs`],
];

export function registar({ test, eq }) {
  for (const [nome, comando, rotulo] of FECHADO) {
    test(`inventario/fechado: ${nome}`, () => {
      eq(porqueAltera(comando), rotulo, `"${comando}" tinha de ser negado por ${rotulo}`);
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
