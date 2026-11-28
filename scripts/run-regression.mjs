// pnpm test:regression [filter] runs matching pages in headless Chrome/Edge with its own Vite.
// Pages run in parallel, one browser per worker; --workers=N or REGRESSION_WORKERS sets how many.
// A page that fails beside others runs once more on its own and is reported as such.
// REGRESSION_REDUCED_MOTION=reduce emulates animations off; CHROME_PATH selects the browser.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "./regression-pages.mjs";
import { capturePixelProbe } from "./regression-pixels.mjs";

export { PAGES };

const SHAPE_PERF_PAGES = ["classic", "liquidGlass", "frostedGlass"].flatMap((material) => {
  const url = `island-tour.html?shapePerf=1&dpr=1.5&material=${material}${material === "classic" ? "&opacity=80" : "&glassBackdrop=1"}`;
  return [url, `${url}&perfRenderer=328`];
});

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

/**
 * How many pages run at once: what was asked for, else one per four logical cores up to six
 * (so a small CI runner stays serial). Performance pages measure timing, so they never share.
 */
export function workerCount({ requested, cores, serial = false }) {
  if (serial) return 1;
  if (requested === undefined || requested === "") return Math.max(1, Math.min(6, Math.floor(cores / 4)));
  const count = Number(requested);
  if (!Number.isInteger(count) || count < 1) throw new Error(`--workers needs a whole number of 1 or more, not ${requested}.`);
  return count;
}

/** Runs `items` with one task per worker; each takes the next item as soon as it is free. */
export async function runPool(items, workers, run) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(workers.map(async (worker) => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index], worker);
    }
  }));
  return results;
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

