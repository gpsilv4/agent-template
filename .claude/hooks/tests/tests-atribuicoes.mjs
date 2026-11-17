/**
 * As ATRIBUICOES que os hooks leem (#546) — {{PROJECT_NAME}}
 *
 * NAO e um entry point: o `test-hooks.mjs` descobre este modulo e chama `registar()`.
 *
 * PORQUE EXISTE: o bash aceita como atribuicao `X=y`, `X+=y`, `X[i]=y` e `X[i]+=y`, e o `env` aceita qualquer
 * `NOME=valor` (`env 1X=y git`, `env A-B=1 git`). Ate ao #546 havia oito leitores de atribuicoes nos hooks, com
 * quatro formas diferentes, e cada um falhava numa delas. Agora ha duas definicoes em `lib/fronteira-dados.mjs`,
 * uma por DIRECAO de falha:
 * - a LARGA (`ATRIBUICAO_LARGA`), para quem procura algo perigoso mais a frente (o `git`, o `GIT_PAGER`, o
 *   interpretador): saltar a mais e falhar fechado;
 * - a do BASH (`ATRIBUICAO_BASH`), para quem decide pelo verbo que sobra (uma allowlist): saltar a mais abria.
 *
 * Cada caso diz o sitio que prova. Os que ja negavam antes do #546 por outro caminho dizem-no no nome
 * ("regressao"): nao provam a correcao, guardam o veredicto. Os veredictos e o harness do `textos-publicos` vem do
 * `tests-textos-publicos.mjs` (uma definicao so).
 */
import { rmSync } from "fs";
import { pathToFileURL } from "url";
import { porqueAltera } from "../lib/fronteira.mjs";
import { ATRIBUICAO_BASH, ATRIBUICAO_LARGA, nomeDaAtribuicao } from "../lib/fronteira-dados.mjs";
import { afirma, corre as correTextos, DEIXA, ESCRITO, LIMPOS, NEGA } from "./tests-textos-publicos.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "tests-atribuicoes.mjs nao e um entry point: nao corre testes por si.\n" +
      "Correr `node .claude/hooks/tests/test-hooks.mjs`."
  );
  process.exit(1);
}

/** Entry point a que este modulo pertence. */
export const entryPoint = "test-hooks.mjs";

const H = ".claude/hooks/x.mjs";
const RM = `'rm -rf .claude/hooks'`;
/** Um comando com o `commit-msg` isento a seguir a `pre` (a isencao do #511): `ESCRITO` se ela cair. */
const isento = (pre) => `${pre} && node .githooks/commit-msg pr.md && git commit -F pr.md`;

/** Sitio 1 (`guard-protected-branch.mjs`, `invocacoes`): uma atribuicao a frente nao esconde o `git`. Em `main`. */
const NO_PROTEGIDO = [
  ["X+=1 antes do git", "X+=1 git commit -m x"],
  ["X[0]=1 antes do git", "X[0]=1 git commit -m x"],
  ["X[0]+=1 antes do git", "X[0]+=1 git commit -m x"],
  ["env com um nome que comeca por digito (regressao: o `\\w+=` ja o saltava)", "env 1X=y git commit -m x"],
  ["env com um nome com hifen", "env A-B=1 git commit -m x"],
  ["env com um nome com barra", "env a/b=1 git commit -m x"],
  ["regressao (os segmentos partem no `(`): o indice de um array corre o git", "X[$(git commit -m x)]=1 true"],
];

/** Sitios 2 e 3 (`verbos-git.mjs`, `valoresQueExecutam`): a variavel que executa nao fica escondida. Num branch de
 *  feature: so a regra do git-que-executa nega. */
const EXECUTA = [
  ["X+=1 entre o GIT_PAGER e o git", `GIT_PAGER=${RM} X+=1 git log`],
  ["X[0]=1 entre o GIT_PAGER e o git", `GIT_PAGER=${RM} X[0]=1 git log`],
  ["env A-B=1 entre o GIT_PAGER e o git", `GIT_PAGER=${RM} env A-B=1 git log`],
  ["GIT_PAGER+= tambem executa", `GIT_PAGER+=${RM} git log`],
  ["GIT_CONFIG_PARAMETERS+= tambem executa", `GIT_CONFIG_PARAMETERS+="'core.pager'=${RM}" git log`],
];

