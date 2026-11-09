export type SettingsFileShelfText = {
  autoCleanup: string;
  cleanupNever: string;
  cleanupDays: (days: number) => string;
  cleanupHint: string;
};

export const zhCN: SettingsFileShelfText = {
  autoCleanup: "自动清理",
  cleanupNever: "从不",
  cleanupDays: (days) => (days === 1 ? "1 天后" : `${days} 天后`),
  cleanupHint: "清理和移除只影响列表，不会删除你的文件。",
};

export const en: SettingsFileShelfText = {
  autoCleanup: "Auto clean up",
  cleanupNever: "Never",
  cleanupDays: (days) => (days === 1 ? "After 1 day" : `After ${days} days`),
  cleanupHint: "Cleaning up only changes the list; your files are never deleted.",
};
