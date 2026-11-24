// 截图插件的 IPC 收口：命令名与参数名对应 src-tauri/src/screenshot/mod.rs。
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 覆盖层被叫醒时 Rust 发出的事件名（与 screenshot/window.rs 的 ARM_EVENT 一致）。 */
const ARM_EVENT = "screenshot-arm";

/** 屏幕像素矩形，和 Rust 侧的 `(x, y, x + width, y + height)` 对应。 */
export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * 抓取一个屏幕区域，返回 PNG 字节。
 * Rust 用 `ipc::Response` 回二进制，前端拿到的是 `ArrayBuffer`。
 */
export async function captureScreenshot(rect: ScreenRect): Promise<Uint8Array> {
  const buffer = await invoke<ArrayBuffer>("screenshot_capture", {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  return new Uint8Array(buffer);
}

/** 打开覆盖层（设置页的「立即截图」也用它）。 */
export async function openScreenshotOverlay(): Promise<void> {
  await invoke("screenshot_open");
}

/** 设置截图快捷键；传空字符串表示关闭。返回实际生效的按键描述。 */
export async function setScreenshotShortcut(shortcut: string): Promise<string> {
  return invoke<string>("set_screenshot_shortcut", { shortcut });
}

/** 原始像素帧：省掉 PNG 解码，前端直接构造 ImageData。 */
export type RawFrame = { width: number; height: number; data: Uint8ClampedArray };

/** 抓取一个屏幕区域，返回原始 RGBA 像素（`[宽][高][像素...]`）。 */
export async function captureScreenRaw(rect: ScreenRect): Promise<RawFrame> {
  const buffer = await invoke<ArrayBuffer>("screenshot_raw", {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  const view = new DataView(buffer);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  return { width, height, data: new Uint8ClampedArray(buffer, 8) };
}

/** 覆盖层窗口在屏幕上的物理矩形（x, y, width, height），用来先抓全屏底图。 */
export async function screenshotWindowRect(): Promise<{ x: number; y: number; width: number; height: number }> {
  const [x, y, width, height] = await invoke<[number, number, number, number]>("screenshot_window_rect");
  return { x, y, width, height };
}

/** 把标注合成后的 PNG（base64，不含 data: 前缀）放进剪贴板。 */
export async function copyScreenshotPng(pngBase64: string): Promise<void> {
  await invoke("screenshot_copy_png", { pngBase64 });
}

/** 把标注合成后的 PNG 存到「图片\fly-island」，返回保存路径。 */
export async function saveScreenshotPng(pngBase64: string): Promise<string> {
  return invoke<string>("screenshot_save_png", { pngBase64 });
}

/** 抓取同一区域并直接放进剪贴板（Rust 侧完成，不传图片数据）。 */
export async function copyScreenshot(rect: ScreenRect): Promise<void> {
  await invoke("screenshot_copy", {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
}

/** 识别 PNG 里的文字（系统自带 OCR，离线）。 */
export async function ocrScreenshotPng(pngBase64: string): Promise<string> {
  return invoke<string>("screenshot_ocr", { pngBase64 });
}
/** 当前可见窗口的矩形（屏幕物理像素，最上层在前），用于鼠标吸附。 */
export async function screenshotWindows(): Promise<ScreenRect[]> {
  const list = await invoke<[number, number, number, number][]>("screenshot_windows");
  return list.map(([left, top, right, bottom]) => ({ x: left, y: top, width: right - left, height: bottom - top }));
}
/** 系统已安装的字体族（按名称排序）。 */
export async function screenshotFonts(): Promise<string[]> {
  return invoke<string[]>("screenshot_fonts");
}
/** 按行识别文字，附带每行在原图中的位置（用于把译文画在原文下面）。 */
export async function ocrScreenshotLines(pngBase64: string): Promise<{ text: string; x: number; y: number; width: number; height: number }[]> {
  const rows = await invoke<[string, number, number, number, number][]>("screenshot_ocr_lines", { pngBase64 });
  return rows.map(([text, x, y, width, height]) => ({ text, x, y, width, height }));
}

/** 订阅「覆盖层被叫醒」事件，返回取消订阅函数。 */
export async function onScreenshotArm(handler: () => void): Promise<() => void> {
  return listen(ARM_EVENT, () => handler());
}

/** 底图抓完之后把覆盖层显示出来并抢到前台。 */
export async function activateScreenshot(): Promise<void> {
  await invoke("screenshot_activate");
}

/** 关闭覆盖层，并清掉 Rust 侧记住的选区与快捷键状态。 */
export async function dismissScreenshot(): Promise<void> {
  await invoke("screenshot_dismiss");
}