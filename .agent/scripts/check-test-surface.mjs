#!/usr/bin/env node
/**
 * Test Surface Checker — {{PROJECT_NAME}}
 *
 * Responde a UMA pergunta: entre a baseline e agora, a **superficie de teste** foi
 * enfraquecida?
 *
 * PORQUE EXISTE: um ciclo de correcao com o objetivo "ficar verde" tem uma solucao
 * degenerada — enfraquecer o teste em vez de corrigir o codigo (ver `TP4` em
 * `anti-patterns.md`). Apagar a assercao, marcar `skip`, ou **estreitar a selecao do runner**,
 * que remove falhas igualmente bem sem tocar em nenhum ficheiro de teste.
 *
 * O QUE ISTO E E O QUE NAO E: e uma verificacao **universal** — so precisa de `node` e `git`,
 * logo qualquer agente a corre e o CI corre-a para todos. No Claude Code existe tambem um
 * passo a correr — **nao** existe hook a negar a escrita de testes;
 * noutras ferramentas isto e o equivalente que se corre.
 *
 * Uso:
 *   node .agent/scripts/check-test-surface.mjs                 # vs a base do branch
 *   node .agent/scripts/check-test-surface.mjs <ref>           # vs um ref explicito
 *
 * Sai `!= 0` se encontrar enfraquecimento, e tambem se **nao conseguir medir** — um
 * verificador que nao sabe responder nao pode responder "esta tudo bem".
 */

import { execFileSync } from "child_process";
import { CONTAGENS, MARCAS } from "./lib/surface-patterns.mjs";
import { TEST_GLOBS_DO_PROJETO, CONFIG_GLOBS_DO_PROJETO } from "./config/superficie-de-teste.mjs";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { resolveBaseline, exigeSuperficie } from "./lib/baseline-superficie.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- CONFIGURAR AO PROJETO ---------------------------------------------------
// A superficie congelada: onde vivem os testes E a configuracao que os seleciona.
// Congelar so os testes nao basta: estreitar o `include` do runner remove falhas
// igualmente bem. Adaptar no bootstrap a stack do projeto.
// A stack do CONSUMIDOR vem de `config/superficie-de-teste.mjs`, que o `/upgrade` nunca
// substitui — esta na superficie congelada desde o commit anterior deste ticket, logo mover-a
// para la nao a tirou da vigilancia. A fronteira (o que e do projeto, o que e do template) esta
// escrita la, junto das tabelas.
//
// O GLOB DE PREFIXO FICA AQUI, e e deliberado: `tests?[-_]...` existe porque as suites DESTE
// repo se chamam assim — e elas viajam para dentro de cada derivado. E conhecimento do template,
// nao do consumidor. Se estivesse na config dele, um projeto que a "limpasse" desligava a
// vigilancia sobre as suites que herdou, e apagar TODAS dava "superficie intacta" com exit 0.
// Ja aconteceu uma vez, e e o `TP2` na sua forma mais cara.
const TEST_GLOBS = [
  ...TEST_GLOBS_DO_PROJETO,
  /(^|\/)tests?[-_][^/]+\.[cm]?[jt]sx?$/i,
];
const CONFIG_GLOBS = CONFIG_GLOBS_DO_PROJETO;

