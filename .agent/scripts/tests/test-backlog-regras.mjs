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

console.log("\n  O formato do ID (#515)\n");
// Um sub-ID como o `U15p1` de um derivado real: o `calcula` saltava-o e a vista dava-o como invalido. O controlo e a
// fixture valida (todos os IDs no formato) ficar calada — e um ID valido mais comprido (`UX15`) tambem.
caso("um ID fora do formato no Historico avisa (#515)", () => avisa({ arquivo: [["| F1 | Feature", "| F1p1 | Feature"]] }, ['Historico: o ID "F1P1" nao tem o formato de um ID']));
caso("um ID fora do formato numa tabela por tipo avisa (#515)", () => avisa({ ativo: [["| B1 | Pendente |", "| B1p1 | Pendente |"]] }, ['o ID "B1P1" nao tem o formato de um ID']));
caso("um ID fora do formato nos Pendentes sem Sprint avisa (#515)", () =>
  avisa({ ativo: [["## Pendentes sem Sprint\n\n| ID | Descricao | Esforco | Nota |\n|----|-----------|---------|------|\n| | | | |", "## Pendentes sem Sprint\n\n| ID | Descricao | Esforco | Nota |\n|----|-----------|---------|------|\n| B1p1 | parte | S | depende do B1 |"]] }, ['Pendentes sem Sprint: o ID "B1P1" nao tem o formato de um ID']));
caso("um ID valido mais comprido (UX15) nao avisa; um riscado tem a sua regra, e nao esta (#515)", () => [
  ...calado({ arquivo: [["| F1 | Feature", "| UX15 | Feature"]] }),
  ...avisa({ ativo: [["| B1 | Pendente |", "| ~~B1~~ | Pendente |"]] }, ["a linha de B1 esta riscada"]),
]);

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