/** Sitios 4, 5 e 6 (`fronteira.mjs`, `posicao.mjs`): o que corre codigo com a fronteira so citada. */
const FRONTEIRA_NEGA = [
  ["X+=1 antes de um verbo-variavel", `X+=1 $N -e "require('fs').rmSync('${H}')"`],
  ["regressao (o indice ja expandia): X[0]=1 antes de um verbo-variavel", `X[0]=1 $N -e "require('fs').rmSync('${H}')"`],
  ["regressao (o piso): X+=1 antes de um verbo por substituicao", `X+=1 $(echo node) -e "require('fs').rmSync('${H}')"`],
  ["NODE_OPTIONS+= com data:", `NODE_OPTIONS+='--import=data:text/javascript,import fs from "fs";fs.rmSync("${H}")' node /tmp/x.js`],
  ["env X+=1 antes de um comando-variavel com heredoc", `env X+=1 $C <<EOF\nrm ${H}\nEOF`],
  ["regressao (a substituicao ja se julgava): o indice de um array apaga na fronteira", `X[$(rm ${H})]=1 true`],
  ["regressao (as chavetas ja expandiam): {node,-e}=x", `{node,-e}=x "require('fs').unlinkSync('${H}')"`],
  // Alto da 2.a leitura do diff: um interpretador chamado por um caminho com `=` nao e uma atribuicao (o bash corre-o),
  // e a LARGA saltava-o. Com a fronteira a VISTA (o ramo sem `qualquer`) e citada.
  ["um node por um caminho com = (./n=/node -pe), a fronteira a vista", `./n=/node -pe "require('fs').rmSync(process.argv[1])" ${H}`],
  ["regressao (outro caminho ja nega): um perl por um caminho com = (./p=/perl -ne), a fronteira a vista", `./p=/perl -ne "unlink" ${H}`],
  ["regressao (o qualquer do ramo citado): um node por um caminho com =, a fronteira citada", `./n=/node -pe "require('fs').rmSync('${H}')"`],
  ["regressao (outro caminho ja nega): o data: com um node por um caminho com =", `NODE_OPTIONS='--import=data:text/javascript,0' ./n=/node x.js ${H}`],
  // Alto da 3.a leitura do diff: um EXECUTOR por um caminho com `=` continua executor (a LARGA so depois de env/sudo).
  ["um npx por um caminho com =, a jusante de um pipe", `ls ${H} | ./x=/npx -y node -pe "require('fs').rmSync(require('fs').readFileSync(0,'utf8').trim())"`],
  ["um timeout por um caminho com =, a fronteira citada", `./x=/timeout 5 $N -pe "require('fs').rmSync('${H}')"`],
  ["regressao (o controlo): um npx a jusante de um pipe", `ls ${H} | npx -y node -pe "require('fs').rmSync(require('fs').readFileSync(0,'utf8').trim())"`],
  ["env -u FOO A-B=1 antes de um verbo-variavel", `env -u FOO A-B=1 $N -e "require('fs').rmSync('${H}')"`],
  ["sudo A-B=1 antes de um verbo-variavel", `sudo A-B=1 $N -e "require('fs').rmSync('${H}')"`],
  ["env com duas atribuicoes LARGAS seguidas antes de um verbo-variavel", `env A-B=1 C-D=1 $N -e "require('fs').rmSync('${H}')"`],
  // Os dois Altos da 4.a leitura do diff: uma palavra CITADA com a forma de atribuicao corre como comando, e um
  // `exec -a env` nao e um `env`. Negados pela leitura do verbo do `main`, que o `lerArgv` corre sempre.
  ["\"X+=/perl\" citado e um comando, a jusante de um pipe", `find .claude/hooks -type f | "X+=/perl" -lne unlink`],
  ["\"X[]=/perl\" citado e um comando, a jusante de um pipe", `find .claude/hooks -type f | "X[]=/perl" -lne unlink`],
  ["exec -a env nao e um env", "find .claude/hooks -type f | exec -a env ./c=/caffeinate -i perl -lne unlink"],
  ["doas nao aceita atribuicoes", "find .claude/hooks -type f | doas ./c=/caffeinate -i perl -lne unlink"],
  // Alto da 1.a leitura do diff: o `!expande` olhava para o VALOR (`X=$HOME`), e a atribuicao passava a ser o verbo.
  ["X=$HOME antes do data: a jusante de um pipe", `ls ${H} | X=$HOME NODE_OPTIONS='--import=data:text/javascript,0' node /tmp/x.js`],
  ["X=*.js antes do data: a jusante de um pipe", `ls ${H} | X=*.js NODE_OPTIONS='--import=data:text/javascript,0' node /tmp/x.js`],
  ["X[0]=1 antes do data: a jusante de um pipe", `ls ${H} | X[0]=1 NODE_OPTIONS='--import=data:text/javascript,0' node /tmp/x.js`],
  ["X=$HOME antes de um cross-env com data:", `ls ${H} | X=$HOME cross-env NODE_OPTIONS='--import=data:text/javascript,0' node /tmp/x.js`],
  // Sitio 7 no sentido contrario: o bash corre o `1X=1` como COMANDO, e a allowlist nao o pode saltar (a LARGA abria).
  ["regressao (a forma do bash no levaMarcador): 1X=1 true depois de um cd para a fronteira", "cd .claude/hooks && 1X=1 true"],
];

