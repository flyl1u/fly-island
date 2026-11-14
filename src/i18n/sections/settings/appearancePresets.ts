export type SettingsAppearancePresetsText = {
  title: string;
  hint: string;
  empty: string;
  apply: string;
  delete: string;
  nameLabel: string;
  namePlaceholder: string;
  save: string;
  full: (max: number) => string;
};

export const zhCN: SettingsAppearancePresetsText = {
  title: "外观预设",
  hint: "把当前所有外观设置（材质、颜色、大小、字体、圆角等）存成一份，之后一键应用，应用后还能继续调整。",
  empty: "还没有保存的外观预设。",
  apply: "应用",
  delete: "删除",
  nameLabel: "预设名称",
  namePlaceholder: "例如：深色玻璃",
  save: "保存当前外观",
  full: (max) => `最多保存 ${max} 个外观预设，先删除一个再保存。`,
};

export const en: SettingsAppearancePresetsText = {
  title: "Appearance presets",
  hint: "Save every appearance setting (material, colours, sizes, font, corners and so on) as one preset, apply it in a click, then keep adjusting.",
  empty: "No appearance presets saved yet.",
  apply: "Apply",
  delete: "Delete",
  nameLabel: "Preset name",
  namePlaceholder: "For example: Dark glass",
  save: "Save current look",
  full: (max) => `You can save up to ${max} appearance presets. Delete one first.`,
};
