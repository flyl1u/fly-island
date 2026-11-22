// settings.html: each page's groups (docs/design/settings.md, 2026-11-14 regrouping, 2026-11-18 tidy-up,
// 2026-11-19 appearance: one kind of setting per group, every corner in one).
import { act } from "react";
import { MAIL_OTP_ENABLED } from "../../src/features/releaseFlags.ts";

const GROUPS: Record<string, string[]> = {
  general: ["启动与语言", "展开与收起", "位置", "贴边隐藏", "游戏模式", "备份与迁移"],
  appearance: ["主题", "颜色", "文字", "大小", "圆角", "岛上的排列", "岛屿展示优先级", "贴边隐藏", "外观预设"],
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
      check(JSON.parse(localStorage.getItem("fly-island-settings")!).autoCopyOtp === false, "Mail: turning automatic code copying off is saved");
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
    check(titles(tuck).join() === "闲置时贴边隐藏,浏览器打开时自动贴边,鼠标停留后展开,点击贴边岛屿展开,收起后贴边,Agent 运行时不贴边,显示歌词时不贴边,待办计时时不贴边"
      && !tuck[1]?.classList.contains("settings-row--indent")
      && tuck[2]?.classList.contains("settings-row--indent")
      && tuck.slice(3).every((row) => row.classList.contains("settings-row--indent")), "General: browser-tucked dwell and click-to-open stay under the browser setting");
    const slider = tuck[2].querySelector<HTMLInputElement>("input[type='range']")!;
    const number = tuck[2].querySelector<HTMLInputElement>("[role='spinbutton']")!;
    check(slider.min === "0" && slider.max === "10" && slider.step === "0.01"
      && number.value === "2.50" && tuck[2].querySelectorAll(".number-stepper__button").length === 2,
      "General: browser dwell has a hundredth-second slider and number stepper");
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => number.focus());
    await act(async () => { setInput.call(number, "3.47"); number.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => number.blur());
    const savedDelay = JSON.parse(localStorage.getItem("fly-island-settings")!).browserAutoTuckDelaySeconds;
    check(number.value === "3.47", `General: typed dwell is committed to the number field (${number.value})`);
    check(slider.value === "3.47", `General: typed dwell updates the slider (${slider.value})`);
    check(savedDelay === 3.47, `General: typed dwell is saved (${savedDelay})`);
    const reset = tuck[2].querySelector<HTMLButtonElement>(".settings-slider__reset")!;
    await act(async () => reset.click());
    const clickToOpen = tuck[3].querySelector<HTMLInputElement>("[role='switch']")!;
    await act(async () => clickToOpen.click());
    check(slider.disabled && number.disabled
      && JSON.parse(localStorage.getItem("fly-island-settings")!).browserAutoTuckClickToOpen === true,
      "General: click-to-open saves on and disables the dwell controls");
    await act(async () => clickToOpen.click());
    check(titles(rowsOf(panel, "位置")).join() === "回到默认位置,锁定小岛位置", "General: the position rows come last");
  } else if (category === "todos") {
    check(titles(rowsOf(panel, "任务")).join() === "自动将未完成任务写入下一天,拖动调整顺序,一次显示几条", "Todos: the list options share a group");
    check(titles(rowsOf(panel, "番茄钟")).join() === "启用番茄钟", "Todos: the focus timer has its own group (reminders hidden while it is off)");
  } else if (category === "clipboard") {
    check(titles(rowsOf(panel, "记录内容")).join() === "记录图片,最多保存几条", "Clipboard: what is recorded comes first");
    check(titles(rowsOf(panel, "显示与窗口"))[0] === "一次显示几条", "Clipboard: how the list shows is its own group");
  } else {
    check(titles(rowsOf(panel, "主题")).join() === "配色,质感,不透明度", "Appearance: the theme holds scheme, material and opacity");
    check(titles(rowsOf(panel, "文字")).join() === "字体,字号", "Appearance: the text group holds the font and its size");
    // The island shape row joins the front of the corners group once the capsule ships (islandShape.ts).
    check(titles(rowsOf(panel, "圆角")).join() === "展开圆角,收起圆角,圆角形状,贴边圆角", "Appearance: every corner setting is in one group");
    check(titles(rowsOf(panel, "岛上的排列")).includes("页面按钮"), "Appearance: page buttons sit with the island's arrangement");
    const size = () => rowsOf(panel, "大小");
    check(titles(size()).join() === "收起时的大小,展开后的大小,自动宽度,高度,两侧留白", "Appearance: every size is in one group; manual width hidden while automatic");
    const auto = size()[2].querySelector<HTMLInputElement>("[role='switch']")!;
    await act(async () => auto.click());
    const width = size().find((row) => row.querySelector(".settings-row__title")?.textContent === "宽度");
    check(width?.classList.contains("settings-row--indent"), "Appearance: the manual width hangs indented under automatic width");
    await act(async () => auto.click());
    const tuck = () => rowsOf(panel, "贴边隐藏");
    const looks = () => [...panel.querySelectorAll<HTMLButtonElement>("[role='group'][aria-label='贴边样式'] button")];
    check(titles(tuck()).join() === "贴边样式" && looks().map((button) => button.textContent).join() === "露边,细线,隐藏" && looks()[1].getAttribute("aria-pressed") === "true",
      "Appearance: the tucked look has its own group, edge, line and hidden, line by default");
    localStorage.removeItem("fly-island-panel-preview");
    await act(async () => looks()[1].click());
    check(JSON.parse(localStorage.getItem("fly-island-settings")!).tuckStyle === "line"
      && JSON.parse(localStorage.getItem("fly-island-panel-preview")!).mode === "tucked", "Choosing even the current tucked look saves it and shows the island tucked");
    await act(async () => looks()[0].click());
    check(titles(tuck()).join() === "贴边样式,露出高度" && tuck()[1].classList.contains("settings-row--indent"), "Appearance: the edge look reveals its height, indented");
    await act(async () => looks()[1].click());
  }
}
