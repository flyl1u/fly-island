// Writes src/windows/settings/searchIndex.json: every row of every settings page, in Chinese and
// English, for the settings search (src/windows/settings/settingsSearch.ts). The rows come from
// the pages themselves: tests/regression/settings-search.html opens each one in headless Chrome
// or Edge, once as a new install has them and once with every switch on (rows that only show
// under a switch). Run it after adding, removing or renaming a setting; the settings-search
// regression page fails while a row is missing.
//
//   pnpm settings:index
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPage, withRegressionBrowser } from "./run-regression.mjs";

const LOCALES = ["zh-CN", "en"];
const STATES = ["on", "default"];
const PAGE = "settings-search.html";

/** One locale's rows: those with every switch on, then those only the defaults show. */
export function mergeStates(byState) {
  const key = (row) => `${row.page}\u0000${row.group}\u0000${row.title}`;
  const rows = [];
  const seen = new Set();
  for (const state of byState) {
    for (const row of state) {
      if (seen.has(key(row))) continue;
      seen.add(key(row));
      rows.push(row);
    }
  }
  return rows;
}

/** The index entries: the locales' rows side by side; they must be the same rows in the same order. */
export function pairLocales(byLocale) {
  const [first, ...others] = LOCALES;
  const count = byLocale[first].length;
  for (const locale of others) {
    if (byLocale[locale].length !== count) throw new Error(`${first} has ${count} rows, ${locale} ${byLocale[locale].length}`);
  }
  return byLocale[first].map((row, index) => {
    const entry = { page: row.page };
    for (const locale of LOCALES) {
      const { page, ...text } = byLocale[locale][index];
      if (page !== row.page) throw new Error(`Row ${index} is on ${row.page} in ${first} but on ${page} in ${locale}`);
      entry[locale] = text;
    }
    return entry;
  });
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const byLocale = await withRegressionBrowser(root, PAGE, async ({ session, base }) => {
    const collected = {};
    for (const locale of LOCALES) {
      const byState = [];
      for (const state of STATES) {
        const { outcome, state: shown, errors } = await runPage(session, `${base}${PAGE}?collect=${locale}&state=${state}`);
        if (outcome !== "passed") throw new Error(`${PAGE} (${locale}, ${state}) ${outcome}: ${shown.text ?? ""} ${errors.join(" ")}`);
        const { result } = await session.send("Runtime.evaluate", { expression: "document.documentElement.dataset.index", returnByValue: true });
        byState.push(JSON.parse(result.value));
      }
      collected[locale] = mergeStates(byState);
    }
    return collected;
  });
  const entries = pairLocales(byLocale);
  const file = path.join(root, "src/windows/settings/searchIndex.json");
  writeFileSync(file, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  console.log(`Wrote ${entries.length} settings to ${path.relative(root, file)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
