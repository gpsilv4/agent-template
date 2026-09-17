#!/usr/bin/env node
/**
 * Mutation Sweep — {{PROJECT_NAME}}
 *
 * Cobertura de mutacao dos verificadores deste repo.
 *
 * PORQUE EXISTE: uma suite verde nao prova que os testes afirmam algo. Prova-se ao
 * contrario — desligando cada sitio de aviso do verificador, um a um, e exigindo que a
 * suite fique VERMELHA em cada um. Um sitio que pode ser desligado com a suite ainda verde
 * e um aviso que ninguem testa: o gate esta la, mas nao esta ligado a nada.
 *
 * PORQUE E UM SCRIPT e nao uma instrucao em prosa: a versao em prosa trazia o numero de
 * sitios escrito a mao ("47 sitios"). O numero envelheceu na primeira alteracao ao
 * verificador, e a receita ao lado nunca chegava a esse numero — contava `warn(` + `skip(`.
 * Um numero derivado nao envelhece.
 *
 * PORQUE COPIA O REPO: a primeira versao mutava os ficheiros no sitio e restaurava-os no
 * `finally`, com handlers de SIGINT/SIGTERM por seguranca. Nao chega — foi morta por um
 * timeout e DEIXOU um `warn()` desligado no disco. Um handler nao apanha `SIGKILL` nem a
 * morte do grupo de processos, e um verificador mutado na arvore de trabalho e um gate
 * silenciosamente desligado a espera de ser commitado. Agora toda a mutacao acontece numa
 * copia em `os.tmpdir()`: qualquer morte, por brutal que seja, nao pode sujar o repo.
 * (Naquele episodio o que apanhou o defeito foi o `test-guards.mjs` ficar vermelho.)
 *
 * Sem dependencias e sem package.json, como os outros scripts de `.agent/scripts/`.
 *
 *   node .agent/scripts/mutation-sweep.mjs                    # todos os alvos
 *   node .agent/scripts/mutation-sweep.mjs --only=backlog     # so um (ao mexer nele)
 *   node .agent/scripts/mutation-sweep.mjs --list             # so contar, sem correr
 *   node .agent/scripts/mutation-sweep.mjs --workers=1        # sequencial (para comparar)
 *
 * CUSTO: recorre a suite inteira por sitio. Corre em 8 processos, cada um com a SUA copia do
 * repo — medido neste repo: 58 min em serie, 14m04s em paralelo, com o mesmo veredicto. Correr
 * apos mexer num verificador, nao a cada commit. Opt-in no CI (ver `.github/workflows/ci.yml`).
 *
 * O QUE ESTA VARREDURA **NAO** COBRE, e vale saber antes de confiar nela: ela muta **sitios
 * de aviso** (as chamadas a `warn`/`fatal`/`negar`). As **entradas de tabelas de padroes** —
 * `MARCAS`, `CONTAGENS`, `TEST_GLOBS`, `CONFIG_GLOBS`, `CONFIG_CONTAVEIS` no
 * `check-test-surface.mjs` — nao sao sitios: um padrao que nunca casa nada passa aqui com a
 * suite verde, porque o `warn()` continua a ser disparado por outro padrao da mesma tabela.
 *
 * Isto nao e teorico. Uma excecao escrita numa dessas entradas esteve **morta desde que foi
 * escrita** (duas falhas empilhadas: um `\s*` a recuar a largura zero, e o `semStrings` a
 * apagar o literal citado), com esta varredura verde do principio ao fim. So apareceu quando
 * alguem correu o `/upgrade` num projeto real e levou um aviso onde a excecao prometia
 * silencio.
 *
 * **Consequencia, e e uma obrigacao:** cada entrada de tabela de padroes precisa do **seu
 * caso na suite** — um que exija que ela case, e, se tiver excecao, um que exija que ela
 * exclua. A varredura nao substitui isso.
 *
 * Medido no `check-test-surface.mjs`: das 39 entradas de padrao, **15 podem ser desligadas
 * com a suite verde** (metade sao globs de stacks que este repo nao usa — Python, mocha — e
 * que um projeto derivado usa). Alargar a varredura as entradas e possivel e mecanicamente
 * identico ao que ela ja faz; custa ~7 min por corrida e exige escrever esses 15 casos
 * primeiro, senao ela passa a reprovar de origem.
 */

