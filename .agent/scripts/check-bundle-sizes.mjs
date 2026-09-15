/**
 * Bundle Size Checker — {{PROJECT_NAME}}
 *
 * Verifica o First Load JS (gzipped) de cada pagina contra os targets definidos.
 * Next.js com webpack nao mostra sizes por pagina no build output, por isso este
 * script analisa o build-manifest.json e os chunks no disco.
 *
 * Uso:
 *   npm run build && node .agent/scripts/check-bundle-sizes.mjs
 *
 * Requisito: .next/ deve existir (correr npm run build antes).
 * Testes: node .agent/scripts/test-bundle-sizes.mjs
 *
 * PRINCIPIO: um numero errado e pior do que numero nenhum. Este script prefere
 * FALHAR a reportar um valor que nao conseguiu medir. A versao anterior tratava
 * ficheiro ausente como 0 kB e imprimia `[OK]` — um build partido passava como limpo.
 *
 * ---------------------------------------------------------------------------
 * LIMITE CONHECIDO — App Router (verificado na fonte do Next.js, 2026-08-26)
 *
 * ATUALIZADO (2026-09-15, achado de um derivado real em Next 16): a fonte por rota passa a ser
 * o **manifesto RSC** (`.next/server/app/<rota>/page_client-reference-manifest.js`). O
 * varrimento de diretorio abaixo era "o unico caminho" e **no Next 16 a pasta nao existe** —
 * dez rotas devolviam o mesmo valor e dez `[OK]`, sem nunca medir rota nenhuma. O varrimento
 * fica como caminho para versoes anteriores.
 *
 * As rotas do App Router **nao aparecem** em `build-manifest.json.pages`. O
 * `build-manifest-plugin` chama `getRouteFromEntrypoint(entrypoint.name)` SEM a flag
 * `app`; sem ela, o ramo que resolve entrypoints `app/...` nunca corre, a funcao
 * devolve `null` e o call-site faz `continue`. Logo `manifest.pages["app/rota/page"]`
 * e sempre `undefined`.
 *
 * (E `app-build-manifest.json` NAO existe no Next.js atual — nao ha plugin com esse
 * nome nem ocorrencias no repo. Nao tentar le-lo.)
 *
 * Consequencia pratica: para App Router, o UNICO caminho que conta chunks proprios
 * da pagina e o varrimento de `.next/static/chunks/app/<rota>/page-*.js` mais abaixo.
 * Esse varrimento **nao cobre route groups** — com `app/(grupo)/rota/page.tsx` o chunk
 * fica em `static/chunks/app/(grupo)/rota/`, e o caminho procurado nao bate.
 * Se o teu projeto usa route groups, adapta o `pageChunkDir()` abaixo.
 *
 * Quando o script nao consegue resolver os chunks proprios de uma rota que esta em
 * TARGETS, **falha** em vez de reportar so a baseline partilhada como se fosse o total.
 * ---------------------------------------------------------------------------
 *
 * NOTA: especifico para Next.js. Para outros frameworks, adaptar a leitura do manifest.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, relative, sep, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";

// Ancorado a raiz do repo, como o check-doc-versions.mjs: correr de um subdiretorio
// produzia "build-manifest.json nao encontrado", uma mensagem errada para a causa real.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NEXT_DIR = join(ROOT, ".next");
const MANIFEST_PATH = join(NEXT_DIR, "build-manifest.json");

// Adaptar ao projeto: definir paginas e targets
const TARGETS = {
  "/":        { name: "Home",     target: 160, alarm: 180 },
  // "/about":   { name: "About",    target: 155, alarm: 175 },
  // "/dashboard": { name: "Dashboard", target: 160, alarm: 180 },
};

/** Os alvos de tamanho reprovam, ou so avisam?
 *
 *  **`true` por omissao** — um orcamento que nao reprova nao e um orcamento.
 *
 *  Porque existe o interruptor: quando um projeto liga a medicao a serio pela primeira vez (o
 *  manifesto RSC acima), os alvos que ja la estavam foram escritos contra um numero que **nao
 *  era medicao**. Medido num derivado real: as dez rotas ficaram **1,4x a 2,0x** acima. Nessa
 *  altura ha tres saidas, e duas sao mas:
 *    - subir os alvos -> transforma um diagnostico em norma, e o orcamento passa a descrever
 *      o que ha em vez de o que se quer;
 *    - deixar o gate vermelho -> bloqueia todos os PRs por um problema que nao e deles;
 *    - **suspender o JUIZO sobre o tamanho**, com um ticket aberto e a razao escrita — e o
 *      que esta linha permite.
 *
 *  O que NAO se suspende: **nao conseguir medir continua a reprovar** (rota por resolver,
 *  ficheiro ausente, caminho fora do `.next/`). So o juizo sobre o numero e que fica de fora.
 *
 *  A alternativa que se tentou primeiro e que NAO se deve usar: `|| true` no `ci.yml`. O
 *  `check-test-surface` apanhou-a, e com razao — e a neutralizacao silenciosa que ele existe
 *  para detetar. A decisao vive aqui, visivel e com data, ou nao vive. */
