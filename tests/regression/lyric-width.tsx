import "../../src/styles/tokens.css";
import "../../src/windows/island/IslandShell.css";
import "../../src/windows/island/IslandCollapsedBar.css";
import { act, StrictMode, type CSSProperties } from "react";
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
  return (
    <div>
      {cases.map((item) => (
        <Bar key={item.id} width={getCollapsedIslandWidth(item.text, 0, 1, MAX_COLLAPSED_ISLAND_WIDTH)} trackId={item.id} />
      ))}
    </div>
  );
}

const lyricOf = (index: number) => document.querySelectorAll<HTMLElement>(".collapsed-lyric")[index];
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

if (preview) {
  results.remove();
} else try {
  await act(async () => {
    root.render(<StrictMode><Fixture /></StrictMode>);
  });
  await waitFor(() => lyricOf(2).textContent !== "", "歌词加载");

  // The width follows the line in front of it: a short line keeps the island small, a long one
  // widens it, and nothing goes past the width the settings allow.
  const widths = cases.map((item) => getCollapsedIslandWidth(item.text, 0, 1, MAX_COLLAPSED_ISLAND_WIDTH));
  check(widths[0] < widths[1] && widths[1] < widths[2],
    `岛的宽度跟着当前歌词变（${widths[0]} → ${widths[1]} → ${widths[2]}）`);
  check(widths[2] === MAX_COLLAPSED_ISLAND_WIDTH, `超长歌词把岛拉到设置允许的上限（${widths[2]}px）`);

  // A line that fits the island it asked for is shown whole.
  const shortLyric = lyricOf(0);
  check(shortLyric.scrollWidth <= shortLyric.clientWidth,
    `短歌词完整显示（scroll ${shortLyric.scrollWidth} / client ${shortLyric.clientWidth}）`);

  // Past the widest the island may be, the line keeps its ellipsis instead of being squeezed.
  const longLyric = lyricOf(2);
  check(longLyric.scrollWidth > longLyric.clientWidth,
    `到上限后仍放不下的歌词被省略（scroll ${longLyric.scrollWidth} / client ${longLyric.clientWidth}）`);
  const fontSize = Number.parseFloat(getComputedStyle(longLyric).fontSize);
  check(Math.abs(fontSize - 13) < 0.2, `歌词字号不被缩小（${fontSize}px）`);

  results.dataset.result = "passed";
  results.textContent = passed.join("\n");
} catch (error) {
  results.dataset.result = "failed";
  results.textContent = `${passed.join("\n")}\nFAIL ${String(error)}`;
} finally {
  if (!preview) await act(async () => root.unmount());
}
