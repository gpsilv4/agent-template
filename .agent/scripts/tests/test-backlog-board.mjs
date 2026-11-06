/**
 * Testes do GERADOR da vista do backlog (`lib/backlog-vista.mjs`, #446) — {{PROJECT_NAME}}
 *
 * O gerador e puro: estes casos nao lancam processos (o CLI e o `--vigiar` estao no `test-backlog-board-cli.mjs`).
 * Cada prova tem o seu controlo. A seguranca prova-se com o MESMO texto hostil em todos os campos: desligado um escape
 * (a varredura troca-o pela identidade), o texto cru aparece, e o caso fica vermelho.
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { ACTIVE_OK, ARCHIVE_OK } from "./harness/test-backlog-harness.mjs";
import { leBacklog } from "../lib/backlog-itens.mjs";
import { calcula } from "../lib/backlog-calculo.mjs";
import { normalizaFimDeLinha, geraVista, renderTexto, tituloDe, pedidosDe, passaFiltro, vistaParou, urlSegura, faixaDeErro, rotuloDe } from "../lib/backlog-vista.mjs";
import { CSS } from "../lib/backlog-vista-assets.mjs";

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

const NOMES = { ACTIVE: "backlog.md", ARCHIVE: "backlog-archive.md" };
const AGORA = new Date("2026-11-06T10:00:00Z");
/** O texto com cada `[de, para]` trocado; um `de` que nao casa e um erro (um caso que nao muda nada nao testa nada). */
function troca(texto, pares) {
  let t = texto;
  for (const [de, para] of pares) {
    if (!t.includes(de)) throw new Error(`a fixture nao tem: ${de.slice(0, 50)}`);
    t = t.replace(de, para);
  }
  return t;
}
const vista = (ativo = ACTIVE_OK, arquivo = ARCHIVE_OK, o = {}) => geraVista(leBacklog(ativo, arquivo), calcula(ativo, arquivo, NOMES), { agora: AGORA, ...o });
// Os cartoes do quadro POR BLOCO (o "por tipo" repete-os, agrupados de outra forma).
const porBloco = (html) => /<main class="quadro" id="por-bloco">([^]*?)<\/main>/.exec(html)?.[1] ?? "";
const cartoesDe = (html) => (porBloco(html).match(/<li class="cartao" data-i=/g) ?? []).length;
const cinzentosDe = (html) => [...html.matchAll(/<li class="cartao cinzento"><b>([^<]*)<\/b> <small>([^<]*)<\/small>/g)].map((m) => `${m[1]}:${m[2]}`);
const fechadosDe = (html) => (html.match(/<tr data-busca=/g) ?? []).length;

