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
 *
 * CUSTO: recorre a suite inteira por sitio. dezenas de sitios = minutos. Correr apos mexer num
 * verificador, nao a cada commit. Opt-in no CI (ver `.github/workflows/ci.yml`).
 */

import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, readdirSync } from "fs";
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

// Cada verificador tem de ter a sua suite E declarar como sinaliza um problema — nem todos
// sinalizam da mesma forma, e um regex global daria "0 sitios, nada a varrer" a um
// verificador inteiro (o mesmo silencio que este repo passou a sessao a eliminar).
//
// `sinal` casa a chamada que faz o verificador reprovar; `neutro` e o que a substitui para
// a DESLIGAR sem quebrar a sintaxe.
//
// O que isto mede, exatamente: se **algum teste nota a falta daquele aviso**. Para os pares
// `warn(`/`flag(` o `neutro` faz a mensagem DESAPARECER — nao e a variante do `AP1` em que a
// mensagem fica e so o gate cai (`warn(` -> `note(`). Nestes verificadores as duas coisas sao
// o mesmo mecanismo (`hasWarnings`/`warnings`), logo a distincao nao e explorável aqui; mas
// nao se deve ler a varredura como prova de que o VEREDICTO esta afirmado, so a mensagem.
//
// `skip(` fica de fora de proposito: um SKIP nao e um achado, e o que o dispara e a
// ausencia de um ficheiro, nao a linha em si.
const PARES = [
  {
    alvo: ".agent/scripts/check-doc-versions.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Modulo do Guard 11, extraido do check-doc-versions.mjs. Tem de estar aqui: os avisos
    // vivem neste ficheiro, e sem a entrada a varredura cobriria 652 das 911 linhas
    // originais e reportaria 100% a mentir. A suite e a mesma do ficheiro de origem.
    alvo: ".agent/scripts/guards/settings.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    // `flag(` e obrigatorio aqui: este guard emite quase tudo por um wrapper `flag()` que
    // chama `warn` por dentro. Com o padrao so a ver `warn(`, a varredura media 3 sitios de
    // 21 — e o unico que via era o `warn(` DENTRO do `flag`, cuja mutacao desliga os 18 de
    // uma vez. Media "existe pelo menos um teste que usa o flag", nao a cobertura.
    sinal: /(?<![\w.$])(warn|flag)\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/versions.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/derived-counts.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/guards/placeholders.mjs",
    suite: ".agent/scripts/test-guards.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/check-test-surface.mjs",
    suite: ".agent/scripts/test-test-surface.mjs",
    // `fatal(` entra ao lado do `warn(`: os tres sitios de "nao consegui medir" eram
    // `console.log` + `process.exit` soltos, logo ficavam fora desta contagem e a varredura
    // anunciava cobertura completa a medir metade. Ver a nota no cabecalho do `fatal`.
    sinal: /(?<![\w.$])(?:warn|fatal)\(/,
    neutro: "(() => {})(",
  },
  {
    // O sinal de um guard-hook e a negacao. Mutar `negar(` deixa o hook a permitir tudo em
    // silencio, que e exatamente a falha que uma suite tem de apanhar.
    alvo: ".claude/hooks/guard-protected-branch.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    // `(?<!function\s)`: sem isto o padrao casava a DEFINICAO `function negar(razao)`, e
    // mutar uma definicao da erro de sintaxe — a suite ficava vermelha pela razao errada e a
    // varredura contava-o como cobertura. So os sitios de CHAMADA sao mutacoes com sentido.
    sinal: /(?<![\w.$])(?<!function\s)negar\(/,
    neutro: "(() => {})(",
  },
  {
    // Estes dois nao negam: informam. O seu sinal e o `console.log` do payload — mutado, o
    // hook fica mudo, e uma suite que afirme o conteudo tem de ficar vermelha.
    alvo: ".claude/hooks/session-context.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])console\.log\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".claude/hooks/stop-verify.mjs",
    suite: ".claude/hooks/tests/test-hooks.mjs",
    sinal: /(?<![\w.$])console\.log\(/,
    neutro: "(() => {})(",
  },
  {
    alvo: ".agent/scripts/check-bundle-sizes.mjs",
    suite: ".agent/scripts/test-bundle-sizes.mjs",
    // Unico par opcional: um projeto sem bundler pode apagar este verificador. Todos os
    // outros sao do nucleo do template — a sua ausencia e um erro, nao uma configuracao.
    opcional: true,
    // Este nao usa `warn()`: imprime ERROR/FAILED e reprova com `process.exit(1)`.
    sinal: /process\.exit\(1\)/,
    neutro: "process.exit(0)",
  },
  {
    alvo: ".agent/scripts/check-backlog.mjs",
    suite: ".agent/scripts/test-backlog.mjs",
    sinal: /(?<![\w.$])warn\(/,
    neutro: "(() => {})(",
  },
  {
    // Este ficheiro. Estava isento por omissao — e reprova quem nao tem suite, o que fazia
    // dele o unico verificador sem medida no repo. Muta uma COPIA, logo varrer-se a si
    // proprio e seguro: a instancia em execucao nunca e tocada.
    alvo: ".agent/scripts/mutation-sweep.mjs",
    suite: ".agent/scripts/test-mutation-sweep.mjs",
    // Nao usa `warn()`: acumula em `falhou` e reprova no `process.exit(falhou ? 1 : 0)`.
    // O lookbehind `(?<=^\s*)` nao e cosmetico: exige que a atribuicao seja o INICIO da
    // instrucao. Sem ele o padrao casava com esta propria linha de declaracao (e com
    // qualquer comentario que a citasse) — linhas que nao sao sitios de reprovacao e que
    // apareceriam para sempre como "nao cobertas".
    sinal: /(?<=^\s*)falhou = true;/,
    neutro: "falhou = falhou;",
  },
];

const listarSo = process.argv.includes("--list");
// `--only=<parte-do-nome>`: varrer so um verificador. Ao mexer num `check-*.mjs` nao ha
// razao para recorrer as suites dos outros — e a varredura custa minutos por alvo.
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length) : null;

let falhou = false;

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
    // Os hooks tambem: sao codigo de enforcement com sitios de decisao, e estavam fora da
    // regra que o template impoe a todos os verificadores ("cada um com a sua suite"). Um
    // hook novo sem testes passava sem ninguem notar — e um hook errado e pior que um guard
    // errado, porque corre ANTES de cada ferramenta.
    ...listarDir(".claude/hooks").filter((f) => f.endsWith(".mjs")).map((f) => `.claude/hooks/${f}`),
  ];
  const registados = new Set(PARES.map((p) => p.alvo));
  for (const f of noDisco) {
    if (!registados.has(f)) {
      console.log(`  SEM PAR  ${f} nao esta em PARES — verificador novo entra sem rede nenhuma`);
      falhou = true;
    }
  }
}

const selecionados = only ? PARES.filter((p) => p.alvo.includes(only)) : PARES;
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

let copia = null;

try {
  if (!listarSo) copia = criarCopia();
  // Se o pre-voo do --only ja reprovou, nao ha alvos para varrer.
  if (selecionados.length === 0) throw { __preflight: true };

  for (const { alvo, suite, sinal, neutro, opcional } of selecionados) {
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
    const sitios = linhas
      .map((l, i) => (sinal.test(l) && !comentario(l) ? i : -1))
      .filter((i) => i !== -1);

    // `sitios` e indexado por LINHA e o `replace` nao e global, logo duas chamadas de aviso
    // na mesma linha contam como uma: a segunda nunca e desligada isoladamente e herda a
    // cobertura da primeira. Nao ha linhas assim hoje; se aparecerem, o silencio seria pior.
    const global = new RegExp(sinal.source, sinal.flags.includes("g") ? sinal.flags : sinal.flags + "g");
    for (const i of sitios) {
      const n = [...linhas[i].matchAll(global)].length;
      if (n > 1) {
        console.log(`  LINHA AMBIGUA  ${alvo}:${i + 1} tem ${n} avisos na mesma linha — separa-los para cada um ser medido`);
        falhou = true;
      }
    }

    if (sitios.length === 0) {
      // Nao e um "nada a fazer": o verificador existe e reprova de alguma forma. Zero
      // correspondencias significa que o `sinal` deste par esta desatualizado, e varrer
      // zero sitios reportando sucesso seria o mesmo erro que o script combate.
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

    const alvoCopia = join(copia, alvo);
    const suiteCopia = join(copia, suite);

    // Baseline: a suite tem de estar VERDE antes de comecar, senao todo o resultado e ruido
    // (cada mutacao "ficaria vermelha" por uma razao que nao tem nada a ver com ela).
    writeFileSync(alvoCopia, src);
    try {
      execFileSync("node", [suiteCopia], { cwd: copia, stdio: "pipe" });
    } catch {
      console.log(`  BASELINE VERMELHA  ${suite} ja falha sem mutacao — corrigir antes de varrer`);
      falhou = true;
      continue;
    }

    const naoCobertos = [];
    for (const i of sitios) {
      const mut = [...linhas];
      mut[i] = mut[i].replace(sinal, neutro);
      writeFileSync(alvoCopia, mut.join("\n"));
      let vermelha = false;
      try {
        execFileSync("node", [suiteCopia], { cwd: copia, stdio: "pipe" });
      } catch {
        vermelha = true;
      }
      if (!vermelha) naoCobertos.push({ ln: i + 1, txt: linhas[i].trim().slice(0, 90) });
    }
    writeFileSync(alvoCopia, src); // deixar a copia limpa para o alvo seguinte

    if (naoCobertos.length) {
      console.log(`  INCOMPLETA  ${alvo}: ${sitios.length - naoCobertos.length}/${sitios.length} sitios cobertos`);
      for (const { ln, txt } of naoCobertos) console.log(`              L${ln}: ${txt}`);
      falhou = true;
    } else {
      console.log(`  OK  ${alvo}: ${sitios.length}/${sitios.length} sitios — cada aviso fica vermelho`);
    }
  }
} catch (err) {
  // Sentinela do pre-voo: sai pelo caminho normal (o `process.exit(falhou...)` no fim).
  if (!err || err.__preflight !== true) throw err;
} finally {
  // Um temp dir esquecido e inofensivo (ao contrario de um verificador mutado no repo),
  // por isso a limpeza e best-effort e nunca mascara o resultado.
  if (copia) {
    try {
      rmSync(copia, { recursive: true, force: true });
    } catch {}
  }
}

// M1: `--list` NAO descarta o veredicto. Descartava, e `--list --only=nao-existe` (ou
// --list com um SINAL ERRADO, ou com um alvo sem suite) saia 0 a reportar um problema. Os
// testes existentes cobriam cada flag isolada, nunca a combinacao.
if (listarSo) process.exit(falhou ? 1 : 0);
// A causa nao se afirma aqui: pode ser um aviso sem teste, um alvo ausente, um `sinal`
// desatualizado, uma baseline vermelha ou uma linha ambigua. As linhas acima dizem qual.
console.log(falhou ? "\n  VARREDURA NAO CONCLUSIVA — ver as linhas acima.\n" : "\n  Cobertura de mutacao completa.\n");
process.exit(falhou ? 1 : 0);
