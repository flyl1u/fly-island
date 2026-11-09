export type SettingsPresetsText = {
  title: string;
  saveCurrent: string;
  empty: string;
  nameLabel: string;
  defaultName: (index: number) => string;
  apply: string;
  delete: string;
  deleteNamed: (name: string) => string;
  /** Link on the title line that opens a theme file. */
  import: string;
  exportNamed: (name: string) => string;
  /** Name of an imported preset whose file has none. */
  importedName: string;
  hint: string;
  exported: (path: string) => string;
  reveal: string;
  imported: (name: string) => string;
  problems: { notJson: string; notTheme: string; newerVersion: string };
};

export const zhCN: SettingsPresetsText = {
  title: "样式预设",
  saveCurrent: "保存当前",
  empty: "还没有样式预设",
  nameLabel: "样式预设名称",
  defaultName: (index) => `样式预设 ${index}`,
  apply: "启用",
  delete: "删除样式预设",
  deleteNamed: (name) => `删除 ${name}`,
  import: "导入…",
  exportNamed: (name) => `导出 ${name}`,
  importedName: "导入的样式",
  hint: "样式预设可以导出成主题文件发给别人，或在另一台电脑上导入。主题只含外观页的设置（颜色、字体、尺寸、圆角、玻璃效果等），导入后出现在列表最上面，点「启用」才会应用。",
  exported: (path) => `已导出到 ${path}`,
  reveal: "在文件夹中显示",
  imported: (name) => `已导入「${name}」，点「启用」应用它。`,
  problems: {
    notJson: "这个文件不是有效的 JSON，无法导入。",
    notTheme: "这不是 fly-island 导出的主题文件。完整的设置备份请在 通用 → 备份与恢复 里恢复。",
    newerVersion: "这个主题文件来自更新的版本，请先把岛屿更新到最新版。",
  },
};

export const en: SettingsPresetsText = {
  title: "Style presets",
  saveCurrent: "Save current",
  empty: "No style presets yet",
  nameLabel: "Style preset name",
  defaultName: (index) => `Preset ${index}`,
  apply: "Apply",
  delete: "Delete preset",
  deleteNamed: (name) => `Delete ${name}`,
  import: "Import…",
  exportNamed: (name) => `Export ${name}`,
  importedName: "Imported style",
  hint: "Export a style preset as a theme file to share it or import it on another computer. A theme holds only the Appearance settings (colours, font, sizes, corners, glass and so on); an imported one appears at the top of the list and applies when you click Apply.",
  exported: (path) => `Exported to ${path}`,
  reveal: "Show in folder",
  imported: (name) => `Imported "${name}". Click Apply to use it.`,
  problems: {
    notJson: "This file is not valid JSON and cannot be imported.",
    notTheme: "This is not a theme file exported by fly-island. Restore a full settings backup under General → Backup and restore.",
    newerVersion: "This theme file comes from a newer version. Update the island first.",
  },
};
