/**
 * A fronteira: quem RECEBE codigo pelo stdin com uma cabeca, um executor ou um grupo antes (#566) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: o `RECEBE_CODIGO` (`fronteira.mjs`) so via a shell LOGO a seguir ao `|` ou ao inicio do comando, e
 * 56 formas deixavam (medido no `main` a 19 nov): `| env bash`, `| sudo -u eu bash`, `| timeout 5s bash`,
 * `| caffeinate -i bash`, `| (bash)`, `env sudo -s <<EOF`, `nohup su <<<'...'`, `| bash /dev/stdin`, e a fronteira a
 * vista noutro comando (`cat <f>; true | env bash`). O `recebeDe` (`posicao.mjs`) le-as por POSICAO, e o
 * `fronteira.mjs` so ACRESCENTA no fim de cada ramo: nenhum rotulo muda.
 *
 * Chama a decisao (`porqueAltera`) directamente, sem o spawn do hook: sao ~100 casos, e o rotulo e o que se afirma.
 * Os CONTROLOS correm nos DOIS ramos (a fronteira citada e a vista) e cada um prende uma condicao da regra.
 */
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { MAX_PALAVRAS, recebeDe } from "../lib/posicao.mjs";
import { comandos } from "../lib/comandos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-recebe.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const F = ".claude/hooks/x.mjs";
/** A fronteira so CITADA (o ramo citado) e A VISTA (o ramo a vista). */
const CITADA = `echo 'rm -rf ${F}' |`;
const VISTA = `cat ${F} |`;
const DOC = (cab) => `${cab} <<'EOF'\nrm -rf ${F}\nEOF`;
const STR = (cab) => `${cab} <<<'rm -rf ${F}'`;

