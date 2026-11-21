// Pixel and motion fixtures for the real island in island-tour.html.
const select = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function prepareTourGlassBackdrop() {
  const canvas = select<HTMLCanvasElement>(".island__glass-backdrop canvas");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, "#2a334c");
  gradient.addColorStop(1, "#445c68");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const across = context.createLinearGradient(0, 0, canvas.width, 0);
  across.addColorStop(0, "transparent");
  across.addColorStop(1, "rgba(190, 210, 255, 0.15)");
  context.fillStyle = across;
  context.fillRect(0, 0, canvas.width, canvas.height);
  document.documentElement.dataset.glassBackdrop = "live";
}

function fixtureCss(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
}

function installPixelSamples(fault: boolean) {
  fixtureCss(`
    html body { background: #9cc0d6 }
    .island { box-shadow: none !important }
    .island__glass-shadow, .island__collapsed { visibility: hidden }
    .island__expanded { opacity: 0 !important }
    .island, .island__surface { transition-property: none !important }
  `);
  const island = select(".island");
  const surface = select(".island__surface");
  const material = select(".island__material");
  const glass = material.classList.contains("island__material--glass");
  const pixelProbe = (rect: DOMRect, mode: "collapsed" | "expanded") => ({
    material: glass ? "glass" : "classic", viewport: [innerWidth, 128], crop: true, dpr: devicePixelRatio,
    ...(glass && { glassContinuity: { x: rect.left + rect.width / 2, top: rect.top, height: rect.height, mode } }),
  });
  const baseShape = material.style.getPropertyValue("--island-shouldered-shape");
  const side = "vline to calc(100% - var(--island-outline-bottom-radius))";
  const notch = [
    "hline to calc(var(--island-shoulder-radius) - 1px)",
    "vline to calc(var(--island-shoulder-radius) + 2px)",
    "hline to var(--island-shoulder-radius)",
  ].join(", ");
  if (fault && !baseShape.includes(side)) throw new Error("Cannot insert the shoulder fault");

  Object.assign(window, {
    async sampleIslandShoulder(length: number, height: number) {
      // Exercise fractional widths as well as fractional shoulder lengths at each emulated DPR.
      island.style.setProperty("--collapsed-island-width", `${320.25 + (length % 3) * 0.25}px`);
      island.style.setProperty("--collapsed-island-height", `${height}px`);
      surface.style.setProperty("--island-shoulder-length", `${length}px`);
      if (fault) material.style.setProperty("--island-shouldered-shape",
        length <= 20 ? baseShape.replace(side, `${notch}, ${side}`) : baseShape);
      await frame();
      await frame();

      const rect = island.getBoundingClientRect();
      const host = material.getBoundingClientRect();
      const style = getComputedStyle(material);
      const radius = Number.parseFloat(style.getPropertyValue("--island-outline-radius"));
      const depth = Math.min(length, (rect.height * length) / (length + radius));
      const bottomRadius = Math.min(radius, rect.height - depth, rect.width / 2);
      if (!style.clipPath.startsWith("shape(") || Math.abs(rect.left - host.left - depth) > 0.04) {
        throw new Error(`The clipped material did not extend by ${depth}px`);
      }
      const points: Record<string, number[]> = {};

      if (length >= 13) {
        // High enough that the shoulder still reaches well past the body's side: the squircle hugs
        // the side early, and on a short shoulder 19% down already put the outer probe on the edge.
        const y = rect.top + Math.max(1.5, depth * 0.1);
        for (const [name, x, inward] of [["left", rect.left, 1], ["right", rect.right, -1]] as const) {
          points[`${name}Shoulder`] = [x - inward, y];
          points[`${name}Seam`] = [x, y];
          points[`${name}Body`] = [x + inward, y];
          // Lower down, the body's own rim must stay faded: it drew a line inside the shoulder.
          points[`${name}Rim`] = [x + inward, rect.top + depth * 0.6];
          points[`${name}Inner`] = [x + inward * 4, rect.top + depth * 0.6];
          points[`${name}Desktop`] = [x + inward * bottomRadius * 0.12, rect.bottom + 40];
          points[`${name}CornerOut`] = [x + inward * bottomRadius * 0.12, rect.bottom - bottomRadius * 0.12];
          points[`${name}CornerIn`] = [x + inward * bottomRadius * 0.4, rect.bottom - bottomRadius * 0.4];
          points[`${name}CornerTop`] = [x + inward * 2, rect.bottom - bottomRadius + 2];
        }
      }

      return JSON.stringify({
        ...pixelProbe(rect, "collapsed"),
        points,
        contour: {
          body: [rect.left, rect.right], outside: [host.left, host.right],
          top: rect.top, join: rect.top + depth, bottom: rect.bottom,
        },
      });
    },
    async sampleExpandedGlassShoulder() {
      surface.style.removeProperty("--island-shoulder-length");
      island.style.removeProperty("--collapsed-island-width");
      island.style.removeProperty("--collapsed-island-height");
      select(".island__open-button").click();
      await frame();
      // The glass waits for data-moving to clear (640ms), then fades in over 200ms.
      await delay(900);
      await frame();
      if (!island.classList.contains("island--expanded") || island.hasAttribute("data-moving")
        || !getComputedStyle(material).clipPath.startsWith("shape(")) {
        throw new Error("The shouldered glass did not settle in the expanded state");
      }
      return JSON.stringify({ ...pixelProbe(island.getBoundingClientRect(), "expanded"), points: {} });
    },
  });
}

