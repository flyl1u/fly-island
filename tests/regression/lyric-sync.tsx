import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { CollapsedLyric } from "../../src/features/media/CollapsedLyric";
import { LyricsView } from "../../src/features/media/lyrics/LyricsView";
import { useLyrics } from "../../src/features/media/lyrics/useLyrics";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import type { MediaState } from "../../src/features/media/api";
import { I18nProvider } from "../../src/i18n";

// 收起的小岛和展开的音乐页放同一首歌：同一时刻，两边的歌词行和逐字填充必须一样。
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const passed: string[] = [];
const lrc = "[00:01.00]<00:01.00>first<00:03.00>second<00:05.00>\n[00:06.00]<00:06.00>third<00:08.00>fourth<00:10.00>";
mockIPC((command) => {
  if (command !== "get_lyrics") return null;
  return { lrc };
});
const base: MediaState = { ...DEFAULT_MEDIA_STATE, title: "一致测试", artist: "歌手", available: true,
  sourceApp: "QQMusic.exe", trackId: "QQ-1", playbackStatus: "playing", positionMs: 1000, durationMs: 60_000, updatedAt: Date.now() };
const lyricsSettings = { lyricsFolder: "", lyricsOnline: true, lyricsChinese: false, lyricWordFill: true, lyricsOffsetMs: 0 };

/** The music page: it looks the lyrics up the same way the collapsed island does. */
function MusicPage({ state }: { state: MediaState }) {
  const { lines } = useLyrics(state, lyricsSettings);
  if (!lines) return null;
  return <I18nProvider><LyricsView lines={lines} mediaState={state} offsetMs={0} wordFillEnabled /></I18nProvider>;
}

async function render(state: MediaState) {
  await act(async () => {
    root.render(<StrictMode>
      <div>
        <CollapsedLyric mediaState={state} lyricsSettings={lyricsSettings} active />
        <MusicPage state={state} />
      </div>
    </StrictMode>);
  });
}
const collapsedLine = () => document.querySelector(".collapsed-lyric")?.textContent;
const expandedLine = () => document.querySelector(".lyrics-view__line--current")?.textContent;
// How much of each word is lit, in percent of the background's travel (100 = just starting).
const fill = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
  .map((word) => Number.parseFloat(getComputedStyle(word).backgroundPositionX));
function check(ok: unknown, label: string) {
  if (!ok) throw new Error(label);
  passed.push(`PASS ${label}`);
}

try {
  for (const positionMs of [1000, 2500, 4000, 5500, 7000, 9000]) {
    // The media report is a moment old, as it is between two polls.
    const state: MediaState = { ...base, positionMs, updatedAt: Date.now() - 800 };
    await render(state);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    const collapsed = collapsedLine();
    const expanded = expandedLine();
    const collapsedFill = fill(".collapsed-lyric__word");
    const expandedFill = fill(".lyrics-view__word");
    check(collapsed === expanded, `${positionMs}ms 同一句歌词：收起 "${collapsed}" / 展开 "${expanded}"`);
    check(collapsedFill.length > 0 && collapsedFill.length === expandedFill.length
      && collapsedFill.every((value, index) => Math.abs(value - expandedFill[index]) < 0.5),
      `${positionMs}ms 逐字填充一致：${JSON.stringify(collapsedFill)} / ${JSON.stringify(expandedFill)}`);
    // Let the clock run on, so the next round starts from a later report.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
  }
  results.dataset.result = "passed";
  results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed";
  results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
} finally {
  await act(async () => root.unmount());
}
