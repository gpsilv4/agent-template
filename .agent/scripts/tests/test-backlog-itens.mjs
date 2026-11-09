/**
 * Testes do LEITOR do backlog (`lib/backlog-itens.mjs`, #445) — {{PROJECT_NAME}}
 *
 * Duas partes:
 *  1. **O `calcula` nao mudou** (o PR 1 do #445 e um refactor). O resultado do `calcula` sobre uma fixture RICA foi
 *     capturado no `main` em `d0d07e9`, ANTES de o `calcula` passar a ler pelo leitor, e fica CONGELADO aqui: a
 *     mensagem inteira, a ordem, o `derivado` e as contagens. Os casos do `test-backlog` so afirmam `includes`; aqui
 *     nao escapa uma origem trocada num duplicado, nem uma linha sem ID que deixasse de contar.
 *  2. **O leitor** (os campos que o PR 2 e a vista do #446 vao usar): cada caso com o seu controlo negativo.
 *
 * A fixture tem os casos de borda que o refactor reescreve (Fase 0 v2, M2): um aberto sem ID (conta), uma tabela sem a
 * coluna Esforco (nao se valida), uma secao com duas tabelas, um `#### Sprint`, uma tabela com Ordem e sem ID (avisa, PR 2), um
 * ID duplicado entre o ativo e o arquivo, um fechado no ativo, um estado e um Tipo desconhecidos, um `Proximo:` para
 * um fechado, e o Resumo e a barra errados.
 */
import { deepStrictEqual } from "assert";
import { calcula } from "../lib/backlog-calculo.mjs";
import { leBacklog, leDependeDe, idsDe, ehSprint } from "../lib/backlog-itens.mjs";

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
const espera = (cond, msg) => (cond ? [] : [msg]);
const igual = (a, b, msg) => {
  try {
    deepStrictEqual(a, b);
    return [];
  } catch (err) {
    return [`${msg}: ${err instanceof Error ? err.message.split("\n").slice(0, 12).join(" | ") : String(err)}`];
  }
};

const ATIVO_RICO = `# Backlog

## Progresso Geral

\`██████______________\` **50%** (3/6 concluidos)

**Proximo:** T9

## Resumo

| Seccao | Total | Pendente | A Fazer | Concluido | Cancelado |
|--------|-------|----------|---------|-----------|-----------|
| Bugs / Violacoes de Regras | 9 | 9 | 9 | 9 | 9 |
| Melhorias UX | 2 | 1 | 1 | 0 | 0 |
| Divida Tecnica | ? | 0 | 0 | 0 | 0 |
| Features Futuras | 1 | 1 | 0 | 0 | 0 |
| **Total** | **12** | **11** | **10** | **9** | **9** |

# 🎯 Trabalho Ativo

## Plano de Sprints

### Sprint 1 — o bloco com ID
> Objetivo: fechar os bugs

| Ordem | ID | Descricao | Esforco | Depende de |
|-------|-----|-----------|---------|------------|
| 1 | B1 | um bug | S | |
| 2 | B9 | nao existe | M | B1 |
| 3 | T9 | fechado no arquivo | S | — |

#### Sprint 2 — o bloco sem coluna ID

| Ordem | Ticket | Descricao |
|-------|--------|-----------|
| 1 | UX1 | sem coluna ID: avisa (a tabela tem Ordem e nao tem ID) |

#### Sprint 3 — um #### com coluna ID

| Ordem | ID | Descricao |
|-------|-----|-----------|
| 1 | B8 | nao existe: so um #### lido o apanha |

## Pendentes sem Sprint

| ID | Descricao | Esforco | Nota |
|----|-----------|---------|------|
| F1 | uma feature | M | precisa de dados |

# 📚 Tickets Abertos por Tipo (Referencia)

## 1. Bugs / Violacoes de Regras do Projeto

| ID | Estado | Problema | Ficheiro(s) | Severidade | Esforco | Pagina afetada |
|----|--------|---------|-------------|------------|---------|----------------|
| B1 | Pendente | um bug | a.mjs | Alta | S | / |
|  | Pendente | linha sem ID, conta | b.mjs | Baixa | M | / |
| B2 | Concluido | fechado no ativo | c.mjs | Media | XL | / |

| ID | Estado | Problema | Ficheiro(s) | Severidade | Esforco | Pagina afetada |
|----|--------|---------|-------------|------------|---------|----------------|
| **B3** | A Fazer | segunda tabela na mesma secao | d.mjs | Alta | — | / |
| B4 | Pendente |

## 2. Melhorias UX (impacto direto no utilizador)

| ID | Estado | Melhoria | Detalhe | Pagina afetada |
|----|--------|---------|---------|----------------|
| UX1 | Pendente | sem coluna Esforco | x | / |
| UX2 | A Fazer | idem | y | / |

## 3. Divida Tecnica / Code Quality

| ID | Estado | Issue | Detalhe | Esforco | Ficheiro(s) |
|----|--------|-------|---------|---------|-------------|
| T1 | Em revisao | estado desconhecido | z | | e.mjs |
|  | Em revisao | sem ID e estado desconhecido: conta, sem aviso | z | XL | e.mjs |

## 4. Features Futuras (valor para o utilizador)

| ID | Estado | Feature | Impacto | Esforco | Pagina afetada |
|----|--------|---------|---------|---------|----------------|
| F1 | Pendente | uma feature | alto | M | / |
| Q7 | Pendente | um ID que nenhuma secao cobre? nao: esta numa secao | - | S | / |
`;

