import path from "node:path";
import { fileURLToPath } from "node:url";
import { withRegressionBrowser } from "./run-regression.mjs";
import { SCREENSHOT_SCALING_CASES } from "./screenshot-scaling-cases.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await withRegressionBrowser(root, "screenshot-scaling.html", async ({ session, base }) => {
  await session.send("Page.navigate", { url: `${base}screenshot-scaling.html?manual=1` });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { result } = await session.send("Runtime.evaluate", { expression: "typeof window.runScreenshotScalingCase", returnByValue: true });
    if (result?.value === "function") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const item of [...SCREENSHOT_SCALING_CASES, SCREENSHOT_SCALING_CASES[0], SCREENSHOT_SCALING_CASES[2]]) {
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: Math.round(item.width / item.dpi), height: Math.round(item.height / item.dpi), deviceScaleFactor: item.dpi, mobile: false,
    });
    await session.send("Runtime.evaluate", { expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", awaitPromise: true });
    const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
      expression: `window.runScreenshotScalingCase(${JSON.stringify(item)})`, awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails || !result?.value?.passed) throw new Error(JSON.stringify({ item, exceptionDetails, result }));
    console.log(`${item.name}: PASS ${result.value.messages.length} checks; ${item.width}x${item.height}, same window`);
  }
  console.log("Mixed-DPI session sequence passed without reloading the WebView.");
});
