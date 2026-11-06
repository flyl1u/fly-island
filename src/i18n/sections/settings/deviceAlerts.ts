export type SettingsDeviceAlertsText = {
  title: string;
  alerts: string;
  alertsHint: string;
};

export const zhCN: SettingsDeviceAlertsText = {
  title: "耳机与充电",
  alerts: "在小岛上提示",
  alertsHint: "耳机或蓝牙音频设备连接、断开时，收起的小岛显示 3 秒，蓝牙设备带电量；蓝牙设备电量降到 20% 和 10% 时各提醒一次；笔记本插上或拔掉电源时也会提示。蓝牙电量要设备自己报告给 Windows 才有。",
};

export const en: SettingsDeviceAlertsText = {
  title: "Headphones and charging",
  alerts: "Show on the island",
  alertsHint: "When headphones or Bluetooth audio connect or disconnect, the collapsed island says so for 3 seconds, with the battery level of Bluetooth devices. A Bluetooth device warns once at 20% and again at 10%, and a laptop says when its charger is plugged in or pulled out. Bluetooth battery levels show only for devices that report them to Windows.",
};