/** A-1 da 2.a leitura do #546: uma palavra que EXPANDE com um `=` (`$N=`, `` `c`=1 ``) nao e uma atribuicao que se
 *  salte — e o verbo. O `=` nao muda o veredicto: e o mesmo do verbo sem ele, e esse e um deny (o `-e` a vista). (O
 *  verbo-variavel SEM uma letra de codigo a vista passa com e sem o `=` — um limite anterior ao #546; um caso desses
 *  aqui seria vacuo, as duas leituras do diff o disseram.) */
const O_IGUAL_NAO_MUDA = [
  ["$N= -e", `$N= -e "require('fs').unlinkSync('${H}')"`, `$N -e "require('fs').unlinkSync('${H}')"`],
  ["`c`=1", `\`c\`=1 -e "require('fs').unlinkSync('${H}')"`, `\`c\` -e "require('fs').unlinkSync('${H}')"`],
];

/** Sitio 7 (`caminhos.mjs`, `levaMarcador`): depois de um `cd` para a fronteira, o verbo depois de um `X+=1` e o que
 *  corre. Uma conversao de deny para allow DE PROPOSITO: o bash corre o `true` (como com `X=1 true`). */
const FRONTEIRA_DEIXA = [
  ["controlo: X=1 true depois de um cd para a fronteira", "cd .claude/hooks && X=1 true"],
  ["X+=1 true depois de um cd para a fronteira", "cd .claude/hooks && X+=1 true"],
  ["X[0]=1 true depois de um cd para a fronteira", "cd .claude/hooks && X[0]=1 true"],
  // O Medio da 4.a leitura: um argumento com `=` e um glob nao e uma posicao de interpretador (trabalho normal).
  ["um grep -e com um padrao com = e *", "grep -n -e \"ATRIBUICAO_.*=\" -e verboEm .claude/hooks/lib/posicao.mjs"],
  ["um rg com um padrao com = e []", "rg \"[a-z]+=.*\" .claude/hooks -c"],
];

