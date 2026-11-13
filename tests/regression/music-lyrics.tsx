// pnpm dev, then open /tests/regression/music-lyrics.html. Renders the music page with get_lyrics
// mocked at the page's real size (520 x 234, on the island's black): with lyrics a compact head and
// three lines that follow the position and the offset; without them a large cover; the progress bar
// with elapsed and remaining time above the transport, read-only or dragged to seek; the page with nothing playing.
import "../../src/styles/tokens.css";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import type { MediaState } from "../../src/features/media/api";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { MusicPlayerPanel } from "../../src/features/media/MusicPlayerPanel";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
localStorage.setItem("focusd-island-locale", "zh-CN");
localStorage.removeItem("focusd-island-media-diagnostics-dismissed");
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
const diagnosticPlayers = [
  { sourceAppId: "cloudmusic.exe", label: "网易云音乐", status: "neteaseNeedsPlugin" },
  { sourceAppId: "QQMusic.exe", label: "QQ 音乐", status: "needsUpdate" },
  { sourceAppId: "KuGou.exe", label: "酷狗", status: "smtcOff" },
  { sourceAppId: "other.exe", label: "Other", status: "noTimeline" },
  { sourceAppId: "healthy.exe", label: "Healthy", status: "ok" },
].map((player) => ({ ...player, hasSession: player.status !== "smtcOff", hasTimeline: player.status === "ok", hasPluginTrackId: false,
  exePath: null, directory: null, version: null, neteasePluginState: null }));
let finishInstall: ((value: { keptForeignLoader: boolean; preservedFiles: string[] }) => void) | undefined;
let failInstall: ((error: unknown) => void) | undefined;
mockIPC((command, payload) => {
  if (command === "netease_plugin_status") return { state: "none", supported: true, tested: true, version: "3.1.41", arch: "x64", installDir: "D:\\CloudMusic", running: false, legacyInfLink: false, pluginDir: "C:\\betterncm\\plugins" };
  if (command === "install_netease_plugin") return new Promise((resolve, reject) => { finishInstall = resolve; failInstall = reject; });
  if (command === "uninstall_netease_plugin") return { keptForeignLoader: false, preservedFiles: [] };
  if (command === "get_media_diagnostics") return { players: diagnosticPlayers };
  if (command === "plugin:event|listen") return 1;
  if (command === "plugin:event|unlisten") return null;
  if (command !== "get_lyrics") return null;
  const query = (payload as { query: Record<string, unknown> }).query;
  queries.push(query);
  if (query.title === "Yesterday") return { source: "kugou", lrc: ["[00:01.00]Oh I believe", "[00:05.00]in yesterday"].join("\n"), translation: "[00:01.00]哦 我相信" };
  // NetEase Cloud Music reports no length; the lyrics source lists one.
  if (query.title === "玻璃") return { source: "netease", lrc: "[00:01.00]把手机放在耳边", durationMs: 240_000 };
  if (query.title === "Believe") return { source: "kugou", lrc: "[00:01.00]<00:01.00>Oh <00:01.30>I <00:01.70>believe<00:03.00>\n[00:04.00]in yesterday" };
  return query.title === "晴天" ? { source: "lrclib", lrc: LRC, durationMs: 269_000 } : null;
});

