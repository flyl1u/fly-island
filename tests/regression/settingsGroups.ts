// settings.html: each page's groups (docs/design/settings.md, 2026-11-14 regrouping, 2026-11-18 tidy-up).
import { act } from "react";
import { MAIL_OTP_ENABLED } from "../../src/features/releaseFlags.ts";

const GROUPS: Record<string, string[]> = {
  general: ["启动与语言", "展开与收起", "贴边隐藏", "这些时候不贴边", "游戏模式", "位置"],
  appearance: ["主题", "颜色", "字体与大小", "岛上的排列", "岛屿展示优先级", "刘海尺寸", "圆角", "外观预设"],
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
    check(titles(rowsOf(panel, "贴边隐藏")).join() === "闲置时贴边隐藏,收起后贴边,贴边样式", "General: auto-tuck, its delay and the tucked look share a group");
    check(titles(rowsOf(panel, "位置")).join() === "回到默认位置,锁定小岛位置", "General: the position rows come last");
  } else if (category === "todos") {
    check(titles(rowsOf(panel, "任务")).join() === "自动将未完成任务写入下一天,拖动调整顺序", "Todos: the list options share a group");
    check(titles(rowsOf(panel, "番茄钟")).join() === "启用番茄钟", "Todos: the focus timer has its own group (reminders hidden while it is off)");
  } else if (category === "clipboard") {
    check(titles(rowsOf(panel, "记录内容")).join() === "记录图片,最多保存几条", "Clipboard: what is recorded comes first");
    check(titles(rowsOf(panel, "显示与窗口"))[0] === "一次显示几条", "Clipboard: how the list shows is its own group");
  } else {
    check(titles(rowsOf(panel, "主题")).join() === "配色,质感,不透明度", "Appearance: the theme group holds scheme, material and opacity");
    check(titles(rowsOf(panel, "字体与大小")).join() === "字体,岛屿字号,收起时的大小,展开后的大小", "Appearance: text and sizes share a group");
    check(titles(rowsOf(panel, "岛上的排列")).includes("页面按钮"), "Appearance: page buttons sit with the island's arrangement");
    check(titles(rowsOf(panel, "圆角")).join() === "展开圆角,收起圆角,圆角形状,贴边圆角", "Appearance: the open and collapsed corners, their shape and the top-edge curves share a group");
    const shape = () => rowsOf(panel, "刘海尺寸");
    check(titles(shape()).join() === "自动宽度,刘海高度", "Appearance: the notch size has its own group; manual width hidden while automatic");
    const auto = shape()[0].querySelector<HTMLInputElement>("[role='switch']")!;
    await act(async () => auto.click());
    const width = shape().find((row) => row.textContent?.includes("刘海宽度"));
    check(width?.classList.contains("settings-row--indent"), "Appearance: the manual width hangs indented under automatic width");
    await act(async () => auto.click());
  }
}