/** As pontas que recebem o stdin e corriam codigo: medidas a DEIXAR no `main`. */
const PONTAS = [
  "env bash", "X=1 bash", "sudo sh", "env -i bash", "timeout 5 bash", "exec bash", "command bash", "nohup bash", "env node",
  "sudo -u eu bash", "env -u FOO bash", "timeout -s KILL 5 bash", "nice -n 5 bash", "time bash", "stdbuf -o0 bash",
  "/usr/bin/env bash", "env X=1 Y=2 bash", "X=1 Y=2 bash", "sudo env bash", "env bash -s", "env bash -", "env python3 -",
  "doas sh", "ionice -c 3 bash", "env sudo -s", "nohup su", "env su",
  "setsid bash", "unbuffer bash", "timeout 5s bash", "timeout 1m bash",
  "caffeinate -i bash", "flock /tmp/l bash", "(bash)", "{ bash; }", "bash /dev/stdin", "node /dev/stdin",
  "bash -s -- arg", "env bash -s -- arg",
  // A regra do `su`: quaisquer argumentos, salvo o `-c` (a 3.a leitura do plano).
  "su - postgres", "env su root",
  // Verdadeiro positivo: o `-u` leva o 1.o `bash`, e o 2.o le o stdin.
  "env -u bash bash",
  // Das duas leituras do diff: uma flag de cabeca que o `resto()` nao sabe que leva valor; o `su`/`sudo -s` depois de
  // um executor; a flag `+x`; o stdin escrito de outra maneira; o verbo que expande, lido como uma shell; e as formas
  // longas da shell elevada.
  "sudo --user eu bash", "stdbuf --output L bash", "sudo -D /tmp bash",
  "caffeinate su", "flock /tmp/l su", "caffeinate sudo -s",
  "env bash +x", "bash /dev//stdin", "bash /dev/./stdin", "bash /dev/fd/0", "bash /proc/self/fd/0", "bash /dev/std?n",
  "$SHELL /dev/stdin", "env $SHELL -s x", "sudo --shell", "sudo --login",
  // Da passagem 2 (adversarial): o recomeco que tira o VALOR mantem a cabeca e as flags; e a substituicao de processo.
  "sudo -i --user root", "sudo --login --user root", "sudo -s --user root", "sudo --user eu -E bash", "sudo --user eu -- bash",
  "sudo -D /tmp -E bash", "env -P /bin -i bash", "sudo --user eu --group g bash", "env bash <(cat)",
  // Da passagem 2 (correcao): o `-` e o stdin mesmo com um script a seguir; o `runuser` e o `doas -s`; as flags agrupadas
  // (`-xs`, `-Es`); e a leitura ANTIGA do verbo (`./n=/node` e um comando para o bash, nao uma atribuicao).
  "node - x.js", "bash - arg", "env runuser", "env doas -s", "env bash -xs", "env sudo -Es", "env ./n=/node",
  // Da passagem 3: o `-s` agrupado com um posicional; o grupo que eleva e acaba numa letra que leva valor; o `su`/`sudo`
  // depois de um executor em qualquer posicao (e com um isco por nome, `/tmp/sudo`); e o `-iu` (antes "fica de fora").
  "env bash -xs arg", "sudo -su eu bash", "sudo -sg wheel bash", "caffeinate sudo caffeinate su", "flock /tmp/sudo su",
  "flock /tmp/sudo sudo -s", "caffeinate sudo -u x caffeinate su", "sudo -iu root",
  // Um `-c` ANTES do `su` (de outro comando) nao o tira: o `ultimoC` conta so o que vem depois. Um `-c` que nao e opaco
  // (`grep -c`): com `sh -c` o OPACO ja negava, e o caso nao prendia o `ultimoC`.
  "caffeinate grep -c x su",
];
/** Os heredocs e as here-strings com uma cabeca antes de quem os corre. */
const STDIN = [
  DOC("env sudo -s"), DOC("nohup su"), DOC("X=1 su"), DOC("timeout 5 sudo -i"), DOC("timeout 5 $X"), DOC("setsid $X"), DOC("doas $X"),
  STR("env sudo -s"), STR("timeout 5 $X"), STR("setsid $X"), STR("nohup su"),
  DOC("nohup runuser"), DOC("nohup sudo --login --user root"),
];
/** A fronteira A VISTA, com a ponta noutro comando (o alcance do piso: o comando inteiro). */
const A_VISTA = [
  `echo rm -rf ${F} | env bash`, `${VISTA} X=1 bash`, `echo rm -rf ${F} | sudo sh`,
  `cat ${F}; ${DOC("env sudo -s")}`, `cat ${F}; true | env bash`,
];
/** Os falsos positivos aceites (so num comando que ja toca a fronteira): ficam NEGADOS, e a decisao esta escrita. */
//  As duas famílias que a P3 mediu: um EXECUTOR seguido de uma palavra com nome de shell em QUALQUER posicao (a regra
//  do #336 para os executores: nao se sabe a gramatica deles), e o `su` com argumentos a seguir ao utilizador (o `su`
//  conta sempre, salvo com `-c`: o alcance do piso para o heredoc).
const ACEITES = ["command -v bash", "/tmp/evil/env grep bash", "npx prettier --parser bash", "$PAGER", "env node --version",
  "flock /tmp/l grep bash", "su eu python3 x.py",
  // Das leituras do diff: depois de um executor, QUALQUER nome exato (nao so de shell); uma cabeca com uma flag antes de
  // um comando cujo argumento tem esse nome (a flag podia levar valor); e um script que expande.
  "npm ls node", "env -i grep bash", 'node "$F"',
  // Da passagem 2: o recomeco (b) le um 1.o argumento que expande como uma shell; e o verbo que expande, com `-s`.
  'env -i grep "$P"', '"$GREP" -s x',
  // Da passagem 3: o `dono` e a cabeca MAIS PROXIMA da flag (o `-i` e do `env`, nao do `sudo`); e um `sudo` que eleva em
  // qualquer posicao depois de um executor.
  "sudo env -i grep bash", "caffeinate sudo -s grep x"];
/** Os CONTROLOS: recebem o stdin e NAO correm codigo dele. Cada um prende uma condicao da regra. */
const DEIXAM = [
  "env bash script.sh", // um script a seguir e leitura
  "grep bash", "env grep bash", "X=1 grep bash", "tee /tmp/bash", "timeout 5 grep bash", // o verbo nao e um interpretador
  "env node x.mjs", "python3 x.py", "python3 -m json.tool", // o 1.o nao-flag e um script ou um modulo
  "sudo -u bash grep x", // o `-u` leva o `bash`
  "sudo -s grep x", // a shell elevada com um comando a seguir
  'npx prettier "$F"', // depois de um executor, a palavra que expande nao conta
  '"$JQ" .x', // a palavra que expande no verbo, com argumentos (com `-r` ja negava: o inline de um comando-variavel)
  "node-gyp", "php-cs-fixer fix -", // os nomes EXATOS, sem o sufixo largo
  "env -i sudo grep x", // o `-i` e do `env`, e ha verbo
  "sudo -S grep x", // o `-S` maiusculo le a password, nao abre shell
  // O ramo "so cabecas" (sem verbo), que nenhum controlo prendia: cada um prende uma condicao da shell elevada.
  "sudo -S", // so `s`/`i` MINUSCULOS
  "env -i sudo", // o `-i` e do `env`, antes do `sudo`
  "sudo env -i", // o `-i` e do `env`, depois da cabeca seguinte (o `ateCabeca`)
  "sudo -u eu", // nenhuma flag que eleva
  // As condicoes do `-s`: so numa SHELL, e so ANTES do 1.o posicional.
  "python3 -s x.py", "bash x.sh -s",
  // O recomeco (b) nao tira o comando a seguir a uma flag que ELEVA (o corpus da P3 apanhou-o a negar estes).
  "sudo -s python3 -m json.tool", "sudo -s rm -rf /tmp/x",
  // Da passagem 3: uma flag da UM valor (o `usadas`: `--user` ja deu o `eu`, e o `grep` fica verbo); e o `dono` e a
  // cabeca mais proxima (o `-s` e do `sudo`, nao do `env`).
  "sudo --user eu grep bash", "env sudo -s python3 -m json.tool",
  // Da leitura focada: o grupo que eleva e ACABA numa letra sem valor (`-sE`).
  "sudo -sE python3 -m json.tool",
];
/** O `su -c <comando que nao le o stdin>` (#600): com a fronteira no MESMO comando, o `inlineDe` nega-o (o `su -c` e
 *  opaco, como o `sh -c`). O que o `recebeDe` decide so se ve com a fronteira NOUTRO comando, e o `su` fora de quem a
 *  cita: e ai que estes controlos vivem. Eram `DEIXAM` antes do #600. */