const ALVOS_REPROVAM = true;

const missing = [];
const outside = []; // caminhos do manifest que saem de .next/

/** Devolve o tamanho gzipped, ou `null` se o ficheiro nao existir/nao for legivel.
 *  NUNCA devolve 0 por falha — 0 e um tamanho valido e mascarava builds partidos. */
function gzipSize(filePath) {
  try {
    return gzipSync(readFileSync(filePath)).length;
  } catch {
    return null;
  }
}

/** Chave canonica de um ficheiro dentro de `.next/`, relativa e sempre com `/`.
 *  Sem isto o `seen` comparava as strings CRUAS do manifest: `./x.js` e `x.js` sao o
 *  mesmo ficheiro e eram contados duas vezes, e em Windows o `\` do varrimento de
 *  diretorio nunca casava com o `/` do manifest.
 *
 *  Devolve `null` se o caminho SAI de `.next/`. Sem esta guarda, um caminho absoluto ou
 *  com `../` no manifest era resolvido para fora e o script media um ficheiro que nao
 *  faz parte do bundle — contradizendo o principio no cabecalho. */
function keyOf(file) {
  const key = relative(NEXT_DIR, resolve(NEXT_DIR, file)).split(sep).join("/");
  if (key === "" || key === ".." || key.startsWith("../")) return null;
  return key;
}

/** Soma os ficheiros ainda nao vistos, registando os que faltam no disco. */
function addFiles(files, seen) {
  let total = 0;
  let counted = 0;
  for (const f of files) {
    const key = keyOf(f);
    if (key === null) {
      outside.push(f);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key); // sem isto, um ficheiro repetido na mesma lista era contado N vezes
    const size = gzipSize(join(NEXT_DIR, key));
    if (size === null) missing.push(key);
    else {
      total += size;
      counted++;
    }
  }
  return { total, counted };
}

/** Os chunks proprios de uma rota, lidos do **manifesto RSC** que o Next escreve por rota.
 *
 *  PORQUE EXISTE: o varrimento de `.next/static/chunks/app/<rota>/` era "o unico caminho que
 *  conta chunks proprios no App Router" — e **no Next 16 essa pasta nao existe**. Os chunks
 *  sao escritos achatados, com nomes com hash. Medido num derivado real: dez rotas devolviam
 *  o MESMO valor (a baseline partilhada) e dez `[OK]`. O verificador nunca mediu rota nenhuma,
 *  e como o numero era plausivel ninguem deu por isso durante meses.
 *
 *  Devolve `null` quando **nao consegue ler** — nunca `[]`, que diria "esta rota nao tem
 *  chunks" e produziria zero com `[OK]`, que e o defeito que este ficheiro existe para nao ter.
 *
 *  ARMADILHA que custa tempo: a chave de uma rota dinamica leva parenteses rectos —
 *  `__RSC_MANIFEST["/resultados/[id]/page"]`. Uma regex com `\[[^\]]+\]` para no `]` de `[id]`
 *  e a rota fica por resolver com o manifesto ali ao lado. Casa-se a STRING entre aspas. */
