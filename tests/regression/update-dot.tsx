import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/windows/island/IslandApp.css";
import "../../src/features/todos/TodoListItem.css";
import { act, StrictMode, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { I18nProvider } from "../../src/i18n";
import type { IslandPage } from "../../src/windows/island/types";
import type { PageButtonStyle, PageDot } from "../../src/features/appearance/types";
import type { UpdateState } from "../../src/features/updater/updaterController";
import { syncUpdateTodo } from "../../src/features/todos/updateTodo";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
const en = query.get("lang") === "en";
const keys = ["fly-island-locale"];
const original = keys.map((key) => localStorage.getItem(key));
localStorage.setItem(keys[0], en ? "en" : "zh-CN");
window.addEventListener("beforeunload", () => keys.forEach((key, index) => {
  if (original[index] === null) localStorage.removeItem(key); else localStorage.setItem(key, original[index]!);
}));
let installs = 0;
mockIPC(() => null, { shouldMockEvents: true });
// Tauri's event mock omits emitTo; handle that one command while keeping the real listen/emit mock.
const internals = (window as unknown as { __TAURI_INTERNALS__: {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
} }).__TAURI_INTERNALS__;
const invoke = internals.invoke;
internals.invoke = (command, args) => {
  if (command === "plugin:event|emit_to") {
    if ((args?.payload as { action?: string })?.action === "install") installs++;
    return Promise.resolve(null);
  }
  return invoke(command, args);
};
// This fixture uses the settings-window mirror to feed real updater state via its public event.
const { getUpdateState, subscribeToUpdate } = await import("../../src/features/updater/updaterController");
const { IslandHeader } = await import("../../src/windows/island/IslandHeader");
const { UpdateTodoAction } = await import("../../src/features/todos/UpdateTodoAction");
let setPage: (page: IslandPage) => void;
let setExpanded: (expanded: boolean) => void;
let setStyle: (style: PageButtonStyle) => void;
let snapshot: UpdateState = { stage: "available", version: "3.0.9", nextVersion: "3.0.10", downloaded: 0,
  total: 100, detail: "", dismissed: false, autoUpdate: true, target: "stable" };
async function update(patch: Partial<UpdateState>) {
  snapshot = { ...snapshot, ...patch };
  await act(async () => { await emit("fly-island-update-state", snapshot); });
}
function Fixture() {
  const [page, changePage] = useState<IslandPage>("todo");
  const [expanded, changeExpanded] = useState(false);
  const [style, changeStyle] = useState<PageButtonStyle>("icon");
  const [order, changeOrder] = useState<PageDot[]>(["todo", "music", "clipboard", "shelf", "translation"]);
  setPage = changePage;
  setExpanded = changeExpanded;
  setStyle = changeStyle;
  const state = useSyncExternalStore(subscribeToUpdate, getUpdateState);
  const visibleTodo = syncUpdateTodo([], { ...state, hasVersion: state.nextVersion !== "" }, "Update").length > 0;
  return <>
    <IslandHeader isExpanded={expanded} page={page} features={{ todo: true, music: true, clipboard: true, shelf: true,
      pluginPages: [], agents: true, translation: true, qq: true, wechat: true, qqMail: true }} pageOrder={order}
      pageButtonStyle={style} onPageOrderChange={changeOrder} showTitle={false} isDetached={false} agentVisualState="idle"
      agentStatusLabel="Agent" qqNotificationCount={2} wechatPending={false} officePending={null} onPageChange={changePage} onCollapse={() => changeExpanded(false)}
      onOpenSettings={() => {}} onOpenMessages={() => changePage("qq")} onOpenTranslator={() => changePage("translation")} onResetPosition={() => {}}
      minimizesToTray={false} onMinimize={() => {}} />
    {page === "todo" && visibleTodo && <div className="todo-item"><span /><span>检测到新版本</span><UpdateTodoAction /></div>}
  </>;
}
const fixture = document.getElementById("fixture")!;
const root = createRoot(fixture);
const results = document.getElementById("results")!;
const passed: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed.push(`PASS ${message}`);
};
const dot = () => document.querySelector<HTMLElement>(".island-update-dot");
const action = () => document.querySelector<HTMLButtonElement>(".todo-start--update")!;
async function checkPageButtonLabels() {
  const row = () => fixture.querySelector<HTMLElement>(".editor-dots")!;
  const buttons = () => [...row().querySelectorAll<HTMLButtonElement>("[data-page-button]")];
  const labels = () => [...row().querySelectorAll<HTMLElement>(".page-button-content__label")];
  const visible = () => labels().filter((label) => label.getBoundingClientRect().width > 0.5
    && Number(getComputedStyle(label).opacity) > 0.01);
  const visiblePages = () => visible().map((label) => label.closest<HTMLElement>("[data-page-button]")!.dataset.pageButton).join(",");
  const actions = () => fixture.querySelector<HTMLElement>(".window-actions")!.getBoundingClientRect();
  const fits = () => {
    const right = row().getBoundingClientRect().right;
    return buttons().every((button) => button.getBoundingClientRect().right <= right + 0.5) && right <= actions().left;
  };
  const settleLabels = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
  };
  const resize = async (width: number) => {
    fixture.style.width = `${width}px`;
    await settleLabels();
  };

  fixture.style.setProperty("--island-font-scale", "1.25");
  await resize(800);
  await act(async () => setStyle("iconLabel"));
  await settleLabels();
  check(row().dataset.pageLabelMode === "all" && visiblePages() === "agents,todo,music,clipboard,shelf,translation,qq"
    && visible().every((label) => label.getBoundingClientRect().left >= label.previousElementSibling!.getBoundingClientRect().right
      && label.getBoundingClientRect().width >= label.querySelector(".page-button-content__text")!.getBoundingClientRect().width - 0.5)
    && visible()[0].textContent === "AI Agent" && visible()[1].textContent === (en ? "Todo" : "待办") && fits(),
    "Wide icon-label buttons show all localized names next to their icons");
  check(dot()?.closest("button")?.getAttribute("aria-label")?.includes(en ? "update available" : "有新版本")
    && fixture.querySelector(".dot-button--messages .island-message-button__dot"),
    "Icon-label buttons keep the localized update announcement and the message dot");

  await resize(400);
  check(row().dataset.pageLabelMode === "current" && visiblePages() === "music" && fits(),
    "A narrower header shows only the current page name and fits beside window actions");
  const actionsLeft = actions().left;
  const clipboard = row().querySelector<HTMLButtonElement>(".dot-button--clipboard")!;
  await act(async () => { clipboard.focus(); clipboard.click(); });
  await settleLabels();
  check(visiblePages() === "clipboard" && fits() && actions().left === actionsLeft && document.activeElement === clipboard
    && clipboard.getAttribute("aria-current") === "page",
    "Switching pages moves the visible name and keeps focus and window actions in place");

  const shelf = row().querySelector<HTMLButtonElement>(".dot-button--shelf")!;
  const target = clipboard.getBoundingClientRect();
  const source = shelf.getBoundingClientRect();
  const midpoint = target.left + target.width / 2;
  const fire = (type: string, x: number) => shelf.dispatchEvent(new PointerEvent(type, {
    bubbles: true, button: 0, pointerId: 9, clientX: x, clientY: source.top + source.height / 2,
  }));
  await act(async () => { fire("pointerdown", source.left + source.width / 2); });
  await act(async () => { fire("pointermove", midpoint - 1); });
  await act(async () => { fire("pointermove", midpoint - 2); });
  await act(async () => { fire("pointerup", midpoint - 2); shelf.click(); });
  await settleLabels();
  check(shelf.nextElementSibling === clipboard && visiblePages() === "clipboard" && fits(),
    "Dragging a narrow icon across a longer name reorders once and keeps the current page");

  await act(async () => row().querySelector<HTMLButtonElement>(".dot-button--messages")!.click());
  await settleLabels();
  check(visiblePages() === "qq" && fits(), "The message entry can be the current labeled page");

  await resize(244);
  check(row().dataset.pageLabelMode === "icons" && visible().length === 0 && fits()
    && buttons().every((button) => button.querySelector("svg") && button.getAttribute("aria-label") && button.dataset.tip),
    "The narrowest header fits all the icons and keeps their accessible names and tooltips");
  await resize(800);
  check(row().dataset.pageLabelMode === "all" && visible().length === 7 && fits(),
    "Widening the header restores all page names");

  fixture.style.removeProperty("width");
  fixture.style.removeProperty("--island-font-scale");
  await settleLabels();
}