/** A TCP port nothing listens on right now. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
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
  // Other DevTools events, for scripts that ask (measure-island-motion.mjs reads a trace).
  const listeners = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    for (const listener of listeners.get(message.method) ?? []) listener(message.params);
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
  // Headless windows have no OS focus; emulate it so keyboard focus styles can be checked.
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  // Windows Server (the CI runner) has animations off, which Chrome reports as
  // prefers-reduced-motion: reduce and the island then swaps messages without a
  // transition. Pages that test reduced motion stub matchMedia themselves, so the
  // run uses an ordinary desktop's setting unless REGRESSION_REDUCED_MOTION says otherwise.
  await setRegressionMedia(send);
  const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener]);
  return { send, on, errors, close: () => socket.close() };
}

function setRegressionMedia(send, forcedColors = "none") {
  return send("Emulation.setEmulatedMedia", { features: [
    { name: "prefers-reduced-motion", value: process.env.REGRESSION_REDUCED_MOTION ?? "no-preference" },
    { name: "forced-colors", value: forcedColors },
  ] });
}

const READ_STATE = `(() => {
  const results = document.getElementById("results");
  return JSON.stringify({
    url: location.href,
    testResult: document.documentElement.dataset.testResult ?? "",
    dataResult: results?.dataset.result ?? "",
    text: results?.textContent ?? "",
  });
})()`;

async function captureShoulderSweep(session, dpr, material) {
  const captures = [];
  const cases = [6, 9.5, 13, 16.5, 20, 24, 28].map((length) => [length, Math.max(38.5, length + 17.5)]);
  cases.push([28, 26.5]);
  const samples = cases.map(([length, height]) => ({
    expression: `window.sampleIslandShoulder(${length}, ${height})`, name: `L=${length} H=${height}`,
  }));
  if (material === "liquidGlass" || material === "frostedGlass") {
    samples.push({ expression: "window.sampleExpandedGlassShoulder()", name: "expanded" });
  }
  for (const { expression, name } of samples) {
    const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails || !result?.value) throw new Error(
      exceptionDetails?.exception?.description ?? "The shoulder fixture returned no pixel probe",
    );
    if (JSON.parse(result.value).dpr !== dpr) throw new Error(`Browser did not use requested DPR ${dpr}`);
    const { passed, label } = await capturePixelProbe(session, result.value);
    captures.push({ passed, label: `${name} DPR=${dpr} ${label.replaceAll("\n", "; ")}` });
  }
  return captures;
}

export async function runPage(session, url) {
  session.errors.length = 0;
  const query = new URL(url).searchParams;
  const dpr = Number(query.get("dpr"));
  const forcedColors = query.has("forcedColors");
  if (dpr) await session.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 800, deviceScaleFactor: dpr, mobile: false });
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let state = {};
  let reloaded = false;
  try {
    if (forcedColors) await setRegressionMedia(session.send, "active");
    await session.send("Page.navigate", { url });
    while (Date.now() < deadline) {
      await sleep(query.has("shoulderSweep") ? 75 : 500);
      // Vite answers a module request with 504 while it re-bundles dependencies; the page's
      // dynamic import then fails for good. Load the page once more instead of timing out.
      if (!reloaded && session.errors.some((error) => error.includes("Failed to fetch dynamically imported module"))) {
        reloaded = true;
        session.errors.length = 0;
        await session.send("Page.navigate", { url });
        continue;
      }
      const { result } = await session.send("Runtime.evaluate", { expression: READ_STATE, returnByValue: true });
      try { state = JSON.parse(result?.value ?? "{}"); } catch { state = {}; }
      if (state.url !== url) continue;
      const outcome = pageOutcome(state);
      if (!outcome) continue;
      if (outcome === "passed" && query.has("shoulderSweep")) {
        const captures = await captureShoulderSweep(session, dpr, query.get("material"));
        state.text += "\n" + captures.map(({ passed, label }) => `${passed ? "PASS" : "FAIL"} ${label}`).join("\n");
        if (captures.some(({ passed }) => !passed)) return { outcome: "failed", state, errors: [...session.errors] };
      }
      return { outcome, state, errors: [...session.errors] };
    }
    return { outcome: "timed out", state, errors: [...session.errors] };
  } catch (error) {
    state.text = `${state.text ?? ""}\nFAIL ${String(error)}`;
    return { outcome: "failed", state, errors: [...session.errors] };
  } finally {
    if (forcedColors) await setRegressionMedia(session.send);
    if (dpr) await session.send("Emulation.clearDeviceMetricsOverride");
  }
}

/** A headless browser with its own profile (so its own localStorage) and a DevTools session. */
async function launchBrowser() {
  const debugPort = await freePort();
  const profile = mkdtempSync(path.join(tmpdir(), "fly-regression-"));
  // Pages that do not pick a language follow the browser's, and their checks are written
  // against the Chinese interface; an English CI runner would otherwise fail them.
  const language = process.env.REGRESSION_LANG ?? "zh-CN";
  // REGRESSION_GPU=1 draws on the graphics card through Direct3D, as WebView2 does
  // (scripts/measure-island-motion.mjs --gpu); otherwise in software, the same on every machine.
  const graphics = process.env.REGRESSION_GPU ? ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] : ["--disable-gpu"];
  const browser = spawn(findBrowser(), ["--headless=new", ...graphics, "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `--lang=${language}`, `--accept-lang=${language}`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
  let session;
  const stop = async () => {
    session?.close();
    browser.kill();
    await sleep(300);
    // The browser can still hold files in its profile for a moment; a leftover temp
    // folder must not turn a finished run into a failure.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      console.warn(`Could not remove ${profile}: ${error instanceof Error ? error.message : error}`);
    }
  };
  try {
    session = await connect(debugPort);
  } catch (error) {
    await stop();
    throw error;
  }
  return { session, stop };
}

/**
 * Starts this checkout's Vite on a free port and `browsers` headless browsers, and runs `use`
 * with their DevTools sessions (`session` is the first) and the regression pages' base URL;
 * stops them all afterwards. `firstPage` is fetched first, to know Vite answers.
 */
