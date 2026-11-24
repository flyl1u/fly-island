import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowUpRight,
  Check,
  Circle,
  Copy,
  Grid3x3,
  Hash,
  Languages,
  MousePointer2,
  Pencil,
  Save,
  ScanText,
  Square,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  activateScreenshot,
  captureScreenRaw,
  copyScreenshotPng,
  dismissScreenshot,
  ocrScreenshotLines,
  ocrScreenshotPng,
  onScreenshotArm,
  saveScreenshotPng,
  screenshotFonts,
  screenshotWindowRect,
  screenshotWindows,
  type ScreenRect,
} from "../../features/screenshot/api";
import {
  COLORS,
  drawAnnotation,
  hitStroke,
  hitText,
  redraw,
  type Annotation,
  type Dash,
  type NumberStyle,
  type Point,
  type Shape,
  type Tool,
} from "../../features/screenshot/annotations";
import { translateText } from "../../features/translation/api";
import { loadSettings } from "../../features/translation/storage";
import "./ScreenshotWindow.css";

const MIN_SIZE = 4;
const FALLBACK_FONTS = ["Microsoft YaHei", "SimSun", "SimHei", "KaiTi", "Segoe UI", "Consolas"];

type TextFormat = { bold: boolean; italic: boolean; underline: boolean; strike: boolean };
type Editing = {
  index: number | null;
  at: Point;
  value: string;
  size: number;
  font: string;
  angle: number;
  color: string;
} & TextFormat;

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Drag =
  | { mode: "create"; from: Point }
  | { mode: "move"; from: Point; origin: ScreenRect }
  | { mode: "resize"; handle: Handle; from: Point; origin: ScreenRect }
  | { mode: "draw" }
  | { mode: "text"; index: number; from: Point; origin: Point }
  | { mode: "node"; index: number; key: string; from: Point; origin: { from: Point; to: Point } };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const TOOLS: { id: Tool; label: string; Icon: typeof Square }[] = [
  { id: "move", label: "移动选区", Icon: MousePointer2 },
  { id: "shape", label: "框选形状", Icon: Square },
  { id: "arrow", label: "箭头", Icon: ArrowUpRight },
  { id: "pen", label: "画笔", Icon: Pencil },
  { id: "number", label: "序号", Icon: Hash },
  { id: "text", label: "文字", Icon: Type },
  { id: "mosaic", label: "马赛克", Icon: Grid3x3 },
];
const DASHES: { id: Dash; label: string }[] = [
  { id: "solid", label: "实线" },
  { id: "dashed", label: "虚线" },
  { id: "dotted", label: "点线" },
];
const FORMATS: { key: keyof TextFormat; label: string; title: string }[] = [
  { key: "bold", label: "B", title: "加粗" },
  { key: "italic", label: "I", title: "斜体" },
  { key: "underline", label: "U", title: "下划线" },
  { key: "strike", label: "S", title: "删除线" },
];