const ARQUIVO_RICO = `# Arquivo

## Historico (Fechados)

| ID | Tipo | Descricao | Estado | Sprint | Versao | Data |
|----|------|-----------|--------|--------|--------|------|
| B1 | Bug | duplicado com o ativo | Concluido | S1 | v1 | 2026-01-01 |
| T9 | Tecnica | fechado | Concluido | S1 | v1 | 2026-01-02 |
| X1 | Outro | Tipo desconhecido | Concluido | S1 | v1 | 2026-01-03 |
| F8 | Feature | estado invalido | Pendente | S1 | v1 | 2026-01-04 |
|  | UX | sem ID, conta | Cancelado | S1 | v1 | 2026-01-05 |
|  | Outro | sem ID e Tipo desconhecido: sem aviso | Concluido | S1 | v1 | 2026-01-06 |

## Sprints Fechados

| Sprint | Objetivo | Data |
|--------|----------|------|
| S1 | o primeiro | 2026-01-05 |
`;

// Uma linha com aspeto de item numa tabela que nenhuma secao cobre (a rede 1b).
const ATIVO_RICO_SOLTO = ATIVO_RICO.replace("# 📚 Tickets Abertos", "## Notas soltas\n\n| ID | x |\n|----|---|\n| Z5 | solto |\n\n# 📚 Tickets Abertos");

