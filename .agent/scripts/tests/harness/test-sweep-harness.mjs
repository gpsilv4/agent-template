/**
 * Harness dos testes do Mutation Sweep — {{PROJECT_NAME}}
 *
 * O verificador FALSO, a suite FALSA e o sandbox que o `test-mutation-sweep.mjs` usa. **NAO e
 * um entry point**: nao corre testes, so monta o que eles medem — e conta o veredicto.
 *
 * PORQUE VIVE A PARTE: a suite passou as 500 linhas e a catraca do Guard 17 manda dividir antes
 * de acrescentar, nunca levantar o teto. E o mesmo padrao do `test-harness.mjs`,
 * `test-surface-harness.mjs`, `test-upgrade-harness.mjs` e `test-bundle-harness.mjs`: um
 * harness **importa-se**, nao precisa de descoberta.
 *
 * A fronteira e util por si: tudo o que este ficheiro faz e montar um repo sintetico com um
 * verificador de comportamento CONHECIDO. Nenhum teste pode depender do estado deste repo
 * (`TP3`), e um par falso corre em milissegundos — varrer os verificadores reais aqui levaria
 * minutos e nao acrescentaria assercao nenhuma.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
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

export function sandbox({ suite = ".agent/scripts/fake-test.mjs", sinal = "/(?<![\\w.$])warn\\(/", segundoSitio = true, baselineVermelha = false, semAlvo = false, opcional = false, doisNaMesmaLinha = false, verificadorSemPar = false, sinalEmComentario = false, dadosSemPar = false, dadosComRecusa = false, sinalEmString = false, hookSemPar = false, harnessSemPar = false, harnessComThrow = false, contaCorridas = false, parSao = false, comGit = false, alterado = null } = {}) {
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
    // a ser uma LISTA de sitios onde e permitida, e `.claude/hooks/` nao esta nela — e este
    // teste e o que a prende fora.
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude/hooks/novo.mjs"),
      'if (process.env.X) console.log(JSON.stringify({ deny: true }));\n');
  }
  if (harnessSemPar) {
    // Um harness que so MONTA fixtures: nenhuma recusa, nada que se desligue. E o caso real do
    // `test-bundle-harness.mjs`, que ficou sem guardas quando a configuracao passou a
    // escrever-se em vez de se fatiar dentro do ficheiro da logica.
    mkdirSync(join(dir, ".agent/scripts/tests/harness"), { recursive: true });
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-novo-harness.mjs"),
      'export const fixture = () => ({ rotas: ["/"], teto: 160 });\n');
  }
  if (harnessComThrow) {
    // O contra-caso, e o que prende a isencao: um harness cujo unico sitio de recusa e um
    // `throw`. A verificacao de conteudo nao conhecia `throw new Error(` — dizia "nao tem
    // recusas" de um ficheiro que tem uma, e teria isentado este. Nao se via nos harnesses
    // reais porque a isencao so se aplica a quem AINDA nao esta em PARES.
    mkdirSync(join(dir, ".agent/scripts/tests/harness"), { recursive: true });
    writeFileSync(join(dir, ".agent/scripts/tests/harness/test-outro-harness.mjs"),
      'export const fixture = (x) => { if (!x) throw new Error("fixture vazia"); return x; };\n');
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
  // O motor de medicao e COPIADO, ao contrario do mapa e do PARES: e a peca que estes testes
  // querem exercitar de verdade (o paralelismo, as copias por worker, a deduplicacao das
  // baselines). Uma versao sintetica dele mediria uma reimplementacao, nao o motor.
  copyFileSync(
    join(ROOT, ".agent/scripts/lib/varredura-paralela.mjs"),
    join(dir, ".agent/scripts/lib/varredura-paralela.mjs")
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
  if (contaCorridas) {
    // DOIS alvos que partilham UMA suite, e a suite regista cada corrida sua. E a unica forma
    // de medir a deduplicacao das baselines: a pergunta nao e "o resultado esta certo" (esse
    // estaria certo com ou sem dedup) — e "quantas vezes e que a suite correu".
    //
    // O log vai para o diretorio da SANDBOX, por caminho absoluto, e nao para a copia: a copia
    // e um tmpdir que o varredor cria e destroi, e o teste nunca lhe chegaria. O caminho e
    // cravado no codigo gerado porque so aqui se sabe qual e.
    const log = join(dir, "corridas.log");
    const checkN = (n) =>
      `const warn=(m)=>{console.log("  WARN  "+m)};\n` +
      `if((process.argv[2]??"").includes("mau")){warn("check${n}");process.exit(1)}\nprocess.exit(0);\n`;
    writeFileSync(join(dir, ".agent/scripts/fake-check.mjs"), checkN(1));
    writeFileSync(join(dir, ".agent/scripts/fake-check-2.mjs"), checkN(2));
    // A suite exercita os DOIS: se so exercitasse um, mutar o outro nunca a punha vermelha e
    // a varredura reportaria INCOMPLETA em vez de medir o que este teste quer medir.
    writeFileSync(join(dir, ".agent/scripts/fake-test.mjs"),
      `import { execFileSync } from "child_process";\nimport { appendFileSync } from "fs";\n` +
      `import { fileURLToPath } from "url";\nimport { dirname, resolve, join } from "path";\n` +
      `appendFileSync(${JSON.stringify(log)}, "x\\n");\n` +
      `const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");\n` +
      `for (const [f, marca] of [[".agent/scripts/fake-check.mjs","check1"],[".agent/scripts/fake-check-2.mjs","check2"]]) {\n` +
      `  let out="", code=0;\n` +
      `  try { out = execFileSync("node",[join(ROOT,f),"isto e mau"],{encoding:"utf8"}); }\n` +
      `  catch(e){ code = e.status ?? 1; out = (e.stdout ?? "") + (e.stderr ?? ""); }\n` +
      `  if (code === 0 || !out.includes(marca)) { console.log("FALHOU " + f); process.exit(1); }\n` +
      `}\nconsole.log("ok");\n`);
    writeFileSync(join(dir, ".agent/scripts/lib/pares.mjs"),
      `export const PARES = [\n` +
      `  { alvo: ".agent/scripts/fake-check.mjs", suite: ".agent/scripts/fake-test.mjs", sinal: /(?<![\\w.$])warn\\(/, neutro: "(() => {})(" },\n` +
      `  { alvo: ".agent/scripts/fake-check-2.mjs", suite: ".agent/scripts/fake-test.mjs", sinal: /(?<![\\w.$])warn\\(/, neutro: "(() => {})(" },\n` +
      `];\n`);
  }

  return dir;
}

export function run(dir, args = []) {
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

/**
 * O que a varredura fez vs o que o teste esperava -> lista de problemas. **Funcao pura**, e e
 * por isso que esta separada do `test()`.
 *
 * PORQUE E PURA: a varredura de mutacao mediu **0 de 4** sitios deste ficheiro. Desligar
 * qualquer uma destas quatro assercoes deixava a suite VERDE — uma assercao a menos aqui so
 * torna os testes mais permissivos, e o ecra continua a dizer "todos passaram". O ficheiro que
 * decide o veredicto de 29 testes sobre o proprio medidor nao tinha rede nenhuma.
 *
 * E nao foi a divisao que abriu o buraco: antes dela estas linhas viviam dentro do
 * `test-mutation-sweep.mjs`, que **nao e alvo da varredura** (e uma suite, nao um verificador).
 * Extrair o harness tornou-as visiveis. O buraco ja ca estava; o que mudou foi haver quem o
 * apontasse.
 *
 * Isolada assim, chama-se com entradas FABRICADAS — uma por sitio — e desligar um `push` poe um
 * desses casos vermelho. E o mesmo desenho do `avaliar()` do `test-harness.mjs`, que nasceu
 * deste mesmo achado.
 *
 * @param resultado {{code: number, out: string}} o que a varredura devolveu
 * @param expect    o que o caso exigia
 * @param dir       a sandbox, so para o `expect.extra`
 * @returns {string[]} vazio = sao
 */
