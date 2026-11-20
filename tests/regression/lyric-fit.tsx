import "../../src/styles/tokens.css";
import "../../src/windows/island/IslandCollapsedBar.css";
import { act, StrictMode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { CollapsedLyric } from "../../src/features/media/CollapsedLyric";
import type { MediaState } from "../../src/features/media/api";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { getCollapsedIslandWidth, MAX_COLLAPSED_ISLAND_WIDTH } from "../../src/windows/island/layout";

const preview = new URLSearchParams(location.search).has("preview");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: !preview });
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const passed: string[] = [];

// Chinese lyric lines of 12, 20 and 40 characters.
const line = (count: number) => "词".repeat(count);
const cases = [
  { id: "short", text: line(12) },
  { id: "mid", text: line(20) },
  { id: "long", text: line(40) },
];
mockIPC((command, payload) => {
  if (command !== "get_lyrics") return null;
  const query = (payload as { query: Record<string, unknown> }).query;
  const found = cases.find((item) => item.id === query.trackId);
  return { source: "qqmusic", lrc: `[00:01.00]${found?.text ?? ""}` };
});
const base: MediaState = { ...DEFAULT_MEDIA_STATE, title: "长歌词", artist: "歌手", available: true,
  sourceApp: "QQMusic.exe", playbackStatus: "paused", positionMs: 2000, durationMs: 60_000, updatedAt: Date.now() };

function check(ok: unknown, label: string) {
  if (!ok) throw new Error(label);
  passed.push(`PASS ${label}`);
}

// The bar of the collapsed island: the same 18px padding the island uses (IslandShell.css).
const bar = (width: number): CSSProperties => ({
  width: `${width}px`, padding: "0 18px", display: "flex", alignItems: "center", boxSizing: "border-box",
});

if (preview) {
  results.remove();
} else try {
  await act(async () => {
    root.render(<StrictMode>{cases.map((item) => {
      const width = getCollapsedIslandWidth(item.text, 0, 1, MAX_COLLAPSED_ISLAND_WIDTH);
      return (
        <div key={item.id} style={bar(width)}>
          <div className="island__text-slot" style={{ width: "100%" }}>
            <CollapsedLyric active mediaState={{ ...base, trackId: item.id, updatedAt: Date.now() }}
              lyricsSettings={{ lyricsFolder: "", lyricsOnline: true, lyricsChinese: true, lyricWordFill: false, lyricsOffsetMs: 0 }} />
          </div>
        </div>
      );
    })}</StrictMode>);
  });
  const lyrics = [...document.querySelectorAll<HTMLElement>(".collapsed-lyric")];
  const widths = cases.map((item) => getCollapsedIslandWidth(item.text, 0, 1, MAX_COLLAPSED_ISLAND_WIDTH));
  check(widths[2] === MAX_COLLAPSED_ISLAND_WIDTH, `超长歌词把岛拉到设置允许的上限（${widths[2]}px）`);
  cases.forEach((item, index) => {
    const lyric = lyrics[index];
    check(lyric.scrollWidth <= lyric.clientWidth,
      `${item.text.length} 字的中文歌词完整显示（scroll ${lyric.scrollWidth} / client ${lyric.clientWidth}）`);
  });
  const fontSize = Number.parseFloat(getComputedStyle(lyrics[2]).fontSize);
  check(fontSize >= 9, `超长歌词缩到 ${fontSize.toFixed(1)}px，仍读得清`);
  results.dataset.result = "passed"; results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed"; results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
} finally {
  if (!preview) await act(async () => root.unmount());
}