// O resultado do `calcula` ANTES do refactor (capturado em `d0d07e9`). Nao se edita a mao: se mudar, e o
// comportamento que mudou. O PR 2 do #445 acrescentou UMA linha a cada cenario (a tabela com Ordem e sem ID), prevista
// na Fase 0 dele antes de implementar; mais nenhuma mudou.
const CONGELADO = {
  rico: {
    avisos: [
    {"msg": "Bugs: item \"B2\" tem Esforco \"XL\" — esperado S, M ou L (ver a legenda do backlog)", "derivado": false},
    {"msg": "Bugs: item \"B2\" esta \"Concluido\" mas continua no ficheiro ativo — mover para backlog-archive.md", "derivado": false},
    {"msg": "Divida Tecnica: item \"T1\" tem Estado desconhecido (\"Em revisao\")", "derivado": false},
    {"msg": "Arquivo: item \"X1\" tem Tipo desconhecido (\"Outro\") — usar Bug/UX/Tecnica/Feature", "derivado": false},
    {"msg": "Arquivo: item \"F8\" tem Estado invalido (\"Pendente\") — deve ser Concluido ou Cancelado", "derivado": false},
    {"msg": "backlog.md: \"Sprint 1 — o bloco com ID\" lista \"B9\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: \"Sprint 1 — o bloco com ID\" lista \"T9\", que esta fechado (vive no backlog-archive.md)", "derivado": false},
    {"msg": "backlog.md: \"Sprint 3 — um #### com coluna ID\" lista \"B8\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: **Proximo:** aponta para \"T9\", que esta fechado (vive no backlog-archive.md)", "derivado": false},
    {"msg": "ID duplicado \"B1\" em: Bugs (ativo), arquivo", "derivado": false},
    {"msg": "backlog.md: a tabela de \"Sprint 2 — o bloco sem coluna ID\" tem a coluna Ordem e nao tem ID — um bloco precisa das duas", "derivado": false},
    {"msg": "Resumo \"Bugs\": escrito [9,9,9,9,9] != calculado [6,3,1,2,0] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"UX\": escrito [2,1,1,0,0] != calculado [3,1,1,0,1] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"Divida Tecnica\": celula 1 nao e um numero (\"?\") — nao validei esta linha", "derivado": false},
    {"msg": "Resumo \"Features\": escrito [1,1,0,0,0] != calculado [2,2,0,0,0] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"Total\": escrito [12,11,10,9,9] != calculado [13,6,2,3,1] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Progresso: total escrito (6) != calculado (12, exclui cancelados)", "derivado": true},
    {"msg": "Progresso: percentagem escrita (50%) != calculado (25%)", "derivado": true},
    {"msg": "Barra: 6 blocos preenchidos != esperado 5 (de 20)", "derivado": true},
    ],
    ...{"counts": {"Bugs": {"pendente": 3, "a fazer": 1, "concluido": 2, "cancelado": 0, "total": 6}, "UX": {"pendente": 1, "a fazer": 1, "concluido": 0, "cancelado": 1, "total": 3}, "Divida Tecnica": {"pendente": 0, "a fazer": 0, "concluido": 1, "cancelado": 0, "total": 2}, "Features": {"pendente": 2, "a fazer": 0, "concluido": 0, "cancelado": 0, "total": 2}}, "g": {"pendente": 6, "a fazer": 2, "concluido": 3, "cancelado": 1, "total": 13}, "countable": 12, "expectedPct": 25, "expectedFilled": 5},
  },
  solto: { avisos: [
    {"msg": "Bugs: item \"B2\" tem Esforco \"XL\" — esperado S, M ou L (ver a legenda do backlog)", "derivado": false},
    {"msg": "Bugs: item \"B2\" esta \"Concluido\" mas continua no ficheiro ativo — mover para backlog-archive.md", "derivado": false},
    {"msg": "Divida Tecnica: item \"T1\" tem Estado desconhecido (\"Em revisao\")", "derivado": false},
    {"msg": "backlog.md: item \"Z5\" esta numa tabela que nenhuma seccao reconhecida cobre — verificar os cabecalhos das quatro seccoes", "derivado": false},
    {"msg": "Arquivo: item \"X1\" tem Tipo desconhecido (\"Outro\") — usar Bug/UX/Tecnica/Feature", "derivado": false},
    {"msg": "Arquivo: item \"F8\" tem Estado invalido (\"Pendente\") — deve ser Concluido ou Cancelado", "derivado": false},
    {"msg": "backlog.md: \"Sprint 1 — o bloco com ID\" lista \"B9\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: \"Sprint 1 — o bloco com ID\" lista \"T9\", que esta fechado (vive no backlog-archive.md)", "derivado": false},
    {"msg": "backlog.md: \"Sprint 3 — um #### com coluna ID\" lista \"B8\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: **Proximo:** aponta para \"T9\", que esta fechado (vive no backlog-archive.md)", "derivado": false},
    {"msg": "ID duplicado \"B1\" em: Bugs (ativo), arquivo", "derivado": false},
    {"msg": "backlog.md: a tabela de \"Sprint 2 — o bloco sem coluna ID\" tem a coluna Ordem e nao tem ID — um bloco precisa das duas", "derivado": false},
    {"msg": "Resumo \"Bugs\": escrito [9,9,9,9,9] != calculado [6,3,1,2,0] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"UX\": escrito [2,1,1,0,0] != calculado [3,1,1,0,1] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"Divida Tecnica\": celula 1 nao e um numero (\"?\") — nao validei esta linha", "derivado": false},
    {"msg": "Resumo \"Features\": escrito [1,1,0,0,0] != calculado [2,2,0,0,0] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"Total\": escrito [12,11,10,9,9] != calculado [13,6,2,3,1] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Progresso: total escrito (6) != calculado (12, exclui cancelados)", "derivado": true},
    {"msg": "Progresso: percentagem escrita (50%) != calculado (25%)", "derivado": true},
    {"msg": "Barra: 6 blocos preenchidos != esperado 5 (de 20)", "derivado": true},
  ] },
  semArquivo: { avisos: [
    {"msg": "backlog-archive.md nao encontrado — o layout de dois ficheiros do backlog esta incompleto (items fechados vivem la)", "derivado": false},
    {"msg": "Bugs: item \"B2\" tem Esforco \"XL\" — esperado S, M ou L (ver a legenda do backlog)", "derivado": false},
    {"msg": "Bugs: item \"B2\" esta \"Concluido\" mas continua no ficheiro ativo — mover para backlog-archive.md", "derivado": false},
    {"msg": "Divida Tecnica: item \"T1\" tem Estado desconhecido (\"Em revisao\")", "derivado": false},
    {"msg": "backlog.md: \"Sprint 1 — o bloco com ID\" lista \"B9\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: \"Sprint 1 — o bloco com ID\" lista \"T9\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: \"Sprint 3 — um #### com coluna ID\" lista \"B8\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: **Proximo:** aponta para \"T9\", que nao existe em nenhuma tabela por tipo", "derivado": false},
    {"msg": "backlog.md: a tabela de \"Sprint 2 — o bloco sem coluna ID\" tem a coluna Ordem e nao tem ID — um bloco precisa das duas", "derivado": false},
    {"msg": "Resumo \"Bugs\": escrito [9,9,9,9,9] != calculado [5,3,1,1,0] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"Divida Tecnica\": celula 1 nao e um numero (\"?\") — nao validei esta linha", "derivado": false},
    {"msg": "Resumo \"Features\": escrito [1,1,0,0,0] != calculado [2,2,0,0,0] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Resumo \"Total\": escrito [12,11,10,9,9] != calculado [10,6,2,1,0] (Total,Pend,AFazer,Concl,Canc)", "derivado": true},
    {"msg": "Progresso: concluidos escritos (3) != calculado (1)", "derivado": true},
    {"msg": "Progresso: total escrito (6) != calculado (10, exclui cancelados)", "derivado": true},
    {"msg": "Progresso: percentagem escrita (50%) != calculado (10%)", "derivado": true},
    {"msg": "Barra: 6 blocos preenchidos != esperado 2 (de 20)", "derivado": true},
  ] },
};

