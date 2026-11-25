import { act } from "react";

export async function checkKeepVisible(panel: Element, check: (condition: unknown, message: string) => void) {
  // Indented under "tuck when idle" in the tuck group (2026-11-18 tidy-up), shown only while it is on.
  const titles = ["Agent 运行时不贴边", "播放音乐时不贴边", "待办计时时不贴边"];
  const keepRows = () => [...panel.querySelectorAll<HTMLInputElement>("input[role=switch]")]
    .filter((input) => titles.includes(input.labels?.[0]?.textContent ?? ""));
  const group = () => keepRows().length > 0 || null;
  const toggles = keepRows;
  check(toggles().length === 3 && toggles().every((toggle) => !toggle.checked), "general: three independent keep-visible switches default off");
  await act(async () => toggles()[1].click());
  const saved = JSON.parse(localStorage.getItem("fly-island-settings")!);
  check(saved.keepVisibleWhileLyrics && !saved.keepVisibleWhileAgentRunning && !saved.keepVisibleWhileTodoRunning,
    "general: lyrics switch saves without enabling the other activities");
  const autoTuck = [...panel.querySelectorAll<HTMLInputElement>("input[role=switch]")]
    .find((input) => input.labels?.[0]?.textContent === "闲置时贴边隐藏")!;
  check(autoTuck, "general: auto-tuck dependency exists");
  await act(async () => autoTuck.click());
  check(!group(), "general: the keep-visible group hides when auto-tuck is off");
  await act(async () => autoTuck.click());
  check(toggles()[1].checked, "general: toggling auto-tuck preserves the activity choices");
}
