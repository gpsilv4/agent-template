#!/usr/bin/env node
/**
 * Simula um PROJETO DERIVADO e corre la as verificacoes — {{PROJECT_NAME}}
 *
 * PORQUE EXISTE: este repo e um template, e a promessa dele e "funciona no teu projeto
 * derivado". Todas as outras suites correm sobre o template **nu** — placeholders por
 * substituir, rules do bootstrap por gerar. Nenhuma testava a promessa.
 *
 * Nao e teorico. A primeira corrida desta simulacao encontrou a checklist do `BOOTSTRAP.md` a
 * mandar deixar o `anti-patterns.md` "sem entradas" — estado em que os ficheiros do template
 * deixam dezenas de citacoes penduradas e o consumidor leva exit 1 **no dia 1**. Tres leituras
 * independentes nao viram; uma corrida viu em minutos. E a licao do `AP2` e do `ticket-method`
 * ("correr os comandos que a documentacao manda correr") com instrumento.
 *
 * NAO E UM `check-*.mjs`, e o nome e deliberado: a descoberta do `mutation-sweep.mjs` varre
 * `check-*.mjs` e `guards/*.mjs` e exige par em `PARES`; um alvo sem sitios de aviso proprios
 * reprova la com `SINAL ERRADO`. Este ficheiro **orquestra** verificadores que ja tem par e
 * suite — o veredicto dele e o exit code deles, nao uma decisao sua. A sua propria logica (o
 * que copia, o que substitui, o que gera, e recusar-se a dar OK sem ter medido) tem suite
 * propria em `test-simulate-derived.mjs`.
 *
 * O QUE FAZ, a espelhar a Fase 2 do `BOOTSTRAP.md`:
 *   1. copia o repo sem `.git` nem o que nao pertence a um clone novo;
 *   2. substitui os `{{PLACEHOLDER}}`;
 *   3. cria as rules que o bootstrap GERA (sao o discriminador de "bootstrap concluido");
 *   4. corre os verificadores e as suites, e reprova se algum sair != 0.
 *
 * A lista de extensoes do passo 2 nao precisa de estar perfeita para o resultado ser de
 * confianca: se faltar alguma, sobram placeholders e o **Guard 13 dispara** no passo 4. A
 * simulacao denuncia-se a si mesma em vez de passar a medir menos.
 *
 * O LIMITE, dito por inteiro porque e o mesmo erro que o `AP7` documenta: isto simula o
 * **estado** "bootstrap concluido", e nao **executa a checklist** do `BOOTSTRAP.md` passo a
 * passo. Aplica os que sao mecanicos (2.1 substituir, 2.2 gerar, e o unico passo destrutivo do
 * 2.8 — apagar o exemplo comentado do `anti-patterns.md`). Uma instrucao errada noutro passo —
 * que foi exactamente o defeito que motivou este script — so e apanhada se alguem a seguir a
 * mao. Isto reduz a janela; nao a fecha. Quem acrescentar um passo mecanico a Fase 2 devia
 * acrescenta-lo aqui.
 *
 * Uso:
 *   node .agent/scripts/simulate-derived.mjs             # corre tudo
 *   node .agent/scripts/simulate-derived.mjs --keep      # nao apaga a copia (para inspeccionar)
 *   node .agent/scripts/simulate-derived.mjs --only=check-doc-versions,test-guards
 */

import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { tmpdir } from "os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Nao pertencem a um clone novo. `TEMPLATE-FIXES*` sao relatorios de revisao entregues de
 *  fora (ver `.gitignore`); `node_modules` e `.git` sao obvios. */
const NAO_COPIAR = [".git", "node_modules"];
const NAO_COPIAR_PREFIXO = ["TEMPLATE-FIXES"];

/** Tipos que a Fase 2.1 do BOOTSTRAP manda varrer. Se esta lista ficar curta, sobram
 *  placeholders e o Guard 13 reprova no passo 4 — por desenho. */
const SUBSTITUIVEIS = /\.(md|mdc|mjs|json|yml|yaml|toml)$/;
const SUBSTITUIVEIS_SEM_EXT = new Set(["LICENSE", "CODEOWNERS"]);
/** Os hooks do git nao tem extensao (o git exige o nome exacto do evento), logo precisam de
 *  regra propria — e foi por nao a terem que um `{{PROJECT_NAME}}` la sobrevivia ao bootstrap. */
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

/** Os comandos que um projeto derivado corre — os mesmos do `guard-tests` do `ci.yml`. */
const COMANDOS = [
  ".agent/scripts/check-doc-versions.mjs",
  ".agent/scripts/check-backlog.mjs",
  ".agent/scripts/test-guards.mjs",
  ".agent/scripts/test-test-surface.mjs",
  ".agent/scripts/test-bundle-sizes.mjs",
  ".agent/scripts/test-backlog.mjs",
  ".agent/scripts/test-mutation-sweep.mjs",
  ".agent/scripts/test-commit-msg.mjs",
  ".claude/hooks/tests/test-hooks.mjs",
];

const leOuNull = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

let problemas = 0;
const warn = (m) => {
  console.log(`  WARN  ${m}`);
  problemas++;
};
const ok = (m) => console.log(`  OK    ${m}`);
/** Nao consegui medir: reprova na hora. Existe como funcao e nao como `console.log` +
 *  `process.exit` soltos — ver a nota equivalente no `check-test-surface.mjs`. */
const fatal = (m) => {
  console.log(`  WARN  ${m}`);
  console.log("");
  process.exit(1);
};

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
const dir = mkdtempSync(join(tmpdir(), "derivado-"));
let copiados = 0;
for (const e of readdirSync(ROOT, { withFileTypes: true })) {
  if (NAO_COPIAR.includes(e.name)) continue;
  if (NAO_COPIAR_PREFIXO.some((p) => e.name.startsWith(p))) continue;
  cpSync(join(ROOT, e.name), join(dir, e.name), { recursive: true });
  copiados++;
}
if (copiados === 0) fatal("nao copiei nada do repo — a simulacao nao mediria nada");

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
// e o script reprovava em todos os consumidores. E o `AP7` e o `AP3` no mesmo sitio.
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

if (!manter) rmSync(dir, { recursive: true, force: true });
else console.log(`\n  copia mantida em ${dir}`);

// Zero comandos corridos com uma seleccao valida seria dar OK sem ter medido nada.
if (corridos === 0) fatal("nenhum comando chegou a correr — a simulacao nao mediu nada");

console.log("");
if (problemas > 0) {
  console.log(`WARNING: ${problemas} verificacao(oes) falham num projeto DERIVADO.`);
  console.log("         Passam no template nu — logo o defeito e do bootstrap ou de uma");
  console.log("         assercao que depende do estado deste repo (ver AP3).\n");
  process.exit(1);
}
console.log(`  ${corridos} verificacao(oes) verdes num projeto derivado.\n`);