function fromPoints(a: Point, b: Point): ScreenRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function resize(origin: ScreenRect, handle: Handle, dx: number, dy: number): ScreenRect {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;
  if (right - left < MIN_SIZE) {
    if (handle.includes("w")) left = right - MIN_SIZE;
    else right = left + MIN_SIZE;
  }
  if (bottom - top < MIN_SIZE) {
    if (handle.includes("n")) top = bottom - MIN_SIZE;
    else bottom = top + MIN_SIZE;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 以自身中心为原点缩放标注（滚轮调整框/椭圆/箭头大小用）。 */
function scaleItem(item: Annotation, factor: number): Annotation {
  if (item.kind === "rect" || item.kind === "ellipse" || item.kind === "arrow") {
    const cx = (item.from.x + item.to.x) / 2;
    const cy = (item.from.y + item.to.y) / 2;
    const scale = (point: Point): Point => ({ x: cx + (point.x - cx) * factor, y: cy + (point.y - cy) * factor });
    return { ...item, from: scale(item.from), to: scale(item.to) };
  }
  if (item.kind === "pen") {
    const count = Math.max(1, item.points.length);
    const cx = item.points.reduce((sum, point) => sum + point.x, 0) / count;
    const cy = item.points.reduce((sum, point) => sum + point.y, 0) / count;
    return {
      ...item,
      points: item.points.map((point) => ({ x: cx + (point.x - cx) * factor, y: cy + (point.y - cy) * factor })),
    };
  }
  return item;
}
function measureText(value: string, size: number, font: string, bold?: boolean, italic?: boolean): number {
  const canvas = document.createElement("canvas").getContext("2d");
  const lines = (value || "文").split("\n");
  if (!canvas) return Math.max(20, Math.max(...lines.map((line) => line.length)) * size * 0.6);
  canvas.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${font}`;
  return Math.max(20, Math.max(...lines.map((line) => canvas.measureText(line || " ").width)));
}

/** 文字块高度：按行数算。 */
function measureHeight(value: string, size: number): number {
  const lines = (value || "文").split("\n").length;
  return lines * size * 1.4;
}

/** 截图覆盖层：冻结画面 + 框选 + 标注 + 复制/保存/OCR。 */
export function ScreenshotWindow() {
  const [base, setBase] = useState<ImageData | null>(null);
  const [scale, setScale] = useState(1);
  const [rect, setRect] = useState<ScreenRect | null>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [shape, setShape] = useState<Shape>("rect");
  const [dash, setDash] = useState<Dash>("solid");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [textSize, setTextSize] = useState(20);
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS);
  const [textFont, setTextFont] = useState(FALLBACK_FONTS[0]);
  const [textFormat, setTextFormat] = useState<TextFormat>({ bold: false, italic: false, underline: false, strike: false });
  const [numberStyle, setNumberStyle] = useState<NumberStyle>("arabic");
  const [numberSize, setNumberSize] = useState(28);
  const [mosaicSize, setMosaicSize] = useState(12);
  const [color, setColor] = useState(COLORS[0]);
  const [items, setItems] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [magnifier, setMagnifier] = useState<Point | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierRef = useRef<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const windowRects = useRef<ScreenRect[]>([]);
  const drag = useRef<Drag | null>(null);
  const pendingSnap = useRef<ScreenRect | null>(null);
  const lastMove = useRef<{ x: number; y: number; time: number } | null>(null);
  const rotateCenter = useRef<Point | null>(null);
  const textResize = useRef<{ from: Point; center: Point; size: number } | null>(null);
  const busy = useRef(false);
  const counters = useRef<Record<NumberStyle, number>>({ arabic: 1, alpha: 1, roman: 1 });

  /** 抓一张干净底图（窗口此时仍隐藏），然后把窗口显示并抢到前台。 */
  const arm = useCallback(async () => {
    const appWindow = getCurrentWindow();
    try {
      const region = await screenshotWindowRect();
      const frame = await captureScreenRaw(region);
      const ratio = frame.width / Math.max(1, window.innerWidth);
      setBase(new ImageData(frame.data, frame.width, frame.height));
      setScale(ratio);
      setRect(null);
      setItems([]);
      setDraft(null);
      setEditing(null);
      setSelected(null);
      setOcrText(null);
      setFailure(null);
      setMagnifier(null);
      counters.current = { arabic: 1, alpha: 1, roman: 1 };
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
      await appWindow.show().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void onScreenshotArm(() => void arm())
      .then((off) => {
        dispose = off;
      })
      .catch(() => {});
    return () => dispose?.();
  }, [arm]);

  useEffect(() => {
    const canvas = backdropRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !base) return;
    if (canvas.width !== base.width || canvas.height !== base.height) {
      canvas.width = base.width;
      canvas.height = base.height;
    }
    context.putImageData(base, 0, 0);
  }, [base]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = rect ? Math.max(1, Math.round(rect.width * scale)) : 1;
    const height = rect ? Math.max(1, Math.round(rect.height * scale)) : 1;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const source = backdropRef.current ?? undefined;
    const offset = rect ? { x: rect.x, y: rect.y } : undefined;
    // 正在编辑的那条不画：文本框已经显示它，否则会出现两行一样的字。
    const visibleItems = editing && editing.index !== null ? items.filter((_, index) => index !== editing.index) : items;
    redraw(context, visibleItems, scale, source, offset);
    if (draft) drawAnnotation(context, draft, scale, source, offset);
  }, [rect, items, draft, scale, editing]);

  useEffect(() => {
    const canvas = magnifierRef.current;
    const backdrop = backdropRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !backdrop || !context || !magnifier) return;
    const zoom = 4;
    canvas.width = 132;
    canvas.height = 96;
    const sw = canvas.width / zoom;
    const sh = canvas.height / zoom;
    const sx = Math.max(0, Math.min(backdrop.width - sw * scale, (magnifier.x - sw / 2) * scale));
    const sy = Math.max(0, Math.min(backdrop.height - sh * scale, (magnifier.y - sh / 2) * scale));
    context.imageSmoothingEnabled = false;
    context.drawImage(backdrop, sx, sy, sw * scale, sh * scale, 0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#ff3ea5";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(canvas.width / 2, 0);
    context.lineTo(canvas.width / 2, canvas.height);
    context.moveTo(0, canvas.height / 2);
    context.lineTo(canvas.width, canvas.height / 2);
    context.stroke();
  }, [magnifier, scale]);

  useEffect(() => {
    if (!editing) return;
    textInputRef.current?.focus();
    const timer = window.setTimeout(() => textInputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [editing]);

  const dismiss = useCallback(() => {
    void dismissScreenshot().catch(() => {});
    setRect(null);
    setItems([]);
    setDraft(null);
    setEditing(null);
    setSelected(null);
    setOcrText(null);
    setMagnifier(null);
  }, []);

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
  }, [rect, scale]);

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
  }, [rect, scale]);

  const commitText = useCallback(
    (state: Editing) => {
      const value = state.value.trim();
      const size = { w: measureText(value, state.size, state.font, state.bold, state.italic), h: measureHeight(value, state.size) };
      setItems((list) => {
        if (state.index !== null) {
          if (!value) return list.filter((_, index) => index !== state.index);
          return list.map((item, index) =>
            index === state.index && item.kind === "text"
              ? {
                  ...item,
                  text: value,
                  size: state.size,
                  font: state.font,
                  color: state.color,
                  bold: state.bold,
                  italic: state.italic,
                  underline: state.underline,
                  strike: state.strike,
                  angle: state.angle,
                  ...size,
                }
              : item,
          );
        }
        if (!value) return list;
        return [
          ...list,
          {
            kind: "text",
            color: state.color,
            size: state.size,
            font: state.font,
            at: state.at,
            text: value,
            bold: state.bold,
            italic: state.italic,
            underline: state.underline,
            strike: state.strike,
            angle: state.angle,
            ...size,
          },
        ];
      });
      setEditing(null);
    },
    [],
  );

  const recognize = useCallback(async () => {
    const png = cropRaw();
    if (!png || ocrBusy) return;
    setOcrBusy(true);
    try {
      setOcrText(await ocrScreenshotPng(png));
    } catch (error) {
      setOcrText(`识别失败：${String(error)}`);
    } finally {
      setOcrBusy(false);
    }
  }, [cropRaw, ocrBusy]);

  /** 划词翻译：识别每行文字，翻译后把译文画在原文下一行。 */
  const translateInline = useCallback(async () => {
    const png = cropRaw();
    if (!png || ocrBusy) return;
    setOcrBusy(true);
    try {
      const lines = await ocrScreenshotLines(png);
      if (lines.length === 0) {
        setOcrText("没有识别到文字");
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
        setOcrText("翻译没有返回结果，请检查翻译服务是否已配置");
        return;
      }
      setItems((list) => [...list, ...created]);
      setOcrText(null);
    } catch (error) {
      setOcrText(`翻译失败：${String(error)}`);
    } finally {
      setOcrBusy(false);
    }
  }, [cropRaw, ocrBusy, scale, textFont]);
  const copy = useCallback(async () => {
    const png = compose();
    if (!png || busy.current) return;
    busy.current = true;
    try {
      await copyScreenshotPng(png);
      dismiss();
    } finally {
      busy.current = false;
    }
  }, [compose, dismiss]);

  const save = useCallback(async () => {
    const png = compose();
    if (!png || busy.current) return;
    busy.current = true;
    try {
      await saveScreenshotPng(png);
      dismiss();
    } finally {
      busy.current = false;
    }
  }, [compose, dismiss]);

  const recognizeAndCopy = useCallback(async () => {
    const png = cropRaw();
    if (!png) return;
    try {
      const text = await ocrScreenshotPng(png);
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);
      dismiss();
    } catch {
      // 复制失败时保持覆盖层，用户还能手动复制
    }
  }, [cropRaw, dismiss]);

  useEffect(() => {
    const shortcuts: Record<string, Tool> = {
      v: "move",
      r: "shape",
      a: "arrow",
      p: "pen",
      n: "number",
      t: "text",
      m: "mosaic",
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!editing && !event.ctrlKey && !event.metaKey && shortcuts[key]) {
        event.preventDefault();
        setTool(shortcuts[key]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (editing) setEditing(null);
        else dismiss();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected !== null && !editing) {
        event.preventDefault();
        setItems((list) => list.filter((_, index) => index !== selected));
        setSelected(null);
      } else if (event.key === "Enter" && !editing) {
        event.preventDefault();
        if (tool === "text" && rect) {
          setEditing({
            index: null,
            at: { x: rect.width / 2 - 30, y: rect.height / 2 - 12 },
            value: "",
            size: textSize,
            font: textFont,
            angle: 0,
            color,
            ...textFormat,
          });
        } else {
          void copy();
        }
      } else if (event.shiftKey && key === "c" && !editing) {
        event.preventDefault();
        void recognizeAndCopy();
      } else if ((event.ctrlKey || event.metaKey) && key === "z" && !editing) {
        event.preventDefault();
        setItems((value) => value.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [color, copy, dismiss, editing, recognizeAndCopy, rect, selected, textFont, textFormat, textSize, tool]);

  const local = (event: React.PointerEvent): Point => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  /** 慢速拖动才出放大镜：速度快时认为是"扫"，不打扰。 */
  const updateMagnifier = (x: number, y: number) => {
    const now = performance.now();
    const previous = lastMove.current;
    lastMove.current = { x, y, time: now };
    if (!previous) return;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    const elapsed = Math.max(1, now - previous.time);
    setMagnifier(distance / elapsed < 0.45 ? { x, y } : null);
  };

  const onOverlayDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // 点旋转手柄、框体控制点、或文本框内部都不应该提交
    if (target.dataset.rotate || target.dataset.handle || target.dataset.textbox) return;
    if (target.closest(".screenshot-text-input")) return;
    if (editing) {
      commitText(editing);
      return;
    }
    if (event.button !== 0 || rect) return;
    pendingSnap.current = hoverIndex >= 0 ? (windowRects.current[hoverIndex] ?? null) : null;
    drag.current = { mode: "create", from: { x: event.clientX, y: event.clientY } };
    setRect({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onOverlayMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) {
      if (!rect) {
        const point = { x: event.clientX, y: event.clientY };
        setHoverIndex(
          windowRects.current.findIndex(
            (item) =>
              point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height,
          ),
        );
      }
      return;
    }
    if (current.mode === "draw" || current.mode === "text") return;
    updateMagnifier(event.clientX, event.clientY);
    if (current.mode === "create") {
      setRect(fromPoints(current.from, { x: event.clientX, y: event.clientY }));
    } else if (current.mode === "move") {
      setRect({
        x: current.origin.x + event.clientX - current.from.x,
        y: current.origin.y + event.clientY - current.from.y,
        width: current.origin.width,
        height: current.origin.height,
      });
    } else if (current.mode === "resize") {
      setRect(resize(current.origin, current.handle, event.clientX - current.from.x, event.clientY - current.from.y));
    }
  };

  const onOverlayUp = () => {
    const current = drag.current;
    drag.current = null;
    lastMove.current = null;
    setMagnifier(null);
    if (!current) return;
    if (current.mode === "create") {
      const snap = pendingSnap.current;
      pendingSnap.current = null;
      setRect((value) => {
        if (value && value.width >= MIN_SIZE && value.height >= MIN_SIZE) return value;
        if (snap) return snap;
        return null;
      });
    } else {
      pendingSnap.current = null;
      setRect((value) => (value && value.width >= MIN_SIZE && value.height >= MIN_SIZE ? value : null));
    }
  };

  const onCanvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const at = local(event);
    if (tool === "text") {
      const hit = hitText(items, at);
      const target = hit === null ? null : items[hit];
      if (target && target.kind === "text") {
        setEditing({
          index: hit,
          at: target.at,
          value: target.text,
          size: target.size,
          font: target.font,
          angle: target.angle ?? 0,
          color: target.color,
          bold: target.bold ?? false,
          italic: target.italic ?? false,
          underline: target.underline ?? false,
          strike: target.strike ?? false,
        });
      } else {
        setEditing({
          index: null,
          at,
          value: "",
          size: textSize,
          font: textFont,
          angle: 0,
          color,
          ...textFormat,
        });
      }
      return;
    }
    if (tool === "move") {
      // 先看是不是点在文字上：是就拖动它。
      const textHit = hitText(items, at);
      const textTarget = textHit === null ? null : items[textHit];
      if (textHit !== null && textTarget && textTarget.kind === "text") {
        drag.current = { mode: "text", index: textHit, from: at, origin: { ...textTarget.at } };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      // 再看是不是点在框/椭圆/箭头上：选中它（滚轮改粗细、色板改色）。
      const strokeHit = hitStroke(items, at);
      if (strokeHit !== null) {
        setSelected(strokeHit);
        return;
      }
      setSelected(null);
      if (!rect) return;
      drag.current = { mode: "move", from: { x: event.clientX, y: event.clientY }, origin: rect };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    drag.current = { mode: "draw" };
    if (tool === "pen") setDraft({ kind: "pen", color, width: strokeWidth, dash, points: [at] });
    else if (tool === "number") {
      const nextNumber = counters.current[numberStyle]++;
      setItems((value) => [...value, { kind: "number", color, size: numberSize, at, value: nextNumber, style: numberStyle }]);
      drag.current = null;
    } else if (tool === "mosaic") setDraft({ kind: "mosaic", size: mosaicSize, from: at, to: at });
    else if (tool === "arrow") setDraft({ kind: "arrow", color, width: strokeWidth, dash, from: at, to: at });
    else setDraft({ kind: shape, color, width: strokeWidth, dash, from: at, to: at });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current) return;
    if (current.mode === "text") {
      const at = local(event);
      setItems((list) =>
        list.map((item, index) =>
          index === current.index && item.kind === "text"
            ? { ...item, at: { x: current.origin.x + at.x - current.from.x, y: current.origin.y + at.y - current.from.y } }
            : item,
        ),
      );
      return;
    }
    if (current.mode !== "draw") return;
    const at = local(event);
    setDraft((value) => {
      if (!value) return value;
      if (value.kind === "pen") return { ...value, points: [...value.points, at] };
      if (value.kind === "text" || value.kind === "number") return value;
      return { ...value, to: at };
    });
  };

  const onCanvasUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.mode === "text") {
      // 没怎么动 = 单击：进入编辑，工具栏就能改字体/字号/颜色/加粗等。
      const at = local(event);
      if (Math.hypot(at.x - current.from.x, at.y - current.from.y) < 3) {
        const target = items[current.index];
        if (target && target.kind === "text") {
          setEditing({
            index: current.index,
            at: target.at,
            value: target.text,
            size: target.size,
            font: target.font,
            angle: target.angle ?? 0,
            color: target.color,
            bold: target.bold ?? false,
            italic: target.italic ?? false,
            underline: target.underline ?? false,
            strike: target.strike ?? false,
          });
        }
      }
      return;
    }
    if (current.mode !== "draw") return;
    setDraft((value) => {
      if (value) setItems((list) => [...list, value]);
      return null;
    });
  };

  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !rect) return;
    event.stopPropagation();
    drag.current = { mode: "move", from: { x: event.clientX, y: event.clientY }, origin: rect };
  };

  const startResize = (handle: Handle) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !rect) return;
    event.stopPropagation();
    drag.current = { mode: "resize", handle, from: { x: event.clientX, y: event.clientY }, origin: rect };
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const step = event.deltaY < 0 ? 1 : -1;
    if (selected !== null) {
      setItems((list) =>
        list.map((item, index) => {
          if (index !== selected) return item;
          if (item.kind === "text" || item.kind === "number") {
            return { ...item, size: Math.max(8, Math.min(160, item.size + step * 2)) };
          }
          if (item.kind === "mosaic") return { ...item, size: Math.max(4, Math.min(40, item.size + step * 2)) };
          // Shift+滚轮：改线宽；普通滚轮：缩放大小。
          if (event.shiftKey) {
            return { ...item, width: Math.max(1, Math.min(24, item.width + step)) };
          }
          return scaleItem(item, event.deltaY < 0 ? 1.04 : 0.96);
        }),
      );
      return;
    }
    if (editing) return;
    if (!rect) {
      const total = windowRects.current.length;
      if (total === 0) return;
      setHoverIndex((value) => (value < 0 ? 0 : (value + step + total) % total));
      return;
    }
    if (tool === "shape" || tool === "arrow" || tool === "pen") {
      setStrokeWidth((value) => Math.max(1, Math.min(24, value + step)));
    } else if (tool === "mosaic") {
      setMosaicSize((value) => Math.max(4, Math.min(40, value + step * 2)));
    } else if (tool === "text") {
      setTextSize((value) => Math.max(8, Math.min(160, value + step * 2)));
    } else if (tool === "number") {
      setNumberSize((value) => Math.max(12, Math.min(120, value + step * 2)));
    }
  };

  /** 选中标注的节点位置（相对选区左上角）。 */
  const nodePoints = (item: Annotation): { key: string; point: Point }[] => {
    if (item.kind === "arrow") {
      return [
        { key: "from", point: item.from },
        { key: "to", point: item.to },
      ];
    }
    if (item.kind === "rect" || item.kind === "ellipse") {
      const left = Math.min(item.from.x, item.to.x);
      const right = Math.max(item.from.x, item.to.x);
      const top = Math.min(item.from.y, item.to.y);
      const bottom = Math.max(item.from.y, item.to.y);
      return [
        { key: "nw", point: { x: left, y: top } },
        { key: "ne", point: { x: right, y: top } },
        { key: "sw", point: { x: left, y: bottom } },
        { key: "se", point: { x: right, y: bottom } },
      ];
    }
    return [];
  };

  const onNodeMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const current = drag.current;
    if (!current || current.mode !== "node") return;
    const dx = event.clientX - current.from.x;
    const dy = event.clientY - current.from.y;
    setItems((list) =>
      list.map((item, index) => {
        if (index !== current.index) return item;
        const { from, to } = current.origin;
        if (item.kind === "arrow") {
          return current.key === "from"
            ? { ...item, from: { x: from.x + dx, y: from.y + dy } }
            : { ...item, to: { x: to.x + dx, y: to.y + dy } };
        }
        if (item.kind === "rect" || item.kind === "ellipse") {
          const left = Math.min(from.x, to.x);
          const right = Math.max(from.x, to.x);
          const top = Math.min(from.y, to.y);
          const bottom = Math.max(from.y, to.y);
          let nextLeft = left;
          let nextRight = right;
          let nextTop = top;
          let nextBottom = bottom;
          if (current.key.includes("w")) nextLeft = left + dx;
          if (current.key.includes("e")) nextRight = right + dx;
          if (current.key.includes("n")) nextTop = top + dy;
          if (current.key.includes("s")) nextBottom = bottom + dy;
          return {
            ...item,
            from: { x: nextLeft, y: nextTop },
            to: { x: nextRight, y: nextBottom },
          };
        }
        return item;
      }),
    );
  };
  const selectedItem = selected === null ? null : items[selected];
  const selectedText = selectedItem && selectedItem.kind === "text" ? selectedItem : null;

  /** 改文字属性：编辑中就改编辑态，否则改选中的那条文字。 */
  const patchText = (patch: Record<string, unknown>) => {
    if (editing) {
      setEditing({ ...editing, ...patch } as Editing);
      return;
    }
    if (selected === null) return;
    setItems((list) =>
      list.map((item, index) => {
        if (index !== selected || item.kind !== "text") return item;
        const next = { ...item, ...patch } as typeof item;
        const size = next.size;
        return { ...next, w: measureText(next.text, size, next.font, next.bold, next.italic), h: measureHeight(next.text, size) };
      }),
    );
  };
  const strokeable = tool === "shape" || tool === "arrow" || tool === "pen";
  const editWidth = editing ? measureText(editing.value, editing.size, editing.font, editing.bold, editing.italic) : 0;
  const editHeight = measureHeight(editing?.value ?? "", editing?.size ?? 20);
  const textBox = editing
    ? { x: editing.at.x, y: editing.at.y, w: editWidth, h: editHeight, angle: editing.angle }
    : selectedText
      ? {
          x: selectedText.at.x,
          y: selectedText.at.y,
          w: selectedText.w ?? measureText(selectedText.text, selectedText.size, selectedText.font, selectedText.bold, selectedText.italic),
          h: selectedText.h ?? measureHeight(selectedText.text, selectedText.size),
          angle: selectedText.angle ?? 0,
        }
      : null;

  return (
    <div
      className="screenshot-overlay"
      onPointerDown={onOverlayDown}
      onPointerMove={onOverlayMove}
      onPointerUp={onOverlayUp}
      onWheel={onWheel}
      onContextMenu={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <canvas ref={backdropRef} className="screenshot-backdrop" />

      {failure ? <p className="screenshot-failure">{failure}</p> : null}

      {hoverIndex >= 0 && !rect && windowRects.current[hoverIndex] ? (
        <div
          className="screenshot-hover"
          style={{
            left: windowRects.current[hoverIndex].x,
            top: windowRects.current[hoverIndex].y,
            width: windowRects.current[hoverIndex].width,
            height: windowRects.current[hoverIndex].height,
          }}
        >
          <span className="screenshot-size">
            {Math.round(windowRects.current[hoverIndex].width)} × {Math.round(windowRects.current[hoverIndex].height)}
          </span>
        </div>
      ) : null}

      {magnifier ? (
        <canvas
          ref={magnifierRef}
          className="screenshot-magnifier"
          style={{
            left: Math.min(magnifier.x + 18, window.innerWidth - 140),
            top: Math.min(magnifier.y + 18, window.innerHeight - 104),
          }}
        />
      ) : null}

      {rect ? (
        <>
          <div
            className="screenshot-selection"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            onPointerDown={startMove}
            onPointerMove={onOverlayMove}
            onPointerUp={onOverlayUp}
          >
            <span className="screenshot-size">
              {Math.round(rect.width)} × {Math.round(rect.height)}
            </span>
            {HANDLES.map((handle) => (
              <span
                key={handle}
                className={`screenshot-handle screenshot-handle-${handle}`}
                onPointerDown={startResize(handle)}
                onPointerMove={onOverlayMove}
                onPointerUp={onOverlayUp}
              />
            ))}
            <span className="screenshot-move-strip screenshot-strip-top" onPointerDown={startMove} />
            <span className="screenshot-move-strip screenshot-strip-bottom" onPointerDown={startMove} />
            <span className="screenshot-move-strip screenshot-strip-left" onPointerDown={startMove} />
            <span className="screenshot-move-strip screenshot-strip-right" onPointerDown={startMove} />
          </div>

          <canvas
            ref={canvasRef}
            className="screenshot-canvas"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
          />

          {selected !== null && items[selected] && nodePoints(items[selected]).length > 0
            ? nodePoints(items[selected]).map((node) => (
                <span
                  key={node.key}
                  className="screenshot-node"
                  data-node="1"
                  style={{ left: rect.x + node.point.x - 5, top: rect.y + node.point.y - 5 }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const target = items[selected];
                    if (!target) return;
                    drag.current = {
                      mode: "node",
                      index: selected,
                      key: node.key,
                      from: { x: event.clientX, y: event.clientY },
                      origin:
                        target.kind === "arrow" || target.kind === "rect" || target.kind === "ellipse"
                          ? { from: { ...target.from }, to: { ...target.to } }
                          : { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={onNodeMove}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                />
              ))
            : null}
          {textBox && rect ? (
            <div
              className="screenshot-textbox"
              data-textbox="1"
              style={{
                left: rect.x + textBox.x - 1,
                top: rect.y + textBox.y - 1,
                width: textBox.w + 10,
                height: textBox.h + 6,
              }}
            >
              {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((key) => (
                <span
                  key={key}
                  className={`screenshot-textbox-handle screenshot-textbox-handle-${key}`}
                  data-handle="1"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    textResize.current = {
                      from: { x: event.clientX, y: event.clientY },
                      center: { x: rect.x + textBox.x + textBox.w / 2, y: rect.y + textBox.y + textBox.h / 2 },
                      size: editing ? editing.size : (selectedText?.size ?? textSize),
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const state = textResize.current;
                    if (!state) return;
                    const before = Math.hypot(state.from.x - state.center.x, state.from.y - state.center.y);
                    const after = Math.hypot(event.clientX - state.center.x, event.clientY - state.center.y);
                    if (before < 4) return;
                    const next = Math.max(8, Math.min(200, Math.round((state.size * after) / before)));
                    if (editing) setEditing((value) => (value ? { ...value, size: next } : value));
                    else patchText({ size: next });
                  }}
                  onPointerUp={() => {
                    textResize.current = null;
                  }}
                />
              ))}
              <span
                className="screenshot-rotate"
                data-rotate="1"
                title="拖动旋转"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  rotateCenter.current = {
                    x: rect.x + textBox.x + textBox.w / 2,
                    y: rect.y + textBox.y + textBox.h / 2,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!rotateCenter.current) return;
                  const dx = event.clientX - rotateCenter.current.x;
                  const dy = event.clientY - rotateCenter.current.y;
                  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
                  const angle = Math.round((degrees + 360) % 360);
                  if (editing) setEditing((value) => (value ? { ...value, angle } : value));
                  else patchText({ angle });
                }}
                onPointerUp={() => {
                  rotateCenter.current = null;
                }}
              >
                ↻
              </span>
            </div>
          ) : null}
          {editing ? (
            <textarea
              className="screenshot-text-input"
              ref={textInputRef}
              value={editing.value}
              style={{
                left: rect.x + editing.at.x,
                top: rect.y + editing.at.y,
                width: `${Math.round(editWidth) + 8}px`,
                height: `${Math.round(editHeight) + 4}px`,
                padding: 0,
                boxSizing: "border-box",
                color: editing.color,
                fontSize: editing.size,
                fontFamily: editing.font,
                lineHeight: 1.4,
                fontWeight: editing.bold ? 700 : 400,
                fontStyle: editing.italic ? "italic" : "normal",
                textDecoration:
                  [editing.underline ? "underline" : "", editing.strike ? "line-through" : ""].filter(Boolean).join(" ") ||
                  "none",
                transform: `rotate(${editing.angle}deg)`,
                transformOrigin: "center",
              }}
              onChange={(event) => setEditing({ ...editing, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditing(null);
                } else if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  commitText(editing);
                }
              }}
            />
          ) : null}

          <div className="screenshot-rows" style={{ left: rect.x, top: rect.y + rect.height + 10 }}>
            {tool !== "move" || selectedText ? (
              <div className="screenshot-row screenshot-row-options">
                {tool === "shape" ? (
                  <>
                    <button
                      type="button"
                      className={`screenshot-chip ${shape === "rect" ? "screenshot-chip-active" : ""}`}
                      title="方框"
                      aria-label="方框"
                      onClick={() => setShape("rect")}
                    >
                      <Square size={18} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={`screenshot-chip ${shape === "ellipse" ? "screenshot-chip-active" : ""}`}
                      title="椭圆框"
                      aria-label="椭圆框"
                      onClick={() => setShape("ellipse")}
                    >
                      <Circle size={18} aria-hidden />
                    </button>
                  </>
                ) : null}

                {strokeable ? (
                  <>
                    {DASHES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`screenshot-chip screenshot-chip-dash ${dash === item.id ? "screenshot-chip-active" : ""}`}
                        title={item.label}
                        aria-label={item.label}
                        onClick={() => setDash(item.id)}
                      >
                        <span className={`screenshot-dash-line screenshot-dash-${item.id}`} />
                      </button>
                    ))}
                    <input
                      className="screenshot-range"
                      type="range"
                      min={1}
                      max={24}
                      value={strokeWidth}
                      title={`线宽 ${strokeWidth}px`}
                      aria-label="线宽"
                      onChange={(event) => setStrokeWidth(Number(event.target.value))}
                    />
                  </>
                ) : null}

                {tool === "number" ? (
                  <>
                    {(["arabic", "alpha", "roman"] as NumberStyle[]).map((style) => (
                      <button
                        key={style}
                        type="button"
                        className={`screenshot-chip ${numberStyle === style ? "screenshot-chip-active" : ""}`}
                        title={style === "arabic" ? "1 2 3" : style === "alpha" ? "a b c" : "i ii iii"}
                        aria-label={style}
                        onClick={() => {
                          counters.current[style] = 1;
                          setNumberStyle(style);
                        }}
                      >
                        {style === "arabic" ? "1" : style === "alpha" ? "a" : "i"}
                      </button>
                    ))}
                    <input
                      className="screenshot-range"
                      type="range"
                      min={12}
                      max={72}
                      value={numberSize}
                      aria-label="序号字号"
                      onChange={(event) => setNumberSize(Number(event.target.value))}
                    />
                  </>
                ) : null}

                {tool === "mosaic" ? (
                  <label className="screenshot-option-label">
                    颗粒
                    <input
                      className="screenshot-range"
                      type="range"
                      min={4}
                      max={40}
                      value={mosaicSize}
                      aria-label="马赛克颗粒"
                      onChange={(event) => setMosaicSize(Number(event.target.value))}
                    />
                  </label>
                ) : null}

                {tool === "text" ? (
                  <>
                    <select
                      className="screenshot-select"
                      value={editing?.font ?? selectedText?.font ?? textFont}
                      onChange={(event) => {
                        if (editing) setEditing({ ...editing, font: event.target.value });
                        else if (selectedText) patchText({ font: event.target.value });
                        else setTextFont(event.target.value);
                      }}
                    >
                      {(() => {
                        const current = editing?.font ?? selectedText?.font ?? textFont;
                        return fonts.includes(current) ? null : <option value={current}>{current}</option>;
                      })()}
                      {fonts.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                    <input
                      className="screenshot-number"
                      type="number"
                      min={8}
                      max={160}
                      value={editing?.size ?? selectedText?.size ?? textSize}
                      aria-label="字号"
                      onChange={(event) => {
                        const next = Math.max(8, Math.min(160, Number(event.target.value)));
                        if (editing) setEditing({ ...editing, size: next });
                        else if (selectedText) patchText({ size: next });
                        else setTextSize(next);
                      }}
                    />
                    {FORMATS.map((format) => (
                      <button
                        key={format.key}
                        type="button"
                        className={`screenshot-chip ${(editing ?? selectedText ?? textFormat)[format.key] ? "screenshot-chip-active" : ""}`}
                        title={format.title}
                        aria-label={format.title}
                        onClick={() => {
                          if (editing) setEditing({ ...editing, [format.key]: !editing[format.key] });
                          else if (selectedText) patchText({ [format.key]: !selectedText[format.key] });
                          else setTextFormat({ ...textFormat, [format.key]: !textFormat[format.key] });
                        }}
                      >
                        <span
                          style={{
                            fontSize: 15,
                            lineHeight: 1,
                            fontWeight: format.key === "bold" ? 800 : 500,
                            fontFamily: format.key === "italic" ? "Georgia, Times New Roman, serif" : undefined,
                            fontStyle: format.key === "italic" ? "italic" : "normal",
                            textDecoration:
                              format.key === "underline" ? "underline" : format.key === "strike" ? "line-through" : "none",
                          }}
                        >
                          {format.label}
                        </span>
                      </button>
                    ))}
                  </>
                ) : null}

                <span className="screenshot-colors">
                  {COLORS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={value}
                      title={value}
                      className={`screenshot-color ${color === value ? "screenshot-color-active" : ""}`}
                      style={{ background: value }}
                      onClick={() => {
                        if (editing) {
                          setEditing({ ...editing, color: value });
                          return;
                        }
                        if (selectedText) {
                          patchText({ color: value });
                          return;
                        }
                        if (selected !== null) {
                          setItems((list) =>
                            list.map((item, index) => (index === selected && "color" in item ? { ...item, color: value } : item)),
                          );
                          return;
                        }
                        setColor(value);
                      }}
                    />
                  ))}
                </span>
              </div>
            ) : null}

            <div className="screenshot-row">
              {TOOLS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`screenshot-tool ${tool === item.id ? "screenshot-tool-active" : ""}`}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setTool(item.id)}
                >
                  <item.Icon size={19} aria-hidden />
                </button>
              ))}
              <button type="button" className="screenshot-tool" title="识别文字" aria-label="识别文字" onClick={() => void recognize()}>
                <ScanText size={19} aria-hidden />
              </button>
              <button
                type="button"
                className="screenshot-tool"
                title="划词翻译：把译文画在原文下面"
                aria-label="翻译"
                onClick={() => void translateInline()}
                disabled={ocrBusy}
              >
                <Languages size={19} aria-hidden />
              </button>
              <button
                type="button"
                className="screenshot-tool"
                title="撤销 (Ctrl+Z)"
                aria-label="撤销"
                onClick={() => setItems((value) => value.slice(0, -1))}
              >
                <Undo2 size={19} aria-hidden />
              </button>
              <span className="screenshot-build">v0.4.0</span>
            </div>

            <div className="screenshot-row screenshot-row-actions">
              <button type="button" className="screenshot-tool" title="保存图片" aria-label="保存图片" onClick={() => void save()}>
                <Save size={19} aria-hidden />
              </button>
              <button
                type="button"
                className="screenshot-tool screenshot-tool-primary"
                title="复制图片 (Enter)"
                aria-label="复制图片"
                onClick={() => void copy()}
              >
                <Check size={19} aria-hidden />
              </button>
              <button type="button" className="screenshot-tool" title="取消 (Esc)" aria-label="取消" onClick={dismiss}>
                <X size={19} aria-hidden />
              </button>
            </div>

            {ocrText !== null ? (
              <div className="screenshot-row screenshot-row-ocr">
                <textarea
                  className="screenshot-ocr-text"
                  value={ocrText}
                  spellCheck={false}
                  onChange={(event) => setOcrText(event.target.value)}
                />
                <div className="screenshot-ocr-actions">
                  <button
                    type="button"
                    className="screenshot-tool"
                    title="复制识别结果"
                    aria-label="复制识别结果"
                    onClick={() => void navigator.clipboard.writeText(ocrText)}
                  >
                    <Copy size={17} aria-hidden />
                  </button>
                  <button type="button" className="screenshot-tool" title="关闭" aria-label="关闭" onClick={() => setOcrText(null)}>
                    <X size={17} aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="screenshot-dim" />
          <p className="screenshot-hint">拖拽选择区域，Esc 取消</p>
        </>
      )}
    </div>
  );
}



