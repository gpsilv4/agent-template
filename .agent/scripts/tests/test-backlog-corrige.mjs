#!/usr/bin/env node
/**
 * Testes do `check-backlog.mjs --corrigir` (#431) — {{PROJECT_NAME}}
 *
 * O `--corrigir` ESCREVE num ficheiro do projeto, por isso o que se prova aqui e sobretudo o que ele NAO faz: nao
 * toca em nada alem dos contadores (byte a byte, numa fixture hostil: BOM, CRLF, uma celula a mais, um `\|`, o
 * negrito do Total), nao escreve nada quando algum aviso nao e uma contagem, nao escreve sem a flag, recusa um
 * argumento desconhecido, e uma escrita que falha deixa o original. E que o CI nunca o chama.
 *
 *   node .agent/scripts/tests/test-backlog-corrige.mjs
 */
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, lstatSync } from "fs";
import { join } from "path";
import { ACTIVE_OK, ARCHIVE_OK, BAR, sandbox, readF, writeF, run } from "./harness/test-backlog-harness.mjs";
import { ehDerivado } from "../lib/derivado.mjs";
import { leOuNull } from "../lib/ficheiros.mjs";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const A = ".agent/context/backlog.md";
const AR = ".agent/context/backlog-archive.md";
let passed = 0;
const falhas = [];

