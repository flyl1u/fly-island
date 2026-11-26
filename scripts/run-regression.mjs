// Runs the browser regression pages (tests/regression/*.html) in headless Chrome or
// Edge and reports each page's own pass/fail result. Starts its own Vite server.
//
//   pnpm test:regression                 every page
//   pnpm test:regression mail-reader     pages whose name contains the word
//   pnpm test:regression shoulderSweep   screenshot the contour at four device scale factors
//   pnpm test:regression shapePerf       compare frame intervals with the 3.2.8 shoulder renderer
// REGRESSION_SHOULDER_FAULT=1 adds a known 1px notch to the shoulderSweep contours.
//   REGRESSION_REDUCED_MOTION=reduce pnpm test:regression  emulate Windows animations off
//
// Pages are driven over the DevTools protocol in a normal tab, not with --dump-dom:
// that mode stops running page scripts after load, so pages that wait on timers
// (the collapsed message animation waits for a five-second auto-restore) never finish.
// CHROME_PATH picks the browser; REGRESSION_PORT the Vite port (default: a free one).
// Both ports are free ones picked per run: lanes run this at the same time, and with fixed
// ports one run would test another lane's Vite and read another lane's browser.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capturePixelProbe } from "./regression-pixels.mjs";
import { SCREENSHOT_SCALING_PAGES } from "./screenshot-scaling-cases.mjs";
export const PAGES = [
  ...SCREENSHOT_SCALING_PAGES,
  "screenshot-polish.html",
  "screenshot-polish.html?lang=en&theme=light&scale=1.5&dpr=1.5",
  "screenshot-shapes.html",
  "screenshot-shapes.html?lang=en",
  ...["screenshot-session.html", "screenshot-session.html?cold=1", "screenshot-plugin.html", "screenshot-plugin.html?lang=en&theme=light", "screenshot-plugin.html?viewportWidth=512&viewportHeight=480&dpr=2"],
  ...["screenshot-text.html", "screenshot-text.html?lang=en", "screenshot-ocr.html", "screenshot-ocr.html?dense=1", "screenshot-ocr.html?lang=en&theme=light", "screenshot-ocr.html?viewportWidth=512&viewportHeight=288&dpr=3", "screenshot-ocr.html?viewportWidth=455&viewportHeight=256&dpr=3&lang=en"],
  "screenshot-translation.html",
  ...["screenshot-translation.html?theme=light&lang=en", "screenshot-translation.html?viewportWidth=512&viewportHeight=288&dpr=3", "screenshot-translation.html?viewportWidth=455&viewportHeight=256&dpr=3&lang=en"],
  "config-transfer.html",
  "config-transfer.html?lang=en",
  "agent-alert-card.html",
  "agent-alerts.html",
  "agent-sounds.html",
  "agent-approvals.html",
  "agent-dsh.html?test=1",
  "agent-sessions.html?test=1",
  "agent-sessions.html?test=1&features=enabled",
  "collapsed-message-animation.html?test=1",
  "collapsed-message-animation.html?test=1&features=enabled",
  "clipboard-history.html",
  "clipboard-window.html?test=1",
  "file-shelf.html",
  "i18n.html?test=1",
  "island-tour.html?test=1&shoulders=1",
  "island-tour.html?test=1&update=1",
  "island-tour.html?test=1&pageButtons=iconLabel",
  "island-tour.html?test=1&pageButtons=iconLabel&lang=en",
  // Both ends of the expanded size slider: every page still inside the (scaled) island. They also
  // cover the line and hidden tucked looks.
  "island-tour.html?test=1&scale=0.85&tuck=line&shoulders=1",
  "island-tour.html?test=1&scale=1.2&tuck=hidden&shoulders=1",
  "island-tour.html?test=1&scale=1.2&notch=1&font=120",
  // The capsule shape (?capsule=1&tuck=line) waits for CAPSULE_SHAPE_ENABLED in islandShape.ts.
  // The light scheme, and a white island picked in the dark scheme (its text turns dark).
  "island-tour.html?test=1&theme=light",
  "island-tour.html?test=1&clockWeather=1&notch=1&font=120&features=enabled",
  "island-tour.html?test=1&clockWeather=1&theme=light&features=enabled",
  "island-tour.html?test=1&bg=FFFFFF",
  "island-tour.html?test=1&material=liquidGlass",
  "island-tour.html?test=1&material=liquidGlass&shoulders=1&glassBackdrop=1",
  "island-tour.html?test=1&theme=light&material=liquidGlass&shoulders=1&glassBackdrop=1",
  "island-tour.html?test=1&material=frostedGlass&shoulders=1&glassBackdrop=1",
  "island-tour.html?test=1&theme=light&material=frostedGlass&shoulders=1&glassBackdrop=1",
  "island-tour.html?test=1&material=classic&opacity=80&shoulders=1&classicShoulders=1",
  "island-tour.html?test=1&theme=light&material=classic&opacity=80&shoulders=1&classicShoulders=1",
  "island-tour.html?test=1&theme=light&material=classic&opacity=80&shoulders=1&classicShoulders=1&capsule=1",
  ...[1, 1.25, 1.5, 2].flatMap((dpr) => [
    `island-tour.html?shoulderSweep=1&dpr=${dpr}&material=classic&opacity=80`,
    `island-tour.html?shoulderSweep=1&dpr=${dpr}&material=liquidGlass&glassBackdrop=1`,
  ]),
  "island-tour.html?shoulderSweep=1&dpr=1.5&material=frostedGlass&glassBackdrop=1&corner=round",
  "island-tour.html?test=1&theme=light&material=liquidGlass",
  "island-tour.html?test=1&material=frostedGlass",
  "island-tour.html?test=1&theme=light&material=frostedGlass",
  "mail-reader.html?run=1",
  "mail-reader.html?run=1&features=enabled",
  "message-clear.html",
  "message-clear.html?lang=en",
  "message-preview-duration.html",
  "notice-reader.html",
  "notice-reader.html?scale=1.4&theme=light&lang=en",
  "lyric-clock.html",
  "lyric-word-fill.html",
  "music-lyrics.html",
  "notification-startup.html",
  "panel-preview.html",
  "release-features.html",
  "plugins-settings.html",
  "plugins-settings.html?lang=en",
  "plugins-settings.html?features=enabled",
  "plugins-settings.html?lang=en&features=enabled",
  "zcode-api-key-settings.html",
  "zcode-api-key-settings.html?lang=en",
  "plugin-panel.html?features=enabled",
  "device-battery.html",
  "device-battery.html?lang=en&theme=light",
  "eye-care-window.html?features=enabled",
  "eye-care-window.html?features=enabled&theme=light&lang=en",
  "eye-care-window.html?features=enabled&material=liquidGlass",
  "eye-care-window.html?features=enabled&theme=light&material=liquidGlass&lang=en",
  "eye-care-window.html?features=enabled&material=frostedGlass",
  "eye-care-window.html?features=enabled&theme=light&material=frostedGlass&lang=en",
  "settings.html?test=1",
  "settings.html?test=1&features=enabled",
  "settings.html?test=1&clockWeather=1&features=enabled",
  "settings-sidebar.html",
  "settings-sidebar.html?features=enabled",
  "settings-sync.html",
  "todo-edit.html",
  "todo-file-sync.html",
  "todo-date-picker.html",
  "todo-date-picker.html?lang=en&scale=1.2&theme=light",
  "todo-rotation.html",
  "todo-reorder.html",
  "todo-history-calendar.html",
  "todo-timer.html",
  "todo-timer.html?scale=0.85",
  "todo-timer.html?scale=1.2",
  "update-dot.html?window=settings",
  "update-dot.html?window=settings&lang=en",
  "tucked-hover.html",
  "translation-window.html?test=1&theme=dark",
  "translation-window.html?test=1&theme=light",
];
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
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: process.env.REGRESSION_REDUCED_MOTION ?? "no-preference" }],
  });
  const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener]);
  return { send, on, errors, close: () => socket.close() };
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
  if (dpr) await session.send("Emulation.setDeviceMetricsOverride", { width: Number(query.get("viewportWidth") ?? 1200),
    height: Number(query.get("viewportHeight") ?? 800), deviceScaleFactor: dpr, mobile: false });
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let state = {};
  let reloaded = false;
  try {
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
    if (dpr) await session.send("Emulation.clearDeviceMetricsOverride");
  }
}

