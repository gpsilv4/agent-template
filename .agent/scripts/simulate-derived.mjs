#!/usr/bin/env node
/**
 * Simula um PROJETO DERIVADO e corre la as verificacoes — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: este repo e um template, e a promessa dele e "funciona no teu projeto
 * derivado". Todas as outras suites correm sobre o template **nu** — placeholders por
 * substituir, rules do bootstrap por gerar. Nenhuma testava a promessa.
 *
 * Nao e teorico: a primeira corrida encontrou a checklist do `BOOTSTRAP.md` a mandar deixar o
 * `anti-patterns.md` "sem entradas" — estado em que o consumidor leva exit 1 **no dia 1**. Tres
 * leituras independentes nao viram; uma corrida viu em minutos.
 *
 * NAO E UM `check-*.mjs`, e o nome e deliberado: a descoberta do `mutation-sweep.mjs` exigiria
 * par a um alvo sem sitios de aviso proprios. Este ficheiro **orquestra** verificadores que ja
 * tem par e suite; a logica dele tem suite propria em `test-simulate-derived.mjs`.
 *
 * O QUE FAZ, a espelhar a Fase 2 do `BOOTSTRAP.md`:
 *   1. copia o repo sem `.git` nem o que nao pertence a um clone novo;
 *   2. substitui os placeholders (`{{ ... }}`);
 *   3. cria as rules que o bootstrap GERA (sao o discriminador de "bootstrap concluido");
 *   4. corre os verificadores e as suites, e reprova se algum sair != 0.
 *
 * A lista de extensoes do passo 2 nao precisa de estar perfeita para o resultado ser de
 * confianca: se faltar alguma, sobram placeholders e o **Guard 13 dispara** no passo 4. A
 * simulacao denuncia-se a si mesma em vez de passar a medir menos.
 *
 * O LIMITE, dito por inteiro (e o mesmo erro que o `TP7` documenta): isto simula o **estado**
 * "bootstrap concluido", nao **executa a checklist** passo a passo. Aplica os mecanicos (2.1, 2.2
 * e o destrutivo do 2.8). Uma instrucao errada noutro passo so e apanhada a mao: reduz a janela,
 * nao a fecha. Quem acrescentar um passo mecanico a Fase 2 devia acrescenta-lo aqui.
 *
 * Uso:
 *   node .agent/scripts/simulate-derived.mjs             # corre tudo
 *   node .agent/scripts/simulate-derived.mjs --keep      # nao apaga a copia (para inspeccionar)
 *   node .agent/scripts/simulate-derived.mjs --only=check-doc-versions,test-guards
 */

import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join, sep } from "path";
import { ehDerivado } from "./lib/derivado.mjs";
import { criaTmp, limpaTmpsAntigos, limpaFixturesDeTeste } from "./lib/tmp-limpo.mjs";
import { leOuNull } from "./lib/ficheiros.mjs";
import { comHistoria, queConfigurou, comFicheirosGrandes } from "./lib/derivado-maduro.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");


/** Nao pertencem a um clone novo. `TEMPLATE-FIXES*` sao relatorios de revisao entregues de
 *  fora (ver `.gitignore`); `node_modules` e `.git` sao obvios. */
const NAO_COPIAR = [".git", "node_modules", ".env", ".claude/state"];
/** Segredos e estado local nunca entram na copia. Num projeto derivado a copia inclui tudo o
 *  que esta na raiz — e ia parar a `/tmp`, onde ficava se o script saisse por `fatal()`. */
const NAO_COPIAR_SUFIXO = [".pem", ".key", ".p12", ".pfx"];
const NAO_COPIAR_PREFIXO = ["TEMPLATE-FIXES"];

/** Tipos que a Fase 2.1 do BOOTSTRAP manda varrer. Se esta lista ficar curta, sobram
 *  placeholders e o Guard 13 reprova no passo 4 — por desenho. */
const SUBSTITUIVEIS = /\.(md|mdc|mjs|json|yml|yaml|toml)$/;
const SUBSTITUIVEIS_SEM_EXT = new Set(["LICENSE", "CODEOWNERS"]);
/** Os hooks do git nao tem extensao (o git exige o nome exacto do evento), logo precisam de
 *  regra propria — e foi por nao a terem que um `{{ PROJECT_NAME }}` la sobrevivia ao bootstrap. */
