// pnpm dev, then open /tests/regression/island-tour.html. The whole island with believable data
// behind a fake desktop, for looking at every page by eye: ?media=playing|paused|nocover|long|
// nolyrics|none picks what the player reports (?lyrics=0 turns online lyrics off), ?empty=1 empties every list, ?lang=en switches the
// interface, ?detached=1 floats the island below the top edge. With ?test=1 it opens each page and
// checks that nothing sticks out of the island's rounded shape.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { IslandApp } from "../../src/windows/island/IslandApp";
import { trackIslandTopEdge } from "../../src/windows/island/topEdge";
import { TOUR_CLIPBOARD, TOUR_LRC, TOUR_MAIL, TOUR_QQ_ITEMS, TOUR_SESSIONS, TOUR_SHELF, TOUR_TODOS, tourMediaState, type TourMedia } from "./islandTourMocks";

const query = new URLSearchParams(location.search);
const automated = query.has("test");
const empty = query.has("empty");
const media = (query.get("media") ?? "playing") as TourMedia;
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: automated });

// The tour writes the island's own keys; whatever the browser profile had comes back on leaving.
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
const restore = () => {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("focusd-island-"))) localStorage.removeItem(key);
  for (const [key, value] of original) localStorage.setItem(key, value);
};
window.addEventListener("beforeunload", restore);
for (const key of original.keys()) localStorage.removeItem(key);

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
localStorage.setItem(LOCALE_STORAGE_KEY, query.get("lang") === "en" ? "en" : "zh-CN");
localStorage.setItem("focusd-island-current-date", date);
// This tour exercises the embedded settings page even though new users get a separate window.
localStorage.setItem("focusd-island-detached-settings", "false");
localStorage.setItem("focusd-island-todos", JSON.stringify(empty ? [] : TOUR_TODOS));
localStorage.setItem("focusd-island-qq-notification-access-requested", "true");
// Lyrics are looked up online unless ?lyrics=0; the mock answers for 晴天 only.
// ?cover=1 shows the song's cover on the collapsed island; ?priority=lyrics,agent,todo reorders it,
// ?layout=music,text,mail,shelf,agents arranges it; ?scale=0.85…1.2 sets the expanded size.
localStorage.setItem("focusd-island-settings", JSON.stringify({
  ...(query.get("scale") ? { expandedScale: Number(query.get("scale")) } : {}),
  // Capsules are what this tour's geometry checks look at; the default (icons) is covered below.
  pageButtonStyle: "capsule",
  lyricsOnline: query.get("lyrics") !== "0",
  collapsedShowCover: query.get("cover") === "1",
  ...(query.get("priority") ? { collapsedPriority: query.get("priority")!.split(",") } : {}),
  ...(query.get("layout") ? { collapsedLayout: query.get("layout")!.split(",") } : {}),
}));
if (query.has("detached")) localStorage.setItem("focusd-island-position", JSON.stringify({ x: 300, y: 60 }));

let revision = 0;
let windowDrags = 0;
let interaction: Record<string, unknown> = {};
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "get_launch_at_startup": return false;
    case "get_default_todo_save_directory": return "D:\\Notes";
    case "get_clipboard_history": return empty ? { ...TOUR_CLIPBOARD, items: [] } : TOUR_CLIPBOARD;
    case "get_file_shelf": return { items: empty ? [] : TOUR_SHELF };
    case "list_agent_sessions": return empty ? [] : TOUR_SESSIONS;
    case "agent_sessions_in_front": return [];
    case "agent_approval_pending": return [];
    case "list_plugin_views": return { views: [], status: [] };
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: empty ? "idle" : "running", updatedAt: Date.now() }, updatedAt: Date.now(), statusPath: "" };
    case "get_media_state":
    case "media_play_pause":
    case "media_next":
    case "media_previous": return tourMediaState(empty ? "none" : media);
    case "get_audio_level": return { active: media !== "paused" && media !== "none" && !empty, peak: 0.4 + Math.random() * 0.4, updatedAt: Date.now() };
    case "get_lyrics": return (args.query as { title?: string } | undefined)?.title === "晴天" ? { source: "lrclib", lrc: TOUR_LRC } : null;
    case "get_foreground_fullscreen": return { active: false, onIslandMonitor: false };
    case "set_island_interaction": interaction = args; return "disabled";
    case "start_island_drag": windowDrags++; return null;
    case "get_island_top_attachment": return !query.has("detached");
    case "set_qq_notifications_enabled":
    case "get_qq_notification_state": return { revision: ++revision, enabled: true, status: "listening", items: empty ? [] : TOUR_QQ_ITEMS, error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: true, status: "listening", pending: false, lastAttentionAt: null, error: null, previewEnabled: false, previewStatus: "off", hideMinimizedTaskbar: false, messages: [] };
    case "get_qq_mail_state": return empty ? [] : TOUR_MAIL;
    case "has_translation_secret": return false;
    case "set_translation_shortcut": return args.shortcut;
    case "read_translation_clipboard": return "";
    case "updater_configured": return false;
    case "get_agent_hooks_state": return { claudeCode: "installed", codex: "installed" };
    case "get_reply_marker_state": return { installed: false, outdated: false, path: "", content: "" };
    case "plugin:window|is_visible": return true;
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("main");
// As main.tsx does: the attached / detached look follows the (mocked) native answer.
trackIslandTopEdge();