/**
 * Starts this checkout's Vite on a free port and a headless browser, and runs `use` with a
 * DevTools session and the regression pages' base URL; stops both afterwards. `firstPage` is
 * fetched first, to know Vite answers.
 */
export async function withRegressionBrowser(root, firstPage, use, { featuresEnabled = false } = {}) {
  const vitePort = Number(process.env.REGRESSION_PORT ?? await freePort());
  const debugPort = await freePort();
  const base = `http://localhost:${vitePort}/tests/regression/`;
  const profile = mkdtempSync(path.join(tmpdir(), "fly-regression-"));
  const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(vitePort), "--strictPort"], {
    cwd: root, stdio: "ignore", env: { ...process.env, FLY_ISLAND_REGRESSION_FEATURES: featuresEnabled ? "enabled" : "" },
  });
  let browser;
  try {
    await waitForHttp(`${base}${firstPage.split("?")[0]}`, 30_000);
    // Something else answering on the port (Vite could not take it) is not this checkout's code.
    if (vite.exitCode !== null) throw new Error(`Vite exited (port ${vitePort} taken?); not testing whatever answers there.`);
    // Pages that do not pick a language follow the browser's, and their checks are written
    // against the Chinese interface; an English CI runner would otherwise fail them.
    const language = process.env.REGRESSION_LANG ?? "zh-CN";
    // REGRESSION_GPU=1 draws on the graphics card through Direct3D, as WebView2 does
    // (scripts/measure-island-motion.mjs --gpu); otherwise in software, the same on every machine.
    const graphics = process.env.REGRESSION_GPU ? ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] : ["--disable-gpu"];
    browser = spawn(findBrowser(), ["--headless=new", ...graphics, "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, `--lang=${language}`, `--accept-lang=${language}`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
    const session = await connect(debugPort);
    const result = await use({ session, base });
    session.close();
    return result;
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
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const filters = process.argv.slice(2);
  const candidates = filters.includes("shapePerf") ? SHAPE_PERF_PAGES : PAGES;
  const pages = candidates.filter((page) => filters.length === 0 || filters.some((word) => page.includes(word)));
  if (pages.length === 0) throw new Error(`No regression page matches ${filters.join(", ")}.`);
  let failed = 0;
  console.log(`Regression prefers-reduced-motion: ${process.env.REGRESSION_REDUCED_MOTION ?? "no-preference"}`);
  for (const featuresEnabled of [false, true]) {
    const fixtures = pages.filter((page) => page.includes("features=enabled") === featuresEnabled);
    if (fixtures.length === 0) continue;
    await withRegressionBrowser(root, fixtures[0], async ({ session, base }) => {
      for (const page of fixtures) {
        const started = Date.now();
        const fault = page.includes("shoulderSweep") && process.env.REGRESSION_SHOULDER_FAULT === "1" ? "&shoulderFault=1" : "";
        const { outcome, state, errors } = await runPage(session, base + page + fault);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`${outcome === "passed" ? "✓" : "✗"} ${page}  ${outcome}, ${passedChecks(state.text ?? "")} checks, ${seconds}s`);
        if (outcome === "passed" && page.includes("shapePerf")) console.log(state.text);
        if (outcome !== "passed") {
          failed += 1;
          const lines = (state.text ?? "").split("\n").filter((line) => line.trim());
          for (const line of lines.filter((line) => !line.startsWith("PASS ")).slice(-5)) console.log(`    ${line}`);
          for (const error of errors.slice(0, 3)) console.log(`    ${error.split("\n")[0]}`);
        }
      }
    }, { featuresEnabled });
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
