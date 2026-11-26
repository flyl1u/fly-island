import type { BatteryState } from "../../features/battery/display";
import type { BatteryDisplayMode, BatteryReadoutStyle } from "../../features/battery/preferences";

export type BatteryText = {
  name: string;
  displayMode: string;
  displayOptions: Record<BatteryDisplayMode, string>;
  readoutStyle: string;
  readoutStyleDescription: string;
  readoutStyleOptions: Record<BatteryReadoutStyle, string>;
  historyTitle: string;
  historyDescription: string;
  noBattery: string;
  historyInspect: string;
  historyNotCharging: string;
  historyDischarging: string;
  historyEmpty: string;
  historySummary: (from: string, to: string) => string;
  now: string;
  fullCharge: string;
  state: Record<BatteryState, string>;
  buttonLabel: (percent: string | null, status: string) => string;
  detailsUnavailable: string;
  remaining: (duration: string) => string;
  untilFull: (duration: string) => string;
  duration: (hours: number, minutes: number) => string;
  health: string;
  current: string;
  full: string;
  design: string;
};

const zhDuration = (hours: number, minutes: number) => hours === 0
  ? minutes + " 分钟"
  : hours + " 小时" + (minutes === 0 ? "" : " " + minutes + " 分");
const enDuration = (hours: number, minutes: number) => [
  hours ? hours + " hr" : "",
  minutes || !hours ? minutes + " min" : "",
].filter(Boolean).join(" ");

export const zhCN: BatteryText = {
  name: "电池",
  displayMode: "岛上显示",
  displayOptions: { percent: "电量", remaining: "剩余时间" },
  readoutStyle: "电池外观",
  readoutStyleDescription: "经典反色在电量分界处变色；半透明底让数字保持同色。",
  readoutStyleOptions: { inverted: "经典反色", badge: "半透明底" },
  historyTitle: "电量曲线",
  historyDescription: "在电池页画出最近 24 小时的电量，只存在内存里，关闭即清除。",
  noBattery: "没有检测到内置电池，岛上不会出现电池。",
  historyInspect: "按左右方向键查看各采样点",
  historyNotCharging: "未充电",
  historyDischarging: "放电中",
  historyEmpty: "正在记录电量…",
  historySummary: (from, to) => `电量从 ${from} 到 ${to}`,
  now: "现在",
  fullCharge: "满电",
  state: {
    charging: "充电中",
    full: "已充满",
    plugged: "已接电源",
    idle: "接电 · 未充电",
    pluggedDischarging: "接电 · 放电中",
    onBattery: "使用电池",
    unknown: "电池状态暂不可用",
  },
  buttonLabel: (percent, status) => "电池" + (percent ? " " + percent : "") + "，" + status,
  detailsUnavailable: "电池详情暂不可用",
  remaining: (duration) => `约剩 ${duration}`,
  untilFull: (duration) => `约 ${duration}充满`,
  duration: zhDuration,
  health: "电池健康",
  current: "当前容量",
  full: "满充容量",
  design: "设计容量",
};

export const en: BatteryText = {
  name: "Battery",
  displayMode: "On the island",
  displayOptions: { percent: "Charge", remaining: "Time left" },
  readoutStyle: "Battery appearance",
  readoutStyleDescription: "Inverted text changes color at the fill edge. With a translucent track, the text keeps one color.",
  readoutStyleOptions: { inverted: "Inverted", badge: "Translucent" },
  historyTitle: "Charge history",
  historyDescription: "Chart the last 24 hours on the Battery page; kept in memory only.",
  noBattery: "No built-in battery detected, so nothing shows on the island.",
  historyInspect: "Use Left or Right to inspect samples",
  historyNotCharging: "Not charging",
  historyDischarging: "Discharging",
  historyEmpty: "Recording charge…",
  historySummary: (from, to) => `Charge from ${from} to ${to}`,
  now: "Now",
  fullCharge: "Full",
  state: {
    charging: "Charging",
    full: "Fully charged",
    plugged: "Plugged in",
    idle: "Plugged in, not charging",
    pluggedDischarging: "Plugged in, discharging",
    onBattery: "On battery",
    unknown: "Battery status unavailable",
  },
  buttonLabel: (percent, status) => "Battery" + (percent ? " " + percent : "") + ", " + status,
  detailsUnavailable: "Battery details unavailable",
  remaining: (duration) => `About ${duration} left`,
  untilFull: (duration) => `About ${duration} until full`,
  duration: enDuration,
  health: "Health",
  current: "Now",
  full: "Full charge",
  design: "Design",
};
