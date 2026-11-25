import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import { ScreenshotWindow } from "../../src/windows/screenshot/ScreenshotWindow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem("fly-island-locale", lang);
const t = TRANSLATIONS[lang].screenshot;
mockWindows("screenshot");
let exported = "", dismissed = 0, captures = 0;
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "screenshot_window_rect") return [0, 0, innerWidth, innerHeight];
  if (command === "screenshot_raw") {
    captures++;
    const frame = new ArrayBuffer(8 + innerWidth * innerHeight * 4);
    new DataView(frame).setUint32(0, innerWidth, true); new DataView(frame).setUint32(4, innerHeight, true);
    const data = new Uint8Array(frame, 8);
    for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 242; data[i + 3] = 255; }
    return frame;
  }
  if (command === "screenshot_windows") return [[40, 40, 640, 390], [700, 70, 1100, 500]];
  if (command === "screenshot_fonts") return ["Segoe UI", "Consolas", "Arial"];
  if (command === "screenshot_dismiss") { dismissed++; return null; }
  if (command === "screenshot_copy_png") { exported = String(args.pngBase64); return Promise.reject("keep open for inspection"); }
  return null;
}, { shouldMockEvents: true });
HTMLElement.prototype.setPointerCapture = () => {};
const messages: string[] = [];
const check = (ok: unknown, label: string) => messages.push(`${ok ? "PASS" : "FAIL"} ${label}`);
const wait = () => new Promise((resolve) => setTimeout(resolve, 80));
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const pointer = async (target: Element, type: string, x = 100, y = 100) => {
  await act(async () => target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 })));
};
const pressButton = async (label: string) => {
  const target = button(label);
  await pointer(target, "pointerdown");
  await act(async () => target.click());
};
const key = async (target: EventTarget, value: string, ctrlKey = false) => {
  await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key: value, ctrlKey, bubbles: true })));
};
const setValue = async (target: HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    const prototype = target instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(target, value);
    target.dispatchEvent(new Event(target instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<I18nProvider><ScreenshotWindow /></I18nProvider>));
for (let cycle = 0; cycle < 5; cycle++) {
  await act(async () => { await emit("screenshot-arm"); await wait(); });
  const overlay = document.querySelector(".screenshot-overlay")!;
  await pointer(overlay, "pointermove", 100, 100);
  check(document.querySelectorAll(".screenshot-hover").length === 1 && !document.querySelector(".screenshot-selection"), `cycle ${cycle}: one candidate before confirmation`);
  await pointer(overlay, "pointerdown", 750, 100); await pointer(overlay, "pointerup", 750, 100);
  const selection = document.querySelector<HTMLElement>(".screenshot-selection")!;
  check(selection.style.left === "700px" && selection.style.width === "400px" && !document.querySelector(".screenshot-hover"), `cycle ${cycle}: clicked candidate is the only confirmed border`);
  await key(window, "a", true);
  check(document.querySelector(".screenshot-selection-fullscreen") && !document.querySelector(".screenshot-hover, .screenshot-dim"), `cycle ${cycle}: full-screen selection has no leftover candidate or internal dimming`);
  const pixel = document.querySelector<HTMLCanvasElement>(".screenshot-backdrop")!.getContext("2d")!.getImageData(50, 50, 1, 1).data;
  check(pixel[0] === 242 && pixel[3] === 255, `cycle ${cycle}: original source pixels unchanged`);
  if (cycle < 4) await key(window, "Escape");
}
check(captures === 5 && dismissed === 4, "repeat sessions request a new raw frame each time");
await pressButton(t.toolText);
await pointer(document.querySelector(".screenshot-canvas")!, "pointerdown", 120, 120);
const input = document.querySelector<HTMLTextAreaElement>(".screenshot-text-input")!;
const text = "Fly Island 字体测试";
await setValue(input, text);
input.focus(); input.setSelectionRange(0, text.length);
await act(async () => input.dispatchEvent(new Event("select", { bubbles: true })));
const font = document.querySelector<HTMLSelectElement>(`[aria-label="${t.fontFamilyLabel}"]`)!;
await pointer(font, "pointerdown"); font.focus();
check(document.querySelector(".screenshot-text-input") === input && input.value === text, "opening font dropdown does not commit or remove selected text");
await setValue(font, "Consolas"); await act(async () => { await wait(); });
check(document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === text.length
  && getComputedStyle(input).fontFamily === "Consolas", "font choice applies and restores full text selection");
for (const [label, property, expected] of [[t.formatBold, "font-weight", "700"], [t.formatItalic, "font-style", "italic"],
  [t.formatUnderline, "text-decoration-line", "underline"], [t.formatStrike, "text-decoration-line", "line-through"]]) {
  await pressButton(label);
  check(input.selectionStart === 0 && input.selectionEnd === text.length
    && getComputedStyle(input).getPropertyValue(property).includes(expected), `${label}: selection preserved and format applied`);
}
const size = document.querySelector<HTMLInputElement>(`[aria-label="${t.fontSizeLabel}"]`)!;
await pointer(size, "pointerdown"); size.focus();
await setValue(size, "36"); await act(async () => { await wait(); });
check(document.activeElement === size && getComputedStyle(input).fontSize === "36px", "size field keeps focus while editing and applies to active text");
await key(size, "Enter"); await act(async () => { await wait(); });
check(document.activeElement === input && input.selectionEnd === text.length, "Enter in size field returns to the saved text selection");
await pressButton("#4D96FF");
check(getComputedStyle(input).color === "rgb(77, 150, 255)" && input.selectionEnd === text.length, "color changes retain the editing selection");
await pressButton(t.copyAndClose);
const image = new Image(); image.src = `data:image/png;base64,${exported}`; await image.decode();
const output = document.createElement("canvas"); output.width = image.width; output.height = image.height;
const context = output.getContext("2d")!; context.drawImage(image, 0, 0);
const pixels = context.getImageData(110, 110, 600, 100).data;
let bluePixels = 0;
for (let index = 0; index < pixels.length; index += 4) if (pixels[index + 2] > pixels[index] + 50) bluePixels++;
check(bluePixels > 100, "copy includes active text with the chosen font/format/color before committing");
await pressButton(t.toolMove);
check(!document.querySelector(".screenshot-text-input"), "changing tools commits the formatted text");
await pointer(document.querySelector(".screenshot-canvas")!, "pointerdown", 135, 135);
await pointer(document.querySelector(".screenshot-canvas")!, "pointerup", 135, 135);
check(document.querySelector<HTMLSelectElement>(`[aria-label="${t.fontFamilyLabel}"]`)?.value === "Consolas", "committed text retains the chosen font when selected again");
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
