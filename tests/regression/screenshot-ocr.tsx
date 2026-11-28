import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import { ScreenshotOcrWindow } from "../../src/windows/screenshot-ocr/ScreenshotOcrWindow";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search), lang = query.get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem("fly-island-locale", lang);
localStorage.setItem("fly-island-settings", JSON.stringify({ colorScheme: query.get("theme") ?? "dark" }));
const t = TRANSLATIONS[lang].screenshot;
mockWindows("pinned-image-ocr-test");
const fixture = document.createElement("canvas"); fixture.width = query.has("dense") ? 2200 : 720; fixture.height = 1000;
const paint = fixture.getContext("2d")!; paint.fillStyle = "#fff"; paint.fillRect(0, 0, fixture.width, 1000);
paint.fillStyle = "#111"; paint.font = "40px sans-serif"; paint.fillText("Quarterly report", 40, 70);
paint.font = "20px sans-serif"; paint.fillText("Left column", 60, 150); paint.fillText("Right column", 400, 150);
paint.fillText("Bottom paragraph", 60, 830);
(Reflect.get(window, "__TAURI_INTERNALS__") as { convertFileSrc: (path: string) => string }).convertFileSrc = () => fixture.toDataURL();
let recognized = 0, revealed = 0, destroyed = 0, copied = "", formattedCopies = 0;
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "screenshot_pinned_src") return "C:/test/document.png";
  if (command === "screenshot_pin_ocr_lines") { recognized++; return [["Quarterly report", 40, 30, 400, 48], ["Left column", 60, 125, 220, 25], ["Right column", 400, 127, 240, 25], ["Bottom paragraph", 60, 805, 400, 25]]; }
  if (command === "screenshot_pin_reveal") { revealed++; return null; }
  if (command === "screenshot_pin_destroy") { destroyed++; return null; }
  if (command === "screenshot_copy_text") { copied = String(args.text); return null; }
  if (command === "screenshot_copy_document") { formattedCopies++; return null; }
  return null;
}, { shouldMockEvents: true });
const messages: string[] = [];
const check = (ok: unknown, label: string) => messages.push((ok ? "PASS " : "FAIL ") + label);
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); }); };
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<StrictMode><I18nProvider><ScreenshotOcrWindow /></I18nProvider></StrictMode>));
await settle();
const fields = [...document.querySelectorAll<HTMLTextAreaElement>(".shot-ocr-edit-line")];
check(recognized === 1 && revealed === 1, "StrictMode performs one OCR job and reveals the image once loaded");
check(fields.length === 3 && document.querySelector(".shot-ocr-paper img"), "original image and sequential recognized lines share a comparison window");
check(fields.every((field) => getComputedStyle(field).fontSize === "16px"), "every line starts at the same normal reading size");
check(fields[1].value === "Left column Right column" && !document.querySelector(".shot-ocr-controls select"), "fragments become ordinary lines without columns or source formatting");
const markers = document.querySelectorAll<HTMLButtonElement>(".shot-ocr-source-line");
await act(async () => markers[1].click());
check(document.activeElement === fields[1] && markers[1].classList.contains("active"), "clicking original text focuses its matching editable line");
const longText = "这是一段需要自然换行的识别文字。 English text should wrap without covering the next line. ".repeat(6) + "VeryLongUnbrokenText".repeat(15);
await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(fields[1], longText);
  fields[1].dispatchEvent(new Event("input", { bubbles: true }));
});
await settle();
const readable = () => fields.every((field, index) => {
  const rect = field.getBoundingClientRect(), pane = field.parentElement!.getBoundingClientRect();
  return field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1 &&
    rect.left >= pane.left && rect.right <= pane.right + 1 &&
    (!index || rect.top >= fields[index - 1].getBoundingClientRect().bottom);
});
check(readable() && fields[1].clientHeight > 60, "long bilingual text and unbroken tokens fully wrap and push following lines down");
const controls = [...document.querySelectorAll<HTMLButtonElement>(".shot-ocr-controls button")];
await act(async () => controls[0].click());
check(copied === "Quarterly report\n" + longText + "\nBottom paragraph" && formattedCopies === 0, "copy returns edited plain text with natural newlines only");
const paper = document.querySelector<HTMLElement>(".shot-ocr-paper")!;
const beforeZoom = paper.style.transform;
let wheelCancelled = false;
await act(async () => { wheelCancelled = !document.querySelector(".shot-ocr-scroll")!.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true })); });
check(wheelCancelled && paper.style.transform !== beforeZoom && fields.every((field) => getComputedStyle(field).fontSize === "16px"), "Ctrl+wheel changes only original image zoom and suppresses browser zoom");
const fontSize = document.querySelector<HTMLInputElement>('.shot-ocr-controls input[type="number"]')!;
await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(fontSize, "20");
  fontSize.dispatchEvent(new Event("input", { bubbles: true }));
});
await settle();
check(fields.every((field) => getComputedStyle(field).fontSize === "20px") && readable(), "larger reading type reflows all edited lines without clipping or overlap");
const showOriginal = document.querySelector<HTMLInputElement>('.shot-ocr-controls input[type="checkbox"]')!;
const oldHeight = fields[1].clientHeight;
await act(async () => showOriginal.click());
await settle();
check(!document.querySelector(".shot-ocr-source-line") && !!document.querySelector(".shot-ocr-text-only") && readable() && fields[1].clientHeight <= oldHeight, "hiding the original expands text width and recalculates wrapping");
await act(async () => showOriginal.click());
await settle();
check(readable(), "restoring the original narrows and grows text without obstructing subsequent lines");
const windowControls = [...document.querySelectorAll<HTMLElement>(".shot-ocr-title button, .shot-ocr-controls button, .shot-ocr-controls input, .shot-ocr-footer button")];
check(windowControls.every((node) => { const rect = node.getBoundingClientRect(); return rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight; }), "all controls remain reachable at this viewport and DPI");
await act(async () => document.querySelector('[aria-label="' + t.close + '"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
check(destroyed === 1, "closing the result window releases its temporary image");
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
if (query.has("preview")) document.getElementById("results")!.style.display = "none";
