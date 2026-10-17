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

  // --- Quem RECEBE codigo que nao esta num ficheiro (#317, item 24) ---------------------------
  // Um interpretador ou uma shell com um heredoc, uma here-string ou na ponta de um pipe sem argumentos, com
  // a fronteira so no codigo. O heredoc tinha DUAS falhas: o hook cortava-lhe o corpo antes de o julgar, e a
  // lista de quem o corre era outra copia, que divergia (`python3.12`, `(node)`). As outras formas do item 24
  // (flags agrupadas, `php -r`, `--import data:`...) ficam para o issue da posicao de comando.
  for (const [nome, comando] of [
    ["`node <<EOF`", `node <<'EOF'\nrequire('fs').writeFileSync('${H}','{}')\nEOF`],
    ["`bash <<EOF`", `bash <<'EOF'\nrm -rf ${H}\nEOF`],
    ["`python3.12 <<EOF`", `python3.12 <<'EOF'\nopen('${H}','w')\nEOF`],
    ["`(node) <<EOF`", `(node) <<'EOF'\nrequire('fs').writeFileSync('${H}','{}')\nEOF`],
    // Com argumentos (`-u`): sem eles, a regra do pipe no fim tambem o apanhava, e a do `<<... |` nao era exercida.
    ["`cat <<EOF | python3 -u`", `cat <<'EOF' | python3 -u\nopen('${H}','w')\nEOF`],
    ["`N=node; $N <<EOF`", `N=node; $N <<'EOF'\nrequire('fs').writeFileSync('${H}','{}')\nEOF`],
    ["`$(which node) <<EOF`", `$(which node) <<'EOF'\nrequire('fs').writeFileSync('${H}','{}')\nEOF`],
    ["here-string para a shell", `bash <<<'rm -rf ${H}'`],
    ["`echo ... | bash`", `echo 'rm -rf ${H}' | bash`],
    ["`echo ... | node`", `echo "require('fs').writeFileSync('${H}','{}')" | node`],
  ]) {
    test(`alcance: ${nome} com a fronteira so no codigo e NEGADO (#317)`, () =>
      decide(comando, "deny", (r) => contem(r.razao, "citado-mas-executado")));
  }
  // A AUDITORIA do #317, pelo HOOK INTEIRO (o `decide` corre-o): os testes de unidade chamavam o
  // `porqueAltera` com o comando cru e estavam verdes enquanto o hook, que lhe passava o comando sem os
  // heredocs, deixava passar `cat <<'EOF' > <fronteira>` — no `main` desde o #223.
  for (const [nome, comando] of [
    ["`cat <<EOF > <fronteira>`", `cat <<'EOF' > ${H}\nx\nEOF`],
    ["`$(rm ...)` num heredoc sem aspas", `cat <<EOF\n$(rm ${H})\nEOF`],
    ["`cat <<<EOF` seguido de um `rm`", `cat <<<EOF\nrm -rf ${H}\nEOF`],
    ["etiqueta `END-X` seguida de um `rm`", `cat <<END-X\nEND-X\nrm -rf ${H}\nEND`],
    ["`node - <fronteira> <<EOF` a vista", `node - ${H} <<'EOF'\nrequire('fs').writeFileSync(process.argv.at(-1),'')\nEOF`],
    ["`| bash -s`", `echo 'rm -rf ${H}' | bash -s`],
    ["`|& bash`", `echo 'rm -rf ${H}' |& bash`],
    ["`| bash 2>&1`", `echo 'rm -rf ${H}' | bash 2>&1`],
    ["`node.exe -e`", `node.exe -e "require('fs').writeFileSync('${H}','')"`],
    ["`python3-intel64 -c`", `python3-intel64 -c "open('${H}','w')"`],
    // Da 2.a auditoria: o interpretador ENTRE ASPAS (o `main` negava; ler sem as citacoes apagava-lhe o nome),
    // `| bash` com a fronteira a vista noutro segmento, e o `source`/a cabeca antes do comando-variavel.
    ["`\"node\" -e` depois de um `cd`", `cd /tmp && "node" -e "require('fs').rmSync('${H}')"`],
    ["`\"$(command -v node)\" -e`", `"$(command -v node)" -e "require('fs').writeFileSync('${H}','')"`],
    ["`\"/usr/bin/python3\" -c` depois de outro comando", `true; "/usr/bin/python3" -c "open('${H}','w')"`],
    ["`echo rm -rf <fronteira> | bash`, a vista", `echo rm -rf ${H} | bash`],
    ["`source /dev/stdin <<\\EOF`", `source /dev/stdin <<\\EOF\neval "rm -rf ${H}"\nEOF`],
    ["`sudo $SHELL <<EOF`", `sudo $SHELL <<'EOF'\nrm -rf ${H}\nEOF`],
    // Da leitura final: quem corre o stdin numa shell sem se chamar shell. O `\EOF` com um `eval` o `main` negava.
    ["`sudo -s <<\\EOF` com um `eval`", `sudo -s <<\\EOF\neval "rm -rf ${H}"\nEOF`],
    ["`sudo -s <<'EOF'` com um `rm`", `sudo -s <<'EOF'\nrm -rf ${H}\nEOF`],
    ["`su <<EOF`", `su <<'EOF'\nrm -rf ${H}\nEOF`],
    ["`echo ... | sudo -i`", `echo 'rm -rf ${H}' | sudo -i`],
    // DECIDIDO: um heredoc para um interpretador nega mesmo que o codigo so LEIA a fronteira — a politica do
    // `node -e` que a cita; o hook nao distingue ler de escrever dentro do codigo (no `main` passava).
    ["um script por heredoc que so LE a fronteira", `python3 - <<'EOF'\nprint(open('${H}').read())\nEOF`],
  ]) {
    test(`alcance: ${nome} e NEGADO pelo hook (auditoria do #317)`, () => decide(comando, "deny"));
  }
  // O que NAO pode mudar — os falsos positivos que as leituras do #317 mediram: um script a frente do
  // interpretador continua leitura, e o que so MENCIONA um interpretador nao o corre.
  for (const [nome, comando] of [
    // Numa frase, e nao o caminho sozinho: entre aspas e sem espacos, o `desaspa` torna-o VISIVEL, e o caso
    // ia ao outro ramo — o controlo negativo mostrou-o (a isencao do script nao era exercida).
    ["`node <script>` com a fronteira citada num argumento", `node /tmp/ler.js "le ${H}"`],
    // Um `echo`, e nao um `git commit`: na fixture o branch e o `main`, e o commit e negado por outra razao.
    ["um texto que menciona o node e a fronteira", `echo "o node le ${H}"`],
    ["uma mensagem por heredoc que cita `git -c core.pager=` e a fronteira", `cat <<'EOF' > /tmp/msg\ngit -c core.pager='rm ${H}' log passava\nEOF`],
    ["um script por heredoc com `git push --force` em texto", `python3 - <<'EOF'\nprint("git push --force")\nEOF`],
    // O `OPACO` le o comando SEM os corpos: uma mensagem que diga `xargs` ou `eval` e a fronteira nao corre nada.
    ["uma mensagem por heredoc que cita `xargs`, `eval` e a fronteira", `cat <<'EOF' > /tmp/msg\nusa xargs e eval em ${H}\nEOF`],
    ["`node <script> <<EOF` (dados para um ficheiro)", `node /tmp/x.mjs <<'EOF'\nler ${H}\nEOF`],
    // So no texto citado: lido no texto cru, este "bash <<" contava como uma shell a receber codigo.
    ["uma mensagem que cita `bash <<EOF` e a fronteira", `echo "corre bash <<EOF e escreve ${H}"`],
    ["`node --test` filtrado por um padrao com a fronteira", `node --test /tmp/t.mjs 2>&1 | grep -E "not ok|${H}"`],
    // O titulo menciona o node: o corpo do heredoc da mensagem continua a ser texto (o destinatario e o `cat`).
    ["um corpo de PR por heredoc, com o node no titulo", `gh pr view 1 --json title -q "node" && cat <<'EOF' > /tmp/msg\nnode -e escrevia em ${H}\nEOF`],
  ]) {
    test(`alcance: ${nome} passa (#317)`, () => decide(comando, "allow"));
  }
}
