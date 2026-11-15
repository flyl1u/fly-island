import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import { MusicSourcePrioritySection } from "../../src/features/media/MusicSourcePrioritySection";
import { MusicPlayerPanel } from "../../src/features/media/MusicPlayerPanel";
import { useMediaState } from "../../src/features/media/useMediaState";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { loadMusicSourcePriority } from "../../src/features/media/storage";
import type { MediaSessionInfo, MediaState } from "../../src/features/media/api";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
localStorage.setItem("focusd-island-locale", new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN");
localStorage.removeItem("focusd-island-music-sources");
const calls: { command: string; args: Record<string, unknown> }[] = [];
const sessions: MediaSessionInfo[] = [
  { id: "audio:c:\\apps\\player.exe", label: "Desktop Player", kind: "audio", playing: true },
  { id: "audio:c:\\apps\\browser.exe", label: "Browser", kind: "audio", playing: true },
];
let muted = false;
let lyricsQueries = 0;
const state = (target: string | undefined, excluded: string[]): MediaState => {
  const source = sessions.find((source) => source.id === target && !excluded.includes(source.id))
    ?? (!target ? sessions.find((source) => !excluded.includes(source.id)) : undefined);
  return {
    ...DEFAULT_MEDIA_STATE, controlMode: source ? "audio" : "none", available: Boolean(source),
    sessions, activeSessionId: source?.id ?? null, sourceApp: source?.label ?? null,
    playbackStatus: source && !muted ? "playing" : "paused", audioMuted: muted,
  };
};
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  if (command === "get_media_state" || command === "media_play_pause") {
    if (command === "media_play_pause") muted = !muted;
    return state(args.target as string | undefined, (args.excludedSources ?? []) as string[]);
  }
  if (command === "get_media_diagnostics") return { players: [] };
  if (command === "get_audio_level") return { active: false, peak: 0, updatedAt: Date.now() };
  if (command === "get_lyrics") { lyricsQueries++; return null; }
  if (command === "plugin:event|listen") return 1;
  return null;
});

function Player() {
  const media = useMediaState(true, false);
  return <MusicPlayerPanel mediaState={media.mediaState} isTrackChanging={media.isMediaTrackChanging}
    commandError={media.mediaCommandError} onOpenSettings={() => {}}
    onPlayPause={() => void media.runMediaCommand("media_play_pause")}
    onNext={() => void media.runMediaCommand("media_next")}
    onPrevious={() => void media.runMediaCommand("media_previous")}
    lyricsSettings={{ lyricsFolder: "", lyricsOnline: true, lyricsOffsetMs: 0 }} />;
}

const settings = createRoot(document.getElementById("settings")!);
const player = createRoot(document.getElementById("player")!);
const results: string[] = [];
const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); results.push(`PASS ${message}`); };
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
const switches = () => [...document.querySelectorAll<HTMLInputElement>("#settings [role=switch]")];

try {
  await act(async () => {
    settings.render(<StrictMode><I18nProvider><MusicSourcePrioritySection /></I18nProvider></StrictMode>);
    player.render(<StrictMode><I18nProvider><Player /></I18nProvider></StrictMode>);
    await settle();
  });
  await act(settle);
  check(switches().length === 2 && switches().every((input) => input.checked), "audio applications appear and are adopted by default");
  check(document.querySelector(".music-player__track")?.textContent === "Desktop Player", "an audio-only application is shown without fake track metadata");
  check(!document.querySelector(".music-progress") && lyricsQueries === 0, "audio-only sources never invent a timeline or trigger online lyrics searches");
  const control = () => document.querySelector<HTMLButtonElement>(".music-control-button--primary")!;
  check(/静音|Mute/.test(control().getAttribute("aria-label") ?? ""), "audio control is explicitly labelled mute");
  await act(async () => { control().click(); await settle(); });
  check(/恢复|Restore/.test(control().getAttribute("aria-label") ?? ""), "mute changes to restore sound without pretending to pause playback");
  check([...document.querySelectorAll<HTMLButtonElement>(".music-control-button")].filter((button) => button !== control()).every((button) => button.disabled), "unsupported track skipping stays disabled");
  await act(async () => { switches()[0].click(); await settle(); });
  check(loadMusicSourcePriority()[0].enabled === false, "excluding an application persists immediately");
  await act(settle);
  check(document.querySelector(".music-player__track")?.textContent === "Browser", "excluding the current application moves control to another adopted source");
  await act(async () => { switches()[1].click(); await settle(); });
  await act(settle);
  check(document.querySelector<HTMLButtonElement>(".music-idle__resume")?.disabled, "excluding every source disables the global resume button");
  check(calls.filter((call) => call.command === "get_media_state").some((call) => (call.args.excludedSources as string[])?.length === 2), "native reads receive the full exclusion list");
  await act(async () => { switches()[0].click(); await settle(); });
  await act(settle);
  check(document.querySelector(".music-player__track")?.textContent === "Desktop Player", "a previously excluded application can be adopted again");
  const archive = [...document.querySelectorAll<HTMLButtonElement>("#settings button")].find((button) => /^(归档|Archive)$/.test(button.textContent ?? ""))!;
  check(Boolean(archive), "adoption switches coexist with upstream archive controls");
  await act(async () => { archive.click(); await settle(); });
  await act(settle);
  check(loadMusicSourcePriority().some((source) => source.label === "Desktop Player" && source.archived), "archiving persists independently of adoption");
  check(switches().length === 1 && document.querySelector<HTMLButtonElement>(".music-idle__resume")?.disabled, "an archived player stays excluded when every remaining player is disabled");
  const restore = [...document.querySelectorAll<HTMLButtonElement>("#settings button")].find((button) => /^(恢复|Restore)$/.test(button.textContent ?? ""))!;
  check(Boolean(restore), "the upstream restore action remains available");
  await act(async () => { restore.click(); await settle(); });
  await act(settle);
  check(switches().length === 2 && document.querySelector(".music-player__track")?.textContent === "Desktop Player", "restoring an adopted player makes it available again");
  check(document.getElementById("settings")!.scrollWidth <= document.getElementById("settings")!.clientWidth, "source controls fit the settings width");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  results.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
} finally {
  document.getElementById("results")!.textContent = results.join("\n");
}
