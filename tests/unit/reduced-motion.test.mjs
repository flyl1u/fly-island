import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

// Animations that only fade a colour, with no movement, may keep running.
const COLOUR_ONLY = new Set([".shelf-item--recent"]);

function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

/** Top-level blocks as { prelude, body }, nested blocks kept inside the body. */
function blocks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  let preludeStart = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        out.push({ prelude: css.slice(preludeStart, start).trim(), body: css.slice(start + 1, i) });
        preludeStart = i + 1;
      }
    }
  }
  return out;
}

const moving = (body) => /(^|[;\s])animation(-name)?\s*:\s*(?!none\b)[^;]+/.test(body);

test("every animation stops or calms down when Windows asks for less motion", () => {
  const sheets = cssFiles(SRC).map((file) => {
    const all = blocks(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
    const own = all
      .filter((block) => /prefers-reduced-motion:\s*reduce/.test(block.prelude))
      .map((block) => block.body)
      .join("\n");
    return { file, all, own };
  });
  // The calming rule may live in another sheet (the island's own sheet covers the collapsed bar).
  const reduced = sheets.map((sheet) => sheet.own).join("\n");
  const missing = [];
  for (const { file, all, own } of sheets) {
    // A wildcard such as `.center-pattern *` calms everything the sheet draws.
    if (/\s\*\s*[,{]/.test(own)) continue;
    for (const block of all) {
      if (block.prelude.startsWith("@") || !moving(block.body)) continue;
      for (const selector of block.prelude.split(",").map((part) => part.trim())) {
        const element = selector.split(/\s+/).pop();
        if (COLOUR_ONLY.has(selector) || reduced.includes(selector) || reduced.includes(element)) continue;
        missing.push(`${path.relative(SRC, file)}: ${selector}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