function caso(nome, fn) {
  const dir = sandbox();
  try {
    const problemas = fn(dir);
    if (problemas.length) {
      falhas.push(nome);
      console.log(`  FAIL  ${nome}`);
      for (const p of problemas) console.log(`          ${p}`);
    } else {
      passed++;
      console.log(`  PASS  ${nome}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A fixture HOSTIL: a valida com uma coluna a mais no Resumo, um `\|` numa descricao, e depois BOM e CRLF.
const BASE = ACTIVE_OK
  .replace("| Seccao | Total | Pendente | A Fazer | Concluido | Cancelado |", "| Seccao | Total | Pendente | A Fazer | Concluido | Cancelado | Nota |")
  .replace("|--------|-------|----------|---------|-----------|-----------|", "|--------|-------|----------|---------|-----------|-----------|------|")
  .replace(/^(\| (?:Bugs|Melhorias|Divida|Features|\*\*Total)[^\n]*\|)$/gm, "$1 extra 7 |")
  .replace("| B1 | Pendente | algo |", "| B1 | Pendente | a \\| b |");
const hostil = (t) => `﻿${t.replace(/\n/g, "\r\n")}`;
// Os contadores errados: uma linha do Resumo, o Total e a linha do Progresso (barra vazia, numeros a zero).
const errado = (t) =>
  t.replace("| Bugs / Violacoes de Regras | 3 | 1 | 1 | 1 | 0 |", "| Bugs / Violacoes de Regras | 9 | 9 | 9 | 9 | 9 |")
    .replace("| **Total** | **6** |", "| **Total** | **60** |")
    .replace(`\`${BAR}\` **40%** (2/5 concluidos)`, "`____________________` **0%** (0/0 concluidos)");
const CERTO = hostil(BASE);
const ERRADO = hostil(errado(BASE));

caso("os contadores errados reescrevem-se, e NADA mais muda (BOM, CRLF, celula a mais, \\|, negrito)", (dir) => {
  writeF(dir, A, ERRADO);
  const r = run(dir, undefined, ["--corrigir"]);
  const depois = readF(dir, A);
  const outra = run(dir);
  return [
    ...(r.code === 0 ? [] : [`--corrigir saiu ${r.code}: ${r.out.slice(-300)}`]),
    ...(depois === CERTO ? [] : ["o ficheiro corrigido nao e o certo byte a byte"]),
    ...(outra.code === 0 ? [] : ["depois de corrigido, o checker ainda avisa"]),
  ];
});

// Um aviso de uma REGRA (#445 PR 2) nao e uma contagem: com ele, o `--corrigir` nao reescreve nada, nem os contadores.
caso("com um aviso de uma regra (a Ordem) e um contador errado, nao reescreve nada", (dir) => {
  // As trocas sobre a BASE (LF), e o CRLF/BOM depois: sobre o `CERTO` (CRLF), um `\n` na troca nao casava, e o caso
  // testava so o contador. Cada troca tem de casar (um `replace` que nao casa e silencioso).
  const ORDEM = ["| 1 | B2 | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | B2 | outra coisa | M | — |\n| 1 | UX1 | melhorar algo | S | — |"];
  const TOTAL = ["| **Total** | **6** |", "| **Total** | **7** |"];
  const naoCasou = [ORDEM, TOTAL].filter(([de]) => !BASE.includes(de)).map(([de]) => `a fixture nao tem: ${de.slice(0, 40)}`);
  if (naoCasou.length) return naoCasou;
  const errado = hostil(BASE.replace(...ORDEM).replace(...TOTAL));
  writeF(dir, A, errado);
  const r = run(dir, undefined, ["--corrigir"]);
  return [...(r.code !== 0 ? [] : ["saiu 0 com um aviso de regra"]), ...(readF(dir, A) === errado ? [] : ["reescreveu com um aviso que nao e uma contagem"])];
});

caso("idempotente: um ficheiro consistente fica igual", (dir) => {
  writeF(dir, A, CERTO);
  const r = run(dir, undefined, ["--corrigir"]);
  return [...(r.code === 0 ? [] : [`saiu ${r.code}`]), ...(readF(dir, A) === CERTO ? [] : ["o ficheiro mudou"])];
});

// So no TEMPLATE (o seu backlog esta vazio de proposito): num derivado os contadores sao dados dele, e o CI ja os
// verifica pelo `check-backlog`; com o ficheiro em falta, nao ha nada a medir. Em ambos, SKIP com o nome.
const CONFIG_AREAS = ".agent/scripts/config/areas-do-backlog.mjs";
const NO_TEMPLATE = !ehDerivado((rel) => leOuNull(join(ROOT, rel))) && existsSync(join(ROOT, A)) && existsSync(join(ROOT, AR));
if (!NO_TEMPLATE) console.log("  SKIP  o backlog.md real do template (num derivado, ou sem o ficheiro)");
if (NO_TEMPLATE) caso("o backlog.md e o arquivo REAIS do template (placeholders, zeros) ficam iguais", (dir) => {
  const real = readFileSync(join(ROOT, A), "utf8");
  writeF(dir, A, real);
  writeF(dir, AR, readFileSync(join(ROOT, AR), "utf8"));
  // O backlog do template tem a coluna Area (#465): com ela e sem a lista, o `check-backlog` avisava. A sandbox leva a
  // lista REAL do template (so aqui, e so no template: nenhum outro caso fica preso a `config/` real).
  writeF(dir, CONFIG_AREAS, readFileSync(join(ROOT, CONFIG_AREAS), "utf8"));
  const r = run(dir, undefined, ["--corrigir"]);
  return [...(r.code === 0 ? [] : [`saiu ${r.code}: ${r.out}`]), ...(readF(dir, A) === real ? [] : ["o ficheiro mudou"])];
});

caso("um merge que juntou uma linha SEM conflito (o Total ficou o antigo) corrige-se pelos numeros certos", (dir) => {
  writeF(dir, A, ACTIVE_OK.replace("| B2 | A Fazer | outra coisa | b.ts | Alta | M | Y |", "| B2 | A Fazer | outra coisa | b.ts | Alta | M | Y |\n| B4 | Pendente | do outro PR | c.ts | Baixa | S | W |"));
  const r = run(dir, undefined, ["--corrigir"]);
  const t = readF(dir, A);
  return [
    ...(r.code === 0 ? [] : [`saiu ${r.code}`]),
    ...(t.includes("| Bugs / Violacoes de Regras | 4 | 2 | 1 | 1 | 0 |") ? [] : ["a linha dos Bugs nao ficou 4/2/1/1/0"]),
    ...(t.includes("| **Total** | **7** | **3** | **1** | **2** | **1** |") ? [] : ["o Total nao ficou 7/3/1/2/1"]),
    ...(t.includes("`███████_____________` **33%** (2/6 concluidos)") ? [] : ["a linha do Progresso nao ficou 7 blocos, 33%, 2/6"]),
  ];
});

caso("uma barra `🟩`/`⬜` corrige-se com o MESMO par de glifos", (dir) => {
  const verde = (n) => "\ud83d\udfe9".repeat(n) + "\u2b1c".repeat(20 - n);
  writeF(dir, A, ACTIVE_OK.replace(`\`${BAR}\` **40%** (2/5 concluidos)`, `\`${verde(3)}\` **15%** (1/5 concluidos)`));
  const r = run(dir, undefined, ["--corrigir"]);
  return [
    ...(r.code === 0 ? [] : [`saiu ${r.code}`]),
    ...(readF(dir, A).includes(`\`${verde(8)}\` **40%** (2/5 concluidos)`) ? [] : ["a barra nao ficou 8 `🟩` e 12 `⬜`"]),
  ];
});

// Cada aviso que NAO e uma contagem: zero bytes escritos e exit != 0, mesmo com contadores errados ao lado.
for (const [nome, prepara] of [
  // Dentro do Historico (o fim do ficheiro e a tabela dos sprints fechados, que nao se conta).
  ["um ID duplicado", (dir) => writeF(dir, AR, ARCHIVE_OK.replace("| T1 | Tecnica |", "| B1 | Bug | repetido | Concluido | S1 | v0.1.0 | 2026-01-01 |\n| T1 | Tecnica |"))],
  ["o arquivo em falta", (dir) => rmSync(join(dir, AR))],
  ["o cabecalho de uma seccao em falta", (dir) => writeF(dir, A, readF(dir, A).replace("## 2. Melhorias UX", "## 2. Outra Coisa"))],
  ["um estado desconhecido", (dir) => writeF(dir, A, readF(dir, A).replace("| UX1 | Pendente |", "| UX1 | Talvez |"))],
  ["um tipo desconhecido no arquivo", (dir) => writeF(dir, AR, ARCHIVE_OK.replace("| T1 | Tecnica |", "| T1 | Coisa |"))],
  ["uma celula do Resumo que nao e um numero", (dir) => writeF(dir, A, readF(dir, A).replace("| Melhorias UX | 1 |", "| Melhorias UX | ? |"))],
  ["um glifo da barra desconhecido", (dir) => writeF(dir, A, readF(dir, A).replace("`____________________`", "`x___________________`"))],
  ["uma barra com outra largura", (dir) => writeF(dir, A, readF(dir, A).replace("`____________________`", "`_____________________`"))],
]) {
  caso(`com ${nome}, --corrigir nao escreve nada e sai != 0`, (dir) => {
    writeF(dir, A, errado(ACTIVE_OK));
    prepara(dir);
    const antes = readF(dir, A);
    const r = run(dir, undefined, ["--corrigir"]);
    return [
      ...(r.code !== 0 ? [] : ["saiu 0"]),
      ...(readF(dir, A) === antes ? [] : ["o ficheiro mudou"]),
      // A RAZAO, e nao so o "nada escrito": a confirmacao pelo calculo tambem recusava, e com a recusa do modulo
      // desligada o caso passava pela razao errada (a varredura dava-a por sobrevivente).
      ...(r.out.includes("ha avisos que nao sao contagens") ? [] : ["nao disse que ha avisos que nao sao contagens"]),
    ];
  });
}

// As duas recusas do proprio modulo, cada uma pela sua mensagem.
for (const [nome, prepara, razao] of [
  ["uma linha do Resumo sem o `|` final", (dir) => writeF(dir, A, errado(ACTIVE_OK).replace("| Bugs / Violacoes de Regras | 9 | 9 | 9 | 9 | 9 |", "| Bugs / Violacoes de Regras | 9 | 9 | 9 | 9 | 9")), "nao consegui reescrever a linha"],
  ["uma barra so de um glifo vazio sem par conhecido (`·`)", (dir) => writeF(dir, A, errado(ACTIVE_OK).replace("`____________________`", "`\u00b7".padEnd(21, "\u00b7") + "`")), "nao sei que par de glifos escrever"],
]) {
  caso(`com ${nome}, --corrigir nao escreve nada e diz porque`, (dir) => {
    prepara(dir);
    const antes = readF(dir, A);
    const r = run(dir, undefined, ["--corrigir"]);
    return [
      ...(r.code !== 0 ? [] : ["saiu 0"]),
      ...(readF(dir, A) === antes ? [] : ["o ficheiro mudou"]),
      ...(r.out.includes(razao) ? [] : [`nao disse "${razao}"`]),
    ];
  });
}

caso("sem --corrigir, os contadores errados avisam e o ficheiro fica intacto", (dir) => {
  writeF(dir, A, ERRADO);
  const r = run(dir);
  return [...(r.code === 1 ? [] : [`saiu ${r.code}`]), ...(readF(dir, A) === ERRADO ? [] : ["o ficheiro mudou"])];
});

caso("um argumento desconhecido (--fix, --corrigirr) recusa-se, sem tocar no ficheiro", (dir) => {
  writeF(dir, A, ERRADO);
  const [a, b] = [run(dir, undefined, ["--fix"]), run(dir, undefined, ["--corrigirr"])];
  return [
    ...(a.code === 2 && b.code === 2 ? [] : [`sairam ${a.code}/${b.code}, esperado 2`]),
    ...(readF(dir, A) === ERRADO ? [] : ["o ficheiro mudou"]),
  ];
});

caso("um symlink no lugar do backlog.md: nada escrito, e o link e o alvo ficam como estavam", (dir) => {
  writeF(dir, ".agent/context/alvo.md", ERRADO);
  rmSync(join(dir, A));
  symlinkSync("alvo.md", join(dir, A));
  const r = run(dir, undefined, ["--corrigir"]);
  return [
    ...(r.code !== 0 ? [] : ["saiu 0"]),
    ...(lstatSync(join(dir, A)).isSymbolicLink() ? [] : ["o link passou a ficheiro"]),
    ...(readF(dir, ".agent/context/alvo.md") === ERRADO ? [] : ["o alvo mudou"]),
  ];
});

caso("o ficheiro corrigido mantem o modo do original, e chega por rename (outro inode, nenhum temporario)", (dir) => {
  writeF(dir, A, ERRADO);
  chmodSync(join(dir, A), 0o640);
  const inode = statSync(join(dir, A)).ino;
  const r = run(dir, undefined, ["--corrigir"]);
  const modo = statSync(join(dir, A)).mode & 0o777;
  return [
    ...(r.code === 0 ? [] : [`saiu ${r.code}`]),
    ...(modo === 0o640 ? [] : [`modo ${modo.toString(8)}, esperado 640`]),
    // Uma escrita direta por cima mantinha o inode: um processo morto a meio deixava o backlog meio escrito.
    ...(statSync(join(dir, A)).ino !== inode ? [] : ["o mesmo inode: foi escrito por cima, e nao por rename"]),
    ...(readdirSync(join(dir, ".agent/context")).some((n) => n.endsWith(".tmp")) ? ["ficou um temporario"] : []),
  ];
});

caso("com duas linhas Total (um merge que a duplicou), so a primeira se corrige: e a que o calculo verifica", (dir) => {
  writeF(dir, A, errado(ACTIVE_OK).replace("| **Total** | **60** |", "| **Total** | **60** |").replace("| **Total** |", "| **Total** | **1** | **1** | **1** | **1** | **1** |\n| **Total** |"));
  const antes = readF(dir, A);
  const r = run(dir, undefined, ["--corrigir"]);
  const t = readF(dir, A);
  // A primeira (a inserida, a 1/1/1/1/1) e a que o calculo verifica: corrige-se. A segunda (a original, a 60) fica.
  return [
    ...(r.code === 0 && t !== antes ? [] : [`exit ${r.code}, mudou: ${t !== antes}`]),
    ...(t.includes("| **Total** | **60** |") ? [] : ["a segunda linha Total foi reescrita"]),
    ...(t.includes("| **Total** | **6** | **2** | **1** | **2** | **1** |") ? [] : ["a primeira linha Total nao ficou 6/2/1/2/1"]),
  ];
});

// Como root, o `chmod` nao impede a escrita: o caso mediria outra coisa.
if (process.getuid?.() === 0) console.log("  SKIP  a escrita que falha (root ignora as permissoes)");
else caso("uma escrita que falha deixa o original, e nenhum temporario", (dir) => {
  writeF(dir, A, ERRADO);
  const pasta = join(dir, ".agent/context");
  chmodSync(pasta, 0o555);
  let r;
  try {
    r = run(dir, undefined, ["--corrigir"]);
  } finally {
    chmodSync(pasta, 0o755);
  }
  return [
    ...(r.code !== 0 ? [] : ["saiu 0"]),
    ...(readF(dir, A) === ERRADO ? [] : ["o original mudou"]),
    ...(readdirSync(pasta).some((n) => n.endsWith(".tmp")) ? ["ficou um temporario"] : []),
  ];
});

// A Area (#465), pelo CLI: a lista carrega-se da `config/` da sandbox, que cada caso escreve (nunca a real).
const CFG = ".agent/scripts/config/areas-do-backlog.mjs";
const comArea = (t) =>
  t.replace("| ID | Estado | Problema | Ficheiro(s) |", "| ID | Estado | Problema | Area | Ficheiro(s) |")
    .replace("|----|--------|---------|-------------|", "|----|--------|---------|------|-------------|")
    .replace("| B1 | Pendente | algo | a.ts |", "| B1 | Pendente | algo | seguranca | a.ts |")
    .replace("| B2 | A Fazer | outra coisa | b.ts |", "| B2 | A Fazer | outra coisa | | b.ts |");
caso("Area: com a coluna e SEM a lista, o check-backlog sai 1 e o --corrigir nao escreve", (dir) => {
  const t = errado(comArea(ACTIVE_OK));
  writeF(dir, A, t);
  const r = run(dir, undefined, ["--corrigir"]);
  return [
    ...(t.includes("| seguranca |") ? [] : ["a fixture nao ganhou a coluna"]),
    ...(r.code === 1 && r.out.includes("falta .agent/scripts/config/areas-do-backlog.mjs") ? [] : [`${r.code}: ${r.out.slice(-300)}`]),
    ...(readF(dir, A) === t ? [] : ["escreveu"]),
  ];
});
caso("Area: com a coluna, COM a lista e os contadores errados, o --corrigir escreve e sai 0 (as duas chamadas do calcula levam a lista)", (dir) => {
  writeF(dir, A, errado(comArea(ACTIVE_OK)));
  writeF(dir, CFG, 'export const AREAS = { seguranca: "x" };\n');
  const r = run(dir, undefined, ["--corrigir"]);
  return [...(r.code === 0 ? [] : [`saiu ${r.code}: ${r.out.slice(-300)}`]), ...(readF(dir, A) === comArea(ACTIVE_OK) ? [] : ["o texto corrigido nao e o valido"])];
});
caso("Area: com a lista PARTIDA, sai 2 e nomeia o ficheiro, mesmo com o backlog vazio (a lista carrega-se antes)", (dir) => {
  writeF(dir, CFG, "export const AREAS = {\n");
  const cheio = run(dir);
  writeF(dir, A, "  \n");
  const vazio = run(dir);
  const ok = (r) => r.code === 2 && r.out.includes("check-backlog: .agent/scripts/config/areas-do-backlog.mjs nao se le");
  return [...(ok(cheio) ? [] : [`cheio: ${cheio.code}: ${cheio.out.slice(-200)}`]), ...(ok(vazio) ? [] : [`vazio: ${vazio.code}: ${vazio.out.slice(-200)}`])];
});

caso("o CI nunca chama o check-backlog com --corrigir", () => {
  const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  const linhas = ci.split("\n").filter((l) => /check-backlog\.mjs/.test(l));
  return [...(linhas.length ? [] : ["o ci.yml ja nao chama o check-backlog: o caso deixou de medir"]), ...linhas.filter((l) => /--corrigir/.test(l)).map((l) => `o CI escreve: ${l.trim()}`)];
});

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
if (!existsSync(join(ROOT, A))) console.log("  (o backlog.md do repo nao existe — o caso do template real nao mediu)");
process.exit(falhas.length ? 1 : 0);
