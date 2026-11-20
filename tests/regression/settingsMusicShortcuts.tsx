import { act } from "react";
import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { useMusicShortcutRegistration } from "../../src/features/media/useMusicShortcuts";
import { mediaShortcutCalls } from "./settingsMocks";

/** A second root stands in for the main webview, which registers keys before Settings opens. */
function Registration({ enabled }: { enabled: boolean }) { useMusicShortcutRegistration(enabled); return null; }

export async function checkMusicShortcuts(check: (value: unknown, message: string) => void, openPage: (category: string) => Promise<void>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (enabled: boolean) => act(async () => root.render(<Registration enabled={enabled} />));
  const stored = () => JSON.parse(localStorage.getItem("fly-island-music-shortcuts") ?? "{}") as Record<string, string>;
  const lastCall = () => mediaShortcutCalls[mediaShortcutCalls.length - 1];
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>(".editor-panel .shortcut-record-button")];
  const record = async (index: number, key: string, mods: KeyboardEventInit = { ctrlKey: true, altKey: true }) => {
    await act(async () => buttons()[index].click());
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, ...mods, bubbles: true })));
  };
  try {
    await render(true);
    check(lastCall()?.enabled && Object.values(lastCall()!.shortcuts).every((key) => !key), "Music: main startup sends empty default shortcuts without opening Settings");
    await openPage("music");
    check(buttons().length === 3 && buttons().every((button) => button.textContent === "未设置"), "Music: play/pause, previous and next default to unassigned");
    await record(0, "Y");
    check(document.querySelector(".shortcut-control__error")?.textContent?.includes("Agent 审批") && !stored().playPause, "Music: reserved approval keys are refused before saving");
    await record(0, "P");
    check(stored().playPause === "Ctrl+Alt+P" && lastCall()?.shortcuts.playPause === "Ctrl+Alt+P", "Music: recording immediately saves and registers through the main window");
    await record(1, "P");
    check(document.querySelectorAll(".shortcut-control__error")[0]?.textContent?.includes("播放 / 暂停"), "Music: another music action cannot take the same keys");
    await record(1, "V", { ctrlKey: true, shiftKey: true });
    check(document.querySelector(".shortcut-control__error")?.textContent?.includes("展开快捷键"), "Music: clipboard keys are refused");
    await openPage("translation");
    await record(0, "P");
    check(document.querySelector(".shortcut-control__error")?.textContent?.includes("播放 / 暂停"), "Translation: music keys are refused in the reverse direction");
    await openPage("clipboard");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    await record(0, "P");
    check(document.querySelector(".shortcut-control__error")?.textContent?.includes("播放 / 暂停"), "Clipboard: music keys are refused in the reverse direction");
    await openPage("music");
    await act(async () => emit("media-shortcut-status", { playPause: "Already registered by another app" }));
    check(document.querySelector(".shortcut-control__error")?.textContent?.includes("没能设为全局快捷键"), "Music: native registration failures show the existing translated error style");
    await act(async () => document.querySelector<HTMLButtonElement>(".editor-panel .shortcut-reset-button:not([disabled])")!.click());
    check(stored().playPause === "" && lastCall()?.shortcuts.playPause === "", "Music: clearing releases the keys immediately");
    await render(false);
    check(lastCall()?.enabled === false, "Music: disabling the module releases all keys");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}