/** Sitio 8 e o D2 (`textos-publicos.mjs`): o que muda o `node` tira a isencao do `commit-msg`. */
const TIRAM_A_ISENCAO = [
  ["PATH[0]= solto (medido: a shell procura o node so la)", "PATH[0]=./bin"],
  ["path= do zsh (ligado ao PATH)", "path=(./bin $path)"],
  ["path+= do zsh", "path+=(./bin)"],
  ["path[1]= do zsh", "path[1]=./bin"],
  ["printf -v sem export (o NODE_OPTIONS ja exportado)", "printf -v NODE_OPTIONS -- --import=./w.mjs"],
  ["printf -vNOME colado", "printf -vNODE_OPTIONS -- --import=./w.mjs"],
  ["read", "read NODE_OPTIONS <<< --import=./w.mjs"],
  ["read -r com opcoes", "read -r -a PATH <<< ./bin"],
  ["mapfile", "mapfile PATH < f"],
  ["readarray", "readarray -t NODE_OPTIONS < f"],
  ["declare -n (uma referencia)", "declare -n R=NODE_OPTIONS && R=--import=./w.mjs"],
  ["declare -n sem alvo a vista", "declare -n R && R=NODE_OPTIONS && R=--import=./w.mjs"],
  ["local -gn agrupado", "f() { local -gn R; } && R=x"],
  ["typeset -n", "typeset -n R=PATH && R=./bin"],
  ["for com a variavel PATH", "for PATH in ./bin; do true; done"],
  ["${NOME:=} no texto", ": ${NODE_OPTIONS:=--import=./w.mjs}"],
  ["${NOME::=} do zsh", ": ${PATH::=./bin}"],
  ["hash -p do bash", "hash -p ./evil node"],
  ["hash node= do zsh", "hash node=./evil"],
  ["alias node=", "alias node=./evil"],
  ["functions[node]= do zsh", "functions[node]='./evil'"],
  ["aliases[node]= do zsh", "aliases[node]=./evil"],
  ["commands[node]= do zsh", "commands[node]=./evil"],
  ["eval no verbo", "eval x"],
  ["source no verbo", "source ./x.sh"],
  [". no verbo", ". ./x.sh"],
  ["trap no verbo", "trap 'NODE_OPTIONS=--import=./w.mjs' DEBUG"],
  ["export DYLD_INSERT_LIBRARIES", "export DYLD_INSERT_LIBRARIES=./x.dylib"],
  ["export LD_PRELOAD", "export LD_PRELOAD=./x.so"],
  // As duas leituras do diff (#546):
  ["printf -v com indice", "printf -v PATH[0] %s ./bin"],
  ["printf -v com o nome por expandir", 'N=NODE_OPTIONS; printf -v "$N" %s --import=./w.mjs'],
  ["print -v do zsh", "print -v PATH ./bin"],
  ["export com o nome por expandir", 'N=NODE_OPTIONS; export "$N=--import=./w.mjs"'],
  ["read com o nome por expandir", 'N=NODE_OPTIONS; read "$N" <<< --import=./w.mjs'],
  ["DYLD_FRAMEWORK_PATH (a familia toda)", "export DYLD_FRAMEWORK_PATH=./f"],
  ["LD_AUDIT (a familia toda)", "export LD_AUDIT=./a.so"],
  ["${PATH[0]:=} com indice", ": ${PATH[0]:=./bin}"],
  ["fpath do zsh (o autoload de uma funcao node)", "fpath=(./f $fpath) && autoload node"],
  ["emulate -c do zsh", "emulate sh -c 'export PATH=./bin:$PATH'"],
  ["foreach do zsh", "foreach PATH (./bin) true; end"],
  // A 3.a leitura do diff (#546):
  ["noglob eval do zsh", "noglob eval x"],
  ["nocorrect source do zsh", "nocorrect source ./x.sh"],
  ["print -rv agrupado do zsh", "print -rv PATH ./bin"],
  ["galiases[node]= do zsh", "galiases[node]=./evil"],
  ["enable -f do bash", "enable -f ./lib.so node"],
  // A 6.a leitura do diff (#546):
  ["export com o nome em chavetas", "export NODE_OPTION{S,}=--import=./w.mjs"],
  ["read com o nome em chavetas", "read PAT{H,} <<< ./bin"],
  ["mapfile -C (corre o callback)", "mapfile -C 'export NODE_OPTIONS=--import=./w.mjs #' -c 1 x < f"],
  ["read -t PATH do zsh (o -t sem valor)", "read -t PATH <<< ./bin"],
  ["- eval do zsh", "- eval x"],
  // A politica do #536 (falhar fechado): uma destas atribuicoes em QUALQUER comando, tambem depois de uma cabeca, tira
  // a isencao. Era o sobrevivente da varredura do #546 (o `cabeca().atribuicoes` do `mudaONode`).
  ["sudo PATH= noutro comando (depois de uma cabeca)", "sudo PATH=./bin true"],
];

