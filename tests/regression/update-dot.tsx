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
import type { PageButtonStyle } from "../../src/features/appearance/types";
import type { UpdateState } from "../../src/features/updater/updaterController";
import { syncUpdateTodo } from "../../src/features/todos/updateTodo";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
const en = query.get("lang") === "en";
const keys = ["focusd-island-update-dot-seen", "focusd-island-locale"];
const original = keys.map((key) => localStorage.getItem(key));
localStorage.removeItem(keys[0]);
localStorage.setItem(keys[1], en ? "en" : "zh-CN");
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
  total: 100, detail: "", dismissed: false };
async function update(patch: Partial<UpdateState>) {
  snapshot = { ...snapshot, ...patch };
  await act(async () => { await emit("focusd-update-state", snapshot); });
}
function Fixture() {
  const [page, changePage] = useState<IslandPage>("todo");
  const [expanded, changeExpanded] = useState(false);
  const [style, changeStyle] = useState<PageButtonStyle>("icon");
  setPage = changePage;
  setExpanded = changeExpanded;
  setStyle = changeStyle;
  const state = useSyncExternalStore(subscribeToUpdate, getUpdateState);
  const visibleTodo = syncUpdateTodo([], state, "Update").length > 0;
  return <>
    <IslandHeader isExpanded={expanded} page={page} features={{ todo: true, music: true, clipboard: true, shelf: true,
      agents: true, translation: true, qq: true, wechat: true, qqMail: true }} pageOrder={["todo", "music", "clipboard", "shelf", "translation"]}
      pageButtonStyle={style} onPageOrderChange={() => {}} showTitle={false} isDetached={false} agentVisualState="idle"
      agentStatusLabel="Agent" qqNotificationCount={0} wechatPending={false} onPageChange={changePage} onCollapse={() => changeExpanded(false)}
      onOpenSettings={() => {}} onOpenMessages={() => {}} onOpenTranslator={() => {}} onResetPosition={() => {}}
      minimizesToTray={false} onMinimize={() => {}} />
    {page === "todo" && visibleTodo && <div className="todo-item"><span /><span>检测到新版本</span><UpdateTodoAction /></div>}
  </>;
}
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const passed: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed.push(`PASS ${message}`);
};
const dot = () => document.querySelector<HTMLElement>(".island-update-dot");
const action = () => document.querySelector<HTMLButtonElement>(".todo-start--update")!;
try {
  await act(async () => root.render(<StrictMode><I18nProvider><Fixture /></I18nProvider></StrictMode>));
  await update({});
  check(dot() && !localStorage.getItem(keys[0]), "A collapsed header whose remembered page is Todo does not mark the update seen");
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
  await act(async () => document.querySelector<HTMLButtonElement>(".dot-button--todo")!.click());
  check(!dot() && localStorage.getItem(keys[0]) === "3.0.10" && document.querySelector(".todo-update-dot"),
    "Opening Todo records this version and removes only the page hint");
  const badgeCss = getComputedStyle(document.querySelector(".todo-update-dot")!);
  check(badgeCss.width === "5px" && badgeCss.height === "5px" && badgeCss.boxShadow === "none" && badgeCss.borderWidth === "0px"
    && action().getAttribute("aria-label")?.includes(en ? "Update available" : "有新版本"), "Clickable update action has a 5px dot and announcement");
  await act(async () => setPage("music"));
  check(!dot(), "Revisiting another page does not bring the same version's dot back");
  await update({ nextVersion: "3.0.11", stage: "downloading" });
  check(dot(), "A later version shows the page hint while downloading");
  await update({ dismissed: true });
  check(!dot(), "Dismissed update has no page hint");
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
  check(!dot(), "Remount preserves the viewed version");
  results.dataset.result = "passed";
  results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed";
  results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
}
