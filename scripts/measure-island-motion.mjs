// node scripts/measure-island-motion.mjs [runs] [--trace] [--frames] [--scale=1.1] — how smoothly
// the island opens and closes.
//
// Builds the island tour (tests/regression/island-tour.html: the real island with its native
// commands mocked) for production, as the app ships (no StrictMode double renders, no React dev
// checks), serves it to a headless Chrome / Edge (run-regression.mjs), slows the
// CPU down 4x so costs show, and opens and closes the island on each page several times. For each
// it records every animation frame for 700ms after the click and Chrome's own layout, style and
// script time, then prints per page and overall: how long the island took to get 90% of the way
// and to settle, frames where it stood still mid-motion, the delay before the first frame, the frame
// intervals (median, 95th percentile, longest), frames over 25ms (dropped), and main-thread time.
// Headless Chrome paints in software, so absolute numbers are worse than in WebView2; compare runs
// of this script with each other, before and after a change. --trace also records a Chrome trace
// and lists where the main thread and the raster threads spent their time, per open or close.
import { createReadStream, existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { withRegressionBrowser } from "./run-regression.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = Number(process.argv.slice(2).find((arg) => /^\d+$/.test(arg)) ?? 4);
const TRACE = process.argv.includes("--trace");
const PAGES = ["todo", "agents", "music", "clipboard", "shelf"];
const RECORD_MS = 700;
const CPU_SLOWDOWN = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs in the page: click `selector`, then note every frame until `ms` have passed.
const recorder = (selector, ms) => `(async () => {
  const target = document.querySelector(${JSON.stringify(selector)});
  if (!target) return null;
  const frames = [];
  const heights = [];
  const island = document.querySelector(".island");
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = (time) => {
      frames.push(time);
      heights.push(island.getBoundingClientRect().height);
      if (time - start < ${ms}) requestAnimationFrame(tick); else resolve();
    };
    target.click();
    requestAnimationFrame(tick);
  });
  return { start, frames, heights };
})()`;

const metric = (metrics, name) => metrics.find((entry) => entry.name === name)?.value ?? 0;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0;
};

function summarise(samples) {
  const intervals = samples.flatMap((sample) => sample.intervals);
  const sum = (key) => samples.reduce((total, sample) => total + sample[key], 0) / samples.length;
  return {
    to90Ms: +sum("to90").toFixed(0),
    settleMs: +sum("settle").toFixed(0),
    stalledPerRun: +sum("stalls").toFixed(1),
    firstFrameMs: +sum("firstFrame").toFixed(1),
    medianFrameMs: +percentile(intervals, 0.5).toFixed(1),
    p95FrameMs: +percentile(intervals, 0.95).toFixed(1),
    longestFrameMs: +Math.max(...intervals).toFixed(1),
    droppedPerRun: +(intervals.filter((interval) => interval > 25).length / samples.length).toFixed(1),
    layoutMs: +sum("layout").toFixed(1),
    styleMs: +sum("style").toFixed(1),
    scriptMs: +sum("script").toFixed(1),
    taskMs: +sum("task").toFixed(1),
  };
}

