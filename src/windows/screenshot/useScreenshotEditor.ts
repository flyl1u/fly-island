// 截图覆盖层的状态：工具样式、选区、标注列表、文字编辑态，以及由此派生的尺寸。
// 指针交互在 useScreenshotGestures 里，抓屏与导出在 useScreenshotCapture 里。
import { useCallback, useRef, useState } from "react";
import {
  COLORS,
  measureHeight,
  measureText,
  type Annotation,
  type Dash,
  type NumberStyle,
  type Point,
  type Shape,
  type Tool,
} from "../../features/screenshot/annotations";
import type { ScreenRect } from "../../features/screenshot/api";
import { FALLBACK_FONTS } from "./useScreenshotCapture";

export type TextFormat = { bold: boolean; italic: boolean; underline: boolean; strike: boolean };

export type Editing = {
  index: number | null;
  at: Point;
  value: string;
  size: number;
  font: string;
  angle: number;
  color: string;
} & TextFormat;

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type Drag =
  | { mode: "create"; from: Point }
  | { mode: "move"; from: Point; origin: ScreenRect }
  | { mode: "resize"; handle: Handle; from: Point; origin: ScreenRect }
  | { mode: "draw" }
  | { mode: "text"; index: number; from: Point; origin: Point }
  | { mode: "node"; index: number; key: string; from: Point; origin: { from: Point; to: Point } };

export type EditorState = ReturnType<typeof useScreenshotEditor>;

/** 选区最小的边长（CSS 像素）：再小就当没选。 */
export const MIN_SELECTION = 4;

export function useScreenshotEditor() {
  const [tool, setTool] = useState<Tool>("move");
  const [shape, setShape] = useState<Shape>("rect");
  const [dash, setDash] = useState<Dash>("solid");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [textSize, setTextSize] = useState(20);
  const [textFont, setTextFont] = useState(FALLBACK_FONTS[0]);
  const [textFormat, setTextFormat] = useState<TextFormat>({ bold: false, italic: false, underline: false, strike: false });
  const [numberStyle, setNumberStyle] = useState<NumberStyle>("arabic");
  const [numberSize, setNumberSize] = useState(28);
  const [mosaicSize, setMosaicSize] = useState(12);
  const [color, setColor] = useState(COLORS[0]);
  const [rect, setRect] = useState<ScreenRect | null>(null);
  const [items, setItems] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [magnifier, setMagnifier] = useState<Point | null>(null);
  /** 正在拖选区/拖控制点：工具栏要藏起来，松手再显示，避免挡住拖拽。 */
  const [dragging, setDragging] = useState(false);

  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const pendingSnap = useRef<ScreenRect | null>(null);
  const lastMove = useRef<{ x: number; y: number; time: number } | null>(null);
  const rotateCenter = useRef<Point | null>(null);
  const textResize = useRef<{ from: Point; center: Point; size: number } | null>(null);
  const counters = useRef<Record<NumberStyle, number>>({ arabic: 1, alpha: 1, roman: 1 });

  /** 抓新底图、取消、导出之后都把标注层清干净；工具也回到移动，不记忆上一次选的工具。 */
  const reset = useCallback(() => {
    setTool("move");
    setRect(null);
    setItems([]);
    setDraft(null);
    setEditing(null);
    setSelected(null);
    setMagnifier(null);
    setDragging(false);
    counters.current = { arabic: 1, alpha: 1, roman: 1 };
    drag.current = null;
    pendingSnap.current = null;
    lastMove.current = null;
  }, []);

  const addItems = useCallback((extra: Annotation[]) => setItems((list) => [...list, ...extra]), []);

  const commitText = useCallback((state: Editing) => {
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
  }, []);

  /** 改文字属性：编辑中就改编辑态，否则改选中的那条文字。 */
  const patchText = useCallback(
    (patch: Record<string, unknown>) => {
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
    },
    [editing, selected],
  );

  /** 点已有的文字：带着它当前的样式进入编辑。 */
  const editExistingText = (index: number, target: Extract<Annotation, { kind: "text" }>) => {
    setEditing({
      index,
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
  };

  /** 点空白：在这一点上新建一条文字。 */
  const startNewText = (at: Point) => {
    setEditing({ index: null, at, value: "", size: textSize, font: textFont, angle: 0, color, ...textFormat });
  };

  const selectedItem = selected === null ? null : items[selected];
  const selectedText = selectedItem && selectedItem.kind === "text" ? selectedItem : null;
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

  return {
    tool,
    setTool,
    shape,
    setShape,
    dash,
    setDash,
    strokeWidth,
    setStrokeWidth,
    textSize,
    setTextSize,
    textFont,
    setTextFont,
    textFormat,
    setTextFormat,
    numberStyle,
    setNumberStyle,
    numberSize,
    setNumberSize,
    mosaicSize,
    setMosaicSize,
    color,
    setColor,
    rect,
    setRect,
    items,
    setItems,
    draft,
    setDraft,
    editing,
    setEditing,
    selected,
    setSelected,
    hoverIndex,
    setHoverIndex,
    magnifier,
    setMagnifier,
    dragging,
    setDragging,
    selectedText,
    textBox,
    editWidth,
    editHeight,
    textInputRef,
    textResize,
    rotateCenter,
    drag,
    pendingSnap,
    lastMove,
    counters,
    reset,
    addItems,
    commitText,
    patchText,
    editExistingText,
    startNewText,
  };
}