try {
  await act(async () => root.render(<StrictMode><I18nProvider><Fixture /></I18nProvider></StrictMode>));
  await update({});
  check(dot(), "A pending update shows the header red dot");
  await act(async () => { setPage("music"); setExpanded(true); });
  for (const style of ["icon", "capsule"] as const) {
    await act(async () => setStyle(style));
    const badge = dot()!;
    const css = getComputedStyle(badge);
    const button = badge.closest("button")!;
    const box = badge.getBoundingClientRect();
    const parent = button.getBoundingClientRect();
    check(button.offsetWidth === 24 && button.offsetHeight === 34 && css.width === "6px" && css.height === "6px"
      && css.backgroundColor === "rgb(255, 69, 58)" && css.boxShadow === "none" && css.borderWidth === "0px"
      && css.animationName === "none" && box.right <= parent.right + 1 && box.top >= parent.top
      && badge.getAttribute("aria-hidden") === "true" && button.getAttribute("aria-label")?.includes(en ? "update available" : "有新版本"),
      `${style}: solid red decorative dot, no ring/glow/pulse, same button size and localized announcement`);
  }
  await checkPageButtonLabels();
  await act(async () => document.querySelector<HTMLButtonElement>(".dot-button--todo")!.click());
  check(dot() && document.querySelector(".todo-update-dot"),
    "Opening Todo keeps the header dot and the row dot until the update is installed");
  const badgeCss = getComputedStyle(document.querySelector(".todo-update-dot")!);
  check(badgeCss.width === "5px" && badgeCss.height === "5px" && badgeCss.boxShadow === "none" && badgeCss.borderWidth === "0px"
    && action().getAttribute("aria-label")?.includes(en ? "Update available" : "有新版本"), "Clickable update action has a 5px dot and announcement");
  await act(async () => setPage("music"));
  check(dot(), "The header dot stays on other pages while the update is pending");
  await update({ nextVersion: "3.0.11", stage: "downloading" });
  check(dot(), "A later version shows the page hint while downloading");
  await update({ dismissed: true });
  check(dot(), "Dismissed update keeps the header dot: automatic install still comes");
  await update({ dismissed: false });
  await act(async () => setPage("todo"));
  check(action().disabled && !document.querySelector(".todo-update-dot"), "Downloading update action has no dot");
  await update({ stage: "ready" });
  check(!action().disabled && document.querySelector(".todo-update-dot"), "Downloaded update is clickable with its dot again");
  await act(async () => action().click());
  check(installs === 1, "Click sends the existing install request");
  await update({ stage: "installing" });
  check(!document.querySelector(".todo-update-dot"), "Entering installation removes the action dot");
  await act(async () => setPage("music"));
  await act(async () => root.unmount());
  const nextRoot = createRoot(document.getElementById("fixture")!);
  await act(async () => nextRoot.render(<StrictMode><I18nProvider><Fixture /></I18nProvider></StrictMode>));
  await update({ stage: "available", nextVersion: "3.0.11" });
  check(dot(), "Remount still shows the pending update dot");
  await act(async () => setPage("todo"));
  await update({ stage: "error", nextVersion: "3.0.11", detail: "network" });
  check(dot() && action().textContent?.includes(en ? "failed" : "失败"),
    "A failed install keeps both dots and says it failed");
  results.dataset.result = "passed";
  results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed";
  results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
}
