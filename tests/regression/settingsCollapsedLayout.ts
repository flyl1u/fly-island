import { act } from "react";

export async function checkCollapsedLayout(check: (condition: unknown, message: string) => void) {
  const island = document.querySelector<HTMLElement>(".collapsed-layout__island")!;
  const preview = document.querySelector<HTMLElement>("figure.island-preview")!;
  const editor = island.parentElement!;
  for (const name of ["--preview-fill", "--preview-text", "--preview-corner-shape", "--preview-radius-collapsed-px", "--preview-font-scale", "--preview-collapsed-scale"]) {
    check(getComputedStyle(editor).getPropertyValue(name) === getComputedStyle(preview).getPropertyValue(name),
      `Layout editor shares the appearance drawing's ${name}`);
  }
  const pluginSlots = island.querySelectorAll(".collapsed-layout__slot--clock, .collapsed-layout__slot--weather");
  check(pluginSlots.length === (new URLSearchParams(location.search).has("clockWeather") ? 2 : 0),
    "Only an installed clock/weather plugin adds the two draggable slots");
  const mail = island.querySelector<HTMLElement>("[data-reorder-id=mail]")!;
  const shelf = island.querySelector<HTMLElement>("[data-reorder-id=shelf]")!;
  const original = [...island.children].map((node) => (node as HTMLElement).dataset.reorderId).join();
  const from = mail.getBoundingClientRect();
  const to = shelf.getBoundingClientRect();
  const pointer = (type: string, x: number) => mail.dispatchEvent(new PointerEvent(type, {
    bubbles: true, button: 0, buttons: type === "pointerup" ? 0 : 1,
    pointerId: 71, clientX: x, clientY: from.top + from.height / 2,
  }));
  await act(async () => { pointer("pointerdown", from.left + from.width / 2); });
  await act(async () => { pointer("pointermove", to.right - 1); });
  check(mail.classList.contains("collapsed-layout__slot--dragging") && mail.style.translate !== "",
    "The dragged layout slot follows the pointer");
  check([...island.children].map((node) => (node as HTMLElement).dataset.reorderId).join() !== original,
    "Layout order changes before the pointer is released");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  check(reduced || shelf.getAnimations().length > 0, "Neighbouring layout slots animate into the new order");
  await act(async () => { pointer("pointerup", to.right - 1); });
  check(mail.style.translate === "" && !mail.classList.contains("collapsed-layout__slot--dragging"), "Release clears the pointer offset");
  check(reduced || mail.getAnimations().length > 0, "Release animates the dragged slot into place");
  const reset = editor.closest(".settings-group")!.querySelector<HTMLButtonElement>(".settings-link-button, .settings-link");
  await act(async () => { reset?.click(); });
}
