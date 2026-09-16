#!/usr/bin/env node
/**
 * Testes do Mutation Sweep — {{PROJECT_NAME}}
 *
 * Testes NEGATIVOS do `mutation-sweep.mjs`.
 *
 * PORQUE EXISTE: o varredor reprova qualquer verificador que nao tenha suite — e isentava-se
 * a si proprio por nao estar em `PARES`. O medidor estava sem medida. Se alguem o quebrasse
 * (um `sinal` mal escrito, o `falhou` que nunca se liga), ele passaria a dar cobertura
 * perfeita a suites que nao afirmam nada, e nada avisaria.
 *
 * COMO FUNCIONA: cada teste cria um sandbox com um verificador FALSO e uma suite FALSA de
 * comportamento conhecido, aponta o `PARES` do varredor para eles, e afirma o que o varredor
 * diz. Um par falso corre em milissegundos — varrer os verificadores reais aqui levaria
 * minutos e nao acrescentaria nada.
 *
 * Sem dependencias e sem package.json, como os outros scripts de `.agent/scripts/`.
 *
 *   node .agent/scripts/test-mutation-sweep.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SWEEP = join(ROOT, ".agent/scripts/mutation-sweep.mjs");

// --- O verificador falso -----------------------------------------------------
// Dois sitios de aviso. O `fake-test.mjs` abaixo so exercita o PRIMEIRO, logo a varredura
// tem de reportar 1/2 — e e isso que prova que ela deteta um aviso sem teste.
const FAKE_CHECK = `let avisos = 0;
const warn = (m) => { console.log("  WARN  " + m); avisos++; };
const alvo = process.argv[2] ?? "";
if (alvo.includes("mau")) warn("encontrei 'mau'");
if (alvo.includes("zzz")) warn("encontrei 'zzz'");
process.exit(avisos > 0 ? 1 : 0);
`;

// Suite falsa: exercita SO o primeiro sitio.
const FAKE_TEST = `import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
function corre(arg) {
  try { return { code: 0, out: execFileSync("node", [join(ROOT, ".agent/scripts/fake-check.mjs"), arg], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") }; }
}
const r = corre("isto e mau");
if (r.code === 0 || !r.out.includes("encontrei 'mau'")) { console.log("FALHOU"); process.exit(1); }
console.log("ok");
`;

function sandbox({ suite = ".agent/scripts/fake-test.mjs", sinal = "/(?<![\\w.$])warn\\(/", segundoSitio = true, baselineVermelha = false, semAlvo = false, opcional = false, doisNaMesmaLinha = false, verificadorSemPar = false, sinalEmComentario = false, dadosSemPar = false, dadosComRecusa = false, sinalEmString = false, hookSemPar = false, parSao = false, comGit = false, alterado = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sweep-test-"));
  mkdirSync(join(dir, ".agent/scripts"), { recursive: true });

  let check = FAKE_CHECK;
  if (!segundoSitio) check = check.replace('if (alvo.includes("zzz")) warn("encontrei \'zzz\'");\n', "");
  if (doisNaMesmaLinha) {
    // Duas chamadas de aviso na MESMA linha: `sitios` e indexado por linha e o `replace` nao
    // e global, logo a segunda herdava a cobertura da primeira sem nunca ser medida.
    //
    // A linha ambigua tem de ser a linha COBERTA (a do "mau"), nao a descoberta. Na primeira
    // versao deste teste ela era a do "zzz": desligar o `falhou` do LINHA AMBIGUA mantinha o
    // exit 1 porque a INCOMPLETA disparava — a assercao era satisfeita por outra verificacao,
    // que e exatamente o TP1. Assim, a unica razao de reprovar e a linha ambigua.
    check = check.replace(
      'if (alvo.includes("mau")) warn("encontrei \'mau\'");',
      'if (alvo.includes("mau")) { warn("encontrei \'mau\'"); warn("extra"); }'
    );
  }
  if (sinalEmString) {
    // O sinal DENTRO de uma string: texto, nao uma chamada. Medido no proprio varredor, no
    // modo `--skips`: a mensagem `nao tem sitios skip()/note()` contava como dois sitios e
    // saia `LINHA AMBIGUA` — o verificador a mandar reescrever a sua propria mensagem.
    check = check.replace(
      'const alvo = process.argv[2] ?? "";',
      'const alvo = process.argv[2] ?? "";\nif (alvo === "ajuda") console.log("usa warn( para avisar, ou warn( outra vez");'
    );
  }
  if (sinalEmComentario) {
    // Um COMENTARIO que menciona o sinal. Contado como sitio, a mutacao nao muda
    // comportamento nenhum, a suite fica verde e a varredura dizia INCOMPLETA — mandava
    // escrever um teste para um sitio que nao existe. Aconteceu neste repo.
    check = check.replace("const warn", "// nota: os erros sobem e sao reportados por warn(\nconst warn");
  }
  if (!semAlvo) writeFileSync(join(dir, ".agent/scripts/fake-check.mjs"), check);
  if (verificadorSemPar) {
    // Nome que casa a convencao `check-*.mjs` e ausente de `PARES`: e o cenario de alguem
    // acrescentar um verificador ao repo e esquecer o registo.
    writeFileSync(join(dir, ".agent/scripts/check-orfao.mjs"), 'const warn=(m)=>console.log(m);\nif(process.env.X)warn("a");\n');
  }

  if (dadosSemPar) {
    // Um modulo so de dados em `lib/`: uma tabela exportada, sem uma unica chamada de recusa.
    // Nao ha nada nele que se possa desligar, logo nao ha cobertura de mutacao a exigir-lhe.
    mkdirSync(join(dir, ".agent/scripts/lib"), { recursive: true });
    writeFileSync(join(dir, ".agent/scripts/lib/tabela.mjs"), 'export const COISAS = ["a", "b"];\n');
  }
  if (hookSemPar) {
    // Um hook NOVO cujo unico sitio de decisao e um `console.log` — que e como os cinco hooks
    // reais deste repo sao feitos (falha-aberta por desenho, sem `warn(`/`fatal(`). A primeira
    // versao da isencao "so dados" inferia-a do conteudo, e por isso isentava a familia
    // INTEIRA de hooks: um hook novo entrava sem par e sem suite, em silencio. A isencao passou
    // a valer so para `.agent/scripts/lib/`, e este teste e o que a prende la.
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude/hooks/novo.mjs"),
      'if (process.env.X) console.log(JSON.stringify({ deny: true }));\n');
  }
  if (dadosComRecusa) {
    // O reverso, e a razao pela qual a isencao nao pode ser "esta em lib/": um modulo de
    // `lib/` COM sitio de recusa e um verificador, e continua a precisar de par e de suite.
    mkdirSync(join(dir, ".agent/scripts/lib"), { recursive: true });
    writeFileSync(join(dir, ".agent/scripts/lib/valida.mjs"),
      'const fatal=(m)=>{throw new Error(m)};\nexport const v=(x)=>{ if(!x) fatal("vazio"); };\n');
  }

  writeFileSync(
    join(dir, ".agent/scripts/fake-test.mjs"),
    baselineVermelha ? 'console.log("sempre vermelha"); process.exit(1);\n' : FAKE_TEST
  );

  // Copiar o varredor TAL COMO ESTA e escrever um `lib/pares.mjs` proprio com o par falso.
  // Antes isto era um patch de texto sobre o codigo-fonte do varredor (substituir o literal
  // `const PARES = [...]`); com a tabela num modulo a parte, a fixture escreve o modulo — o
  // que e mais honesto: mede o varredor sem lhe tocar, e passa a exercitar tambem o import.
  if (parSao) {
    // Um SEGUNDO par, sao e medido. Existe por uma razao que a varredura de mutacao
    // encontrou no proprio varredor: `ALVO AUSENTE`, `SINAL ERRADO` e `BASELINE VERMELHA`
    // fazem `continue` SEM medir nada. Com um so par na fixture, isso deixava
    // `sitiosMedidos === 0`, e a verificacao `NADA MEDIDO` — acrescentada depois destes
    // testes — passava a ligar o `falhou` sozinha. Os tres testes continuavam verdes com o
    // `falhou = true` do sitio em causa DESLIGADO: a assercao satisfeita por outra
    // verificacao que a mesma mutacao tambem dispara, que e o `TP1`.
    writeFileSync(join(dir, ".agent/scripts/fake-check-2.mjs"),
      'const warn=(m)=>{console.log("  WARN  "+m)};\nif((process.argv[2]??"").includes("mau")){warn("dois");process.exit(1)}\nprocess.exit(0);\n');
    writeFileSync(join(dir, ".agent/scripts/fake-test-2.mjs"),
      'import { execFileSync } from "child_process";\n' +
      'import { fileURLToPath } from "url";\nimport { dirname, resolve, join } from "path";\n' +
      'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");\n' +
      'let out="", code=0;\n' +
      'try { out = execFileSync("node",[join(ROOT,".agent/scripts/fake-check-2.mjs"),"isto e mau"],{encoding:"utf8"}); }\n' +
      'catch(e){ code = e.status ?? 1; out = (e.stdout ?? "") + (e.stderr ?? ""); }\n' +
      'if (code === 0 || !out.includes("dois")) { console.log("FALHOU"); process.exit(1); }\n' +
      'console.log("ok");\n');
  }

  // A fixture escreve um `lib/pares.mjs` e confia que o varredor o LE. Se alguem voltar a
  // pôr a tabela dentro do varredor, o ficheiro que escrevemos deixa de ser lido: os 21
  // testes passariam a medir os pares REAIS do repo e continuariam verdes, a afirmar sobre
  // um alvo que nao e o da fixture. E o `TP3` na forma mais silenciosa que ha.
  const src = readFileSync(SWEEP, "utf8");
  if (!/from\s+["'`]\.\/lib\/pares\.mjs["'`]/.test(src)) {
    throw new Error("o mutation-sweep.mjs ja nao importa ./lib/pares.mjs — a fixture deixaria de ser lida");
  }
  // O mesmo para o mapa de suites, pela mesma razao: a fixture escreve o seu, e se o varredor
  // deixar de o importar (ou mudar o nome do que importa) os testes passavam a medir o mapa
  // REAL do repo. E a mesma armadilha do `pares.mjs`, uma linha abaixo.
  if (!/from\s+["'`]\.\/lib\/mapa-suites\.mjs["'`]/.test(src)) {
    throw new Error("o mutation-sweep.mjs ja nao importa ./lib/mapa-suites.mjs — a fixture deixaria de ser lida");
  }
  copyFileSync(SWEEP, join(dir, ".agent/scripts/mutation-sweep.mjs"));
  mkdirSync(join(dir, ".agent/scripts/lib"), { recursive: true });
  writeFileSync(
    join(dir, ".agent/scripts/lib/pares.mjs"),
    "export const PARES = [{ alvo: \".agent/scripts/fake-check.mjs\", suite: " +
      (suite === null ? "null" : JSON.stringify(suite)) +
      ", sinal: " + sinal + ", neutro: \"(() => {})(\"" + (opcional ? ", opcional: true" : "") + " }" +
      (parSao
        ? ", { alvo: \".agent/scripts/fake-check-2.mjs\", suite: \".agent/scripts/fake-test-2.mjs\"" +
          ", sinal: /(?<![\\w.$])warn\\(/, neutro: \"(() => {})(\" }"
        : "") +
      "];\n"
  );
  // O mapa de suites da fixture. Minimo e SINTETICO, nao copiado: copiar o do repo fazia estes
  // testes depender das regras reais (`TP3`), e o que eles medem e o varredor, nao o mapa — que
  // tem suite propria. As regras cobrem os ficheiros falsos que a fixture escreve.
  writeFileSync(
    join(dir, ".agent/scripts/lib/mapa-suites.mjs"),
    'export const SUITES = [\n' +
      '  { re: /^\\.agent\\/scripts\\/fake-check\\.mjs$/, verifica: [".agent/scripts/fake-test.mjs"] },\n' +
      '  { re: /^\\.agent\\/scripts\\/fake-check-2\\.mjs$/, verifica: [".agent/scripts/fake-test-2.mjs"] },\n' +
      "];\n" +
      "export const regraDe = (f) => SUITES.find((s) => s.re.test(f)) ?? null;\n" +
      "export function comandoDe(r) { return r.verifica.map((v) => `node ${v}`).join(\" && \"); }\n" +
      "export function verificadoresDe(ficheiros) {\n" +
      "  const porVerificador = new Map();\n  const semRegra = [];\n" +
      "  for (const f of ficheiros) {\n" +
      "    const r = regraDe(f);\n" +
      "    if (r === null) { semRegra.push(f); continue; }\n" +
      "    for (const v of r.verifica) {\n" +
      "      if (!porVerificador.has(v)) porVerificador.set(v, []);\n" +
      "      porVerificador.get(v).push(f);\n" +
      "    }\n  }\n  return { porVerificador, semRegra };\n}\n"
  );
  if (comGit) {
    // Um repo REAL, porque e isso que o `--diff` le. Sem ele, o caminho "sem baseline" e o
    // unico alcancavel — e seria facil dar-se o filtro por testado medindo so a recusa.
    const g = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    g(["init", "-q", "-b", "main"]);
    g(["config", "user.email", "t@t"]);
    g(["config", "user.name", "t"]);
    g(["add", "-A"]);
    g(["commit", "-qm", "base"]);
    // `alterado` e escrito DEPOIS do commit: e o que o diff contra a base vai ver.
    // Acrescenta se existir, cria se nao — os dois casos interessam: um ficheiro EXISTENTE
    // tocado (alvo a seleccionar) e um ficheiro NOVO que nao mapeia para nada (a lista do
    // "nada a varrer"). Um `readFileSync` cego rebentava no segundo.
    if (alterado) {
      const alvo = join(dir, alterado);
      const antes = existsSync(alvo) ? readFileSync(alvo, "utf8") : "";
      writeFileSync(alvo, antes + "\n// tocado\n");
    }
  }
  return dir;
}

function run(dir, args = []) {
  try {
    const out = execFileSync("node", [join(dir, ".agent/scripts/mutation-sweep.mjs"), ...args], {
      cwd: dir, encoding: "utf8", stdio: "pipe",
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

let passed = 0;
const failures = [];

function test(name, opts, args, expect) {
  const dir = sandbox(opts);
  try {
    const { code, out } = run(dir, args);
    const problems = [];
    if (code !== expect.code) problems.push(`exit ${code}, esperado ${expect.code}`);
    for (const s of expect.includes ?? []) if (!out.includes(s)) problems.push(`output devia conter "${s}"`);
    for (const s of expect.excludes ?? []) if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
    if (expect.extra) problems.push(...(expect.extra(dir, out) ?? []));
    if (problems.length) {
      failures.push({ name, problems, out });
      console.log(`  FAIL  ${name}`);
      for (const p of problems) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== Testes do Mutation Sweep ===\n");

// --- O que o varredor existe para fazer --------------------------------------
test("deteta um sitio de aviso que nenhum teste exercita", {}, [], {
  code: 1,
  includes: ["INCOMPLETA", "1/2 sitios cobertos", "encontrei 'zzz'", "VARREDURA NAO CONCLUSIVA"],
});

test("com todos os sitios cobertos, reporta OK e sai 0", { segundoSitio: false }, [], {
  code: 0,
  // Sem o segundo sitio o verificador falso tem 1 — e a suite exercita-o.
  includes: ["1/1 sitios", "cada aviso fica vermelho", "Cobertura de mutacao completa"],
  excludes: ["INCOMPLETA"],
});

// --- Uma varredura que nao mediu nada nao e "cobertura completa" (TP2) --------
// O `--skips` varre `skip()`/`note()`. Se nenhum alvo tiver desses sitios, todos saiam por
// `SEM SKIPS`, `falhou` ficava false e a ultima linha anunciava "Cobertura de mutacao
// completa" com exit 0 — a frase mais citada deste repo, impressa sobre zero medicoes. Ver
// zero e concluir "nao ha problemas" e o TP2, e estava dentro do script escrito para o
// combater.
test("--skips sem um unico skip() nao anuncia cobertura completa", {}, ["--skips"], {
  code: 1,
  includes: ["SEM SKIPS", "NADA MEDIDO", "NAO e cobertura completa", "(modo --skips)"],
  excludes: ["Cobertura de mutacao completa"],
});

// O reverso: com sitios a serem medidos, o veredicto sai normal — e diz QUANTOS. Sem esta
// metade, apagar o `sitiosMedidos +=` deixava tudo verde por "nada medido" nunca disparar
// ao contrario.
test("o veredicto de sucesso diz quantos sitios foram medidos", { segundoSitio: false }, [], {
  code: 0,
  includes: ["Cobertura de mutacao completa — 1 sitios medidos"],
  excludes: ["NADA MEDIDO"],
});

// --- Os caminhos de reprovacao (um teste por sitio) --------------------------
test("verificador SEM suite reprova", { suite: null }, [], {
  code: 1,
  includes: ["SEM SUITE", "NENHUM teste", "VARREDURA NAO CONCLUSIVA"],
});

// `parSao` NAO e decoracao: sem um par medido ao lado, a `NADA MEDIDO` liga o `falhou`
// sozinha e este teste ficava verde com o `falhou = true` do SINAL ERRADO desligado.
test("sinal que nao casa nada reprova (nao varre zero em silencio)", { sinal: "/nunca_casa_isto\\(/", parSao: true }, [], {
  code: 1,
  includes: ["SINAL ERRADO", "atualizar PARES"],
  excludes: ["NADA MEDIDO"],
});

test("baseline ja vermelha reprova antes de varrer", { baselineVermelha: true, parSao: true }, [], {
  code: 1,
  includes: ["BASELINE VERMELHA", "corrigir antes de varrer"],
  excludes: ["NADA MEDIDO"],
});

test("--only sem correspondencia reprova e lista os alvos", {}, ["--only=nao-existe"], {
  code: 1,
  includes: ["nao casa nenhum alvo", "fake-check.mjs"],
});

// --- Alvo que desapareceu do disco (achado da Fase 4) ------------------------
// Assimetria que existia: um `sinal` desatualizado reprovava, um `alvo` desatualizado
// passava a dizer "Cobertura de mutacao completa". Renomear um verificador sem tocar em
// `PARES` deixava o gate verde — o cenario que a matriz de propagacao quer prevenir.
test("alvo que nao existe reprova (nao passa a dizer 'completa')", { semAlvo: true, parSao: true }, [], {
  code: 1,
  includes: ["ALVO AUSENTE", "sem atualizar PARES"],
  excludes: ["Cobertura de mutacao completa", "NADA MEDIDO"],
});

// A fixture tem UM par. Declarado opcional e ausente, ele nao reprova — e essa e a
// afirmacao deste teste. Mas entao a varredura nao mediu **nada**, e o veredicto que lhe
// cabe e "NADA MEDIDO", nao "cobertura completa": a versao anterior deste teste exigia a
// segunda frase, e estava a codificar o TP2 como comportamento esperado. A ausencia
// tolerada e o `excludes: ["ALVO AUSENTE"]`; o resto e o veredicto global, que e outra
// pergunta.
test("alvo declarado opcional pode faltar sem ser reportado como ausente", { semAlvo: true, opcional: true }, [], {
  code: 1,
  includes: ["declarado opcional", "NADA MEDIDO"],
  excludes: ["ALVO AUSENTE", "Cobertura de mutacao completa"],
});

// --- `--list` nao pode engolir o veredicto (achado da Fase 4) -----------------
// Os testes cobriam cada flag isolada; a COMBINACAO saia 0 a reportar um problema.
test("--list com --only sem correspondencia continua a reprovar", {}, ["--list", "--only=nao-existe"], {
  code: 1,
  includes: ["nao casa nenhum alvo"],
});

test("--list com SEM SUITE continua a reprovar", { suite: null }, ["--list"], {
  code: 1,
  includes: ["SEM SUITE"],
});

// --- Duas chamadas de aviso na mesma linha (achado da propria varredura) -----
test("dois avisos na mesma linha reprovam em vez de herdar cobertura",
     { doisNaMesmaLinha: true, segundoSitio: false }, [], {
  code: 1,
  includes: ["LINHA AMBIGUA", "2 avisos na mesma linha", "separa-los para cada um ser medido"],
  // Sem INCOMPLETA no output, a LINHA AMBIGUA e a unica coisa que pode fazer o exit != 0.
  excludes: ["Cobertura de mutacao completa", "INCOMPLETA  .agent"],
});

// --- Verificador no disco e ausente de PARES (achado da Fase 4) --------------
// A documentacao afirmava, em quatro sitios, que a varredura reprovava um verificador sem
// suite. Nao reprovava: o ramo `SEM SUITE` so dispara para uma entrada de `PARES` com
// `suite` nula, o que exige que alguem a tenha acrescentado. Um `check-*.mjs` novo entrava
// no repo sem rede e a prosa garantia o contrario.
test("verificador no disco e ausente de PARES reprova", { verificadorSemPar: true }, ["--list"], {
  code: 1,
  includes: ["SEM PAR", "check-orfao.mjs", "sem rede nenhuma"],
});

// A descoberta existe para apanhar um VERIFICADOR a entrar sem rede. Um modulo so de dados
// nao verifica nada — exigir-lhe um par era pedir cobertura de mutacao para um literal, e
// foi o que aconteceu ao extrair a tabela `PARES` para `lib/pares.mjs`.
test("modulo so de dados em lib/ nao e exigido em PARES", { dadosSemPar: true, segundoSitio: false }, ["--list"], {
  code: 0,
  excludes: ["SEM PAR"],
});

// E a metade que impede a isencao de virar buraco: estar em `lib/` nao isenta ninguem — o
// que isenta e nao ter sitio de recusa.
test("hook novo sem par reprova, mesmo sem `warn(`/`fatal(`", { hookSemPar: true }, ["--list"], {
  code: 1,
  includes: ["SEM PAR", ".claude/hooks/novo.mjs"],
});

test("modulo em lib/ COM sitio de recusa continua a exigir par", { dadosComRecusa: true }, ["--list"], {
  code: 1,
  includes: ["SEM PAR", "lib/valida.mjs"],
});

test("com todos os verificadores registados, nao ha SEM PAR", {}, ["--list"], {
  code: 0,
  excludes: ["SEM PAR"],
});

// --- Contratos que nao se podem perder ---------------------------------------
test("--list conta sem correr a suite e sai 0", {}, ["--list"], {
  code: 0,
  includes: ["2 sitios"],
  excludes: ["Cobertura de mutacao completa", "INCOMPLETA"],
});

test("nao deixa o verificador mutado depois de correr", {}, [], {
  code: 1,
  extra: (dir) => {
    const c = readFileSync(join(dir, ".agent/scripts/fake-check.mjs"), "utf8");
    const p = [];
    if (c.includes("(() => {})(")) p.push("deixou o neutro injetado no verificador REAL");
    if (!c.includes('warn("encontrei \'zzz\'")')) p.push("o segundo sitio de aviso desapareceu do ficheiro");
    return p;
  },
});

test("--only com correspondencia varre so esse alvo", {}, ["--only=fake-check"], {
  code: 1,
  includes: ["fake-check.mjs", "1/2 sitios cobertos"],
});

// --- Resumo ------------------------------------------------------------------
// `segundoSitio: false` para o unico sitio descoberto possivel ser o comentario: com o
// sitio "zzz" da fixture por omissao, a INCOMPLETA disparava por ele e a assercao ficava
// satisfeita por outra verificacao — o `TP1`.
// O mesmo raciocinio para uma STRING. Sem isto, uma linha com duas mencoes dentro de aspas
// era `LINHA AMBIGUA` (reprova), e uma com uma mencao era um sitio a mais cuja mutacao nao
// muda comportamento nenhum — INCOMPLETA a mandar escrever um teste para o que nao existe.
test("sinal mencionado numa STRING nao conta como sitio", { sinalEmString: true, segundoSitio: false }, [], {
  code: 0,
  includes: ["1/1 sitios", "Cobertura de mutacao completa"],
  excludes: ["LINHA AMBIGUA", "INCOMPLETA"],
});

test("sinal mencionado num COMENTARIO nao conta como sitio", { sinalEmComentario: true, segundoSitio: false }, [], {
  code: 0,
  includes: ["Cobertura de mutacao completa"],
  excludes: ["INCOMPLETA"],
});


// --- `--diff`: varrer so o que este branch tocou -----------------------------------
// E o ESPELHO, nao o portao. Cada caso aqui mede um dos quatro comportamentos que a decisao
// do `/grill` fixou, e o quarto e o contra-caso sem o qual os outros nao valem nada.

// Sem repo nao ha base, e sem base nao ha medicao. Cair para "varrer tudo" ou para "varrer
// nada" seria escolher por conta propria o que medir — e uma medicao ausente nao e um OK.
test("--diff sem baseline resoluvel REPROVA, em vez de escolher por si", {}, ["--diff"], {
  code: 1,
  includes: ["SEM BASELINE", "uma medicao ausente nao e um OK"],
});

// Nada a varrer e resposta LEGITIMA — mas nunca silenciosa. O que nao casou vai para o ecra:
// se um deles DEVIA levar a um alvo, a lacuna do mapa fica visivel em vez de absorvida.
test("--diff sem alvos LISTA o que nao casou e sai 0", { comGit: true, alterado: "README-x.md" }, ["--diff"], {
  code: 0,
  includes: ["Nada a varrer", "sem regra no mapa: README-x.md", "falta-lhe regra em lib/mapa-suites.mjs"],
});

// O caso util: um alvo tocado -> varre-se esse.
test("--diff com um alvo tocado varre esse alvo", { comGit: true, alterado: ".agent/scripts/fake-check.mjs" }, ["--diff", "--list"], {
  code: 0,
  includes: ["fake-check.mjs"],
});

// O CONTRA-CASO, e e ele que faz os outros valerem: **sem flags varre tudo**. O `ci.yml`
// invoca sem flags, e se o diff passasse a ser o default o portao virava parcial sem ninguem
// ter decidido isso. Este teste e o que impede essa alteracao de passar despercebida.
test("SEM flags varre tudo, mesmo num repo com diff", { comGit: true, parSao: true, alterado: ".agent/scripts/fake-check.mjs" }, ["--list"], {
  code: 0,
  includes: ["fake-check.mjs", "fake-check-2.mjs"],
});

console.log("");
console.log(`  ${passed} passaram, ${failures.length} falharam.`);
console.log("");
if (failures.length) {
  for (const { name, out } of failures) {
    console.log(`--- output de "${name}" ---`);
    console.log(out);
  }
  console.log("  Ha testes do mutation sweep a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do mutation sweep passaram.\n");
