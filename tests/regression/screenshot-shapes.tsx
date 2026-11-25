import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import { ScreenshotWindow } from "../../src/windows/screenshot/ScreenshotWindow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// Keep annotation pixel samples independent of the computer running this baseline fixture.
Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem("fly-island-locale", lang);
const t = TRANSLATIONS[lang].screenshot;
mockWindows("screenshot");
let exported = "";
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "screenshot_window_rect") return [0, 0, innerWidth, innerHeight];
  if (command === "screenshot_raw") {
    const frame = new ArrayBuffer(8 + innerWidth * innerHeight * 4);
    new DataView(frame).setUint32(0, innerWidth, true); new DataView(frame).setUint32(4, innerHeight, true);
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
await act(async () => { await emit("screenshot-arm"); await new Promise((resolve) => setTimeout(resolve, 50)); });
await drag(document.querySelector(".screenshot-overlay")!, 40, 40, 940, 560);
await click(t.toolShape);
const canvas = document.querySelector<HTMLCanvasElement>(".screenshot-canvas")!;
const pixel = (x: number, y: number) => [...canvas.getContext("2d")!.getImageData(x, y, 1, 1).data];
const fill = () => document.querySelector<HTMLInputElement>(`[aria-label="${t.fillShape}"]`)!;
const node = (key: string) => document.querySelector<HTMLElement>(`.screenshot-node[data-node="${key}"]`)!;
const bounds = () => [node("nw").style.left, node("nw").style.top, node("se").style.left, node("se").style.top].join(" ");
await drag(canvas, 100, 100, 280, 220);
await drag(canvas, 100, 160, 100, 160);
check(document.querySelectorAll(".screenshot-node").length === 8, "click existing rectangle in shape tool exposes eight handles");
check(pixel(140, 110)[3] === 0 && !fill().checked, "existing outline starts unfilled");
await act(async () => fill().click());
check(pixel(140, 110)[3] === 255, "fill checkbox paints the existing rectangle interior");
await act(async () => fill().click());
check(pixel(140, 110)[3] === 0, "uncheck restores the same rectangle to outline");
const beforeWheel = bounds();
await act(async () => canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 })));
check(document.querySelector<HTMLInputElement>(`[aria-label="${t.lineWidthLabel}"]`)?.value === "4" && bounds() === beforeWheel, "plain wheel changes selected line width and keeps geometry");
await drag(node("se"), 280, 220, 320, 240);
check(node("se").style.left === "315px" && node("se").style.top === "235px", "corner handle resizes existing rectangle");
await drag(node("e"), 320, 170, 350, 190);
check(node("se").style.left === "345px" && node("se").style.top === "235px", "edge handle adjusts width independently");
await drag(canvas, 100, 170, 120, 185);
check(node("nw").style.left === "115px" && node("nw").style.top === "110px", "drag existing outline moves annotation rather than screenshot region");
await click("#4D96FF"); await click(t.dashDashed);
await click(t.shapeEllipse);
check(bounds() === "115px 110px 365px 250px", "shape conversion keeps selected geometry");
await act(async () => fill().click());
check(pixel(180, 140).join(",") === "77,150,255,255", "converted ellipse preserves edited color and supports fill");
await act(async () => fill().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Delete" })));
check(document.querySelectorAll(".screenshot-node").length === 0 && pixel(180, 140)[3] === 0, "Del deletes selected shape even after using fill checkbox");
if (fill().checked) await act(async () => fill().click());
await drag(canvas, 430, 140, 590, 300);
await drag(canvas, 430, 220, 430, 220);
check(document.querySelectorAll(".screenshot-node").length === 8 && pixel(470, 180)[3] === 0, "existing ellipse can be reselected without switching tools");
await act(async () => fill().click());
check(pixel(470, 180)[3] === 255, "existing ellipse becomes a solid color block");
await click(t.copyAndClose);
const image = new Image(); image.src = `data:image/png;base64,${exported}`;
await image.decode();
const copyCanvas = document.createElement("canvas"); copyCanvas.width = image.width; copyCanvas.height = image.height;
const context = copyCanvas.getContext("2d")!; context.drawImage(image, 0, 0);
check([...context.getImageData(470, 180, 1, 1).data].join(",") === pixel(470, 180).join(","), "export contains filled annotation, not selection handles");
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
