#!/usr/bin/env node
/**
 * Testes NEGATIVOS do `check-textos-publicos.mjs` (#375) — {{PROJECT_NAME}}
 *
 * Sem rede: o leitor e injectado (`ler`, ou o `corre` do `leGitHub`) e as fixtures dizem o que o GitHub
 * devolveria. A lista vive num tmpdir proprio de cada caso (`TP3`), e os nomes sao inventados.
 *
 * O que se afirma: os tres resultados (0 limpo, 1 achado, 2 nao medido) e que o `2` nunca diz "limpo"; que um
 * nome numa tag e CONHECIDO e nao conta; que a leitura cortada no limite nao passa; e que o output cita a linha
 * da lista e nunca o nome.
 *
 *   node .agent/scripts/tests/test-textos-publicos.mjs
 */
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { correr, leGitHub, LIMITE, LIMITE_DE_REVIEWS } from "../check-textos-publicos.mjs";
import { VARIAVEL, INTERRUPTOR, RAZOES } from "../lib/nomes-proibidos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(ROOT, ".agent/scripts/check-textos-publicos.mjs");
const LISTA = "# privados\nprojeto-secreto\n";

let passed = 0;
const falhas = [];

function registar(nome, problemas, out = "") {
  if (problemas.length) {
    falhas.push({ nome, out });
    console.log(`  FAIL  ${nome}`);
    for (const p of problemas) console.log(`          ${p}`);
  } else {
    passed++;
    console.log(`  PASS  ${nome}`);
  }
}

/** Um leitor de fixture: os textos editaveis e as tags dados, sem cortes. */
const leitor = (editaveis, tags = []) => () => ({ editaveis, tags, cortadas: [], contagem: { issues: editaveis.length, tags: tags.length } });

/**
 * Corre o `correr()` com uma lista num tmpdir (`lista`: o conteudo; `null`: sem ficheiro). Devolve o exit e o output.
 * `dentro`: a lista fica dentro da `raiz` que se passa. `lista: null` e o "sem lista" real: sem a variavel, e com uma
 * `home` vazia (com a variavel apontada para um ficheiro em falta seria `ilegivel`). `desligado`: o interruptor local.
 */
