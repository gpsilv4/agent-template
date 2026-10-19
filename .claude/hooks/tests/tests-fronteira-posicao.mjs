/**
 * A fronteira pela POSICAO de comando: os interpretadores a correr codigo inline (#336, PR a) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: o `FLAG_INLINE` so conhecia `-e|-p|-c` SOLTOS, e `node -pe`, `perl -le`, `python3 -Ic`,
 * `ruby -ne`, `php -r` e `node --import data:` escreviam na fronteira com o hook a deixar (medido pelo hook
 * real a 2026-10-18). A correccao SO ACRESCENTA negacoes: as regex de hoje ficam como piso, e tres versoes
 * do plano que tentavam substitui-las ou abrir uma excepcao para mensagens foram reprovadas pelo
 * `plan-auditor` por afrouxarem (Fase 0 v4 no #336).
 *
 * Os CONTROLOS variam um eixo so — a letra de codigo, com o mesmo argumento — e tem a fronteira presente:
 * sem ela o `julga` sai antes de qualquer regra, e um controlo sem ela fica verde com a regra apagada.
 */
import { pathToFileURL } from "url";
import { rmSync } from "fs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-posicao.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const H = ".claude/hooks/stop-verify.mjs";
const S = ".claude/settings.json";

/** Escritas que passavam: a fronteira so no codigo citado (o ramo citado) ou no `argv` do proprio
 *  interpretador, noutro segmento que nao a toca (o `cat <f> | node -e`). */
