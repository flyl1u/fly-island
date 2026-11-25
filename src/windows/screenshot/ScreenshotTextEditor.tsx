// 文字标注的浮层：八向控制点改字号、顶部手柄旋转，以及正在编辑的那块输入框。
import { useEffect } from "react";
import type { ScreenRect } from "../../features/screenshot/api";
import { useTranslation } from "../../i18n";
import type { EditorState } from "./useScreenshotEditor";

const TEXT_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

type TextEditorProps = { editor: EditorState; rect: ScreenRect };

export function ScreenshotTextEditor({ editor, rect }: TextEditorProps) {
  const { screenshot: t } = useTranslation();
  const { textBox, editing, selectedText, selected, textSize, textInputRef, textResize, rotateCenter } = editor;

  /** 点文字框线（非控制点/旋转手柄）：拖动整条文字。 */
  const startTextDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const index = editing?.index ?? selected;
    const target = index === null || index === undefined ? null : editor.items[index];
    if (index === null || index === undefined || !target || target.kind !== "text") return;
    event.stopPropagation();
    editor.drag.current = { mode: "text", index, from: { x: event.clientX, y: event.clientY }, origin: { ...target.at } };
    editor.setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  /** 框线拖动：屏幕坐标差 = 文字位移（拖画布时用的是画布内坐标，这里单独处理）。 */
  const onTextDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = editor.drag.current;
    if (!current || current.mode !== "text") return;
    event.stopPropagation();
    editor.setItems((list) =>
      list.map((item, index) =>
        index === current.index && item.kind === "text"
          ? { ...item, at: { x: current.origin.x + event.clientX - current.from.x, y: current.origin.y + event.clientY - current.from.y } }
          : item,
      ),
    );
  };
  const onTextDragUp = () => {
    editor.drag.current = null;
    editor.setDragging(false);
  };

  useEffect(() => {
    if (!editing) return;
    textInputRef.current?.focus();
    // 刚挂上的 textarea 偶尔抢不到焦点，隔一帧再补一次。
    const timer = window.setTimeout(() => textInputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [editing, textInputRef]);

  if (!textBox) return null;

  const resizeByPointer = (event: React.PointerEvent<HTMLSpanElement>) => {
    const state = textResize.current;
    if (!state) return;
    const before = Math.hypot(state.from.x - state.center.x, state.from.y - state.center.y);
    const after = Math.hypot(event.clientX - state.center.x, event.clientY - state.center.y);
    if (before < 4) return;
    const next = Math.max(8, Math.min(200, Math.round((state.size * after) / before)));
    if (editing) editor.setEditing((value) => (value ? { ...value, size: next } : value));
    else editor.patchText({ size: next });
  };

  return (
    <>
      <div
        className="screenshot-textbox"
        data-textbox="1"
        onPointerDown={startTextDrag}
        onPointerMove={onTextDragMove}
        onPointerUp={onTextDragUp}
        onDoubleClick={(event) => {
          event.stopPropagation();
          const index = selected;
          const target = index === null ? null : editor.items[index];
          if (index !== null && target && target.kind === "text") editor.editExistingText(index, target);
        }}
        style={{ pointerEvents: editing ? "none" : "auto",
          cursor: editing ? "text" : "move",
          left: rect.x + textBox.x - 1,
          top: rect.y + textBox.y - 1,
          width: textBox.w + 10,
          height: textBox.h + 6,
        }}
      >
        {TEXT_HANDLES.map((key) => (
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
            onPointerMove={resizeByPointer}
            onPointerUp={() => {
              textResize.current = null;
            }}
          />
        ))}
        <span
          className="screenshot-rotate"
          data-rotate="1"
          title={t.rotate}
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
            if (editing) editor.setEditing((value) => (value ? { ...value, angle } : value));
            else editor.patchText({ angle });
          }}
          onPointerUp={() => {
            rotateCenter.current = null;
          }}
        >
          ↻
        </span>
      </div>

      {editing ? (
        <textarea
          className="screenshot-text-input"
          ref={textInputRef}
          value={editing.value}
          style={{
            left: rect.x + editing.at.x,
            top: rect.y + editing.at.y,
            width: `${Math.round(editor.editWidth) + 8}px`,
            height: `${Math.round(editor.editHeight) + 4}px`,
            padding: 0,
            boxSizing: "border-box",
            color: editing.color,
            fontSize: editing.size,
            fontFamily: editing.font,
            lineHeight: 1.4,
            fontWeight: editing.bold ? 700 : 400,
            fontStyle: editing.italic ? "italic" : "normal",
            textDecoration:
              [editing.underline ? "underline" : "", editing.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
            transform: `rotate(${editing.angle}deg)`,
            transformOrigin: "center",
          }}
          onChange={(event) => editor.setEditing({ ...editing, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              editor.setEditing(null);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              editor.commitText(editing);
            }
          }}
        />
      ) : null}
    </>
  );
}
