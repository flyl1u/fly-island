// 截图覆盖层：冻结画面 + 框选 + 标注 + 复制/保存/OCR。
// 状态在 useScreenshotEditor，指针交互在 useScreenshotGestures，抓屏与导出在 useScreenshotCapture。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { dismissScreenshot, type ScreenRect } from "../../features/screenshot/api";
import { hitAnnotation } from "../../features/screenshot/annotationEditing";
import { arrowEndpointCursor } from "../../features/screenshot/arrowGeometry";
import { drawAnnotation, hitText, nodePoints, redraw, type Tool } from "../../features/screenshot/annotations";
import { useTranslation } from "../../i18n";
import { ScreenshotSaveDialog } from "./ScreenshotSaveDialog";
import { ScreenshotTextEditor } from "./ScreenshotTextEditor";
import { ScreenshotToolbar } from "./ScreenshotToolbar";
import { useScreenshotCapture } from "./useScreenshotCapture";
import { useScreenshotEditor, type Handle } from "./useScreenshotEditor";
import { useScreenshotGestures } from "./useScreenshotGestures";
import { useScreenshotSettings } from "../../features/screenshot/useScreenshotSettings";
import "./ScreenshotWindow.css";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * 工具栏贴在选区右下角；优先选区外下方，放不下就收进选区内右下角，
 * 全屏/选区顶到屏幕边则收进屏幕右下角。三种情况都保证在屏幕内可见。
 * right/bottom 用 CSS 变量交给样式表做定位。
 */
function toolbarStyle(rect: ScreenRect, barHeight: number) {
  const pinRight = Math.max(8, window.innerWidth - (rect.x + rect.width));
  const selectionBottom = rect.y + rect.height;
  const roomBelow = window.innerHeight - selectionBottom;
  // 1) 选区外右下角：下方有足够空间。紧贴选区（4px 缝隙），不留大块空白。
  if (roomBelow >= barHeight + 4) {
    return {
      "--pin-right": `${pinRight}px`,
      "--pin-bottom": `${roomBelow - barHeight - 4}px`,
    } as React.CSSProperties;
  }
  // 2) 选区内右下角：下方不够但选区自身够高，收进选区内侧。
  if (rect.height >= barHeight + 16) {
    return {
      "--pin-right": `${pinRight + 8}px`,
      "--pin-bottom": `${window.innerHeight - selectionBottom + 8}px`,
    } as React.CSSProperties;
  }
  // 3) 全屏/选区顶到屏幕边：收进屏幕右下角，保证可见。
  return {
    "--pin-right": "8px",
    "--pin-bottom": "8px",
  } as React.CSSProperties;
}

/** 工具的单键快捷键。 */
const SHORTCUTS: Record<string, Tool> = {
  v: "move",
  r: "shape",
  a: "arrow",
  p: "pen",
  n: "number",
  t: "text",
  m: "mosaic",
};