/** A 6.a leitura do diff: depois de uma cabeca que nao e `env`/`sudo`, uma palavra com `=` corre como COMANDO. */
const CORRE_COMO_COMANDO = ["env -i nice A-B=1 cat pr.md && git commit -F pr.md", "nohup X[0]=1 cat pr.md && git commit -F pr.md"];

/** Uma flag colada de uma cabeca antes do `node` muda o que ele corre (`env -P` procura-o noutra pasta): sem isencao. */
const FLAG_DA_CABECA = ["env -P./evil node .githooks/commit-msg pr.md && git commit -F pr.md", "env -C./outro node .githooks/commit-msg pr.md && git commit -F pr.md"];

/** O CONTRA-CASO: os mesmos verbos com uma variavel que nao muda o `node`, ou um `.` como argumento. */
const DEIXAM_A_ISENCAO = [
  ["controlo: ls . (o `.` como argumento)", "ls ."],
  ["controlo: read de outra variavel", "read FOO <<< x"],
  ["controlo: printf -v de outra variavel", "printf -v FOO %s x"],
  ["controlo: declare sem -n", "declare FOO=1"],
  ["controlo: hash sem -p", "hash"],
  ["controlo: for de outra variavel", "for f in a; do true; done"],
  ["controlo: X[0]= de outra variavel", "X[0]=1"],
  // Falsos positivos que a 3.a leitura do diff apontou (#546): o `for` fora do inicio, e o valor de uma flag do `read`.
  ["controlo: echo for path (nao e um ciclo)", "echo for path"],
  ["controlo: read -p com uma expansao no valor da flag", 'read -p "Nome $x: " v'],
  ["controlo: read -u com uma expansao no valor da flag", 'read -u "$fd" line'],
];

/** A estrutura das duas definicoes, na fronteira de cada uma: [palavra, e da LARGA, e do BASH, o nome]. */
const FORMAS = [
  ["X=y", true, true, "X"], ["X+=y", true, true, "X"], ["X[0]=y", true, true, "X"], ["X[0]+=y", true, true, "X"],
  ["PATH[@]=y", true, true, "PATH"], ["_a1=", true, true, "_a1"],
  // So da LARGA: o `env` aceita-as, o bash corre-as como comando.
  ["1X=y", true, false, "1X=y"], ["A-B=1", true, false, "A-B=1"], ["a/b=1", true, false, "a/b=1"], ["./n=/node", true, false, "./n=/node"],
  // De nenhuma: uma flag (`--x=y`), um `=` sozinho, sem `=`, e um indice com espaco (duas palavras).
  ["X[a b]=1", false, false, "X"], ["--x=y", false, false, "--x=y"], ["=x", false, false, "=x"], ["X", false, false, "X"],
  // O nome de um argumento sem `=` (`export NODE_OPTIONS`, `export NODE_OPTIONS+`), como o `nomeDe` de antes.
  ["NODE_OPTIONS+", false, false, "NODE_OPTIONS"], ["PATHX", false, false, "PATHX"], ["PATH/x", false, false, "PATH/x"],
];

