import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import { ScreenshotTranslationWindow } from "../../src/windows/screenshot-translation/ScreenshotTranslationWindow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
localStorage.setItem("fly-island-locale", query.get("lang") === "en" ? "en" : "zh-CN");
localStorage.setItem("fly-island-settings", JSON.stringify({ colorScheme: query.get("theme") ?? "dark" }));
localStorage.setItem("fly-island-translation-settings", JSON.stringify({ provider: "custom", direction: "en-zh", customBaseUrl: "http://localhost:1234/v1", models: { custom: "local-model" } }));
mockWindows("pinned-image-test");
const fixture = document.createElement("canvas");
fixture.width = 480; fixture.height = 240;
const paint = fixture.getContext("2d")!;
paint.fillStyle = "#fff"; paint.fillRect(0, 0, 480, 240);
paint.fillStyle = "#222"; paint.font = "24px sans-serif";
paint.fillText("Hello", 60, 50); paint.fillText("error", 60, 90);
const internals = Reflect.get(window, "__TAURI_INTERNALS__") as { convertFileSrc: (path: string) => string };
internals.convertFileSrc = () => fixture.toDataURL();
const calls: Record<string, unknown>[] = [];
let copied = "";
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "screenshot_pinned_src": return "C:/test/shot.png";
    case "screenshot_pin_ocr_lines": return [["Hello", 60, 30, 150, 25], ["error", 60, 70, 150, 25]];
    case "translate_text":
      calls.push(args);
      if (args.text === "error") return Promise.reject("provider rate limit");
      return `译文 ${args.text}`;
    case "screenshot_copy_text": copied = String(args.text); return null;
    default: return null;
  }
}, { shouldMockEvents: true });
const messages: string[] = [];
const check = (ok: unknown, label: string) => messages.push(`${ok ? "PASS" : "FAIL"} ${label}`);
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<StrictMode><I18nProvider><ScreenshotTranslationWindow /></I18nProvider></StrictMode>));
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
check(calls.length === 2, "StrictMode sends one translation per OCR line");
check(calls.every((call) => call.provider === "custom" && call.baseUrl === "http://localhost:1234/v1" && call.model === "local-model" && call.direction === "en-zh"), "uses Fly Island service/model/direction");
check(document.body.textContent?.includes("provider rate limit"), "partial errors are visible");
check(document.querySelector(".shot-translation-image-line")?.textContent === "译文 Hello", "translation overlays recognized image position");
const overlay = document.querySelector<HTMLElement>(".shot-translation-image-line")!;
check(overlay.style.left === "12.5%" && overlay.style.top === "12.5%", "overlay coordinates use the loaded image's actual dimensions");
const imageButtons = document.querySelectorAll<HTMLButtonElement>(".shot-translation-image-tools button");
await act(async () => imageButtons[1].click());
check(!document.querySelector(".shot-translation-image-line"), "Original hides translated image overlay");
await act(async () => imageButtons[0].click());
check(!!document.querySelector(".shot-translation-image-line"), "Translation restores overlay");
const view = document.querySelectorAll<HTMLSelectElement>(".shot-translation-controls select")[1];
await act(async () => { view.value = "text"; view.dispatchEvent(new Event("change", { bubbles: true })); });
check(!document.querySelector(".shot-translation-image-panel") && !!document.querySelector(".shot-translation-text"), "text-only mode");
await act(async () => { view.value = "image"; view.dispatchEvent(new Event("change", { bubbles: true })); });
check(!document.querySelector(".shot-translation-text") && !!document.querySelector(".shot-translation-image-panel"), "image-only mode");
const copy = document.querySelectorAll<HTMLButtonElement>(".shot-translation-controls button")[1];
await act(async () => copy.click());
check(copied === "译文 Hello", "copies only successful translations");
check(document.documentElement.dataset.theme === (query.get("theme") ?? "dark"), "follows island theme");
const failed = messages.some((message) => message.startsWith("FAIL"));
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = failed ? "failed" : "passed";
if (query.has("preview")) {
  await act(async () => { view.value = "both"; view.dispatchEvent(new Event("change", { bubbles: true })); });
  document.getElementById("results")!.style.display = "none";
}
