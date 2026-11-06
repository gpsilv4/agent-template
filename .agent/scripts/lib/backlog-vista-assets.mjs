/**
 * O CSS e o JS inline da vista do backlog (#446) — {{PROJECT_NAME}}
 *
 * So texto: o gerador (`lib/backlog-vista.mjs`) poe-no na pagina, e calcula o hash do script para a CSP. O JS nao monta
 * HTML: mostra e esconde o que o gerador ja renderizou, e escreve so por `textContent`. As decisoes dele (o filtro, se o
 * `--vigiar` parou) sao funcoes do gerador, testadas em Node e injetadas antes deste corpo (`fn.toString()`).
 * Sem vocabulario de recusa (e um modulo so de dados): um desses nomes aqui pedia-lhe um par na varredura.
 */

export const CSS = `
:root {
  color-scheme: light dark;
  --fundo: #f4f5f8; --painel: #eceef3; --cartao: #ffffff; --texto: #1b1f27; --suave: #5d6472; --linha: #dde1e8;
  --acento: #2f57d0; --curso: #9a4f00; --bloq: #c23a32; --ok: #1f8a4c;
  --t0: #d64545; --t1: #8a5cf5; --t2: #d48a00; --t3: #1f9d73;
  --sombra: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
  --sombra-alta: 0 8px 24px rgba(16,24,40,.14);
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #111318; --painel: #181b22; --cartao: #20242c; --texto: #e7eaf0; --suave: #98a1b0; --linha: #2e333d;
    --acento: #7aa2ff; --curso: #ffae57; --bloq: #ff7f76; --ok: #4cd394;
    --t0: #ff7a7a; --t1: #b49bff; --t2: #ffc34d; --t3: #4fd6a6;
    --sombra: 0 1px 2px rgba(0,0,0,.4); --sombra-alta: 0 10px 30px rgba(0,0,0,.5);
  }
}
* { box-sizing: border-box; }
/* O [hidden] vence as regras de autor (.quadro { display: flex } escondia-o do browser, e os dois quadros apareciam). */
[hidden] { display: none !important; }
body { margin: 0; padding: 20px 24px 40px; background: var(--fundo); color: var(--texto); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: var(--acento); }
code { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--painel); padding: 1px 4px; border-radius: 4px; }
header { margin: -20px -24px 0; padding: 18px 24px 6px; }
.topo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 20px; }
h1 { font-size: 22px; letter-spacing: -.01em; margin: 0; }
.numeros { display: flex; gap: 14px; color: var(--suave); font-size: 13px; }
.numeros b { color: var(--texto); font-size: 15px; }
header p { margin: 6px 0; color: var(--suave); }
.progresso b { color: var(--texto); }
progress { width: 220px; height: 8px; vertical-align: middle; border: 0; border-radius: 999px; overflow: hidden; background: var(--painel); -webkit-appearance: none; appearance: none; }
progress::-webkit-progress-bar { background: var(--painel); border-radius: 999px; }
progress::-webkit-progress-value { background: var(--ok); border-radius: 999px; }
progress::-moz-progress-bar { background: var(--ok); border-radius: 999px; }
.gerada { font-size: 12px; }
#parou { color: var(--bloq); font-weight: 600; }
/* So os filtros ficam presos ao topo: com um "A seguir" longo, o cabecalho inteiro tapava um terco do quadro. */
.filtros { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; margin: 0 -24px 14px; padding: 10px 24px; background: color-mix(in srgb, var(--fundo) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--linha); }
.seguir { margin: 6px 0; color: var(--suave); font-size: 13px; }
.seguir summary { cursor: pointer; list-style: none; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.seguir summary::-webkit-details-marker { display: none; }
.seguir[open] summary { display: block; }
.filtros input, .filtros select { min-height: 36px; padding: 6px 10px; border: 1px solid var(--linha); border-radius: 8px; background: var(--cartao); color: var(--texto); font: inherit; }
.filtros input[type=search] { min-width: 200px; }
.quadro { display: flex; gap: 14px; overflow-x: auto; align-items: flex-start; padding: 2px 2px 10px; scroll-snap-type: x proximity; }
.coluna { flex: 0 0 300px; background: var(--painel); border: 1px solid var(--linha); border-radius: 12px; padding: 12px; scroll-snap-align: start; position: relative; }
.coluna h2 { font-size: 14px; font-weight: 650; margin: 0 34px 6px 0; line-height: 1.35; }
.coluna .n { position: absolute; top: 11px; right: 12px; min-width: 24px; text-align: center; font-size: 12px; font-weight: 600; color: var(--suave); background: var(--cartao); border: 1px solid var(--linha); border-radius: 999px; padding: 0 7px; }
.coluna ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.objetivo { font-size: 12px; color: var(--suave); margin: 0 0 4px; }
.fecho { font-size: 12px; color: var(--suave); margin: 10px 0 0; padding-top: 8px; border-top: 1px dashed var(--linha); }
.coluna[data-vazia]::after { content: "Sem tickets com estes filtros."; display: block; font-size: 12px; color: var(--suave); text-align: center; padding: 10px 0 4px; }
.vazio { font-size: 12px; color: var(--suave); text-align: center; padding: 14px 0 6px; margin: 0; }
.cartao { background: var(--cartao); border: 1px solid var(--linha); border-left: 4px solid var(--linha); border-radius: 8px; padding: 9px 10px; box-shadow: var(--sombra); transition: box-shadow .15s ease, transform .15s ease; }
.cartao:hover { box-shadow: var(--sombra-alta); transform: translateY(-1px); }
.cartao[data-tipo="0"] { border-left-color: var(--t0); } .cartao[data-tipo="1"] { border-left-color: var(--t1); }
.cartao[data-tipo="2"] { border-left-color: var(--t2); } .cartao[data-tipo="3"] { border-left-color: var(--t3); }
.cartao[data-curso] { outline: 1px solid color-mix(in srgb, var(--curso) 45%, transparent); }
.cartao.cinzento { opacity: .6; box-shadow: none; border-style: dashed; border-left-width: 1px; font-size: 12px; }
.cartao .abre { color: inherit; text-decoration: none; display: block; }
.cartao .abre b { color: var(--acento); margin-right: 4px; }
.curso { display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 650; color: var(--curso); background: color-mix(in srgb, var(--curso) 14%, transparent); border-radius: 999px; padding: 1px 8px; }
.ets { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.et { font-size: 11px; color: var(--suave); background: var(--painel); border-radius: 999px; padding: 1px 8px; }
.bloqueado { font-size: 12px; color: var(--bloq); background: color-mix(in srgb, var(--bloq) 10%, transparent); border-radius: 6px; padding: 4px 6px; margin-top: 6px; }
.dep, .nota { font-size: 12px; color: var(--suave); margin-top: 6px; }
.nota { border-left: 2px solid var(--linha); padding-left: 6px; }
.pedidos { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--linha); }
.pedido { font: inherit; font-size: 11px; min-height: 26px; border: 0; background: transparent; color: var(--suave); border-radius: 6px; padding: 2px 6px; cursor: pointer; }
.pedido:hover { color: var(--acento); background: var(--painel); }
.pedido:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
.copiado { width: 100%; font: inherit; font-size: 12px; margin-top: 6px; border-radius: 6px; }
#painel .detalhe { position: fixed; right: 16px; top: 16px; bottom: 16px; z-index: 3; width: min(460px, calc(100vw - 32px)); overflow: auto; background: var(--cartao); border: 1px solid var(--linha); border-radius: 12px; padding: 16px 18px; box-shadow: var(--sombra-alta); }
#painel .detalhe h2 { margin: 0 0 8px; font-size: 17px; color: var(--acento); }
.fechar { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; border-radius: 8px; font: inherit; font-size: 24px; line-height: 1; color: var(--suave); cursor: pointer; }
.fechar:hover { background: var(--painel); color: var(--texto); }
.coluna[data-tipo-col="0"] h2 { border-left: 4px solid var(--t0); padding-left: 8px; } .coluna[data-tipo-col="1"] h2 { border-left: 4px solid var(--t1); padding-left: 8px; }
.coluna[data-tipo-col="2"] h2 { border-left: 4px solid var(--t2); padding-left: 8px; } .coluna[data-tipo-col="3"] h2 { border-left: 4px solid var(--t3); padding-left: 8px; }
.rolar { overflow-x: auto; }
.tabela-fechados { width: 100%; border-collapse: collapse; font-size: 13px; }
.tabela-fechados th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--suave); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--linha); white-space: nowrap; }
.tabela-fechados td { padding: 6px 8px; border-bottom: 1px solid var(--linha); vertical-align: top; }
.tabela-fechados td:not(:nth-child(4)) { white-space: nowrap; color: var(--suave); }
.tabela-fechados td:first-child a { font-weight: 600; }
.tabela-fechados tbody tr:hover { background: var(--cartao); }
dt { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--suave); margin-top: 10px; } dd { margin: 2px 0 0; }
.meta { color: var(--suave); font-size: 12px; }
.detalhe .meta { margin-top: 16px; } .pedidos-detalhe { margin: 4px 0 0; padding-left: 18px; font-size: 12px; }
details { margin-top: 22px; background: var(--painel); border: 1px solid var(--linha); border-radius: 12px; padding: 10px 14px; }
summary { cursor: pointer; font-weight: 600; }
details input { margin: 10px 0; min-height: 34px; padding: 6px 10px; border: 1px solid var(--linha); border-radius: 8px; background: var(--cartao); color: var(--texto); font: inherit; width: min(360px, 100%); }
.erro { background: var(--bloq); color: #fff; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; }
.aviso { border: 1px solid var(--curso); color: var(--curso); padding: 8px 12px; border-radius: 8px; margin: 0 0 12px; }
@media (max-width: 640px) {
  body { padding: 14px 14px 32px; }
  header { margin: -14px -14px 0; padding: 14px 14px 4px; }
  .filtros { margin: 0 -14px 12px; padding: 8px 14px; }
  .quadro { flex-direction: column; scroll-snap-type: none; }
  .coluna { flex: 1 1 auto; width: 100%; }
  .filtros input[type=search] { min-width: 0; flex: 1 1 100%; }
  .pedido { min-height: 44px; padding: 4px 10px; }
}
@media (prefers-reduced-motion: reduce) { .cartao { transition: none; } .cartao:hover { transform: none; } }
`;

