import { act } from "react";

export async function checkKeepVisible(panel: Element, check: (condition: unknown, message: string) => void) {
  const group = () => [...panel.querySelectorAll(".settings-group")]
    .find((node) => node.querySelector("h2")?.textContent === "这些时候不贴边");
  const toggles = () => [...group()!.querySelectorAll<HTMLInputElement>("input[role=switch]")];
  check(toggles().length === 3 && toggles().every((toggle) => !toggle.checked), "general: three independent keep-visible switches default off");
  await act(async () => toggles()[1].click());
  const saved = JSON.parse(localStorage.getItem("focusd-island-settings")!);
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
