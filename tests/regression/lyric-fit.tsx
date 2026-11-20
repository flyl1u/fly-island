import "../../src/styles/tokens.css";
import "../../src/windows/island/IslandShell.css";
import "../../src/windows/island/IslandCollapsedBar.css";
import { act, StrictMode, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { IslandCollapsedBar } from "../../src/windows/island/IslandCollapsedBar";
import type { MailController } from "../../src/features/messages/mail/MailPanel";
import type { QQNotificationsController } from "../../src/features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../src/features/messages/wechat/WeChatReminders";
import type { MediaState } from "../../src/features/media/api";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { getCollapsedIslandWidth, MAX_COLLAPSED_ISLAND_WIDTH } from "../../src/windows/island/layout";

const preview = new URLSearchParams(location.search).has("preview");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: !preview });
// The lyric's ResizeObserver, counted per element so a self-triggering loop shows up.
const observerCalls = new Map<Element, number>();
const NativeResizeObserver = window.ResizeObserver;
window.ResizeObserver = class extends NativeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    super((entries, observer) => {
      for (const entry of entries) {
        observerCalls.set(entry.target, (observerCalls.get(entry.target) ?? 0) + 1);
      }
      callback(entries, observer);
    });
  }
};
const root = createRoot(document.getElementById("fixture")!);
const results = document.getElementById("results")!;
const passed: string[] = [];

// Chinese lyric lines of 12, 20 and 40 characters.
const line = (count: number) => "词".repeat(count);
const cases = [
  { id: "short", text: line(12) },
  { id: "mid", text: line(20) },
  { id: "long", text: line(40) },
  // The same line, shorter: switching to it must clear the shrink the long one needed.
  { id: "shorter", text: line(6) },
];
mockIPC((command, payload) => {
  if (command !== "get_lyrics") return null;
  const query = (payload as { query: Record<string, unknown> }).query;
  const found = cases.find((item) => item.id === query.trackId);
  return { source: "qqmusic", lrc: `[00:01.00]${found?.text ?? ""}` };
});
const base: MediaState = { ...DEFAULT_MEDIA_STATE, title: "长歌词", artist: "歌手", available: true,
  sourceApp: "QQMusic.exe", playbackStatus: "paused", positionMs: 2000, durationMs: 60_000, updatedAt: Date.now() };
// The collapsed bar only reads the preview of the mail; the rest it uses in its handlers.
const qqMail = { preview: null } as unknown as MailController;
const qqNotifications = {} as unknown as QQNotificationsController;
const wechatReminders = {} as unknown as WeChatRemindersController;

function check(ok: unknown, label: string) {
  if (!ok) throw new Error(label);
  passed.push(`PASS ${label}`);
}

/** The real collapsed bar, so the line has the same room it has in the island. */
function Bar({ width, trackId }: { width: number; trackId: string }) {
  return (
    <div style={{ position: "relative", height: "38px", "--collapsed-island-width": `${width}px` } as CSSProperties}>
      <IslandCollapsedBar qqMail={qqMail} qqNotifications={qqNotifications} wechatReminders={wechatReminders}
        preview={null} page="todo" isExpanded={false} isTucked={false} positionLocked={false}
        showTitle={false} showCollapsedText collapsedLabel="fly-island" collapsedTaskTitle={null}
        collapsedTodoCount={null} collapsedItem="lyrics" collapsedLayout={["text", "mail", "shelf", "music", "agents"]}
        collapsedCover={null} lyricsSettings={{ lyricsFolder: "", lyricsOnline: true, lyricsChinese: true, lyricWordFill: false, lyricsOffsetMs: 0 }}
        agentSession={null} agentSessionCount={null}
        mediaState={{ ...base, trackId, updatedAt: Date.now() }} showMusic shelfCount={null}
        agentVisualState="idle"
        onOpenPage={() => {}} onOpenMessages={() => {}} onWindowDragStart={() => {}} onTuck={() => {}} />
    </div>
  );
}

