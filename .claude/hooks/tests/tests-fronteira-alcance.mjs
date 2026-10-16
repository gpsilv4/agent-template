/**
 * O ALCANCE de cada condicao da fronteira — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: a decisao combina condicoes avaliadas em ESCALAS diferentes — o verbo por
 * SEGMENTO, o `inline` e o `opaco` sobre o COMANDO INTEIRO. A assimetria nega leitura legitima,
 * e alinhar tudo por segmento **afrouxa**. As duas coisas sao verdade ao mesmo tempo, e e por
 * isso que o alcance de cada condicao precisa de teste proprio.
 *
 * ESTE MODULO NASCEU DE UMA REPROVACAO. A primeira versao do plano alinhava `inline` E `opaco`
 * por segmento, e uma leitura independente deu o contra-exemplo: `ls <fronteira> | xargs rm`
 * passava a ser PERMITIDO. Com `|`, o segmento que toca a fronteira **alimenta** o consumidor
 * opaco a jusante — o perigo nao esta no segmento que contem o caminho, que era o que o plano
 * assumia.
 *
 * Pior: o criterio de pronto desse plano era *"os 495 linhas de `tests-bypasses.mjs` passam sem
 * alteracao"*, e esse criterio **nao podia ficar vermelho** — os unicos dois casos opacos de la
 * tem a fronteira dentro de aspas e saem pelo ramo antecipado. Um criterio que nao pode reprovar
 * nao e criterio (`TP1`).
 *
 * Por isso os casos do `opaco` sao os PRIMEIROS deste ficheiro, e foram escritos antes do codigo.
 */
import { pathToFileURL } from "url";
import { rmSync } from "fs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-fronteira-alcance.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const H = ".claude/hooks/stop-verify.mjs";
const F = ".claude/hooks/lib/fronteira.mjs";

/** O que o `opaco` tem de continuar a apanhar, e porque o alcance dele NAO se alinha ao verbo:
 *  com `|`, o segmento que toca a fronteira alimenta o consumidor a jusante. */
const OPACO_NEGA = [
  ["pipe de um `ls` da fronteira para `xargs rm`", "ls .claude/hooks/*.mjs | xargs rm"],
  ["pipe de um `find` para `xargs rm -f`", "find .claude/hooks/ -type f | xargs rm -f"],
  ["pipe de um `echo` do caminho para `xargs rm`", `echo ${H} | xargs rm`],
];

/** Leitura legitima que o alcance do `inline` negava. As duas causas medidas numa sessao real,
 *  e ambas diagnosticadas so porque a parte 1 (#101) pos o rotulo na mensagem. */