function chunksDoManifestoRsc(route) {
  const rel = route === "/" ? "" : route.slice(1);
  const f = join(NEXT_DIR, "server", "app", rel, "page_client-reference-manifest.js");
  if (!existsSync(f)) return null;
  let bruto;
  try {
    bruto = readFileSync(f, "utf8");
  } catch {
    return null;
  }
  const m = bruto.match(/globalThis\.__RSC_MANIFEST\[\s*"(?:[^"\\]|\\.)*"\s*\]\s*=\s*(\{[\s\S]*?\});?\s*$/);
  if (!m) return null;
  let obj;
  try {
    obj = JSON.parse(m[1]);
  } catch {
    return null; // manifesto ilegivel != rota sem chunks (`AP2`)
  }
  const mods = obj?.clientModules;
  if (!mods || typeof mods !== "object") return null;
  const out = new Set();
  for (const mod of Object.values(mods)) {
    for (const c of mod?.chunks ?? []) {
      // Os caminhos vem com prefixo `/_next/`; em disco sao relativos a `.next/`.
      if (typeof c === "string") out.add(c.replace(/^\/_next\//, ""));
    }
  }
  return [...out];
}

/** Diretorio dos chunks proprios de uma rota. Nao cobre route groups — ver cabecalho. */
function pageChunkDir(route) {
  return join(NEXT_DIR, "static", "chunks", "app", route === "/" ? "" : route.slice(1));
}

// --- Main ---

if (!existsSync(MANIFEST_PATH)) {
  console.error(`ERROR: ${MANIFEST_PATH} nao encontrado. Correr 'npm run build' primeiro.`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
} catch (err) {
  // Build interrompido deixa o manifest truncado; mensagem accionavel em vez de stack trace.
  console.error(`ERROR: ${MANIFEST_PATH} nao e JSON valido (${err instanceof Error ? err.message : String(err)}).`);
  console.error("       Provavel build interrompido — apagar .next/ e correr 'npm run build' de novo.");
  process.exit(1);
}

// `sharedSeen` cobre o que e carregado em TODAS as paginas (rootMainFiles + layout).
// Cada rota parte de uma COPIA deste conjunto — nunca de um `seen` global acumulado:
// o First Load JS e uma metrica POR ROTA, e um chunk partilhado por duas rotas conta nas
// duas. Um `seen` partilhado entre rotas fazia a segunda rota perder esse chunk e reportar
// um valor menor com `[OK]` — o mesmo pecado de imprimir um numero que nao mediu.
const sharedSeen = new Set();

// Shared chunks (rootMainFiles — carregados em todas as paginas)
const shared = addFiles(manifest.rootMainFiles || [], sharedSeen);
let sharedSize = shared.total;

// Os POLYFILLS ficavam de fora da baseline. E **um** ficheiro, carregado em TODAS as paginas,
// e num derivado real media 38,7 kB — 20% do First Load. Nao tem nada a ver com a versao do
// Next: era uma omissao pura, e vale em qualquer versao. Pelo mesmo `addFiles`/`sharedSeen`
// do resto, para nao contar duas vezes o que ja esteja em `rootMainFiles`.
const polyfills = addFiles(manifest.polyfillFiles || [], sharedSeen);
sharedSize += polyfills.total;

// Chunk do layout do App Router (carregado em todas as paginas).
// Passa pelo MESMO addFiles/sharedSeen: um layout tambem listado em rootMainFiles era
// contado duas vezes na baseline, inflando todas as rotas e podendo disparar ALARM falso.
const layoutFiles = [];
try {
  for (const f of readdirSync(join(NEXT_DIR, "static", "chunks", "app"))) {
    if (f.startsWith("layout-") && f.endsWith(".js")) layoutFiles.push(`static/chunks/app/${f}`);
  }
} catch {
  // sem chunks de layout — normal em Pages Router
}
const layoutSize = addFiles(layoutFiles, sharedSeen).total;

const baseSize = sharedSize + layoutSize;

console.log("\n=== Bundle Size Report (First Load JS, gzipped) ===\n");
console.log(`Shared (framework + layout): ${(baseSize / 1024).toFixed(1)} kB\n`);

let hasAlarm = false;
let hasFail = false;
const unresolved = [];

for (const [route, config] of Object.entries(TARGETS)) {
  // Copia do conjunto partilhado: dentro da rota nao se conta duas vezes o mesmo ficheiro,
  // mas entre rotas cada uma conta os seus chunks por inteiro.
  const routeSeen = new Set(sharedSeen);
  // Nota: para App Router isto e sempre [] — ver LIMITE CONHECIDO no cabecalho.
  const pageKey = `app${route === "/" ? "" : route}/page`;
  const fromManifest = addFiles(manifest.pages?.[pageKey] || [], routeSeen);
  let pageSize = fromManifest.total;
  let pageChunks = fromManifest.counted;

  // Manifesto RSC PRIMEIRO: e a fonte por rota que existe no Next moderno. O varrimento de
  // diretorio a seguir fica como caminho para versoes anteriores — nao se apaga, porque um
  // derivado pode estar em Next antigo e ai a pasta existe e o manifesto nao.
  const rsc = chunksDoManifestoRsc(route);
  if (rsc !== null) {
    const doRsc = addFiles(rsc, routeSeen);
    pageSize += doRsc.total;
    pageChunks += doRsc.counted;
  }

  // Varrimento de diretorio: o caminho das versoes anteriores do App Router.
  // Usa o MESMO `seen` (com a chave relativa a .next/) — um chunk listado no
  // manifest e tambem presente no diretorio era contado duas vezes.
  const dir = pageChunkDir(route);
  try {
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (!f.startsWith("page-") || !f.endsWith(".js")) continue;
        const relKey = keyOf(join(dir, f));
        if (relKey === null) {
          // O confinamento tinha sido aplicado ao `addFiles` e nao aqui — e este e o
          // unico caminho que conta chunks proprios no App Router. Uma rota como
          // `/../../FORA` media ficheiros fora do `.next/` e reportava `[OK]`.
          outside.push(join(dir, f));
          continue;
        }
        if (routeSeen.has(relKey)) continue;
        routeSeen.add(relKey);
        const size = gzipSize(join(dir, f));
        if (size === null) missing.push(relKey);
        else {
          pageSize += size;
          pageChunks++;
        }
      }
    }
  } catch {
    // sem chunks proprios — tratado abaixo como nao-resolvido
  }

  if (pageChunks === 0) unresolved.push({ route, name: config.name, dir });

  const totalKB = (baseSize + pageSize) / 1024;
  let status = "OK";
  if (totalKB > config.alarm) {
    status = "ALARM";
    hasAlarm = true;
    // So o JUIZO sobre o tamanho e que o interruptor suspende. Nao conseguir medir (rota por
    // resolver, ficheiro ausente, caminho fora do `.next/`) continua a reprovar mais abaixo.
    if (ALVOS_REPROVAM) hasFail = true;
  } else if (totalKB > config.target) {
    status = "WARN";
    hasAlarm = true;
  }
  if (pageChunks === 0) status = "?";

  const icon = status === "OK" ? "  " : status === "WARN" ? "! " : status === "?" ? "? " : "X ";
  console.log(
    `${icon}${config.name.padEnd(22)} ${totalKB.toFixed(1).padStart(7)} kB  (target < ${config.target} kB, alarm > ${config.alarm} kB)  [${status}]`
  );
}

console.log("");

// --- Integridade da medicao (antes dos targets: sem medicao nao ha veredicto) ---

const outsideUnique = [...new Set(outside)];
if (outsideUnique.length > 0) {
  console.log("FAILED: o manifest referencia caminhos FORA de .next/:");
  for (const f of outsideUnique) console.log(`  - ${f}`);
  console.log("");
  console.log("  Um bundle e composto por ficheiros dentro de .next/. Um caminho absoluto,");
  console.log("  com `../`, vazio, ou que resolva para o proprio .next/ nao e um ficheiro do");
  console.log("  bundle e nao deve entrar na medicao.");
  process.exit(1);
}

const missingUnique = [...new Set(missing)]; // a mesma falta pode surgir em varias rotas
if (missingUnique.length > 0) {
  console.log("FAILED: ficheiros referenciados pelo build mas AUSENTES do disco:");
  for (const f of missingUnique) console.log(`  - ${f}`);
  console.log("");
  console.log("  Um ficheiro no manifest e ausente do disco e erro de build, nao 0 kB.");
  console.log("  Apagar .next/ e correr 'npm run build' de novo. Se persistir, o manifest");
  console.log("  esta dessincronizado do output (convencao nova, Turbopack, distDir custom).");
  process.exit(1);
}

if (unresolved.length > 0) {
  console.log("FAILED: nao foi possivel resolver os chunks proprios destas rotas:");
  for (const u of unresolved) console.log(`  - ${u.name} (${u.route}) — procurado em ${u.dir}`);
  console.log("");
  console.log("  O valor impresso e apenas a baseline partilhada, NAO o First Load JS da rota.");
  console.log("  Causas provaveis: route groups (app/(grupo)/rota) — ver LIMITE CONHECIDO no");
  console.log("  cabecalho deste ficheiro; ou a rota nao existe; ou o build nao correu.");
  console.log("  Se a rota nao deve ser medida, remove-la de TARGETS.");
  process.exit(1);
}

if (hasFail) {
  console.log("FAILED: uma ou mais paginas excedem o limite de alarme.");
  console.log("Accoes:");
  console.log("  - Procurar imports sincronos de bibliotecas pesadas (PDF, charts, Excel)");
  console.log("  - Usar dynamic imports com { ssr: false } para componentes pesados");
  console.log("  - Verificar SVGs inline que deviam vir de uma icon library");
  process.exit(1);
} else if (hasAlarm) {
  console.log("WARNING: uma ou mais paginas excedem o target (abaixo do alarme).");
  process.exit(0);
} else {
  console.log("Todas as paginas dentro dos targets.");
  process.exit(0);
}