const root = createRoot(document.getElementById("root")!);
const mount = () => root.render(<StrictMode><I18nProvider><IslandApp /></I18nProvider></StrictMode>);

const results = document.getElementById("results")!;
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const settle = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const click = async (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  await act(async () => { element.click(); });
  // The island's height and radius animate for 560ms; measure once they have settled.
  await settle(700);
};

/** Elements of the open page that reach outside the island's box, or past its rounded bottom corners. */
function strays() {
  const island = document.querySelector<HTMLElement>(".island")!;
  const box = island.getBoundingClientRect();
  const radius = Number.parseFloat(getComputedStyle(island).borderBottomLeftRadius) || 0;
  // The page panel is scaled (the expanded size); the island's own box and radius are not.
  const panel = document.querySelector<HTMLElement>(".island__expanded")!;
  const scale = panel.getBoundingClientRect().width / panel.offsetWidth || 1;
  const out: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(".island__content > *, .island__content > * > *")) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const name = element.className.toString().split(" ")[0] || element.tagName;
    if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5 || rect.bottom > box.bottom + 0.5) out.push(`${name} outside`);
    // A box whose bottom corner sits inside the island's corner square must itself be rounded enough.
    const inCornerX = Math.min(rect.left - box.left, box.right - rect.right);
    const inCornerY = box.bottom - rect.bottom;
    if (inCornerX < radius && inCornerY < radius) {
      // The island's corner, |x|^n + |y|^n <= r^n with n = 2^1.6 (about 3), from the corner's centre.
      const dx = radius - inCornerX;
      const dy = radius - inCornerY;
      const own = (Number.parseFloat(getComputedStyle(element).borderBottomLeftRadius) || 0) * scale;
      // The element's own corner pulls its outermost point in by about 0.16 of its radius on each axis.
      const pull = own * 0.16;
      if ((dx - pull) ** 3 + (dy - pull) ** 3 > radius ** 3 && getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)") out.push(`${name} past the corner`);
    }
  }
  return out;
}

