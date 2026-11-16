// General page: numeric delays, keep-visible choices and tucked-look controls.
import { act } from "react";
import { checkKeepVisible } from "./settingsKeepVisible";

export async function checkGeneralControls(
  panel: HTMLElement,
  check: (condition: unknown, message: string) => void,
  type: (input: HTMLInputElement, value: string) => Promise<void>,
) {
  await checkKeepVisible(panel, check);
  const timers = [...panel.querySelectorAll<HTMLInputElement>("input[role='spinbutton']")];
  const labels = timers.map((input) => panel.querySelector(`label[for='${CSS.escape(input.id)}']`)?.textContent ?? "");
  check(timers.length === 2 && timers.every((input) => input.value === "30"),
    `general: the collapse and tuck delays are two number fields at 30 s (${timers.map((input) => input.value).join(", ")})`);
  check(labels.length === 2 && labels.every(Boolean) && labels[0] !== labels[1], `general: the two delays have different labels (${labels.join(" / ")})`);
  const first = timers[0];
  const plus = first.parentElement!.querySelector<HTMLButtonElement>("button:last-child")!;
  await act(async () => plus.click());
  check(first.value === "31" && JSON.parse(localStorage.getItem("focusd-island-settings")!).autoCollapseSeconds === 31, "Plus increments by 1 and saves");
  await type(first, "9999");
  await act(async () => { first.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  check(first.value === "600" && plus.disabled, `Blur clamps to max and disables Plus (${first.value}, ${plus.disabled}, connected=${first.isConnected})`);
  await type(first, "30");
  await act(async () => { first.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  const tuckLooks = [...panel.querySelectorAll<HTMLButtonElement>("[role='group'][aria-label='贴边样式'] button")];
  check(tuckLooks.map((button) => button.textContent).join() === "露边,细线,隐藏" && tuckLooks[1].getAttribute("aria-pressed") === "true", "general: the tucked look offers edge, line and hidden, line by default");
  await act(async () => tuckLooks[1].click());
  check(JSON.parse(localStorage.getItem("focusd-island-settings")!).tuckStyle === "line", "Choosing the line look saves it");
  check(JSON.parse(localStorage.getItem("focusd-island-panel-preview")!).mode === "tucked", "Choosing even the current tuck style requests an immediate tucked preview");
  await act(async () => tuckLooks[0].click());
}
