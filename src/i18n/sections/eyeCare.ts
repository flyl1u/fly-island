export type EyeCareText = {
  resting: string; done: string; elapsed: string; doneHint: string;
  postpone: string; postponeOnce: string; alreadyPostponed: string; skip: string; failed: string;
  minutes: (minutes: number) => string;
  postponeBy: (minutes: number) => string;
};

export const zhCN: EyeCareText = {
  resting: "休息中", done: "休息完成",
  elapsed: "已休息时长",
  doneHint: "休息完成自动进入空闲状态，任意键盘或鼠标操作退出空闲状态",
  postpone: "推迟本次休息", postponeOnce: "可以推迟一次，下次请完成休息",
  alreadyPostponed: "本轮已推迟过，请完成休息", skip: "跳过休息",
  failed: "操作未完成，请重试；也可以返回小岛检查插件状态。",
  minutes: (minutes) => `${minutes} 分钟`, postponeBy: (minutes) => `推迟 ${minutes} 分钟`,
};

export const en: EyeCareText = {
  resting: "Resting", done: "Break complete",
  elapsed: "Break time elapsed",
  doneHint: "A finished break keeps the screens idle; any key or mouse action ends it",
  postpone: "Postpone this break", postponeOnce: "Postpone once; complete your break next time",
  alreadyPostponed: "Already postponed; please complete this break", skip: "Skip break",
  failed: "The action did not complete. Try again or check the plugin on the island.",
  minutes: (minutes) => `${minutes} min`, postponeBy: (minutes) => `Postpone ${minutes} minutes`,
};
