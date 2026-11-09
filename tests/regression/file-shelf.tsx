// pnpm dev, then open /tests/regression/file-shelf.html. Renders the file shelf page with the native
// icon and preview commands mocked: Explorer's icon where Windows gives one, a preview for an image,
// a type-coloured tile otherwise; the type before the size; row buttons only on hover (a pinned
// entry keeps its pin); the drop overlay; and the empty page with its note.
import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import type { FileShelfItem } from "../../src/features/file-shelf/api";
import type { FileShelfController } from "../../src/features/file-shelf/useFileShelf";
import { FileShelfPanel } from "../../src/features/file-shelf/FileShelfPanel";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const square = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="6" fill="${color}"/></svg>`)}`;
const iconRequests: Array<{ id: string; available: boolean }> = [];
mockIPC((command, payload) => {
  const args = payload as { id: string; available?: boolean };
  if (command === "get_file_shelf_icon") {
    iconRequests.push({ id: args.id, available: Boolean(args.available) });
    return args.id === "app" ? square("#3a7bd5") : null;
  }
  if (command === "get_file_shelf_thumbnail") return args.id === "photo" ? square("#f2a65a") : null;
  return null;
});

const entry = (id: string, name: string, extra: Partial<FileShelfItem> = {}): FileShelfItem => ({
  id, name, path: `D:\Shelf\${name}`, isDir: false, size: 1_468_006, addedAt: 0, pinned: false, missing: false, unreachable: false, ...extra,
});
const ITEMS = [
  entry("pdf", "季度报告.pdf", { pinned: true }),
  entry("app", "Setup.exe"),
  entry("photo", "截图.png"),
  entry("folder", "项目资料", { isDir: true, size: 0 }),
  entry("long", "一个名字特别特别长的文件用来看看会不会把面板撑宽或者挤掉右边的按钮.docx"),
  entry("gone", "旧合同.pdf", { missing: true }),
];
const noop = async () => null;
const controller = (items: FileShelfItem[]) => ({
  items, error: null, recentDrop: null, refresh: noop, addPaths: noop, startDrag: noop, isDraggingOut: () => false,
  remove: noop, togglePin: noop, clear: noop, copy: async () => true, open: noop, reveal: noop,
}) as unknown as FileShelfController;

const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
const messages: string[] = [];
const root = createRoot(fixture);

async function render(items: FileShelfItem[], isDropTarget = false) {
  await act(async () => {
    root.render(<StrictMode><I18nProvider><FileShelfPanel shelf={controller(items)} isDropTarget={isDropTarget} revealOnDoubleClick={false} /></I18nProvider></StrictMode>);
    await new Promise((resolve) => setTimeout(resolve, 260));
  });
}

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-shelf-id="${id}"]`)!;
const icon = (id: string) => row(id).querySelector<HTMLElement>(".shelf-item__icon")!;
const meta = (id: string) => row(id).querySelector(".shelf-item__meta")!.textContent;

try {
  await render(ITEMS);
  check(icon("app").classList.contains("shelf-item__icon--system") && icon("app").querySelector("img"), "Windows 给出图标时显示资源管理器里的图标");
  check(icon("photo").classList.contains("shelf-item__icon--thumbnail") && icon("photo").querySelector("img"), "图片显示缩略图");
  check(!icon("pdf").querySelector("img") && icon("pdf").classList.contains("shelf-item__icon--document") && icon("folder").classList.contains("shelf-item__icon--folder")
    && getComputedStyle(icon("pdf")).color !== getComputedStyle(icon("folder")).color, "没有系统图标时按类型显示不同颜色的图标");
  check(iconRequests.some((request) => request.id === "gone" && !request.available) && iconRequests.some((request) => request.id === "pdf" && request.available),
    "已失效的条目只按类型取图标，不去读文件");
  check(meta("pdf") === "PDF · 1.4 MB" && meta("folder") === "文件夹" && meta("gone") === "已失效", "大小前显示文件类型，文件夹和失效条目照旧");
  const actions = (id: string) => row(id).querySelector<HTMLElement>(".shelf-item__actions")!;
  check(getComputedStyle(actions("app")).opacity === "0", "没指向的条目不显示操作按钮");
  const pin = row("pdf").querySelector<HTMLElement>(".shelf-pin-button")!;
  const pdfCopy = row("pdf").querySelector<HTMLElement>(".shelf-copy-button")!;
  check(getComputedStyle(actions("pdf")).opacity === "1" && getComputedStyle(pin).opacity === "1" && getComputedStyle(pdfCopy).opacity === "0", "置顶的条目一直显示置顶按钮，其余按钮隐藏");
  const name = row("long").querySelector<HTMLElement>(".shelf-item__name")!;
  const list = document.querySelector<HTMLElement>(".shelf-list")!;
  check(name.scrollWidth > name.clientWidth && list.scrollWidth <= list.clientWidth && actions("long").getBoundingClientRect().right <= row("long").getBoundingClientRect().right,
    "长文件名单行省略，不撑宽面板，按钮仍在行内");

  await render(ITEMS, true);
  const overlay = document.querySelector<HTMLElement>(".shelf-drop-overlay");
  // The dimming is a transition, which a headless browser may not run; the class sets its end.
  check(overlay && document.querySelector(".shelf-panel")!.classList.contains("shelf-panel--dropping") && overlay.textContent === "松开鼠标，加入文件中转",
    "拖入时列表变暗，盖上投放提示");

  await render([]);
  check(document.querySelector(".shelf-empty__title")?.textContent === "把文件拖到岛上，就会暂存在这里"
    && document.querySelector(".shelf-empty__note")?.textContent?.includes("不复制文件"), "空列表说明只记位置、不复制文件");
  await render([], true);
  check(document.querySelector(".shelf-empty__title")?.textContent === "松开鼠标，加入文件中转" && !document.querySelector(".shelf-empty__note"), "空列表拖入时整块变成投放区");
  await render(ITEMS);

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
}
