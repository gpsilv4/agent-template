/**
 * Testes das REGRAS do backlog (`lib/backlog-regras.mjs`, #445 PR 2) — {{PROJECT_NAME}}
 *
 * Cada regra com um caso que avisa e um controlo que nao avisa. A base e a fixture VALIDA do `test-backlog`
 * (`ACTIVE_OK`/`ARCHIVE_OK`), que nao da nenhuma regra: cada caso reescreve-a num sitio, e afirma que o texto MUDOU
 * (um `replace` que nao casa e silencioso, e o caso deixava de testar o que diz).
 */
import { ACTIVE_OK, ARCHIVE_OK } from "./harness/test-backlog-harness.mjs";
import { leBacklog } from "../lib/backlog-itens.mjs";
import { regrasDoBacklog } from "../lib/backlog-regras.mjs";
import { calcula } from "../lib/backlog-calculo.mjs";
import { carregaAreas } from "../lib/backlog-areas.mjs";
import { leAreas } from "../lib/backlog-celulas.mjs";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

let passed = 0;
const falhas = [];
function caso(nome, fn) {
  try {
    const erros = fn();
    if (erros.length) throw new Error(erros.join("\n          "));
    passed++;
    console.log(`  PASS  ${nome}`);
  } catch (err) {
    falhas.push(nome);
    console.log(`  FAIL  ${nome}\n          ${err instanceof Error ? err.message : String(err)}`);
  }
}

const NOMES = { ACTIVE: "backlog.md", ARCHIVE: "backlog-archive.md" };
const regras = (ativo, arquivo = ARCHIVE_OK) => regrasDoBacklog(leBacklog(ativo, arquivo), NOMES);

/** O texto com cada `[de, para]` trocado, e os `de` que NAO casaram (um caso que nao muda nada nao testa nada). */
function troca(texto, pares) {
  let t = texto;
  const naoCasou = [];
  for (const [de, para] of pares) {
    if (!t.includes(de)) naoCasou.push(de.slice(0, 50));
    t = t.replace(de, para);
  }
  return { t, naoCasou };
}

/** As mensagens das regras devem conter cada `inclui`, e mais nenhuma alem delas (`soEstas`). */
function avisa({ ativo = [], arquivo = [] }, inclui, { soEstas = true } = {}) {
  const a = troca(ACTIVE_OK, ativo);
  const r = troca(ARCHIVE_OK, arquivo);
  const msgs = regras(a.t, r.t);
  const erros = [...a.naoCasou, ...r.naoCasou].map((d) => `a fixture nao tem: ${JSON.stringify(d)}`);
  for (const frase of inclui) if (!msgs.some((m) => m.includes(frase))) erros.push(`faltou: ${frase}\n            tenho: ${JSON.stringify(msgs)}`);
  if (soEstas && msgs.length !== inclui.length) erros.push(`esperava ${inclui.length} aviso(s), tenho ${msgs.length}: ${JSON.stringify(msgs)}`);
  return erros;
}
const calado = (o) => avisa(o, []);

// O bloco da fixture valida, para os casos o reescreverem.
const BLOCO = "| 1 | B2 | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |";
const blocoCom = (linhas) => [[BLOCO, linhas]];

console.log("\n  A base\n");
caso("a fixture valida nao da nenhuma regra (o controlo de todas)", () => calado({}));