const substituivel = (rel, nome) =>
  rel.startsWith(".githooks/") || SUBSTITUIVEIS.test(nome) || SUBSTITUIVEIS_SEM_EXT.has(nome);

/** `{{args}}` e um placeholder dos command templates do Gemini, nao do bootstrap. */
const PLACEHOLDER = /\{\{(?!args\})[A-Z_]+\}\}/g;

/** O que a Fase 2.2 do BOOTSTRAP manda GERAR. Derivado do proprio BOOTSTRAP.md para nao
 *  envelhecer: se alguem acrescentar um ficheiro gerado a tabela 2.2, esta lista segue. */
function rulesGeradas() {
  const b = leOuNull(join(ROOT, ".agent/BOOTSTRAP.md"));
  if (b === null) return [];
  const seccao = b.split(/^### 2\.2 /m)[1]?.split(/^### 2\.3 /m)[0] ?? "";
  return [...new Set([...seccao.matchAll(/`(\.agent\/rules\/[a-z-]+\.md)`/g)].map((m) => m[1]))];
}


// Num derivado esta promessa nao se pode verificar: o que o script configura ja esta configurado.
// Corria e falhava a queixar-se de literais, mandando procurar um defeito no template em vez de
// dizer que o script esta no sitio errado. SKIP visivel, como o irmao. Deteccao: `lib/derivado.mjs`.
if (ehDerivado((rel) => leOuNull(join(ROOT, rel)))) {
  console.log("  SKIP  simulacao de projeto derivado — este repo JA e um derivado, nao o template.");
  console.log("        O que este script configura ja esta configurado; mediria outra coisa.\n");
  process.exit(0);
}

/** Os comandos que um projeto derivado corre — DERIVADOS do job `guard-tests` do `ci.yml`.
 *
 *  Estava escrito a mao, com um comentario a dizer "os mesmos do `ci.yml`" e nada a
 *  verifica-lo: acrescentar uma suite ao CI e esquecer aqui fazia a simulacao medir menos,
 *  em silencio — a mesma classe que o `PARES` ja resolveu com descoberta. O `check-test-surface`
 *  nao e incluido: precisa de um `.git` com historia, que a copia nao tem. */
function comandosDoCI() {
  const ci = leOuNull(join(ROOT, ".github/workflows/ci.yml"));
  if (ci === null) return null;
  const job = ci.split(/^  guard-tests:/m)[1];
  if (!job) return null;
  const encontrados = [...job.matchAll(/run:\s*node\s+(\S+\.mjs)/g)].map((m) => m[1]);
  // EXCLUSOES, cada uma por uma razao concreta:
  //  - `check-test-surface`: precisa de um `.git` com historia, e a copia nao tem;
  //  - `simulate-derived` (este ficheiro) e a sua suite: correr-se-iam DENTRO da copia, que
  //    por sua vez faria outra copia — recursao infinita. Medido: o processo nao terminava e
  //    deixou dezenas de copias em `/tmp`. E a armadilha obvia de derivar a lista do CI, e
  //    por isso esta escrita aqui em vez de ser descoberta outra vez.
  //  - `simulate-upgrade`: precisa de TAGS, e a copia nao tem `.git` nenhum. Mesma classe
  //    que o `check-test-surface` acima. Sem esta linha, acrescentar o simulador de
  //    upgrade ao `ci.yml` punha esta simulacao vermelha — e a falha nao dizia respeito
  //    ao derivado, dizia respeito a copia nao ser um repo. Medido ao ligar os dois.
  const EXCLUIR = ["check-test-surface", "simulate-derived", "simulate-upgrade"];
  return [...new Set(encontrados)].filter((c) => !EXCLUIR.some((x) => c.includes(x)));
}

let problemas = 0;
const warn = (m) => {
  console.log(`  WARN  ${m}`);
  problemas++;
};
const ok = (m) => console.log(`  OK    ${m}`);
/** Nao consegui medir: reprova na hora. Existe como funcao e nao como `console.log` +
 *  `process.exit` soltos — ver a nota equivalente no `check-test-surface.mjs`. */
/** Onde a copia vive, para o `fatal()` a poder limpar. Sem isto, cada caminho de recusa
 *  depois do passo 1 saia com `process.exit(1)` e deixava a copia do REPO INTEIRO em
 *  `/tmp` — num projeto derivado isso inclui `.env`, `*.pem` e tudo o resto. Medido: 63
 *  copias orfas acumuladas. */
let copiaAtiva = null;
const limpaCopia = () => {
  if (copiaAtiva && !process.argv.includes("--keep")) {
    try {
      rmSync(copiaAtiva, { recursive: true, force: true });
    } catch {
      /* melhor esforco: nao mascarar a razao real da saida */
    }
    copiaAtiva = null;
  }
};
const fatal = (m) => {
  limpaCopia();
  console.log(`  WARN  ${m}`);
  console.log("");
  process.exit(1);
};
// Tambem numa excepcao nao prevista ou num Ctrl-C.
process.on("exit", limpaCopia);
process.on("SIGINT", () => {
  limpaCopia();
  process.exit(130);
});

const COMANDOS = comandosDoCI();
if (COMANDOS === null || COMANDOS.length === 0) {
  // TP2: "nao consegui ler o ci.yml" != "nao ha comandos a correr". Uma lista vazia faria a
  // simulacao passar sem medir nada.
  console.log("  WARN  nao derivei nenhum comando do job `guard-tests` do ci.yml — o job mudou de nome ou de formato?");
  console.log("");
  process.exit(1);
}

const args = process.argv.slice(2);
const manter = args.includes("--keep");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const selecionados = only
  ? COMANDOS.filter((c) => only.split(",").some((o) => c.includes(o.trim())))
  : COMANDOS;

if (selecionados.length === 0) {
  fatal(`--only=${only} nao seleccionou nenhum comando — nada a correr nao e sucesso`);
}

console.log("\n=== Simulacao de projeto derivado ===\n");

// --- 1. copiar -----------------------------------------------------------------
// A copia so se limpa a saida no caso NORMAL: um `SIGKILL` nao se apanha, e foi assim que
// ficaram 33 MB por corrida interrompida. Quem varre o que sobrou e a corrida SEGUINTE, no
// arranque — e so o que ja nao tem dono vivo, porque duas corridas em paralelo acontecem.
const abandonadas = limpaTmpsAntigos("derivado-") + limpaFixturesDeTeste();
if (abandonadas) console.log(`  OK    ${abandonadas} copia(s) de corridas interrompidas apagadas`);
const dir = criaTmp("derivado-");
copiaAtiva = dir;
/** Aplica-se a QUALQUER profundidade, e nao so a raiz.
 *
 *  O filtro corria uma vez por entrada de topo e o `cpSync` recursivo copiava o resto sem
 *  perguntar. Consequencias medidas: `.claude/state` estava na lista de exclusao e **entrava
 *  sempre** (a comparacao via `.claude`, nao `.claude/state`); um `.pem`, uma `.key` ou um
 *  `.env.local` dentro de qualquer subpasta entrava tambem — e a copia ia parar a `/tmp`,
 *  onde ficava se o script saisse por `fatal()`. Uma lista de exclusao que so olha para o
 *  primeiro nivel de uma arvore e uma lista que nao exclui.
 *  @param rel caminho relativo a ROOT, com `/` (ex: `.claude/state`) */
const excluido = (rel) => {
  const nome = rel.slice(rel.lastIndexOf("/") + 1);
  if (NAO_COPIAR.includes(rel) || NAO_COPIAR.includes(nome)) return true;
  if (NAO_COPIAR_PREFIXO.some((p) => nome.startsWith(p))) return true;
  if (nome.startsWith(".env")) return true;
  if (NAO_COPIAR_SUFIXO.some((x) => nome.endsWith(x))) return true;
  return false;
};

let copiados = 0;
for (const e of readdirSync(ROOT, { withFileTypes: true })) {
  if (excluido(e.name)) continue;
  cpSync(join(ROOT, e.name), join(dir, e.name), {
    recursive: true,
    // `src` vem absoluto; reduzir a um caminho relativo a ROOT antes de decidir.
    filter: (src) => !excluido(src.slice(ROOT.length + 1).split(sep).join("/")),
  });
  copiados++;
}
// NAO ha um `if (copiados === 0) fatal(...)` aqui, e a ausencia e deliberada: este script vive
// em `.agent/scripts/`, logo `.agent` esta SEMPRE na raiz e e sempre copiado — `copiados` nunca
// pode ser zero. Era codigo de defesa que nenhum teste podia alcancar.
//
// Quem o apanhou foi a varredura de mutacao, na PRIMEIRA vez que este ficheiro foi medido: ele
// nao casava a convencao `check-*.mjs` da descoberta e por isso nunca tinha sido varrido, apesar
// de ter sitios de recusa e suite propria. Codigo de defesa que nenhum teste cobre e peso morto
// — e a varredura reprova-o, com razao (a mesma nota existe no `check-test-surface.mjs`).

// --- 2.0. marcador de origem. ESTAVA EM FALTA: sem ele `ehDerivado()` da false na copia e o
// Guard 13 — a unica rede de placeholders — saltava em TODAS as corridas (`scripts-guide-why.md`).
writeFileSync(join(dir, ".agent/.template-version"), "template: simulacao\ncommit: 0000000\nversao: v0.0.0\ndata: 1970-01-01\n");
ok("marcador `.agent/.template-version` gravado (Fase 2.0) — e ele que liga o Guard 13");

// --- 2. substituir placeholders -------------------------------------------------
let tocados = 0;
const anda = (rel) => {
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const sub = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      anda(sub);
      continue;
    }
    if (!substituivel(sub, e.name)) continue;
    const p = join(dir, sub);
    const c = readFileSync(p, "utf8");
    const novo = c.replace(PLACEHOLDER, "ProjetoDerivado");
    if (novo !== c) {
      writeFileSync(p, novo);
      tocados++;
    }
  }
};
anda("");
ok(`${copiados} entrada(s) copiada(s), ${tocados} ficheiro(s) com placeholders substituidos`);