const NEGA = [
  ["`node -pe` (letras agrupadas)", `node -pe "require('fs').writeFileSync('${S}','{}')"`],
  ["`perl -le`", `perl -le 'unlink "${H}"'`],
  ["`perl -E`", `perl -E 'unlink "${H}"'`],
  ["`python3 -Ic`", `python3 -Ic "import os; os.remove('${H}')"`],
  ["`ruby -ne`", `ruby -ne 'File.delete("${H}")' /dev/null`],
  ["`php -r`", `php -r 'unlink("${H}");'`],
  ["`node --import data:`", `node --import 'data:text/javascript,import fs from "fs";fs.rmSync("${H}")' -v`],
  ["`node --require=data:`", `node --require='data:text/javascript,require("fs").rmSync("${H}")' -v`],
  ["`cat <f> | node -e` (o codigo cita a fronteira)", `cat ${H} | node -e "require('fs').rmSync('${H}')"`],
  // O ramo do comando-VARIAVEL: sem o nome de nenhum interpretador no texto, o piso nao o via.
  ["`$INTERP -pe` (nao se sabe quem corre)", `$INTERP -pe "require('fs').rmSync('${H}')"`],
  ["`do node -pe` (a palavra-chave a frente)", `for i in 1; do node -pe "require('fs').rmSync('${H}')"; done`],
  ["`find -exec node -pe`", `find /tmp -maxdepth 0 -exec node -pe "require('fs').rmSync('${H}')" \\;`],
  ["`npx node -pe`", `npx node -pe "require('fs').rmSync('${H}')"`],
  // Da leitura adversarial do PR (a): passavam no `main` E na primeira versao do branch.
  // A jusante de um pipe que sai de um segmento que toca: o caminho chega pelo stdin, e o codigo nao o cita.
  ["`find <f> | python3 -c` (o caminho pelo stdin)", `find .claude/hooks -name '*.bak' | python3 -c 'import sys,os;[os.remove(l.strip()) for l in sys.stdin]'`],
  ["`ls <f> | perl -lne unlink`", "ls -d .claude/hooks/* | perl -lne unlink"],
  ["`echo <f> | sort | node -e` (dois pipes)", `echo ${H} | sort | node -e "require('fs').rmSync(require('fs').readFileSync(0,'utf8').trim())"`],
  // Uma atribuicao DEPOIS de uma cabeca, e as cabecas com flags que o consumo das palavras-chave escondia.
  ["`env X=1 node -pe`", `env NODE_NO_WARNINGS=1 node -pe "require('fs').writeFileSync('${S}','{}')"`],
  ["`time -p node -pe`", `time -p node -pe "require('fs').rmSync('${H}')"`],
  ["`exec -a nome node -pe`", `exec -a nome node -pe "require('fs').rmSync('${H}')"`],
  ["`function f { node -pe ...; }`", `function f { node -pe "require('fs').rmSync('${H}')"; }; f`],
  // Nomes com a versao colada (o macOS traz `perl5.34`; o Debian, `php8.2` e `lua5.4`), e `node@20`.
  ["`perl5.34 -e`", `perl5.34 -e 'unlink "${H}"'`],
  ["`lua5.4 -e`", `lua5.4 -e "os.remove('${H}')"`],
  ["`php8.2 -r`", `php8.2 -r 'unlink("${H}");'`],
  ["`npx -p node@20 node@20 -pe`", `npx -p node@20 node@20 -pe "require('fs').rmSync('${H}')"`],
  // Letras depois de digitos, e o `-S` colado ao valor.
  ["`perl -0777ne`", `perl -0777ne 'unlink "${H}"' /dev/null`],
  ["`env -S'node -pe ...'`", `env -S'node -pe "require(\\"fs\\").rmSync(\\"${H}\\")"'`],
  ["`env --split-string=...`", `env --split-string='node -pe "require(1).rmSync(\\"${H}\\")"'`],
  // O `data:` numa atribuicao a frente, e a forma longa do `php -r`.
  ["`NODE_OPTIONS=--import=data:`", `NODE_OPTIONS='--import=data:text/javascript,import fs from "fs";fs.rmSync("${H}")' node /tmp/x.js`],
  ["`php --run`", `php --run 'unlink("${H}");'`],
  // Executores que faltavam.
  ["`npm exec -- node -pe`", `npm exec -- node -pe "require('fs').rmSync('${H}')"`],
  ["`poetry run python -c`", `poetry run python -c "import os; os.remove('${H}')"`],
  ["`uv run --with x python -Ic`", `uv run --with x python -Ic "import os; os.remove('${H}')"`],
  ["`uv run -- python -c`", `uv run -- python -c "import os; os.remove('${H}')"`],
  // Da leitura 1 do PR (a): o nome que a shell so conhece ao expandir, e a flag escrita com escapes ANSI-C.
  ["`/usr/bin/$X -pe`", `/usr/bin/$X -pe "require('fs').rmSync('${H}')"`],
  ["`nod? -pe` (glob)", `nod? -pe "require('fs').rmSync('${H}')"`],
  ["`{node,} -pe` (chavetas)", `{node,} -pe "require('fs').rmSync('${H}')"`],
  ["`node -$'\\x70e'`", `node -$'\\x70e' "require('fs').rmSync('${H}')"`],
  ["`perl -l$E`", `perl -l$E 'unlink "${H}"'`],
  ["`.cl''aude` no argv do interpretador", `cat ${H} | node -e "require('fs').rmSync(process.argv[1])" .cl''aude/hooks/x.mjs`],
];

/** Pares de UM eixo: o mesmo argumento, so a letra muda. O `echo` com espacos poe o comando no ramo
 *  CITADO (a fronteira nao fica a vista), que e onde a regra do inline decide. */
const ANTES = `echo "ver ${S}"; `;
const PARES = [
  ["perl", "perl -lw x.pl", "perl -le x.pl"],
  ["python3", "python3 -IW x.py", "python3 -Ic x.py"],
  ["ruby", "ruby -nw x.rb", "ruby -ne x.rb"],
  ["php", "php -nd x.php", "php -nr x.php"],
  ["node", "node -i x.mjs", "node -ip x.mjs"],
];

