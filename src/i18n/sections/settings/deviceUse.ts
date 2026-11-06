export type SettingsDeviceUseText = {
  title: string;
  indicator: string;
  indicatorHint: string;
};

export const zhCN: SettingsDeviceUseText = {
  title: "隐私提示",
  indicator: "摄像头和麦克风使用提示",
  indicatorHint: "有程序在用摄像头或麦克风时，在小岛上显示绿色摄像头或橙色麦克风图标，点击打开系统的隐私设置。",
};

export const en: SettingsDeviceUseText = {
  title: "Privacy",
  indicator: "Camera and microphone in use",
  indicatorHint: "While an app uses the camera or the microphone, the island shows a green camera or an orange microphone; click it to open Windows' privacy settings.",
};