// The tour built for production into a temporary folder, served from a small static server.
const outDir = mkdtempSync(path.join(tmpdir(), "fly-motion-"));
await build({
  root,
  logLevel: "warn",
  build: { outDir, emptyOutDir: true, rollupOptions: { input: path.join(root, "tests/regression/island-tour.html") } },
});
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer((request, response) => {
  const file = path.join(outDir, decodeURIComponent(new URL(request.url, "http://x").pathname));
  if (!file.startsWith(outDir) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, resolve));
// --scale=1.1 opens the island at another expanded size (Settings → Appearance).
const scale = process.argv.find((arg) => arg.startsWith("--scale="))?.slice(8);
const tourUrl = `http://localhost:${server.address().port}/tests/regression/island-tour.html${scale ? `?scale=${scale}` : ""}`;

await withRegressionBrowser(root, "island-tour.html", async ({ session }) => {
  await session.send("Performance.enable");
  await session.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await session.send("Page.navigate", { url: tourUrl });
  await sleep(4000);
  const evaluate = async (expression) => (await session.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
  const measure = async (selector) => {
    const before = (await session.send("Performance.getMetrics")).metrics;
    const run = await evaluate(recorder(selector, RECORD_MS));
    const after = (await session.send("Performance.getMetrics")).metrics;
    if (!run) throw new Error(`Missing ${selector}`);
    const delta = (name) => (metric(after, name) - metric(before, name)) * 1000;
    // The motion itself: when the island got 90% of the way, when it settled (within 0.5px of
    // where it ends), and frames in between where it did not move at all (a visible hitch).
    const from = run.heights[0];
    const to = run.heights[run.heights.length - 1];
    const at = (index) => run.frames[index] - run.start;
    const reached = run.heights.findIndex((height) => Math.abs(height - from) >= Math.abs(to - from) * 0.9);
    let settled = run.heights.length - 1;
    while (settled > 0 && Math.abs(run.heights[settled - 1] - to) <= 0.5) settled--;
    const stalls = run.heights.slice(1, settled).filter((height, index) => Math.abs(height - run.heights[index]) < 0.05).length;
    return {
      to90: at(Math.max(0, reached)),
      settle: at(settled),
      stalls,
      firstFrame: run.frames[0] - run.start,
      intervals: run.frames.slice(1).map((time, index) => time - run.frames[index]),
      layout: delta("LayoutDuration"),
      style: delta("RecalcStyleDuration"),
      script: delta("ScriptDuration"),
      task: delta("TaskDuration"),
    };
  };

  await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const traceEvents = [];
  const traceDone = new Promise((resolve) => session.on("Tracing.tracingComplete", resolve));
  session.on("Tracing.dataCollected", ({ value }) => traceEvents.push(...value));
  if (TRACE) {
    await session.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "cc"] },
    });
  }
  const results = { open: {}, close: {} };
  for (const page of PAGES) {
    // Leave the island on this page, closed, so opening it shows the page.
    await evaluate(`document.querySelector(".island__open-button")?.click()`);
    await sleep(1200);
    await evaluate(`document.querySelector(".dot-button--${page}, .island__agent-button${page === "agents" ? "" : ":not(*)"}")?.click()`);
    await sleep(1200);
    await evaluate(`document.querySelector(".island__collapse-target")?.click()`);
    await sleep(1200);
    results.open[page] = [];
    results.close[page] = [];
    for (let run = 0; run < RUNS; run++) {
      results.open[page].push(await measure(".island__open-button"));
      await sleep(500);
      results.close[page].push(await measure(".island__collapse-target"));
      await sleep(500);
    }
  }
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  if (TRACE) {
    await session.send("Tracing.end");
    await traceDone;
    // Time per thread and event name, per open or close (the page set-up clicks included).
    const threads = new Map(traceEvents.filter((event) => event.name === "thread_name").map((event) => [`${event.pid}:${event.tid}`, event.args.name]));
    const totals = new Map();
    for (const event of traceEvents) {
      if (event.ph !== "X" || !event.dur) continue;
      const thread = threads.get(`${event.pid}:${event.tid}`) ?? "";
      if (!/CrRendererMain|Raster|Compositor/.test(thread)) continue;
      const key = `${thread.replace(/\d+$/, "")} · ${event.name}`;
      totals.set(key, (totals.get(key) ?? 0) + event.dur / 1000);
    }
    const cycles = PAGES.length * (RUNS * 2 + 3);
    console.log("Trace, ms per open or close:");
    console.table([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([name, ms]) => ({ name, ms: +(ms / cycles).toFixed(1) })));
  }

  const rows = [];
  for (const phase of ["open", "close"]) {
    for (const page of PAGES) rows.push({ phase, page, ...summarise(results[phase][page]) });
    rows.push({ phase, page: "ALL", ...summarise(PAGES.flatMap((page) => results[phase][page])) });
  }
  if (process.argv.includes("--frames")) {
    // Every frame interval of every open, to see where in the animation the long ones fall.
    for (const page of PAGES) for (const run of results.open[page]) console.log(page, run.intervals.map((interval) => Math.round(interval)).join(" "));
  }
  console.log(`CPU ${CPU_SLOWDOWN}x slower, ${RUNS} runs per page, ${RECORD_MS}ms recorded after each click.`);
  console.table(rows);
});
server.close();
rmSync(outDir, { recursive: true, force: true });
