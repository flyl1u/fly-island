// General page: numeric delays and keep-visible choices (the tucked look is under appearance).
import { act } from "react";
import { checkKeepVisible } from "./settingsKeepVisible";

export async function checkGeneralControls(
  panel: HTMLElement,
  check: (condition: unknown, message: string) => void,
  type: (input: HTMLInputElement, value: string) => Promise<void>,
) {
  await checkKeepVisible(panel, check);
  const timers = [...panel.querySelectorAll<HTMLInputElement>("input[role='spinbutton'][aria-valuemax='600']")];
  const labels = timers.map((input) => panel.querySelector(`label[for='${CSS.escape(input.id)}']`)?.textContent ?? "");
  check(timers.length === 2 && timers.every((input) => input.value === "30"),
    `general: the collapse and tuck delays are two number fields at 30 s (${timers.map((input) => input.value).join(", ")})`);
  check(labels.length === 2 && labels.every(Boolean) && labels[0] !== labels[1], `general: the two delays have different labels (${labels.join(" / ")})`);
  const first = timers[0];
  const plus = first.parentElement!.querySelector<HTMLButtonElement>("button:last-child")!;
  await act(async () => plus.click());
  check(first.value === "31" && JSON.parse(localStorage.getItem("fly-island-settings")!).autoCollapseSeconds === 31, "Plus increments by 1 and saves");
  await type(first, "9999");
  await act(async () => { first.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  check(first.value === "600" && plus.disabled, `Blur clamps to max and disables Plus (${first.value}, ${plus.disabled}, connected=${first.isConnected})`);
  await type(first, "30");
  await act(async () => { first.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  check(!panel.querySelector("[role='group'][aria-label='贴边样式']"), "general: the tucked look is on the appearance page, not here");
}