export function registar({ test, corre, repo, eq, contem }) {
  const decide = (comando, esperado, extra) => {
    const d = repo();
    try {
      const r = corre({ tool_input: { command: comando }, cwd: d });
      eq(r.decisao, esperado, `"${comando}"`);
      if (extra) extra(r);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  // O rotulo de uma negacao de codigo inline, nos dois ramos: prova QUE regra negou, e nao so que negou.
  const peloInline = (r) => {
    if (!/\(condicao: (?:codigo-inline|citado-mas-executado:inline)\)/.test(r.razao)) throw new Error(`nao foi a regra do inline:\n${r.razao}`);
  };
  for (const [nome, comando] of NEGA) {
    test(`posicao: ${nome} NEGA`, () => decide(comando, "deny", peloInline));
  }

  // Cada SINAL no ramo VISIVEL (a fronteira a vista no `cat`, o interpretador noutro segmento a cita-la), onde
  // o piso nao chega. Com o `nega(` desse sinal mutado, o caso dele fica vermelho (a varredura).
  for (const [sinal, comando] of [
    ["letra", `cat ${H} | perl -le 'unlink "${H}"'`],
    ["data:", `cat ${H} | node --import 'data:text/javascript,import fs from "fs";fs.rmSync("${H}")' -v`],
    ["deno eval", `cat ${H} | deno eval "Deno.removeSync('${H}')"`],
    ["comando-variavel", `cat ${H} | $INTERP -pe "require('fs').rmSync('${H}')"`],
  ]) {
    test(`posicao: o sinal ${sinal} nega no ramo visivel`, () => decide(comando, "deny", peloInline));
  }

  // So o caminho dos SEGMENTOS QUE TOCAM o ve: o `node` esta na LEITURA, e o caminho relativo so e fronteira
  // depois do `cd` (o `normalizaCaminhos`). Sem o `tocam.flatMap(...)`, este passava (leitura 1 do PR a).
  test("posicao: `cd .claude && node -pe ... hooks/x` nega pelo segmento que toca", () =>
    decide(`cd .claude && node -pe "require('fs').rmSync(process.argv[1])" hooks/x.mjs`, "deny", peloInline));
  // O `env -S` corre o valor como comando, seja ele qual for: nega pelo OPACO, e nao so quando e um interpretador.
  test("posicao: `env -S 'rm <f>'` nega", () => decide(`env -S 'rm -rf ${H}'`, "deny"));
  test("posicao: `env --split-string='rm <f>'` nega", () => decide(`env --split-string='rm -rf ${H}'`, "deny"));

  // NEGADO DE PROPOSITO (Fase 0 v4 do #336, seguimento no #344): uma mensagem que cita um `node -e` e a fronteira.
  // Tres versoes de uma excepcao para o texto das mensagens deixavam passar codigo que a shell corre
  // (`bash <(git log -1 --format=%B)`). E o unico caso que so o piso apanha: mata a mutacao dele.
  test("posicao: uma mensagem que cita `node -e` e a fronteira continua NEGADA (de proposito)", () =>
    decide(`git commit -m "fix: o node -e escrevia em ${H}"`, "deny", peloInline));

  for (const [nome, deixa, nega] of PARES) {
    test(`posicao: ${nome} sem letra de codigo DEIXA (controlo)`, () => decide(ANTES + deixa, "allow"));
    test(`posicao: ${nome} com letra de codigo agrupada NEGA`, () => decide(ANTES + nega, "deny"));
  }

  // O `deno eval` ja era negado, mas pelo `eval` do OPACO. O rotulo prova que e a regra do interpretador
  // que o apanha agora — sem ele, o teste ficava verde com o ramo do `deno` apagado.
  test("posicao: `deno eval` NEGA pela regra do interpretador", () =>
    decide(`deno eval "Deno.removeSync('${H}')"`, "deny", (r) => contem(r.razao, ":inline")));

  // O `node -e` que so LE continua negado de proposito (decisao 3 do `/grill`), e a razao diz o que usar.
  test("posicao: `node -e` que so le a fronteira NEGA e aponta o `jq`", () =>
    decide(`node -e "JSON.parse(require('fs').readFileSync('${S}','utf8'))"`, "deny", (r) => contem(r.razao, "jq empty")));
  // Controlo: a nota do `jq` e so das negacoes de codigo inline, nao de toda a razao opaca.
  test("posicao: um `for` negado NAO fala do `jq`", () =>
    decide(`for f in ${S}; do cmp "$f" /tmp/x; done`, "deny", (r) => {
      if (r.razao.includes("jq")) throw new Error(`a razao de um ciclo fala do jq:\n${r.razao}`);
    }));
}