export async function withRegressionBrowser(root, firstPage, use, { featuresEnabled = false, browsers = 1 } = {}) {
  const vitePort = Number(process.env.REGRESSION_PORT ?? await freePort());
  const base = `http://localhost:${vitePort}/tests/regression/`;
  const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(vitePort), "--strictPort"], {
    cwd: root, stdio: "ignore", env: { ...process.env, FLY_ISLAND_REGRESSION_FEATURES: featuresEnabled ? "enabled" : "" },
  });
  const launched = [];
  try {
    await waitForHttp(`${base}${firstPage.split("?")[0]}`, 30_000);
    // Something else answering on the port (Vite could not take it) is not this checkout's code.
    if (vite.exitCode !== null) throw new Error(`Vite exited (port ${vitePort} taken?); not testing whatever answers there.`);
    for (let index = 0; index < browsers; index += 1) launched.push(await launchBrowser());
    const sessions = launched.map(({ session }) => session);
    return await use({ session: sessions[0], sessions, base });
  } finally {
    await Promise.all(launched.map(({ stop }) => stop()));
    vite.kill();
  }
}

async function runFixture(session, base, page) {
  const started = Date.now();
  const fault = page.includes("shoulderSweep") && process.env.REGRESSION_SHOULDER_FAULT === "1" ? "&shoulderFault=1" : "";
  const result = await runPage(session, base + page + fault);
  return { ...result, page, seconds: ((Date.now() - started) / 1000).toFixed(1) };
}

function report({ page, outcome, state, errors, seconds }, note = "") {
  console.log(`${outcome === "passed" ? "✓" : "✗"} ${page}  ${outcome}, ${passedChecks(state.text ?? "")} checks, ${seconds}s${note}`);
  if (outcome === "passed") {
    if (page.includes("shapePerf")) console.log(state.text);
    return;
  }
  const lines = (state.text ?? "").split("\n").filter((line) => line.trim());
  for (const line of lines.filter((line) => !line.startsWith("PASS ")).slice(-5)) console.log(`    ${line}`);
  for (const error of errors.slice(0, 3)) console.log(`    ${error.split("\n")[0]}`);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const option = args.find((arg) => arg.startsWith("--workers="));
  const filters = args.filter((arg) => arg !== option);
  const candidates = filters.includes("shapePerf") ? SHAPE_PERF_PAGES : PAGES;
  const pages = candidates.filter((page) => filters.length === 0 || filters.some((word) => page.includes(word)));
  if (pages.length === 0) throw new Error(`No regression page matches ${filters.join(", ")}.`);
  const workers = workerCount({
    requested: option?.slice("--workers=".length) ?? process.env.REGRESSION_WORKERS,
    cores: availableParallelism(),
    serial: filters.includes("shapePerf"),
  });
  const started = Date.now();
  let failed = 0;
  const retried = [];
  console.log(`Regression prefers-reduced-motion: ${process.env.REGRESSION_REDUCED_MOTION ?? "no-preference"}, workers: ${workers}`);
  for (const featuresEnabled of [false, true]) {
    const fixtures = pages.filter((page) => page.includes("features=enabled") === featuresEnabled);
    if (fixtures.length === 0) continue;
    const browsers = Math.min(workers, fixtures.length);
    await withRegressionBrowser(root, fixtures[0], async ({ sessions, base }) => {
      const again = [];
      await runPool(fixtures, sessions, async (page, session) => {
        const result = await runFixture(session, base, page);
        const retry = browsers > 1 && result.outcome !== "passed";
        report(result, retry ? "  (will run again on its own)" : "");
        if (retry) again.push(page);
        else if (result.outcome !== "passed") failed += 1;
      });
      // One at a time, with nothing else running: tells a real failure from a busy machine.
      for (const page of again) {
        const result = await runFixture(sessions[0], base, page);
        report(result, "  (on its own)");
        if (result.outcome === "passed") retried.push(page);
        else failed += 1;
      }
    }, { featuresEnabled, browsers });
  }
  if (retried.length > 0) {
    console.log(`${retried.length} page(s) failed in parallel and passed on their own (timing-sensitive or flaky):`);
    for (const page of retried) console.log(`    ${page}`);
  }
  console.log(`Took ${Math.round((Date.now() - started) / 1000)}s.`);
  console.log(failed === 0 ? `All ${pages.length} regression pages passed.` : `${failed} of ${pages.length} regression pages did not pass.`);
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