function Fixture() {
  const [scale, setScale] = useState(1);
  const [trackId, setTrackId] = useState("long");
  const [narrow, setNarrow] = useState(false);
  changeScale = setScale;
  changeTrack = setTrackId;
  changeNarrow = setNarrow;
  return (
    <div style={{ "--island-font-scale": scale } as CSSProperties}>
      {cases.slice(0, 3).map((item) => (
        <Bar key={item.id} width={widthOf(item.text, scale, narrow)} trackId={item.id} />
      ))}
      {/* The line that changes between a long and a short one, in the same element. */}
      <Bar width={widthOf(cases[2].text, scale, narrow)} trackId={trackId} />
    </div>
  );
}

/** The island's width follows the line; a narrow one leaves the line less room. */
const widthOf = (text: string, scale: number, narrow: boolean) =>
  narrow ? 340 : getCollapsedIslandWidth(text, 0, scale, MAX_COLLAPSED_ISLAND_WIDTH);
let changeScale: (scale: number) => void = () => {};
let changeNarrow: (narrow: boolean) => void = () => {};
let changeTrack: (trackId: string) => void = () => {};
const lyricOf = (index: number) => document.querySelectorAll<HTMLElement>(".collapsed-lyric")[index];
const fitOf = (element: HTMLElement) => element.style.getPropertyValue("--lyric-fit");
/** Two frames: the browser hands the size change to the ResizeObserver before the next paint. */
const frames = () => act(async () => {
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
});
async function waitFor(condition: () => boolean, label: string, timeout = 3000) {
  const deadline = performance.now() + timeout;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`等待超时：${label}`);
    await frames();
  }
}
/** How often the lyric's observer ran for this element. */
const callsOf = (element: HTMLElement) => observerCalls.get(element) ?? 0;

