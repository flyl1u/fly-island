import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import { ScreenshotWindow } from "../../src/windows/screenshot/ScreenshotWindow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
localStorage.setItem("fly-island-locale", "zh-CN");
mockWindows("screenshot");
const t = TRANSLATIONS["zh-CN"].screenshot;
type Case = { name: string; dpi: number; width: number; height: number; x: number; y: number };
let current: Case;
let exported = "";
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "plugin:window|scale_factor") return current.dpi;
  if (command === "screenshot_window_rect") return [current.x, current.y, current.width, current.height];
  if (command === "screenshot_raw") {
    const { width, height } = current;
    const frame = new ArrayBuffer(8 + width * height * 4);
    new DataView(frame).setUint32(0, width, true); new DataView(frame).setUint32(4, height, true);
    const rgba = new Uint8Array(frame, 8); rgba.fill(220);
    for (let x = 0; x < width; x++) {
      rgba.set([17, 43, 89, 255], x * 4);
      rgba.set([91, 127, 163, 255], ((height - 1) * width + x) * 4);
    }
    for (let y = 1; y < height - 1; y++) {
      rgba.set([101, 111, 121, 255], y * width * 4);
      rgba.set([61, 71, 81, 255], (y * width + width - 1) * 4);
    }
    return frame;
  }
  if (command === "screenshot_windows") return [[current.x + 30, current.y + 30, current.x + 300, current.y + 200]];
  if (command === "screenshot_fonts") return ["Segoe UI"];
  if (command === "screenshot_copy_png") { exported = String(args.pngBase64); return Promise.reject("test keeps editor open"); }
  return null;
}, { shouldMockEvents: true });
HTMLElement.prototype.setPointerCapture = () => {};
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<I18nProvider><ScreenshotWindow /></I18nProvider>));
const pointer = async (target: Element, type: string, x: number, y: number) => {
  await act(async () => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 })); });
};
const click = async (label: string) => {
  const target = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label)!;
  await act(async () => target.click());
};
async function runCase(item: Case) {
  current = item;
  const messages: string[] = [];
  const check = (ok: unknown, label: string) => messages.push(`${ok ? "PASS" : "FAIL"} ${item.name}: ${label}`);
  await act(async () => { await emit("screenshot-arm"); await new Promise((resolve) => setTimeout(resolve, 70)); });
  check(!document.querySelector(".screenshot-failure"), "new display metrics are accepted");
  check(document.querySelector(".screenshot-dim")!.getBoundingClientRect().height === innerHeight, "dimming covers this viewport immediately");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true })));
  const selection = document.querySelector<HTMLElement>(".screenshot-selection")!.getBoundingClientRect();
  check(selection.x === 0 && selection.y === 0 && selection.width === innerWidth && selection.height === innerHeight, "full selection has no edge gap");
  check(document.querySelector(".screenshot-selection .screenshot-size")!.textContent?.trim() === `${item.width} × ${item.height}`, "size label reports physical pixels");
  await click(t.copyAndClose);
  const image = new Image(); image.src = `data:image/png;base64,${exported}`; await image.decode();
  check(image.width === item.width && image.height === item.height, "export dimensions match native pixels on both axes");
  const output = document.createElement("canvas"); output.width = image.width; output.height = image.height;
  const ctx = output.getContext("2d")!; ctx.drawImage(image, 0, 0);
  const color = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data].join(",");
  check(color(Math.floor(item.width / 2), 0) === "17,43,89,255", "first physical row is preserved");
  check(color(Math.floor(item.width / 2), item.height - 1) === "91,127,163,255", "last physical row is preserved");
  check(color(0, Math.floor(item.height / 2)) === "101,111,121,255" && color(item.width - 1, Math.floor(item.height / 2)) === "61,71,81,255", "first and last columns are preserved");
  await click(t.toolShape);
  const canvas = document.querySelector<HTMLCanvasElement>(".screenshot-canvas")!;
  await pointer(canvas, "pointerdown", 20, 20); await pointer(canvas, "pointermove", 120, 80); await pointer(canvas, "pointerup", 120, 80);
  await pointer(canvas, "pointerdown", 20, 50); await pointer(canvas, "pointerup", 20, 50);
  check(document.querySelectorAll(".screenshot-node").length === 8 && document.querySelector<HTMLElement>('[data-node="nw"]')?.style.left === "15px", "control points align with CSS geometry");
  const fill = document.querySelector<HTMLInputElement>(`[aria-label="${t.fillShape}"]`)!;
  if (!fill.checked) await act(async () => fill.click());
  const pixel = [...canvas.getContext("2d")!.getImageData(Math.round(40 * item.width / innerWidth), Math.round(40 * item.height / innerHeight), 1, 1).data];
  check(pixel.join(",") === "255,94,91,255", "filled annotation aligns in the native backing canvas");
  const toolbar = document.querySelector<HTMLElement>(".screenshot-rows")!.getBoundingClientRect();
  check(toolbar.left >= 0 && toolbar.top >= 0 && toolbar.right <= innerWidth && toolbar.bottom <= innerHeight, "wrapped toolbar stays within viewport");
  const controls = [...document.querySelectorAll<HTMLElement>(".screenshot-rows button, .screenshot-rows input, .screenshot-rows select")];
  check(controls.every((control) => { const rect = control.getBoundingClientRect(); return rect.x >= 0 && rect.right <= innerWidth && rect.y >= 0 && rect.bottom <= innerHeight; }), "all property and action controls stay reachable");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  const passed = messages.every((line) => line.startsWith("PASS"));
  document.getElementById("results")!.textContent = messages.join("\n");
  document.documentElement.dataset.testResult = passed ? "passed" : "failed";
  return { passed, messages, exported: { width: image.width, height: image.height } };
}
Object.assign(window, { runScreenshotScalingCase: runCase });
const query = new URLSearchParams(location.search);
if (!query.has("manual")) await runCase({ name: query.get("name") ?? "default", dpi: devicePixelRatio,
  width: Number(query.get("physicalWidth") ?? Math.round(innerWidth * devicePixelRatio)),
  height: Number(query.get("physicalHeight") ?? Math.round(innerHeight * devicePixelRatio)), x: Number(query.get("x") ?? 0), y: Number(query.get("y") ?? 0) });
