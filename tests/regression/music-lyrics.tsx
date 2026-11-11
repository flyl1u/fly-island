// pnpm dev, then open /tests/regression/music-lyrics.html. Renders the music page with get_lyrics
// mocked at the page's real size (520 x 234, on the island's black): with lyrics a compact head and
// three lines that follow the position and the offset; without them a large cover; the progress bar
// with elapsed and remaining time above the transport; the page with nothing playing.
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
// A plain gradient cover, so the page shows the artwork and the tint it gives the card.
const COVER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#f2a65a"/><stop offset="1" stop-color="#6a4c93"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>')}`;
const queries: Array<Record<string, unknown>> = [];
mockIPC((command, payload) => {
  if (command !== "get_lyrics") return null;
  const query = (payload as { query: Record<string, unknown> }).query;
  queries.push(query);
  if (query.title === "Yesterday") return { source: "kugou", lrc: ["[00:01.00]Oh I believe", "[00:05.00]in yesterday"].join("\n"), translation: "[00:01.00]哦 我相信" };
  // NetEase Cloud Music reports no length; the lyrics source lists one.
  if (query.title === "玻璃") return { source: "netease", lrc: "[00:01.00]把手机放在耳边", durationMs: 240_000 };
  if (query.title === "Believe") return { source: "kugou", lrc: "[00:01.00]<00:01.00>Oh <00:01.30>I <00:01.70>believe<00:03.00>\n[00:04.00]in yesterday" };
  return query.title === "晴天" ? { source: "lrclib", lrc: LRC } : null;
});

const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
const messages: string[] = [];
const root = createRoot(fixture);
const ONLINE = { lyricsFolder: "", lyricsOnline: true, lyricsOffsetMs: 0 };
let settingsOpened = 0;

function track(title: string, positionMs: number, playing = false): MediaState {
  return {
    ...DEFAULT_MEDIA_STATE, available: true, title, artist: "周杰伦", album: "叶惠美", thumbnail: COVER,
    durationMs: 269_000, positionMs, updatedAt: Date.now(), playbackStatus: playing ? "playing" : "paused",
  };
}