const NOMES = { ACTIVE: "backlog.md", ARCHIVE: "backlog-archive.md" };

console.log("\n  O calcula nao mudou (o resultado congelado em d0d07e9)\n");
caso("fixture rica: os avisos (mensagem inteira, ordem, derivado) e as contagens sao os de antes", () =>
  igual(calcula(ATIVO_RICO, ARQUIVO_RICO, NOMES), CONGELADO.rico, "o calcula mudou"));
caso("fixture rica com uma linha solta: os avisos sao os de antes (a rede 1b)", () =>
  igual(calcula(ATIVO_RICO_SOLTO, ARQUIVO_RICO, NOMES).avisos, CONGELADO.solto.avisos, "o calcula mudou"));
caso("fixture rica sem arquivo: os avisos sao os de antes", () =>
  igual(calcula(ATIVO_RICO, null, NOMES).avisos, CONGELADO.semArquivo.avisos, "o calcula mudou"));

// #466: os titulos com acentos, como um derivado os escreve. A prova e uma IGUALDADE com a fixture sem acentos (os
// mesmos avisos, pela mesma ordem, e as mesmas contagens), e nao "sem avisos": hoje um titulo com acentos da tres de uma
// vez (o cabecalho em falta, as linhas que nenhuma secao cobre, e o Historico em falta). "Violações" vai junto, mas nao
// prova nada sozinho: o `re` dos Bugs ja casava pelo "Bugs".
const ATIVO_ACENTOS = ATIVO_RICO.replace("## 3. Divida Tecnica / Code Quality", "## 3. Dívida Técnica / Code Quality").replace("## 1. Bugs / Violacoes de Regras do Projeto", "## 1. Bugs / Violações de Regras do Projeto");
const ARQUIVO_ACENTOS = ARQUIVO_RICO.replace("## Historico (Fechados)", "## Histórico (Fechados)");
caso("titulos com acentos (Dívida Técnica, Histórico): o calcula e o leitor dao o mesmo que sem acentos (#466)", () => [
  // As fixtures mudaram mesmo (uma troca que nao casa nao testa nada).
  ...espera(ATIVO_ACENTOS !== ATIVO_RICO && ARQUIVO_ACENTOS !== ARQUIVO_RICO && ATIVO_ACENTOS.includes("Dívida Técnica"), "a troca nao casou"),
  ...igual(calcula(ATIVO_ACENTOS, ARQUIVO_ACENTOS, NOMES), CONGELADO.rico, "com acentos, o calcula difere"),
  ...igual(leBacklog(ATIVO_ACENTOS, ARQUIVO_ACENTOS).fechados, leBacklog(ATIVO_RICO, ARQUIVO_RICO).fechados, "com acentos, os fechados diferem"),
  // O mesmo titulo com os acentos DECOMPOSTOS (NFD: um editor ou um sistema de ficheiros que os grava assim).
  ...igual(calcula(ATIVO_ACENTOS.normalize("NFD"), ARQUIVO_ACENTOS.normalize("NFD"), NOMES), CONGELADO.rico, "com acentos em NFD, o calcula difere"),
  ...igual(leBacklog(ATIVO_ACENTOS, ARQUIVO_ACENTOS).colunasEmFaltaNoHistorico, [], "com acentos, o Historico perde colunas"),
  // O `[]` acima e tambem o que sai com o heading por achar: um Historico com acentos e SEM a coluna Estado tem de a
  // acusar (senao a regra das colunas desligava-se em silencio para quem escreve "Histórico").
  ...igual(leBacklog(ATIVO_ACENTOS, ARQUIVO_ACENTOS.replace("| ID | Tipo | Descricao | Estado |", "| ID | Tipo | Descricao | Situacao |")).colunasEmFaltaNoHistorico, ["estado"], "com acentos e sem Estado"),
]);
caso("so os acentos: um titulo com enfase (`## **Bugs**`) continua a nao casar, como hoje (o `semAcentos` nao e o `norm`)", () => {
  const avisos = calcula(ATIVO_RICO.replace("## 1. Bugs / Violacoes de Regras do Projeto", "## 1. **Bugs** / Violacoes"), ARQUIVO_RICO, NOMES).avisos.map((x) => x.msg);
  return espera(avisos.some((m) => m.includes('nao encontrei o cabecalho da seccao "Bugs"')), `avisos: ${avisos.slice(0, 3)}`);
});