const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
const messages: string[] = [];
const root = createRoot(fixture);
const ONLINE = { lyricsFolder: "", lyricsOnline: true, lyricsOffsetMs: 0 };
let settingsOpened = 0;
const seeks: number[] = [];
const calibrations: number[] = [];

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
          onPlayPause={() => {}} onNext={() => {}} onPrevious={() => {}} onSeek={(positionMs) => seeks.push(positionMs)}
          onCalibrate={(positionMs) => calibrations.push(positionMs)} lyricsSettings={lyricsSettings} />
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
if (new URLSearchParams(location.search).get("view") === "diagnostic") {
  await render({ ...track("晴天", 6000), sourceApp: new URLSearchParams(location.search).get("player") === "netease" ? "cloudmusic.exe" : "QQMusic.exe", durationMs: 0, hasTimeline: false });
  results.remove();
} else if (new URLSearchParams(location.search).get("view") === "idle") {
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

  // Seeking: only when the player takes it (canSeek) and reports its own length.
  const hit = () => document.querySelector<HTMLElement>(".music-progress__hit")!;
  await render(track("晴天", 6000));
  check(hit().getAttribute("role") === "progressbar" && getComputedStyle(hit()).cursor !== "pointer" && !document.querySelector(".music-progress__knob"),
    "播放器不让跳转时进度条只读：没有手形光标和拖动圆点");
  await render({ ...track("晴天", 6000), canSeek: true });
  check(hit().getAttribute("role") === "slider" && getComputedStyle(hit()).cursor === "pointer" && document.querySelector(".music-progress__knob"),
    "播放器能跳转时进度条可以点、可以拖");
  const bar = hit().getBoundingClientRect();
  const pointer = (type: string, ratio: number) => act(async () => {
    hit().dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 7, clientX: bar.left + bar.width * ratio, clientY: bar.top + bar.height / 2 }));
  });
  seeks.length = 0;
  await pointer("pointerdown", 0.5);
  await pointer("pointermove", 0.75);
  check(times()[0] === "3:21" && document.querySelector(".music-progress--dragging") && document.querySelector(".music-progress--snap") && seeks.length === 0,
    "拖动时时间和填充跟着指针走，松手前不发跳转");
  await pointer("pointerup", 0.75);
  check(seeks.length === 1 && Math.abs(seeks[0] - 201_750) < 300 && !document.querySelector(".music-progress--dragging"), "松手时跳到指针所在的位置");
  await act(async () => { hit().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
  check(seeks[1] === 11_000, "键盘方向键前后跳 5 秒");
  await act(async () => document.querySelector<HTMLButtonElement>("button.lyrics-view__line--current")!.click());
  check(seeks[2] === 5000, "有时间线且可跳转时点歌词使用现有 seek");
  await render({ ...track("玻璃", 6000), durationMs: 0, canSeek: true }, { ...ONLINE, lyricsChinese: true } as typeof ONLINE);
  await settle(60);
  check(hit().getAttribute("role") === "progressbar", "时长借自歌词来源时不让跳转（播放器自己的时间线不可信）");

  await render({ ...track("电台", 0), durationMs: 0 });
  check(!document.querySelector(".music-progress"), "播放器和歌词都不知道时长时不显示进度条");
  await render({ ...track("玻璃", 60_000), durationMs: 0 }, { ...ONLINE, lyricsChinese: true } as typeof ONLINE);
  await settle(60);
  check(times().join("|") === "1:00|−3:00", "播放器不报告时长时，用歌词来源给的时长显示进度条");

  const untimed = { ...track("晴天", 6000), sourceApp: "cloudmusic.exe", hasTimeline: false, durationMs: 0, canSeek: true };
  await render(untimed);
  await settle(400);
  check(document.querySelector(".media-diag-card")?.textContent?.includes("网易云需要安装进度插件"), "无时间线的网易云显示插件提示");
  check(document.querySelector<HTMLAnchorElement>(".media-diag-actions a")?.href === "https://github.com/apoint123/inflink-rs", "插件提示链接到 InfLink-rs");
  const installButton = () => document.querySelector<HTMLButtonElement>(".media-diag-primary")!;
  check(installButton().textContent === "\u4e00\u952e\u542f\u7528", "plugin install is an explicit action");
  await act(async () => installButton().click());
  check(installButton().disabled && installButton().textContent?.includes("\u4e0b\u8f7d"), "pending installation disables action and shows download phase");
  await act(async () => failInstall!({ kind: "NeedsClose", detail: "cloudmusic.exe" }));
  check(document.querySelector(".media-diag-plugin [role=alert]")?.textContent?.includes("\u8bf7\u5148\u9000\u51fa") && !installButton().disabled, "NeedsClose shows exit instruction and retry");
  await act(async () => installButton().click());
  await act(async () => finishInstall!({ keptForeignLoader: false, preservedFiles: [] }));
  check(document.querySelector(".media-diag-plugin [role=status]")?.textContent?.includes("\u91cd\u542f"), "successful install asks to restart NetEase");
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button.lyrics-view__line--clickable")];
  check(buttons.length === 3 && buttons.every((button) => button.getAttribute("aria-label")?.startsWith("校准进度到")), "估算歌词每行可用键盘操作且有校准标签");
  await act(async () => buttons[0].click());
  check(calibrations[calibrations.length - 1] === 1000, "点击歌词按行时间校准本地秒表");
  check(fixture.scrollWidth <= fixture.clientWidth && box(".media-diag-card").bottom <= box(".lyrics-view").top &&
    box(".lyrics-view").bottom <= box(".music-progress").top && box(".music-player__controls").bottom <= box(".music-player").bottom + 1,
    "兼容性提示、歌词和进度条互不重叠，在面板内完整显示");
  fixture.style.width = "300px";
  check(fixture.scrollWidth <= fixture.clientWidth && box(".lyrics-view").bottom <= box(".music-progress").top, "300px 窄面板中的诊断卡片不撑宽也不遮挡歌词");
  fixture.style.width = "520px";
  await act(async () => document.querySelector<HTMLButtonElement>(".media-diag-dismiss")!.click());
  check(!document.querySelector(".media-diag-card"), "不再提示立即关闭诊断卡片");
  check(JSON.parse(localStorage.getItem("focusd-island-media-diagnostics-dismissed") ?? "[]").includes("cloudmusic.exe\u001fneteaseNeedsPlugin"), "按播放器和状态保存关闭记录");
  await render({ ...untimed, sourceApp: "QQMusic.exe" });
  check(document.querySelector(".media-diag-card")?.textContent?.includes("21.10.2962") && document.querySelector<HTMLAnchorElement>(".media-diag-actions a")?.href === "https://y.qq.com/download/", "旧 QQ 显示最低版本和官网链接，网易云关闭记录不影响它");
  await render({ ...untimed, sourceApp: "KuGou.exe" });
  check(document.querySelector(".media-diag-card")?.textContent?.includes("设置 → 常规设置 → 播放 → 支持系统播放控制"), "酷狗提示具体设置路径");
  await render({ ...untimed, sourceApp: "other.exe" });
  check(document.querySelector(".media-diag-card")?.textContent?.includes("可点歌词校准"), "其他无时间线播放器提示校准");
  await render({ ...untimed, sourceApp: "healthy.exe", hasTimeline: true });
  check(!document.querySelector(".media-diag-card"), "兼容状态正常时不显示卡片");
  await render({ ...untimed, title: "玻璃", sourceApp: "other.exe", positionMs: 1000 }, { ...ONLINE, lyricsChinese: true } as typeof ONLINE);
  check(document.querySelector(".music-progress--estimated") && document.querySelector<HTMLElement>(".music-progress")!.title.includes("进度为估算") && hit().getAttribute("role") === "progressbar", "估算进度降低透明度、说明校准方式且始终不可拖动");

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
