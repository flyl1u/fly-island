// settings.html: the General and Appearance pages' groups (docs/design/settings.md, 2026-11-14 regrouping).
import { act } from "react";

const GROUPS: Record<string, string[]> = {
  general: ["启动与语言", "展开与收起", "贴边隐藏", "这些时候不贴边", "位置"],
  appearance: ["主题", "颜色", "字体与大小", "岛上的排列", "岛屿展示优先级", "刘海与外形"],
};

/** Row titles of the group with this title. */
const rowsOf = (panel: HTMLElement, title: string) => {
  const group = [...panel.querySelectorAll<HTMLElement>(".settings-group")].find((item) => item.querySelector(".settings-group__title")?.textContent === title);
  return [...group?.querySelectorAll<HTMLElement>(".settings-row") ?? []];
};
const titles = (rows: HTMLElement[]) => rows.map((row) => row.querySelector(".settings-row__title")?.textContent ?? "");

export async function checkGroups(category: string, panel: HTMLElement, check: (condition: unknown, message: string) => void) {
  const expected = GROUPS[category];
  if (!expected) return;
  const shown = [...panel.querySelectorAll<HTMLElement>(".settings-group__title")].map((title) => title.textContent);
  check(shown.join("|") === expected.join("|"), `${category}: groups in order (${shown.join(" / ")})`);
  if (category === "general") {
    check(titles(rowsOf(panel, "展开与收起")).join() === "展开方式,展开后自动收起,游戏模式", "General: opening, auto-collapse and game mode share a group");
    check(titles(rowsOf(panel, "贴边隐藏")).join() === "闲置时贴边隐藏,收起后贴边,贴边样式", "General: auto-tuck, its delay and the tucked look share a group");
    check(titles(rowsOf(panel, "位置")).join() === "回到默认位置,锁定小岛位置", "General: the position rows come last");
  } else {
    check(titles(rowsOf(panel, "主题")).join() === "配色,质感,不透明度", "Appearance: the theme group holds scheme, material and opacity");
    check(titles(rowsOf(panel, "字体与大小")).join() === "字体,岛屿字号,收起时的大小,展开后的大小", "Appearance: text and sizes share a group");
    check(titles(rowsOf(panel, "岛上的排列")).includes("页面按钮"), "Appearance: page buttons sit with the island's arrangement");
    const shape = () => rowsOf(panel, "刘海与外形");
    check(titles(shape()).join() === "自动宽度,刘海高度,贴边圆角", "Appearance: the notch and curves come last, manual width hidden while automatic");
    const auto = shape()[0].querySelector<HTMLInputElement>("[role='switch']")!;
    await act(async () => auto.click());
    const width = shape().find((row) => row.textContent?.includes("刘海宽度"));
    check(width?.classList.contains("settings-row--indent"), "Appearance: the manual width hangs indented under automatic width");
    await act(async () => auto.click());
  }
}
