// settings.html: each page's groups (docs/design/settings.md, 2026-11-14 regrouping, 2026-11-18 tidy-up,
// 2026-11-19 appearance grouped by the part of the island).
import { act } from "react";
import { MAIL_OTP_ENABLED } from "../../src/features/releaseFlags.ts";

const GROUPS: Record<string, string[]> = {
  general: ["启动与语言", "展开与收起", "位置", "贴边隐藏", "游戏模式"],
  appearance: ["主题", "颜色", "文字", "收起时", "收起时的排列", "收起时优先显示", "展开后", "屏幕顶端", "外观预设"],
  todos: ["任务", "番茄钟", "折叠岛屿", "保存路径"],
  clipboard: ["记录内容", "显示与窗口", "快捷键", "存储位置", "文件中转"],
};

/** Row titles of the group with this title. */
const rowsOf = (panel: HTMLElement, title: string) => {
  const group = [...panel.querySelectorAll<HTMLElement>(".settings-group")].find((item) => item.querySelector(".settings-group__title")?.textContent === title);
  return [...group?.querySelectorAll<HTMLElement>(".settings-row") ?? []];
};
const titles = (rows: HTMLElement[]) => rows.map((row) => row.querySelector(".settings-row__title")?.textContent ?? "");

export async function checkGroups(category: string, panel: HTMLElement, check: (condition: unknown, message: string) => void) {
  if (category === "messages") {
    const row = [...panel.querySelectorAll<HTMLElement>(".settings-row")].find(row => row.querySelector(".settings-row__title")?.textContent === "自动复制验证码");
    const toggle = row?.querySelector<HTMLInputElement>("input[role='switch']");
    if (MAIL_OTP_ENABLED) {
      check(toggle?.checked, "Mail: verification codes are copied by default");
      await act(async () => toggle!.click());
      check(JSON.parse(localStorage.getItem("focusd-island-settings")!).autoCopyOtp === false, "Mail: turning automatic code copying off is saved");
      await act(async () => toggle!.click());
    } else {
      check(!row, "Mail: verification-code settings are hidden without changing saved preferences");
    }
  }
  const expected = GROUPS[category];
  if (!expected) return;
  const shown = [...panel.querySelectorAll<HTMLElement>(".settings-group__title")].map((title) => title.textContent);
  check(shown.join("|") === expected.join("|"), `${category}: groups in order (${shown.join(" / ")})`);
  if (category === "general") {
    check(titles(rowsOf(panel, "展开与收起")).join() === "展开方式,展开后自动收起,Ctrl + 滚轮切换页面", "General: opening, auto-collapse and Ctrl + wheel share a group");
    const game = () => rowsOf(panel, "游戏模式");
    check(titles(game()).join() === "全屏时免打扰,仍显示通知", "General: game mode has its own group, its notifications indented under it");
    check(game()[1]?.classList.contains("settings-row--indent"), "General: game-mode notifications hang indented under game mode");
    const quiet = game()[0].querySelector<HTMLInputElement>("[role='switch']")!;
    await act(async () => quiet.click());
    check(game().length === 1, "General: game-mode notifications hide while game mode is off");
    await act(async () => quiet.click());
    const tuck = rowsOf(panel, "贴边隐藏");
    check(titles(tuck).join() === "闲置时贴边隐藏,收起后贴边,Agent 运行时不贴边,显示歌词时不贴边,待办计时时不贴边"
      && tuck.slice(1).every((row) => row.classList.contains("settings-row--indent")), "General: auto-tuck with its delay and when not to tuck, all indented under it");
    check(titles(rowsOf(panel, "位置")).join() === "回到默认位置,锁定小岛位置", "General: the position rows come last");
  } else if (category === "todos") {
    check(titles(rowsOf(panel, "任务")).join() === "自动将未完成任务写入下一天,拖动调整顺序,一次显示几条", "Todos: the list options share a group");
    check(titles(rowsOf(panel, "番茄钟")).join() === "启用番茄钟", "Todos: the focus timer has its own group (reminders hidden while it is off)");
  } else if (category === "clipboard") {
    check(titles(rowsOf(panel, "记录内容")).join() === "记录图片,最多保存几条", "Clipboard: what is recorded comes first");
    check(titles(rowsOf(panel, "显示与窗口"))[0] === "一次显示几条", "Clipboard: how the list shows is its own group");
  } else {
    check(titles(rowsOf(panel, "主题")).join() === "配色,质感,不透明度,圆角形状", "Appearance: the theme holds scheme, material, opacity and the corner shape");
    check(titles(rowsOf(panel, "文字")).join() === "字体,字号", "Appearance: the text group holds the font and its size");
    check(titles(rowsOf(panel, "展开后")).join() === "整体大小,圆角,页面按钮", "Appearance: the open island's size, corners and page buttons share a group");
    // The island shape row joins the theme group once the capsule ships (islandShape.ts).
    const collapsed = () => rowsOf(panel, "收起时");
    check(titles(collapsed()).join() === "整体大小,自动宽度,高度,圆角", "Appearance: the collapsed bar's size and corners share a group; manual width hidden while automatic");
    const auto = collapsed()[1].querySelector<HTMLInputElement>("[role='switch']")!;
    await act(async () => auto.click());
    const width = collapsed().find((row) => row.querySelector(".settings-row__title")?.textContent === "宽度");
    check(width?.classList.contains("settings-row--indent"), "Appearance: the manual width hangs indented under automatic width");
    await act(async () => auto.click());
    const top = () => rowsOf(panel, "屏幕顶端");
    check(titles(top()).join() === "贴顶圆角,贴边隐藏后", "Appearance: the top edge curves and the tucked look share the top-of-screen group");
    const looks = () => [...panel.querySelectorAll<HTMLButtonElement>("[role='group'][aria-label='贴边隐藏后'] button")];
    check(looks().map((button) => button.textContent).join() === "露边,细线,隐藏" && looks()[1].getAttribute("aria-pressed") === "true", "Appearance: the tucked look offers edge, line and hidden, line by default");
    localStorage.removeItem("focusd-island-panel-preview");
    await act(async () => looks()[1].click());
    check(JSON.parse(localStorage.getItem("focusd-island-settings")!).tuckStyle === "line"
      && JSON.parse(localStorage.getItem("focusd-island-panel-preview")!).mode === "tucked", "Choosing even the current tucked look saves it and shows the island tucked");
    await act(async () => looks()[0].click());
    check(titles(top()).join() === "贴顶圆角,贴边隐藏后,露出高度" && top()[2].classList.contains("settings-row--indent"), "Appearance: the edge look reveals its height, indented");
    await act(async () => looks()[1].click());
  }
}