export function ScreenshotWindow() {
  const preferences = useScreenshotSettings();
  const { screenshot: t } = useTranslation();
  const editor = useScreenshotEditor();
  const gestures = useScreenshotGestures(editor);
  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierRef = useRef<HTMLCanvasElement | null>(null);
  const windowRects = useRef<ScreenRect[]>([]);
  const toolbarRef = useRef<HTMLDivElement | null>(null);


  const [savePng, setSavePng] = useState<string | null>(null);
  const resetEditor = editor.reset;
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    // Keep the last composed frame until the native window is hidden. Resetting here
    // briefly replaces a clear selection with the full-screen dim layer on exit.
    void dismissScreenshot().then(() => setSavePng(null)).catch(() => {})
      .finally(() => { closing.current = false; });
  }, []);

  // 必须稳定引用：capture 内部的事件订阅 useEffect 依赖 arm，arm 又依赖这些回调。
  // 用内联箭头会在每次渲染（抓屏时 setBase/setScale 都会渲染）时反复取消/重订阅事件，
  // 造成截图卡顿和画面闪烁。
  const handleArm = useCallback(() => { resetEditor(); setSavePng(null); }, [resetEditor]);
  const handlePinError = useCallback((message: string) => {
    console.error("贴图失败", message);
  }, []);

  const capture = useScreenshotCapture({
    rect: editor.rect,
    editing: editor.editing,
    canvasRef,
    backdropRef,
    windowRects,
    onArm: handleArm,
    onClose: close,
    onSaveRequest: setSavePng,
    onPinError: handlePinError,
  });

  const { rect, items, draft, editing, magnifier, hoverIndex } = editor;

  // 工具栏真实高度实测：写死估算值会让「贴选区外下方」的公式留出一大块空白。
  const [barHeight, setBarHeight] = useState(92);
  useLayoutEffect(() => {
    if (!rect || editor.dragging) return;
    const bar = toolbarRef.current;
    if (!bar) return;
    const measure = () => { if (bar.offsetHeight > 0) setBarHeight(bar.offsetHeight); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [rect, editor.dragging, editor.tool, editor.selected]);

  // 标注层：每次改动整块重画（撤销也就是少画最后一条）。
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = rect ? Math.max(1, Math.round(rect.width * capture.scale)) : 1;
    const height = rect ? Math.max(1, Math.round(rect.height * capture.scaleY)) : 1;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, capture.scaleY / capture.scale, 0, 0);
    const source = backdropRef.current ?? undefined;
    const offset = rect ? { x: rect.x, y: rect.y } : undefined;
    // 正在编辑的那条不画：文本框已经显示它，否则会出现两行一样的字。
    const visibleItems = editing && editing.index !== null ? items.filter((_, index) => index !== editing.index) : items;
    redraw(context, visibleItems, capture.scale, source, offset, capture.scaleY);
    if (draft) drawAnnotation(context, draft, capture.scale, source, offset, capture.scaleY);
  }, [rect, items, draft, capture.scale, capture.scaleY, editing]);

  // 放大镜：从底图取一小块放大，标出光标位置。
  useEffect(() => {
    const canvas = magnifierRef.current;
    const backdrop = backdropRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !backdrop || !context || !magnifier || !preferences.showMagnifier) return;
    const zoom = 4;
    canvas.width = 132;
    canvas.height = 96;
    const sw = canvas.width / zoom;
    const sh = canvas.height / zoom;
    const sx = Math.max(0, Math.min(backdrop.width - sw * capture.scale, (magnifier.x - sw / 2) * capture.scale));
    const sy = Math.max(0, Math.min(backdrop.height - sh * capture.scaleY, (magnifier.y - sh / 2) * capture.scaleY));
    context.imageSmoothingEnabled = false;
    context.drawImage(backdrop, sx, sy, sw * capture.scale, sh * capture.scaleY, 0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#ff3ea5";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(canvas.width / 2, 0);
    context.lineTo(canvas.width / 2, canvas.height);
    context.moveTo(0, canvas.height / 2);
    context.lineTo(canvas.width, canvas.height / 2);
    context.stroke();
  }, [magnifier, capture.scale, capture.scaleY, preferences.showMagnifier]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (savePng) {
        if (event.key === "Escape") { event.preventDefault(); setSavePng(null); }
        return;
      }
      if (target instanceof HTMLElement && target.closest('textarea, input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), [contenteditable=true]')) return;
      if ((event.key === "Delete" || event.key === "Backspace") && editor.selected !== null && !editor.editing) {
        event.preventDefault();
        const index = editor.selected;
        editor.setItems((list) => list.filter((_, position) => position !== index));
        editor.setSelected(null);

        return;
      }
      if (target instanceof HTMLElement && target.closest("select")) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "a" && !editor.editing) {
        event.preventDefault(); editor.setItems([]); editor.setSelected(null);
        editor.setRect({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }); return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "q") {
        event.preventDefault(); void capture.translateInline(); return;
      }
      if (!editor.editing && !event.ctrlKey && !event.metaKey && SHORTCUTS[key]) {
        event.preventDefault();
        editor.setSelected(null);
        editor.setTool(SHORTCUTS[key]);
        return;
      }
      if (event.key === "Escape") {
        // 编辑时先取消编辑；否则单次 Esc 结束截图。
        event.preventDefault();
        if (editor.editing) {
          editor.setEditing(null);
          return;
        }
        close();
      } else if (event.key === "Enter" && !editor.editing) {
        event.preventDefault();
        if (editor.tool === "text" && editor.rect) {
          editor.startNewText({ x: editor.rect.width / 2 - 30, y: editor.rect.height / 2 - 12 });
        } else {
          void capture.copy();
        }
      } else if (event.shiftKey && key === "c" && !editor.editing) {
        event.preventDefault();
        void capture.recognizeAndCopy();
      } else if ((event.ctrlKey || event.metaKey) && key === "z" && !editor.editing) {
        event.preventDefault();
        editor.setSelected(null);
        editor.setItems((value) => value.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capture, close, editor, savePng]);

  return (
    <div
      className="screenshot-overlay"
      tabIndex={-1}
      onPointerDown={(event) => gestures.onOverlayDown(event, windowRects.current)}
      onPointerMove={(event) => gestures.onOverlayMove(event, windowRects.current)}
      onPointerUp={gestures.onOverlayUp}
      onWheel={(event) => gestures.onWheel(event, windowRects.current)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (savePng) return;
        // 右键 = 框选鼠标所在的那个窗口（和微信截图一致）；空白处才取消。
        const at = { x: event.clientX, y: event.clientY };
        const hit = windowRects.current.find((item) =>
          at.x >= item.x && at.x <= item.x + item.width && at.y >= item.y && at.y <= item.y + item.height);
        if (hit) {
          editor.setItems([]);
          editor.setSelected(null);
          editor.setRect(hit);
        } else {
          close();
        }
      }}
    >
      <canvas ref={backdropRef} className="screenshot-backdrop" />
      {!rect ? <div className="screenshot-dim" aria-hidden="true" /> : null}

      {capture.failure ? <p className="screenshot-failure">{capture.failure}</p> : null}

      {hoverIndex >= 0 && !rect && windowRects.current[hoverIndex]
        // 全屏（鼠标所在窗口铺满屏幕）不高亮：粉色 hover 框会铺满屏幕边缘，看起来像没去掉的框线。
        && !(windowRects.current[hoverIndex].x <= 1 && windowRects.current[hoverIndex].y <= 1
          && windowRects.current[hoverIndex].width >= window.innerWidth - 2
          && windowRects.current[hoverIndex].height >= window.innerHeight - 2) ? (
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
            {Math.round(windowRects.current[hoverIndex].width * capture.scale)} × {Math.round(windowRects.current[hoverIndex].height * capture.scaleY)}
          </span>
        </div>
      ) : null}

      {magnifier && preferences.showMagnifier ? (
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
            className={`screenshot-selection${rect.x <= 1 && rect.y <= 1 && rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2 ? " screenshot-selection-fullscreen" : ""}`}
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height,
              ...(rect.x <= 1 && rect.y <= 1 && rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2
                ? { border: "none", outline: "none" } : {}) }}
            onPointerDown={gestures.startMove}
            onPointerMove={(event) => gestures.onOverlayMove(event, windowRects.current)}
            onPointerUp={gestures.onOverlayUp}
          >
            <span className="screenshot-size">
              {Math.round(rect.width * capture.scale)} × {Math.round(rect.height * capture.scaleY)}
            </span>
            {HANDLES.map((handle) => (
              <span
                key={handle}
                className={`screenshot-handle screenshot-handle-${handle}`}
                onPointerDown={gestures.startResize(handle)}
                onPointerMove={(event) => gestures.onOverlayMove(event, windowRects.current)}
                onPointerUp={gestures.onOverlayUp}
              />
            ))}
            <span className="screenshot-move-strip screenshot-strip-top" onPointerDown={gestures.startStrip("n")} />
            <span className="screenshot-move-strip screenshot-strip-bottom" onPointerDown={gestures.startStrip("s")} />
            <span className="screenshot-move-strip screenshot-strip-left" onPointerDown={gestures.startStrip("w")} />
            <span className="screenshot-move-strip screenshot-strip-right" onPointerDown={gestures.startStrip("e")} />
          </div>

          <canvas
            ref={canvasRef}
            className="screenshot-canvas"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, cursor: gestures.canvasCursor }}
            onPointerDown={gestures.onCanvasDown}
            onPointerMove={gestures.onCanvasMove}
            onPointerUp={gestures.onCanvasUp}
            onDoubleClick={(event) => {
              event.stopPropagation();
              const at = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
              const hit = hitText(editor.items, at);
              if (hit !== null) {
                const target = editor.items[hit];
                if (target.kind === "text") { editor.editExistingText(hit, target); return; }
              }
              if (hitAnnotation(editor.items, at) !== null) return;
              void capture.copy();
            }}
          />

          {editor.selected !== null && items[editor.selected] && nodePoints(items[editor.selected]).length > 0
            ? nodePoints(items[editor.selected]).map((node) => (
                <span
                  key={node.key}
                  className={`screenshot-node${editor.selectedItem?.kind === "arrow" ? " screenshot-node-arrow" : ""}`}
                  data-node={node.key}
                  title={editor.selectedItem?.kind === "arrow" ? t.arrowEndpointHint : t.resizeShapeHint}
                  style={{ left: rect.x + node.point.x - 5, top: rect.y + node.point.y - 5,
                    cursor: editor.selectedItem?.kind === "arrow"
                      ? arrowEndpointCursor(editor.selectedItem.from, editor.selectedItem.to) : `${node.key}-resize` }}
                  onPointerDown={gestures.startNode(node.key)}
                  onPointerMove={gestures.onNodeMove}
                  onPointerUp={() => {
                    editor.drag.current = null;
                    editor.setDragging(false);
                  }}
                />
              ))
            : null}

          <ScreenshotTextEditor editor={editor} rect={rect} />

          {/* 拖拽选区/控制点时隐藏工具栏，松手后再显示，避免挡住拖拽。 */}
          {!editor.dragging ? (
            <div ref={toolbarRef} className="screenshot-rows" style={toolbarStyle(rect, barHeight)}
              onPointerDown={(event) => {
                event.stopPropagation();
                editor.rememberTextSelection();
                // Buttons can act without taking focus; native selects and numeric inputs must still receive it.
                if (editor.editing && (event.target as HTMLElement).closest("button")) event.preventDefault();
              }}>
              <ScreenshotToolbar editor={editor} capture={capture} />
            </div>
          ) : null}
        </>
      ) : (
        // 快捷键唤醒时立即显示遮罩；选区内仍使用未变暗的原图导出。
        preferences.showHints ? <p className="screenshot-hint">{t.hint}</p> : null
      )}

      {savePng ? (
        <ScreenshotSaveDialog png={savePng}
          onDone={() => { setSavePng(null); close(); }}
          onClose={() => setSavePng(null)} />
      ) : null}
    </div>
  );
}