// O invariante que importa nao e "substitui alguma coisa" — e "nao sobrou nada". A primeira
// versao reprovava com `tocados === 0`, e isso era **inalcancavel**: este proprio ficheiro tem
// um placeholder no cabecalho, logo a contagem nunca e zero enquanto ele existir. Pior, o unico
// sitio onde chegaria a ser zero e um projeto ja bootstrapado — onde zero e o estado CORRECTO —
// e o script reprovava em todos os consumidores. E o `TP7` e o `TP3` no mesmo sitio.
//
// Isto, sim, dispara quando a lista de extensoes fica curta: sobra um `{{...}}` na copia e a
// simulacao deixa de ser fiel. O `BOOTSTRAP.md` e o `README.md` ficam de fora porque
// **documentam** os placeholders — e a mesma excecao que o Guard 13 faz.
const DOCUMENTAM = new Set([".agent/BOOTSTRAP.md", "README.md"]);
/** Nao sao texto: um `{{...}}` la dentro nao instrui agente nenhum, e ler binario como utf8 so
 *  produz ruido. */
const BINARIOS = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov)$/i;
const sobras = [];
const procura = (rel) => {
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const sub = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      procura(sub);
      continue;
    }
    if (DOCUMENTAM.has(sub)) continue;
    // **Sem** o filtro `SUBSTITUIVEIS`, e e o ponto todo: com ele, um tipo de ficheiro que a
    // substituicao nao cobre era tambem ignorado por esta varredura — cega precisamente ao
    // caso que diz apanhar. Apanhado pelo teste, nao pela leitura.
    if (BINARIOS.test(e.name)) continue;
    let c;
    try {
      c = readFileSync(join(dir, sub), "utf8");
    } catch {
      continue; // ilegivel como texto: nao e onde um placeholder engana alguem
    }
    const m = c.match(PLACEHOLDER);
    if (m) sobras.push(`${sub} (${[...new Set(m)].join(", ")})`);
  }
};
procura("");
if (sobras.length) {
  fatal(
    `sobraram placeholders por substituir em ${sobras.length} ficheiro(s) — a simulacao nao e ` +
      `fiel a um projeto bootstrapado. Primeiro: ${sobras[0]}`
  );
}