const INLINE_PERMITE = [
  // A flag de OUTRO comando lida como sendo do interpretador: o regex corre sobre a linha
  // inteira. E comum — `grep -c`, `grep -e`, `sort -c`, `cp -p`, `git log -p`.
  ["`node <ficheiro>` seguido de `grep -c`", `node ${H}; grep -c x /tmp/y`],
  ["`node <ficheiro>` seguido de `grep -e`", `node ${H}; grep -e x /tmp/y`],
  // Um `node -e` noutro segmento, que nao toca fronteira nenhuma.
  ["`cat` da fronteira com um `node -e` noutro segmento", `cat ${F}; node -e "console.log(1)"`],
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

  // --- O CONTRA-CASO PRIMEIRO, porque foi ele que reprovou o plano anterior ----
  for (const [nome, comando] of OPACO_NEGA) {
    test(`alcance: ${nome} continua NEGADO`, () =>
      decide(comando, "deny", (r) => contem(r.razao, "wrapper-opaco")));
  }

  // --- As leituras que o alcance do `inline` negava ---------------------------
  for (const [nome, comando] of INLINE_PERMITE) {
    test(`alcance: ${nome} passa`, () => decide(comando, "allow"));
  }

  // --- O que NAO pode mudar ---------------------------------------------------
  // Sem este, os tres de cima eram satisfeitos por desligar o `inline` por completo.
  test("alcance: `node -e` no segmento que TOCA a fronteira continua NEGADO", () =>
    decide(`cat /tmp/x; node -e "console.log(1)" ${H}`, "deny"));

  // --- O `-c` de um SCRIPT nao e o do interpretador (#317) -------------------------
  // `node eslint.js -c <config>` citando a fronteira era negado como codigo inline: o `-c` e do ESLint.
  // O `-e`/`-c` so e inline ANTES do primeiro ficheiro de script.
  test("alcance: `-c` de um script (`node x.js -c ...`) a ler a fronteira passa", () =>
    decide(`node /tmp/eslint.js -c /tmp/eslint.config.mjs --no-warn-ignored ${H}`, "allow"));
  // A isencao so vale com a fronteira A VISTA: so citada, nao ha leitura a salvar (quarta leitura do #317).
  test("alcance: `node x.js -e` com a fronteira so no codigo citado continua NEGADO", () =>
    decide(`node /tmp/x.js -e "require('fs').writeFileSync('${H}','{}')"`, "deny"));
  // O lado que nao pode abrir: um ficheiro que e o VALOR de uma opcao nao e o script.
  for (const [nome, comando] of [
    ["`python3 -c` com a fronteira", `python3 -c "print(1)" ${H}`],
    ["`node --flag -e` com a fronteira", `node --no-warnings -e "console.log(1)" ${H}`],
    ["`node -r ./x.js -e` (o .js e do `-r`)", `node -r /tmp/x.js -e "console.log(1)" ${H}`],
    ["`node --import ./y.mjs --eval`", `node --import /tmp/y.mjs --eval "console.log(1)" ${H}`],
  ]) {
    test(`alcance: ${nome} continua NEGADO`, () => decide(comando, "deny"));
  }
  // As formas que abriram a primeira versao, que adivinhava que opcoes levam valor (leituras do #317):
  // qualquer opcao antes do script — colada por `=`, desconhecida, com dois espacos — mantem o `-e` inline.
  // Cada uma duas vezes: com a fronteira VISIVEL (o `node` e leitura) e so DENTRO do codigo citado.
  for (const [nome, antes] of [
    ["`--import=x.mjs`", "node --import=/tmp/y.mjs -e"],
    ["`--title x.js` (opcao fora da lista)", "node --title x.js -e"],
    ["`--env-file a.js`", "node --env-file /tmp/a.js -e"],
    ["`-r` com dois espacos", "node -r  /tmp/x.js -e"],
    ["`-e` antes do script", "node -e"],
    ["script entre aspas", `node "/tmp/x.js" -e`],
    ["`python3 -X x.py -c`", "python3 -X x.py -c"],
    ["`perl -Ix.pl -e`", "perl -Ix.pl -e"],
    // O que o SHELL transforma em opcao antes de o interpretador a ver (segunda leitura do #317).
    ["`perl \\-Ix.pl -e` (o shell tira o `\\`)", "perl \\-Ix.pl -e"],
    ["`node $X.js -e` (variavel)", "X=--title=a; node $X.js -e"],
    ["`node [-]-title?x.js -e` (glob)", "node [-]-title?x.js -e"],
    // O `normalizaCaminhos` reescreve `$PWD/` antes do teste: o script so parece script DEPOIS (terceira leitura).
    ["`PWD=--title=; node $PWD/<fronteira>.js -e`", "PWD=--title=; node $PWD/.claude/hooks/a.js -e"],
  ]) {
    test(`alcance: ${nome} com a fronteira visivel continua NEGADO`, () =>
      decide(`${antes} "require('fs').writeFileSync(process.argv[1],'{}')" ${H}`, "deny"));
    test(`alcance: ${nome} com a fronteira so no codigo citado continua NEGADO`, () =>
      decide(`${antes} "require('fs').writeFileSync('${H}','{}')"`, "deny"));
  }
}