async function render(mediaState: MediaState, lyricsSettings: typeof ONLINE | undefined = ONLINE) {
  await act(async () => {
    root.render(
      <StrictMode><I18nProvider>
        <MusicPlayerPanel mediaState={mediaState} isTrackChanging={false} commandError={null} onOpenSettings={() => { settingsOpened += 1; }}
          onPlayPause={() => {}} onNext={() => {}} onPrevious={() => {}} lyricsSettings={lyricsSettings} />
      </I18nProvider></StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}

const view = () => document.querySelector<HTMLElement>(".lyrics-view");
const lines = () => [...document.querySelectorAll<HTMLElement>(".lyrics-view__line")].map((line) => line.textContent);

const settle = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
// Layout size: a paused cover is drawn a little smaller (scale), which getBoundingClientRect includes.
const artSize = () => document.querySelector<HTMLElement>(".music-player__artwork")!.offsetWidth;
const box = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();

// ?view=idle shows the page with nothing playing, for a look by eye.
if (new URLSearchParams(location.search).get("view") === "idle") {
  await render({ ...DEFAULT_MEDIA_STATE, updatedAt: Date.now() });
  results.remove();
} else try {
  await render(track("晴天", 6000));
  await settle(450);
  check(view() && document.querySelector(".music-player--lyrics") && artSize() === 52,
    "找到歌词时封面缩小到歌名旁边，歌词占据中间");
  const times = () => [...document.querySelectorAll<HTMLElement>(".music-progress__time")].map((time) => time.textContent);
  check(times().join("|") === "0:06|−4:23" && document.querySelector<HTMLElement>(".music-progress")!.style.getPropertyValue("--music-progress") === "2.23%",
    "进度条下面左边是已播放时间、右边是剩余时间，填充比例跟随进度");
  check(lines().join("|") === "故事的小黄花|从出生那年就飘着|童年的荡秋千 随记忆一直晃到现在 这一句特别特别长长到一行放不下需要省略号来收尾才行", "当前句在中间，上一句和下一句在两边");
  const query = queries[queries.length - 1];
  check(query.title === "晴天" && query.artist === "周杰伦" && query.album === "叶惠美" && query.durationMs === 269_000 && query.online === true, "按歌名、歌手、专辑和时长查找");
  const current = document.querySelector<HTMLElement>(".lyrics-view__line--current")!;
  check(getComputedStyle(current).fontSize === "18px" && getComputedStyle(document.querySelector(".lyrics-view__line--side")!).fontSize === "13px", "当前句更大更亮");
  const lyricsBox = box(".lyrics-view");
  const page = box(".music-player");
  check(getComputedStyle(current).textAlign === "center" && Math.abs((lyricsBox.left + lyricsBox.right) / 2 - (page.left + page.right) / 2) < 1,
    "歌词居中，和进度条、播放控制在同一条中线上");
  const fill = () => getComputedStyle(document.querySelector(".music-progress__fill")!).backgroundColor;
  check(fill() !== "rgb(236, 236, 242)", "进度条用封面的颜色");

  await render(track("晴天", 10_000));
  const long = document.querySelector<HTMLElement>(".lyrics-view__line--current")!;
  check(long.scrollWidth > long.clientWidth && fixture.scrollWidth <= fixture.clientWidth, "长句单行省略，不撑宽页面");
  const card = box(".music-player");
  check(box(".music-player__head").bottom <= box(".music-player__lyrics").top && box(".music-player__lyrics").bottom <= box(".music-progress").top &&
    box(".music-progress").bottom <= box(".music-player__controls").top && box(".music-player__controls").bottom <= card.bottom + 0.5 && card.height <= 234.5,
    "歌名、歌词、进度条、播放按钮从上到下排好，都完整放在 234px 高的页面里");
  check(box(".music-player__artwork").right <= box(".music-player__meta").left, "封面在左，歌名和歌手在右");

  await render(track("晴天", 13_500));
  check(lines()[1] === "♪", "间奏的空行显示音符");
  await render(track("晴天", 500));
  check(lines().join("|") === "|♪|故事的小黄花", "前奏时中间显示音符，第一句在下面等着");

  await render(track("晴天", 6000), { ...ONLINE, lyricsOffsetMs: 2000 });
  check(lines()[1] === "故事的小黄花", "推后 2 秒时仍显示上一句");
  await render(track("晴天", 4500, true));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)); });
  check(lines()[1] === "从出生那年就飘着", "播放时在两次读取之间按时间往下走");

  const before = queries.length;
  await render(track("七里香", 6000));
  await settle(450);
  check(!view() && !document.querySelector(".music-player--lyrics") && artSize() === 112 && queries.length === before + 1,
    "找不到歌词时封面变大，占据歌词的位置");
  const hint = () => document.querySelector<HTMLButtonElement>(".music-player__lyrics-hint");
  const panel = box(".music-player");
  check(hint()?.textContent === "没找到歌词 · 试试酷狗和网易云" && hint()!.getBoundingClientRect().left >= panel.left && hint()!.getBoundingClientRect().right <= panel.right,
    "中文歌只查了 LRCLIB 没找到时，歌手下面提示可以开启酷狗和网易云");
  settingsOpened = 0;
  await act(async () => hint()!.click());
  check(settingsOpened === 1, "点提示打开音乐设置");
  await render(track("稻香", 6000), { lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0 });
  check(!view() && queries.length === before + 1, "没设歌词文件夹也没开在线查找时不去查");
  check(!hint(), "没开在线查找时不提示");
  await render(track("七里香", 6000), { ...ONLINE, lyricsChinese: true } as typeof ONLINE);
  check(!view() && !hint(), "已经开着酷狗和网易云还找不到时不提示");

  // A translation shows under its line; this song's own offset sits by the settings button.
  localStorage.removeItem("focusd-island-lyrics-offsets");
  await render(track("Yesterday", 2000), { ...ONLINE, lyricsChinese: true } as typeof ONLINE);
  const yesterday = queries[queries.length - 1];
  check(yesterday.chinese === true && yesterday.trackId === null, "打开中文来源时一起查酷狗和网易云");
  check(lines().join("|") === "|Oh I believe|哦 我相信" && document.querySelector(".lyrics-view__line--translation"), "有翻译时，当前句下面显示翻译");
  const offsetButtons = [...document.querySelectorAll<HTMLButtonElement>(".lyrics-offset button")];
  check(offsetButtons.length === 3 && offsetButtons[1].textContent === "0s" && offsetButtons[1].disabled, "音乐页右上角有这首歌的提前、推后按钮");
  await act(async () => offsetButtons[2].click());
  await act(async () => offsetButtons[2].click());
  await act(async () => offsetButtons[2].click());
  check(offsetButtons[1].textContent === "+1.5s" && lines()[1] === "♪", "推后 1.5 秒后，2 秒时还没到第一句");
  check(JSON.parse(localStorage.getItem("focusd-island-lyrics-offsets") ?? "{}")[Object.keys(JSON.parse(localStorage.getItem("focusd-island-lyrics-offsets") ?? "{}"))[0]] === 1500, "这首歌的调整按歌存下来");
  await act(async () => offsetButtons[1].click());
  check(offsetButtons[1].textContent === "0s" && lines()[1] === "Oh I believe", "点中间的数字恢复为 0");
  localStorage.removeItem("focusd-island-lyrics-offsets");

  // Word-timed lines (Kugou KRC, enhanced LRC) fill word by word.
  await render(track("Believe", 1500));
  const words = () => [...document.querySelectorAll<HTMLElement>(".lyrics-view__word")];
  const fillX = (word: HTMLElement) => getComputedStyle(word).backgroundPosition.split(" ")[0];
  check(words().map((word) => word.textContent).join("|") === "Oh |I |believe" && lines()[1] === "Oh I believe" && lines()[2] === "in yesterday",
    "逐字时间的歌词按字分开，整句文字不变");
  check(parseFloat(fillX(words()[0])) === 0 && fillX(words()[2]) === "100%" && fillX(words()[1]) !== fillX(words()[0]) && fillX(words()[1]) !== "100%",
    "唱过的字亮、正在唱的字亮到一半、没唱的字暗");
  check(words().every((word) => getComputedStyle(word).animationPlayState === "paused"), "暂停时逐字填充也停住");
  await render(track("Believe", 1500, true));
  check(words().every((word) => getComputedStyle(word).animationPlayState === "running"), "播放时逐字填充往前走");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
  check(fillX(words()[2]) !== "100%", "到点后下一个字开始变亮");
  await render(track("Believe", 4500));
  check(words().length === 0 && lines()[1] === "in yesterday", "没有逐字时间的句子照常整句显示");

  await render({ ...track("电台", 0), durationMs: 0 });
  check(!document.querySelector(".music-progress"), "播放器和歌词都不知道时长时不显示进度条");
  await render({ ...track("玻璃", 60_000), durationMs: 0 }, { ...ONLINE, lyricsChinese: true } as typeof ONLINE);
  await settle(60);
  check(times().join("|") === "1:00|−3:00", "播放器不报告时长时，用歌词来源给的时长显示进度条");

  // A title too long for the page: two lines at most next to the large cover, one with lyrics.
  const longTitle = "This Is a Very Long Song Title That Keeps Going (Live at the Royal Albert Hall, 2019 Remaster)";
  await render({ ...track(longTitle, 6000), artist: "The Extraordinarily Long-Named Orchestra and Friends" }, { ...ONLINE, lyricsOnline: false });
  const title = document.querySelector<HTMLElement>(".music-player__track")!;
  check(title.getBoundingClientRect().height <= parseFloat(getComputedStyle(title).lineHeight) * 2 + 1 && title.scrollHeight > title.clientHeight &&
    fixture.scrollWidth <= fixture.clientWidth, "很长的歌名最多两行，不撑宽页面");

  // Nothing playing: a page of its own, not an empty player.
  await render({ ...DEFAULT_MEDIA_STATE, updatedAt: Date.now() });
  check(document.querySelector(".music-idle__title")?.textContent === "没有在播放" && document.querySelector(".music-idle__record")
    && !document.querySelector(".music-progress, .music-player__head, .music-player__controls, .music-player__artwork"),
    "没有在播放时是一张静止的唱片和一句说明，没有空的封面、进度条和播放键");
  check(document.querySelector<HTMLButtonElement>(".music-idle__resume")?.textContent === "继续播放" && fixture.scrollWidth <= fixture.clientWidth,
    "空状态只留一个“继续播放”，不撑宽页面");
  // Leave the page on a playing song with lyrics, for a look by eye.
  await render(track("晴天", 6000, true));

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
}
