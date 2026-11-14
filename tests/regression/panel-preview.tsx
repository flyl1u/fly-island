// Real navigation, preview, idle, message reveal and game hooks; IPC events stand in for Windows.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import "../../src/styles/tokens.css";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import { ISLAND_HOVER_CHANGED_EVENT, FOREGROUND_FULLSCREEN_CHANGED_EVENT } from "../../src/windows/island/api";
import { useIslandNavigation } from "../../src/windows/island/useIslandNavigation";
import { useIslandTucking } from "../../src/windows/island/useIslandTucking";
import { useGameMode } from "../../src/windows/island/useGameMode";
import { usePanelPreview } from "../../src/windows/island/usePanelPreview";
import { PANEL_PREVIEW_STORAGE_KEY, requestPanelPreview, type PanelPreviewMode } from "../../src/windows/settings/storage";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
mockIPC((command) => command === "get_foreground_fullscreen" ? { active: false, onIslandMonitor: false } : null, { shouldMockEvents: true });
let navigation!: ReturnType<typeof useIslandNavigation>;
let setIdle: (value: boolean) => void;
let setMessage: (value: boolean) => void;
function Harness() {
  const nav = useIslandNavigation();
  const [idle, changeIdle] = useState(false);
  const [message, changeMessage] = useState(false);
  navigation = nav;
  setIdle = changeIdle;
  setMessage = changeMessage;
  const settings = { ...DEFAULT_SETTINGS, autoTuck: idle, autoCollapseSeconds: 0, tuckDelaySeconds: 3, gameAutoTuck: true };
  const game = useGameMode(settings, nav);
  useIslandTucking({ settings, navigation: nav, hasMessagePreview: message,
    activity: { agentVisualState: "idle", collapsedItem: null, songPlaying: false, activeTodoId: null, timer: null },
    gameHolds: game.quiet || game.tuck });
  usePanelPreview({ navigation: nav, quiet: game.quiet, hasMessagePreview: message });
  return <div className="island">{nav.mode}/{String(nav.isTucked)}/{String(nav.isPreviewing)}</div>;
}

const saved = localStorage.getItem(PANEL_PREVIEW_STORAGE_KEY);
const restore = () => {
  if (saved === null) localStorage.removeItem(PANEL_PREVIEW_STORAGE_KEY);
  else localStorage.setItem(PANEL_PREVIEW_STORAGE_KEY, saved);
};
window.addEventListener("beforeunload", restore);
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw Error(message);
  messages.push(`PASS ${message}`);
};
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const request = (mode: PanelPreviewMode) => act(async () => {
  requestPanelPreview(mode);
  // The separate settings window's write delivers this event to the island.
  window.dispatchEvent(new StorageEvent("storage", { key: PANEL_PREVIEW_STORAGE_KEY, newValue: localStorage.getItem(PANEL_PREVIEW_STORAGE_KEY) }));
});
const fullscreen = (active: boolean) => act(async () => { await emit(FOREGROUND_FULLSCREEN_CHANGED_EVENT, { active, onIslandMonitor: active }); });
const hover = (inside: boolean) => act(async () => { await emit(ISLAND_HOVER_CHANGED_EVENT, inside); });
const state = () => `${navigation.mode}/${navigation.isTucked ? "tucked" : "out"}`;

try {
  await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
  await wait(50);
  await request("expanded");
  check(state() === "expanded/out" && navigation.isPreviewing, "Expanded preview opens immediately");
  await wait(1000);
  await request("tucked");
  check(state() === "collapsed/tucked", "Changing preview mode tucks immediately");
  await wait(1800);
  check(navigation.isPreviewing && navigation.isTucked, "A new request extends the timeout");
  await request("collapsed");
  check(state() === "collapsed/out", "Collapsed preview reveals a tucked island");
  await wait(2700);
  check(state() === "collapsed/out" && !navigation.isPreviewing, "Repeated mixed previews restore the first state");

  await act(async () => navigation.openIslandPage("music"));
  await request("tucked");
  await wait(2700);
  check(state() === "expanded/out" && navigation.page === "music", "Tucked preview restores an open panel and its page");
  await act(async () => navigation.minimizeToEdge());
  await request("collapsed");
  await wait(2700);
  check(state() === "collapsed/tucked" && navigation.retractsAfterPeek && navigation.peekRetractDelayMs === null,
    "A minimized island restores its tucked and peek behavior");

  await request("collapsed");
  await hover(true);
  await wait(2700);
  check(state() === "collapsed/out" && !navigation.isPreviewing, "Hovering hands control to normal behavior");
  await hover(false);
  await request("tucked");
  await act(async () => {
    document.querySelector(".island")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    navigation.openIslandPage("music");
  });
  await wait(2700);
  check(state() === "expanded/out" && navigation.page === "music", "A click during preview keeps the user's new navigation");

  await fullscreen(true);
  await request("expanded");
  check(state() === "collapsed/tucked" && !navigation.isPreviewing, "Game quiet blocks preview opening");
  await fullscreen(false);
  await request("expanded");
  await fullscreen(true);
  await wait(2700);
  check(state() === "collapsed/tucked" && !navigation.isPreviewing, "Game quiet starting mid-preview cancels its restoration");
  await fullscreen(false);

  await act(async () => navigation.openIslandPage("todo"));
  await request("tucked");
  await act(async () => setMessage(true));
  await wait(2700);
  check(state() === "collapsed/out" && !navigation.isPreviewing, "A real message takes over without preview restoration");
  await act(async () => setMessage(false));
  await wait(650);
  check(state() === "collapsed/tucked", "After the message ends normal retraction still works");

  await act(async () => { navigation.revealIsland(); setIdle(true); });
  await wait(1500);
  await request("expanded");
  await wait(2700);
  await wait(1800);
  check(state() === "collapsed/out", "Preview pauses idle and its completion restarts the full delay");
  await wait(1500);
  check(state() === "collapsed/tucked", "Normal auto tuck resumes after a complete fresh delay");
  results.textContent = `${messages.join("\n")}\nALL PASS`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
} finally {
  await act(async () => root.unmount());
  restore();
}
