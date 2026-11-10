// pnpm dev, then open /tests/regression/file-shelf.html. Renders the file shelf page with the native
// icon and preview commands mocked. ?n=0|1|3|12 shows that many files (long names, mixed types,
// a pinned, a missing and an unreachable one), &drop=1 with files dragged over it, &lang=en in
// English; without ?n it runs the checks: tiles up to four files and rows past that, names that
// keep their extension, Explorer icons and previews, actions on hover, pinning, the drop zone and
// the empty tray.
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import type { FileShelfItem } from "../../src/features/file-shelf/api";
import type { FileShelfController } from "../../src/features/file-shelf/useFileShelf";
import { FileShelfPanel } from "../../src/features/file-shelf/FileShelfPanel";

const query = new URLSearchParams(location.search);
const viewCount = query.has("n") ? Number(query.get("n")) : null;
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: viewCount === null });
localStorage.setItem(LOCALE_STORAGE_KEY, query.get("lang") === "en" ? "en" : "zh-CN");

// Stand-ins for what Windows returns: an app icon, a folder icon, and two photo previews.
const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${body}</svg>`)}`;
const APP_ICON = svg(`<rect x="5" y="5" width="38" height="38" rx="9" fill="#3a7bd5"/><path d="M15 24h18M24 15v18" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`);
const FOLDER_ICON = svg(`<path d="M4 13a4 4 0 0 1 4-4h11l4 4h17a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#f2b83b"/><path d="M4 19h40v17a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#ffd36b"/>`);
const PHOTO = svg(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7b267"/><stop offset="1" stop-color="#7d5ba6"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/><circle cx="33" cy="15" r="6" fill="#ffe8b0"/><path d="M0 40l14-14 10 10 8-6 16 14v4H0z" fill="#3b2f5c"/>`);
const PHOTO_2 = svg(`<rect width="48" height="48" fill="#2f6f73"/><path d="M0 34c8-6 16-6 24 0s16 6 24 0v14H0z" fill="#9fd8cb"/><circle cx="14" cy="14" r="5" fill="#f4f1de"/>`);
const SYSTEM_ICONS: Record<string, string> = { app: APP_ICON, folder: FOLDER_ICON, music: APP_ICON.replace("%233a7bd5", "%23d55a8a") };
const PREVIEWS: Record<string, string> = { photo: PHOTO, shot: PHOTO_2 };
const iconRequests: Array<{ id: string; available: boolean }> = [];
mockIPC((command, payload) => {
  const args = payload as { id: string; available?: boolean };
  if (command === "get_file_shelf_icon") {
    iconRequests.push({ id: args.id, available: Boolean(args.available) });
    return SYSTEM_ICONS[args.id] ?? null;
  }
  if (command === "get_file_shelf_thumbnail") return PREVIEWS[args.id] ?? null;
  return null;
});

const entry = (id: string, name: string, extra: Partial<FileShelfItem> = {}): FileShelfItem => ({
  id, name, path: `D:\\Shelf\\${name}`, isDir: false, size: 1_468_006, addedAt: 0, pinned: false, missing: false, unreachable: false, ...extra,
});
const ALL = [
  entry("pdf", "2026 第三季度经营分析报告（终版）.pdf", { pinned: true }),
  entry("photo", "IMG_20261108_183522.jpg", { size: 3_912_004 }),
  entry("folder", "项目资料", { isDir: true, size: 0 }),
  entry("app", "FocuSD-Island-Setup-3.0.0.exe", { size: 9_813_000 }),
  entry("long", "一个名字特别特别长的文件用来看看会不会把面板撑宽或者挤掉右边的按钮.docx", { size: 48_200 }),
  entry("sheet", "预算.xlsx", { size: 23_100 }),
  entry("shot", "截图 2026-11-10 093012.png", { size: 812_330 }),
  entry("zip", "assets-export.zip", { size: 120_400_000 }),
  entry("music", "晴天.flac", { size: 31_000_000 }),
  entry("gone", "旧合同.pdf", { missing: true }),
  entry("away", "共享盘的会议纪要.docx", { unreachable: true, path: "\\\\nas\\team\\会议纪要.docx" }),
  entry("code", "main.rs", { size: 4_100 }),
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
// The page's height in the island (getShelfExpandedHeight) less the island's own chrome.
const fixtureHeight = (count: number) => (count === 0 ? 184 : count <= 4 ? 210 : 26 + 30 + 10 + 10 + 16 + Math.min(5, Math.ceil(count / 2)) * 50 - 6);

async function render(items: FileShelfItem[], isDropTarget = false) {
  fixture.style.height = `${fixtureHeight(items.length)}px`;
  await act(async () => {
    root.render(<StrictMode><I18nProvider><FileShelfPanel shelf={controller(items)} isDropTarget={isDropTarget} revealOnDoubleClick={false} /></I18nProvider></StrictMode>);
    await new Promise((resolve) => setTimeout(resolve, 260));
  });
}

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}

const item = (id: string) => document.querySelector<HTMLElement>(`[data-shelf-id="${id}"]`)!;
const icon = (id: string) => item(id).querySelector<HTMLElement>(".shelf-item__icon")!;
const meta = (id: string) => item(id).querySelector(".shelf-item__meta")!.textContent;
const actions = (id: string) => item(id).querySelector<HTMLElement>(".shelf-item__actions")!;
const inside = (inner: Element, outer: Element) => {
  const a = inner.getBoundingClientRect();
  const b = outer.getBoundingClientRect();
  return a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
};

if (viewCount !== null) {
  await render(ALL.slice(0, viewCount), query.has("drop"));
  results.remove();
} else {
  try {
    // Three files: one row of tiles and an open slot.
    await render([ALL[0], ALL[1], ALL[2]]);
    const tiles = [...document.querySelectorAll<HTMLElement>(".shelf-item--tile")];
    check(tiles.length === 3 && document.querySelector(".shelf-slot") && tiles.every((tile) => Math.abs(tile.getBoundingClientRect().top - tiles[0].getBoundingClientRect().top) < 1),
      "三个文件是一排图块，后面留一个“还能再放”的空位");
    check(icon("photo").classList.contains("shelf-item__icon--thumbnail") && icon("photo").querySelector("img"), "图片显示缩略图");
    check(icon("folder").classList.contains("shelf-item__icon--system") && icon("folder").querySelector("img"), "Windows 给出图标时显示资源管理器里的图标");
    check(!icon("pdf").querySelector("img") && icon("pdf").classList.contains("shelf-item__icon--document"), "没有系统图标时显示按类型着色的图标");
    check(item("pdf").querySelector(".shelf-item__extension")?.textContent === ".pdf" && meta("pdf") === "1.4 MB" && meta("folder") === "文件夹",
      "扩展名跟在名字后面，下面一行是大小，文件夹写“文件夹”");
    check(item("pdf").querySelector(".shelf-item__pin-badge") && !item("photo").querySelector(".shelf-item__pin-badge"), "置顶的文件图标角上有小图钉");
    check(getComputedStyle(actions("photo")).opacity === "0", "没指向的图块不显示操作按钮");
    check(!document.querySelector(".shelf-search"), "文件少时不显示搜索框");

    // Twelve files: two columns of rows; long names keep the extension and stay in their row.
    await render(ALL);
    const rows = [...document.querySelectorAll<HTMLElement>(".shelf-item--row")];
    const lefts = new Set(rows.map((row) => Math.round(row.getBoundingClientRect().left)));
    check(rows.length === 12 && lefts.size === 2 && !document.querySelector(".shelf-slot"), "五个以上的文件排成两列紧凑的行");
    const stem = item("long").querySelector<HTMLElement>(".shelf-item__stem")!;
    const extension = item("long").querySelector<HTMLElement>(".shelf-item__extension")!;
    const list = document.querySelector<HTMLElement>(".shelf-list")!;
    check(stem.textContent!.includes("…") && stem.textContent!.startsWith("一个") && stem.textContent!.endsWith("按钮") && stem.scrollWidth <= stem.clientWidth + 1 && extension.textContent === ".docx" && inside(extension, item("long")) && list.scrollWidth <= list.clientWidth,
      "长文件名在中间省略，扩展名仍然看得见，不撑宽面板");
    check(meta("gone") === "已失效" && meta("away") === "无法访问" && getComputedStyle(item("gone").querySelector(".shelf-item__stem")!).textDecorationLine === "line-through",
      "已失效的划掉名字，无法访问的只标出状态");
    check(iconRequests.some((request) => request.id === "gone" && !request.available) && iconRequests.some((request) => request.id === "pdf" && request.available),
      "已失效的条目只按类型取图标，不去读文件");
    check(document.querySelector(".shelf-search") && getComputedStyle(actions("long")).display === "none", "文件多时出现搜索框，行上的按钮平时不占地方");
    check(item("app").querySelector<HTMLElement>(".shelf-item__main")!.title === "D:\\Shelf\\FocuSD-Island-Setup-3.0.0.exe", "指向时显示完整路径");

    // Files dragged over: the shelf steps back under one drop zone.
    await render(ALL.slice(0, 3), true);
    const overlay = document.querySelector<HTMLElement>(".shelf-drop-overlay");
    check(overlay && document.querySelector(".shelf-panel--dropping") && overlay.textContent === "松开鼠标，加入文件中转", "拖入时列表退后，盖上投放区");

    // Empty: the tray, what it is for, and that only the location is kept.
    await render([]);
    check(document.querySelector(".shelf-empty__title")?.textContent === "把文件拖到岛上，就会暂存在这里"
      && document.querySelector(".shelf-empty__note")?.textContent?.includes("不复制文件") && !document.querySelector(".shelf-panel__footer"), "空的时候是一个托盘，说明只记位置、不复制文件");
    await render([], true);
    check(document.querySelector(".shelf-empty--dropping") && document.querySelector(".shelf-empty__title")?.textContent === "松开鼠标，加入文件中转", "空的时候拖入，整个托盘变成投放区");
    await render(ALL.slice(0, 3));

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  }
}
