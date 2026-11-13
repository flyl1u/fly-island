import { act } from "react";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";

const element = <T extends HTMLElement>(selector: string) => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
};
const click = async (selector: string) => {
  await act(async () => { element<HTMLButtonElement>(selector).click(); });
};
const openPage = (category: string) => click(`.settings-sidebar__item[data-category='${category}']`);
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const storedColors = () => {
  const { islandBackgroundColor, taskTextColor, pulseColor } = JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}");
  return { islandBackgroundColor, taskTextColor, pulseColor };
};

export function prepareColorRegression() {
  localStorage.setItem("focusd-island-color-refresh-v1", "1");
  localStorage.removeItem("focusd-island-color-backup");
  localStorage.removeItem("focusd-island-color-presets");
}

async function checkColorInputs(check: (condition: unknown, message: string) => void) {
  check(!document.querySelector(".appearance-color-restore"), "Without a backup, the restore icon is absent");
  const group = element(".settings-color").closest(".settings-group")!;
  // The 2026-11-13 requested presets row follows the three color input rows.
  const rows = [...group.querySelectorAll<HTMLElement>(".settings-row")].filter((row) => row.querySelector(".settings-color"));
  check(rows.length === 3 && rows.every((row) => row.querySelector(".appearance-hex") && row.querySelector("input[type=color]")),
    "The Colors card has three rows, each with a hex value and a swatch");
  const swatch = element<HTMLInputElement>(".settings-color__swatch");
  // At 150% Windows scaling Chromium quantizes a 1px border to 0.666667 CSS px.
  check(swatch.getBoundingClientRect().width === 36 && parseFloat(getComputedStyle(swatch).borderTopWidth) > 0, "The round 36px swatch has a visible border");
  const saved = () => JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}").islandBackgroundColor;
  const edit = async (value: string, key: string) => {
    await click(".appearance-hex");
    const input = element<HTMLInputElement>("input.appearance-hex");
    await type(input, value);
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  };
  const width = element(".appearance-hex").getBoundingClientRect().width;
  const hexStyle = getComputedStyle(element(".appearance-hex"));
  const titleStyle = getComputedStyle(element(".settings-color").closest(".settings-row")!.querySelector(".settings-row__title")!);
  check(hexStyle.fontFamily === titleStyle.fontFamily && hexStyle.fontWeight === "400" && hexStyle.fontSize === "14px"
    && hexStyle.fontVariantNumeric === "tabular-nums" && hexStyle.color !== titleStyle.color,
    "Hex values use the regular UI font at 14px with tabular digits and muted text");
  await click(".appearance-hex");
  const input = element<HTMLInputElement>("input.appearance-hex");
  check(input.getBoundingClientRect().width === width, "Editing a hex value keeps the control width");
  await type(input, "abc");
  await act(async () => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  check(saved() === "#AABBCC" && element(".appearance-hex").textContent === "#AABBCC", "Blur expands a short hex value and saves it");
  // The embedded settings share the island's native window keydown listener. Exercise real
  // DOM bubbling through React's delegated handler, rather than mocking stopPropagation.
  const windowKeys: string[] = [];
  const onWindowKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === "Escape") windowKeys.push(event.key);
  };
  window.addEventListener("keydown", onWindowKey);
  try {
    for (const key of ["Enter", "Escape"]) document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    check(windowKeys.join() === "Enter,Escape", "The native window listener receives unhandled Enter and Escape");
    windowKeys.length = 0;
    await edit("#2f2f37", "Enter");
    check(saved() === "#2F2F37", "Enter saves a hex value in uppercase");
    await edit("123456", "Escape");
    check(saved() === "#2F2F37", "Escape cancels a hex edit");
    check(windowKeys.length === 0, "React color input stops Enter and Escape before the native window listener can collapse the island");
  } finally {
    window.removeEventListener("keydown", onWindowKey);
  }
  await edit("not a color", "Enter");
  check(saved() === "#2F2F37" && element(".appearance-hex").textContent === "#2F2F37", "Invalid hex input silently rolls back");
  await edit("123456", "Enter");
  const swatches = [...document.querySelectorAll<HTMLInputElement>(".settings-color__swatch")];
  await type(swatches[1], "#aabbcc");
  await type(swatches[2], "#abcdef");
  check(!localStorage.getItem("focusd-island-color-backup") && !document.querySelector(".appearance-color-restore"),
    "Manual hex and picker edits do not create or overwrite a backup");
}