export function registar({ test, corre, repo, eq }) {
  test("atribuicoes/estrutura: a LARGA, a do BASH e o nome, na fronteira de cada uma", () => {
    const p = [];
    for (const [t, larga, bash, nome] of FORMAS) {
      if (ATRIBUICAO_LARGA.test(t) !== larga) p.push(`LARGA(${t}) devia ser ${larga}`);
      if (ATRIBUICAO_BASH.test(t) !== bash) p.push(`BASH(${t}) devia ser ${bash}`);
      if (nomeDaAtribuicao(t) !== nome) p.push(`nome(${t}) deu ${nomeDaAtribuicao(t)}, esperado ${nome}`);
    }
    // O `test` do `test-hooks.mjs` ignora o que se devolve: as falhas tem de LANCAR.
    eq(p.length, 0, p.join("; "));
  });
  for (const [nome, comando] of NO_PROTEGIDO) {
    test(`atribuicoes/branch protegido: ${nome}`, () => {
      const d = repo();
      try {
        eq(corre({ tool_input: { command: comando }, cwd: d }).decisao, "deny", `"${comando}" tinha de ser negado num protegido`);
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    });
  }
  for (const [nome, comando] of EXECUTA) {
    test(`atribuicoes/git que executa: ${nome}`, () => {
      const d = repo("feature/x");
      try {
        eq(corre({ tool_input: { command: comando }, cwd: d }).decisao, "deny", `"${comando}" executa na fronteira`);
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    });
  }
  for (const [nome, comando] of FRONTEIRA_NEGA)
    test(`atribuicoes/fronteira: ${nome}`, () => eq(porqueAltera(comando) !== null, true, `"${comando}" passou`));
  for (const [nome, com, sem] of O_IGUAL_NAO_MUDA)
    test(`atribuicoes/fronteira: ${nome} tem o veredicto do verbo sem o = (um deny)`, () => {
      eq(porqueAltera(sem) !== null, true, `o controlo "${sem}" tinha de negar`);
      eq(porqueAltera(com), porqueAltera(sem), `"${com}"`);
    });
  for (const [nome, comando] of FRONTEIRA_DEIXA)
    test(`atribuicoes/fronteira: ${nome}`, () => eq(porqueAltera(comando), null, `"${comando}" foi negado`));

  for (const [nome, pre] of TIRAM_A_ISENCAO)
    test(`atribuicoes/textos-publicos: ${nome} tira a isencao`, () => afirma(correTextos(isento(pre), { ficheiros: LIMPOS }), ESCRITO));
  for (const [nome, pre] of DEIXAM_A_ISENCAO)
    test(`atribuicoes/textos-publicos: ${nome} deixa a isencao`, () => afirma(correTextos(isento(pre), { ficheiros: LIMPOS }), DEIXA));
  for (const c of CORRE_COMO_COMANDO)
    test(`atribuicoes/textos-publicos: ${c.split(" cat")[0]} corre como comando, e o cat nao e o verbo`, () => afirma(correTextos(c, { ficheiros: LIMPOS }), ESCRITO));
  test("atribuicoes/textos-publicos: controlo — mapfile -c (minusculo, o quantum) de outra variavel deixa a isencao", () =>
    afirma(correTextos(isento("mapfile -c 1 FOO < f"), { ficheiros: LIMPOS }), DEIXA));
  for (const c of FLAG_DA_CABECA)
    test(`atribuicoes/textos-publicos: ${c.split(" node")[0]} antes do node tira a isencao`, () => afirma(correTextos(c, { ficheiros: LIMPOS }), ESCRITO));
  test("atribuicoes/textos-publicos: controlo — sudo e timeout 5 (sem flags) antes do node deixam a isencao", () => {
    for (const c of ["sudo node .githooks/commit-msg pr.md && git commit -F pr.md", "timeout 5 node .githooks/commit-msg pr.md && git commit -F pr.md"])
      afirma(correTextos(c, { ficheiros: LIMPOS }), DEIXA);
  });
  test("atribuicoes/textos-publicos: \"X[0]=1\" CITADO e um comando, e o cat a seguir nao e o verbo", () =>
    afirma(correTextos(`"X[0]=1" cat pr.md && git commit -F pr.md`, { ficheiros: LIMPOS }), ESCRITO));
  // 5.a leitura do diff: depois de um `env`/`sudo` as aspas nao contam (o `env` recebe `X=1`), e a LARGA e atribuicao.
  for (const c of [`env "X=1" gh pr create --title t --body "visto no projeto-secreto"`, `sudo 'X=1' gh issue comment 1 --body "projeto-secreto"`,
    `env A-B=1 gh issue create --title x --body "projeto-secreto"`, `env 1X=1 gh issue create --title x --body "projeto-secreto"`,
    // A leitura do `main` (monotonico): sem `env`, um `"X=1"` citado tambem se saltava, e o `gh` via-se.
    `"X=1" gh issue comment 1 --body "projeto-secreto"`])
    test(`atribuicoes/textos-publicos: ${c.split(" gh")[0]} antes do gh nao o esconde`, () => afirma(correTextos(c), NEGA));
  test("atribuicoes/textos-publicos: X[0]=1 antes do gh nao o esconde", () =>
    afirma(correTextos(`X[0]=1 gh issue comment 1 --body "projeto-secreto"`), NEGA));
}
