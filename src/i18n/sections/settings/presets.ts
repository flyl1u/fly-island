export type SettingsPresetsText = {
  title: string;
  saveCurrent: string;
  empty: string;
  nameLabel: string;
  defaultName: (index: number) => string;
  rename: string;
  defaultPreset: string;
  apply: string;
  delete: string;
  deleteNamed: (name: string) => string;
};

export const zhCN: SettingsPresetsText = {
  title: "样式预设",
  saveCurrent: "保存当前",
  empty: "还没有样式预设",
  nameLabel: "样式预设名称",
  defaultName: (index) => `样式预设 ${index}`,
  rename: "重命名样式预设",
  defaultPreset: "默认样式预设",
  apply: "启用",
  delete: "删除样式预设",
  deleteNamed: (name) => `删除 ${name}`,
};

export const en: SettingsPresetsText = {
  title: "Style presets",
  saveCurrent: "Save current",
  empty: "No style presets yet",
  nameLabel: "Style preset name",
  defaultName: (index) => `Preset ${index}`,
  rename: "Rename preset",
  defaultPreset: "Default preset",
  apply: "Apply",
  delete: "Delete preset",
  deleteNamed: (name) => `Delete ${name}`,
};
