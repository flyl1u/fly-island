export type EyeCareText = {
  title: string; remaining: string;
  postpone: string; postponeOnce: string; alreadyPostponed: string; skip: string; failed: string;
  minutes: (minutes: number) => string;
  postponeBy: (minutes: number) => string;
};

export const zhCN: EyeCareText = {
  title: "休息一下",
  remaining: "剩余休息时长",
  postpone: "推迟本次休息", postponeOnce: "可以推迟一次，下次请完成休息",
  alreadyPostponed: "本轮已推迟过，请完成休息", skip: "跳过休息",
  failed: "操作未完成，请重试；也可以返回小岛检查插件状态。",
  minutes: (minutes) => `${minutes} 分钟`, postponeBy: (minutes) => `推迟 ${minutes} 分钟`,
};

export const en: EyeCareText = {
  title: "Take a break",
  remaining: "Remaining break time",
  postpone: "Postpone this break", postponeOnce: "Postpone once; complete your break next time",
  alreadyPostponed: "Already postponed; please complete this break", skip: "Skip break",
  failed: "The action did not complete. Try again or check the plugin on the island.",
  minutes: (minutes) => `${minutes} min`, postponeBy: (minutes) => `Postpone ${minutes} minutes`,
};
