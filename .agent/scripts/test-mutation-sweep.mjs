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

import { readFileSync } from "fs";
import { join } from "path";
import { test, avaliar, registarResultado, resumo } from "./test-sweep-harness.mjs";
// O verificador falso, a suite falsa, o `sandbox()` e os contadores vivem no harness: a suite
// passou as 500 linhas e a catraca do Guard 17 exige dividir antes de acrescentar. O que fica
// aqui sao as ASSERCOES — que e o que se le quando se quer saber o que esta garantido.

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

// Um harness que so monta fixtures nao tem nada que se desligue — a isencao por conteudo passou
// a valer para eles pela mesma razao que vale para uma tabela em `lib/`. O caso real: o
// `test-bundle-harness.mjs` ficou sem um unico sitio de recusa quando a configuracao passou a
// escrever-se (`config/bundles.mjs`) em vez de se fatiar dentro do ficheiro da logica. Com um
// par a força, a varredura dizia `SINAL ERRADO` para sempre — e um aviso permanentemente aceso
// ensina quem o le a ignorar o painel inteiro.
test("harness sem sitio de recusa nao e exigido em PARES", { harnessSemPar: true, segundoSitio: false }, ["--list"], {
  code: 0,
  excludes: ["SEM PAR"],
});

// E a metade que impede a isencao nova de virar buraco. Sem `throw new Error(` na lista de
// recusas, ESTE ficheiro passava por "so fixtures" e entrava sem rede — e nao era hipotetico:
// dois harnesses ja registados usam exatamente esse sinal. So nao se via porque a isencao nunca
// chega a quem ja esta em `PARES`.
test("harness cujo unico sitio de recusa e um `throw` continua a exigir par", { harnessComThrow: true }, ["--list"], {
  code: 1,
  includes: ["SEM PAR", "test-outro-harness.mjs"],
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

// --- O proprio harness (achado da varredura de mutacao) ----------------------
// A varredura mediu **0 de 4** sitios do `test-sweep-harness.mjs`: desligar qualquer uma das
// assercoes do `avaliar()` deixava esta suite inteira VERDE. Uma assercao a menos no harness so
// torna os testes mais permissivos — nada fica vermelho, e o ecra continua a dizer que passaram
// todos. Era o ficheiro que decide o veredicto sobre o MEDIDOR a ser a unica coisa sem medida.
//
// `avaliar()` e pura, logo chama-se aqui com entradas fabricadas — uma por sitio de recusa.
// Mesmo desenho do `tests-harness-self.mjs`, que nasceu deste mesmo achado no outro harness.
function auto(nome, resultado, expect, exigidos, proibidos = []) {
  const problemas = avaliar(resultado, expect);
  const falhas = [];
  for (const s of exigidos) {
    if (!problemas.some((p) => p.includes(s))) falhas.push(`devia ter apontado "${s}"; apontou ${JSON.stringify(problemas)}`);
  }
  for (const s of proibidos) {
    if (problemas.some((p) => p.includes(s))) falhas.push(`NAO devia ter apontado "${s}"`);
  }
  registarResultado(nome, falhas);
}

auto("avaliar: exit code diferente do esperado e um problema",
     { code: 1, out: "" }, { code: 0 }, ["exit 1, esperado 0"]);

auto("avaliar: fragmento exigido e ausente e um problema",
     { code: 0, out: "nada de util" }, { code: 0, includes: ["SEM PAR"] }, ['devia conter "SEM PAR"']);

auto("avaliar: fragmento proibido e presente e um problema",
     { code: 0, out: "isto diz SEM PAR" }, { code: 0, excludes: ["SEM PAR"] }, ['NAO devia conter "SEM PAR"']);

auto("avaliar: o que o `extra` devolve entra nos problemas",
     { code: 0, out: "" }, { code: 0, extra: () => ["o extra reprovou"] }, ["o extra reprovou"]);

// O CONTRA-CASO, e sem ele os quatro de cima valiam zero: um cenario SAO devolve lista VAZIA.
// Um `avaliar()` que devolvesse sempre tudo passava os quatro testes anteriores.
registarResultado(
  "avaliar: cenario sao nao inventa problemas",
  avaliar({ code: 0, out: "tudo bem por aqui" }, { code: 0, includes: ["tudo bem"], excludes: ["explodiu"] }).map(
    (p) => `nao devia ter apontado nada; apontou "${p}"`
  )
);

resumo();
