/**
 * Backlog Checker — {{PROJECT_NAME}}
 *
 * Trata contadores e barra de progresso do backlog como DADOS DERIVADOS:
 * recalcula-os a partir das tabelas por tipo (items abertos em `backlog.md`)
 * e do Historico (items fechados em `backlog-archive.md`), e avisa se o que
 * esta escrito no Resumo / Progresso Geral divergir. Deteta tambem:
 *   - IDs duplicados (um item deve viver num so ficheiro);
 *   - items fechados (Concluido/Cancelado) esquecidos no ficheiro ativo;
 *   - o formato (#445, `lib/backlog-regras.mjs`): a `Ordem` de cada bloco, o "Depende de", as linhas riscadas, os
 *     Pendentes sem Sprint (e a coluna `Nota`) e o Historico lido pelo nome das colunas.
 *
 * Tolerante a template vazio: linhas-placeholder (sem ID) sao ignoradas,
 * nunca rebenta em tabelas por preencher.
 *
 * Uso:
 *   node .agent/scripts/check-backlog.mjs              # verifica
 *   node .agent/scripts/check-backlog.mjs --corrigir   # reescreve so os contadores (#431)
 *
 * Sai com codigo != 0 se houver divergencias (pode funcionar como gate no CI).
 * Correr antes de commit. Corre no CI (o job `guard-tests` do `ci.yml`), sempre sem `--corrigir`.
 *
 * `--corrigir` (#431): reescreve no `backlog.md` so os valores DERIVADOS (as linhas do Resumo, o Total, a linha do
 * Progresso Geral), e so quando TODOS os avisos sao contagens (`lib/backlog-corrige.mjs`); com outro aviso nao
 * escreve nada e sai != 0. Confirma o texto novo pelo mesmo calculo antes de o gravar, e grava num temporario
 * renomeado por cima (uma falha a meio deixa o original). Nunca no CI: um verificador que escreve e para uma pessoa.
 */

import { readFileSync, writeFileSync, renameSync, rmSync, lstatSync, statSync, chmodSync } from "fs";
import { calcula } from "./lib/backlog-calculo.mjs";
import { corrige } from "./lib/backlog-corrige.mjs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

// Ancorar a raiz do REPO, nao ao cwd. Com caminhos relativos, correr o script de qualquer
// subpasta (ou de um hook que nao faz cd) lia zero ficheiros, imprimia SKIP e saia 0 — um
// gate a passar tendo validado nada. Mesma ancoragem que o check-doc-versions.mjs.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ACTIVE = ".agent/context/backlog.md";
const ARCHIVE = ".agent/context/backlog-archive.md";

function read(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch {
    return null;
  }
}

// --- Main ---

// Um argumento desconhecido recusa-se (o precedente do `adotar-template.mjs`): um `--corigir` ou um `--fix` que
// corresse so a verificacao, em silencio, parecia ter corrigido.
const ARGS = process.argv.slice(2);
const desconhecidos = ARGS.filter((a) => a !== "--corrigir");
if (desconhecidos.length) {
  console.error(`check-backlog: argumento desconhecido ${desconhecidos.join(" ")} — so \`--corrigir\` (#431)`);
  process.exit(2);
}
const CORRIGIR = ARGS.includes("--corrigir");

console.log("\n=== Backlog Check ===\n");

const active = read(ACTIVE);
if (!active) {
  // NAO sair 0: este ficheiro e importado pelas rules e a sua ausencia impede a
  // verificacao por completo. Sair 0 aqui transformava o gate em decoracao.
  console.log(`  WARN  ${ACTIVE} nao encontrado ou vazio — impossivel validar o backlog.\n`);
  process.exit(1);
}
// O arquivo guarda os items fechados. Ausente != vazio: se nao existe, os contadores de
// Concluido/Cancelado sao calculados a partir de nada e a divergencia seria atribuida ao
// Resumo em vez a fonte que falta.
const archiveRaw = read(ARCHIVE);