// Configuracao **contavel**: o que seleciona os testes NESTE repo nao e um `vitest.config`,
// e a lista de steps do `ci.yml` e a tabela `PARES` do `mutation-sweep.mjs`. Apagar um step
// do CI desliga uma suite inteira sem tocar em nenhum ficheiro de teste (invariante 2 do
// `TP4`). Estes entram na superficie mas **nunca** dao o aviso generico de "confirmar": o que
// deles interessa mede-se por contagem.
//
// A separacao nao e cosmetica. Na primeira versao estavam em `CONFIG_GLOBS` e qualquer
// alteracao a QUALQUER workflow do `.github/` — `dependabot-auto-merge.yml`, `e2e.yml`, que
// nao correm teste nenhum — dava WARN e exit 1. Medido num projeto derivado: dois falsos
// positivos que fechavam o gate.
const CONFIG_CONTAVEIS = [
  /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i,
  /(^|\/)mutation-sweep\.mjs$/,
  // Os instrumentos de medida tambem: o glob de prefixo exige `test`/`tests` no INICIO do
  // nome, logo os `check-*.mjs`, os `guards/*.mjs` e o harness ficavam fora da superficie
  // congelada — e desligar um aviso deles enfraquece a verificacao sem tocar num teste.
  /(^|\/)check-[^/]+\.mjs$/,
  /(^|\/)guards\/[^/]+\.mjs$/,
  /(^|\/)test-harness\.mjs$/,
  // Os HOOKS, pela mesmissima razao que os `check-*` e os `guards/*` acima: sao codigo de
  // enforcement, e desligar uma decisao deles enfraquece a rede sem tocar num teste. Ficavam
  // de fora porque os globs de teste so apanham `.claude/hooks/tests/` (a pasta `tests/`) —
  // as suites estavam na superficie e o que elas testam nao. Apagar o
  // `guard-protected-branch.mjs` nao produzia uma palavra.
  /(^|\/)\.claude\/hooks\/[^/]+\.mjs$/,
  // `.claude/hooks/lib/` pela MESMA razao que `.agent/scripts/lib/` acima — e a lacuna foi
  // fechada de um lado e deixada aberta do outro. Medido no CI: extrair a verificacao de
  // fronteira para `lib/fronteira.mjs` leu-se como perda de 6 casos no ficheiro de origem,
  // porque o destino nao estava na superficie. O `[^/]+` do padrao acima nao alcanca `lib/`.
  /(^|\/)\.claude\/hooks\/lib\/[^/]+\.mjs$/,
  // O `.githooks/` nao tem extensao (o git exige o nome exato do evento), logo nao ha sufixo
  // por onde o apanhar.
  /(^|\/)\.githooks\/[^/]+$/,
  // As tabelas de padroes deste verificador. Sem esta linha, extrai-las para um ficheiro
  // proprio tirava-as da superficie congelada, e apagar metade delas — que e desligar o
  // detetor — nao mexia em nenhuma contagem vigiada.
  /(^|\/)surface-patterns\.mjs$/,
  // `lib/`: os modulos partilhados. A mesma lacuna, encontrada ao extrair a tabela `PARES`
  // para `lib/pares.mjs` — a extracao lia-se como perda de 19 pares porque o destino nao
  // estava na superficie. E ja valia antes disso para o `lib/registo.mjs`, que **e** o
  // invariante 2 do `TP4` (a seleccao do runner) e estava fora da superficie congelada.
  // Ancorado a `.agent/scripts/`: sem isso casava `src/lib/utils.mjs` e `packages/x/lib/y.mjs`
  // de qualquer projeto derivado, e apagar um ficheiro normal da app dava
  // "ficheiro da superficie de teste APAGADO" com exit 1 — a mesma classe de falso positivo
  // que o comentario acima ja documenta ter fechado uma vez.
  /(^|\/)\.agent\/scripts\/lib\/[^/]+\.mjs$/,
  // `.agent/scripts/config/`: a configuracao do PROJETO, que a matriz de propagacao ja nomeia
  // como o sitio preferido para tudo o que e decisao e nao logica. Estava FORA da superficie
  // congelada — medido com uma sonda: um ficheiro novo la dentro dava "1 ficheiro alterado,
  // nenhum na superficie".
  //
  // Isso e um vao, e cresce: o que vive nesta pasta decide COMO as verificacoes correm. O
  // `ALVOS_REPROVAM` do `config/bundles.mjs` liga e desliga um gate inteiro, e desliga-lo nao
  // produzia uma palavra — nem contagem, nem aviso. E o invariante 2 do `TP4` (estreitar a
  // seleccao sem tocar num teste) aplicado a um directorio que foi criado depois de o
  // verificador existir.
  //
  // Em CONTAVEIS e nao em GLOBS: o que aqui interessa mede-se por contagem, e o aviso generico
  // de "confirmar" em cada alteracao a configuracao do proprio projeto seria ruido diario.
  /(^|\/)\.agent\/scripts\/config\/[^/]+\.mjs$/,
  /(^|\/)(pyproject\.toml|setup\.cfg)$/i,
];

