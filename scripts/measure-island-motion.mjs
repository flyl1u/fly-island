// node scripts/measure-island-motion.mjs [runs] [--trace] [--profile] [--gpu] [--frames] [--scale=1.1] — how
// smoothly the island opens, closes and switches pages.
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
// and lists where the main thread, the raster threads and the GPU process spent their time.
// Page switches ("switch") click from each page's dot to the next one with the island open.
// --profile builds without minifying and lists the script functions that took the most time.
// --gpu draws on the graphics card (Direct3D, as WebView2 does) instead of in software, so the
// trace shows the GPU process's raster and draw time.
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
const PROFILE = process.argv.includes("--profile");
if (process.argv.includes("--gpu")) process.env.REGRESSION_GPU = "1";
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
  build: { outDir, emptyOutDir: true, minify: !PROFILE, rollupOptions: { input: path.join(root, "tests/regression/island-tour.html") } },
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
      traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "cc", "gpu", "viz"] },
    });
  }
  if (PROFILE) {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 200 });
    await session.send("Profiler.start");
  }
  const results = { open: {}, close: {}, switch: {} };
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
  // Page switches: open on each page, then click the next page's dot.
  await evaluate(`document.querySelector(".island__open-button")?.click()`);
  await sleep(1200);
  for (let run = 0; run < RUNS; run++) {
    for (let index = 0; index < PAGES.length; index++) {
      const next = PAGES[(index + 1) % PAGES.length];
      results.switch[next] ??= [];
      results.switch[next].push(await measure(next === "agents" ? ".island__agent-button" : `.dot-button--${next}`));
      await sleep(500);
    }
  }
  await evaluate(`document.querySelector(".island__collapse-target")?.click()`);
  await sleep(800);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  if (PROFILE) {
    // Self time per function across every open, close and switch (the waits between them included).
    const { profile } = await session.send("Profiler.stop");
    const self = new Map();
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    profile.samples.forEach((id, index) => {
      const { callFrame } = byId.get(id);
      const key = `${callFrame.functionName || "(anonymous)"} ${callFrame.url.split("/").pop()}:${callFrame.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index + 1] ?? 0) / 1000);
    });
    console.log("Script self time, ms in total:");
    console.table([...self.entries()].filter(([key]) => !/^\((idle|program|garbage collector)\)/.test(key)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, ms]) => ({ name, ms: +ms.toFixed(1) })));
  }
  if (TRACE) {
    await session.send("Tracing.end");
    await traceDone;
    // Time per thread and event name, per open or close (the page set-up clicks included).
    const threads = new Map(traceEvents.filter((event) => event.name === "thread_name").map((event) => [`${event.pid}:${event.tid}`, event.args.name]));
    const totals = new Map();
    for (const event of traceEvents) {
      if (event.ph !== "X" || !event.dur) continue;
      const thread = threads.get(`${event.pid}:${event.tid}`) ?? "";
      // The renderer's main and raster threads, and the GPU process, where drawing ends up.
      if (!/CrRendererMain|Raster|Compositor|CrGpuMain|Viz/.test(thread)) continue;
      const key = `${thread.replace(/\d+$/, "")} · ${event.name}`;
      totals.set(key, (totals.get(key) ?? 0) + event.dur / 1000);
    }
    const cycles = PAGES.length * (RUNS * 3 + 3) + 2;
    console.log("Trace, ms per open, close or switch:");
    console.table([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([name, ms]) => ({ name, ms: +(ms / cycles).toFixed(1) })));
  }

  const rows = [];
  for (const phase of ["open", "close", "switch"]) {
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