// O `Proximo:` (#446): o regex mudou-se LITERALMENTE do `calcula` para o leitor. Os avisos do `Proximo:` em cada cenario
// foram capturados com o `calcula` de ANTES da mudanca; o acento, as maiusculas, duas linhas (vale a 1.a), a linha a meio
// do ficheiro, e sem a linha.
const L_PROXIMO = "**Proximo:** T9";
const CENARIOS_PROXIMO = {
  semProximo: ATIVO_RICO.replace(L_PROXIMO + "\n", ""),
  comAcento: ATIVO_RICO.replace(L_PROXIMO, "**Próximo:** B9"),
  maiusculas: ATIVO_RICO.replace(L_PROXIMO, "**PROXIMO:** B9"),
  duasLinhas: ATIVO_RICO.replace(L_PROXIMO, L_PROXIMO + "\n\n**Proximo:** B9"),
  aMeio: ATIVO_RICO.replace(L_PROXIMO + "\n", "").replace("## Pendentes sem Sprint", "**Proximo:** B9\n\n## Pendentes sem Sprint"),
};
const PROXIMO_CONGELADO = {
  "semProximo": [],
  "comAcento": [
    "backlog.md: **Proximo:** aponta para \"B9\", que nao existe em nenhuma tabela por tipo"
  ],
  "maiusculas": [
    "backlog.md: **Proximo:** aponta para \"B9\", que nao existe em nenhuma tabela por tipo"
  ],
  "duasLinhas": [
    "backlog.md: **Proximo:** aponta para \"T9\", que esta fechado (vive no backlog-archive.md)"
  ],
  "aMeio": [
    "backlog.md: **Proximo:** aponta para \"B9\", que nao existe em nenhuma tabela por tipo"
  ]
};
caso("o Proximo: os avisos de antes em cada cenario (o acento, as maiusculas, duas linhas, a meio, sem ela)", () => {
  const erros = Object.entries(CENARIOS_PROXIMO).filter(([, a]) => a === ATIVO_RICO).map(([k]) => `o cenario ${k} nao mudou a fixture`);
  const agora = Object.fromEntries(Object.entries(CENARIOS_PROXIMO).map(([k, a]) => [k, calcula(a, ARQUIVO_RICO, NOMES).avisos.filter((x) => /Proximo/.test(x.msg)).map((x) => x.msg)]));
  return [...erros, ...igual(agora, PROXIMO_CONGELADO, "o Proximo mudou")];
});

console.log("\n  O leitor\n");
const lido = leBacklog(ATIVO_RICO, ARQUIVO_RICO);
const doTipo = (id) => lido.linhasPorTipo.find((l) => l.id === id);

caso("linhasPorTipo: o normalizado e o cru, as colunas pelo nome, e TODAS as linhas (sem ID, fechada, curta)", () => {
  const b3 = doTipo("B3");
  return [
    ...igual({ id: b3.id, idCelula: b3.idCelula, estado: b3.estado, estadoCelula: b3.estadoCelula, seccao: b3.seccao }, { id: "B3", idCelula: "**B3**", estado: "a fazer", estadoCelula: "A Fazer", seccao: "Bugs" }, "B3"),
    ...espera(lido.linhasPorTipo.some((l) => l.id === "" && l.seccao === "Bugs"), "a linha sem ID dos Bugs nao veio"),
    ...espera(doTipo("B2")?.estado === "concluido", "a linha fechada no ativo nao veio"),
    ...espera(doTipo("T1")?.descricao === "estado desconhecido", `a descricao e a 3.a coluna: ${doTipo("T1")?.descricao}`),
    ...espera(doTipo("B1")?.colunas.severidade === "Alta" && doTipo("B1")?.colunas["pagina afetada"] === "/", "as colunas pelo nome"),
    ...espera(doTipo("B4")?.esforcoCelula === undefined && doTipo("B4")?.esforco === "", "a linha curta: a celula em falta"),
  ];
});

