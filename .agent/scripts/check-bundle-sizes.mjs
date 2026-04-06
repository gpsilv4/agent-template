/**
 * Bundle Size Checker — {{PROJECT_NAME}}
 *
 * Verifica o First Load JS (gzipped) de cada pagina contra os targets definidos.
 * Next.js 16+ com webpack nao mostra sizes por pagina no build output,
 * por isso este script analisa o build-manifest.json e os chunks no disco.
 *
 * Uso:
 *   npm run build && node .agent/scripts/check-bundle-sizes.mjs
 *
 * Requisito: .next/ deve existir (correr npm run build antes).
 *
 * NOTA: Este script e especifico para Next.js com App Router.
 * Para outros frameworks, adaptar a logica de leitura do manifest.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { gzipSync } from "zlib";

const NEXT_DIR = ".next";
const MANIFEST_PATH = join(NEXT_DIR, "build-manifest.json");

// Adaptar ao projeto: definir paginas e targets
const TARGETS = {
  "/":        { name: "Home",     target: 160, alarm: 180 },
  // "/about":   { name: "About",    target: 155, alarm: 175 },
  // "/dashboard": { name: "Dashboard", target: 160, alarm: 180 },
};

function gzipSize(filePath) {
  try {
    return gzipSync(readFileSync(filePath)).length;
  } catch {
    return 0;
  }
}

function walkDir(dir, rel) {
  const sizes = {};
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        Object.assign(sizes, walkDir(fullPath, relPath));
      } else if (entry.name.endsWith(".js")) {
        sizes[relPath] = gzipSize(fullPath);
      }
    }
  } catch {
    // ignore
  }
  return sizes;
}

// --- Main ---

if (!existsSync(MANIFEST_PATH)) {
  console.error("ERROR: .next/build-manifest.json not found. Run 'npm run build' first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

// Shared chunks (rootMainFiles — loaded on every page)
const sharedFiles = manifest.rootMainFiles || [];
let sharedSize = 0;
const seen = new Set();
for (const f of sharedFiles) {
  if (!seen.has(f)) {
    seen.add(f);
    sharedSize += gzipSize(join(NEXT_DIR, f));
  }
}

// App layout chunk (loaded on every page via app router)
const appLayoutDir = join(NEXT_DIR, "static", "chunks", "app");
let layoutSize = 0;
try {
  for (const f of readdirSync(appLayoutDir)) {
    if (f.startsWith("layout-") && f.endsWith(".js")) {
      layoutSize += gzipSize(join(appLayoutDir, f));
    }
  }
} catch {
  // no layout chunks
}

const baseSize = sharedSize + layoutSize;

// Per-page analysis
console.log("\n=== Bundle Size Report (First Load JS, gzipped) ===\n");
console.log(`Shared (framework + layout): ${(baseSize / 1024).toFixed(1)} kB\n`);

let hasAlarm = false;
let hasFail = false;

for (const [route, config] of Object.entries(TARGETS)) {
  const pageKey = `app${route === "/" ? "" : route}/page`;
  const pageFiles = manifest.pages?.[pageKey] || [];

  let pageSize = 0;
  for (const f of pageFiles) {
    if (!seen.has(f)) {
      pageSize += gzipSize(join(NEXT_DIR, f));
    }
  }

  // Also check for page-specific chunks
  const appPageDir = join(NEXT_DIR, "static", "chunks", "app", route === "/" ? "" : route.slice(1));
  try {
    if (existsSync(appPageDir)) {
      for (const f of readdirSync(appPageDir)) {
        if (f.startsWith("page-") && f.endsWith(".js")) {
          pageSize += gzipSize(join(appPageDir, f));
        }
      }
    }
  } catch {
    // no page-specific chunks
  }

  const totalKB = (baseSize + pageSize) / 1024;
  const targetKB = config.target;
  const alarmKB = config.alarm;

  let status = "OK";
  if (totalKB > alarmKB) {
    status = "ALARM";
    hasAlarm = true;
    hasFail = true;
  } else if (totalKB > targetKB) {
    status = "WARN";
    hasAlarm = true;
  }

  const icon = status === "OK" ? "  " : status === "WARN" ? "! " : "X ";
  console.log(`${icon}${config.name.padEnd(22)} ${totalKB.toFixed(1).padStart(7)} kB  (target < ${targetKB} kB, alarm > ${alarmKB} kB)  [${status}]`);
}

console.log("");

if (hasFail) {
  console.log("FAILED: One or more pages exceed the alarm threshold!");
  console.log("Actions:");
  console.log("  - Check for sync imports of heavy libraries (PDF, charts, Excel)");
  console.log("  - Use dynamic imports with { ssr: false } for heavy components");
  console.log("  - Check for inline SVGs that should be icon library imports");
  process.exit(1);
} else if (hasAlarm) {
  console.log("WARNING: One or more pages exceed the target (but below alarm).");
  process.exit(0);
} else {
  console.log("All pages within target benchmarks.");
  process.exit(0);
}
