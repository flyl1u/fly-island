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
function Harness({ initialItems = clipboardItems, hoverPreview = false }: {
  initialItems?: ClipboardHistoryItem[];
  hoverPreview?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  return <ClipboardHistoryPanel snapshot={{ ...DEFAULT_CLIPBOARD_HISTORY, items }} hoverPreview={hoverPreview}
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
const move = (selector: string, type: "pointerover" | "pointerout") => act(async () => {
  document.querySelector(selector)!.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
});
const waitMs = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
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
  await click(".clipboard-segments button:nth-child(1)");
  await click(".clipboard-select-all");
  check(document.querySelector(".clipboard-clear-button--confirming")?.textContent === "250", "Select all takes the 250 non-favorite entries beyond the batch");
  await searchFor("Image 498");
  await click(".clipboard-select-all");
  check(document.querySelector(".clipboard-clear-button--confirming")?.textContent === "250", "Select all on a favorites-only search adds nothing");
  await searchFor("Image 499");
  await click(".clipboard-select-all");
  check(document.querySelector(".clipboard-clear-button--confirming")?.textContent === "249", "Deselect all changes only the current search results");
  await click(".clipboard-clear-button--confirming");
  check(deleted[0]?.length === 249 && deleted[0].every((id) => Number(id.split("-")[1]) % 2 === 1) && !deleted[0].includes("item-499") && !deleted[0].includes("item-498"), "One batch deletes the selected non-favorites only");
  check(!document.querySelector(".clipboard-item--selecting"), "Successful deletion leaves selection mode");
  const activeTab = () => document.querySelector(".clipboard-segments .clipboard-segment--active")?.textContent;
  await click(".clipboard-segments button:nth-child(4)");
  check(document.querySelectorAll(".clipboard-segment--active").length === 1 && activeTab() === "图片", "A type tab takes the underline");
  await click(".clipboard-segments button:nth-child(1)");
  check(activeTab() === "全部", "全部 takes the underline back");
  await click(".clipboard-clear-button");
  await click(".clipboard-item__main");
  failDelete = true;
  await click(".clipboard-clear-button--confirming");
  check(!!document.querySelector("[role=alert]") && !!document.querySelector(".clipboard-item--selected"), "Failed deletion preserves selection and shows an error");
  await escape();

  const filePaths = [String.raw`C:\Demo\full-path-one.txt`, String.raw`D:\Demo\full-path-two.txt`];
  const text = Array.from({ length: 40 }, (_, row) => `完整的剪贴板正文，第 ${row + 1} 行`).join("\n");
  const [image] = clipboardItems;
  const items: ClipboardHistoryItem[] = [
    { id: "full-text", kind: "text", hash: "full", preview: "正文摘要", text, createdAt: 1, copiedAt: 3 },
    { id: "paths", kind: "text", hash: "paths", preview: "第一个路径", files: filePaths, createdAt: 1, copiedAt: 2 },
    image,
  ];
  await act(async () => root.render(<I18nProvider><Harness key="preview" initialItems={items} hoverPreview /></I18nProvider>));
  const full = '[data-clipboard-id="full-text"] .clipboard-item__content';
  const popover = () => document.querySelector<HTMLElement>(".clipboard-hover-preview");
  await move(full, "pointerover");
  await move(full, "pointerout");
  await waitMs(400);
  check(!popover(), "Passing over a row does not open a preview");
  await move(full, "pointerover");
  await waitMs(400);
  check(popover()?.textContent === text && popover()!.scrollHeight > popover()!.clientHeight, "Hover shows all text with its line breaks and a scrollable viewport");
  await move(full, "pointerout");
  await move(".clipboard-hover-preview", "pointerover");
  await waitMs(200);
  check(Boolean(popover()), "Moving into the preview keeps it open for reading");
  await escape();
  check(!popover() && escapedToWindow === 0, "Escape dismisses the hover preview without collapsing the island");
  await move('[data-clipboard-id="paths"] .clipboard-item__content', "pointerover");
  await waitMs(400);
  check(popover()?.textContent === filePaths.join("\n"), "All file paths are shown");
  await move('[data-clipboard-id="item-0"] .clipboard-item__content', "pointerover");
  await waitMs(400);
  check(Boolean(popover()?.querySelector("img")) && popover()!.textContent!.includes("1920"), "Image hover shows the thumbnail and original dimensions while loading");
  await act(async () => { resolveImage?.("data:image/png;base64,original"); });
  check(popover()?.querySelector("img")?.getAttribute("src") === "data:image/png;base64,original", "Hover replaces the thumbnail with the original");
  await click(".clipboard-item__main");
  check(!popover() && copyCount === 2, "Click-to-copy still works while hover previews are enabled");
  document.getElementById("results")!.textContent = messages.join("\n");
  document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
}
void run().catch((error: unknown) => {
  document.getElementById("results")!.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  document.documentElement.dataset.testResult = "failed";
});
