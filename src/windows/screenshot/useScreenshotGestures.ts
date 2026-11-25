// 截图覆盖层的指针交互：拉选区、拖控制点、在标注层上画/选/拖/缩放。
// 状态全部来自 useScreenshotEditor，这里只有「指针进来之后做什么」。
import { hitStroke, hitText, scaleItem, type Annotation, type Point, type Tool } from "../../features/screenshot/annotations";
import type { ScreenRect } from "../../features/screenshot/api";
import { MIN_SELECTION, type EditorState, type Handle } from "./useScreenshotEditor";

/** 两个点拉出的选区：左上角 + 正宽高。 */
function fromPoints(a: Point, b: Point): ScreenRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** 拖控制点改选区大小；不给小于 MIN_SELECTION 的边。 */
function resizeRect(origin: ScreenRect, handle: Handle, dx: number, dy: number): ScreenRect {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;
  if (right - left < MIN_SELECTION) {
    if (handle.includes("w")) left = right - MIN_SELECTION;
    else right = left + MIN_SELECTION;
  }
  if (bottom - top < MIN_SELECTION) {
    if (handle.includes("n")) top = bottom - MIN_SELECTION;
    else bottom = top + MIN_SELECTION;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 指针相对元素左上角的坐标（标注坐标就是选区内 CSS 像素）。 */
function local(event: React.PointerEvent): Point {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/** 拖边框控制点：按 nw/ne/sw/se 的方位各自挪对应的边。 */
function resizeNodes(item: Extract<Annotation, { kind: "rect" | "ellipse" }>, key: string, dx: number, dy: number): Annotation {
  const left = Math.min(item.from.x, item.to.x);
  const right = Math.max(item.from.x, item.to.x);
  const top = Math.min(item.from.y, item.to.y);
  const bottom = Math.max(item.from.y, item.to.y);
  const nextLeft = key.includes("w") ? left + dx : left;
  const nextRight = key.includes("e") ? right + dx : right;
  const nextTop = key.includes("n") ? top + dy : top;
  const nextBottom = key.includes("s") ? bottom + dy : bottom;
  return { ...item, from: { x: nextLeft, y: nextTop }, to: { x: nextRight, y: nextBottom } };
}

export function useScreenshotGestures(editor: EditorState) {
  /** 慢速拖动才出放大镜：速度快时认为是「扫」，不打扰。 */
  const updateMagnifier = (x: number, y: number) => {
    const now = performance.now();
    const previous = editor.lastMove.current;
    editor.lastMove.current = { x, y, time: now };
    if (!previous) return;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    const elapsed = Math.max(1, now - previous.time);
    editor.setMagnifier(distance / elapsed < 0.45 ? { x, y } : null);
  };

  const onOverlayDown = (event: React.PointerEvent<HTMLElement>, windowRects: ScreenRect[]) => {
    const target = event.target as HTMLElement;
    // 点旋转手柄、框体控制点、或文本框内部都不应该提交
    if (target.dataset.rotate || target.dataset.handle || target.dataset.textbox) return;
    if (target.closest(".screenshot-text-input")) return;
    if (editor.editing) {
      editor.commitText(editor.editing);
      return;
    }
    if (event.button !== 0 || editor.rect) return;
    editor.pendingSnap.current = editor.hoverIndex >= 0 ? (windowRects[editor.hoverIndex] ?? null) : null;
    editor.drag.current = { mode: "create", from: { x: event.clientX, y: event.clientY } };
    editor.setDragging(true);
    editor.setRect({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onOverlayMove = (event: React.PointerEvent<HTMLElement>, windowRects: ScreenRect[]) => {
    const current = editor.drag.current;
    if (!current) {
      if (!editor.rect) {
        const point = { x: event.clientX, y: event.clientY };
        editor.setHoverIndex(
          windowRects.findIndex(
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
      editor.setRect(fromPoints(current.from, { x: event.clientX, y: event.clientY }));
    } else if (current.mode === "move") {
      editor.setRect({
        x: current.origin.x + event.clientX - current.from.x,
        y: current.origin.y + event.clientY - current.from.y,
        width: current.origin.width,
        height: current.origin.height,
      });
    } else if (current.mode === "resize") {
      editor.setRect(resizeRect(current.origin, current.handle, event.clientX - current.from.x, event.clientY - current.from.y));
    }
  };

  const onOverlayUp = () => {
    const current = editor.drag.current;
    editor.drag.current = null;
    editor.setDragging(false);
    editor.lastMove.current = null;
    editor.setMagnifier(null);
    if (!current) return;
    if (current.mode === "create") {
      const snap = editor.pendingSnap.current;
      editor.pendingSnap.current = null;
      editor.setRect((value) => {
        if (value && value.width >= MIN_SELECTION && value.height >= MIN_SELECTION) return value;
        if (snap) return snap;
        return null;
      });
    } else {
      editor.pendingSnap.current = null;
      editor.setRect((value) => (value && value.width >= MIN_SELECTION && value.height >= MIN_SELECTION ? value : null));
    }
  };

  const onCanvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const at = local(event);
    if (editor.tool === "text") {
      const hit = hitText(editor.items, at);
      const target = hit === null ? null : editor.items[hit];
      if (hit !== null && target && target.kind === "text") {
        // 点已有文字：先当拖动候选，移动就拖走，没动（单击）才进编辑。
        // 同时选中它，八向控制点/旋转手柄才显示，方便改字号和颜色。
        editor.setSelected(hit);
        editor.drag.current = { mode: "text", index: hit, from: at, origin: { ...target.at } };
        editor.setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else { editor.setSelected(null); editor.startNewText(at); }
      return;
    }
    if (editor.tool === "move") {
      // 先看是不是点在文字上：是就拖动它。
      const textHit = hitText(editor.items, at);
      const textTarget = textHit === null ? null : editor.items[textHit];
      if (textHit !== null && textTarget && textTarget.kind === "text") {
        editor.setSelected(textHit);
        editor.drag.current = { mode: "text", index: textHit, from: at, origin: { ...textTarget.at } };
        editor.setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      // 再看是不是点在框/椭圆/箭头上：选中它（滚轮改粗细、色板改色）。
      const strokeHit = hitStroke(editor.items, at);
      if (strokeHit !== null) {
        editor.setSelected(strokeHit);
        return;
      }
      editor.setSelected(null);
      if (!editor.rect) return;
      editor.drag.current = { mode: "move", from: { x: event.clientX, y: event.clientY }, origin: editor.rect };
      editor.setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    editor.drag.current = { mode: "draw" };
    editor.setDragging(true);
    const style = { color: editor.color, width: editor.strokeWidth, dash: editor.dash };
    if (editor.tool === "pen") editor.setDraft({ kind: "pen", ...style, points: [at] });
    else if (editor.tool === "number") {
      const nextNumber = editor.counters.current[editor.numberStyle]++;
      editor.setItems((value) => [
        ...value,
        { kind: "number", color: editor.color, size: editor.numberSize, at, value: nextNumber, style: editor.numberStyle },
      ]);
      editor.drag.current = null;
      editor.setDragging(false);
    } else if (editor.tool === "mosaic") editor.setDraft({ kind: "mosaic", size: editor.mosaicSize, from: at, to: at });
    else if (editor.tool === "arrow") editor.setDraft({ kind: "arrow", ...style, from: at, to: at });
    else editor.setDraft({ kind: editor.shape, ...style, from: at, to: at });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = editor.drag.current;
    if (!current) return;
    if (current.mode === "text") {
      const at = local(event);
      editor.setItems((list) =>
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
    editor.setDraft((value) => {
      if (!value) return value;
      if (value.kind === "pen") {
        // 按住 Shift：不管之前怎么画，直接拉成起点到当前点的直线。
        if (event.shiftKey && value.points.length > 0) return { ...value, points: [value.points[0], at] };
        return { ...value, points: [...value.points, at] };
      }
      if (value.kind === "text" || value.kind === "number") return value;
      return { ...value, to: at };
    });
  };

  const onCanvasUp = () => {
    const current = editor.drag.current;
    editor.drag.current = null;
    editor.setDragging(false);
    if (!current) return;
    if (current.mode === "text") {
      // 单击只选中（显示框线可拖），双击才进文字编辑；保留框线拖动能力。
      return;
    }
    if (current.mode !== "draw") return;
    editor.setDraft((value) => {
      if (value) editor.setItems((list) => [...list, value]);
      return null;
    });
  };

  const startMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !editor.rect) return;
    event.stopPropagation();
    editor.drag.current = { mode: "move", from: { x: event.clientX, y: event.clientY }, origin: editor.rect };
    editor.setDragging(true);
    // 控制点只有几像素：不锁指针，鼠标一移出事件就丢了，拖拽会「拖不动」。
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResize = (handle: Handle) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !editor.rect) return;
    event.stopPropagation();
    editor.drag.current = { mode: "resize", handle, from: { x: event.clientX, y: event.clientY }, origin: editor.rect };
    editor.setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  /** 画图类工具：拖选区边缘 = 改选区大小（箭头/铅笔也要能拖拽框选区域）；其余工具仍是整体移动。 */
  const DRAW_TOOLS: Tool[] = ["shape", "arrow", "pen", "mosaic"];
  const startStrip = (edge: Handle) => (event: React.PointerEvent<HTMLElement>) => {
    if (DRAW_TOOLS.includes(editor.tool)) return startResize(edge)(event);
    return startMove(event);
  };

  const onWheel = (event: React.WheelEvent<HTMLElement>, windowRects: ScreenRect[]) => {
    event.preventDefault();
    const step = event.deltaY < 0 ? 1 : -1;
    if (editor.selected !== null) {
      editor.setItems((list) =>
        list.map((item, index) => {
          if (index !== editor.selected) return item;
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
    if (editor.editing) return;
    if (!editor.rect) {
      const total = windowRects.length;
      if (total === 0) return;
      editor.setHoverIndex((value) => (value < 0 ? 0 : (value + step + total) % total));
      return;
    }
    if (editor.tool === "shape" || editor.tool === "arrow" || editor.tool === "pen") {
      editor.setStrokeWidth((value) => Math.max(1, Math.min(24, value + step)));
    } else if (editor.tool === "mosaic") {
      editor.setMosaicSize((value) => Math.max(4, Math.min(40, value + step * 2)));
    } else if (editor.tool === "text") {
      editor.setTextSize((value) => Math.max(8, Math.min(160, value + step * 2)));
    } else if (editor.tool === "number") {
      editor.setNumberSize((value) => Math.max(12, Math.min(120, value + step * 2)));
    }
  };

  const onNodeMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const current = editor.drag.current;
    if (!current || current.mode !== "node") return;
    const dx = event.clientX - current.from.x;
    const dy = event.clientY - current.from.y;
    editor.setItems((list) =>
      list.map((item, index) => {
        if (index !== current.index) return item;
        const { from, to } = current.origin;
        if (item.kind === "arrow") {
          return current.key === "from"
            ? { ...item, from: { x: from.x + dx, y: from.y + dy } }
            : { ...item, to: { x: to.x + dx, y: to.y + dy } };
        }
        if (item.kind === "rect" || item.kind === "ellipse") return resizeNodes(item, current.key, dx, dy);
        return item;
      }),
    );
  };

  return {
    onOverlayDown,
    onOverlayMove,
    onOverlayUp,
    onCanvasDown,
    onCanvasMove,
    onCanvasUp,
    startMove,
    startResize,
    startStrip,
    onWheel,
    onNodeMove,
  };
}