caso("o Esforco: `null` sem a coluna, `\"\"` com a celula vazia, e o par normalizado + cru em todas as tabelas", () => [
  ...espera(doTipo("UX1")?.esforco === null && doTipo("UX1")?.esforcoCelula === null, `UX1 (sem a coluna): ${doTipo("UX1")?.esforco}`),
  ...espera(doTipo("T1")?.esforco === "" && doTipo("T1")?.esforcoCelula === "", `T1 (celula vazia): ${JSON.stringify(doTipo("T1")?.esforco)}`),
  ...igual([doTipo("B2")?.esforco, doTipo("B2")?.esforcoCelula], ["xl", "XL"], "B2"),
  ...igual([lido.blocos[0].linhas[0].esforco, lido.blocos[0].linhas[0].esforcoCelula], ["s", "S"], "no bloco"),
  ...igual([lido.pendentes[0].esforco, lido.pendentes[0].esforcoCelula], ["m", "M"], "nos Pendentes"),
]);

caso("fechados: os campos do Historico, e as linhas sem ID tambem", () => {
  const t9 = lido.fechados.find((f) => f.id === "T9");
  return [
    ...igual(t9, { id: "T9", idCelula: "T9", tipo: "tecnica", tipoCelula: "Tecnica", descricao: "fechado", estado: "concluido", estadoCelula: "Concluido", sprint: "S1", versao: "v1", data: "2026-01-02" }, "T9"),
    ...espera(lido.fechados.filter((f) => f.id === "").length === 2, "as linhas do Historico sem ID nao vieram"),
    ...espera(lido.fechados.length === 6, `6 linhas no Historico, e nao o indice de sprints: ${lido.fechados.length}`),
  ];
});

// Um bloco e uma tabela com `Ordem` E `ID` (#445 PR 2): o "Sprint 2" (`| Ordem | Ticket |`) sai para `semId`, e avisa.
caso("blocos: o `###` e o `####` com Ordem e ID, o objetivo, e a tabela com Ordem e sem ID em `semId`", () => {
  const [s1, s3] = lido.blocos;
  return [
    ...espera(lido.blocos.length === 2, `2 blocos: ${lido.blocos.length}`),
    ...igual([s1?.titulo, s1?.objetivo], ["Sprint 1 — o bloco com ID", "fechar os bugs"], "Sprint 1"),
    ...igual(lido.semId, [{ titulo: "Sprint 2 — o bloco sem coluna ID" }], "Sprint 2 (sem coluna ID)"),
    ...igual([s3?.titulo, s3?.linhas[0]?.id], ["Sprint 3 — um #### com coluna ID", "B8"], "Sprint 3"),
    ...igual(s1?.linhas.map((l) => [l.ordem, l.id, l.prioridade]), [["1", "B1", null], ["2", "B9", null], ["3", "T9", null]], "as linhas do Sprint 1"),
  ];
});

caso("o objetivo: as formas com enfase, e nao `Objetivos:`", () => {
  const obj = (linha) => leBacklog(`### Sprint 1\n${linha}\n\n| Ordem | ID |\n|---|---|\n`, "").blocos[0].objetivo;
  return [
    ...igual(["> Objetivo: x", "> **Objetivo:** x", "> **Objetivo**: x", "> _Objetivo:_ x"].map(obj), ["x", "x", "x", "x"], "as formas"),
    ...espera(obj("> Objetivos: x") === null, `Objetivos: ${obj("> Objetivos: x")}`),
  ];
});

caso("o fecho, e a segunda tabela debaixo do mesmo heading (o `(tabela 2)`, sem o objetivo)", () => {
  const b = leBacklog("### Sprint 9\n> Objetivo: x\n> Fecho: /audit\n\n| Ordem | ID |\n|---|---|\n| 1 | B1 |\n\nentre as duas\n\n| Ordem | ID |\n|---|---|\n| 1 | B2 |\n", "").blocos;
  return igual(b.map((x) => [x.titulo, x.objetivo, x.fecho, x.linhas[0]?.id]), [["Sprint 9", "x", "/audit", "B1"], ["Sprint 9 (tabela 2)", null, null, "B2"]], "os dois blocos");
});

caso("a Prioridade: `null` sem a coluna, `\"\"` com a celula vazia, e o valor com ela", () => {
  const com = leBacklog(ATIVO_RICO.replace("| Ordem | ID | Descricao | Esforco | Depende de |\n|-------|-----|-----------|---------|------------|\n| 1 | B1 | um bug | S | |\n| 2 | B9 | nao existe | M | B1 |",
    "| Ordem | ID | Descricao | Esforco | Prioridade | Depende de |\n|---|---|---|---|---|---|\n| 1 | B1 | um bug | S | Alta | |\n| 2 | B9 | nao existe | M |  | B1 |"), ARQUIVO_RICO);
  const ls = com.blocos[0].linhas;
  // So as duas linhas reescritas: a 3.a ficou com as colunas de antes, e o leitor le pelo cabecalho.
  return [...igual([ls[0].prioridade, ls[1].prioridade], ["Alta", ""], "com a coluna"), ...espera(lido.blocos[0].linhas[0].prioridade === null, "sem a coluna nao e null")];
});

