import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { CollapsedLyric } from "../../src/features/media/CollapsedLyric";
import type { MediaState } from "../../src/features/media/api";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { I18nProvider } from "../../src/i18n";
import { LyricsSettingsSection } from "../../src/features/media/lyrics/LyricsSettingsSection";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings";

const preview = new URLSearchParams(location.search).has("preview");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: !preview });
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const passed: string[] = [];
const lrc = "[00:01.00]<00:01.00>逐字<00:03.00><00:04.00>歌词填充<00:08.00>\n[00:09.00]普通歌词";
const queries: Array<Record<string, unknown>> = [];
mockIPC((command, payload) => {
  if (command !== "get_lyrics") return null;
  const query = (payload as { query: Record<string, unknown> }).query;
  queries.push(query);
  return { source: "qqmusic", lrc };
});
const base: MediaState = { ...DEFAULT_MEDIA_STATE, title: "逐字测试", artist: "歌手", available: true,
  sourceApp: "QQMusic.exe", trackId: "QQ-97773", playbackStatus: "paused", positionMs: 2000, durationMs: 60_000, updatedAt: Date.now() };

async function render(state: Partial<MediaState> = {}, active = true, fill = true, offset = 0) {
  await act(async () => {
    root.render(<StrictMode><CollapsedLyric active={active} mediaState={{ ...base, ...state }}
      lyricsSettings={{ lyricsFolder: "", lyricsOnline: true, lyricsChinese: true, lyricsOffsetMs: offset, lyricWordFill: fill }} /></StrictMode>);
  });
}
const words = () => [...document.querySelectorAll<HTMLElement>(".collapsed-lyric__word")];
const text = () => document.querySelector<HTMLElement>(".collapsed-lyric")!;
const tick = () => act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
function check(ok: unknown, label: string) {
  if (!ok) throw new Error(label);
  passed.push(`PASS ${label}`);
}

if (preview) {
  root.render(<CollapsedLyric active mediaState={{ ...base, playbackStatus: "playing", positionMs: 1000, updatedAt: Date.now() }}
    lyricsSettings={{ lyricsFolder: "", lyricsOnline: true, lyricsChinese: true, lyricsOffsetMs: 0 }} />);
  results.remove();
} else try {
  await render(); await tick();
  check(words().length === 2 && text().textContent === "逐字歌词填充", "逐字标签保持原文，不增加测量文字或重复内容");
  check(queries[0].sourceAppId === "QQMusic.exe" && queries[0].trackId === "QQ-97773", "歌曲 ID 和播放器 AUMID 传给原生歌词源");
  check(words()[0].style.animationDelay === "-1000ms" && words()[0].style.animationDuration === "2000ms", "暂停在词中间时从对应比例填充");
  check(words().every((word) => getComputedStyle(word).animationPlayState === "paused"), "暂停时不继续填充");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  check(getComputedStyle(words()[0]).animationTimingFunction === (reduced ? "steps(1, start)" : "linear"), "减少动态效果时逐词点亮，普通模式平滑填充");
  const paused = Number.parseFloat(getComputedStyle(words()[0]).backgroundPositionX);
  check(reduced ? paused === 0 : Math.abs(paused - 50) < 1, "文字渐变位置与半词时间对应");

  await render({ positionMs: 1500, updatedAt: Date.now() }); await tick();
  check(words()[0].style.animationDelay === "-500ms", "同一句内 seek 立即重建动画起点");
  await render({ positionMs: 2000, updatedAt: Date.now() }, true, true, 500);
  check(words()[0].style.animationDelay === "-500ms", "歌词校准同时移动逐字时间");

  await render({ positionMs: 1000, updatedAt: Date.now(), playbackStatus: "playing" }); await tick();
  const word = words()[0]; const box = text().getBoundingClientRect();
  const before = Number.parseFloat(getComputedStyle(word).backgroundPositionX);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
  const after = Number.parseFloat(getComputedStyle(word).backgroundPositionX);
  check(reduced || after < before, "播放中填充随浏览器动画帧前进");
  check(word === words()[0] && text().getBoundingClientRect().width === box.width && text().getBoundingClientRect().height === box.height,
    "填充期间 DOM 与布局尺寸不变");
  await render({ positionMs: 2000, playbackStatus: "playing" }, false);
  check(words().every((word) => word.style.animationPlayState === "paused"), "折叠歌词不可见时停掉填充");
  await render({ positionMs: 2000, updatedAt: Date.now() }, true, false);
  check(words().length === 0 && text().textContent === "逐字歌词填充", "关闭设置只显示原来的行级文字");
  await render({ positionMs: 9500, updatedAt: Date.now() });
  check(words().length === 0 && text().textContent === "普通歌词", "没有逐字数据时仍显示普通歌词");
  await render({ trackId: "QQ-new", positionMs: 2000 });
  check(queries.length === 2 && queries[1].trackId === "QQ-new", "同名歌曲晚到的歌曲 ID 会触发精确查询");
  check(normalizeSettings({ lyricWordFill: false }).lyricWordFill === false && normalizeSettings({}).lyricWordFill,
    "新设置兼容旧存档且明确关闭后保持关闭");
  let saved = DEFAULT_SETTINGS;
  await act(async () => root.render(<I18nProvider><LyricsSettingsSection settings={saved} onSettingsChange={(value) => { saved = value; }} /></I18nProvider>));
  const row = [...document.querySelectorAll<HTMLElement>(".settings-row")].find((r) => r.textContent?.includes("逐字歌词填充"));
  const toggle = row?.querySelector<HTMLInputElement>("[role='switch']");
  check(toggle?.checked === true, "音乐设置复用现有开关行，默认开启");
  await act(async () => toggle?.click());
  check(saved.lyricWordFill === false, "设置开关传回明确关闭值");
  results.dataset.result = "passed"; results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed"; results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
} finally {
  if (!preview) await act(async () => root.unmount());
}