// --- 3. gerar as rules do bootstrap ----------------------------------------------
// Este simulador so faz sentido NO TEMPLATE: simula derivar um projeto a partir dele. Num
// projeto ja derivado o `BOOTSTRAP.md` foi apagado (a propria documentacao manda apaga-lo),
// e reprovar por isso punha o CI de todos os consumidores vermelho no primeiro PR — medido.
// Sair 0 com a razao VISIVEL, e nao em silencio: "nao se aplica aqui" != "correu e passou".
if (leOuNull(join(ROOT, ".agent/BOOTSTRAP.md")) === null) {
  console.log("\n  SKIP  simulacao de projeto derivado — este repo ja e um derivado (sem .agent/BOOTSTRAP.md).");
  console.log("        A simulacao so se aplica ao template de origem.\n");
  process.exit(0);
}

const geradas = rulesGeradas();
if (geradas.length === 0) {
  fatal("nao derivei nenhuma rule gerada da seccao 2.2 do BOOTSTRAP.md — o formato mudou?");
}
for (const rel of geradas) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  const nome = rel.split("/").pop().replace(".md", "");
  writeFileSync(p, `# ${nome} (ProjetoDerivado)\n\nConteudo gerado no bootstrap deste projeto.\n`);
}
ok(`${geradas.length} rule(s) do bootstrap geradas: ${geradas.map((g) => g.split("/").pop()).join(", ")}`);