export function avaliar({ code, out }, expect, dir = null) {
  const problems = [];
  if (code !== expect.code) problems.push(`exit ${code}, esperado ${expect.code}`);
  for (const s of expect.includes ?? []) if (!out.includes(s)) problems.push(`output devia conter "${s}"`);
  for (const s of expect.excludes ?? []) if (out.includes(s)) problems.push(`output NAO devia conter "${s}"`);
  if (expect.extra) problems.push(...(expect.extra(dir, out) ?? []));
  return problems;
}

/** Regista um veredicto ja calculado. Existe para os auto-testes do `avaliar()`, que nao montam
 *  sandbox nenhuma — sem isto teriam de duplicar os contadores (`TP1`). */
export function registarResultado(name, problems, out = "") {
  if (problems.length) {
    failures.push({ name, problems, out });
    console.log(`  FAIL  ${name}`);
    for (const p of problems) console.log(`          ${p}`);
  } else {
    passed++;
    console.log(`  PASS  ${name}`);
  }
}

export function test(name, opts, args, expect) {
  const dir = sandbox(opts);
  try {
    const { code, out } = run(dir, args);
    const problems = avaliar({ code, out }, expect, dir);
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
/** O veredicto da suite. Vive aqui porque os contadores vivem aqui: exporta-los em bruto punha
 *  duas copias do mesmo numero a ter de concordar a mao (`TP1`).
 *
 *  SAI daqui em vez de devolver um codigo, como o `resumo()` do `test-harness.mjs`. Devolve-lo
 *  parecia mais testavel e custava duas coisas: divergia da convencao dos outros harnesses, e
 *  tirava o `process.exit(1)` de dentro da suite — que e a marca por onde o
 *  `check-test-surface.mjs` reconhece que um runner ainda tem veredicto. O gate apanhou-o. */
export function resumo() {
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
  process.exit(0);
}