if (!automated) {
  mount();
  results.remove();
} else {
  try {
    await act(async () => { mount(); });
    await settle(300);
    const island = () => document.querySelector<HTMLElement>(".island")!;
    const panel = () => document.querySelector<HTMLElement>(".island__expanded")!;
    const collapsed = island().getBoundingClientRect();
    const collapsedRadius = Number.parseFloat(getComputedStyle(island()).borderBottomLeftRadius);
    check(collapsed.height === 38 && collapsedRadius >= 16 && getComputedStyle(island()).borderTopLeftRadius === "0px",
      `收起的岛贴着顶边：上边是平的，下面两个角是大圆角（${collapsed.height}px / ${collapsedRadius}px / ${getComputedStyle(island()).borderTopLeftRadius}）`);
    const bar = document.querySelector<HTMLElement>(".island__collapsed")!;
    const barItems = [...bar.querySelectorAll<HTMLElement>("button, .island__pulse")].map((item) => item.getBoundingClientRect()).filter((rect) => rect.width > 0);
    check(barItems.every((rect) => rect.left >= collapsed.left + 10 && rect.right <= collapsed.right - 10), "收起的岛上的内容离两侧圆角有距离");

    await click(".island__open-button");
    check(island().classList.contains("island--expanded"), "点击后展开");
    check(Number.parseFloat(getComputedStyle(island()).borderBottomLeftRadius) > collapsedRadius, "展开后的圆角比收起时更大");
    // The page dots can be dragged into another order, which is saved; the drag opens no page.
    const dotOrder = () => [...document.querySelectorAll<HTMLElement>(".editor-dots .dot-button[data-reorder-id]")].map((dot) => dot.dataset.reorderId);
    const pageBefore = island().className;
    const drag = async (from: string, to: string) => {
      const source = document.querySelector<HTMLElement>(from)!;
      const target = document.querySelector<HTMLElement>(to)!.getBoundingClientRect();
      const start = source.getBoundingClientRect();
      const fire = (type: string, x: number) => source.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, button: 0, clientX: x, clientY: start.top + start.height / 2 }));
      await act(async () => { fire("pointerdown", start.left + 2); });
      await act(async () => { fire("pointermove", start.left + 10); });
      await act(async () => { fire("pointermove", target.left + target.width / 2); });
      await act(async () => { fire("pointerup", target.left + target.width / 2); source.click(); });
    };
    await drag(".dot-button--todo", ".dot-button--clipboard");
    const savedOrder = JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}").pageOrder as string[] | undefined;
    check(dotOrder().join() === "music,clipboard,todo,shelf,translation" && savedOrder?.join() === "music,clipboard,todo,shelf,translation" && island().className === pageBefore,
      `拖动页面圆点可以调整顺序并保存，拖完不切页（${dotOrder().join()}）`);
    await drag(".dot-button--todo", ".dot-button--music");
    check(dotOrder()[0] === "todo", "圆点可以拖回原来的位置");
    // Translation is one of the page capsules on the left; the header's old button is gone.
    await click(".dot-button--translation");
    check(!document.querySelector(".island-translate-button")
      && document.querySelector(".dot-button--translation")?.getAttribute("aria-current") === "page"
      && document.querySelector(".island__expanded .translation-panel") !== null,
      "翻译是左侧的页面胶囊，点它打开岛内翻译页，顶栏右边不再有翻译按钮");

    // The shelf's three files make one row of tiles with an open slot, and the page is only as
    // tall as that row (getShelfExpandedHeight).
    await click(".dot-button--shelf");
    // Short capsules have a stable hit area; only the coloured shape rises and grows.
    const dots = [...document.querySelectorAll<HTMLElement>(".dot-button")];
    check(dots.every((dot) => dot.offsetWidth === 24 && dot.offsetHeight === 34 && !dot.textContent && dot.dataset.tip
      && getComputedStyle(dot, "::before").width === "18px" && getComputedStyle(dot, "::before").height === "12px"
      && getComputedStyle(dot, "::after").content.includes(dot.dataset.tip)
      && getComputedStyle(dot, "::after").transitionDelay === "0s"),
      "页面入口是短胶囊，点击区域固定，上方的页面名没有显示延迟");
    const dotBox = dots[1].getBoundingClientRect();
    await act(async () => { dots[1].focus(); });
    await settle(240);
    const dock = new DOMMatrixReadOnly(getComputedStyle(dots[1], "::before").transform);
    const tip = getComputedStyle(dots[1], "::after");
    const tipHeight = [tip.height, tip.paddingTop, tip.paddingBottom, tip.borderTopWidth, tip.borderBottomWidth]
      .reduce((sum, value) => sum + parseFloat(value), 0);
    const panelScale = panel().getBoundingClientRect().width / panel().offsetWidth;
    const tipTop = dotBox.bottom - (parseFloat(tip.bottom) + tipHeight) * panelScale;
    check(dock.a > 1.3 && dock.f < -2 && getComputedStyle(dots[1]).transform === "none"
      && dots[1].getBoundingClientRect().width === dotBox.width && tip.opacity === "1"
      && tipTop >= island().getBoundingClientRect().top,
      `键盘聚焦也会放大上浮并显示名称，命中区域不动，名称不会被屏幕顶边裁切（${dock.a}, ${dock.f}, ${tipTop.toFixed(1)}px）`);
    dots[1].blur();
    const tiles = [...document.querySelectorAll<HTMLElement>(".shelf-item")].map((tile) => tile.getBoundingClientRect());
    const list = document.querySelector<HTMLElement>(".shelf-list")!;
    check(tiles.length === 3 && tiles.every((tile) => Math.abs(tile.top - tiles[0].top) < 1) && document.querySelector(".shelf-slot")
      && panel().offsetHeight === 262 && list.scrollHeight <= list.clientHeight,
      `文件中转是一排图块，页面高度正好放下这一排（${panel().offsetHeight}px）`);

    const pages: Array<[string, string]> = [
      [".dot-button--todo", "待办"],
      [".dot-button--music", "音乐"],
      [".dot-button--clipboard", "剪贴板"],
      [".dot-button--shelf", "文件中转"],
      [".island__agent-button", "AI Agent"],
      [".dot-button--messages", "消息"],
      [".dot-button--translation", "翻译"],
      [".island-settings-button", "设置"],
    ];
    for (const [selector, name] of pages) {
      await click(selector);
      const found = strays();
      check(found.length === 0, `${name}页：内容都在岛的圆角形状里${found.length ? `（${found.join("、")}）` : ""}`);
      // Pages may reach a little into the island's 20px side padding (the Agent list does, for
      // its hover highlight), never closer than 8px to the island's edge.
      const edge = island().getBoundingClientRect();
      const tight = [...document.querySelectorAll<HTMLElement>(".island__content *")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden" &&
          (rect.left < edge.left + 8 || rect.right > edge.right - 8) && !element.closest("[aria-hidden='true']");
      });
      check(tight.length === 0, `${name}页：没有内容挤到岛的边缘${tight.length ? `（${tight[0].className}）` : ""}`);
    }
    // Settings is open last: the island's height follows the settings page shown, within its cap.
    await click(".settings-sidebar__item[data-category='todos']");
    // The page panel's own height (it is scaled, the shape around it is not), so the check holds
    // at every expanded size.
    const short = panel().offsetHeight;
    await click(".settings-sidebar__item[data-category='messages']");
    const tall = panel().offsetHeight;
    check(short >= 340 && short < tall && tall <= 560, `设置页的高度跟着打开的那一页走（待办 ${short}px，消息 ${tall}px）`);
    // Appearance → Collapsed island: three items in order, moved with the arrow keys on a handle.
    await click(".settings-sidebar__item[data-category='appearance']");
    const capsule = document.querySelector<HTMLButtonElement>('[aria-label="页面按钮"] button:first-child')!;
    check(capsule.getAttribute("aria-pressed") === "true" && document.querySelectorAll(".dot-button--capsule").length === 6, "已保存为胶囊的页面按钮保持胶囊（含消息）");
    await click('[aria-label="页面按钮"] button:last-child');
    const savedStyle = JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}").pageButtonStyle;
    check(document.querySelectorAll(".dot-button--icon svg, .island__agent-button svg.lucide-bot").length === 7 &&
      document.querySelectorAll(".agent-page-preview__dots svg").length === 5 && savedStyle === "icon", "七个入口切换为图标，外观预览和保存同步");
    await click('[aria-label="页面按钮"] button:first-child');
    const priority = () => [...document.querySelectorAll<HTMLElement>(".reorder-list__item")].map((item) => item.dataset.reorderId);
    check(priority().join() === "agent,lyrics,todo", "外观页列出收起时的显示顺序：Agent 任务、歌词、待办");
    await act(async () => {
      document.querySelector<HTMLElement>(".reorder-list__handle")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    const savedPriority = JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}").collapsedPriority as string[] | undefined;
    check(priority().join() === "lyrics,agent,todo" && savedPriority?.join() === "lyrics,agent,todo", "按方向键调整顺序并保存");
    // Appearance → On the island: the music waveform moved left of the text sits on the
    // collapsed island's left.
    const barOrder = () => [...document.querySelectorAll<HTMLElement>(".island__collapsed > *")].map((element) => element.classList[0]).join();
    for (let step = 0; step < 3; step++) {
      await act(async () => {
        document.querySelector<HTMLElement>(".collapsed-layout__slot--music")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      });
    }
    const savedLayout = JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}").collapsedLayout as string[] | undefined;
    check(savedLayout?.join() === "music,text,mail,shelf,agents" && barOrder().startsWith("music-wave-button,island__open-button"),
      `岛上的排列：音乐波形移到文字左边，收起的岛也跟着变（${barOrder()}）`);
    await click(".settings-sidebar__item[data-category='general']");
    const lockSwitch = () => [...document.querySelectorAll<HTMLElement>(".settings-row")]
      .find((row) => row.querySelector(".settings-row__title")?.textContent === "锁定小岛位置")!.querySelector<HTMLInputElement>("[role='switch']")!;
    await act(async () => { lockSwitch().click(); });
    check(interaction.positionLocked === true, "锁定位置同步到原生窗口");
    await click(".island__collapse-target");
    const dragIsland = async (ctrlKey = false) => {
      const button = document.querySelector<HTMLElement>(".island__open-button")!;
      // Synthetic pointers do not have OS capture; the real hook still handles the events.
      button.setPointerCapture = () => {};
      button.hasPointerCapture = () => false;
      await act(async () => {
        button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 9, button: 0, buttons: 1, clientX: 20, ctrlKey }));
        button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 9, button: 0, buttons: 1, clientX: 40, ctrlKey }));
        button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 9, button: 0 }));
      });
    };
    await dragIsland();
    await dragIsland(true);
    check(windowDrags === 0 && !island().classList.contains("island--detached"), "锁定后普通拖动和 Ctrl 拖动都不会移动或改变小岛的贴顶状态");
    await click(".island__open-button");
    check(island().classList.contains("island--expanded"), "锁定位置仍可点击展开小岛");
    await click(".island-settings-button");
    await click(".settings-sidebar__item[data-category='general']");
    await act(async () => { lockSwitch().click(); });
    check(interaction.positionLocked === false, "解除锁定同步到原生窗口");
    await click(".island__collapse-target");
    await dragIsland();
    check(windowDrags === 1, "解除锁定后可以再次拖动小岛");
    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  } finally {
    restore();
  }
}