console.log("\n  Os cartoes\n");
caso("numa fixture limpa: os cartoes abertos e os fechados sao os do calcula", () => {
  const html = vista();
  const { g } = calcula(ACTIVE_OK, ARCHIVE_OK, NOMES);
  return [
    ...espera(cartoesDe(html) === g.pendente + g["a fazer"], `cartoes ${cartoesDe(html)} != ${g.pendente + g["a fazer"]}`),
    ...espera(fechadosDe(html) === g.concluido + g.cancelado, `fechados ${fechadosDe(html)} != ${g.concluido + g.cancelado}`),
    // CONTROLO: a contagem ve um cartao a mais (senao a igualdade acima passava sempre).
    ...espera(cartoesDe(html.replace('<main class="quadro" id="por-bloco">', '<main class="quadro" id="por-bloco"><li class="cartao" data-i="9">')) !== g.pendente + g["a fazer"], "a contagem nao ve um cartao a mais"),
  ];
});
caso("as anomalias: sem ID, fechado e Estado desconhecido nao dao cartao; um orfao vai para 'Sem bloco'", () => {
  const ativo = troca(ACTIVE_OK, [["| B1 | Pendente | algo |", "| B1 | Pendente | algo |\n|  | Pendente | sem ID | x | y | S | z |\n| B5 | Concluido | fechado no ativo | x | y | S | z |\n| B6 | Em revisao | desconhecido | x | y | S | z |"]]);
  const html = vista(ativo);
  return [
    ...espera(cartoesDe(html) === 3, `3 cartoes abertos (B1, B2, UX1), tenho ${cartoesDe(html)}`),
    ...espera(!/href="#t-B5"|href="#t-B6"/.test(html), "um fechado ou desconhecido deu cartao"),
    ...espera(/<h2>Sem bloco<\/h2>[^]*?#t-B1/.test(html), "o B1 (orfao) nao esta em 'Sem bloco'"),
  ];
});
caso("uma linha de bloco inexistente ou fechada da um cartao cinzento, com o porque", () => {
  const ativo = troca(ACTIVE_OK, [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B2 |\n| 3 | B9 | nao existe | S | — |\n| 4 | B3 | fechado | S | — |"]]);
  return espera(JSON.stringify(cinzentosDe(vista(ativo))) === JSON.stringify(["B9:nao existe", "B3:fechado"]), `cinzentos: ${JSON.stringify(cinzentosDe(vista(ativo)))}`);
});
caso("um ID no ativo e no arquivo: o cartao aberto ganha, com 'tambem no arquivo'", () => {
  const html = vista(ACTIVE_OK, troca(ARCHIVE_OK, [["| B3 | Bug |", "| B2 | Bug | o mesmo | Concluido | S1 | v0.1.0 | 2026-01-01 |\n| B3 | Bug |"]]));
  return [...espera(/href="#t-B2"[^]*?tambem no arquivo/.test(html), "sem a nota"), ...espera(!/id="f-B2"/.test(html), "o fechado tambem ganhou um detalhe")];
});
caso("a ordem: numerica (o 2 antes do 10), e os 'Em curso' a cabeca", () => {
  const ativo = troca(ACTIVE_OK, [["| 1 | B2 | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | — |\n| 10 | B1 | algo | S | — |\n| 11 | B2 | outra coisa | M | — |"]]);
  const ordem = [...vista(ativo).matchAll(/href="#t-(\w+)"><b>/g)].map((m) => m[1]);
  return espera(ordem.slice(0, 3).join() === "B2,UX1,B1", `ordem: ${ordem.join()} (B2 esta A Fazer: vem primeiro)`);
});
caso("o objetivo e o fecho na coluna; a prioridade, o motivo do Bloqueado e a Nota no cartao", () => {
  const ativo = troca(ACTIVE_OK, [
    ["### Sprint 2 — o que esta aberto\n", "### Sprint 2 — o que esta aberto\n> Objetivo: fechar o B2\n> Fecho: /audit\n"],
    ["| Ordem | ID | Descricao | Esforco | Depende de |\n|-------|-----|-----------|---------|------------|\n| 1 | B2 | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |", "| Ordem | ID | Descricao | Esforco | Prioridade | Depende de |\n|---|---|---|---|---|---|\n| 1 | B2 | outra coisa | M | Alta | Bloqueado: espera pelo pacote |\n| 2 | UX1 | melhorar algo | S | | B2 |"],
    ["|----|-----------|---------|------|\n| | | | |", "|----|-----------|---------|------|\n| B1 | algo | S | fazer se houver dados |"],
  ]);
  const html = vista(ativo);
  return [
    ...espera(html.includes('<p class="objetivo">fechar o <a class="id" href="#t-B2">B2</a></p>'), "o objetivo"),
    ...espera(html.includes('<p class="fecho">/audit</p>'), "o fecho"),
    ...espera(html.includes('<span class="et">Alta</span>'), "a prioridade"),
    ...espera(html.includes('<div class="bloqueado">Bloqueado: espera pelo pacote</div>'), "o motivo do bloqueio"),
    ...espera(html.includes('<div class="nota">fazer se houver dados</div>') && !/fazer se houver dados<\/div><div class="bloqueado">/.test(html), "a Nota, sem a marca de bloqueio"),
  ];
});

console.log("\n  Os IDs e o texto\n");
const IDS = new Map([["B1", "t-B1"], ["T9", "f-T9"]]);
caso("um ID aberto abre o cartao, um fechado o detalhe do arquivo, e um que nao existe fica texto (palavra inteira)", () => {
  const h = renderTexto("ver B1, T9, B12 e XB1", IDS);
  return espera(h === 'ver <a class="id" href="#t-B1">B1</a>, <a class="id" href="#f-T9">T9</a>, B12 e XB1', h);
});
caso("um ID dentro de um URL, do texto de um link ou de codigo nao vira link", () => {
  const h = renderTexto("[B1](https://e.x/B1) `B1`", IDS);
  return espera(h === '<a href="https://e.x/B1" rel="noopener noreferrer" target="_blank">B1</a> <code>B1</code>', h);
});
caso("o tokenizador: negrito com codigo, `)` no URL, `]` no texto, `**` sem fecho — sem markup partido", () => {
  const casos = ["**a `b` c**", "[x](https://e.x/Foo_(bar))", "[a]b](https://e.x)", "**sem fecho e <i>"];
  const hs = casos.map((c) => renderTexto(c, IDS));
  return hs.flatMap((h, i) => [...espera(!/<i>/.test(h), `${casos[i]} -> markup cru: ${h}`), ...espera(!/href="[^"]*"[^ >]/.test(h), `${casos[i]} -> atributo partido: ${h}`)]);
});
// A lista numa constante, e a chamada numa linha propria: as aspas misturadas de um URL hostil baralhavam quem le
// o codigo linha a linha (o `check-codigo-morto` deixava de ver a chamada).
const URLS_HOSTIS = ["javascript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "java&#115;cript:alert(1)", "https://x\" onmouseover=\"alert(1)", "data:text/html,x"];
caso("os URLs: so `http(s)://`, testados no texto CRU", () =>
  URLS_HOSTIS.flatMap((u) => {
    const r = urlSegura(u);
    return espera(r === null, `passou: ${u}`);
  }));

console.log("\n  A seguranca: o mesmo texto hostil em todos os campos\n");
const H = `<x"'&>`;
const HOSTIL_ESCAPADO = "&lt;x&quot;&#39;&amp;&gt;";
function vistaHostil() {
  const ativo = troca(ACTIVE_OK, [
    ["### Sprint 2 — o que esta aberto\n", `### Sprint 2 ${H}\n> Objetivo: ${H}\n> Fecho: ${H}\n`],
    ["| Ordem | ID | Descricao | Esforco | Depende de |\n|-------|-----|-----------|---------|------------|\n| 1 | B2 | outra coisa | M | — |\n| 2 | UX1 | melhorar algo | S | B2 |", `| Ordem | ID | Descricao | Esforco | Prioridade | Depende de |\n|---|---|---|---|---|---|\n| 1 | B2 | x | M | ${H} | Bloqueado: ${H} |\n| 2 | UX1 | x | M | | B2 |\n| 3 | ${H} | x | S | | — |`],
    ["| B1 | Pendente | algo |", `| B1 | Pendente | ${H} \`${H}\` [${H}](https://e.x/?a=1&b=2) [${H}](javascript:alert(1)) </script> |`],
    ["**Proximo:** B2", `**Proximo:** B2 ${H}`],
    ["| ID | Estado | Problema | Ficheiro(s) | Severidade | Esforco | Pagina afetada |", `| ID | Estado | Problema | Ficheiro(s) | Severidade | Esforco | ${H} |`],
    ["|----|-----------|---------|------|\n| | | | |", `|----|-----------|---------|------|\n| B1 | x | S | ${H} |`],
  ]);
  const arquivo = troca(ARCHIVE_OK, [["| B3 | Bug | bug fechado | Concluido | S1 |", `| B3 | ${H} | ${H} </script> | Concluido | S1 |`], ["| S1 | primeiro | v0.1.0 |", `| S1 | ${H} | v0.1.0 |`], ["| T1 | Tecnica |", `| ${H} | Bug | z | Concluido | S1 | v0.1.0 | 2026-01-01 |\n| T1 | Tecnica |`]]);
  return vista(ativo, arquivo, { erro: H });
}
caso("nenhum campo sai cru (o titulo, a descricao, o codigo, os links, as colunas, o bloco, a nota, os fechados, o indice, o erro)", () => {
  const html = vistaHostil();
  const corpo = html.slice(0, html.indexOf('<script type="application/json"'));
  // Sem distinguir a caixa: o leitor poe os IDs em maiusculas (um ID hostil chega como `<X"…`).
  return [...espera(!/<x"/i.test(corpo), `ha texto hostil cru: ...${corpo.slice(Math.max(0, corpo.indexOf("<x") - 60), corpo.indexOf("<x") + 30)}...`), ...espera(corpo.split(HOSTIL_ESCAPADO).length > 12, `o escapado aparece ${corpo.split(HOSTIL_ESCAPADO).length - 1} vezes`)];
});
caso("a faixa de erro (a do CLI e a do gerador e a mesma) escapa a mensagem", () =>
  espera(faixaDeErro(`nao li ${H}`).includes(`nao li ${HOSTIL_ESCAPADO}`) && !/<x"/i.test(faixaDeErro(H)), faixaDeErro(H)));
caso("o `&` de um URL valido escapa-se no href, e o `javascript:` fica texto", () => {
  const html = vistaHostil();
  return [...espera(html.includes('href="https://e.x/?a=1&amp;b=2"'), "o href com o & cru"), ...espera(!/href="javascript/i.test(html), "um href javascript:")];
});
caso("o JSON dos dados nao fecha o `<script>`, e ha exatamente dois `<script` (os dados e o inline)", () => {
  const html = vistaHostil();
  const json = /<script type="application\/json" id="dados">([^]*?)<\/script>/i.exec(html)?.[1] ?? "";
  return [...espera(json.length > 0 && !json.includes("</") && !json.includes("<"), `o JSON tem um "<": ${json.slice(0, 80)}`), ...espera((html.match(/<script/g) ?? []).length === 2, `scripts: ${(html.match(/<script/g) ?? []).length}`)];
});
caso("uma celula de ID hostil da um cartao cinzento escapado, sem id=, data-id nem href", () => {
  const html = vistaHostil();
  return [...espera(html.includes("<li class=\"cartao cinzento\"><b>&lt;X&quot;&#39;&amp;&gt;</b>"), "o cinzento (o ID em maiusculas, escapado)"), ...espera(!/(id|href)="[^"]*&lt;x/i.test(html), "um atributo com o ID hostil")];
});

console.log("\n  A rede e a CSP\n");
const REDE = /\bsrc=|srcset|url\(|@import|<iframe|<object|<embed|<form|formaction|poster=|ping=|background=|<link\b|<base\b|http-equiv="refresh"|fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|new Image|import\(|window\.open|location\s*=/i;
caso("nada vai a rede, e os href sao so ancoras ou links das descricoes", () => {
  const html = vistaHostil();
  // Um href de rede so num `<a` (um link que se clica): um `<link href>` era uma folha ou uma fonte de fora.
  const hrefs = [...html.matchAll(/<(\w+)[^>]*\shref="([^"]*)"/g)].filter(([, tag, h]) => !h.startsWith("#") && !(tag === "a" && /^https?:\/\//.test(h))).map((m) => m[0]);
  return [...espera(!REDE.test(html), `um recurso da rede: ${html.match(REDE)?.[0]}`), ...espera(hrefs.length === 0, `hrefs estranhos: ${hrefs}`), ...espera(REDE.test(`${html}<img src="https://x">`) && REDE.test(`${html}<link href="https://x">`), "CONTROLO: o detetor nao ve um <img src> ou um <link>")];
});
caso("a CSP exata, com o hash do script inline que la esta", () => {
  const html = vista();
  const script = /<script>([^]*?)<\/script>/i.exec(html)?.[1] ?? "";
  const hash = createHash("sha256").update(script, "utf8").digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src 'none'`;
  return espera(html.includes(`<meta http-equiv="Content-Security-Policy" content="${csp}">`), "a CSP nao e a esperada");
});

console.log("\n  O resto\n");
caso("o mesmo backlog, com a mesma hora, da o mesmo HTML; e a hora em ISO UTC, no <time> e no JSON", () => [...espera(vista() === vista(), "dois HTML diferentes"), ...espera(vista().includes('<time datetime="2026-11-06T10:00:00Z">'), "a hora"), ...espera(vista().includes(`"geradaEm":${AGORA.getTime()}`), "o JSON nao tem a hora passada")]);
caso("o --vigiar: a pagina sabe-o (o texto e o JSON que o JS le), e sem ele diz para voltar a gerar", () => [...espera(vista(undefined, undefined, { vigiar: true }).includes("atualizada sozinha") && vista(undefined, undefined, { vigiar: true }).includes('"vigiar":true'), "com"), ...espera(vista().includes("volte a gerar depois de mexer") && vista().includes('"vigiar":false'), "sem")]);
caso("agrupar por tipo: um segundo quadro com uma coluna por secao e os mesmos cartoes abertos", () => {
  const html = vista();
  const tipo = /<main class="quadro" id="por-tipo" hidden>([^]*?)<\/main>/.exec(html)?.[1] ?? "";
  const ids = (h) => [...h.matchAll(/href="#t-(\w+)"><b>/g)].map((m) => m[1]).sort().join();
  return [...espera((tipo.match(/data-tipo-col=/g) ?? []).length === 4, "4 colunas por tipo"), ...espera(ids(tipo) === ids(porBloco(html)), `${ids(tipo)} != ${ids(porBloco(html))}`), ...espera(html.includes('<select id="f-mostrar"'), "o seletor")];
});
caso("o detalhe de um aberto tem tudo: o tipo, onde esta planeado e com que Ordem, o Depende de, o bloqueio, a nota e os pedidos", () => {
  const ativo = troca(ACTIVE_OK, [
    ["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B2; Bloqueado: espera pelo X |"],
    ["|----|-----------|---------|------|\n| | | | |", "|----|-----------|---------|------|\n| B1 | algo | S | fazer se houver dados |"],
  ]);
  const html = vista(ativo);
  const ux1 = /<section class="detalhe" id="t-UX1"[^>]*>([^]*?)<\/section>/.exec(html)?.[1] ?? "";
  const b1 = /<section class="detalhe" id="t-B1"[^>]*>([^]*?)<\/section>/.exec(html)?.[1] ?? "";
  return [
    ...espera(ux1.includes("<dt>Tipo</dt><dd>UX</dd><dt>Estado</dt><dd>Pendente</dd>"), "o tipo e, logo a seguir, o estado"),
    ...espera(/id="t-B2"[^>]*>[^]*?<dt>Estado<\/dt><dd>A Fazer \(em curso\)<\/dd>/.test(html), "o A Fazer e o em curso"),
    ...espera((ux1.match(/<dt>estado<\/dt>/gi) ?? []).length === 1, "o estado repetido nas colunas"),
    ...espera(ux1.includes("<dt>Descricao (melhoria)</dt><dd>melhorar algo</dd>"), "a descricao com o nome da tabela"),
    ...espera(/<section class="detalhe" id="t-B2"[^>]*>[^]*?<dt>E dependencia de<\/dt><dd><a class="id" href="#t-UX1">UX1<\/a><\/dd>/.test(html), "o B2 nao diz que o UX1 depende dele"),
    ...espera(ux1.includes("<dt>Planeado em</dt><dd>Sprint 2 — o que esta aberto — Ordem 2</dd>"), "onde e com que Ordem"),
    ...espera(ux1.includes('<dt>Depende de</dt><dd><a class="id" href="#t-B2">B2</a></dd>'), "o Depende de"),
    ...espera(ux1.includes("<dt>Bloqueado</dt><dd>espera pelo X</dd>"), "o bloqueio"),
    ...espera(ux1.includes("passa o UX1 a A Fazer"), "os pedidos"),
    ...espera(b1.includes("<dt>Planeado em</dt><dd>Pendentes (sem sprint)</dd>") && b1.includes("<dt>Nota</dt><dd>fazer se houver dados</dd>"), "nos Pendentes, com a nota"),
  ];
});
caso("cada detalhe tem um botao para fechar; os fechados sao uma tabela com o Tipo, o Estado, o Sprint, a Versao e a Data", () => {
  const html = vista();
  const detalhes = (html.match(/<section class="detalhe"/g) ?? []).length;
  return [...espera(detalhes > 0 && (html.match(/<button type="button" class="fechar" aria-label="Fechar o detalhe">/g) ?? []).length === detalhes, "um detalhe sem o botao"), ...espera((html.match(/<section class="detalhe" id="([tf]-\w+)" role="dialog" aria-modal="true" aria-labelledby="h-\1"/g) ?? []).length === detalhes, "um detalhe sem o papel de dialogo modal"), ...espera(/<tr data-busca="[^"]*"><td><a href="#f-B3">B3<\/a><\/td><td>Bug<\/td><td>Concluido<\/td><td>bug fechado<\/td><td>S1<\/td><td>v0\.1\.0<\/td><td>2026-01-01<\/td><\/tr>/.test(html), "a linha do B3 na tabela")];
});
caso("o CSS respeita o hidden (senao o .quadro { display: flex } mostrava os dois quadros ao mesmo tempo)", () => espera(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(CSS), "sem a regra [hidden]"));
caso("no quadro por tipo, o cartao tem os mesmos campos (prioridade, Bloqueado, nota) e a ordem e pelo prefixo e numero", () => {
  const ativo = troca(ACTIVE_OK, [
    ["| Ordem | ID | Descricao | Esforco | Depende de |\n|-------|-----|-----------|---------|------------|\n| 1 | B2 | outra coisa | M | — |", "| Ordem | ID | Descricao | Esforco | Prioridade | Depende de |\n|---|---|---|---|---|---|\n| 1 | B2 | outra coisa | M | Alta | Bloqueado: espera |"],
    ["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | | B2 |"],
    ["| B1 | Pendente | algo |", "| B10 | Pendente | dez |\n| B9 | Pendente | nove |\n| B1 | Pendente | algo |"],
  ]);
  const html = vista(ativo);
  const tipo = /<main class="quadro" id="por-tipo" hidden>([^]*?)<\/main>/.exec(html)?.[1] ?? "";
  const b2 = /<li class="cartao" data-i="\d+" data-tipo="0" data-curso><a class="abre" href="#t-B2">[^]*?<\/li>/.exec(tipo)?.[0] ?? "";
  const bugs = [...(/data-tipo-col="0">([^]*?)<\/section>/.exec(tipo)?.[1] ?? "").matchAll(/href="#t-(\w+)"><b>/g)].map((m) => m[1]);
  return [...espera(b2.includes('<span class="et">Alta</span>') && b2.includes('class="bloqueado"'), `o B2 no quadro por tipo: ${b2.slice(0, 160)}`), ...espera(bugs.join() === "B2,B1,B9,B10", `a ordem dos Bugs: ${bugs}`)];
});
caso("so os blocos sao sprints: os Pendentes e o 'Sem bloco' nao tem o data-sprint", () => {
  const html = vista();
  return espera(/data-bloco="\d+"><h2>Sem bloco/.test(html) && !/data-sprint><h2>(Sem bloco|Pendentes)/.test(html), "o data-sprint");
});
caso("os pedidos: os tres rotulos curtos, e o nome acessivel com o pedido inteiro", () => [
  ...espera(rotuloDe("passa o B1 a A Fazer") === "→ A Fazer" && rotuloDe("fecha o B1 como Concluido") === "✓ Concluido" && rotuloDe("cancela o B1") === "✕ Cancelar", "os rotulos"),
  ...espera(vista().includes('aria-label="copiar o pedido: cancela o B1">✕ Cancelar</button>'), "o aria-label"),
]);
caso("E dependencia de: nem o proprio, nem uma linha riscada; e um ID repetido no Historico da um so detalhe", () => {
  const ativo = troca(ACTIVE_OK, [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B2 |\n| 3 | ~~B1~~ | riscado | S | B2 |"]]);
  const arquivo = troca(ARCHIVE_OK, [["| B3 | Bug | bug fechado |", "| B3 | Bug | outra vez | Concluido | S1 | v0.1.0 | 2026-01-01 |\n| B3 | Bug | bug fechado |"]]);
  const html = vista(ativo, arquivo);
  const b2 = /<section class="detalhe" id="t-B2"[^]*?<\/section>/.exec(html)?.[0] ?? "";
  return [...espera(b2.includes('<dt>E dependencia de</dt><dd><a class="id" href="#t-UX1">UX1</a></dd>'), `o B2: ${/E dependencia de<\/dt><dd>[^]*?<\/dd>/.exec(b2)?.[0]}`), ...espera((html.match(/id="f-B3"/g) ?? []).length === 1, "dois detalhes do B3")];
});
caso("a chave do browser vai no JSON (por projeto)", () => espera(vista(undefined, undefined, { chave: "vista-abc" }).includes('"chave":"vista-abc"'), "sem a chave"));
caso("o 'Mostrar': tudo por bloco, tudo por tipo, uma opcao por bloco (b:k) e uma por tipo (t:k)", () => {
  const html = vista();
  const sel = /<select id="f-mostrar"[^>]*>([^]*?)<\/select>/.exec(html)?.[1] ?? "";
  const colunas = [...html.matchAll(/<section class="coluna" data-bloco="(\d+)"(?: data-sprint)?><h2>([^<]*)<\/h2>/g)].map((m) => `b:${m[1]}:${m[2]}`);
  const blocos = [...sel.matchAll(/<option value="(b:\d+)">([^<]*)<\/option>/g)].map((m) => `${m[1]}:${m[2]}`);
  const tipos = [...sel.matchAll(/<option value="(t:\d+)">/g)].length;
  return [
    ...espera(colunas.length > 0 && JSON.stringify(colunas) === JSON.stringify(blocos), `colunas ${colunas} != opcoes ${blocos}`),
    ...espera(tipos === 4, `opcoes de tipo: ${tipos}`),
    ...espera(sel.includes('<option value="bloco">') && sel.includes('<option value="sprints">So os sprints</option>') && sel.includes('<option value="tipo">So os tipos'), "sem o 'tudo', o 'so os sprints' ou o 'so os tipos'"),
    // So os blocos sao sprints: os Pendentes (e o "Sem bloco") nao levam o `data-sprint`.
    ...espera(/data-bloco="0" data-sprint><h2>Sprint 2/.test(html) && /data-bloco="\d+"><h2>Pendentes \(sem sprint\)/.test(html), "o data-sprint"),
  ];
});
caso("o que o check-backlog acusa, a vista diz (um heading do Historico renomeado nao e um quadro limpo)", () => {
  const html = vista(ACTIVE_OK, troca(ARCHIVE_OK, [["## Historico (Fechados)", "## Fechados"]]));
  return [...espera(/class="aviso"[^>]*>O check-backlog tem \d+ aviso\(s\); nao encontrei o Historico/.test(html), "sem o aviso"), ...espera(!vista().includes('class="aviso"'), "CONTROLO: a fixture valida deu um aviso")];
});
caso("o JS inline e JavaScript valido, e as funcoes injetadas correm sozinhas (sem imports)", () => {
  const script = /<script>([^]*?)<\/script>/i.exec(vista())?.[1] ?? "";
  try {
    new Function(script);
    const f = new Function(`${passaFiltro.toString()}\n${vistaParou.toString()}\nreturn [passaFiltro({ tipo: "UX", esforco: "s", prioridade: "", busca: "x" }, {}), vistaParou(0, 1, true, false, 30000)];`)();
    return espera(f[0] === true && f[1] === false, `as funcoes deram ${f}`);
  } catch (err) {
    return [`o script nao e valido: ${err instanceof Error ? err.message : String(err)}`];
  }
});
caso("as funcoes do JS: o filtro, o 'parou', os pedidos e o titulo", () => [
  ...espera(passaFiltro({ tipo: "UX", esforco: "s", prioridade: "", busca: "ux1 algo" }, { q: "ALGO", tipo: "UX" }), "o filtro devia passar"),
  ...espera(!passaFiltro({ tipo: "UX", esforco: "s", prioridade: "", busca: "ux1" }, { tipo: "Bugs" }), "o filtro devia barrar"),
  ...espera(vistaParou(0, 90001, true, false, 30000) && !vistaParou(0, 90001, false, false, 30000) && !vistaParou(0, 90001, true, true, 30000) && !vistaParou(0, 89000, true, false, 30000), "o parou"),
  ...espera(!vistaParou(0, 10 ** 9, true, false, 0), "com a batida desligada, uma vista sem gravacoes nao esta parada"),
  ...espera(passaFiltro({ tipo: "UX", esforco: "s", prioridade: "Alta", busca: "x" }, { prioridade: "alt" }), "o filtro da prioridade e como a pesquisa (caixa e parte)"),
  ...espera(pedidosDe("pendente", "B1")[0] === "passa o B1 a A Fazer" && pedidosDe("a fazer", "B1")[0] === "fecha o B1 como Concluido" && pedidosDe("concluido", "B1").length === 0, "os pedidos"),
  ...espera(tituloDe("**Export PDF**: corta a linha") === "Export PDF" && tituloDe("um. dois") === "um" && tituloDe("x".repeat(90)).length === 80, "o titulo"),
  // O negrito a meio e enfase, nao titulo (os fechados de um derivado davam "e", "dark-only"): e a 1.a frase.
  ...espera(tituloDe("Tema em **dark-only** por omissao. Depois o claro") === "Tema em dark-only por omissao", `o negrito a meio: ${tituloDe("Tema em **dark-only** por omissao. Depois o claro")}`),
]);
caso("o mesmo ID duas vezes no mesmo bloco da UM cartao; um riscado numa tabela por tipo diz que esta riscado", () => {
  const ativo = troca(ACTIVE_OK, [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B2 |\n| 3 | UX1 | outra vez | S | — |"], ["| B1 | Pendente | algo |", "| ~~B1~~ | Pendente | algo |"]]);
  const html = vista(ativo);
  return [...espera((porBloco(html).match(/href="#t-UX1"><b>/g) ?? []).length === 1, `cartoes UX1: ${(porBloco(html).match(/href="#t-UX1"><b>/g) ?? []).length}`), ...espera(/cinzento"><b>~~B1~~<\/b> <small>riscado/.test(html), "o riscado")];
});
caso("uma linha riscada num BLOCO fica cinzenta no seu lugar; o ticket aberto vai para onde iria sem ela", () => {
  const ativo = troca(ACTIVE_OK, [["| 2 | UX1 | melhorar algo | S | B2 |", "| 2 | UX1 | melhorar algo | S | B2 |\n| 3 | ~~B1~~ | algo | S | B2 |"]]);
  const html = vista(ativo);
  const sprint = /data-bloco="0" data-sprint><h2>Sprint 2[^]*?<\/section>/.exec(porBloco(html))?.[0] ?? "";
  const sem = /<h2>Sem bloco[^]*?<\/section>/.exec(porBloco(html))?.[0] ?? "";
  return [
    ...espera(/cinzento"><b>~~B1~~<\/b> <small>riscado/.test(sprint), `no Sprint 2: ${sprint.slice(0, 200)}`),
    ...espera(!sprint.includes('href="#t-B1"'), "o B1 vivo no Sprint 2"),
    ...espera(sem.includes('href="#t-B1"'), "o B1 aberto nao foi para o 'Sem bloco'"),
    // CONTROLO: sem o risco, o B1 e um cartao vivo no Sprint 2 (o caso distingue as duas formas).
    ...espera(/data-bloco="0" data-sprint><h2>Sprint 2[^]*?href="#t-B1"/.test(porBloco(vista(troca(ativo, [["~~B1~~", "B1"]])))), "o controlo"),
  ];
});
caso("uma linha Concluido deixada numa tabela por tipo do ativo tem um cartao cinzento (o cabecalho conta-a)", () => {
  const html = vista(troca(ACTIVE_OK, [["| B1 | Pendente | algo |", "| B1 | Concluido | algo |"]]));
  return [
    ...espera(cinzentosDe(html).includes("B1:fechado no ativo: mover a linha para o arquivo"), `cinzentos: ${cinzentosDe(html)}`),
    // CONTROLO: Pendente, e um cartao vivo, nao cinzento.
    ...espera(!cinzentosDe(vista()).some((c) => c.startsWith("B1:")), "o B1 Pendente ficou cinzento"),
  ];
});
caso("o script inline vai com o fim de linha normalizado (o hash e o do texto que o browser ve)", () => [
  // Com fonte CRLF de facto (num checkout LF o caso de baixo passava mesmo sem a normalizacao).
  ...espera(normalizaFimDeLinha("a\r\nb\rc\n") === "a\nb\nc\n", JSON.stringify(normalizaFimDeLinha("a\r\nb\rc\n"))),
  ...espera(!/\r/.test(/<script>([^]*?)<\/script>/i.exec(vista())?.[1] ?? "\r"), "ha um \\r no script"),
]);
caso("um ID invalido no Historico fica uma linha so de texto nos Fechados (e o total continua a bater)", () => {
  const html = vista(ACTIVE_OK, troca(ARCHIVE_OK, [["| B3 | Bug | bug fechado |", "| ~~B3~~ | Bug | bug fechado |"]]));
  return [
    ...espera(/<tr data-busca="[^"]*" class="invalido"><td colspan="7">~~B3~~ bug fechado <small>/.test(html), "a linha do ~~B3~~"),
    // O mesmo total da fixture limpa (B3, T1, F1): a linha invalida nao sumiu.
    ...espera(/<summary>Fechados \(\d+\)/.exec(html)?.[0] === /<summary>Fechados \(\d+\)/.exec(vista())?.[0], `o total: ${/<summary>Fechados \(\d+\)/.exec(html)?.[0]}`),
    // CONTROLO: com o ID valido, nenhuma linha invalida.
    ...espera(!vista().includes('class="invalido"'), "uma linha invalida na fixture limpa"),
  ];
});
caso("uma linha dos Pendentes com um ID que nao existe da um cartao cinzento na coluna dos Pendentes", () => {
  const html = vista(troca(ACTIVE_OK, [["|----|-----------|---------|------|\n| | | | |", "|----|-----------|---------|------|\n| B9 | algo | S | x |"]]));
  const pend = /<h2>Pendentes \(sem sprint\)[^]*?<\/section>/.exec(porBloco(html))?.[0] ?? "";
  return [...espera(/cinzento"><b>B9<\/b> <small>nao existe/.test(pend), `nos Pendentes: ${pend.slice(0, 200)}`), ...espera(!/<b>B9<\/b>/.test(porBloco(vista())), "o controlo")];
});
caso("os pedidos estao em cada cartao aberto, com o texto do estado", () => {
  const html = vista();
  // O botao tem o rotulo curto e o pedido inteiro no `title` (e no JSON, que e o que se copia).
  return [
    ...espera(/href="#t-B2"[^]*?title="copiar: fecha o B2 como Concluido" aria-label="[^"]*">✓ Concluido</.test(html), "o do A Fazer"),
    ...espera(/href="#t-B1"[^]*?title="copiar: passa o B1 a A Fazer" aria-label="[^"]*">→ A Fazer</.test(html), "o do Pendente"),
    ...espera(html.includes('"pedidos":["passa o B1 a A Fazer","cancela o B1"]'), "o texto que se copia, no JSON"),
    // Em CADA cartao aberto (dos dois quadros): os botoes sao os do pedidosDe do estado dele, pela ordem.
    ...[...html.matchAll(/<li class="cartao" data-i="\d+"[^>]*?( data-curso)?><a class="abre" href="#t-(\w+)">[^]*?<\/li>/g)].flatMap((m) => {
      const esperado = pedidosDe(m[1] ? "a fazer" : "pendente", m[2]).map((p) => `title="copiar: ${p}"`);
      const tem = [...m[0].matchAll(/title="copiar: [^"]*"/g)].map((x) => x[0]);
      return espera(esperado.length > 0 && JSON.stringify(tem) === JSON.stringify(esperado), `${m[2]}: ${tem}`);
    }),
  ];
});
caso("o CSS e o JS inline nao tem vocabulario de recusa (senao o modulo deixava de ser so de dados)", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "lib", "backlog-vista-assets.mjs"), "utf8");
  return espera(!/(?<![\w.$])(?:warn|fatal|flag|deny|problems?\.push|problemas\.push|throw new Error)\(/.test(src), "tem");
});

console.log(`\n  ${passed} passaram, ${falhas.length} falharam.`);
process.exit(falhas.length ? 1 : 0);
