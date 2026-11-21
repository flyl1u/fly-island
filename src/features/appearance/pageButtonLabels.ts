const LABEL_MODES = ["all", "spacing", "gap", "font", "current"] as const;
type LabeledMode = typeof LABEL_MODES[number];
export type PageButtonLabelMode = LabeledMode | "icons";
type LabelWidths = Record<LabeledMode, number>;

export type PageButtonWidths = {
  page: string;
  iconWidth: number;
  fullTextWidth: number;
  smallTextWidth: number;
};

export const PAGE_BUTTON_ICON_SIZE = 16;
const COMPACT_SPACING = { padding: 1, rowGap: 1, iconGap: 1 };
export const PAGE_BUTTON_LABEL_SPACING = {
  all: { padding: 4, rowGap: 4, iconGap: 4 },
  // Every level keeps more room between buttons (padding + gap + padding) than between an icon and
  // its own name, or an icon reads as belonging to the name before it.
  spacing: { padding: 2, rowGap: 2, iconGap: 3 },
  gap: COMPACT_SPACING,
  font: COMPACT_SPACING,
  current: COMPACT_SPACING,
  icons: COMPACT_SPACING,
} as const;

// The widths come from hidden probes and the row is measured on a box that does not change with
// the mode, so loosening cannot shrink the room it was measured in; this only absorbs subpixel jitter.
// 8px left English stuck in the current-page fallback at the default width, where it fits only just.
const LABEL_UPGRADE_MARGIN = 2;

export function getPageButtonLabelWidths(
  buttons: readonly PageButtonWidths[],
  fixed: readonly number[],
  currentPage: string,
  unit: number,
): LabelWidths {
  const iconWidth = buttons.reduce((width, button) => width + button.iconWidth, 0);
  const fixedWidth = fixed.reduce((width, item) => width + item, 0);
  const fullText = buttons.reduce((width, button) => width + button.fullTextWidth, 0);
  const smallText = buttons.reduce((width, button) => width + button.smallTextWidth, 0);
  const current = buttons.find((button) => button.page === currentPage);
  const rowGaps = Math.max(0, buttons.length + fixed.length - 1);
  const widthFor = (mode: LabeledMode, textWidth: number, labelCount = buttons.length) => {
    const { padding, rowGap, iconGap } = PAGE_BUTTON_LABEL_SPACING[mode];
    return iconWidth + fixedWidth + textWidth
      + (buttons.length * 2 * padding + rowGaps * rowGap + labelCount * iconGap) * unit;
  };

  return {
    all: widthFor("all", fullText),
    spacing: widthFor("spacing", fullText),
    gap: widthFor("gap", fullText),
    font: widthFor("font", smallText),
    current: current ? widthFor("current", current.smallTextWidth, 1) : Infinity,
  };
}

/** Switch immediately if the current layout stops fitting. Require spare room to loosen it. */
export function resolvePageButtonLabelMode(
  availableWidth: number,
  widths: LabelWidths,
  previous: PageButtonLabelMode | null,
  unit = 1,
): PageButtonLabelMode {
  const previousIndex = previous === "icons" ? LABEL_MODES.length : LABEL_MODES.findIndex((mode) => mode === previous);
  for (const [index, mode] of LABEL_MODES.entries()) {
    const margin = index < previousIndex ? LABEL_UPGRADE_MARGIN * unit : 0;
    if (widths[mode] + margin <= availableWidth) return mode;
  }
  return "icons";
}
