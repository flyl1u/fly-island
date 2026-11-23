import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const LEGACY_PATTERN = /focus[\s_-]?d(?![a-z])/gi;
const LOCKFILE = "pnpm-lock.yaml";
const ALLOWLIST = new Map([
  ["src-tauri/src/legacy_migration/mod.rs", 23],
  ["src/shared/storage/legacyMigration.ts", 4],
  ["src-tauri/nsis/installer-hooks.nsh", 2],
  ["scripts/check-legacy-name.mjs", 0],
  ["tests/scripts/check-legacy-name.test.mjs", 5],
  ["scripts/stop-running-island.mjs", 1],
]);
const BINARY_EXTENSIONS = new Set([
  ".7z", ".bmp", ".dll", ".exe", ".gif", ".ico", ".icns", ".jpeg", ".jpg", ".mp3", ".mp4",
  ".png", ".ttf", ".wav", ".webp", ".woff", ".woff2", ".zip",
]);

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0").filter(Boolean).filter((file) => file !== LOCKFILE);
}

function isBinary(buffer, file) {
  return BINARY_EXTENSIONS.has(file.slice(file.lastIndexOf(".")).toLowerCase()) || buffer.includes(0);
}

function matches(text) {
  return [...text.matchAll(LEGACY_PATTERN)].map((match) => match.index ?? 0);
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

const violations = [];
for (const file of trackedFiles()) {
  const absolute = resolve(file);
  if (!existsSync(absolute)) continue;
  const nameMatches = matches(file);
  if (nameMatches.length > 0 && !ALLOWLIST.has(file)) {
    violations.push(`${file}: filename contains the legacy product marker`);
  }
  let buffer;
  try { buffer = readFileSync(absolute); } catch { continue; }
  if (isBinary(buffer, file)) continue;
  const text = buffer.toString("utf8");
  const occurrences = matches(text);
  if (occurrences.length === 0) continue;
  const cap = ALLOWLIST.get(file);
  if (cap === undefined) {
    for (const index of occurrences) violations.push(`${file}:${lineNumber(text, index)}: 产品名是 Fly Island，旧名只能出现在迁移模块`);
  } else if (occurrences.length > cap) {
    violations.push(`${file}: ${occurrences.length} legacy markers exceeds allowlist cap ${cap}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(`Legacy-name guard passed (${trackedFiles().length} tracked files scanned).`);
