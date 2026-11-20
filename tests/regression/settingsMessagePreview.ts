import { act } from "react";

export async function checkMessagePreview(panel: Element, check: (value: unknown, text: string) => void) {
  const group = [...panel.querySelectorAll(".settings-group")].find(node => node.querySelector("h2")?.textContent === "岛上通知")!;
  const slider = group.querySelector<HTMLInputElement>("input[type=range]")!;
  check(slider.min === "3" && slider.max === "30" && slider.value === "5", "messages: preview duration defaults to five seconds within 3–30");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "10");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(JSON.parse(localStorage.getItem("fly-island-settings")!).messagePreviewSeconds === 10
    && group.querySelector("output")?.textContent === "10 秒", "messages: the slider persists ten seconds");
  await act(async () => group.querySelector<HTMLButtonElement>(".settings-slider__reset")!.click());
  check(slider.value === "5" && JSON.parse(localStorage.getItem("fly-island-settings")!).messagePreviewSeconds === 5,
    "messages: resetting restores five seconds");
  const toggle = group.querySelector<HTMLInputElement>("input[role=switch]")!;
  check(!toggle.checked && group.querySelectorAll("input[type=range]").length === 1, "adaptive notices default off with limits hidden");
  await act(async () => toggle.click());
  const limits = [...group.querySelectorAll<HTMLInputElement>("input[type=range]")].slice(1);
  check(limits.map((input) => input.value).join() === "520,180,12", "adaptive notice controls expose default maximum width, height and duration");
  check(JSON.parse(localStorage.getItem("fly-island-settings")!).messageAutoExpand, "adaptive notice switch persists");
  await act(async () => toggle.click());
}