// --- 3b. o unico passo DESTRUTIVO da Fase 2 que e mecanico ------------------------
// A 2.8 manda apagar o exemplo comentado do `anti-patterns.md` — e **so** esse. Foi aqui que
// a instrucao esteve errada (mandava deixar o ficheiro sem entradas, o que deixa dezenas de
// citacoes penduradas); simular o passo certo e o que impede a versao errada de voltar sem
// ninguem notar.
{
  const rel = ".agent/rules/anti-patterns.md";
  const p = join(dir, rel);
  const c = leOuNull(p);
  if (c !== null) {
    const semExemplo = c.replace(/<!--[\s\S]*?-->\n*/g, "");
    if (semExemplo !== c) {
      writeFileSync(p, semExemplo);
      ok("exemplo comentado do anti-patterns.md removido (passo 2.8)");
    } else {
      ok("anti-patterns.md sem exemplo comentado a remover");
    }
  }
}

// --- 3c/3d/3e. a MATURIDADE do derivado -------------------------------------------
// Do dia 1 para o dia 100: um anti-padrao proprio, a configuracao preenchida, ficheiros
// grandes seus. Tres dos quatro achados de uma ronda de revisao viviam so aqui — um derivado
// por estrear nao os expoe.
//
// Vivem em `lib/derivado-maduro.mjs` desde que este ficheiro bateu nas 500 linhas do Guard 17.
// Os corpos foram movidos VERBATIM; o que mudou foi a moldura (cada bloco passou a funcao, e
// `dir`/`ok`/`fatal` passaram de fecho de escopo a parametro).
comHistoria({ dir, ok });
queConfigurou({ dir, ok, fatal });
await comFicheirosGrandes({ dir, ok, fatal });

// --- 4. correr -------------------------------------------------------------------
console.log("");
let corridos = 0;
for (const c of selecionados) {
  if (!existsSync(join(dir, c))) {
    warn(`${c}: ausente na copia — nao consegui correr`);
    continue;
  }
  let code = 0;
  let out = "";
  try {
    out = execFileSync(process.execPath, [join(dir, c)], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    code = err.status ?? 1;
    out = (err.stdout ?? "") + (err.stderr ?? "");
  }
  corridos++;
  const resumo = (out.match(/^\s*\d+ passaram, \d+ falharam\.$/m) ?? [""])[0].trim();
  if (code === 0) {
    ok(`${c}${resumo ? ` — ${resumo}` : ""}`);
  } else {
    warn(`${c}: exit ${code}${resumo ? ` — ${resumo}` : ""}`);
    for (const l of out.split("\n").filter((l) => /^\s*(WARN|FAIL)/.test(l)).slice(0, 8)) {
      console.log(`          ${l.trim()}`);
    }
  }
}

if (!manter) limpaCopia();
else console.log(`\n  copia mantida em ${dir}`);

// Zero comandos corridos com uma seleccao valida seria dar OK sem ter medido nada.
if (corridos === 0) fatal("nenhum comando chegou a correr — a simulacao nao mediu nada");

console.log("");
if (problemas > 0) {
  console.log(`WARNING: ${problemas} verificacao(oes) falham num projeto DERIVADO.`);
  console.log("         Passam no template nu — logo o defeito e do bootstrap ou de uma");
  console.log("         assercao que depende do estado deste repo (ver TP3).\n");
  process.exit(1);
}
console.log(`  ${corridos} verificacao(oes) verdes num projeto derivado.\n`);
