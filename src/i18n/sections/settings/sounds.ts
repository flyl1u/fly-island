/** Mirrors AgentSoundEvent in features/agent-status/sounds/events.ts (i18n does not import features). */
type SoundEvent = "start" | "complete" | "error" | "approval" | "question" | "ack";

export type SettingsSoundsText = {
  title: string;
  enabled: string;
  enabledHint: string;
  volume: string;
  pack: string;
  builtinPack: string;
  eventsTitle: string;
  events: Record<SoundEvent, { title: string; hint: string }>;
  preview: string;
  quietTitle: string;
  quietWhenInFront: string;
  quietWhenInFrontHint: string;
  quietHours: string;
  quietHoursHint: string;
  quietRange: string;
  quietFrom: string;
  quietTo: string;
  quietFooter: string;
  packsTitle: string;
  packsEmpty: string;
  packMeta: (author: string, license: string, count: number) => string;
  importPack: string;
  importAction: string;
  importing: string;
  imported: (name: string) => string;
  removePack: string;
  confirmRemove: (name: string) => string;
  noSounds: string;
  packsFooter: string;
};

export const zhCN: SettingsSoundsText = {
  title: "音效",
  enabled: "AI Agent 音效",
  enabledHint: "Agent 开始、完成、出错或等你处理时播放提示音。",
  volume: "音量",
  pack: "使用的音效",
  builtinPack: "拇指琴（内置）",
  eventsTitle: "事件",
  events: {
    start: { title: "会话开始", hint: "新的 Claude Code 或 Codex 会话" },
    complete: { title: "任务完成", hint: "Agent 完成了这一轮回复" },
    error: { title: "任务出错", hint: "这一轮失败或接口出错" },
    approval: { title: "需要审批", hint: "等你允许它执行操作" },
    question: { title: "需要回答", hint: "Claude 向你提了一个问题" },
    ack: { title: "发出消息", hint: "你给会话发了新的提问" },
  },
  preview: "试听",
  quietTitle: "什么时候不响",
  quietWhenInFront: "会话的窗口在前台时不响",
  quietWhenInFrontHint: "你已经在看这个终端或编辑器时不再提醒。会话开始和发出消息不受影响。",
  quietHours: "静音时段",
  quietHoursHint: "这段时间里不播放任何音效；结束时间早于开始时间就跨过午夜。",
  quietRange: "时段",
  quietFrom: "从",
  quietTo: "到",
  quietFooter: "游戏模式勿扰打开、前台是全屏程序时也不响。",
  packsTitle: "音效包",
  packsEmpty: "还没有导入的音效包。",
  packMeta: (author, license, count) => [author, license, `${count} 个音效`].filter(Boolean).join(" · "),
  importPack: "导入音效包",
  importAction: "选择文件夹…",
  importing: "正在导入…",
  imported: (name) => `已导入「${name}」。`,
  removePack: "删除",
  confirmRemove: (name) => `删除音效包「${name}」？`,
  noSounds: "这个文件夹里没有认得出的音效。音效包需要 focusd-sound-pack.json，或者文件名里带事件名（如 task-complete.wav）。",
  packsFooter: "音效包是一个文件夹，里面放音效文件和 focusd-sound-pack.json（写明名称、作者、许可和每个事件对应的文件）；也认 CESP 格式的音效包。导入时会复制一份到岛屿的数据目录。音效包里缺的事件用内置音效。别人的音效请确认许可再分享。",
};

export const en: SettingsSoundsText = {
  title: "Sounds",
  enabled: "AI agent sounds",
  enabledHint: "Plays a sound when an agent starts, finishes, fails or needs you.",
  volume: "Volume",
  pack: "Sounds to use",
  builtinPack: "Thumb piano (built in)",
  eventsTitle: "Events",
  events: {
    start: { title: "Session starts", hint: "A new Claude Code or Codex session" },
    complete: { title: "Task done", hint: "The agent finished its turn" },
    error: { title: "Task failed", hint: "The turn failed or the API returned an error" },
    approval: { title: "Needs approval", hint: "Waiting for you to allow an action" },
    question: { title: "Needs an answer", hint: "Claude asked you a question" },
    ack: { title: "Prompt sent", hint: "You sent a session a new prompt" },
  },
  preview: "Play",
  quietTitle: "When to stay quiet",
  quietWhenInFront: "Quiet while the session's window is in front",
  quietWhenInFrontHint: "No sound when you are already looking at that terminal or editor. Session starts and sent prompts still play.",
  quietHours: "Quiet hours",
  quietHoursHint: "No sounds at all in this time; an end before the start runs past midnight.",
  quietRange: "Hours",
  quietFrom: "From",
  quietTo: "to",
  quietFooter: "Also quiet while game mode's do-not-disturb applies to a full-screen app.",
  packsTitle: "Sound packs",
  packsEmpty: "No sound packs imported yet.",
  packMeta: (author, license, count) => [author, license, `${count} sound${count === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
  importPack: "Import a sound pack",
  importAction: "Choose folder…",
  importing: "Importing…",
  imported: (name) => `Imported "${name}".`,
  removePack: "Remove",
  confirmRemove: (name) => `Remove the sound pack "${name}"?`,
  noSounds: "No sounds found in this folder. A pack needs a focusd-sound-pack.json, or event names in its file names (such as task-complete.wav).",
  packsFooter: "A sound pack is a folder of sound files with a focusd-sound-pack.json naming the pack, its author and license, and the file for each event; CESP packs work too. Importing copies it into the island's data folder. Events a pack leaves out use the built-in sounds. Check the license before sharing someone else's sounds.",
};
