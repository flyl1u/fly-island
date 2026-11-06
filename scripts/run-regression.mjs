// Runs the browser regression pages (tests/regression/*.html) in headless Chrome or
// Edge and reports each page's own pass/fail result. Starts its own Vite server.
//
//   pnpm test:regression                 every page
//   pnpm test:regression mail-reader     pages whose name contains the word
//
// Pages are driven over the DevTools protocol in a normal tab, not with --dump-dom:
// that mode stops running page scripts after load, so pages that wait on timers
// (the collapsed message animation waits for a five-second auto-restore) never finish.
// CHROME_PATH picks the browser; REGRESSION_PORT the Vite port (default 1460).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Each page with the query that starts its automated checks. */
export const PAGES = [
  "agent-alerts.html",
  "agent-approvals.html",
  "agent-sessions.html?test=1",
  "center-pattern.html?test=1",
  "claude-usage.html?test=1",
  "collapsed-message-animation.html?test=1",
  "collapsed-slots.html?test=1",
  "i18n.html?test=1",
  "mail-reader.html?run=1",
  "music-lyrics.html",
  "notification-startup.html",
  "plugin-menus.html",
  "plugin-views.html?test=1",
  "settings.html?test=1",
  "tucked-hover.html",
];

const PAGE_TIMEOUT_MS = 120_000;
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

/**
 * A page's outcome from what it wrote: `data-test-result` on <html>, `data-result` on
 * #results, or a summary line in #results. Null while it is still running.
 */
export function pageOutcome({ testResult = "", dataResult = "", text = "" }) {
  const marker = testResult || dataResult;
  if (marker === "passed" || marker === "failed") return marker;
  if (/^ALL PASS/m.test(text) || /全部 \d+ 项检查通过/.test(text)) return "passed";
  if (/^SOME FAILED/m.test(text) || /^FAIL /m.test(text)) return "failed";
  return null;
}

/** Number of passed checks, counted from the page's "PASS ..." lines. */
export function passedChecks(text) {
  return (text.match(/^PASS /gm) ?? []).length;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  const browser = process.env.CHROME_PATH ?? BROWSERS.find((candidate) => existsSync(candidate));
  if (!browser) throw new Error("No Chrome or Edge found; set CHROME_PATH.");
  return browser;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not listening yet */ }
    await sleep(200);
  }
  throw new Error(`${url} did not answer within ${timeoutMs / 1000}s`);
}

/** A DevTools protocol session on the browser's first tab. */
async function connect(port) {
  const deadline = Date.now() + 15_000;
  let page;
  while (!page && Date.now() < deadline) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((target) => target.type === "page");
    } catch { await sleep(200); }
  }
  if (!page) throw new Error("The browser's DevTools endpoint did not come up.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result ?? {});
      pending.delete(message.id);
    }
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const next = ++id;
    pending.set(next, resolve);
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  // Windows Server (the CI runner) has animations off, which Chrome reports as
  // prefers-reduced-motion: reduce and the island then swaps messages without a
  // transition. Pages that test reduced motion stub matchMedia themselves, so the
  // run uses an ordinary desktop's setting unless REGRESSION_REDUCED_MOTION says otherwise.
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: process.env.REGRESSION_REDUCED_MOTION ?? "no-preference" }],
  });
  return { send, errors, close: () => socket.close() };
}

const READ_STATE = `(() => {
  const results = document.getElementById("results");
  return JSON.stringify({
    testResult: document.documentElement.dataset.testResult ?? "",
    dataResult: results?.dataset.result ?? "",
    text: results?.textContent ?? "",
  });
})()`;

async function runPage(session, url) {
  session.errors.length = 0;
  await session.send("Page.navigate", { url });
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let state = {};
  while (Date.now() < deadline) {
    await sleep(500);
    const { result } = await session.send("Runtime.evaluate", { expression: READ_STATE, returnByValue: true });
    try { state = JSON.parse(result?.value ?? "{}"); } catch { state = {}; }
    const outcome = pageOutcome(state);
    if (outcome) return { outcome, state, errors: [...session.errors] };
  }
  return { outcome: "timed out", state, errors: [...session.errors] };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const filters = process.argv.slice(2);
  const pages = PAGES.filter((page) => filters.length === 0 || filters.some((word) => page.includes(word)));
  if (pages.length === 0) throw new Error(`No regression page matches ${filters.join(", ")}.`);
  const vitePort = Number(process.env.REGRESSION_PORT ?? 1460);
  const debugPort = vitePort + 1;
  const base = `http://localhost:${vitePort}/tests/regression/`;
  const profile = mkdtempSync(path.join(tmpdir(), "fly-regression-"));
  const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(vitePort), "--strictPort"], { cwd: root, stdio: "ignore" });
  let browser;
  let failed = 0;
  try {
    await waitForHttp(`${base}${pages[0].split("?")[0]}`, 30_000);
    // Pages that do not pick a language follow the browser's, and their checks are written
    // against the Chinese interface; an English CI runner would otherwise fail them.
    const language = process.env.REGRESSION_LANG ?? "zh-CN";
    browser = spawn(findBrowser(), ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `--lang=${language}`, `--accept-lang=${language}`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
    const session = await connect(debugPort);
    for (const page of pages) {
      const started = Date.now();
      const { outcome, state, errors } = await runPage(session, base + page);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${outcome === "passed" ? "✓" : "✗"} ${page}  ${outcome}, ${passedChecks(state.text ?? "")} checks, ${seconds}s`);
      if (outcome !== "passed") {
        failed += 1;
        const lines = (state.text ?? "").split("\n").filter((line) => line.trim());
        for (const line of lines.filter((line) => !line.startsWith("PASS ")).slice(-5)) console.log(`    ${line}`);
        for (const error of errors.slice(0, 3)) console.log(`    ${error.split("\n")[0]}`);
      }
    }
    session.close();
  } finally {
    browser?.kill();
    vite.kill();
    await sleep(300);
    // The browser can still hold files in its profile for a moment; a leftover temp
    // folder must not turn a finished run into a failure.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      console.warn(`Could not remove ${profile}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(failed === 0 ? `All ${pages.length} regression pages passed.` : `${failed} of ${pages.length} regression pages did not pass.`);
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
