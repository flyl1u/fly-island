// 文字标注的浮层：八向控制点改字号、顶部手柄旋转，以及正在编辑的那块输入框。
import { useEffect } from "react";
import type { ScreenRect } from "../../features/screenshot/api";
import { useTranslation } from "../../i18n";
import type { EditorState } from "./useScreenshotEditor";

const TEXT_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

type TextEditorProps = { editor: EditorState; rect: ScreenRect };

export function ScreenshotTextEditor({ editor, rect }: TextEditorProps) {
  const { screenshot: t } = useTranslation();
  const { textBox, editing, selectedText, textSize, textInputRef, textResize, rotateCenter } = editor;

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
        style={{
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