export const JS_CORPO = `
(function () {
  var dados = JSON.parse(document.getElementById("dados").textContent);
  // As chaves levam o projeto: duas vistas abertas do disco partilham o localStorage do browser.
  var K = function (k) { return dados.chave + "-" + k; };
  var guarda = function (k, v) { try { localStorage.setItem(K(k), v); } catch (e) { /* sem localStorage: segue */ } };
  var le = function (k) { try { return localStorage.getItem(K(k)) || ""; } catch (e) { return ""; } };
  var fm = document.getElementById("f-mostrar"), q = document.getElementById("q"), ft = document.getElementById("f-tipo"), fe = document.getElementById("f-esforco"), fp = document.getElementById("f-prioridade");
  var antes = {}; try { antes = JSON.parse(le("filtros") || "{}"); } catch (e) { antes = {}; }
  // O "Mostrar" guarda-se pelo TEXTO da opcao: um bloco novo antes do guardado mudava o indice.
  fm.value = "bloco";
  Array.prototype.forEach.call(fm.options, function (o) { if (o.textContent === antes.mostrarTexto) fm.value = o.value; });
  q.value = antes.q || ""; ft.value = antes.tipo || ""; fe.value = antes.esforco || ""; fp.value = antes.prioridade || "";
  function aplica() {
    var f = { mostrar: fm.value, q: q.value, tipo: ft.value, esforco: fe.value, prioridade: fp.value };
    var porTipo = f.mostrar === "tipo" || f.mostrar.indexOf("t:") === 0;
    document.getElementById("por-bloco").hidden = porTipo;
    document.getElementById("por-tipo").hidden = !porTipo;
    ft.disabled = f.mostrar.indexOf("t:") === 0;
    if (ft.disabled) f.tipo = "";
    document.querySelectorAll("#por-bloco .coluna").forEach(function (col) { col.hidden = (f.mostrar.indexOf("b:") === 0 && "b:" + col.getAttribute("data-bloco") !== f.mostrar) || (f.mostrar === "sprints" && !col.hasAttribute("data-sprint")); });
    document.querySelectorAll("#por-tipo .coluna").forEach(function (col) { col.hidden = f.mostrar.indexOf("t:") === 0 && "t:" + col.getAttribute("data-tipo-col") !== f.mostrar; });
    document.querySelectorAll(".cartao[data-i]").forEach(function (li) { li.hidden = !passaFiltro(dados.cartoes[Number(li.getAttribute("data-i"))], f); });
    // Com um filtro de cartoes ativo, os cinzentos saem, e cada coluna conta e diz so o que mostra.
    var filtrado = f.q || f.tipo || f.esforco || f.prioridade;
    document.querySelectorAll(".cartao.cinzento").forEach(function (li) { li.hidden = Boolean(filtrado); });
    document.querySelectorAll(".coluna").forEach(function (col) {
      var n = col.querySelectorAll(".cartao[data-i]:not([hidden])").length;
      var c = col.querySelector(".n"); if (c) c.textContent = String(n);
      if (filtrado && n === 0) col.setAttribute("data-vazia", ""); else col.removeAttribute("data-vazia");
    });
    var sel = fm.options[fm.selectedIndex];
    guarda("filtros", JSON.stringify({ mostrarTexto: sel ? sel.textContent : "", q: f.q, tipo: ft.value, esforco: f.esforco, prioridade: f.prioridade }));
  }
  [fm, q, ft, fe, fp].forEach(function (el) { el.addEventListener("input", aplica); });
  aplica();
  // O painel e um dialogo: ao abrir, o foco vai para o x; ao fechar, volta para onde estava.
  var origem = null;
  // O link do quadro visivel com este href, comparado a letra (um seletor com o href la dentro partia com uma aspa).
  var linkPara = function (href) {
    var q = document.querySelector(".quadro:not([hidden])"), achado = null;
    if (href && q) q.querySelectorAll("a[href]").forEach(function (a) { if (!achado && a.getAttribute("href") === href) achado = a; });
    return achado;
  };
  function mostra() {
    var h = location.hash, aberto = null;
    document.querySelectorAll(".detalhe").forEach(function (s) { s.hidden = "#" + s.id !== h; if (!s.hidden) aberto = s; });
    if (h.indexOf("#f-") === 0) document.getElementById("fechados").open = true;
    if (aberto) { var x = aberto.querySelector(".fechar"); if (x) x.focus(); }
    guarda("painel", h);
  }
  window.addEventListener("hashchange", mostra);
  document.addEventListener("click", function (e) { var a = e.target.closest("a[href^='#t-'], a[href^='#f-']"); if (a) origem = a; });
  if (!location.hash && le("painel")) location.hash = le("painel"); else mostra();
  var fecha = function () {
    var h = location.hash;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { location.hash = ""; }
    mostra();
    // Um painel reaberto do armazenamento nao tem origem: o foco vai para o cartao dele (senao caia no body).
    var alvo = origem && document.contains(origem) ? origem : linkPara(h);
    if (alvo) alvo.focus();
  };
  document.querySelectorAll(".fechar").forEach(function (b) { b.addEventListener("click", fecha); });
  document.addEventListener("keydown", function (e) {
    var aberto = document.querySelector(".detalhe:not([hidden])");
    if (!aberto) return;
    if (e.key === "Escape") { fecha(); return; }
    // O dialogo e modal: o Tab da a volta dentro do painel, e nao foge para o quadro por tras.
    if (e.key !== "Tab") return;
    var foc = aberto.querySelectorAll("a[href], button, textarea, [tabindex]:not([tabindex='-1'])");
    if (!foc.length) return;
    var prim = foc[0], ult = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === prim) { ult.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === ult) { prim.focus(); e.preventDefault(); }
    else if (!aberto.contains(document.activeElement)) { prim.focus(); e.preventDefault(); }
  });
  document.addEventListener("click", function (e) {
    var aberto = document.querySelector(".detalhe:not([hidden])");
    if (aberto && !aberto.contains(e.target) && !e.target.closest("a[href^='#t-'], a[href^='#f-']")) fecha();
  });
  var fech = document.getElementById("fechados");
  if (le("fechados") === "1") fech.open = true;
  fech.addEventListener("toggle", function () { guarda("fechados", fech.open ? "1" : ""); });
  var qf = document.getElementById("qf");
  var filtraFechados = function () { var t = qf.value.toLowerCase(); document.querySelectorAll(".tabela-fechados tr[data-busca]").forEach(function (tr) { tr.hidden = t !== "" && tr.getAttribute("data-busca").indexOf(t) < 0; }); guarda("qf", qf.value); };
  qf.value = le("qf"); qf.addEventListener("input", filtraFechados); filtraFechados();
  var seguir = document.querySelector(".seguir");
  if (seguir) { if (le("seguir") === "1") seguir.open = true; seguir.addEventListener("toggle", function () { guarda("seguir", seguir.open ? "1" : ""); }); }
  document.querySelectorAll(".pedido").forEach(function (b) {
    b.addEventListener("click", function () {
      var li = b.closest(".cartao"), texto = dados.cartoes[Number(li.getAttribute("data-i"))].pedidos[Number(b.getAttribute("data-p"))];
      // Sem area de transferencia: o pedido num campo para copiar a mao, que sai ao perder o foco (uma so por cartao;
      // enquanto existe, o --vigiar nao recarrega — por isso nao pode ficar para sempre).
      var mostraTexto = function () {
        var velha = li.querySelector(".copiado"); if (velha) velha.remove();
        var t = document.createElement("textarea"); t.className = "copiado"; t.readOnly = true; t.setAttribute("aria-label", "pedido para copiar"); t.textContent = texto;
        t.addEventListener("blur", function () { t.remove(); });
        li.appendChild(t); t.focus(); t.select();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(function () { b.textContent = "copiado"; }, mostraTexto); else mostraTexto();
    });
  });
  var tempo = document.querySelector("time"); tempo.textContent = new Date(dados.geradaEm).toLocaleString();
  if (vistaParou(dados.geradaEm, Date.now(), dados.vigiar, dados.erro, dados.batida)) document.getElementById("parou").hidden = false;
  // O scroll so se restaura com o --vigiar (e o recarregar dele): numa vista gerada uma vez, era um valor antigo.
  var quadroVisivel = function () { return document.querySelector(".quadro:not([hidden])"); };
  if (dados.vigiar) {
    var y = Number(le("scroll")), x = Number(le("scroll-x"));
    if (y) window.scrollTo(0, y);
    if (x && quadroVisivel()) quadroVisivel().scrollLeft = x;
    // A navegacao por Tab continua no cartao onde estava (senao voltava ao inicio a cada recarregamento).
    var focado = linkPara(le("foco"));
    if (focado && !location.hash) focado.focus({ preventScroll: true });
    var recarrega = function () {
      var el = document.activeElement, tag = el ? el.tagName : "";
      // Nao recarrega a meio de uma escolha, de uma leitura ou de uma copia: um campo com foco, um painel aberto (o scroll
      // dele e o foco voltavam ao topo de 5 em 5 s), texto selecionado, um pedido por copiar.
      var selecao = window.getSelection ? String(window.getSelection()) : "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || selecao || document.querySelector(".copiado, .detalhe:not([hidden])")) { setTimeout(recarrega, 5000); return; }
      guarda("foco", tag === "A" ? el.getAttribute("href") || "" : "");
      guarda("scroll", String(window.scrollY));
      if (quadroVisivel()) guarda("scroll-x", String(quadroVisivel().scrollLeft));
      location.reload();
    };
    setTimeout(recarrega, 5000);
  }
})();
`;