import { readFileSync, mkdtempSync, cpSync, rmSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Lista os ficheiros de uma pasta do repo; `[]` se nao existir. */
function listarDir(rel) {
  try {
    return readdirSync(join(ROOT, rel), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

import { PARES } from "./lib/pares.mjs";
import { verificadoresDe } from "./lib/mapa-suites.mjs";
import { medeCobertura, quantosWorkers } from "./lib/varredura-paralela.mjs";


const listarSo = process.argv.includes("--list");
// `--only=<parte-do-nome>`: varrer so um verificador. Ao mexer num `check-*.mjs` nao ha
// razao para recorrer as suites dos outros — e a varredura custa minutos por alvo.
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length) : null;

// `--diff`: varrer so os alvos que o trabalho deste branch tocou. E o ESPELHO, nao o portao —
// existe para quem esta no terminal nao esperar ~45 min por uma medicao que devia caber num.
// Com ~1 min corre-se a cada passo, e apanha problemas enquanto ainda sao pequenos: o ganho
// nao e poupar tempo, e **mais medicoes, nao menos**.
//
// **NAO e o comportamento por omissao, e isso e deliberado.** O `ci.yml` invoca este script
// sem flags, e o CI e o portao: se o diff passasse a ser o default, a varredura completa do
// portao virava parcial sem ninguem ter decidido isso, e sem aparecer em lado nenhum.
//
// A baseline e a **base do branch** e nao o `HEAD`: olhar so ao nao-commitado deixava por medir
// o que foi commitado ha dez minutos — o mesmo trabalho, o mesmo risco. `git diff <base>` sem
// `--cached` ja compara a ARVORE DE TRABALHO contra a base, logo cobre os dois num comando.
const modoDiff = process.argv.includes("--diff");

// `--skips`: varrer os sitios `skip()`/`note()` em vez dos `warn()`/`fatal()`.
//
// A varredura normal exclui-os de propósito — um SKIP nao e um achado, e exigir um teste por
// cada um seria estreito de mais para o valor. Mas a regra que este repo repete em dezenas de
// comentarios e **"todo o skip e visivel"**: um guard que deixa de ANUNCIAR que nao correu
// e o `TP2` em forma pura, e nada media se isso era possivel. Este modo mede.
//
// Fica fora do CI e fora da varredura normal: corre-se a mao, ao mexer nos guards. O que
// devolve nao e um veredicto de "esta mal" — e a lista dos sitios que ninguem observa.
const modoSkips = process.argv.includes("--skips");
const SINAL_SKIPS = /(?<![\w.$])(?:skip|note)\(/;

let falhou = false;
// Quantos sitios foram DE FACTO desligados e medidos. Sem esta conta, uma varredura que nao
// mediu nada — `--skips` quando nenhum alvo tem `skip()`, ou um `--only=` que casa um alvo
// sem trabalho — imprimia "Cobertura de mutacao completa" e saia 0. Zero resultados lidos
// como zero problemas e o `TP2`, e ve-lo no proprio script escrito para o combater era o
// defeito mais caro possivel: a frase que toda a gente cita como prova.
let sitiosMedidos = 0;

// DESCOBERTA: `PARES` e mantido a mao, logo um verificador novo entrava no repo sem rede
// nenhuma — e a documentacao afirmava, em quatro sitios, que a varredura o detetava. Nao
// detetava: o ramo `SEM SUITE` so dispara para uma entrada de `PARES` com `suite` nula, o que
// exige que alguem a tenha acrescentado. Isto varre o disco e reprova o que nao esta na lista.
// E o mesmo raciocinio do `ALVO AUSENTE`, na direcao inversa.
if (!only) {
  const noDisco = [
    // A convencao do repo: verificadores sao `check-*.mjs` e os seus modulos vivem em
    // `guards/`. Este ficheiro nao entra na descoberta — ja esta em `PARES`, e incluir-se
    // fazia a sua propria fixture de teste (que substitui `PARES`) reprovar.
    ...listarDir(".agent/scripts").filter((f) => /^check-.*\.mjs$/.test(f)).map((f) => `.agent/scripts/${f}`),
    ...listarDir(".agent/scripts/guards").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/guards/${f}`),
    // `lib/`: modulos partilhados com sitios de recusa proprios (hoje, o registo de suites
    // por descoberta). Sem esta linha um modulo novo ali entrava sem par e sem suite.
    ...listarDir(".agent/scripts/lib").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/lib/${f}`),
    // Os harnesses: decidem o veredicto de todas as suites e estavam fora da descoberta.
    ...listarDir(".agent/scripts/tests/harness").filter((f) => f.endsWith(".mjs")).map((f) => `.agent/scripts/tests/harness/${f}`),
    // O `simulate-derived.mjs` nao e um `check-*` nem um harness, mas TEM sitios de recusa
    // (8 `fatal()`) — e escapava a descoberta pelo NOME. A convencao e util mas nao e a
    // verdade: o que faz de um ficheiro um verificador e ter sitios de recusa, nao o prefixo.
    ...listarDir(".agent/scripts").filter((f) => /^simulate-.*\.mjs$/.test(f)).map((f) => `.agent/scripts/${f}`),
    // Os hooks tambem: sao codigo de enforcement com sitios de decisao, e estavam fora da
    // regra que o template impoe a todos os verificadores ("cada um com a sua suite"). Um
    // hook novo sem testes passava sem ninguem notar — e um hook errado e pior que um guard
    // errado, porque corre ANTES de cada ferramenta.
    ...listarDir(".claude/hooks").filter((f) => f.endsWith(".mjs")).map((f) => `.claude/hooks/${f}`),
    // E o `.githooks/`, pela mesma razao: codigo de enforcement que corre antes de um commit
    // ficar escrito. Sem esta linha, um hook novo ali entrava sem par e sem suite — que e o
    // buraco que esta descoberta existe para nao ter. Os ficheiros nao tem extensao (o git
    // exige o nome exacto do evento), logo nao ha filtro por sufixo.
    ...listarDir(".githooks").map((f) => `.githooks/${f}`),
  ];
  const registados = new Set(PARES.map((p) => p.alvo));
  // Um modulo so de DADOS (uma tabela exportada, sem uma unica chamada de recusa) nao tem
  // nada que se desligue: exigir-lhe um par seria pedir um teste de mutacao para um literal.
  // A descoberta existe para apanhar um VERIFICADOR a entrar sem rede — e um ficheiro sem
  // sitio de recusa nao verifica nada. Medido no proprio repo: extrair a tabela `PARES` para
  // `lib/pares.mjs` fazia a descoberta reprova-la, e o unico remedio era registar uma tabela
  // como se fosse um verificador.
  //
  // A isencao NAO se infere do conteudo em todo o lado — e uma lista de sitios onde se
  // permite, nao uma lista de sitios onde se proibe (`TP6`). Os hooks nao usam `warn(`/`fatal(`
  // nenhum (sao falha-aberta por desenho, e o sitio que decide e um `console.log`), logo os
  // CINCO de `.claude/hooks/` e o `.githooks/commit-msg` passariam todos por "so dados". Hoje
  // escapam por ja estarem em `PARES`, mas um hook NOVO entrava sem par e sem suite —
  // exatamente o buraco que o bloco acima diz existir para fechar, e um hook errado e pior que
  // um guard errado porque corre ANTES de cada ferramenta.
  //
  // `throw new Error(` faz parte das recusas, e a sua falta era um buraco a serio: DOIS
  // harnesses ja em `PARES` usam-no como `sinal`, logo esta funcao dizia "nao tem recusas" de
  // ficheiros cujo unico sitio de recusa e precisamente esse. Nao se via porque a isencao so
  // se aplica a quem AINDA nao esta registado — o buraco estava a espera do proximo harness.
  const RECUSAS = /(?<![\w.$])(?:warn|fatal|flag|deny|problems?\.push|problemas\.push|throw new Error)\(/;
  // Onde a isencao por conteudo e permitida. Os harnesses entram porque um harness que nao
  // recusa nada e um construtor de fixtures — tem tanto que se desligue como uma tabela. O
  // `test-bundle-harness.mjs` ficou assim de proposito: o #67 tirou-lhe as guardas do "o patch
  // nao aplicou" ao trocar fatiar-o-literal por escrever-a-config. Exigir-lhe um par produzia
  // um `SINAL ERRADO` permanente, e um aviso que esta sempre aceso ensina a ignorar o painel.
  const PODE_SER_ISENTO = [/^\.agent\/scripts\/lib\//, /^\.agent\/scripts\/tests\/harness\//];
  const semRecusas = (f) => {
    if (!PODE_SER_ISENTO.some((re) => re.test(f))) return false;
    try {
      const src = readFileSync(join(ROOT, f), "utf8");
      return !src.split("\n").some((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && RECUSAS.test(l));
    } catch {
      return false; // ilegivel: nao e razao para o dispensar
    }
  };
  for (const f of noDisco) {
    if (!registados.has(f) && semRecusas(f)) continue;
    if (!registados.has(f)) {
      console.log(`  SEM PAR  ${f} nao esta em PARES — verificador novo entra sem rede nenhuma`);
      falhou = true;
    }
  }
}

/** Os alvos que o trabalho deste branch toca, pelas DUAS vias que o mapa conhece.
 *
 *  1. O ficheiro alterado E um alvo -> varre-se.
 *  2. O ficheiro alterado e (ou leva a) uma SUITE -> varrem-se todos os alvos que a usam. E a
 *     via que apanha o indirecto: mexer no `test-harness.mjs` nao toca em alvo nenhum, mas
 *     muda o veredicto de ~260 testes. Sem esta via o filtro media menos do que diz medir, que
 *     seria o `TP2` dentro da ferramenta escrita para o apanhar.
 *
 *  A baseline vem de `git`: sem ela **reprova**, nunca cai para "varrer tudo" nem para "varrer
 *  nada". Uma medicao ausente nao e um OK — a mesma regra do `check-test-surface.mjs`. */
function alvosDoDiff() {
  const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  let base;
  try {
    // O ramo principal deste repo, e nao um nome assumido: um projeto derivado pode usar outro.
    const principal = ["origin/HEAD", "origin/main", "main", "origin/master", "master"].find((r) => {
      try {
        git(["rev-parse", "--verify", "--quiet", r]);
        return true;
      } catch {
        return false;
      }
    });
    if (!principal) return { erro: "nao encontrei o branch principal (origin/HEAD, main, master)" };
    base = git(["merge-base", "HEAD", principal]);
  } catch (err) {
    return { erro: `nao consegui resolver a base do branch: ${err.message.split("\n")[0]}` };
  }
  // Sem `--cached`: compara a ARVORE DE TRABALHO contra a base, logo inclui o que ainda nao
  // foi commitado. `-z` porque o git CITA caminhos com espacos ou bytes nao-ASCII, e um
  // caminho citado nao casa regra nenhuma — a lacuna seria silenciosa (`TP5`).
  let ficheiros;
  try {
    ficheiros = git(["diff", "--name-only", "-z", base]).split("\0").filter(Boolean);
  } catch (err) {
    return { erro: `nao consegui ler o diff contra ${base.slice(0, 7)}: ${err.message.split("\n")[0]}` };
  }
  // Os nao rastreados tambem contam: um verificador NOVO ainda por commitar e exactamente o
  // caso em que ninguem quer descobrir a falta de cobertura so no CI.
  try {
    const novos = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
    ficheiros = [...new Set([...ficheiros, ...novos])];
  } catch {
    /* melhor esforco: o diff acima ja e a medicao */
  }

  const { porVerificador, semRegra } = verificadoresDe(ficheiros);
  const suites = new Set(porVerificador.keys());
  const alvos = PARES.filter((p) => ficheiros.includes(p.alvo) || suites.has(p.suite));
  return { ficheiros, alvos, semRegra };
}

let selecionados = only ? PARES.filter((p) => p.alvo.includes(only)) : PARES;
let diffSemAlvos = null;
if (modoDiff) {
  const r = alvosDoDiff();
  if (r.erro) {
    console.log(`  SEM BASELINE  ${r.erro}`);
    console.log("                sem baseline nao ha medicao, e uma medicao ausente nao e um OK.");
    console.log("");
    process.exit(1);
  }
  selecionados = only ? r.alvos.filter((p) => p.alvo.includes(only)) : r.alvos;
  // Nada a varrer e uma resposta LEGITIMA (mexer so em documentacao, por exemplo) — mas nunca
  // silenciosa. Quem le tem de poder ver os ficheiros que nao casaram nenhuma regra: se um
  // deles DEVIA mapear para um alvo, a lacuna do mapa fica no ecra em vez de ser absorvida
  // para sempre. Um mapa de cobertura com buracos calados e pior do que nao ter mapa nenhum,
  // porque tem o aspecto de cobertura.
  // Os ficheiros SEM REGRA dizem-se SEMPRE, e nao so quando nada foi seleccionado. A primeira
  // versao so os imprimia no caso "zero alvos": bastava UM alvo casar para os outros ficheiros
  // nao mapeados serem descartados **em silencio** — que e exactamente o modo de falha que esta
  // lista existe para fechar, e o desenho dizia-o por escrito enquanto o codigo fazia o contrario.
  if (r.semRegra.length > 0 && selecionados.length > 0) {
    console.log(`  ${r.semRegra.length} ficheiro(s) alterado(s) nao levam a alvo nenhum:`);
    for (const f of r.semRegra) console.log(`    sem regra no mapa: ${f}`);
    console.log("  Se algum DEVIA levar a um alvo, falta-lhe regra em lib/mapa-suites.mjs.\n");
  }
  if (selecionados.length === 0) diffSemAlvos = r;
}
if (diffSemAlvos) {
  const { ficheiros, semRegra } = diffSemAlvos;
  console.log(`  Nada a varrer: nenhum dos ${ficheiros.length} ficheiro(s) alterado(s) leva a um alvo.`);
  for (const f of semRegra) console.log(`    sem regra no mapa: ${f}`);
  console.log("");
  console.log("  Se algum destes DEVIA levar a um alvo, falta-lhe regra em lib/mapa-suites.mjs.");
  console.log("");
  process.exit(0);
}
if (only && selecionados.length === 0) {
  console.log(`  --only=${only} nao casa nenhum alvo. Conhecidos:`);
  for (const p of PARES) console.log(`    ${p.alvo}`);
  // `falhou`, e nao um `process.exit(1)` proprio: um unico mecanismo de reprovacao faz com
  // que a varredura DESTE ficheiro cubra todos os caminhos de reprovacao. Com dois
  // mecanismos ela reportava 4/4 e omitia este em silencio.
  falhou = true;
}

/**
 * Copia do repo onde toda a mutacao acontece. Exclui `.git` (grande e irrelevante),
 * `node_modules` e `.next` (idem). Devolve o caminho, ou null se nao for preciso copiar.
 */
function criarCopia() {
  const dir = mkdtempSync(join(tmpdir(), "mutation-sweep-"));
  const excluir = new Set([".git", "node_modules", ".next", ".DS_Store"]);
  for (const entrada of readdirSync(ROOT)) {
    if (excluir.has(entrada)) continue;
    cpSync(join(ROOT, entrada), join(dir, entrada), { recursive: true });
  }
  return dir;
}

/** Uma copia POR WORKER. Ver o cabecalho de `mede()`: a copia unica dava 12% de veredictos
 *  errados sob paralelismo, e custava 0,06s por worker corrigi-lo. */
let copias = [];

/** A baseline e por SUITE, nao por alvo — e e a mesma medicao para todos os alvos que a
 *  partilham. Corria uma vez por ALVO: 28 alvos para 10 suites distintas, ou seja **18
 *  corridas a medir o que ja tinha sido medido**. So o `test-guards.mjs` (~28s) corria 11
 *  vezes — perto de cinco minutos por varredura, sempre com o mesmo resultado.
 *
 *  Nada se enfraquece: a pergunta "esta suite passa sem mutacao?" tem uma resposta so, e a
 *  copia esta intacta em qualquer dos momentos em que se podia perguntar (cada alvo repoe o
 *  seu ficheiro antes de sair). Mede-se uma vez e guarda-se.
 *
 *  Preguicoso e nao adiantado: assim so se pagam as baselines das suites que a seleccao
 *  (`--only`, `--diff`) chega a usar. */
/** Os alvos que sobreviveram a tudo o que se decide SEM correr nada. O que entra aqui e para
 *  medir; o resto ja foi reportado acima. */
const medir = [];

/** O grau de paralelismo. `--workers=1` devolve o comportamento sequencial por inteiro, para
 *  quem precise de comparar um resultado sem mudar mais nada. */
const argWorkers = process.argv.find((a) => a.startsWith("--workers="));
const WORKERS = quantosWorkers(argWorkers?.slice("--workers=".length));

/** Mede o que ficou em `medir` e IMPRIME o veredicto. A medicao vive em `lib/`; a decisao sobre
 *  o que cada numero significa fica aqui, que e onde vive o exit code. */
async function mede() {
  if (listarSo || medir.length === 0) return;
  const { baselinesVermelhas, resultados } = await medeCobertura({ medir, copias });

  for (const suite of baselinesVermelhas) {
    console.log(`  BASELINE VERMELHA  ${suite} ja falha sem mutacao — corrigir antes de varrer`);
    falhou = true;
  }

  for (const { alvo, total, naoCobertos } of resultados) {
    if (naoCobertos.length) {
      console.log(`  INCOMPLETA  ${alvo}: ${total - naoCobertos.length}/${total} sitios cobertos`);
      for (const { ln, txt } of naoCobertos) console.log(`              L${ln}: ${txt}`);
      falhou = true;
    } else {
      console.log(`  OK  ${alvo}: ${total}/${total} sitios — cada aviso fica vermelho`);
    }
    sitiosMedidos += total;
  }
}

try {
  if (!listarSo) copias = Array.from({ length: WORKERS }, () => criarCopia());
  // Se o pre-voo do --only ja reprovou, nao ha alvos para varrer.
  if (selecionados.length === 0) throw { __preflight: true };

  for (const { alvo, suite, sinal: sinalDoPar, neutro, opcional } of selecionados) {
    const sinal = modoSkips ? SINAL_SKIPS : sinalDoPar;
    let src;
    try {
      // Ler SEMPRE do repo real: e o estado que se quer avaliar.
      src = readFileSync(join(ROOT, alvo), "utf8");
    } catch {
      // Assimetria que existia: um `sinal` desatualizado reprovava, um `alvo` desatualizado
      // passava. Renomear um verificador sem tocar em `PARES` deixava o gate verde a
      // afirmar "cobertura completa" — o cenario que a matriz de propagacao quer prevenir.
      // Ausencia so e aceitavel quando o par a declara (verificador que um projeto derivado
      // pode legitimamente nao ter).
      if (opcional) {
        console.log(`  AUSENTE  ${alvo} — declarado opcional, nao existe neste projeto`);
      } else {
        console.log(`  ALVO AUSENTE  ${alvo} nao existe — renomeado ou removido sem atualizar PARES?`);
        falhou = true;
      }
      continue;
    }

    const linhas = src.split("\n");
    // Linhas de COMENTARIO nao sao sitios de aviso. Sem isto, um comentario que MENCIONE o
    // sinal (`... reportados pelo fatal() daqui`) contava como sitio, a mutacao nao mudava
    // comportamento nenhum, a suite ficava verde e a varredura dizia INCOMPLETA — mandava
    // escrever um teste para um sitio que nao existe. Aconteceu de facto neste repo, uma
    // linha depois de eu ter escrito o comentario.
    const comentario = (l) => /^\s*(?:\/\/|\*|\/\*)/.test(l);
    // O conteudo das STRINGS tambem nao e um sitio. Pela mesma razao que um comentario nao
    // e: `skip()` dentro de uma mensagem e texto, nao uma chamada. Medido no modo `--skips`,
    // nesta mesma linha do proprio varredor:
    //   console.log(`  SEM SKIPS  ${alvo}: nao tem sitios skip()/note() — ...`)
    // que era contada como DOIS sitios e reportada como `LINHA AMBIGUA` — um verificador a
    // mandar reescrever a sua propria mensagem de erro.
    //
    // Substitui por espacos em vez de remover: o comprimento fica igual, logo o indice de
    // cada correspondencia serve para mutar a linha ORIGINAL. Sem isso, o `replace` sobre o
    // original podia acertar na ocorrencia dentro da string em vez de na chamada a serio.
    const semStrings = (l) =>
      l.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\\n]|\\.)*`/g, (m) => m[0] + " ".repeat(m.length - 2) + m[m.length - 1]);
    const visiveis = linhas.map((l) => (comentario(l) ? " ".repeat(l.length) : semStrings(l)));
    const sitios = visiveis.map((l, i) => (sinal.test(l) ? i : -1)).filter((i) => i !== -1);

    // `sitios` e indexado por LINHA e o `replace` nao e global, logo duas chamadas de aviso
    // na mesma linha contam como uma: a segunda nunca e desligada isoladamente e herda a
    // cobertura da primeira. Nao ha linhas assim hoje; se aparecerem, o silencio seria pior.
    const global = new RegExp(sinal.source, sinal.flags.includes("g") ? sinal.flags : sinal.flags + "g");
    for (const i of sitios) {
      const n = [...visiveis[i].matchAll(global)].length;
      if (n > 1) {
        console.log(`  LINHA AMBIGUA  ${alvo}:${i + 1} tem ${n} avisos na mesma linha — separa-los para cada um ser medido`);
        falhou = true;
      }
    }

    if (sitios.length === 0) {
      // Nao e um "nada a fazer": o verificador existe e reprova de alguma forma. Zero
      // correspondencias significa que o `sinal` deste par esta desatualizado, e varrer
      // zero sitios reportando sucesso seria o mesmo erro que o script combate.
      if (modoSkips) {
        console.log(`  SEM SKIPS  ${alvo}: nao tem sitios skip()/note() — nada a medir neste modo`);
        continue;
      }
      console.log(`  SINAL ERRADO  ${alvo}: o padrao ${sinal} nao casa nada — atualizar PARES`);
      falhou = true;
      continue;
    }

    if (!suite) {
      console.log(`  SEM SUITE  ${alvo}: ${sitios.length} sitios de aviso e NENHUM teste.`);
      console.log(`             Um verificador nao verificado nao da confianca — da a aparencia dela.`);
      falhou = true;
      continue;
    }

    if (listarSo) {
      console.log(`  ${alvo}: ${sitios.length} sitios (suite: ${suite})`);
      continue;
    }

    // Tudo o que decide SEM medir ja decidiu acima. O que sobra vai para a fila, e e a unica
    // parte que corre em paralelo — a ordem por que estes alvos entram aqui e a ordem por que
    // o relatorio os imprime, nao a ordem por que os workers os acabam.
    medir.push({ alvo, suite, src, linhas, visiveis, sitios, sinal, neutro });
  }

  await mede();
} catch (err) {
  // Sentinela do pre-voo: sai pelo caminho normal (o `process.exit(falhou...)` no fim).
  if (!err || err.__preflight !== true) throw err;
} finally {
  // Um temp dir esquecido e inofensivo (ao contrario de um verificador mutado no repo),
  // por isso a limpeza e best-effort e nunca mascara o resultado.
  for (const c of copias) {
    try {
      rmSync(c, { recursive: true, force: true });
    } catch {}
  }
}

// M1: `--list` NAO descarta o veredicto. Descartava, e `--list --only=nao-existe` (ou
// --list com um SINAL ERRADO, ou com um alvo sem suite) saia 0 a reportar um problema. Os
// testes existentes cobriam cada flag isolada, nunca a combinacao.
if (listarSo) process.exit(falhou ? 1 : 0);
// A causa nao se afirma aqui: pode ser um aviso sem teste, um alvo ausente, um `sinal`
// desatualizado, uma baseline vermelha ou uma linha ambigua. As linhas acima dizem qual.
if (!falhou && sitiosMedidos === 0) {
  // Nada correu mal E nada foi medido. Dizer "completa" seria afirmar o que nao se mediu.
  console.log(
    `\n  NADA MEDIDO — nenhum sitio foi desligado${modoSkips ? " (modo --skips)" : ""}${only ? ` (--only=${only})` : ""}.` +
      `\n  Isto NAO e cobertura completa: e uma varredura sem trabalho. Verificar o filtro,` +
      `\n  ou o \`sinal\` do par, antes de ler este resultado como sucesso.\n`
  );
  // `falhou = true` e nao um `process.exit(1)` proprio: assim este sitio de recusa e do mesmo
  // tipo que os outros deste ficheiro, e a varredura (que varre este ficheiro com o sinal
  // `falhou = true;`) exige-lhe um teste como a qualquer outro.
  falhou = true;
}
console.log(
  falhou
    ? "\n  VARREDURA NAO CONCLUSIVA — ver as linhas acima.\n"
    : `\n  Cobertura de mutacao completa — ${sitiosMedidos} sitios medidos.\n`
);
process.exit(falhou ? 1 : 0);