caso("dependeDe e idsDe: os IDs, o `Bloqueado:` (com enfase, sem motivo, e nao `Desbloqueado:`), e o vazio", () => [
  ...igual(leDependeDe("T58; UX12"), { texto: "T58; UX12", ids: ["T58", "UX12"], bloqueado: null }, "dois IDs"),
  ...igual(leDependeDe("T58; Bloqueado: sem versao do pacote B7"), { texto: "T58; Bloqueado: sem versao do pacote B7", ids: ["T58"], bloqueado: "sem versao do pacote B7" }, "o ID depois de Bloqueado: nao e dependencia"),
  ...igual(leDependeDe("**Bloqueado:** sem X").bloqueado, "sem X", "a enfase sai do motivo"),
  ...igual(leDependeDe("Bloqueado:").bloqueado, "", "sem motivo e \"\", e nao null"),
  ...igual(leDependeDe("Desbloqueado: T5").bloqueado, null, "Desbloqueado nao e a marca"),
  ...igual(leDependeDe("UX139 (num so PR)").ids, ["UX139"], "o texto a seguir ao ID"),
  ...igual([leDependeDe("—").ids, leDependeDe("").ids], [[], []], "o travessao e o vazio"),
  ...igual(leDependeDe(null), null, "sem a coluna e null"),
  ...igual(idsDe("depois do #123 e do T9, e PR 45"), ["T9"], "idsDe"),
  ...igual(lido.blocos[0].linhas[1].dependeDe.ids, ["B1"], "na fixture"),
]);

caso("pendentes: a Nota pelo nome; e `null` (com `encontradas.pendentes` falso) sem o heading", () => {
  const sem = leBacklog(ATIVO_RICO.replace("## Pendentes sem Sprint", "## Parqueados"), ARQUIVO_RICO);
  return [
    ...igual(lido.pendentes, [{ id: "F1", riscado: false, idLimpo: "F1", descricao: "uma feature", esforco: "m", esforcoCelula: "M", nota: "precisa de dados" }], "os pendentes"),
    ...igual([sem.pendentes, sem.encontradas.pendentes, lido.encontradas.pendentes], [null, false, true], "a secao renomeada nao e uma secao vazia"),
    ...igual([lido.encontradas.historico, leBacklog(ATIVO_RICO, "# Arquivo\n").encontradas.historico], [true, false], "o Historico"),
  ];
});

caso("tickets: a juncao por ID (o bloco e a ordem, a nota, o `noArquivo`), e a primeira ocorrencia ganha", () => {
  const t = (id) => lido.tickets.get(id);
  const dup = leBacklog(ATIVO_RICO.replace("| 2 | B9 | nao existe | M | B1 |", "| 2 | B1 | outra vez | M | |").replace("| B2 | Concluido | fechado no ativo |", "| B1 | Concluido | B1 outra vez |"), ARQUIVO_RICO);
  return [
    ...igual([t("B1")?.bloco, t("B1")?.ordem, t("B1")?.noArquivo, t("B1")?.seccao], ["Sprint 1 — o bloco com ID", "1", true, "Bugs"], "B1 (num bloco, e tambem no arquivo)"),
    ...igual([t("B2")?.estado, t("B2")?.noArquivo], ["concluido", false], "B2: fechado no ativo e noArquivo sao coisas diferentes"),
    ...igual([t("F1")?.bloco, t("F1")?.nota, t("F1")?.seccao], [null, "precisa de dados", "Features"], "F1 (nos Pendentes)"),
    ...espera(!lido.tickets.has(""), "uma linha sem ID nao e um ticket"),
    ...espera(t("UX1")?.bloco === null, "o UX1 so esta num bloco sem coluna ID: nao se junta"),
    ...igual([dup.tickets.get("B1")?.estado, dup.tickets.get("B1")?.ordem, dup.tickets.get("B1")?.descricao], ["pendente", "1", "um bug"], "a primeira ocorrencia ganha"),
  ];
});

caso("o proximo, o indice dos sprints fechados (pelo nome) e as colunas do ticket (#446)", () => [
  ...igual(lido.proximo, { texto: " T9", alvo: "T9" }, "o proximo"),
  ...igual(leBacklog(ATIVO_RICO.replace(L_PROXIMO + "\n", ""), ARQUIVO_RICO).proximo, { texto: null, alvo: null }, "sem a linha"),
  ...igual(lido.sprintsFechados, [{ sprint: "S1", objetivo: "o primeiro", data: "2026-01-05" }], "o indice"),
  ...espera(lido.tickets.get("B1")?.colunas?.severidade === "Alta", "as colunas no ticket"),
]);