/** O ficheiro que DEFINE as marcas. As MARCAS nao se lhe aplicam (ver o uso, abaixo); as
 *  CONTAGENS aplicam-se, e sao elas que impedem que as tabelas sejam esvaziadas. */
const definePadroes = (f) => /(^|\/)surface-patterns\.mjs$/.test(f);

// As tabelas de padroes — `CONTAGENS` (o que nao pode descer) e `MARCAS` (o que nao pode
// aparecer) — vivem em `surface-patterns.mjs`: sao dados, nao decisoes, e eram metade deste
// ficheiro, que passou o flag das 500 linhas. Esse ficheiro esta em `CONFIG_CONTAVEIS` abaixo,
// logo continua na superficie congelada: apagar metade das tabelas e desligar o detetor.

function git(args) {
  // `core.quotepath=false`: sem isto o git escapa caminhos nao-ASCII
  // (`"tests/\303\251.test.js"`), o `existsSync` desse literal falha e um ficheiro que
  // ninguem apagou e reportado como APAGADO — o gate fechava por razao errada.
  // `stderr: "ignore"`: um `git show <base>:<ficheiro-novo>` falha de proposito (e assim que
  // se descobre que o ficheiro nao existia na baseline), e o `fatal: ...` do git ia para o
  // log. Uma corrida VERDE com uma linha que parece erro treina quem a le a ignorar o output
  // — apareceu no primeiro CI deste gate. Os erros que importam sobem por excecao e sao
  // reportados pelo `fatal()` daqui.
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

let problemas = 0;
const warn = (m) => {
  console.log(`  WARN  ${m}`);
  problemas++;
};
const ok = (m) => console.log(`  OK    ${m}`);
/** Visivel mas sem gate: um facto que quem le tem de confirmar, e nao um enfraquecimento.
 *  Deliberadamente NAO incrementa `problemas` — se incrementasse era um `warn` com outro
 *  nome. O unico uso hoje e a contagem que desceu num ficheiro **e** se manteve na superficie:
 *  uma extracao, que o proprio `core-rules.md` manda fazer acima das 500 linhas. */
const note = (m) => console.log(`  NOTE  ${m}`);
/** Nao consegui medir: avisa e sai `!= 0` na hora. Existe como FUNCAO e nao como
 *  `console.log` + `process.exit` soltos porque a varredura de mutacao procura sitios de
 *  aviso por nome: escritos a mao, tres destes ficavam fora da contagem e a varredura
 *  anunciava "cobertura completa" a medir metade dos sitios — o mesmo defeito que um
 *  wrapper `flag()` ja tinha causado neste repo. */
const fatal = (m, extra) => {
  console.log(`  WARN  ${m}`);
  if (extra) console.log(extra);
  console.log("");
  process.exit(1);
};

console.log("\n=== Test Surface Check ===\n");


// A baseline: argumento explicito, ou a base do branch atual. **Falhar se nao resolver** —
// um `git` que nao responde nao autoriza um veredicto de "nada mudou". E a superficie tem de
// existir nalgum lado, senao isto imprimia "intacta" para sempre sobre uma suite apagada.
//
// Vivem em `lib/baseline-superficie.mjs` desde que este ficheiro chegou a 499 linhas, uma do
// limite do Guard 17. Os corpos foram movidos VERBATIM; o que mudou foi a moldura.
const base = resolveBaseline({ base: process.argv[2], git, fatal });
console.log(`  baseline: ${base}\n`);
exigeSuperficie({ base, git, fatal, testGlobs: TEST_GLOBS });


const eConfigOpaca = (f) => CONFIG_GLOBS.some((r) => r.test(f));
const naSuperficie = (f) =>
  TEST_GLOBS.some((r) => r.test(f)) || eConfigOpaca(f) || CONFIG_CONTAVEIS.some((r) => r.test(f));

let alterados;
let naoRastreados = [];
try {
  // `${base}` e nao `${base}..HEAD`: compara a baseline com a **arvore de trabalho**. Com
  // `..HEAD` o verificador ignorava tudo o que nao estivesse commitado — ou seja, "correr
  // antes de commit" nao media exatamente o que estava a ser commitado. No CI as duas formas
  // coincidem (arvore limpa), logo nao ha perda.
  alterados = git(["diff", "--name-only", base]).split("\n").filter(Boolean);
  // Os NAO RASTREADOS nao aparecem no `git diff`, logo a afirmacao "compara com a arvore de
  // trabalho" so valia para caminhos rastreados: um `vitest.config.ts` novo que estreitasse a
  // selecao passava sem aviso enquanto nao fosse ao `git add`. Uniao com os untracked.
  naoRastreados = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  alterados = [...new Set([...alterados, ...naoRastreados])];
} catch (err) {
  fatal(`o git nao conseguiu listar as alteracoes: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
}

const tocados = alterados.filter(naSuperficie);

// OS POR RASTREAR, DITOS EM VOZ ALTA: o dado ja estava calculado acima, faltava a afirmacao.
// `NOTE` e nao aviso — nao e defeito, e um passo em falta. Custo medido: `upgrade-why.md`.
const porRastrear = naoRastreados.filter(naSuperficie);
if (porRastrear.length) {
  const amostra = porRastrear.slice(0, 3).join(", ") + (porRastrear.length > 3 ? ", ..." : "");
  console.log(`  NOTE  ${porRastrear.length} ficheiro(s) da superficie por rastrear nao contam para a baseline — \`git add\` antes de confiar neste resultado: ${amostra}`);
}

/** Os ficheiros da superficie que EXISTEM agora, para distinguir migracao de apagamento.
 *
 *  Calculado a pedido e uma so vez: so o ramo do ficheiro ausente precisa dele, e esse ramo e
 *  raro. Ler `git ls-files` a cada ficheiro tocado seria pagar por todos o que so um usa.
 *
 *  `ls-files` e nao o disco: a superficie e o que esta RASTREADO. Um ficheiro por rastrear nao
 *  conta como destino de uma migracao — se contasse, criar um ficheiro solto com o nome de um
 *  teste apagado bastava para o apagamento passar por mudanca de pasta. */
let _superficieNoDisco = null;
const daSuperficieNoDisco = () => {
  if (_superficieNoDisco === null) {
    try {
      _superficieNoDisco = git(["ls-files"]).split("\n").filter(Boolean).filter(naSuperficie);
    } catch {
      _superficieNoDisco = [];
    }
  }
  return _superficieNoDisco;
};
/** Cada ficheiro tocado com os dois lados ja lidos, para o veredicto poder olhar ao total. */
const medidos = [];
if (tocados.length === 0) {
  ok(`superficie de teste intacta (${alterados.length} ficheiro(s) alterado(s), nenhum na superficie)`);
} else {
  for (const f of tocados) {
    const config = eConfigOpaca(f);
    // Comparar a CONTAGEM de cada marca entre a baseline e agora, e nao as linhas do diff.
    // Com `--unified=0`, EDITAR uma linha que ja tinha um `skip` aparece como linha
    // acrescentada — e dava falso positivo em qualquer alteracao a um teste ja desativado.
    // O que interessa e se a marca ficou MAIS frequente.
    // As marcas contam-se com o conteudo das STRINGS retirado. Uma marca dentro de aspas e
    // **dados**, nao uma diretiva: a suite deste proprio verificador tem `test.skip(...)`
    // dentro de fixtures, e sem isto ela sinalizava-se a si mesma — medido a correr o gate
    // num projeto derivado. Uma desativacao a serio (`it.skip(`) fica sempre FORA das aspas,
    // logo continua a contar; e `test("nome"` tambem, porque a chamada nao esta entre aspas.
    // Os escapes contam: um `\'` dentro de uma string desalinhava um emparelhamento ingenuo
    // e a marca seguinte ficava exposta. Medido na propria suite deste verificador, que tem
    // fixtures com aspas escapadas — o gate sinalizava-a a si mesmo num projeto derivado.
    // Duas correcoes de uma leitura independente:
    //   - os COMENTARIOS saem primeiro. Um apostrofo num comentario (`// don't skip`)
    //     emparelhava com o proximo da linha e apagava o que estivesse pelo meio. E comentar
    //     um teste **e** enfraquece-lo, logo tira-lo faz a contagem descer, que e o correto.
    //   - o backtick passa a ser limitado a LINHA (`[^`\\\n]`). Um backtick solitario apagava
    //     tudo ate ao proximo, atravessando linhas — e neste repo os comentarios sao densos
    //     em identificadores entre backticks.
    const semComentarios = (t) => t.replace(/^[ \t]*(?:\/\/|\*\/?|\/\*).*$/gm, "");
    const semStrings = (t) =>
      semComentarios(t).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\\n]|\\.)*`/g, '""');
    // `cru`: a entrada opta por ver o texto **sem** as strings retiradas. Existe porque uma
    // excecao que precisa de citar um literal nao pode viver no texto normalizado — o
    // `semStrings` transforma `'pull_request'` e `'push'` na MESMA string, e ai a excecao ou
    // exclui os dois ou nenhum. Excluir os dois esconde um enfraquecimento a serio (um step
    // gated a `push` deixa de correr em PRs). Usar so quando a entrada cita um literal; por
    // omissao as strings saem, que e o que protege as fixtures.
    const conta = (texto, re, cru = false) => {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      return ((cru ? texto : semStrings(texto)).match(g) || []).length;
    };
    // EXISTIA vs conteudo: um ficheiro de teste **vazio** que e apagado tem conteudo "" na
    // baseline, e depender da truthiness dava-lhe a mensagem vaga em vez de "APAGADO".
    // M8: distinguir "nao existia na baseline" de "nao consegui ler".
    //
    // A versao anterior lia qualquer falha do `git show` como "ficheiro novo". Num clone
    // parcial (`--filter=blob:none`) ou com o objeto ausente isso corria nas duas direcoes
    // erradas ao mesmo tempo: `antes = ""` fazia com que nada pudesse **descer** (exit 0
    // sobre uma suite esvaziada) e, ao mesmo tempo, qualquer `skip` **pre-existente** contava
    // como acrescentado (falso positivo). E o `TP2`: "nao ha nada" nao e "nao consegui ler".
    let antes = "";
    let existiaAntes = true;
    // `ls-tree` e nao `cat-file -e`: o `-e` resolve o caminho **e** verifica o blob, logo
    // falhava nas duas situacoes e nao as separava. O `ls-tree` le so a arvore — responde
    // "o caminho existia na baseline?" sem depender de o conteudo estar disponivel.
    const existeNaBaseline = (() => {
      try {
        return git(["ls-tree", "--name-only", base, "--", f]).trim() !== "";
      } catch {
        return false;
      }
    })();
    if (existeNaBaseline) antes = git(["show", `${base}:${f}`]);
    else existiaAntes = false; // ausente da baseline: zero marcas antes, e correto
    // Sem `try` em volta do `show`, de proposito. Para um ficheiro chegar aqui tem de estar
    // na lista do `git diff base`, e o diff **ja leu os dois blobs** para os comparar: se o
    // blob da baseline nao existisse, o diff falhava primeiro e o `fatal` de "nao conseguiu
    // listar as alteracoes" ja teria disparado. Uma versao anterior punha aqui um `fatal`
    // proprio para o caso do clone parcial; tentei alcanca-lo com um teste e nao e
    // alcancavel. Codigo de defesa que nenhum teste pode cobrir e peso morto — e a varredura
    // de mutacao reprova-o, com razao.
    let agora = "";
    const noDisco = join(ROOT, f);
    if (existsSync(noDisco)) {
      agora = readFileSync(noDisco, "utf8");
    } else {
      // Estava na baseline e ja nao esta em HEAD. Duas coisas diferentes, e ate agora eram uma:
      //
      // MIGRADO — existe um ficheiro com o MESMO NOME noutra pasta da superficie. Uma
      // reorganizacao que nao tira um unico teste produzia 25 avisos e exit 1 num consumidor que
      // integrasse a migracao para `tests/`. O que a salvava era acidental: a deteccao de
      // renames do git apanhava 22 dos 25, e os tres que tinham mudado demasiado ao migrar
      // caiam abaixo do limiar de similaridade. Depender disso e depender de uma heuristica.
      //
      // O irmao ja tem este conceito e imprime-o: o `simulate-upgrade.mjs` diz "MIGRADO: o mesmo
      // nome existe noutra pasta". Aqui usa-se a mesma leitura.
      //
      // O RISCO, escrito e nao tapado: apagar um teste quando existe outro com o mesmo nome
      // noutra pasta passa a ler-se como migracao. E estreito — exige o mesmo nome de ficheiro,
      // dentro da superficie — e a linha **continua no ecra** em vez de desaparecer, logo quem
      // le a corrida ve o que aconteceu.
      const nome = f.split("/").pop();
      const migradoPara = daSuperficieNoDisco().find((o) => o !== f && o.split("/").pop() === nome);
      if (migradoPara) {
        ok(`${f}: MIGRADO para ${migradoPara} (mesmo nome noutra pasta da superficie)`);
        continue;
      }
      // APAGADO de facto. E a forma mais brutal de enfraquecer, e merece nome proprio.
      warn(`${f}: ficheiro da superficie de teste APAGADO desde ${base}${existiaAntes ? "" : " (e ausente da baseline — verificar a mao)"}`);
      continue;
    }
    // RECOLHER agora, DECIDIR depois. A decisao por ficheiro nao pode ser tomada aqui porque
    // depende de um numero que so existe depois de ler a superficie toda: o TOTAL. Ver o
    // bloco de veredicto abaixo.
    medidos.push({ f, antes, agora, config, conta });
  }

  // --- Totais da superficie: distinguir o que se PERDEU do que se MOVEU -------------
  // O invariante do `TP4` e "a contagem de testes nao desce" — a contagem, ou seja o TOTAL.
  // A implementacao comparava so por ficheiro, e por isso punia uma **extracao**: mover testes
  // de um ficheiro que passou o flag das 500 linhas para um modulo novo lia-se como perda no
  // ficheiro de origem, com exit 1, embora o total tivesse subido. Medido: as tres extracoes
  // que o proprio `core-rules.md` exige ("> 500 linhas — candidato obrigatorio a splitting")
  // fechavam este gate. Um gate que reprova a limpeza que o projeto manda fazer ensina a
  // ignorar o gate — e e o custo real, nao o exit code.
  //
  // Somar so os ficheiros TOCADOS e suficiente e nao e um atalho: um ficheiro que nao mudou
  // contribui com o mesmo numero para os dois lados e cancela-se. Um ficheiro novo nao existe
  // na baseline (contribui 0 antes), e um apagado ja avisou por nome proprio acima.
  const total = (lado, c) => medidos.reduce((n, m) => n + m.conta(m[lado], c.re, c.cru), 0);
  const totalDesceu = new Map(CONTAGENS.map((c) => [c.msg, total("agora", c) < total("antes", c)]));

  for (const { f, antes, agora, config, conta } of medidos) {
    // As MARCAS nao se aplicam ao ficheiro que as DEFINE. Nele, cada entrada e uma definicao e
    // nao uma diretiva: um `xit` ali nao desativa nada, nao ha testes naquele ficheiro. E nao
    // e uma hipotese — os padroes com alternacao casam-se a si mesmos (ver a nota em
    // `surface-patterns.mjs`), logo o ficheiro sinalizava-se por existir. A versao anterior
    // vivia com a verruga por as tabelas partilharem ficheiro com a logica e documentava-a;
    // separadas, da-se corrigir.
    //
    // Nao abre vao nenhum: as CONTAGENS continuam a medir esse ficheiro (os mesmos padroes de
    // alternacao contam-se la), logo apagar metade das tabelas — que e desligar o detetor —
    // continua a fazer a contagem descer e a reprovar.
    const achadas = definePadroes(f)
      ? []
      : MARCAS.filter((m) => conta(agora, m.re, m.cru) > conta(antes, m.re, m.cru));
    const desceram = CONTAGENS.filter((c) => {
      const a = conta(antes, c.re, c.cru);
      const d = conta(agora, c.re, c.cru);
      return c.zero ? a > 0 && d === 0 : d < a;
    });
    // O VAO AUTO-REFERENCIAL, e a unica verificacao deste ficheiro que nao pode ser
    // data-driven. As CONTAGENS sao aplicadas **com as tabelas actuais**: esvaziar as tabelas
    // desliga a propria contagem que as vigiaria, e tudo passa com exit 0. Medido — a suite
    // apanhou-o no dia em que as tabelas ganharam ficheiro proprio e o caso passou a ser
    // exprimivel; antes vivia escondido por elas partilharem ficheiro com a logica.
    //
    // A rede tem de estar FORA dos dados: este padrao esta escrito a mao aqui e conta as
    // ENTRADAS da tabela no texto, sem consultar a tabela. Nao e imune a quem edite este
    // ficheiro — nada aqui e, e o `TP4` di-lo por escrito — mas fecha o degrau de esvaziar as
    // tabelas, que nao tocava em nenhum teste e nao deixava marca nenhuma.
    const entradasDeTabela = /\{\s*re:\s*\//;
    const tabelasEncolheram =
      definePadroes(f) && conta(agora, entradasDeTabela) < conta(antes, entradasDeTabela);

    // Desceu NESTE ficheiro e desceu na superficie: perdeu-se. Desceu aqui e o total aguentou:
    // apareceu noutro ficheiro, logo foi movido. So o primeiro caso e enfraquecimento.
    const perdidas = desceram.filter((c) => totalDesceu.get(c.msg));
    const movidas = desceram.filter((c) => !totalDesceu.get(c.msg));
    const notas = [
      ...achadas.map((a) => `${a.msg} acrescentado(s)`),
      // A mensagem tem de contar com as MESMAS flags com que a decisao foi tomada. Sem o
      // `d.cru`, uma entrada que decide sobre o texto cru reportava numeros do texto
      // normalizado — podia dizer "2 -> 2" numa linha que acabou de sinalizar. Latente
      // enquanto nenhuma CONTAGEM usar `cru`, e mentiroso no dia em que usar.
      ...perdidas.map((d) => `${d.msg}: ${conta(antes, d.re, d.cru)} -> ${conta(agora, d.re, d.cru)}`),
      ...(tabelasEncolheram
        ? [
            `entradas das tabelas de padroes: ${conta(antes, entradasDeTabela)} -> ` +
              `${conta(agora, entradasDeTabela)} — esvaziar as tabelas desliga o detetor`,
          ]
        : []),
    ];
    // O aviso generico de configuracao e o ULTIMO recurso: se o ficheiro tem invariantes
    // contaveis (steps do CI, pares da varredura), a descida ja foi medida acima e repetir um
    // "confirmar" a cada edicao de CI treina quem o le a ignora-lo.
    const contavel = CONTAGENS.some((c) => conta(antes, c.re, c.cru) > 0);
    if (notas.length) {
      warn(`${f}: ${notas.join("; ")} desde ${base}`);
    } else if (movidas.length) {
      // NOTE e nao WARN, e com os numeros a vista: o total aguentou, logo isto e uma extracao
      // e nao uma perda. Visivel de proposito — um movimento que ninguem ve e indistinguivel
      // de uma perda no proximo refactor, e quem le tem de poder confirmar para onde foi.
      note(
        `${f}: ${movidas
          .map((d) => `${d.msg}: ${conta(antes, d.re, d.cru)} -> ${conta(agora, d.re, d.cru)}`)
          .join("; ")} — o total da superficie NAO desceu (movido, nao perdido)`
      );
    } else if (config && !contavel) {
      warn(`${f}: configuracao do runner alterada — confirmar que a selecao de testes nao ficou mais estreita`);
    } else {
      ok(`${f} alterado, sem marcas de enfraquecimento`);
    }
  }
}

console.log("");
if (problemas > 0) {
  console.log(`WARNING: ${problemas} sinal(is) de enfraquecimento da superficie de teste.`);
  console.log("         Corrigir o codigo, nao o teste. Ver TP4 em .agent/rules/anti-patterns-template.md\n");
} else {
  console.log("  Superficie de teste nao enfraquecida.\n");
}
process.exit(problemas > 0 ? 1 : 0);
