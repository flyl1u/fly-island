import { act } from "react";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";

type SettingsChecks = {
  check: (condition: unknown, message: string) => void;
  element: <T extends HTMLElement>(selector: string) => T;
  click: (selector: string) => Promise<void>;
  type: (input: HTMLInputElement, value: string) => Promise<void>;
  openPage: (category: string) => Promise<void>;
};

export async function checkAppearance({ check, element, click, type, openPage }: SettingsChecks) {
  const storedSettings = () => JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as Partial<typeof DEFAULT_SETTINGS>;
  check(!document.querySelector(".appearance-reset"), "Reset appearance is not offered outside the appearance page");
  await openPage("appearance");
  // Expanded size: a slider from 0.85x to 1.2x, stored as the scale once the thumb is let go,
  // and the island opens to show it.
  const sizeLabel = [...document.querySelectorAll<HTMLLabelElement>("label")].find((label) => label.textContent === "展开后的大小");
  const sizeSlider = element<HTMLInputElement>(`#${CSS.escape(sizeLabel?.htmlFor ?? "missing")}`);
  const storedScale = () => (JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { expandedScale?: number }).expandedScale;
  const previewIsland = element<HTMLElement>(".island-preview__island--expanded");
  const previewWidth = () => previewIsland.getBoundingClientRect().width;
  const originalPreviewWidth = previewWidth();
  check(sizeSlider.type === "range" && sizeSlider.min === "0.85" && sizeSlider.max === "1.2" && sizeSlider.step === "0.01" && sizeSlider.value === "1",
    "The expanded size is a slider from 0.85 to 1.2 in steps of 0.01, at 1 by default");
  localStorage.removeItem("focusd-island-panel-preview");
  const setRange = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  await act(async () => { setRange(sizeSlider, "1.05"); });
  await act(async () => { setRange(sizeSlider, "1.12"); });
  const sizeRow = sizeSlider.closest(".settings-row") ?? document.body;
  check(storedScale() !== 1.12 && !localStorage.getItem("focusd-island-panel-preview") && sizeRow.querySelector(".settings-slider__value")?.textContent === "1.12x",
    "Dragging the expanded size shows the value but neither stores it nor resizes the island yet");
  check(Math.abs(previewWidth() / originalPreviewWidth - 1.12) < 0.01,
    "The drawing above the slider follows the unsaved size in real time");
  await act(async () => { window.dispatchEvent(new PointerEvent("pointerup")); });
  const preview = JSON.parse(localStorage.getItem("focusd-island-panel-preview") ?? "{}") as { mode?: string };
  check(storedScale() === 1.12 && preview.mode === "expanded", "Letting go stores 1.12 and opens the island to show it");
  await act(async () => { setRange(sizeSlider, "1"); });
  await act(async () => { sizeSlider.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true })); });
  check(storedScale() === 1, "A key press on the slider stores its value at once");
  check(Math.abs(previewWidth() - originalPreviewWidth) < 1, "Committing the original size clears the temporary preview");
  await act(async () => { setRange(sizeSlider, "1.2"); });
  const previewBox = previewIsland.parentElement!.getBoundingClientRect();
  const largest = previewIsland.getBoundingClientRect();
  check(largest.left >= previewBox.left && largest.right <= previewBox.right && largest.bottom <= previewBox.bottom,
    "The largest size stays fully visible inside the preview");
  await act(async () => { sizeRow.querySelector<HTMLButtonElement>(".settings-slider__reset")!.click(); });
  check(sizeSlider.value === "1" && Math.abs(previewWidth() - originalPreviewWidth) < 1,
    "Reset clears the unsaved size as well as the slider");

  const inputNamed = (name: string) => {
    const label = [...document.querySelectorAll<HTMLLabelElement>("label")].find((item) => item.textContent === name);
    return label ? document.getElementById(label.htmlFor) as HTMLInputElement | null : null;
  };
  const fontSlider = inputNamed("岛屿字号")!;
  const collapsedSample = element<HTMLElement>(".island-preview__island--collapsed");
  const expandedSample = element<HTMLElement>(".agent-page-preview__title");
  const getSize = (sample: HTMLElement) => parseFloat(getComputedStyle(sample).fontSize);
  const [originalCollapsedFont, originalExpandedFont] = [getSize(collapsedSample), getSize(expandedSample)];
  await act(async () => setRange(fontSlider, "120"));
  check(storedSettings().islandFontPercent === 100 && getSize(collapsedSample) > originalCollapsedFont && getSize(expandedSample) > originalExpandedFont,
    "The uncommitted font slider updates both previews");
  await act(async () => window.dispatchEvent(new PointerEvent("pointerup")));
  check(storedSettings().islandFontPercent === 120, "Releasing the font slider saves the new size");
  const autoWidth = inputNamed("自动宽度")!;
  check(autoWidth.checked && !inputNamed("刘海宽度"), "The notch uses automatic width by default");
  await act(async () => autoWidth.click());
  const widthInput = inputNamed("刘海宽度")!;
  const heightInput = inputNamed("刘海高度")!;
  const notchBefore = collapsedSample.getBoundingClientRect();
  await type(widthInput, "480");
  await act(async () => widthInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  const notchWider = collapsedSample.getBoundingClientRect();
  await type(heightInput, "60");
  await act(async () => heightInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  const notchTaller = collapsedSample.getBoundingClientRect();
  check(storedSettings().collapsedWidth === 480 && storedSettings().collapsedHeight === 60 &&
    notchWider.width > notchBefore.width && notchWider.height === notchBefore.height && notchTaller.height > notchWider.height && notchTaller.width === notchWider.width,
    "Notch width and height change separately in the preview and persist");
  await click(".appearance-reset");
  check(storedSettings().opacity === 60, "The first reset click only asks for confirmation");
  await click(".appearance-reset__confirm .appearance-reset:not(.appearance-reset--danger)");
  check(storedSettings().opacity === 60 && document.querySelector(".appearance-reset"), "Cancelling keeps the appearance");
  await click(".appearance-reset");
  await click(".appearance-reset--danger");
  check(storedSettings().opacity === DEFAULT_SETTINGS.opacity, "Confirming resets the appearance");
  check(storedSettings().islandFontPercent === 100 && storedSettings().collapsedAutoWidth && storedSettings().collapsedHeight === 38 && storedSettings().collapsedWidth === 340,
    "Appearance reset restores the font and notch defaults");
  check(storedSettings().carryOverIncompleteTodos === false, "Resetting the appearance keeps todo settings");
}
