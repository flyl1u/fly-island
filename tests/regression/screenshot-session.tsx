import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import { ScreenshotWindow } from "../../src/windows/screenshot/ScreenshotWindow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// This fixture uses one source pixel per CSS pixel; the scaling matrix emulates native DPR separately.
Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
localStorage.setItem("fly-island-locale", "zh-CN");
const t = TRANSLATIONS["zh-CN"].screenshot;
mockWindows("screenshot");
let dismissed = 0;
let recognition: Record<string, unknown> | null = null;
mockIPC((command, payload) => {
  switch (command) {
    case "screenshot_ready": return new URLSearchParams(location.search).has("cold");
    case "screenshot_window_rect": return [-1920, 0, innerWidth, innerHeight];
    case "screenshot_raw": {
      const frame = new ArrayBuffer(8 + innerWidth * innerHeight * 4);
      new DataView(frame).setUint32(0, innerWidth, true);
      new DataView(frame).setUint32(4, innerHeight, true);
      new Uint8Array(frame, 8).fill(220);
      return frame;
    }
    case "screenshot_windows": return [];
    case "screenshot_fonts": return ["Segoe UI"];
    case "screenshot_dismiss": dismissed++; return null;
    case "screenshot_copy_png": return Promise.reject("clipboard busy");
    case "screenshot_pin_image": recognition = payload as Record<string, unknown>; return "pinned-image-ocr-test";
    case "plugin:path|resolve_directory": return "C:/Downloads";
    default: return null;
  }
}, { shouldMockEvents: true });
HTMLElement.prototype.setPointerCapture = () => {};
const messages: string[] = [];
const check = (ok: unknown, label: string) => messages.push(`${ok ? "PASS" : "FAIL"} ${label}`);
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<I18nProvider><ScreenshotWindow /></I18nProvider>));
await act(async () => { if (!new URLSearchParams(location.search).has("cold")) await emit("screenshot-arm"); await new Promise((resolve) => setTimeout(resolve, 50)); });
const overlay = document.querySelector<HTMLElement>(".screenshot-overlay")!;
await act(async () => overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 80, clientY: 80, pointerId: 1 })));
await act(async () => overlay.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 600, clientY: 360, pointerId: 1 })));
await act(async () => overlay.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 600, clientY: 360, pointerId: 1 })));
check(!!document.querySelector(".screenshot-selection"), "creates selection");
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.getAttribute("aria-label") === label)!;
await act(async () => button(t.copyAndClose).click());
check(document.querySelector(".screenshot-failure")?.textContent?.includes("clipboard busy") && dismissed === 0, "clipboard errors keep screenshot editable and display the cause");
await act(async () => { button(t.save).click(); await new Promise((resolve) => setTimeout(resolve, 100)); });
check(!!document.querySelector(".screenshot-save-dialog"), "opens save dialog");
const sizeInputs = document.querySelectorAll<HTMLInputElement>(".screenshot-save-size input");
const originalWidth = Number(sizeInputs[0].value), originalHeight = Number(sizeInputs[1].value);
const preview = document.querySelector<HTMLElement>(".screenshot-save-preview")!;
const image = preview.querySelector<HTMLImageElement>("img")!;
const imageWidth = image.getBoundingClientRect().width;
await act(async () => preview.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true })));
check(Number(sizeInputs[0].value) < originalWidth && Number(sizeInputs[1].value) < originalHeight && image.getBoundingClientRect().width < imageWidth,
  "wheel over preview reduces export dimensions and visible preview together");
await act(async () => button(t.resetSize).click());
const scale = document.querySelector<HTMLInputElement>(`[aria-label="${t.imageScaleLabel}"]`)!;
await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(scale, "50");
  scale.dispatchEvent(new Event("input", { bubbles: true }));
});
check(Number(sizeInputs[0].value) === Math.round(originalWidth / 2) && Number(sizeInputs[1].value) === Math.round(originalHeight / 2), "percentage slider updates exact export dimensions");
await act(async () => sizeInputs[0].dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true })));
check(Number(sizeInputs[0].value) > Math.round(originalWidth / 2), "wheel over numeric size controls adjusts both dimensions proportionally");
await act(async () => document.querySelector(".screenshot-save-name input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true })));
check(!document.querySelector(`[aria-label="${t.toolMosaic}"].screenshot-tool-active`), "typing a filename does not change annotation tools");
await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
check(!document.querySelector(".screenshot-save-dialog") && dismissed === 0, "Escape closes only the save dialog");
await act(async () => button(t.pin).dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
check(document.querySelector('[role="tooltip"]')?.textContent?.includes(t.pinHint), "hovering the pin icon shows its name and usage");
await act(async () => button(t.toolMosaic).click());
check(!document.querySelector(".screenshot-colors") && document.querySelector(`[aria-label="${t.grainLabel}"]`), "mosaic offers grain size without an irrelevant color palette");
await act(async () => { button(t.recognize).click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
check(recognition !== null && Reflect.get(recognition, "recognition") === true && !Reflect.get(recognition, "translation"), "recognition opens an independent OCR comparison instead of a plain inline result");
check(dismissed === 1 && !!document.querySelector(".screenshot-selection"), "close hides native overlay before resetting the last displayed frame");
await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
check(dismissed === 2, "single Escape dismisses the screenshot session");
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