caso("o Proximo com o 'ó' em NFD (decomposto) le-se como o composto, e o texto vem como esta escrito (#471)", () => {
  const nfd = ATIVO_RICO.replace(L_PROXIMO, "**Pro\u0301ximo:** B9 de \u0301");
  const aviso = (a) => calcula(a, ARQUIVO_RICO, NOMES).avisos.filter((x) => /Proximo/.test(x.msg)).map((x) => x.msg);
  return [
    ...igual(aviso(nfd), aviso(CENARIOS_PROXIMO.comAcento), "os avisos do Proximo em NFD"),
    ...espera(leBacklog(nfd, ARQUIVO_RICO).proximo.texto === " B9 de \u0301" && leBacklog(nfd, ARQUIVO_RICO).proximo.alvo === "B9", `o texto: ${JSON.stringify(leBacklog(nfd, ARQUIVO_RICO).proximo)}`),
  ];
});
caso("ehSprint: um titulo de Sprint com um numero, um emoji ou enfase antes; e a tabela sem Ordem debaixo dele avisa (#471)", () => [
  ...espera(["Sprint 4", "🚀 Sprint 4 — x", "1. Sprint 4", "**Sprint 4**", "sprint 4"].every(ehSprint), "um titulo de Sprint nao foi reconhecido"),
  // CONTROLO: o que nao e um Sprint.
  ...espera(!["Fala real — depois do Sprint 2", "Sprints Fechados", "Pendentes sem Sprint"].some(ehSprint), "um titulo que nao e Sprint foi reconhecido"),
  ...igual(leBacklog(ATIVO_RICO.replace("## Pendentes sem Sprint", "### 🚀 Sprint 9\n\n| ID | x |\n|----|---|\n| B9 | y |\n\n## Pendentes sem Sprint"), ARQUIVO_RICO).sprintSemOrdem.map((s) => s.titulo), ["🚀 Sprint 9"], "o Sprint com emoji e sem Ordem"),
]);
// Um ID em minusculas (`b1`) e o mesmo ticket que o `B1`: o `idDe` poe-no em maiusculas, logo o duplicado com o
// arquivo continua a ser acusado e a contagem nao muda (#477, achado da auditoria pre-tag: o comportamento, preso).
caso("um ID em minusculas e o mesmo ticket: os avisos sao os do ID em maiusculas (#477)", () => {
  const LINHA = "| B1 | Pendente | um bug | a.mjs | Alta | S | / |";
  const avisos = (a) => calcula(a, ARQUIVO_RICO, NOMES).avisos.map((x) => x.msg);
  const minusc = ATIVO_RICO.replace(LINHA, LINHA.replace("B1", "b1"));
  return [
    ...espera(ATIVO_RICO.includes(LINHA), "a fixture mudou: a linha do B1 ja nao esta la"),
    ...igual(avisos(minusc), avisos(ATIVO_RICO), "os avisos com o b1"),
    // O B1 tambem esta no bloco do Sprint (em maiusculas): a severidade so vem da tabela por tipo, logo prova que a
    // linha `b1` se juntou ao B1, e nao que o B1 do bloco existe.
    ...espera(!leBacklog(minusc, ARQUIVO_RICO).tickets.has("b1"), "ficou um ticket b1"),
    ...igual([leBacklog(minusc, ARQUIVO_RICO).tickets.get("B1")?.colunas?.severidade, leBacklog(minusc, ARQUIVO_RICO).tickets.get("B1")?.estado], ["Alta", "pendente"], "a linha b1 nao se juntou ao B1"),
    // CONTROLO: outro ID (B8) muda os avisos — a igualdade acima nao e a de dois textos que o calculo nao distingue.
    ...espera(JSON.stringify(avisos(ATIVO_RICO.replace(LINHA, LINHA.replace("B1", "B8")))) !== JSON.stringify(avisos(ATIVO_RICO)), "o B8 deu os mesmos avisos"),
  ];
});
caso("o placeholder vazio do template nao da linhas", () => {
  const vazio = leBacklog("## 1. Bugs\n\n| ID | Estado | Problema |\n|---|---|---|\n| | | |\n\n### Sprint 1\n\n| Ordem | ID |\n|---|---|\n| | |\n", "");
  return [...espera(vazio.linhasPorTipo.length === 0, `linhas: ${vazio.linhasPorTipo.length}`), ...espera(vazio.blocos[0].linhas.length === 0, "o bloco vazio deu linhas"), ...espera(vazio.tickets.size === 0, "tickets")];
});

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