async function checkColorPresets(check: (condition: unknown, message: string) => void) {
  const saved = () => JSON.parse(localStorage.getItem("focusd-island-color-presets") ?? "[]") as { id: string; islandBackgroundColor: string }[];
  const chips = () => [...document.querySelectorAll<HTMLButtonElement>(".appearance-preset__apply")];
  const plus = () => element<HTMLButtonElement>(".appearance-presets__add");
  const setBackground = async (value: string) => {
    await click(".appearance-hex");
    const input = element<HTMLInputElement>("input.appearance-hex");
    await type(input, value);
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  };
  const expected = storedColors();
  const retired = localStorage.getItem("focusd-island-setting-presets");
  check(plus().closest(".settings-row")?.querySelector(".settings-row__title")?.textContent === "预设", "Presets are the last row of the Colors card");
  await click(".appearance-presets__add");
  check(saved().length === 1 && chips().length === 1 && chips()[0].getAttribute("aria-label")?.includes(expected.islandBackgroundColor)
    && chips()[0].getAttribute("aria-label")?.includes(expected.taskTextColor) && chips()[0].getAttribute("aria-label")?.includes(expected.pulseColor),
    "Plus saves a color chip whose accessible label reads all three colors");
  await click(".appearance-presets__add");
  check(saved().length === 1, "Saving identical colors does not duplicate the preset");
  const backupBeforeEdit = localStorage.getItem("focusd-island-color-backup");
  await setBackground("556677");
  check(localStorage.getItem("focusd-island-color-backup") === backupBeforeEdit, "A manual color edit preserves the existing backup");
  const beforeApply = storedColors();
  await click(".appearance-preset__apply");
  check(JSON.stringify(storedColors()) === JSON.stringify(expected)
    && JSON.stringify(JSON.parse(localStorage.getItem("focusd-island-color-backup")!)) === JSON.stringify(beforeApply),
    "Applying a color preset backs up the current colors before saving the preset colors");
  await click(".appearance-color-restore");
  check(JSON.stringify(storedColors()) === JSON.stringify(beforeApply), "Restore undoes applying a preset");
  for (let index = 0; index < 7; index++) {
    await setBackground(`10203${index}`);
    await click(".appearance-presets__add");
  }
  check(saved().length === 8 && chips().length === 8 && plus().disabled, "Eight presets disable Plus");
  const row = plus().closest(".settings-row")!;
  check(row.scrollWidth <= row.clientWidth, "Eight color chips and Plus stay inside the row");
  const firstId = saved()[0].id;
  const remove = element<HTMLButtonElement>(".appearance-preset__delete");
  await act(async () => { remove.focus(); });
  check(getComputedStyle(remove).opacity === "1" && !!remove.getAttribute("aria-label"), "Keyboard focus reveals the accessible delete icon");
  await click(".appearance-preset__delete");
  check(saved().length === 7 && !saved().some((preset) => preset.id === firstId) && !plus().disabled, "Deleting a preset saves the deletion and enables Plus");
  await openPage("general");
  await openPage("appearance");
  check(chips().length === 7, "Reopening Appearance reads the saved presets");
  check(localStorage.getItem("focusd-island-setting-presets") === retired, "Color presets leave the retired appearance preset key untouched");
}

export async function checkAppearance(check: (condition: unknown, message: string) => void) {
    const storedSettings = () => JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as Partial<typeof DEFAULT_SETTINGS>;
    check(!document.querySelector(".appearance-reset"), "Reset appearance is not offered outside the appearance page");
    await openPage("appearance");
    await checkColorInputs(check);
    const colorsBeforeReset = storedColors();
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
    check(JSON.stringify(JSON.parse(localStorage.getItem("focusd-island-color-backup") ?? "null")) === JSON.stringify(colorsBeforeReset),
      "Reset appearance first backs up all three colors");
    check(element(".appearance-color-restore").getAttribute("aria-label") === "恢复上一版颜色", "A backup reveals the restore icon with its accessible name");
    const colorsAfterReset = storedColors();
    await click(".appearance-color-restore");
    check(JSON.stringify(storedColors()) === JSON.stringify(colorsBeforeReset)
      && JSON.stringify(JSON.parse(localStorage.getItem("focusd-island-color-backup")!)) === JSON.stringify(colorsAfterReset),
      "Restore swaps current and backed-up colors and persists both");
    await click(".appearance-color-restore");
    check(JSON.stringify(storedColors()) === JSON.stringify(colorsAfterReset), "A second restore swaps the colors back");
    await checkColorPresets(check);
    check(!document.querySelector(".island-preview__island--glass") && ![...document.querySelectorAll<HTMLButtonElement>(".editor-panel button")].some((button) => button.textContent === "液态玻璃"),
      "Liquid glass is paused: the preview stays classic and the choice is not offered");
    check(document.querySelectorAll("[title]").length === 0, "No hover tooltips anywhere in Settings");

}