console.log("\n  1) O Historico\n");
caso("sem o heading do Historico: um aviso", () => avisa({ arquivo: [["## Historico (Fechados)", "## Fechados"]] }, ["nao encontrei o heading `## Historico`"]));
caso("sem a coluna Estado: um aviso so, e o calcula nao avisa linha a linha (sem cascata)", () => {
  const erros = avisa({ arquivo: [["| ID | Tipo | Descricao | Estado |", "| ID | Tipo | Descricao | Status |"]] }, ["o Historico nao tem a coluna `estado`"]);
  const arq = troca(ARCHIVE_OK, [["| ID | Tipo | Descricao | Estado |", "| ID | Tipo | Descricao | Status |"]]).t;
  // Nem um aviso por linha, nem os do Resumo/Total/barra (os fechados nao se contaram: o Resumo esta certo).
  const ruido = calcula(ACTIVE_OK, arq, NOMES).avisos.filter((a) => /Estado invalido|escrito \[|Progresso:|Barra:/.test(a.msg));
  return [...erros, ...(ruido.length ? [`a cascata voltou: ${JSON.stringify(ruido.map((a) => a.msg))}`] : [])];
});
caso("o Historico pelo NOME: uma coluna a mais antes do Estado nao muda nada (nem nas regras, nem no calcula)", () => {
  const pares = [["| ID | Tipo | Descricao | Estado |", "| ID | Tipo | Descricao | Nota | Estado |"], ["|----|------|-----------|--------|", "|----|------|-----------|------|--------|"], ["| B3 | Bug | bug fechado | Concluido |", "| B3 | Bug | bug fechado | x | Concluido |"], ["| T1 | Tecnica | divida paga | Concluido |", "| T1 | Tecnica | divida paga | x | Concluido |"], ["| F1 | Feature | feature abandonada | Cancelado |", "| F1 | Feature | feature abandonada | x | Cancelado |"]];
  // Por posicao, o Estado seria a coluna `Nota` ("x"): o calcula dava "Estado invalido" em cada linha.
  const doCalcula = calcula(ACTIVE_OK, troca(ARCHIVE_OK, pares).t, NOMES).avisos.filter((a) => /Estado invalido|Tipo desconhecido/.test(a.msg));
  return [...calado({ arquivo: pares }), ...(doCalcula.length ? [`o calcula leu por posicao: ${JSON.stringify(doCalcula.map((a) => a.msg))}`] : [])];
});

console.log("\n  2) O que parece um bloco\n");
caso("uma tabela com Ordem e sem ID avisa", () => avisa({ ativo: [["| Ordem | ID | Descricao | Esforco | Depende de |", "| Ordem | Ticket | Descricao | Esforco | Depende de |"]] }, ["tem a coluna Ordem e nao tem ID"]));
caso("um `Sprint` com ID e sem Ordem avisa", () => avisa({ ativo: [["| Ordem | ID | Descricao | Esforco | Depende de |", "| Seq | ID | Descricao | Esforco | Depende de |"]] }, ["tem uma tabela com ID e sem a coluna Ordem"]));
caso("um bloco com outro titulo e um bloco (o cabecalho decide), e as regras valem nele", () =>
  avisa({ ativo: [["### Sprint 2 — o que esta aberto", "### Leitura e escrita"], ...blocoCom("| 1 | B2 | outra coisa | M | ZZ9 |")] }, ['"Leitura e escrita": B2 depende de ZZ9']));

console.log("\n  3) A Ordem\n");
caso("uma Ordem que nao e um numero avisa", () => avisa({ ativo: blocoCom("| — | B2 | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |") }, ["a Ordem de B2 (\"—\") nao e um numero"]));
caso("uma Ordem repetida avisa", () => avisa({ ativo: blocoCom("| 1 | B2 | outra coisa | M | — |\n| 1 | UX1 | melhorar algo | S | B2 |") }, ["a Ordem 1 repete-se (UX1)"]));
// Com a dependencia: se a Ordem invalida nao desligasse a comparacao no bloco, saia tambem "Ordem igual ou maior".
caso("uma Ordem que desce avisa, e so isso (sem cascata)", () => avisa({ ativo: blocoCom("| 2 | B2 | outra coisa | M | — |\n| 1 | UX1 | melhorar algo | S | B2 |") }, ["a Ordem nao cresce em UX1 (1 depois de 2)"]));
caso("CONTROLO: uma Ordem com enfase (`**1**`) e um numero", () => calado({ ativo: blocoCom("| **1** | B2 | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |") }));
caso("CONTROLO: um bloco com uma coluna ANTES da Ordem (o cabecalho nao e uma linha)", () =>
  calado({ ativo: [["| Ordem | ID | Descricao | Esforco | Depende de |\n|-------|-----|-----------|---------|------------|\n" + BLOCO, "| Prioridade | Ordem | ID | Descricao | Esforco | Depende de |\n|---|---|---|---|---|---|\n| Alta | 1 | B2 | outra coisa | M | — |\n| | 2 | UX1 | melhorar algo | S | B2 |"]] }));
caso("CONTROLO: um salto e permitido (fechar tira a linha)", () => calado({ ativo: blocoCom("| 2 | B2 | outra coisa | M | — |\n| 5 | UX1 | melhorar algo | S | B2 |") }));
caso("uma linha de bloco com conteudo e sem ID avisa", () => avisa({ ativo: blocoCom(`${BLOCO}\n| 3 |  | uma linha sem ID | S | — |`) }, ["linha 3: tem conteudo e nao tem ID"]));

console.log("\n  4) O Depende de\n");
caso("de si proprio", () => avisa({ ativo: blocoCom("| 1 | B2 | outra coisa | M | B2 |\n| 2 | UX1 | melhorar algo | S | B2 |") }, ["B2 depende de si proprio"]));
caso("de um ID que nao existe", () => avisa({ ativo: blocoCom("| 1 | B2 | outra coisa | M | ZZ9 |\n| 2 | UX1 | melhorar algo | S | B2 |") }, ["B2 depende de ZZ9, que nao esta em nenhuma tabela por tipo nem no Historico"]));
caso("de um aberto com Ordem igual ou maior no mesmo bloco", () => avisa({ ativo: blocoCom("| 1 | B2 | outra coisa | M | UX1 |\n| 2 | UX1 | melhorar algo | S | — |") }, ["B2 depende de UX1, que tem uma Ordem igual ou maior"]));
caso("de um aberto num bloco que vem DEPOIS", () =>
  avisa({ ativo: [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B1 |"], ["## Pendentes sem Sprint", "### Sprint 3\n\n| Ordem | ID | Descricao |\n|---|---|---|\n| 1 | B1 | algo |\n\n## Pendentes sem Sprint"]] }, ["UX1 depende de B1, que esta num bloco que vem DEPOIS"]));
caso("de um aberto nos Pendentes", () =>
  avisa({ ativo: [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B1 |"], ["|----|-----------|---------|------|\n| | | | |", "|----|-----------|---------|------|\n| B1 | algo | S | precisa de dados |"]] }, ["UX1 depende de B1, que esta nos Pendentes"]));
caso("de um aberto que nao esta em bloco nenhum nem nos Pendentes (o orfao)", () =>
  avisa({ ativo: [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B1 |"]] }, ["UX1 depende de B1, que esta aberto e nao esta em nenhum bloco"]));
caso("CONTROLO: de um ID que so esta num bloco nao repete (o calcula ja diz que nao existe nas tabelas)", () => {
  const ativo = troca(ACTIVE_OK, blocoCom("| 1 | B2 | outra coisa | M | — |\n| 2 | ZZ8 | so no bloco | S | — |\n| 3 | UX1 | melhorar algo | S | ZZ8 |")).t;
  const msgs = regras(ativo).filter((m) => m.includes("ZZ8"));
  return msgs.length ? [`repetiu: ${JSON.stringify(msgs)}`] : [];
});
caso("de um ticket riscado num bloco: pelo ID limpo (esta planeado ali, e a regra 6 diz o riscado)", () =>
  avisa({ ativo: blocoCom("| 1 | ~~B2~~ | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |") }, ["a linha de B2 esta riscada"]));
caso("uma coluna de dependencias com outro nome avisa (senao a regra desligava-se calada)", () =>
  avisa({ ativo: [["| Ordem | ID | Descricao | Esforco | Depende de |", "| Ordem | ID | Descricao | Esforco | Dependencias |"]] }, ['a coluna "dependencias" nao e lida']));
caso("CONTROLO: de um aberto num bloco ANTERIOR nao avisa", () =>
  calado({ ativo: [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B1 |"], ["### Sprint 2 — o que esta aberto", "### Sprint 1\n\n| Ordem | ID | Descricao |\n|---|---|---|\n| 1 | B1 | algo |\n\n### Sprint 2 — o que esta aberto"]] }));
caso("CONTROLO: de um fechado (no Historico) nao avisa", () => calado({ ativo: [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B2, B3 |"]] }));
caso("CONTROLO: um ID depois de `Bloqueado:` nao e dependencia", () => calado({ ativo: [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B2; Bloqueado: espera pelo ZZ9 |"]] }));
caso("com a Ordem invalida, o 'nao existe' corre na mesma (sem cascata da comparacao no bloco)", () =>
  avisa({ ativo: blocoCom("| — | B2 | outra coisa | M | UX1 |\n| 2 | UX1 | melhorar algo | S | ZZ9 |") }, ["a Ordem de B2 (\"—\") nao e um numero", "UX1 depende de ZZ9, que nao esta em nenhuma tabela por tipo"]));

console.log("\n  5) A rede do arquivo\n");
caso("um ID numa tabela fora do Historico que nao esta no Historico avisa", () =>
  avisa({ arquivo: [["## Sprints Fechados (Indice)", "## Sprint 1 (fechado)\n\n| ID | Descricao |\n|---|---|\n| B3 | esta |\n| B9 | nao esta |\n\n## Sprints Fechados (Indice)"]] }, ['"Sprint 1 (fechado)" cita B9, que nao esta no Historico']));
caso("CONTROLO: o indice de sprints (sem coluna ID) nao da IDs", () => calado({ arquivo: [["| S1 | primeiro | v0.1.0 |", "| S1 | primeiro | v0.1.0 |\n| S2 | outro | v0.2.0 |"]] }));

console.log("\n  6) As linhas riscadas\n");
caso("num bloco", () => avisa({ ativo: blocoCom("| 1 | ~~B2~~ | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | — |") }, ['"Sprint 2 — o que esta aberto": a linha de B2 esta riscada']));
caso("nos Pendentes", () => avisa({ ativo: [["|----|-----------|---------|------|\n| | | | |", "|----|-----------|---------|------|\n| ~~UX1~~ | x | S | y |"]] }, ["Pendentes sem Sprint: a linha de UX1 esta riscada"]));
caso("numa tabela por tipo com um Estado aberto", () => avisa({ ativo: [["| B1 | Pendente | algo |", "| ~~B1~~ | Pendente | algo |"]] }, ["Bugs: a linha de B1 esta riscada"]));
caso("CONTROLO: numa tabela por tipo com um Estado fechado nao repete (o calcula ja avisa)", () => {
  const ativo = troca(ACTIVE_OK, [["| B1 | Pendente | algo |", "| ~~B1~~ | Concluido | algo |"]]).t;
  const msgs = regras(ativo).filter((m) => m.includes("riscada"));
  return msgs.length ? [`repetiu: ${JSON.stringify(msgs)}`] : [];
});

console.log("\n  7) Os Pendentes\n");
caso("sem o heading avisa", () => avisa({ ativo: [["## Pendentes sem Sprint", "## Parqueados"]] }, ["nao encontrei o heading `## Pendentes sem Sprint`"]));
caso("sem a coluna Nota avisa (renomeia-se)", () => avisa({ ativo: [["| ID | Descricao | Esforco | Nota |", "| ID | Descricao | Esforco | Porque esta parqueado |"]] }, ["nao tem a coluna `Nota`"]));
caso("o heading sem tabela avisa como tal (e nao como uma coluna em falta)", () =>
  avisa({ ativo: [["## Pendentes sem Sprint\n\n| ID | Descricao | Esforco | Nota |\n|----|-----------|---------|------|\n| | | | |", "## Pendentes sem Sprint\n\n(nenhum)"]] }, ["o heading dos Pendentes sem Sprint nao tem tabela"]));
caso("CONTROLO: o heading e tolerante (um emoji, `Pendente (sem sprint)`, numerado, `###`)", () => [
  ...calado({ ativo: [["## Pendentes sem Sprint", "## 5. Pendentes sem Sprint"]] }),
  ...calado({ ativo: [["## Pendentes sem Sprint", "### Pendentes sem Sprint"]] }),
  ...calado({ ativo: [["## Pendentes sem Sprint", "## 📌 Pendentes sem Sprint"]] }),
  ...calado({ ativo: [["## Pendentes sem Sprint", "## Pendente (sem sprint)"]] }),
]);

console.log("\n  8) A Area (#465)\n");
// A tabela dos Bugs da fixture, com a coluna Area depois da descricao (a 4.a); a lista e INJETADA (nenhum caso le a
// `config/` real, que cada projeto adapta).
const LISTA = { seguranca: "x", dados: "y" };
const comArea = (b1, b2, { nome = "Area", antes = false } = {}) => {
  const cab = antes ? `| ID | Estado | ${nome} | Problema | Ficheiro(s) |` : `| ID | Estado | Problema | ${nome} | Ficheiro(s) |`;
  const l1 = antes ? `| B1 | Pendente | ${b1} | algo | a.ts |` : `| B1 | Pendente | algo | ${b1} | a.ts |`;
  const l2 = antes ? `| B2 | A Fazer | ${b2} | outra coisa | b.ts |` : `| B2 | A Fazer | outra coisa | ${b2} | b.ts |`;
  return troca(ACTIVE_OK, [
    ["| ID | Estado | Problema | Ficheiro(s) |", cab],
    ["|----|--------|---------|-------------|", "|----|--------|---------|------|-------------|"],
    ["| B1 | Pendente | algo | a.ts |", l1],
    ["| B2 | A Fazer | outra coisa | b.ts |", l2],
  ]);
};
/** As mensagens da Area (a 3.a forma de chamar: `areas` omitido, para o caso do `undefined`). */
const daArea = (ativo, ...opcoes) => regrasDoBacklog(leBacklog(ativo, ARCHIVE_OK), NOMES, ...opcoes);
function areaAvisa(fixture, areas, inclui) {
  const msgs = areas === "omitido" ? daArea(fixture.t) : daArea(fixture.t, { areas });
  const erros = fixture.naoCasou.map((d) => `a fixture nao tem: ${JSON.stringify(d)}`);
  for (const frase of inclui) if (!msgs.some((m) => m.includes(frase))) erros.push(`faltou: ${frase}\n            tenho: ${JSON.stringify(msgs)}`);
  if (msgs.length !== inclui.length) erros.push(`esperava ${inclui.length} aviso(s), tenho ${msgs.length}: ${JSON.stringify(msgs)}`);
  return erros;
}

caso("(a) um valor da lista nao avisa; um fora dela avisa, e a mensagem nomeia-o e diz as duas saidas", () => [
  ...areaAvisa(comArea("seguranca", "dados"), LISTA, []),
  ...areaAvisa(comArea("seguransa", "dados"), LISTA, ['B1 tem a Area "seguransa", que nao esta na lista — acrescenta-la a .agent/scripts/config/areas-do-backlog.mjs, ou renomear a coluna']),
]);
caso("(a) pelo norm: `Segurança` e `**seguranca**` casam `seguranca`, e uma CHAVE `Segurança` casa `seguranca`", () => [
  ...areaAvisa(comArea("Segurança", "**seguranca**"), LISTA, []),
  ...areaAvisa(comArea("seguranca", "dados"), { "Segurança": "x", dados: "y" }, []),
]);
caso("(a) varias areas por virgula: `seguranca, dados` da duas e nenhum aviso; `seguranca, seguransa` da UM", () => [
  ...areaAvisa(comArea("seguranca, dados", "—"), LISTA, []),
  ...areaAvisa(comArea("seguranca, seguransa", "—"), LISTA, ['"seguransa"']),
  ...(JSON.stringify(leAreas("Segurança, dados")) === JSON.stringify([{ chave: "seguranca", rotulo: "Segurança" }, { chave: "dados", rotulo: "dados" }]) ? [] : [`leAreas: ${JSON.stringify(leAreas("Segurança, dados"))}`]),
]);
caso("(a) o vazio escrito (`—`, `–`, `?`, `n/a`, `**N/A**`) e um fragmento vazio (`seguranca,`) nao contam", () => [
  ...["—", "–", "?", "n/a", "**N/A**", ""].flatMap((v) => areaAvisa(comArea(v, "seguranca,"), LISTA, [])),
  ...(leAreas("seguranca,").length === 1 ? [] : [`seguranca, deu ${leAreas("seguranca,").length} areas`]),
  // CONTROLO: um valor que nao e o vazio escrito avisa (o filtro nao engole tudo).
  ...areaAvisa(comArea("x", "—"), LISTA, ['"x"']),
]);
caso("(b) a Area antes da descricao (a 3.a coluna) avisa; depois dela (a 4.a), nao", () => [
  ...areaAvisa(comArea("seguranca", "dados", { antes: true }), LISTA, ["Bugs: a coluna Area esta antes da descricao"]),
  ...areaAvisa(comArea("seguranca", "dados"), LISTA, []),
]);
caso("(b) a Area na 2.a coluna: a regra avisa, e o Estado partido tambem (o calcula)", () => {
  const f = troca(ACTIVE_OK, [
    ["| ID | Estado | Problema | Ficheiro(s) |", "| ID | Area | Estado | Problema | Ficheiro(s) |"],
    ["|----|--------|---------|-------------|", "|----|------|--------|---------|-------------|"],
    ["| B1 | Pendente | algo | a.ts |", "| B1 | dados | Pendente | algo | a.ts |"],
  ]);
  const avisos = calcula(f.t, ARCHIVE_OK, NOMES, { areas: LISTA }).avisos.map((a) => a.msg);
  return [
    ...f.naoCasou.map((d) => `a fixture nao tem: ${d}`),
    ...(avisos.some((m) => m.includes("a coluna Area esta antes da descricao")) ? [] : ["sem o aviso da posicao"]),
    ...(avisos.some((m) => m.includes('"B1" tem Estado desconhecido ("dados")')) ? [] : [`sem o Estado partido: ${JSON.stringify(avisos)}`]),
  ];
});
caso("(c) a coluna sem a lista da UM aviso (com `null` e com `areas` omitido); com a lista, ou sem a coluna, nenhum", () => [
  ...areaAvisa(comArea("seguranca", "x"), null, ["falta .agent/scripts/config/areas-do-backlog.mjs — os valores da Area nao foram verificados"]),
  ...areaAvisa(comArea("seguranca", "x"), "omitido", ["falta .agent/scripts/config/areas-do-backlog.mjs"]),
  ...areaAvisa(comArea("seguranca", "dados"), LISTA, []),
  ...areaAvisa({ t: ACTIVE_OK, naoCasou: [] }, null, []),
]);
caso("(d) `Areas` e `Área` leem-se (o valor fora da lista avisa); `Tags`, `Etiquetas` e `Area(s)` avisam que nao se leem", () => [
  ...areaAvisa(comArea("seguransa", "dados", { nome: "Areas" }), LISTA, ['"seguransa"']),
  ...areaAvisa(comArea("seguransa", "dados", { nome: "Área" }), LISTA, ['"seguransa"']),
  ...["Tags", "Etiquetas", "Area(s)"].flatMap((n) => areaAvisa(comArea("seguransa", "dados", { nome: n }), LISTA, [`Bugs: a coluna "${n.toLowerCase()}" nao e lida — chamar-lhe \`Area\``])),
]);
caso("CONTROLO (d): uma coluna `Area afetada` (outro sentido) nem se le nem avisa", () => areaAvisa(comArea("seguransa", "dados", { nome: "Area afetada" }), LISTA, []));
// Decidido (leitura independente do PR 1): com uma `Area` verdadeira, uma `Tags` ao lado e outra coluna do projeto, e o
// "chamar-lhe Area" seria um conselho errado. So se avisa a parecida quando NAO ha a verdadeira.
caso("(d) com uma Area verdadeira, uma `Tags` ao lado nao avisa (e outra coluna); a Area le-se", () =>
  areaAvisa(troca(comArea("seguransa", "dados").t, [["| Problema | Area |", "| Problema | Area | Tags |"], ["|---------|------|", "|---------|------|-----|"], ["| algo | seguransa |", "| algo | seguransa | x |"], ["| outra coisa | dados |", "| outra coisa | dados | y |"]]), LISTA, ['"seguransa"']));
caso("a Area num bloco ou nos Pendentes avisa (vive nas tabelas por tipo); o controlo e o (a), nas tabelas por tipo", () => [
  ...areaAvisa(troca(ACTIVE_OK, [["| Ordem | ID | Descricao | Esforco | Depende de |", "| Ordem | ID | Descricao | Esforco | Depende de | Area |"]]), LISTA, ['"Sprint 2 — o que esta aberto": a coluna "area" nao e lida aqui — a Area vive nas tabelas por tipo']),
  ...areaAvisa(troca(ACTIVE_OK, [["| ID | Descricao | Esforco | Nota |", "| ID | Descricao | Esforco | Nota | Tags |"]]), LISTA, ['Pendentes sem Sprint: a coluna "tags" nao e lida aqui']),
]);

console.log("\n  O carregaAreas (#465)\n");
// Numa sandbox com a sua `config/` (o precedente do `tests-pares.mjs`): um ficheiro por caso, para a cache do `import`
// nao devolver o primeiro modulo aos seguintes.
{
  const dir = mkdtempSync(join(tmpdir(), "areas-test-"));
  const url = (nome, texto) => {
    if (texto !== undefined) writeFileSync(join(dir, nome), texto);
    return pathToFileURL(join(dir, nome));
  };
  const recusa = async (u) => {
    try {
      await carregaAreas(u);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };
  try {
    const ausente = await carregaAreas(url("nao-existe.mjs"));
    const presente = await carregaAreas(url("ok.mjs", 'export const AREAS = { "Segurança": "x", dados: "y" };\n'));
    const sintaxe = await recusa(url("sintaxe.mjs", "export const AREAS = {\n"));
    const outroNome = await recusa(url("outro-nome.mjs", 'export const AREA = { a: "x" };\n'));
    const vazia = await recusa(url("vazia.mjs", 'export const AREAS = { a: "" };\n'));
    const semAreas = await recusa(url("sem-areas.mjs", "export const AREAS = {};\n"));
    const repetida = await recusa(url("repetida.mjs", 'export const AREAS = { "Segurança": "x", seguranca: "y" };\n'));
    caso("ausente da `null`; presente devolve a lista com as chaves pelo norm", () => [
      ...(ausente === null ? [] : [`ausente: ${JSON.stringify(ausente)}`]),
      ...(JSON.stringify(presente) === JSON.stringify({ seguranca: "x", dados: "y" }) ? [] : [`presente: ${JSON.stringify(presente)}`]),
    ]);
    caso("partida (sintaxe; `AREA` em vez de `AREAS`; uma definicao vazia; `{}`; `Segurança` e `seguranca`) recusa, e nomeia o ficheiro", () =>
      [["sintaxe", sintaxe], ["outro nome", outroNome], ["vazia", vazia], ["sem areas", semAreas], ["chave repetida pelo norm", repetida]].flatMap(([n, m]) => (m && m.includes(".agent/scripts/config/areas-do-backlog.mjs") ? [] : [`${n}: ${m}`])));
    // A forma da `config/` REAL (decisao 3: sem o ficheiro, salta) — so a forma, nunca o conteudo.
    const real = new URL("../config/areas-do-backlog.mjs", import.meta.url);
    if (!existsSync(real)) console.log("  SKIP  a forma da config/areas-do-backlog.mjs real (o projeto nao a tem)");
    else {
      const lista = await carregaAreas(real);
      caso("a `config/` real tem a forma: um objeto de textos nao vazios", () => (lista && Object.keys(lista).length ? [] : [`lista: ${JSON.stringify(lista)}`]));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  caso("a sandbox do carregaAreas ficou apagada", () => (existsSync(dir) ? [`ficou: ${dir}`] : []));
}

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
