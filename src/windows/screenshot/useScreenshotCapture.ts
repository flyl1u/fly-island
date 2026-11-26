// 截图覆盖层的抓屏与导出：抓底图、裁图、复制/保存、OCR 与划词翻译。
// 只负责「这一层数据」，选区与标注状态在 useScreenshotEditor 里。
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  activateScreenshot,
  captureScreenRaw,
  copyScreenshotPng,
  copyScreenshotText,
  ocrScreenshotPng,
  onScreenshotArm,
  pinScreenshotPng,
  screenshotFonts,
  screenshotWindowRect,
  screenshotWindows,
  traceScreenshot,
  type ScreenRect,
} from "../../features/screenshot/api";
import { useTranslation } from "../../i18n";
import { overlayWindows } from "../../features/screenshot/geometry";
import { waitForScreenshotViewport } from "../../features/screenshot/displayMetrics";
import { drawAnnotation, measureHeight, measureText } from "../../features/screenshot/annotations";
import type { Editing } from "./useScreenshotEditor";

/** 系统字体列表取不到时的兜底。 */
export const FALLBACK_FONTS = ["Microsoft YaHei", "SimSun", "SimHei", "KaiTi", "Segoe UI", "Consolas"];

export type CaptureState = ReturnType<typeof useScreenshotCapture>;

type CaptureOptions = {
  /** 当前选区：坐标是覆盖层里的 CSS 像素，标注层也用它。 */
  rect: ScreenRect | null;
  editing: Editing | null;
  /** 标注层画布，导出时叠在底图上。 */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 底图画布：OCR 与导出都从这里裁。 */
  backdropRef: RefObject<HTMLCanvasElement | null>;
  /** 窗口矩形缓存，框选时用来吸附；由抓屏刷新。 */
  windowRects: RefObject<ScreenRect[]>;
  /** 抓到新底图后清空标注层。 */
  onArm: () => void;
  /** 导出完成或取消后收起覆盖层。 */
  onClose: () => void;
  /** 点保存时把合成后的 PNG 交给弹窗（base64）。 */
  onSaveRequest: (png: string) => void;
  /** 贴图失败时给用户的提示。 */
  onPinError: (message: string) => void;
};

