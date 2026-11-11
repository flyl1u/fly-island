// Enforces the per-file line limits from AGENTS.md. Files that already exceeded a limit
// are listed in file-size-allowlist.json with their current size and may only shrink.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SCAN_ROOTS = ["src", "src-tauri/src", "src-tauri/examples", "scripts", "tests", "packages", "web-demo"];
export const INLINE_TEST_LIMIT = 150;

const LINE_LIMITS = {
  ".ts": 400,
  ".tsx": 400,
  ".mjs": 400,
  ".css": 500,
  ".rs": 800,
  ".ps1": 400,
  ".cmd": 400,
};

// Translation dictionaries grow with copy, and extracted Rust test files hold tests only.
const EXEMPT_PATTERNS = [
  /^src\/i18n\/locales\/[^/]+\.ts$/,
  /^src\/i18n\/sections\/.+\.ts$/,
  /^src\/i18n\/types\.ts$/,
  /(^|\/)tests\.rs$/,
];
const SKIPPED_DIRECTORIES = new Set(["node_modules", "target", "gen", "dist"]);

export function countLines(source) {
  if (source === "") return 0;
  const lines = source.split(/\r?\n/);
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

/** Returns the line limit for a repository-relative path, or null when the file is not checked. */
export function lineLimitFor(path) {
  if (EXEMPT_PATTERNS.some((pattern) => pattern.test(path))) return null;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  return LINE_LIMITS[path.slice(dot)] ?? null;
}

/**
 * Counts lines of top-level `#[cfg(test)] mod x { ... }` blocks, from the attribute to the
 * closing brace in column 0. External `mod tests;` declarations are not counted.
 */
export function inlineTestLines(source) {
  const lines = source.split(/\r?\n/);
  let total = 0;
  for (let start = 0; start < lines.length; start += 1) {
    if (!/^#\[cfg\(test\)\]\s*$/.test(lines[start])) continue;
    let declaration = start + 1;
    while (declaration < lines.length && /^\s*(#\[|\/\/|$)/.test(lines[declaration])) declaration += 1;
    if (!/^(pub(\([a-z]+\))?\s+)?mod\s+\w+\s*\{/.test(lines[declaration] ?? "")) continue;
    let end = declaration + 1;
    while (end < lines.length && lines[end].trimEnd() !== "}") end += 1;
    total += Math.min(end, lines.length - 1) - start + 1;
    start = end;
  }
  return total;
}

function ratchet(result, { path, label, value, limit, allowed }) {
  if (allowed === undefined) {
    if (value > limit) result.errors.push(`${path}: ${label} ${value} 超过上限 ${limit}`);
    return;
  }
  if (value > allowed) {
    result.errors.push(`${path}: ${label} ${value} 超过白名单记录 ${allowed}，存量超限文件不得变长`);
  } else if (value <= limit) {
    result.errors.push(`${path}: ${label} ${value} 已不超过上限 ${limit}，请从白名单中删除该条目`);
  } else if (value < allowed) {
    result.warnings.push(`${path}: ${label}已降到 ${value}，请把白名单记录从 ${allowed} 更新为 ${value}`);
  }
}

/**
 * Checks `{ path, source }` entries against the limits and the allowlist.
 * Paths are repository-relative and use forward slashes.
 */
export function checkFiles(files, allowlist = {}) {
  const lineAllowlist = allowlist.lines ?? {};
  const inlineTestAllowlist = allowlist.inlineTests ?? {};
  const result = { checked: 0, errors: [], warnings: [] };
  const checkedPaths = new Set();

  for (const { path, source } of files) {
    const limit = lineLimitFor(path);
    if (limit === null) continue;
    result.checked += 1;
    checkedPaths.add(path);
    const isRust = path.endsWith(".rs");
    const testLines = isRust ? inlineTestLines(source) : 0;
    ratchet(result, {
      path,
      label: isRust ? "生产代码行数" : "行数",
      value: countLines(source) - testLines,
      limit,
      allowed: lineAllowlist[path],
    });
    if (isRust) {
      ratchet(result, {
        path,
        label: "内联测试模块行数",
        value: testLines,
        limit: INLINE_TEST_LIMIT,
        allowed: inlineTestAllowlist[path],
      });
    }
  }

  for (const [section, entries] of [["lines", lineAllowlist], ["inlineTests", inlineTestAllowlist]]) {
    for (const path of Object.keys(entries)) {
      if (!checkedPaths.has(path)) {
        result.errors.push(`${path}: 白名单 ${section} 中的文件不存在或不在检查范围内，请删除该条目`);
      }
    }
  }
  return result;
}

export function collectFiles(root, scanRoots = SCAN_ROOTS) {
  const files = [];
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(fullPath);
      } else if (entry.isFile()) {
        const path = relative(root, fullPath).split(sep).join("/");
        if (lineLimitFor(path) !== null) files.push({ path, source: readFileSync(fullPath, "utf8") });
      }
    }
  };
  for (const scanRoot of scanRoots) visit(join(root, scanRoot));
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const allowlist = JSON.parse(readFileSync(join(root, "scripts", "file-size-allowlist.json"), "utf8"));
  const { checked, errors, warnings } = checkFiles(collectFiles(root), allowlist);
  for (const warning of warnings) console.warn(`提示 ${warning}`);
  for (const error of errors) console.error(`错误 ${error}`);
  console.log(`已检查 ${checked} 个文件：${errors.length} 个错误，${warnings.length} 个提示。`);
  if (errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
