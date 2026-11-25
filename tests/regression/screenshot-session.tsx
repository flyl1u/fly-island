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
mockIPC((command) => {
  switch (command) {
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
    case "plugin:path|resolve_directory": return "C:/Downloads";
    default: return null;
  }
}, { shouldMockEvents: true });
HTMLElement.prototype.setPointerCapture = () => {};
const messages: string[] = [];
const check = (ok: unknown, label: string) => messages.push(`${ok ? "PASS" : "FAIL"} ${label}`);
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<I18nProvider><ScreenshotWindow /></I18nProvider>));
await act(async () => { await emit("screenshot-arm"); await new Promise((resolve) => setTimeout(resolve, 50)); });
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
await act(async () => document.querySelector(".screenshot-save-name input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true })));
check(!document.querySelector(`[aria-label="${t.toolMosaic}"].screenshot-tool-active`), "typing a filename does not change annotation tools");
await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
check(!document.querySelector(".screenshot-save-dialog") && dismissed === 0, "Escape closes only the save dialog");
await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
check(dismissed === 1, "single Escape dismisses the screenshot session");
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
