// 截图覆盖层的抓屏与导出：抓底图、裁图、复制/保存、OCR 与划词翻译。
// 只负责「这一层数据」，选区与标注状态在 useScreenshotEditor 里。
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  activateScreenshot,
  captureScreenRaw,
  copyScreenshotPng,
  ocrScreenshotLines,
  ocrScreenshotPng,
  onScreenshotArm,
  saveScreenshotPng,
  screenshotFonts,
  screenshotWindowRect,
  screenshotWindows,
  type ScreenRect,
} from "../../features/screenshot/api";
import { measureHeight, measureText, type Annotation } from "../../features/screenshot/annotations";
import { translateText } from "../../features/translation/api";
import { loadSettings } from "../../features/translation/storage";
import { useTranslation } from "../../i18n";

/** 系统字体列表取不到时的兜底。 */
export const FALLBACK_FONTS = ["Microsoft YaHei", "SimSun", "SimHei", "KaiTi", "Segoe UI", "Consolas"];

export type CaptureState = ReturnType<typeof useScreenshotCapture>;

type CaptureOptions = {
  /** 当前选区：坐标是覆盖层里的 CSS 像素，标注层也用它。 */
  rect: ScreenRect | null;
  /** 正文字体：划词翻译按它画译文。 */
  textFont: string;
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
  /** 划词翻译算出来的译文标注，交给标注层。 */
  onTranslated: (items: Annotation[]) => void;
};

export function useScreenshotCapture({
  rect,
  textFont,
  canvasRef,
  backdropRef,
  windowRects,
  onArm,
  onClose,
  onTranslated,
}: CaptureOptions) {
  const t = useTranslation();
  const [base, setBase] = useState<ImageData | null>(null);
  const [scale, setScale] = useState(1);
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS);
  const [failure, setFailure] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const busy = useRef(false);

  /** 抓一张干净底图（窗口此时仍隐藏），然后把窗口显示并抢到前台。 */
  const arm = useCallback(async () => {
    try {
      const region = await screenshotWindowRect();
      const frame = await captureScreenRaw(region);
      const ratio = frame.width / Math.max(1, window.innerWidth);
      setBase(new ImageData(frame.data, frame.width, frame.height));
      setScale(ratio);
      setOcrText(null);
      setFailure(null);
      onArm();
      try {
        const physical = await screenshotWindows();
        windowRects.current = physical
          .filter((item) => item.width > 24 && item.height > 24)
          .map((item) => ({ x: item.x / ratio, y: item.y / ratio, width: item.width / ratio, height: item.height / ratio }));
      } catch {
        windowRects.current = [];
      }
      try {
        const installed = await screenshotFonts();
        if (installed.length > 0) setFonts(installed);
      } catch {
        setFonts(FALLBACK_FONTS);
      }
      await activateScreenshot();
    } catch (error) {
      setFailure(String(error));
      // 抓屏失败时也要把窗口露出来，否则用户只看到一片空白。
      await getCurrentWindow().show().catch(() => {});
    }
  }, [onArm, windowRects]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void onScreenshotArm(() => void arm())
      .then((off) => {
        dispose = off;
      })
      .catch(() => {});
    return () => dispose?.();
  }, [arm]);

  // 底图先落到背面画布：标注层重绘和真马赛克都从这块画布取像素。
  useEffect(() => {
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
    const height = Math.max(1, Math.round(rect.height * scale));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) return null;
    context.drawImage(backdrop, Math.round(rect.x * scale), Math.round(rect.y * scale), width, height, 0, 0, width, height);
    return output.toDataURL("image/png").split(",")[1] ?? null;
  }, [backdropRef, rect, scale]);

  /** 裁底图 + 标注，复制/保存用。 */
  const compose = useCallback((): string | null => {
    const annotation = canvasRef.current;
    const backdrop = backdropRef.current;
    if (!rect || !annotation || !backdrop) return null;
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) return null;
    context.drawImage(backdrop, Math.round(rect.x * scale), Math.round(rect.y * scale), width, height, 0, 0, width, height);
    context.drawImage(annotation, 0, 0);
    return output.toDataURL("image/png").split(",")[1] ?? null;
  }, [backdropRef, canvasRef, rect, scale]);

  const copy = useCallback(async () => {
    const png = compose();
    if (!png || busy.current) return;
    busy.current = true;
    try {
      await copyScreenshotPng(png);
      onClose();
    } finally {
      busy.current = false;
    }
  }, [compose, onClose]);

  const save = useCallback(async () => {
    const png = compose();
    if (!png || busy.current) return;
    busy.current = true;
    try {
      await saveScreenshotPng(png);
      onClose();
    } finally {
      busy.current = false;
    }
  }, [compose, onClose]);

  const recognize = useCallback(async () => {
    const png = cropRaw();
    if (!png || ocrBusy) return;
    setOcrBusy(true);
    try {
      setOcrText(await ocrScreenshotPng(png));
    } catch (error) {
      setOcrText(t.screenshot.ocrFailed(String(error)));
    } finally {
      setOcrBusy(false);
    }
  }, [cropRaw, ocrBusy, t]);

  /** 划词翻译：识别每行文字，翻译后把译文画在原文下一行。 */
  const translateInline = useCallback(async () => {
    const png = cropRaw();
    if (!png || ocrBusy) return;
    setOcrBusy(true);
    try {
      const lines = await ocrScreenshotLines(png);
      if (lines.length === 0) {
        setOcrText(t.screenshot.nothingFound);
        return;
      }
      const settings = loadSettings();
      const service = {
        provider: settings.provider,
        baseUrl: settings.provider === "custom" ? settings.customBaseUrl : null,
        model: settings.models[settings.provider] ?? null,
      };
      const created: Annotation[] = [];
      for (const line of lines) {
        let translated = "";
        try {
          translated = await translateText(line.text, settings.direction, service);
        } catch {
          translated = "";
        }
        if (!translated.trim()) continue;
        const size = Math.max(12, Math.round((line.height / Math.max(0.1, scale)) * 0.9));
        const at = { x: line.x / Math.max(0.1, scale), y: (line.y + line.height) / Math.max(0.1, scale) + 2 };
        created.push({
          kind: "text",
          color: "#e0403f",
          size,
          font: textFont,
          at,
          text: translated.trim(),
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          angle: 0,
          w: measureText(translated.trim(), size, textFont, false, false),
          h: measureHeight(translated.trim(), size),
        });
      }
      if (created.length === 0) {
        setOcrText(t.screenshot.translationEmpty);
        return;
      }
      onTranslated(created);
      setOcrText(null);
    } catch (error) {
      setOcrText(t.screenshot.translateFailed(String(error)));
    } finally {
      setOcrBusy(false);
    }
  }, [cropRaw, ocrBusy, onTranslated, scale, t, textFont]);

  const recognizeAndCopy = useCallback(async () => {
    const png = cropRaw();
    if (!png) return;
    try {
      const text = await ocrScreenshotPng(png);
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);
      onClose();
    } catch {
      // 复制失败时保持覆盖层，用户还能手动复制
    }
  }, [cropRaw, onClose]);

  return { scale, fonts, failure, ocrText, setOcrText, ocrBusy, copy, save, recognize, translateInline, recognizeAndCopy, close: onClose };
}
