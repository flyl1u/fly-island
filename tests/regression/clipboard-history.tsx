import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/i18n";
import { ClipboardHistoryPanel } from "../../src/features/clipboard/ClipboardHistoryPanel";
import { DEFAULT_CLIPBOARD_HISTORY } from "../../src/features/clipboard/settings";
import type { ClipboardHistoryItem } from "../../src/features/clipboard/api";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 128;
const context = canvas.getContext("2d")!;
const noise = context.createImageData(128, 128);
let seed = 42;
for (let i = 0; i < noise.data.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  noise.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
}
context.putImageData(noise, 0, 0);
const thumbnailDataUrl = canvas.toDataURL();
export const clipboardItems: ClipboardHistoryItem[] = Array.from({ length: 500 }, (_, i) => ({
  id: `item-${i}`, hash: `hash-${i}`, kind: "image", preview: `Image ${i}`, createdAt: 0, copiedAt: 0,
  favorite: i % 2 === 0,
  image: { width: 1920, height: 1080, byteSize: 10000, originalPath: "", thumbnailPath: "", thumbnailDataUrl },
}));
const root = createRoot(document.getElementById("fixture")!);
const messages: string[] = [];
const check = (ok: boolean, label: string) => { messages.push(`${ok ? "PASS" : "FAIL"} ${label}`); };
const wait = () => new Promise((resolve) => requestAnimationFrame(resolve));
const noop = () => {};
async function run() {
  const started = performance.now();
  await act(async () => root.render(<I18nProvider><ClipboardHistoryPanel
    snapshot={{ ...DEFAULT_CLIPBOARD_HISTORY, items: clipboardItems }} onCopyItem={() => true}
    onToggleFavorite={noop} onUpdateNote={() => true} onDeleteItem={noop} onClear={noop}
  /></I18nProvider>));
  check(document.querySelectorAll(".clipboard-item").length === 20, "500 images mount only the first 20 rows");
  messages.push(`Mount: ${(performance.now() - started).toFixed(1)}ms; thumbnail JSON payload: ${JSON.stringify(clipboardItems).length} bytes`);
  const list = document.querySelector<HTMLElement>(".clipboard-list")!;
  await act(async () => {
    list.scrollTop = list.scrollHeight;
    await wait();
    await wait();
  });
  check(document.querySelectorAll(".clipboard-item").length === 40, "Scrolling appends a batch");
  const search = document.querySelector<HTMLInputElement>(".clipboard-search input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "Image 499");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(document.querySelectorAll(".clipboard-item").length === 1 && list.textContent?.includes("499") === true,
    "Search finds entries beyond the mounted batch");
  document.getElementById("results")!.textContent = messages.join("\n");
  document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
}
void run();
