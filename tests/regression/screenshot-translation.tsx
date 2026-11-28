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
const fixture = document.createElement("canvas"); fixture.width = 480; fixture.height = 240;
const paint = fixture.getContext("2d")!;
paint.fillStyle = "#fff"; paint.fillRect(0, 0, 480, 240);
paint.fillStyle = "#222"; paint.font = "24px sans-serif";
paint.fillText("Hello", 60, 50); paint.fillText("error", 60, 90);
const originalSrc = fixture.toDataURL();
(Reflect.get(window, "__TAURI_INTERNALS__") as { convertFileSrc: (path: string) => string }).convertFileSrc = () => originalSrc;
const calls: Record<string, unknown>[] = [];
const translated = "你好。这是按原文、译文顺序显示的自然段落，不会盖住图片或下一段文字。\n" +
  "A long translated sentence should wrap naturally and stay fully readable. ".repeat(4) + "LongUnbrokenWord".repeat(12);
let copied = "";
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "screenshot_pinned_src": return "C:/test/shot.png";
    case "screenshot_pin_ocr_lines": return [["Hello", 60, 30, 150, 25], ["error", 60, 70, 150, 25]];
    case "translate_text":
      calls.push(args);
      if (args.text === "error") return Promise.reject("provider rate limit");
      return translated;
    case "screenshot_copy_text": copied = String(args.text); return null;
    default: return null;
  }
}, { shouldMockEvents: true });
const messages: string[] = [];
const check = (ok: unknown, label: string) => messages.push((ok ? "PASS " : "FAIL ") + label);
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); }); };
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<StrictMode><I18nProvider><ScreenshotTranslationWindow /></I18nProvider></StrictMode>));
await settle();
check(calls.length === 2, "StrictMode sends one translation per OCR line");
check(calls.every((call) => call.provider === "custom" && call.baseUrl === "http://localhost:1234/v1" && call.model === "local-model" && call.direction === "en-zh"), "uses Fly Island service/model/direction");
check(document.body.textContent?.includes("provider rate limit"), "partial errors remain visible");
const clearImage = () => document.querySelector<HTMLImageElement>(".shot-translation-picture img")?.src === originalSrc && !document.querySelector(".shot-translation-image-line");
check(clearImage() && document.querySelectorAll(".shot-translation-image-tools button").length === 1, "image remains the untouched original without translated overlays");
const flowing = () => {
  const articles = [...document.querySelectorAll<HTMLElement>(".shot-translation-pairs article")];
  return articles.length === 2 && articles.every((article, index) => {
    const source = article.querySelector("textarea")!, output = article.querySelector("p")!;
    const sr = source.getBoundingClientRect(), tr = output.getBoundingClientRect(), ar = article.getBoundingClientRect();
    return source.scrollHeight <= source.clientHeight + 1 && source.scrollWidth <= source.clientWidth + 1 &&
      output.scrollWidth <= output.clientWidth + 1 && getComputedStyle(output).fontSize === "16px" &&
      sr.bottom <= tr.top && tr.bottom <= ar.bottom && (!index || ar.top >= articles[index - 1].getBoundingClientRect().bottom);
  });
};
check(flowing(), "normal-size bilingual pairs wrap long paragraphs and tokens without covering later rows");
const buttons = [...document.querySelectorAll<HTMLButtonElement>(".shot-translation-controls button")];
await act(async () => buttons[1].click());
check(copied === translated, "copies only successful translations as plain text");
await act(async () => buttons[2].click());
check(copied === "Hello\n" + translated + "\n\nerror", "bilingual copy keeps original and translation together with natural newlines");
const view = document.querySelectorAll<HTMLSelectElement>(".shot-translation-controls select")[1];
const switchView = async (value: string) => { await act(async () => { view.value = value; view.dispatchEvent(new Event("change", { bubbles: true })); }); await settle(); };
await switchView("text");
check(!document.querySelector(".shot-translation-image-panel") && flowing(), "bilingual-only mode expands and reflows ordinary text");
await switchView("image");
check(!document.querySelector(".shot-translation-text") && clearImage(), "image-only mode shows just the original");
await switchView("both");
const field = document.querySelector<HTMLTextAreaElement>(".shot-translation-pairs textarea")!;
const longSource = "This edited source sentence should grow with its wrapped content. 中文原文也要完整显示。 ".repeat(8);
await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, longSource);
  field.dispatchEvent(new Event("input", { bubbles: true }));
});
await settle();
check(field.clientHeight > 60 && flowing(), "editing long source text grows the row and keeps the next pair below it");
await act(async () => buttons[0].click());
await settle();
check(calls.length === 4 && calls[2].text === longSource && flowing(), "retranslation uses edited natural lines and preserves readable pairing");
const picture = document.querySelector<HTMLElement>(".shot-translation-picture")!, before = picture.style.width;
let cancelled = false;
await act(async () => { cancelled = !document.querySelector(".shot-translation-image-scroll")!.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })); });
check(cancelled && picture.style.width !== before && flowing() && clearImage(), "image zoom does not change reading size or restore image overlays");
const controls = [...document.querySelectorAll<HTMLElement>(".shot-translation-title button, .shot-translation-controls button, .shot-translation-controls select, .shot-translation-image-tools button")];
check(controls.every((node) => { const rect = node.getBoundingClientRect(); return rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight; }), "all controls remain reachable at this viewport and DPI");
check(document.documentElement.dataset.theme === (query.get("theme") ?? "dark"), "follows island theme");
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((message) => message.startsWith("FAIL")) ? "failed" : "passed";
if (query.has("preview")) document.getElementById("results")!.style.display = "none";