if (preview) {
  results.remove();
} else try {
  await act(async () => {
    root.render(<StrictMode><Fixture /></StrictMode>);
  });
  await waitFor(() => lyricOf(2).textContent !== "", "歌词加载");
  const widths = cases.map((item) => getCollapsedIslandWidth(item.text, 0, 1, MAX_COLLAPSED_ISLAND_WIDTH));
  check(widths[2] === MAX_COLLAPSED_ISLAND_WIDTH, `超长歌词把岛拉到设置允许的上限（${widths[2]}px）`);
  cases.slice(0, 3).forEach((item, index) => {
    const lyric = lyricOf(index);
    check(lyric.scrollWidth <= lyric.clientWidth,
      `${item.text.length} 字的中文歌词完整显示（scroll ${lyric.scrollWidth} / client ${lyric.clientWidth}）`);
  });
  const fontSize = Number.parseFloat(getComputedStyle(lyricOf(2)).fontSize);
  check(fontSize >= 9, `超长歌词缩到 ${fontSize.toFixed(1)}px，仍读得清`);
  // The island's font size (Settings → Appearance) changes the room the line has.
  const longLyric = lyricOf(2);
  const fitAtDefault = Number(fitOf(longLyric));
  const fontAtDefault = Number.parseFloat(getComputedStyle(longLyric).fontSize);
  // 120% → 100%: the fit has to grow back, not stay at the smaller one it had.
  await act(async () => changeScale(1.2));
  await waitFor(() => Number(fitOf(longLyric)) !== fitAtDefault, "字号调到 120% 后重新缩放");
  const fitAt120 = Number(fitOf(longLyric));
  await act(async () => changeScale(1));
  await waitFor(() => Number(fitOf(longLyric)) > fitAt120, "字号调回 100% 后缩放涨回去");
  check(Number(fitOf(longLyric)) > fitAt120, `字号调回 100% 后缩放涨回去（${fitAt120} → ${fitOf(longLyric)}）`);
  check(Math.abs(Number(fitOf(longLyric)) - fitAtDefault) < 0.02,
    `字号调回 100% 后缩放回到原来的值（${fitAtDefault} → ${fitOf(longLyric)}）`);
  check(Math.abs(Number.parseFloat(getComputedStyle(longLyric).fontSize) - fontAtDefault) < 0.2,
    `字号调回 100% 后歌词字号恢复正常（${fontAtDefault}px → ${getComputedStyle(longLyric).fontSize}）`);
  // The smallest font size the settings allow (90%): the lyric stays readable.
  await act(async () => changeScale(0.9));
  await waitFor(() => Number(fitOf(longLyric)) !== fitAtDefault, "字号调到 90% 后重新缩放");
  check(Number.parseFloat(getComputedStyle(longLyric).fontSize) >= 9,
    `字号调到 90% 后长歌词仍读得清（${getComputedStyle(longLyric).fontSize}）`);
  // Too little room at 90%: the font stops at its floor, and the floor follows the island's size.
  await act(async () => changeNarrow(true));
  await waitFor(() => Number(fitOf(longLyric)) !== Number(fitAtDefault), "岛变窄后重新缩放");
  const fontAtNarrow90 = Number.parseFloat(getComputedStyle(longLyric).fontSize);
  check(fontAtNarrow90 >= 9.05, `字号 90% 且岛变窄时字号不低于可读下限（${fontAtNarrow90}px）`);
  await act(async () => changeNarrow(false));
  await act(async () => changeScale(1));
  await frames();
  // The font size up to 150%: the line keeps fitting the room it has.
  const fitBefore = fitOf(longLyric);
  await act(async () => changeScale(1.5));
  await waitFor(() => fitOf(longLyric) !== fitBefore, "字号调大后重新缩放");
  check(fitOf(longLyric) !== fitBefore, `字号调大后重新缩放（${fitBefore} → ${fitOf(longLyric)}）`);
  check(longLyric.scrollWidth <= longLyric.clientWidth,
    `字号调到 150% 后长歌词仍完整显示（scroll ${longLyric.scrollWidth} / client ${longLyric.clientWidth}）`);
  check(Number.parseFloat(getComputedStyle(longLyric).fontSize) >= 9, `字号调大后仍读得清（${getComputedStyle(longLyric).fontSize}）`);
  // A narrower island leaves the line less room.
  const fitBeforeNarrow = fitOf(longLyric);
  await act(async () => changeNarrow(true));
  await waitFor(() => fitOf(longLyric) !== fitBeforeNarrow, "岛变窄后重新缩放");
  check(Number(fitOf(longLyric)) < Number(fitBeforeNarrow),
    `岛变窄后重新缩放（${fitBeforeNarrow} → ${fitOf(longLyric)}）`);
  // Too little room for the whole line: the font stops at its floor and the line keeps its ellipsis.
  check(Number.parseFloat(getComputedStyle(longLyric).fontSize) >= 9,
    `岛变窄后字号不低于可读下限（${getComputedStyle(longLyric).fontSize}）`);
  await act(async () => changeNarrow(false));
  await frames();
  // A short line takes the shrink of the long one with it.
  const changing = lyricOf(3);
  check(Number(fitOf(changing)) < 1, `长歌词先被缩小（${fitOf(changing)}）`);
  await act(async () => changeTrack("shorter"));
  await waitFor(() => fitOf(changing) === "1", "换成短歌词后缩放复位");
  check(fitOf(changing) === "1", `换成短歌词后缩放复位（${fitOf(changing)}）`);
  // The observer settles: no self-triggering loop, and the fit does not drift.
  let settled = 0;
  let lastCalls = callsOf(changing);
  const deadline = performance.now() + 3000;
  while (settled < 3 && performance.now() < deadline) {
    await frames();
    if (callsOf(changing) === lastCalls) settled += 1;
    else { settled = 0; lastCalls = callsOf(changing); }
  }
  check(settled >= 3, `缩放稳定后观察回调收敛（停在 ${lastCalls} 次）`);
  check(fitOf(changing) === "1", `稳定后缩放没有漂移（${fitOf(changing)}）`);
  results.dataset.result = "passed";
  results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed";
  results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
} finally {
  if (!preview) await act(async () => root.unmount());
}
