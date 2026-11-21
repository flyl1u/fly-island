export type DeviceBatteryText = {
  title: string; deviceSettings: string; automatic: string;
  saveFailed: string; refresh: string; refreshing: string; speaker: string; headset: string; bind: string;
  receiverOnly: string;
  current: string; switchOutput: string; batteries: string; empty: string; unknown: string; cached: string; charging: string; checked: string; unconfirmed: string; trust: string;
  /** Collapsed-island line when a device drops to 20% or below. */
  lowAlert: (device: string, percent: number) => string;
};
export const zhCN: DeviceBatteryText = {
  title: "设备电量与音频",
  deviceSettings: "设备设置",
  receiverOnly: "已检测到接收器，尚未读到电量",
  automatic: "设备选择自动保存，状态自动更新。",
  saveFailed: "设置未能保存，请检查存储空间。", refresh: "刷新", refreshing: "读取中…",
  speaker: "扬声器", headset: "耳机", bind: "请选择活动输出设备", current: "当前输出", switchOutput: "切换输出", empty: "没有可读取的无线设备",
  batteries: "设备电量", unknown: "未知", cached: "历史读数", charging: "充电中", checked: "上次确认", unconfirmed: "待确认",
  trust: "切换仅更改系统与媒体输出，保留通讯输出和麦克风。",
  lowAlert: (device, percent) => `${device} 电量仅剩 ${percent}%，该充电了`,
};
export const en: DeviceBatteryText = {
  title: "Device battery & audio",
  deviceSettings: "Device settings",
  receiverOnly: "Receiver detected. Battery level unavailable.",
  automatic: "Device selections are saved and refreshed automatically.",
  saveFailed: "Could not save settings. Check available storage.", refresh: "Refresh", refreshing: "Reading…",
  speaker: "Speakers", headset: "Headphones", bind: "Choose an active output", current: "Current output", switchOutput: "Switch output", empty: "No readable wireless devices",
  batteries: "Device batteries", unknown: "Unknown", cached: "Previous reading", charging: "Charging", checked: "Last confirmed", unconfirmed: "Unconfirmed",
  trust: "Switching changes system and media output while preserving communications output and microphones.",
  lowAlert: (device, percent) => `${device} at ${percent}% — time to charge`,
};
