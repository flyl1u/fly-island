// A long lyric line on the collapsed island. Song time is simulated: a paused song at chosen
// positions shows where the line is at each moment. ?preview=1 plays it for a look.
import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CollapsedLyric } from "../../src/features/media/CollapsedLyric";
import type { MediaState } from "../../src/features/media/api";
import type { LyricLine } from "../../src/features/media/lyrics/lrc";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";

const preview = new URLSearchParams(location.search).has("preview");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: !preview });
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const passed: string[] = [];
const LONG = "这是一句特别特别长的歌词，在收起的小岛上一屏放不下，要跟着歌声向左滚动到结尾";
const parts = ["这是一句", "特别特别长的", "逐字歌词，", "唱到哪里，", "就要滚到哪里，", "直到最后一个字"];
// Each word is sung for a second, from 21s.
const words = parts.map((text, index) => ({ text, startMs: 21_000 + index * 1000, endMs: 22_000 + index * 1000 }));
const lines: LyricLine[] = [
  { timeMs: 1000, text: LONG },
  { timeMs: 9000, text: "短句" },
  { timeMs: 21_000, text: parts.join(""), words },
  { timeMs: 30_000, text: LONG },
];
const base: MediaState = { ...DEFAULT_MEDIA_STATE, title: "滚动测试", artist: "歌手", available: true,
  playbackStatus: "paused", positionMs: 1000, durationMs: 60_000, updatedAt: Date.now() };

async function render(state: Partial<MediaState> = {}, fill = false) {
  await act(async () => {
    root.render(<StrictMode><CollapsedLyric active lines={lines} mediaState={{ ...base, updatedAt: Date.now(), ...state }}
      lyricsSettings={{ lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0, lyricWordFill: fill }} /></StrictMode>);
  });
  // The ResizeObserver reports the view's width on the next frame.
  await wait(60);
}
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const view = () => document.querySelector<HTMLElement>(".collapsed-lyric")!;
const track = () => document.querySelector<HTMLElement>(".collapsed-lyric__track")!;
const shift = () => {
  const transform = getComputedStyle(track()).transform;
  return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
};
const fades = () => ["start", "end"].map((side) => parseFloat(getComputedStyle(view()).getPropertyValue(`--collapsed-lyric-fade-${side}`)) || 0);
function check(ok: unknown, label: string) {
  if (!ok) throw new Error(label);
  passed.push(`PASS ${label}`);
}

if (preview) {
  root.render(<CollapsedLyric active lines={lines} mediaState={{ ...base, playbackStatus: "playing", updatedAt: Date.now() }}
    lyricsSettings={{ lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0, lyricWordFill: true }} />);
  results.remove();
} else try {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    await render({ positionMs: 6000 });
    check(!view().hasAttribute("data-scrolling") && shift() === 0 && getComputedStyle(view()).textOverflow === "ellipsis"
      && view().scrollWidth > view().clientWidth, "减少动态效果时长歌词不滚动，仍是省略号");
  } else {
    await render();
    const box = view().getBoundingClientRect();
    const distance = track().offsetWidth - view().clientWidth;
    check(view().hasAttribute("data-scrolling") && distance > 100, `超长歌词进入滚动（超出 ${distance}px）`);
    check(shift() === 0 && fades()[0] === 0 && fades()[1] === 10, `开头先停住，只有右边渐隐（${shift()}，${fades().join("/")}）`);
    // The line is shown at 0.8s and replaced at 8.8s: it rests until 1.4s and arrives at 8.5s.
    const seen: number[] = [];
    for (const positionMs of [1400, 2000, 3500, 5000, 6500, 8000]) {
      await render({ positionMs });
      seen.push(shift());
    }
    check(Math.abs(seen[0]) < 0.5 && seen.every((value, index) => index === 0 || value < seen[index - 1] - 5),
      `随时间从 0 逐渐向左移动（${seen.map((value) => value.toFixed(0)).join(" ")}）`);
    check(fades().join() === "10,10", "移动中两边都渐隐");
    check(Math.abs((seen[3] - seen[1]) / (seen[5] - seen[3]) - 1) < 0.02, "匀速移动");
    await render({ positionMs: 8550 });
    const end = track().getBoundingClientRect().right;
    check(Math.abs(shift() + distance) <= 1 && end <= view().getBoundingClientRect().right + 1.5 && fades()[1] === 0,
      `换行前约 300ms 露出句尾，右边不再渐隐（${shift().toFixed(1)} / ${-distance}）`);
    check(view().getBoundingClientRect().width === box.width && view().getBoundingClientRect().height === box.height
      && view().scrollLeft === 0, "只用 transform 移动，布局宽高不变");

    await render({ positionMs: 3500 });
    const held = shift();
    await wait(300);
    check(shift() === held && held < -5, "暂停时停在原处");
    await render({ positionMs: 2000 });
    check(shift() > held + 5, "往回拖进度后按新位置重算");
    await render({ positionMs: 3500, playbackStatus: "playing" });
    const before = shift();
    await wait(400);
    check(shift() < before - 3 && Math.abs(before - held) < 20, `继续播放从原处接着滚（${held.toFixed(0)} → ${shift().toFixed(0)}）`);

    await render({ positionMs: 9500 });
    check(!view().hasAttribute("data-scrolling") && shift() === 0 && track().textContent === "短句", "换到放得下的一句：不滚动，位置归零");

    const spans = () => [...document.querySelectorAll<HTMLElement>(".collapsed-lyric__word")];
    const offsets: number[] = [];
    let visible = true;
    for (let positionMs = 21_000; positionMs <= 27_200; positionMs += 250) {
      await render({ positionMs }, true);
      offsets.push(shift());
      const index = Math.min(parts.length - 1, Math.floor((positionMs - 21_000) / 1000));
      const word = spans()[index].getBoundingClientRect();
      const sungEdge = word.left + word.width * Math.min(1, (positionMs - words[index].startMs) / 1000);
      const area = view().getBoundingClientRect();
      visible &&= sungEdge >= area.left - 1 && sungEdge <= area.right + 1;
    }
    check(visible, "逐字模式：正在唱到的位置一直在可见范围内");
    check(offsets[0] === 0 && offsets.every((value, index) => index === 0 || value <= offsets[index - 1] + 0.5)
      && Math.abs(offsets[offsets.length - 1] + track().offsetWidth - view().clientWidth) <= 1.5,
    `逐字模式：从 0 跟着唱词向左，唱完露出句尾（${offsets[offsets.length - 1].toFixed(0)}px）`);
  }
  results.dataset.result = "passed"; results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed"; results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
} finally {
  if (!preview) await act(async () => root.unmount());
}