const SU_C_DEIXAM = ["su --command=ls", "su --session-command=ls", "caffeinate su -c ls", "su -c ls"];

const falha = (cmd, esperado, obtido) => new Error(`"${cmd.replace(/\n[\s\S]*/, " <<heredoc>>")}": esperado ${esperado}, obtido ${obtido}`);
const nega = (cmd, rotulo) => {
  const r = porqueAltera(cmd);
  if (r !== rotulo) throw falha(cmd, rotulo, r);
};
const deixa = (cmd) => {
  const r = porqueAltera(cmd);
  if (r !== null) throw falha(cmd, "null", r);
};

export function registar({ test }) {
  // O ramo CITADO: a fronteira so no texto do `echo` (ou no corpo do heredoc). O rotulo e o do ramo.
  for (const p of PONTAS) test(`recebe: \`| ${p}\` com a fronteira citada NEGA (#566)`, () => nega(`${CITADA} ${p}`, "citado-mas-executado"));
  test("recebe: `|& env bash` com a fronteira citada NEGA (#566)", () => nega(`echo 'rm -rf ${F}' |& env bash`, "citado-mas-executado"));
  for (const c of STDIN) test(`recebe: \`${c.replace(/\n[\s\S]*/, "")}\` com o corpo na fronteira NEGA (#566)`, () => nega(c, "citado-mas-executado"));
  // O ramo A VISTA: o rotulo e `recebe-codigo`, sobre TODOS os comandos.
  for (const c of A_VISTA) test(`recebe: \`${c.replace(/\n[\s\S]*/, "")}\` com a fronteira a vista NEGA (#566)`, () => nega(c, "recebe-codigo"));
  for (const p of PONTAS) test(`recebe: \`cat <f> | ${p}\` com a fronteira a vista NEGA (#566)`, () => nega(`${VISTA} ${p}`, "recebe-codigo"));
  for (const p of ACEITES) {
    test(`recebe: \`| ${p}\` NEGA — falso positivo aceite, so com a fronteira (#566)`, () => {
      nega(`${CITADA} ${p}`, "citado-mas-executado");
      nega(`${VISTA} ${p}`, "recebe-codigo");
    });
  }
  // Os CONTROLOS, nos DOIS ramos: sem eles, uma regra que negasse toda a ponta de um pipe passava.
  for (const p of DEIXAM) {
    test(`recebe: CONTROLO — \`| ${p}\` DEIXA, nos dois ramos (#566)`, () => {
      deixa(`${CITADA} ${p}`);
      deixa(`${VISTA} ${p}`);
    });
  }
  for (const p of SU_C_DEIXAM) {
    test(`recebe: CONTROLO — \`cat <f>; true | ${p}\` DEIXA: o valor do \`-c\` nao le o stdin (#566, #600)`, () => deixa(`cat ${F}; true | ${p}`));
  }
  test("recebe: CONTROLO — um heredoc para quem nao corre codigo DEIXA (#566)", () => {
    deixa(`cat ${F}; ${DOC("env grep x").replace(`rm -rf ${F}`, "linha")}`);
  });
  // A guarda "so com stdin": sem pipe, heredoc nem here-string, a shell nao le codigo do stdin do hook.
  test("recebe: CONTROLO — uma shell sem stdin (`cat <f>; env bash`, `env node --version`) DEIXA (#566)", () => {
    deixa(`cat ${F}; env bash`);
    deixa(`cat ${F}; env node --version`);
  });

  // O CUSTO: muitos comandos de pipe com cabecas e `{` ABAIXO dos tectos, que DEIXAM (chegam ao `recebeDe` sem ser
  // negados antes), nos dois ramos, em menos de 1 s acima de um comando curto (o precedente do `tests-fronteira-posicao`).
  const ms = (c) => {
    const i = performance.now();
    porqueAltera(c);
    return performance.now() - i;
  };
  for (const [nome, cmd] of [
    ["citada", `${CITADA} ${"env A=1 timeout 5 grep x | ".repeat(150)}grep x`],
    ["a vista", `${VISTA} ${"env A=1 timeout 5 grep x | ".repeat(150)}grep x`],
    ["citada, com `{`", `${CITADA} ${"{ env A=1 grep x; } | ".repeat(150)}grep x`],
    // O recomeco depois de um executor, ABAIXO do tecto (uma cadeia de mais de `JANELA` cabecas ja nega, por desenho):
    // 150 pontas, cada uma com um executor e cinco `sudo`, um `recebeEm` por cada.
    ["citada, executores e `sudo`", `${CITADA} ${"caffeinate sudo -u x sudo -u x sudo -u x sudo -u x sudo -u x grep x | ".repeat(150)}grep x`],
    // A alternancia que recomecava em cada `caffeinate` dentro de cada `sudo` (o recomeco (a), hoje uma varredura).
    ["citada, um comando com `caffeinate sudo` alternados", `${CITADA} ${"caffeinate sudo -u x ".repeat(40)}grep x`],
  ]) {
    test(`recebe: ${nome} — DEIXA em menos de 1 s acima do arranque (#566)`, () => {
      const base = Math.min(ms(`${VISTA} grep x`), ms(`${VISTA} grep x`), ms(`${VISTA} grep x`));
      const t = ms(cmd) - base;
      deixa(cmd);
      if (t > 1000) throw new Error(`${t.toFixed(0)} ms acima do arranque para ${cmd.length} caracteres`);
    });
  }
  // O custo do `recebeDe` SO (o `porqueAltera` inteiro paga ~2,5 s num comando de 46k caracteres JA no `main`: o
  // `inlineDe` com `qualquer`, medido a 19 nov — nao e deste ticket). Abaixo do tecto de palavras o pior caso medido
  // (as atribuicoes LARGAS com o recomeco (b), que a 36k caracteres levavam 44 s) DEIXA depressa; acima, NEGA logo.
  const soRecebe = (cmd) => {
    const cs = comandos(cmd);
    const i = performance.now();
    return { r: cs.some(recebeDe), t: performance.now() - i };
  };
  test(`recebe: abaixo do tecto (${MAX_PALAVRAS} palavras), as atribuicoes LARGAS com o recomeco (b) DEIXAM em menos de 1 s (#566)`, () => {
    const { r, t } = soRecebe(`${CITADA} env ${"A-B=1 ".repeat(190)}env ${"-X y ".repeat(30)}grep x`);
    if (r) throw new Error("negou um comando que corre so um `grep`");
    if (t > 1000) throw new Error(`${t.toFixed(0)} ms no recebeDe`);
  });
  test(`recebe: acima do tecto (${MAX_PALAVRAS} palavras), um comando que recebe o stdin NEGA, depressa (#566)`, () => {
    for (const cmd of [`${CITADA} env ${"A-B=1 ".repeat(6000)}env ${"-X y ".repeat(30)}grep x`,
      `${CITADA} caffeinate ${"sudo caffeinate bash x ".repeat(2000)}`]) {
      const { r, t } = soRecebe(cmd);
      if (!r) throw new Error(`deixou um comando de ${cmd.length} caracteres acima do tecto`);
      if (t > 1000) throw new Error(`${t.toFixed(0)} ms no recebeDe`);
    }
  });
  // O tecto do recomeco (b): mais de `JANELA` flags desconhecidas com valor — nao se sabe quem corre, e nega.
  test("recebe: 33 flags desconhecidas com valor NEGAM (o tecto do recomeco (b), #566)", () => {
    nega(`${CITADA} sudo ${Array.from({ length: 33 }, (_, i) => `--z${i} v`).join(" ")} grep x`, "citado-mas-executado");
  });
  // Os tectos do `verboEm`/`posicoes` no ramo A VISTA, onde o `negaInline` nao corre neste comando (nao toca).
  test("recebe: no ramo a vista, mais de 32 cabecas ou de 32 `{` numa ponta NEGAM (os tectos, #566)", () => {
    nega(`cat ${F}; true | ${"env ".repeat(33)}grep x`, "recebe-codigo");
    nega(`cat ${F}; true | ${"{ ".repeat(33)}grep x`, "recebe-codigo");
  });
}
