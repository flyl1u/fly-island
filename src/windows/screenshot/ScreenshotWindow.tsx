// 截图覆盖层：冻结画面 + 框选 + 标注 + 复制/保存/OCR。
// 状态在 useScreenshotEditor，指针交互在 useScreenshotGestures，抓屏与导出在 useScreenshotCapture。
import { useCallback, useEffect, useRef } from "react";
import { dismissScreenshot, type ScreenRect } from "../../features/screenshot/api";
import { drawAnnotation, nodePoints, redraw, type Tool } from "../../features/screenshot/annotations";
import { useTranslation } from "../../i18n";
import { ScreenshotTextEditor } from "./ScreenshotTextEditor";
import { ScreenshotToolbar } from "./ScreenshotToolbar";
import { useScreenshotCapture } from "./useScreenshotCapture";
import { useScreenshotEditor, type Handle } from "./useScreenshotEditor";
import { useScreenshotGestures } from "./useScreenshotGestures";
import "./ScreenshotWindow.css";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

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
  const { screenshot: t } = useTranslation();
  const editor = useScreenshotEditor();
  const gestures = useScreenshotGestures(editor);
  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierRef = useRef<HTMLCanvasElement | null>(null);
  const windowRects = useRef<ScreenRect[]>([]);

  const resetEditor = editor.reset;
  const close = useCallback(() => {
    resetEditor();
    void dismissScreenshot().catch(() => {});
  }, [resetEditor]);

  const capture = useScreenshotCapture({
    rect: editor.rect,
    textFont: editor.textFont,
    canvasRef,
    backdropRef,
    windowRects,
    onArm: resetEditor,
    onClose: close,
    onTranslated: editor.addItems,
  });

  const { rect, items, draft, editing, magnifier, hoverIndex } = editor;

  // 标注层：每次改动整块重画（撤销也就是少画最后一条）。
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = rect ? Math.max(1, Math.round(rect.width * capture.scale)) : 1;
    const height = rect ? Math.max(1, Math.round(rect.height * capture.scale)) : 1;
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
    redraw(context, visibleItems, capture.scale, source, offset);
    if (draft) drawAnnotation(context, draft, capture.scale, source, offset);
  }, [rect, items, draft, capture.scale, editing]);

  // 放大镜：从底图取一小块放大，标出光标位置。
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
    const sx = Math.max(0, Math.min(backdrop.width - sw * capture.scale, (magnifier.x - sw / 2) * capture.scale));
    const sy = Math.max(0, Math.min(backdrop.height - sh * capture.scale, (magnifier.y - sh / 2) * capture.scale));
    context.imageSmoothingEnabled = false;
    context.drawImage(backdrop, sx, sy, sw * capture.scale, sh * capture.scale, 0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#ff3ea5";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(canvas.width / 2, 0);
    context.lineTo(canvas.width / 2, canvas.height);
    context.moveTo(0, canvas.height / 2);
    context.lineTo(canvas.width, canvas.height / 2);
    context.stroke();
  }, [magnifier, capture.scale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!editor.editing && !event.ctrlKey && !event.metaKey && SHORTCUTS[key]) {
        event.preventDefault();
        editor.setTool(SHORTCUTS[key]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (editor.editing) editor.setEditing(null);
        else close();
      } else if ((event.key === "Delete" || event.key === "Backspace") && editor.selected !== null && !editor.editing) {
        event.preventDefault();
        const index = editor.selected;
        editor.setItems((list) => list.filter((_, position) => position !== index));
        editor.setSelected(null);
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
        editor.setItems((value) => value.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capture, close, editor]);

  return (
    <div
      className="screenshot-overlay"
      onPointerDown={(event) => gestures.onOverlayDown(event, windowRects.current)}
      onPointerMove={(event) => gestures.onOverlayMove(event, windowRects.current)}
      onPointerUp={gestures.onOverlayUp}
      onWheel={(event) => gestures.onWheel(event, windowRects.current)}
      onContextMenu={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <canvas ref={backdropRef} className="screenshot-backdrop" />

      {capture.failure ? <p className="screenshot-failure">{capture.failure}</p> : null}

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
            onPointerDown={gestures.startMove}
            onPointerMove={(event) => gestures.onOverlayMove(event, windowRects.current)}
            onPointerUp={gestures.onOverlayUp}
          >
            <span className="screenshot-size">
              {Math.round(rect.width)} × {Math.round(rect.height)}
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
            <span className="screenshot-move-strip screenshot-strip-top" onPointerDown={gestures.startMove} />
            <span className="screenshot-move-strip screenshot-strip-bottom" onPointerDown={gestures.startMove} />
            <span className="screenshot-move-strip screenshot-strip-left" onPointerDown={gestures.startMove} />
            <span className="screenshot-move-strip screenshot-strip-right" onPointerDown={gestures.startMove} />
          </div>

          <canvas
            ref={canvasRef}
            className="screenshot-canvas"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            onPointerDown={gestures.onCanvasDown}
            onPointerMove={gestures.onCanvasMove}
            onPointerUp={gestures.onCanvasUp}
          />

          {editor.selected !== null && items[editor.selected] && nodePoints(items[editor.selected]).length > 0
            ? nodePoints(items[editor.selected]).map((node) => (
                <span
                  key={node.key}
                  className="screenshot-node"
                  data-node="1"
                  style={{ left: rect.x + node.point.x - 5, top: rect.y + node.point.y - 5 }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const target = items[editor.selected as number];
                    if (!target) return;
                    editor.drag.current = {
                      mode: "node",
                      index: editor.selected as number,
                      key: node.key,
                      from: { x: event.clientX, y: event.clientY },
                      origin:
                        target.kind === "arrow" || target.kind === "rect" || target.kind === "ellipse"
                          ? { from: { ...target.from }, to: { ...target.to } }
                          : { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={gestures.onNodeMove}
                  onPointerUp={() => {
                    editor.drag.current = null;
                  }}
                />
              ))
            : null}

          <ScreenshotTextEditor editor={editor} rect={rect} />

          <div className="screenshot-rows" style={{ left: rect.x, top: rect.y + rect.height + 10 }}>
            <ScreenshotToolbar editor={editor} capture={capture} />
          </div>
        </>
      ) : (
        <>
          <div className="screenshot-dim" />
          <p className="screenshot-hint">{t.hint}</p>
        </>
      )}
    </div>
  );
}
