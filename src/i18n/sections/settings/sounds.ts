/** The agent sound switch on Settings → AI Agent; pack, volume, events and quiet hours keep their defaults. */
export type SettingsSoundsText = {
  enabled: string;
  enabledHint: string;
};

export const zhCN: SettingsSoundsText = {
  enabled: "AI Agent 音效",
  enabledHint: "Agent 开始、完成、出错或等你处理时播放提示音。",
};

export const en: SettingsSoundsText = {
  enabled: "AI agent sounds",
  enabledHint: "Plays a sound when an agent starts, finishes, fails or needs you.",
};
