import { act } from "react";
import { setNativePluginInstalled } from "../../src/features/plugins/native";
import { setClockWeatherSettings } from "../../src/features/weather";

const SCALE = 0.92;
const MIN = 160;
const MAX = 280;

// The reported island: a two-character task, the waveform and the weather, with the lower limit
// at 160. Run with ?autoWidth=1 on the real island.
export async function checkIslandAutoWidth({ mount, unmount, settle, check }: {
  mount: () => void;
  unmount: () => void;
  settle: (ms: number) => Promise<void>;
  check: (condition: unknown, message: string) => void;
}) {
  const settingsKey = "fly-island-settings";
  const todosKey = "fly-island-todos";
  const todo = (title: string) => JSON.stringify([{ id: "auto", title, completed: false, createdAt: Date.now() }]);
  localStorage.setItem(todosKey, todo("阅读"));
  localStorage.setItem("fly-island-active-todo", "auto");
  localStorage.setItem(settingsKey, JSON.stringify({
    ...JSON.parse(localStorage.getItem(settingsKey)!),
    collapsedScale: SCALE, collapsedAutoWidth: true, collapsedAutoWidthMin: MIN, collapsedAutoWidthMax: MAX,
    collapsedHeight: 32, collapsedPadding: 15, collapsedPriority: ["todo", "lyrics", "agent"], lyricsOnline: false, lyricsChinese: false,
  }));
  setNativePluginInstalled("clockWeather", true);
  setClockWeatherSettings({ showClock: false, showWeather: true, location: { name: "Beijing · China", latitude: 39.9, longitude: 116.4 } });
  // React commits what happened during a wait only when the wait ends, and the width's transition
  // starts there: several short waits let a delayed narrowing both start and finish.
  const rest = async () => { for (let step = 0; step < 4; step++) await settle(450); };
  await act(async () => { mount(); });
  await rest();

  const island = () => document.querySelector<HTMLElement>(".island")!;
  const shown = () => island().getBoundingClientRect().width;
  const text = () => document.querySelector<HTMLElement>(".island__summary-layer:last-child .island__active-task");
  const parts = () => [...document.querySelectorAll<HTMLElement>(".island__collapsed > *")]
    .filter((node) => node.dataset.collapsedPresence !== "leaving")
    .map((node) => `${((node.classList.contains("island__status-slot") ? node.firstElementChild : node) as HTMLElement).classList[0]}:${node.offsetWidth}`).join(" ");
  const fits = () => {
    const box = island().getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>(".island__collapsed > *")].every((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width === 0 || (rect.left >= box.left + 8 && rect.right <= box.right - 8);
    });
  };
  check(text()?.textContent === "阅读" && document.querySelector(".music-wave-button") && document.querySelector(".collapsed-weather"),
    `收起岛显示两个字的待办、音乐波形和天气（${parts()}）`);
  check(Math.abs(shown() - MIN * SCALE) <= 4 * SCALE + 0.5, `短内容正好是最短长度 160 × 缩放（${shown().toFixed(1)}px；${parts()}）`);
  check(text()!.scrollWidth <= text()!.clientWidth && fits(), "最短长度下文字不省略，内容都在岛内");

  // Live: one more status slot, then none again. The width must come back, not stay where it was.
  await act(async () => setClockWeatherSettings({ showClock: true }));
  await rest();
  const withClock = shown();
  check(withClock > (MIN + 8) * SCALE && withClock < MAX * SCALE && fits(), `打开时间后按时间的宽度加长（${withClock.toFixed(1)}px；${parts()}）`);
  await act(async () => setClockWeatherSettings({ showClock: false }));
  await rest();
  check(Math.abs(shown() - MIN * SCALE) <= 4 * SCALE + 0.5, `关掉时间后回到最短长度（${shown().toFixed(1)}px；${parts()}）`);

  // The island only reads its todos when it starts, so each other title is a fresh start.
  const restart = async (title: string) => {
    await act(async () => { unmount(); });
    localStorage.setItem(todosKey, todo(title));
    await act(async () => { mount(); });
    await rest();
    check(text()?.textContent === title, `收起岛显示待办「${title}」`);
  };
  await restart("阅读两章设计心理学");
  const middle = shown();
  check(middle > (MIN + 8) * SCALE && middle < MAX * SCALE && text()!.scrollWidth <= text()!.clientWidth && fits(),
    `标题变长后岛按内容加长，文字完整（${middle.toFixed(1)}px）`);
  await restart("阅读两章设计心理学并整理笔记发给大家一起讨论一下下周的安排");
  check(Math.abs(shown() - MAX * SCALE) <= 4 * SCALE + 0.5 && fits(), `很长的标题停在最长长度（${shown().toFixed(1)}px）`);
}
