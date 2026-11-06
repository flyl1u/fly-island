// pnpm dev, then open /tests/regression/music-lyrics.html. Renders the music page with get_lyrics
// mocked: synced lyrics take the waveform's place and follow the position and the offset, and
// the waveform stays when there are none or no source is set.
import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import type { MediaState } from "../../src/features/media/api";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { MusicPlayerPanel } from "../../src/features/media/MusicPlayerPanel";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const LRC = [
  "[ar:周杰伦]",
  "[00:01.00]故事的小黄花",
  "[00:05.00]从出生那年就飘着",
  "[00:09.00]童年的荡秋千 随记忆一直晃到现在 这一句特别特别长长到一行放不下需要省略号来收尾才行",
  "[00:13.00]",
  "[00:15.00]刮风这天",
].join("\n");
const queries: Array<Record<string, unknown>> = [];
mockIPC((command, payload) => {
  if (command !== "get_lyrics") return null;
  const query = (payload as { query: Record<string, unknown> }).query;
  queries.push(query);
  return query.title === "晴天" ? { source: "lrclib", lrc: LRC } : null;
});

const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
const messages: string[] = [];
const root = createRoot(fixture);
const ONLINE = { lyricsFolder: "", lyricsOnline: true, lyricsOffsetMs: 0 };

function track(title: string, positionMs: number, playing = false): MediaState {
  return {
    ...DEFAULT_MEDIA_STATE, available: true, title, artist: "周杰伦", album: "叶惠美",
    durationMs: 269_000, positionMs, updatedAt: Date.now(), playbackStatus: playing ? "playing" : "paused",
  };
}

async function render(mediaState: MediaState, lyricsSettings: typeof ONLINE | undefined = ONLINE) {
  await act(async () => {
    root.render(
      <StrictMode><I18nProvider>
        <MusicPlayerPanel mediaState={mediaState} isTrackChanging={false} commandError={null} onOpenSettings={() => {}}
          onPlayPause={() => {}} onNext={() => {}} onPrevious={() => {}} lyricsSettings={lyricsSettings} />
      </I18nProvider></StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`✓ ${label}`);
}

const view = () => document.querySelector<HTMLElement>(".lyrics-view");
const lines = () => [...document.querySelectorAll<HTMLElement>(".lyrics-view__line")].map((line) => line.textContent);

try {
  await render(track("晴天", 6000));
  check(view() && !document.querySelector(".media-waveform"), "找到歌词时用歌词代替波形");
  check(lines().join("|") === "故事的小黄花|从出生那年就飘着|童年的荡秋千 随记忆一直晃到现在 这一句特别特别长长到一行放不下需要省略号来收尾才行", "当前句在中间，上一句和下一句在两边");
  const query = queries[queries.length - 1];
  check(query.title === "晴天" && query.artist === "周杰伦" && query.album === "叶惠美" && query.durationMs === 269_000 && query.online === true, "按歌名、歌手、专辑和时长查找");
  const current = document.querySelector<HTMLElement>(".lyrics-view__line--current")!;
  check(getComputedStyle(current).fontSize === "15px" && getComputedStyle(document.querySelector(".lyrics-view__line--side")!).fontSize === "12px", "当前句更大更亮");

  await render(track("晴天", 10_000));
  const long = document.querySelector<HTMLElement>(".lyrics-view__line--current")!;
  check(long.scrollWidth > long.clientWidth && fixture.scrollWidth <= fixture.clientWidth, "长句单行省略，不撑宽面板");
  check(Math.abs(view()!.getBoundingClientRect().height - 76) < 1, "歌词区和波形一样高，不改变页面高度");

  await render(track("晴天", 13_500));
  check(lines()[1] === "♪", "间奏的空行显示音符");
  await render(track("晴天", 500));
  check(lines().join("|") === "||故事的小黄花", "第一句之前只显示下一句");

  await render(track("晴天", 6000), { ...ONLINE, lyricsOffsetMs: 2000 });
  check(lines()[1] === "故事的小黄花", "推后 2 秒时仍显示上一句");
  await render(track("晴天", 4500, true));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)); });
  check(lines()[1] === "从出生那年就飘着", "播放时在两次读取之间按时间往下走");

  const before = queries.length;
  await render(track("七里香", 6000));
  check(!view() && document.querySelector(".media-waveform") && queries.length === before + 1, "找不到歌词时仍显示波形");
  await render(track("稻香", 6000), { lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0 });
  check(!view() && queries.length === before + 1, "没设歌词文件夹也没开在线查找时不去查");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
}
