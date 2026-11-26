import { act } from "react";

const saved = () => JSON.parse(localStorage.getItem("fly-island-settings") ?? "{}") as { collapsedLayout?: string[]; collapsedHidden?: string[] };

export async function checkCollapsedLayout(check: (condition: unknown, message: string) => void) {
  const island = () => document.querySelector<HTMLElement>(".collapsed-layout__island")!;
  const box = () => document.querySelector<HTMLElement>(".collapsed-layout__hidden")!;
  const preview = document.querySelector<HTMLElement>("figure.island-preview")!;
  const editor = island().parentElement!;
  const width = () => island().getBoundingClientRect().width;
  check(Math.abs(width() - 310) <= 31, `Automatic arrangement preview draws the default 280–340 midpoint at actual size (${width()}px)`);
  const configuredWidth = editor.style.getPropertyValue("--preview-collapsed-width");
  editor.style.setProperty("--preview-collapsed-width", "280");
  check(Math.abs(width() - 280) <= 28, `A 280px island previews at actual size when it fits (${width()}px)`);
  editor.style.maxWidth = "250px";
  check(width() < 280 && width() <= editor.getBoundingClientRect().width, "The arrangement preview shrinks only to fit a narrow card");
  editor.style.removeProperty("max-width");
  editor.style.setProperty("--preview-collapsed-width", configuredWidth);
  for (const name of ["--preview-fill", "--preview-text", "--preview-corner-shape", "--preview-radius-collapsed-px", "--preview-font-scale", "--preview-collapsed-scale"]) {
    check(getComputedStyle(editor).getPropertyValue(name) === getComputedStyle(preview).getPropertyValue(name),
      `Layout editor shares the appearance drawing's ${name}`);
  }
  const clockWeather = new URLSearchParams(location.search).has("clockWeather");
  check(island().querySelectorAll(".collapsed-layout__slot--clock, .collapsed-layout__slot--weather").length === (clockWeather ? 2 : 0),
    "Only an installed clock/weather plugin adds the two draggable slots");
  const order = () => [...island().children].map((node) => (node as HTMLElement).dataset.slot).join();
  const hiddenOrder = () => [...box().querySelectorAll<HTMLElement>("[data-slot]")].map((node) => node.dataset.slot).join();
  check(order().startsWith("pulse,text,mail") && !island().querySelector(".collapsed-layout__slot--text .collapsed-layout__pulse"),
    `The status light is its own slot, left of the text (${order()})`);
  check(hiddenOrder() === "" && box().textContent?.includes("拖到这里"), "The empty box under the island says what it is for");

  const slot = (name: string) => editor.querySelector<HTMLElement>(`[data-slot='${name}']`)!;
  const centre = (element: Element) => { const rect = element.getBoundingClientRect(); return [rect.left + rect.width / 2, rect.top + rect.height / 2]; };
  const pointer = (target: Element, type: string, x: number, y: number) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 71, clientX: x, clientY: y,
  }));
  const drag = async (name: string, [x, y]: number[], release = true) => {
    const [startX, startY] = centre(slot(name));
    await act(async () => { pointer(slot(name), "pointerdown", startX, startY); });
    await act(async () => { pointer(editor, "pointermove", startX + 6, startY); });
    await act(async () => { pointer(editor, "pointermove", x, y); });
    if (release) await act(async () => { pointer(editor, "pointerup", x, y); });
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Left to right in one move: the light passes every slot at once, not one step per drag.
  const islandBox = island().getBoundingClientRect();
  await drag("pulse", [islandBox.right - 2, islandBox.top + islandBox.height / 2], false);
  check(order().endsWith(",pulse") && slot("pulse").classList.contains("collapsed-layout__slot--placeholder")
    && editor.querySelector(".collapsed-layout__ghost"), `Dragged right, the slot passes several neighbours at once and a copy follows the pointer (${order()})`);
  check(reduced || slot("mail").getAnimations().length > 0, "Slots giving way slide to their new places");
  check(saved().collapsedLayout?.[0] !== "text", "Nothing is saved before the drop");
  await act(async () => { pointer(editor, "pointerup", islandBox.right - 2, islandBox.top + islandBox.height / 2); });
  // Saved with the slots the editor does not show (an uninstalled plugin's) in their old places.
  const savedShown = () => (saved().collapsedLayout ?? []).filter((name) => order().split(",").includes(name)).join();
  check(!editor.querySelector(".collapsed-layout__ghost") && order().endsWith(",pulse") && savedShown() === order(), "The drop saves the new order");

  // Right to left as well.
  await drag("pulse", [islandBox.left + 2, islandBox.top + islandBox.height / 2]);
  check(order().startsWith("pulse,"), `Dragged back left, it is first again (${order()})`);

  // Into the box: off the island; back out: on it again, where it is dropped.
  await drag("music", centre(box()));
  check(hiddenOrder() === "music" && !island().querySelector("[data-slot='music']") && saved().collapsedHidden?.join() === "music",
    "Dropped in the box, a slot is taken off the island and saved as hidden");
  check(box().textContent?.includes("不在岛上显示"), "The box is labelled once something is in it");
  await drag("text", centre(box()));
  check(island().querySelector("[data-slot='text']") && !hiddenOrder().includes("text"), "The text stays on the island");
  const shown = island().getBoundingClientRect();
  await drag("music", [shown.left + 2, shown.top + shown.height / 2]);
  check(hiddenOrder() === "" && order().indexOf("music") < order().indexOf("text") && (saved().collapsedHidden ?? []).length === 0,
    `Dragged back, the slot returns where it is dropped (${order()})`);

  // The keys do the same: down takes a slot off, up puts it back.
  await act(async () => { slot("agents").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
  check(hiddenOrder() === "agents" && document.activeElement === slot("agents"), "The down arrow takes a slot off the island and keeps it focused");
  await act(async () => { slot("agents").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); });
  check(hiddenOrder() === "" && order().includes("agents"), "The up arrow puts it back on the island");

  const reset = editor.closest(".settings-group")!.querySelector<HTMLButtonElement>(".settings-link-button, .settings-link");
  await act(async () => { reset?.click(); });
  check(order().startsWith("pulse,text,mail") && hiddenOrder() === "", "Reset puts every slot back on the island in the default order");
}
