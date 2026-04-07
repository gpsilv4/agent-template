/**
 * Doc Version Checker — {{PROJECT_NAME}}
 *
 * Compares versions in package.json with references in documentation.
 * Warns if any documented version is outdated after dependency updates.
 *
 * Usage:
 *   node .agent/scripts/check-doc-versions.mjs
 *
 * Runs in CI (ci.yml) to catch version drift after Dependabot merges.
 */

import { readFileSync } from "fs";

const PKG = JSON.parse(readFileSync("package.json", "utf8"));

function getVersion(raw) {
  return raw.replace(/^[\^~>=<\s]*/g, "");
}

function getMajorMinorPatch(version) {
  const clean = getVersion(version);
  const match = clean.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: parseInt(match[1]),
    minor: match[2] ? parseInt(match[2]) : null,
    patch: match[3] ? parseInt(match[3]) : null,
    raw: clean,
  };
}

function isOutdated(documented, actual) {
  const doc = getMajorMinorPatch(documented);
  const act = getMajorMinorPatch(actual);
  if (!doc || !act) return false;

  if (doc.minor === null) return doc.major !== act.major;
  if (doc.patch === null) return doc.major !== act.major || doc.minor !== act.minor;
  return doc.major !== act.major || doc.minor !== act.minor || doc.patch !== act.patch;
}

// --- Config: adapt to your project ---
// Add entries for each dependency version referenced in documentation.
// pattern: regex that matches the version in markdown (e.g., "Next.js 16.2.2")
// files: which doc files reference this version

const CHECKS = [
  // Example for Next.js:
  // {
  //   name: "Next.js",
  //   pkg: "next",
  //   pattern: /Next\.js\s+(\d+(?:\.\d+(?:\.\d+)?)?)/g,
  //   files: [".agent/rules/core-rules.md"],
  // },
];

// --- Main ---

let hasWarnings = false;

console.log("\n=== Doc Version Check ===\n");

if (CHECKS.length === 0) {
  console.log("  No version checks configured. Edit .agent/scripts/check-doc-versions.mjs");
  console.log("  to add your project's dependencies and documentation references.\n");
  process.exit(0);
}

for (const check of CHECKS) {
  const dep = PKG.dependencies?.[check.pkg] || PKG.devDependencies?.[check.pkg];
  if (!dep) {
    console.log(`  SKIP  ${check.name} — not in package.json`);
    continue;
  }

  const actual = getVersion(dep);

  for (const file of check.files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      console.log(`  SKIP  ${file} — file not found`);
      continue;
    }

    const matches = [...content.matchAll(check.pattern)];
    if (matches.length === 0) {
      console.log(`  OK    ${check.name} — no version reference in ${file}`);
      continue;
    }

    for (const match of matches) {
      const documented = match[1];
      if (isOutdated(documented, actual)) {
        console.log(`  WARN  ${check.name} in ${file}`);
        console.log(`         Documented: ${documented}`);
        console.log(`         Actual:     ${actual}`);
        console.log(`         → Update the version reference in this file`);
        console.log("");
        hasWarnings = true;
      } else {
        console.log(`  OK    ${check.name} = ${documented} (matches ${actual})`);
      }
    }
  }
}

// Check .nvmrc exists
try {
  const nvmrc = readFileSync(".nvmrc", "utf8").trim();
  console.log(`  OK    .nvmrc = ${nvmrc}`);
} catch {
  console.log("  WARN  .nvmrc not found");
  hasWarnings = true;
}

console.log("");

if (hasWarnings) {
  console.log("WARNING: Some documented versions are outdated.");
  console.log("Update the referenced files to match package.json.");
  console.log("This is usually needed after merging Dependabot PRs.");
  process.exit(0);
} else {
  console.log("All documented versions match package.json.");
  process.exit(0);
}
