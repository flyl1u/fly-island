import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import { ScreenshotWindow } from "../../src/windows/screenshot/ScreenshotWindow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
const lang = query.get("lang") === "en" ? "en" : "zh-CN";
const scale = Number(query.get("scale") ?? window.devicePixelRatio);
const rawWidth = Math.round(innerWidth * scale), rawHeight = Math.round(innerHeight * scale);
localStorage.setItem("fly-island-locale", lang);
document.documentElement.dataset.theme = query.get("theme") ?? "dark";
const t = TRANSLATIONS[lang].screenshot;
mockWindows("screenshot");
let exported = "";
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "screenshot_window_rect") return [-1920, 100, rawWidth, rawHeight];
  if (command === "screenshot_raw") {
    const frame = new ArrayBuffer(8 + rawWidth * rawHeight * 4);
    new DataView(frame).setUint32(0, rawWidth, true); new DataView(frame).setUint32(4, rawHeight, true);
    new Uint8Array(frame, 8).fill(220); return frame;
  }
  if (command === "screenshot_windows") return [];
  if (command === "screenshot_fonts") return ["Segoe UI"];
  if (command === "screenshot_copy_png") { exported = String(args.pngBase64); return Promise.reject("test keeps editor open"); }
  return null;
}, { shouldMockEvents: true });
HTMLElement.prototype.setPointerCapture = () => {};
const messages: string[] = [];
const check = (ok: unknown, label: string) => messages.push(`${ok ? "PASS" : "FAIL"} ${label}`);
const pointer = async (target: Element, type: string, x: number, y: number) => {
  await act(async () => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 })); });
};
const drag = async (target: Element, x: number, y: number, toX: number, toY: number) => {
  await pointer(target, "pointerdown", x, y); await pointer(target, "pointermove", toX, toY); await pointer(target, "pointerup", toX, toY);
};
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.getAttribute("aria-label") === label)!;
const click = async (label: string) => { await act(async () => button(label).click()); };
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<I18nProvider><ScreenshotWindow /></I18nProvider>));
await act(async () => { await emit("screenshot-arm"); await new Promise((resolve) => setTimeout(resolve, 60)); });
const dim = document.querySelector<HTMLElement>(".screenshot-dim")!;
const dimRect = dim.getBoundingClientRect();
check(dimRect.x === 0 && dimRect.y === 0 && dimRect.width === innerWidth && dimRect.height === innerHeight
  && getComputedStyle(dim).backgroundColor === "rgba(0, 0, 0, 0.45)", "entire screen is dimmed before any pointer click");
await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true })));
let selection = document.querySelector<HTMLElement>(".screenshot-selection")!.getBoundingClientRect();
check(selection.x === 0 && selection.y === 0 && selection.width === innerWidth && selection.height === innerHeight,
  "Ctrl+A includes all screen edges without a top gap");
await click(t.copyAndClose);
const image = new Image(); image.src = `data:image/png;base64,${exported}`; await image.decode();
check(image.width === rawWidth && image.height === rawHeight, "full-screen export includes every physical row and column at this DPI");
await act(async () => { await emit("screenshot-arm"); await new Promise((resolve) => setTimeout(resolve, 60)); });
check(!!document.querySelector(".screenshot-dim"), "repeated shortcut activation restores dimming immediately");
await drag(document.querySelector(".screenshot-overlay")!, 0, 1, innerWidth - 1, innerHeight - 1);
selection = document.querySelector<HTMLElement>(".screenshot-selection")!.getBoundingClientRect();
check(selection.x === 0 && selection.y === 0 && selection.width === innerWidth && selection.height === innerHeight,
  "manual full-screen drag snaps to exact monitor bounds");
check(!document.querySelector(".screenshot-dim"), "selected region is clear and only its outside is dimmed");
await click(t.toolShape);
const fill = document.querySelector<HTMLInputElement>(`[aria-label="${t.fillShape}"]`)!;
const label = fill.closest("label")!;
check(label.textContent?.includes(t.fillShape) && getComputedStyle(label).color === "rgb(58, 47, 42)" && label.getBoundingClientRect().width > fill.getBoundingClientRect().width + 12,
  "fill checkbox has a readable visible label in this theme and language");
const colors = [...document.querySelectorAll<HTMLElement>(".screenshot-color")];
await click("#FF5E5B");
const red = colors[0].getBoundingClientRect(), yellow = colors[1].getBoundingClientRect();
check(getComputedStyle(colors[0]).borderRadius === "3px" && red.width === red.height, "all palette swatches are square");
const style = getComputedStyle(colors[0]);
check(yellow.left - red.right >= 12 && parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset) < yellow.left - red.right,
  "selected color outline never covers its neighboring swatch");
await click(t.toolArrow);
const canvas = document.querySelector<HTMLCanvasElement>(".screenshot-canvas")!;
await drag(canvas, 100, 180, 300, 180);
await drag(canvas, 200, 180, 200, 180);
await pointer(canvas, "pointermove", 200, 180);
check(getComputedStyle(canvas).cursor === "move", "arrow shaft hover uses familiar move cursor");
const node = (key: string) => document.querySelector<HTMLElement>(`.screenshot-node[data-node="${key}"]`)!;
check(getComputedStyle(node("to")).cursor === "ew-resize" && getComputedStyle(node("to")).borderRadius === "50%"
  && node("to").title === t.arrowEndpointHint, "arrow endpoint is round and uses resize cursor plus length/direction hint");
await pointer(canvas, "pointerdown", 200, 180);
check(getComputedStyle(canvas).cursor === "grabbing", "dragging arrow body uses grabbing cursor");
await pointer(canvas, "pointerup", 200, 180);
const mode = document.querySelector<HTMLSelectElement>(`[aria-label="${t.arrowStyle}"]`)!;
check(mode.options.length === 3 && mode.value === "single", "arrow dropdown offers single, double and no-head modes");
for (const value of ["double", "none", "single"]) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(mode, value); mode.dispatchEvent(new Event("change", { bubbles: true }));
  });
  check(mode.value === value && node("from").style.left === "95px" && node("to").style.left === "295px", `existing arrow changes to ${value} without moving endpoints`);
}
await drag(node("to"), 300, 180, 300, 380);
check(getComputedStyle(node("to")).cursor === "nwse-resize", "endpoint resize cursor follows changed arrow angle");
if (!query.has("preview")) {
  await act(async () => document.querySelector(`[aria-label="${t.arrowStyle}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
  check(!document.querySelector(".screenshot-node"), "Delete still removes the selected arrow while its style dropdown has focus");
}
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
if (query.has("preview")) {
  if (query.get("preview") === "shape") await click(t.toolShape);
  document.getElementById("results")!.style.display = "none";
  const failure = document.querySelector<HTMLElement>(".screenshot-failure");
  if (failure) failure.style.display = "none";
}