function corre({ lista = LISTA, ler, dentro = false, desligado = false }) {
  const dir = mkdtempSync(join(tmpdir(), "textos-publicos-test-"));
  try {
    const raiz = join(dir, "repo");
    mkdirSync(raiz);
    const caminho = dentro ? join(raiz, "lista") : join(dir, "lista");
    if (lista !== null) writeFileSync(caminho, lista);
    if (desligado) {
      const git = (...a) => execFileSync("git", ["-C", raiz, ...a], { stdio: "ignore", env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k))), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
      git("init", "-q");
      git("config", "--local", INTERRUPTOR, "desligado");
    }
    const linhas = [];
    const env = lista === null ? {} : { [VARIAVEL]: caminho };
    const code = correr({ env, home: join(dir, "home"), raiz, ler, escreve: (l) => linhas.push(l) });
    return { code, out: linhas.join("\n") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** O exit esperado, o que o output tem de ter, e o que nunca pode ter (o nome; "Nenhum" num `2`). */
function afirma(nome, r, { code, includes = [], naoInclui = [] }) {
  const p = [];
  if (r.code !== code) p.push(`exit ${r.code}, esperado ${code}`);
  for (const s of includes) if (!r.out.includes(s)) p.push(`o output devia conter "${s}"`);
  for (const s of ["projeto-secreto", "projeto secreto", ...naoInclui]) if (r.out.toLowerCase().includes(s.toLowerCase())) p.push(`o output NAO devia conter "${s}"`);
  registar(nome, p, r.out);
}

const LIMPO = [{ url: "https://x/issues/1", campo: "corpo", texto: "nada de especial" }];
const SUJO = [...LIMPO, { url: "https://x/pull/2", campo: "corpo", texto: "visto no Projeto Secreto." }];
const TAG_SUJA = [{ nome: "v1.0.0", texto: "release do projeto_secreto" }];

console.log("\n=== Testes do check-textos-publicos ===\n");

// --- Os tres resultados -------------------------------------------------------------------------------
afirma("limpo: sai 0 e diz o que leu", corre({ ler: leitor(LIMPO) }), { code: 0, includes: ["Nenhum nome da lista", "1 issues", "1 nome(s) na lista"] });
afirma("um achado: sai 1, com o url, o campo e a LINHA da lista (nunca o nome), e avisa do historico de edicoes", corre({ ler: leitor(SUJO) }),
  { code: 1, includes: ["https://x/pull/2 (corpo): o nome da linha 2 da lista", "1 achado(s)", "renamed from"], naoInclui: ["Nenhum nome da lista"] });
afirma("o repo lido aparece no output", corre({ ler: () => ({ ...leitor(LIMPO)(), repo: "https://github.com/x/y" }) }), { code: 0, includes: ["Lidos de https://github.com/x/y:"] });
afirma("um repo DESLIGADO (`git config --local`): sai 2, e diz que esta desligado", corre({ desligado: true, ler: leitor(SUJO) }),
  { code: 2, includes: ["DESLIGADA neste repo"], naoInclui: ["Nenhum nome da lista"] });

// --- O "nao medido" sai 2 e nunca diz limpo ------------------------------------------------------------
const NAO_MEDIDO = { code: 2, naoInclui: ["Nenhum nome da lista"] };
afirma("sem lista: sai 2, diz que nao ha lista, e nao le nada", corre({ lista: null, ler: () => { throw new Error("leu sem lista"); } }),
  { ...NAO_MEDIDO, includes: ["nao ha lista de nomes proibidos", VARIAVEL], naoInclui: ["Nenhum nome da lista", "leu sem lista"] });
afirma("lista vazia: sai 2", corre({ lista: "# so isto\n", ler: leitor(SUJO) }), { ...NAO_MEDIDO, includes: ["nao tem nenhum nome"] });
afirma("lista dentro do repo: sai 2", corre({ dentro: true, ler: leitor(SUJO) }), { ...NAO_MEDIDO, includes: ["DENTRO do repo"] });
afirma("o `gh` a falhar: sai 2, com a primeira linha do erro", corre({ ler: () => { throw new Error("gh: not logged in\nmais"); } }),
  { ...NAO_MEDIDO, includes: ["nao consegui ler os textos publicos", "gh: not logged in"] });
afirma("uma leitura cortada no limite: sai 2, mesmo com um achado", corre({ ler: () => ({ ...leitor(SUJO)(), cortadas: ["PRs"] }) }),
  { ...NAO_MEDIDO, includes: [`limite de ${LIMITE} (PRs)`] });

// --- As tags sao CONHECIDAS, e nao contam --------------------------------------------------------------
afirma("um nome so numa tag: sai 0, e a tag aparece como conhecida", corre({ ler: leitor(LIMPO, TAG_SUJA) }),
  { code: 0, includes: ["CONHECIDAS", "tag v1.0.0: o nome da linha 2 da lista", "Nenhum nome da lista"] });
afirma("um nome numa tag e outro num texto editavel: sai 1", corre({ ler: leitor(SUJO, TAG_SUJA) }), { code: 1, includes: ["CONHECIDAS", "1 achado(s)"] });

// --- O leitor real, sobre o que o `gh` e o `git` devolveriam --------------------------------------------
/** Um `corre` de fixture: responde por subcomando, e guarda as chamadas. */
function falsoCorre({ issues = 1, prs = 1, reviews = 1, lixo = false } = {}) {
  const chamadas = [];
  const corre = (cmd, args) => {
    chamadas.push([cmd, ...args].join(" "));
    if (cmd === "git") return "v1.0.0\0corpo da tag\n\0\nv1.1.0\0\0\n";
    if (args[0] === "issue") return JSON.stringify(Array.from({ length: issues }, (_, i) => ({ url: `u/i/${i}`, title: "t", body: null })));
    if (args[0] === "pr") return JSON.stringify(Array.from({ length: prs }, (_, i) => ({ url: `u/p/${i}`, title: "t", body: "b", reviews: i ? [] : Array.from({ length: reviews }, () => ({ body: "r" })) })));
    if (lixo && args[0] === "api") return '  "texto": "visto no projeto-secreto"\n';
    if (args[0] === "repo") return JSON.stringify({ url: "u", description: "d", homepageUrl: "" });
    return `${JSON.stringify({ url: "u/c/1", texto: "c", nome: "n" })}\n${JSON.stringify({ url: "u/c/2", texto: "c2", nome: "n2" })}\n`;
  };
  return { corre, chamadas };
}
{
  const { corre: c, chamadas } = falsoCorre();
  const l = leGitHub(c);
  const p = [];
  const campos = l.editaveis.map((e) => e.campo).sort().join(",");
  const esperado = "comentario,comentario,comentario de linha,comentario de linha,corpo,corpo,descricao,nome da release,nome da release,notas da release,notas da release,pagina,review,titulo,titulo";
  if (campos !== esperado) p.push(`campos ${campos}`);
  if (JSON.stringify(l.tags) !== JSON.stringify([{ nome: "v1.0.0", texto: "corpo da tag\n" }, { nome: "v1.1.0", texto: "" }])) p.push(`tags ${JSON.stringify(l.tags)}`);
  if (l.editaveis.some((e) => typeof e.texto !== "string")) p.push("um corpo `null` nao virou texto vazio");
  for (const sub of ["issue list", "pr list"]) if (!chamadas.some((c2) => c2.includes(sub) && c2.includes(`--limit ${LIMITE}`) && c2.includes("--state all"))) p.push(`${sub} sem --state all --limit ${LIMITE}`);
  for (const api of ["issues/comments", "pulls/comments", "releases"]) if (!chamadas.some((c2) => c2.includes("--paginate") && c2.includes(api))) p.push(`${api} sem --paginate`);
  if (l.cortadas.length) p.push(`cortadas sem razao: ${l.cortadas}`);
  registar("leitor: le cada fonte paginada ou com o limite, um corpo nulo vira texto, e as tags pelo NUL", p);
}
{
  const p = [];
  for (const fonte of ["issues", "PRs"]) {
    const l = leGitHub(falsoCorre(fonte === "issues" ? { issues: LIMITE } : { prs: LIMITE }).corre);
    if (JSON.stringify(l.cortadas) !== JSON.stringify([fonte])) p.push(`${fonte} no limite: cortadas ${JSON.stringify(l.cortadas)}`);
  }
  registar("leitor: issues ou PRs que chegam ao limite sao CORTADOS, cada um pelo seu nome", p);
}
{
  const l = leGitHub(falsoCorre({ reviews: LIMITE_DE_REVIEWS }).corre);
  registar("leitor: um PR que chega ao limite de reviews e CORTADO", JSON.stringify(l.cortadas) === JSON.stringify(["reviews"]) ? [] : [`cortadas: ${JSON.stringify(l.cortadas)}`]);
}
{
  // O Node poe um excerto do texto na mensagem de um JSON.parse falhado: o texto pode ter o nome.
  let msg = "";
  try {
    leGitHub(falsoCorre({ lixo: true }).corre);
    msg = "(nao lancou)";
  } catch (err) {
    msg = err instanceof Error ? err.message : String(err);
  }
  const p = [];
  if (!msg.includes("o output do gh nao e JSON")) p.push(`mensagem: ${msg.includes("projeto") ? "(com o texto lido)" : msg}`);
  if (msg.toLowerCase().includes("projeto")) p.push("a mensagem de erro trouxe o texto lido (e o nome)");
  registar("leitor: um output que nao e JSON lanca SEM o texto lido (o nome nao sai pelo erro)", p);
}

// --- A CLI, como se corre ------------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), "textos-publicos-test-"));
  try {
    let code = 0;
    let out = "";
    try {
      out = execFileSync(process.execPath, [CLI], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, [VARIAVEL]: join(dir, "nao-existe") } });
    } catch (e) {
      code = e.status ?? -1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    // A razao EXACTA: so "NAO MEDIDO" passava tambem num clone desligado, pela razao errada.
    afirma("a CLI com a variavel para um ficheiro em falta sai 2 e diz porque (sem rede: nao chega a ler)", { code, out }, { ...NAO_MEDIDO, includes: ["NAO MEDIDO", RAZOES.ilegivel] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("");
console.log(`  ${passed} passaram, ${falhas.length} falharam.`);
console.log("");
if (falhas.length) {
  for (const { nome, out } of falhas) if (out) console.log(`--- output de "${nome}" ---\n${out}`);
  console.log("  Ha testes do check-textos-publicos a falhar.\n");
  process.exit(1);
}
console.log("  Todos os testes do check-textos-publicos passaram.\n");