/** Recreates the 3.2.8 shoulder renderer for an A/B with the same page, frame and inputs. */
function install328Shoulders() {
  document.documentElement.dataset.tourRenderer = "328";
  const shoulder = document.createElement("span");
  shoulder.className = "tour-328-shoulders";
  shoulder.setAttribute("aria-hidden", "true");
  select(".island").prepend(shoulder);
  fixtureCss(`
    @property --tour-328-length { syntax: "<length>"; inherits: false; initial-value: 0px; }
    [data-tour-renderer] .island--shoulders {
      container-type: normal !important;
      background: var(--island-material-fill) !important;
    }
    [data-tour-renderer] .island--shoulders:is(.island--material-liquidGlass, .island--material-frostedGlass) {
      background: var(--glass-tint-color) !important;
    }
    [data-tour-renderer] .island__material,
    [data-tour-renderer] .island__surface-contents { display: contents !important; }
    [data-tour-renderer] .island:not(.island--preparing.island--collapsed) > .island__surface {
      overflow: hidden !important;
      transition: none !important;
    }
    [data-tour-renderer] .island--shoulders::after {
      mask-image: linear-gradient(transparent 2px, #000 30px) !important;
      border-radius: inherit !important;
      transition: none !important;
    }
    [data-tour-renderer] .island--shoulders .island__glass {
      mask-image: linear-gradient(transparent var(--island-shoulder-size-target), #000 30px) !important;
    }
    [data-tour-renderer] .island__glass-refraction { --refraction-band: 0px !important; }
    [data-tour-renderer] .island__glass-refraction::before { content: "" !important; }
    [data-tour-renderer] .island__material--glass::before { content: none !important; }
    [data-tour-renderer] .island--material-frostedGlass .island__glass::before { clip-path: none !important; }
    .tour-328-shoulders {
      --tour-328-scale: var(--island-expanded-scale);
      --tour-328-length: calc(var(--island-shoulder-size-target) * var(--tour-328-scale));
      position: absolute;
      inset: 0 calc(-1 * var(--tour-328-length));
      background: inherit;
      pointer-events: none;
      mask:
        radial-gradient(circle var(--tour-328-length) at 0 100%, transparent calc(var(--tour-328-length) - 0.5px), #000 var(--tour-328-length))
          left top / calc(var(--tour-328-length) + 1px) var(--tour-328-length) no-repeat,
        radial-gradient(circle var(--tour-328-length) at 100% 100%, transparent calc(var(--tour-328-length) - 0.5px), #000 var(--tour-328-length))
          right top / calc(var(--tour-328-length) + 1px) var(--tour-328-length) no-repeat;
      transition: --tour-328-length var(--island-motion-duration) var(--island-motion);
    }
    .island--collapsed .tour-328-shoulders { --tour-328-scale: var(--island-collapsed-scale); }
  `);
}

async function frameIntervals(duration: number, start: () => void, onFrame?: (elapsed: number) => void) {
  const intervals: number[] = [];
  const began = await frame();
  let previous = began;
  start();
  do {
    const current = await frame();
    intervals.push(current - previous);
    previous = current;
    onFrame?.(current - began);
  } while (previous - began < duration);
  return intervals;
}

function formatIntervals(label: string, intervals: readonly number[], refresh: number) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1].toFixed(1);
  const missed = intervals.reduce((count, ms) => count + Math.max(0, Math.round(ms / refresh) - 1), 0);
  return `${label}  ${intervals.length} 间隔  p50=${percentile(0.5)}ms  p95=${percentile(0.95)}ms  max=${percentile(1)}ms  估计丢帧=${missed}`;
}

async function measureShoulderMotion(query: URLSearchParams, results: HTMLElement) {
  const legacy = query.get("perfRenderer") === "328";
  if (legacy) install328Shoulders();
  const idle = (await frameIntervals(300, () => {})).sort((a, b) => a - b);
  const refresh = idle[Math.floor(idle.length / 2)];
  const rows = [`材质帧间隔  ${legacy ? "3.2.8 绘制基线" : "单路径"}  DPR=${devicePixelRatio}  空闲 p50=${refresh.toFixed(1)}ms`];
  const phases = [
    ["展开", ".island__open-button"],
    ["收起", ".island__collapse-target"],
  ] as const;
  const samples = { 展开: [] as number[], 收起: [] as number[], 拖动: [] as number[] };
  const island = select(".island");
  const target = "--island-shoulder-size-target";
  for (let trial = 0; trial < 3; trial++) {
    for (const [name, selector] of phases) {
      const intervals = await frameIntervals(700, () => select(selector).click());
      const expanded = island.classList.contains("island--expanded");
      if (expanded !== (name === "展开")) throw new Error(`${name}动作未切换岛屿状态`);
      samples[name].push(...intervals);
    }
    const intervals = await frameIntervals(850, () => island.style.setProperty(target, "4px"), (elapsed) => {
      const progress = Math.min(elapsed / 400, 1);
      const radius = Math.round((4 + 16 * progress) * 2) / 2;
      island.style.setProperty(target, `${radius}px`);
    });
    island.style.removeProperty(target);
    samples.拖动.push(...intervals);
  }
  for (const [label, intervals] of Object.entries(samples)) rows.push(formatIntervals(label, intervals, refresh));
  results.textContent = rows.join("\n");
}

export async function runShoulderFixture(query: URLSearchParams, results: HTMLElement) {
  try {
    const until = performance.now() + 3000;
    while (!document.querySelector(".island") && performance.now() < until) await frame();
    select(".island");
    await delay(350);
    if (query.has("glassBackdrop")) prepareTourGlassBackdrop();
    if (query.has("shapePerf")) await measureShoulderMotion(query, results);
    else {
      installPixelSamples(query.has("shoulderFault"));
      results.textContent = "PASS 贴边轮廓已就绪";
    }
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `FAIL ${String(error)}`;
    results.dataset.result = "failed";
  }
}

