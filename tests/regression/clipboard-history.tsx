import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act, useState } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
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
  // Thumbnails come from read_clipboard_history_thumbnail, not the snapshot.
  image: { width: 1920, height: 1080, byteSize: 10000, originalPath: "", thumbnailPath: "" },
}));
const root = createRoot(document.getElementById("fixture")!);
const messages: string[] = [];
const check = (ok: boolean, label: string) => { messages.push(`${ok ? "PASS" : "FAIL"} ${label}`); };
const wait = () => new Promise((resolve) => requestAnimationFrame(resolve));
let copyCount = 0;
let failDelete = false;
const deleted: string[][] = [];
let resolveImage: ((value: string) => void) | undefined;
let thumbnailReads = 0;
mockIPC((command) => {
  if (command === "read_clipboard_history_image") return new Promise<string>((resolve) => { resolveImage = resolve; });
  if (command === "read_clipboard_history_thumbnail") { thumbnailReads++; return thumbnailDataUrl; }
  return null;
});
function Harness() {
  const [items, setItems] = useState(clipboardItems);
  return <ClipboardHistoryPanel snapshot={{ ...DEFAULT_CLIPBOARD_HISTORY, items }}
    onCopyItem={() => { copyCount++; return true; }} onToggleFavorite={() => {}}
    onUpdateNote={() => true} onDeleteItem={() => {}}
    onDeleteItems={(ids) => {
      if (failDelete) return false;
      deleted.push(ids);
      setItems((old) => old.filter((item) => !ids.includes(item.id)));
      return true;
    }} />;
}
const click = async (selector: string) => { await act(async () => document.querySelector<HTMLButtonElement>(selector)!.click()); };
const searchFor = async (value: string) => {
  await act(async () => {
    const search = document.querySelector<HTMLInputElement>(".clipboard-search input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, value);
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const escape = async () => { await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); };
async function run() {
  const started = performance.now();
  await act(async () => root.render(<I18nProvider><Harness /></I18nProvider>));
  check(document.querySelectorAll(".clipboard-item").length === 20, "500 images mount only the first 20 rows");
  await act(async () => { await wait(); await wait(); });
  check(thumbnailReads === 20 && document.querySelectorAll(".clipboard-item__thumb img").length === 20,
    "Only the mounted rows read their thumbnails");
  messages.push(`Mount: ${(performance.now() - started).toFixed(1)}ms; snapshot JSON: ${JSON.stringify(clipboardItems).length} bytes`);
  const list = document.querySelector<HTMLElement>(".clipboard-list")!;
  await act(async () => {
    list.scrollTop = list.scrollHeight;
    await wait();
    await wait();
  });
  check(document.querySelectorAll(".clipboard-item").length === 40, "Scrolling appends a batch");
  await searchFor("Image 499");
  check(document.querySelectorAll(".clipboard-item").length === 1 && list.textContent?.includes("499") === true,
    "Search finds entries beyond the mounted batch");
  let escapedToWindow = 0;
  window.addEventListener("keydown", () => { escapedToWindow++; });
  await click(".clipboard-clear-button");
  check(document.querySelectorAll(".clipboard-item--selecting").length === 1, "Trash enters selection mode");
  await click(".clipboard-item__main");
  check(copyCount === 0 && document.querySelector("[role=checkbox]")?.getAttribute("aria-checked") === "true", "Clicking a row selects without copying");
  await click(".clipboard-item__thumb");
  check(!!document.querySelector("[role=dialog]") && !!document.querySelector(".clipboard-item--selected"), "Thumbnail previews without changing selection");
  check(document.querySelector(".clipboard-preview__image")?.getAttribute("aria-busy") === "true", "Thumbnail is displayed while the original loads");
  await act(async () => { resolveImage?.(thumbnailDataUrl); });
  check(document.querySelector(".clipboard-preview__image")?.getAttribute("aria-busy") === "false", "The original replaces the placeholder");
  await escape();
  check(!document.querySelector("[role=dialog]") && !!document.querySelector(".clipboard-item--selecting") && escapedToWindow === 0, "Escape closes preview first without collapsing the island");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3100)); });
  check(!!document.querySelector(".clipboard-item--selected"), "Selection has no three-second timeout");
  await escape();
  check(!document.querySelector(".clipboard-item--selecting") && escapedToWindow === 0, "Escape exits selection without collapsing the island");
  await click(".clipboard-item__main");
  check(copyCount === 1, "Row copying resumes after leaving selection");
  await searchFor("");
  await click(".clipboard-clear-button");
  await click(".clipboard-segments button:nth-child(2)");
  await click(".clipboard-select-all");
  check(document.querySelector(".clipboard-clear-button--confirming")?.textContent === "250", "Select all includes all 250 filtered favorites beyond the batch");
  await searchFor("Image 498");
  await click(".clipboard-select-all");
  check(document.querySelector(".clipboard-clear-button--confirming")?.textContent === "249", "Deselect all changes only the current search results");
  await click(".clipboard-clear-button--confirming");
  check(deleted[0]?.length === 249 && deleted[0].every((id) => Number(id.split("-")[1]) % 2 === 0) && !deleted[0].includes("item-498"), "One batch explicitly deletes selected favorites");
  check(!document.querySelector(".clipboard-item--selecting"), "Successful deletion leaves selection mode");
  await click(".clipboard-clear-button");
  await click(".clipboard-item__main");
  failDelete = true;
  await click(".clipboard-clear-button--confirming");
  check(!!document.querySelector("[role=alert]") && !!document.querySelector(".clipboard-item--selected"), "Failed deletion preserves selection and shows an error");
  await escape();
  document.getElementById("results")!.textContent = messages.join("\n");
  document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
}
void run().catch((error: unknown) => {
  document.getElementById("results")!.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  document.documentElement.dataset.testResult = "failed";
});