export function useScreenshotCapture({
  rect,
  editing,
  canvasRef,
  backdropRef,
  windowRects,
  onArm,
  onClose,
  onSaveRequest,
  onPinError,
}: CaptureOptions) {
  const t = useTranslation();
  const [base, setBase] = useState<ImageData | null>(null);
  const [scale, setScale] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS);
  const [failure, setFailure] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const busy = useRef(false);
  const arming = useRef<object | null>(null);
  const fontJob = useRef<Promise<string[]> | null>(null);

  /** 抓一张干净底图（窗口此时仍隐藏），然后把窗口显示并抢到前台。 */
  const arm = useCallback(async () => {
    // 防重入：抓屏未完成时再来事件（残留监听器/重复热键）直接忽略。
    if (arming.current) return;
    const ticket = {};
    arming.current = ticket;
    try {
      const region = await screenshotWindowRect();
      const nativeDpi = await getCurrentWindow().scaleFactor().catch(() => window.devicePixelRatio);
      const dpi = typeof nativeDpi === "number" && nativeDpi > 0 ? nativeDpi : window.devicePixelRatio;
      const viewport = await waitForScreenshotViewport(region, dpi, () => ({
        width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio,
      }));
      if (!viewport) throw new Error(t.screenshot.displayNotReady);
      const frame = await captureScreenRaw(region);
      const ratio = frame.width / viewport.width;
      // Hidden WebViews may suspend animation frames. Commit the raw canvas synchronously
      // instead of waiting for requestAnimationFrame before showing the native window.
      flushSync(() => {
        setBase(new ImageData(frame.data, frame.width, frame.height));
        setScale(ratio);
        setScaleY(frame.height / viewport.height);
        setOcrText(null);
        setFailure(null);
        onArm();
      });
      try {
        const physical = await screenshotWindows();
        windowRects.current = [...overlayWindows(physical, region, ratio, frame.height / viewport.height),
          { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }];
      } catch {
        windowRects.current = [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }];
      }
      // Once the ready frame is submitted, a rapid close/reopen may start the next
      // session even while this session's focus acknowledgement or font list returns.
      arming.current = null;
      await activateScreenshot();
      if (!document.hasFocus()) await activateScreenshot();
      try {
        fontJob.current ??= screenshotFonts();
        const installed = await fontJob.current;
        if (installed.length > 0) setFonts(installed);
      } catch {
        fontJob.current = null;
        setFonts(FALLBACK_FONTS);
      }
    } catch (error) {
      setFailure(String(error));
      // 抓屏失败时也要把窗口露出来，否则用户只看到一片空白。
      await getCurrentWindow().show().catch(() => {});
    } finally {
      if (arming.current === ticket) arming.current = null;
    }
  }, [onArm, windowRects, t]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void onScreenshotArm(() => void arm())
      .then((off) => {
        // listen() 是异步的：若在 resolve 前 effect 已清理，必须立刻退订，
        // 否则每次重渲染都残留一个监听器，反复抓屏导致卡顿与闪烁。
        if (cancelled) { off(); return; }
        dispose = off;
      })
      .catch(() => {});
    return () => { cancelled = true; dispose?.(); };
  }, [arm]);

  // 底图先落到背面画布：标注层重绘和真马赛克都从这块画布取像素。
  useLayoutEffect(() => {
    const canvas = backdropRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !base) return;
    if (canvas.width !== base.width || canvas.height !== base.height) {
      canvas.width = base.width;
      canvas.height = base.height;
    }
    context.putImageData(base, 0, 0);
  }, [backdropRef, base]);

  /** 裁底图（不含标注），OCR 用。 */
  const cropRaw = useCallback((): string | null => {
    const backdrop = backdropRef.current;
    if (!rect || !backdrop) return null;
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scaleY));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) return null;
    context.drawImage(backdrop, Math.round(rect.x * scale), Math.round(rect.y * scaleY), width, height, 0, 0, width, height);
    return output.toDataURL("image/png").split(",")[1] ?? null;
  }, [backdropRef, rect, scale, scaleY]);

  /** 裁底图 + 标注，复制/保存用。 */
  const compose = useCallback((): string | null => {
    const annotation = canvasRef.current;
    const backdrop = backdropRef.current;
    if (!rect || !annotation || !backdrop) return null;
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scaleY));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) return null;
    context.drawImage(backdrop, Math.round(rect.x * scale), Math.round(rect.y * scaleY), width, height, 0, 0, width, height);
    context.drawImage(annotation, 0, 0);
    if (editing?.value.trim()) {
      const text = editing.value.trim();
      context.save();
      context.scale(1, scaleY / scale);
      drawAnnotation(context, { ...editing, kind: "text", text,
        w: measureText(text, editing.size, editing.font, editing.bold, editing.italic),
        h: measureHeight(text, editing.size) }, scale);
      context.restore();
    }
    return output.toDataURL("image/png").split(",")[1] ?? null;
  }, [backdropRef, canvasRef, rect, editing, scale, scaleY]);

  const copy = useCallback(async () => {
    const png = compose();
    if (!png || busy.current) return;
    busy.current = true;
    try {
      await copyScreenshotPng(png);
      onClose();
    } catch (error) {
      setFailure(`${t.screenshot.copyFailed}: ${String(error)}`);
    } finally {
      busy.current = false;
    }
  }, [compose, onClose, t]);

  /** 贴图：把合成后的 PNG 钉到桌面，成功就收起截图覆盖层；失败把错误亮在覆盖层上，别只进控制台。 */
  const pin = useCallback(() => {
    void traceScreenshot(`fe: pin clicked rect=${rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : "null"}`);
    const png = compose();
    if (!png) {
      setFailure(t.screenshot.pinFailed);
      return;
    }
    if (busy.current) {
      void traceScreenshot("fe: pin skipped (busy)");
      return;
    }
    busy.current = true;
    setFailure(null);
    void pinScreenshotPng(png, rect ?? undefined)
      .then(() => onClose())
      .catch((error) => {
        setFailure(`${t.screenshot.pinFailed}: ${String(error)}`);
        onPinError(String(error));
      })
      .finally(() => { busy.current = false; });
  }, [compose, onClose, onPinError, rect, t]);

  /** 保存改为交给弹窗：先合成 PNG，让用户选路径/尺寸/格式。 */
  const save = useCallback(() => {
    const png = compose();
    if (png) onSaveRequest(png);
  }, [compose, onSaveRequest]);

  const recognize = useCallback(async () => {
    const png = cropRaw();
    if (!png || ocrBusy) return;
    setOcrBusy(true);
    try {
      await pinScreenshotPng(png, undefined, false, true);
      onClose();
    } catch (error) {
      setFailure(t.screenshot.ocrFailed(String(error)));
    } finally {
      setOcrBusy(false);
    }
  }, [cropRaw, ocrBusy, onClose, t]);

  /** 翻译结果在独立图文窗口显示，复用 Fly Island 的服务设置。 */
  const translateInline = useCallback(async () => {
    const png = cropRaw();
    if (!png || busy.current) return;
    busy.current = true;
    try {
      await pinScreenshotPng(png, rect ?? undefined, true);
      onClose();
    } catch (error) {
      setFailure(t.screenshot.translateFailed(String(error)));
    } finally {
      busy.current = false;
    }
  }, [cropRaw, onClose, rect, t]);

  const recognizeAndCopy = useCallback(async () => {
    const png = cropRaw();
    if (!png) return;
    try {
      const text = await ocrScreenshotPng(png);
      if (!text.trim()) return;
      await copyScreenshotText(text);
      onClose();
    } catch (error) {
      setFailure(t.screenshot.ocrFailed(String(error)));
    }
  }, [cropRaw, onClose, t]);

  return { scale, scaleY, fonts, failure, setFailure, ocrText, setOcrText, ocrBusy, copy, save, pin, recognize, translateInline, recognizeAndCopy, close: onClose };
}