let warnings = 0;
const warn = (msg) => {
  console.log(`  WARN  ${msg}`);
  warnings++;
};

const calc = calcula(active, archiveRaw, { ACTIVE, ARCHIVE });
const { avisos, g, countable, expectedPct, expectedFilled } = calc;
for (const a of avisos) warn(a.msg);

if (CORRIGIR && avisos.length) {
  const { texto, problemas } = corrige(active, calc);
  // O texto novo passa pelo MESMO calculo antes de se gravar: so se escreve o que o verificador da por consistente.
  const depois = texto === null ? null : calcula(texto, archiveRaw, { ACTIVE, ARCHIVE }).avisos;
  if (texto === null || depois.length) {
    for (const p of [...problemas, ...(depois ?? []).map((a) => a.msg)]) console.log(`  NAO CORRIGI  ${p}`);
    console.log(`\n  --corrigir: nada escrito — ${problemas.length ? "ha avisos que nao sao contagens (corrigir a mao primeiro)" : "o texto corrigido nao ficou consistente"}.\n`);
    process.exit(1);
  }
  const destino = join(ROOT, ACTIVE);
  // So um FICHEIRO normal (a leitura independente do #431): o rename por cima de um symlink trocava o link por um
  // ficheiro e deixava o alvo — o que o verificador leu — com os numeros antigos. O precedente e o `adotar-template`.
  if (!lstatSync(destino).isFile()) {
    console.log(`\n  --corrigir: ${ACTIVE} nao e um ficheiro normal (um symlink?) — nada escrito; corrigir o alvo a mao.\n`);
    process.exit(1);
  }
  const tmp = `${destino}.${process.pid}.corrigir.tmp`;
  let criado = false;
  try {
    writeFileSync(tmp, texto, { flag: "wx" });
    criado = true;
    chmodSync(tmp, statSync(destino).mode); // o modo do original, e nao o do umask
    renameSync(tmp, destino);
  } catch (err) {
    // So apaga o temporario que ESTE processo criou: um `wx` que falhou por EEXIST e de outra corrida.
    if (criado) rmSync(tmp, { force: true });
    console.log(`\n  --corrigir: nao consegui gravar ${ACTIVE} (${err instanceof Error ? err.message : String(err)}) — ficou como estava.\n`);
    process.exit(1);
  }
  console.log(`\n  --corrigir: corrigidos ${avisos.length} aviso(s) de contagem em ${ACTIVE}; o calculo confirma-os.\n`);
  process.exit(0);
}

// --- Resumo final ---
console.log("");
console.log(`  Items: total ${g.total} | pendente ${g.pendente} | a fazer ${g["a fazer"]} | concluido ${g.concluido} | cancelado ${g.cancelado}`);
console.log(`  Progresso calculado: ${g.concluido}/${countable} (${expectedPct}%), ${expectedFilled}/20 blocos`);
console.log("");

if (g.total === 0 && warnings === 0) {
  // "Vazio" so se pode afirmar quando NADA avisou. Com avisos, zero items contados e
  // provavelmente um problema de leitura (seccoes renomeadas), nao um backlog vazio —
  // dizer "nada a validar" ali era desinformar sobre a propria falha.
  console.log("  Backlog vazio (template) — nada a validar.\n");
} else if (g.total === 0) {
  console.log(`WARNING: ${warnings} problema(s) e ZERO items contados — o backlog pode nao estar vazio, mas ilegivel. Corrigir antes de commit.\n`);
} else if (warnings === 0) {
  console.log("  OK — contadores (por seccao e Total), barra, esforcos e IDs consistentes.\n");
} else {
  console.log(`WARNING: ${warnings} divergencia(s). Corrigir antes de commit.\n`);
}

// Exit != 0 em caso de divergencia para poder funcionar como gate no CI.
process.exit(warnings > 0 ? 1 : 0);
