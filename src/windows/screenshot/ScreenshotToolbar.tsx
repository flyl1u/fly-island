import type { ArrowHeads } from "../../features/screenshot/arrowGeometry";
import "./ScreenshotToolbar.css";
// 截图覆盖层的工具条：属性行（形状/线型/线宽/序号/马赛克/文字/颜色）、工具行、操作行和 OCR 结果。
import {
  ArrowUpRight,
  Circle,
  Copy,
  Download,
  Grid3x3,
  Hash,
  Languages,
  MousePointer2,
  Pencil,
  Pin,
  ScanText,
  Square,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { copyScreenshotText } from "../../features/screenshot/api";
import { COLORS, type Dash, type NumberStyle, type Tool } from "../../features/screenshot/annotations";
import { useTranslation } from "../../i18n";
import type { ScreenshotText } from "../../i18n/sections/screenshot";
import type { CaptureState } from "./useScreenshotCapture";
import type { EditorState } from "./useScreenshotEditor";

/** 只要译文里能直接当按钮标题的字段（不含带参数的函数）。 */
type LabelKey = { [K in keyof ScreenshotText]: ScreenshotText[K] extends string ? K : never }[keyof ScreenshotText];

const TOOLS: { id: Tool; label: LabelKey; Icon: typeof Square }[] = [
  { id: "move", label: "toolMove", Icon: MousePointer2 },
  { id: "shape", label: "toolShape", Icon: Square },
  { id: "arrow", label: "toolArrow", Icon: ArrowUpRight },
  { id: "pen", label: "toolPen", Icon: Pencil },
  { id: "number", label: "toolNumber", Icon: Hash },
  { id: "text", label: "toolText", Icon: Type },
  { id: "mosaic", label: "toolMosaic", Icon: Grid3x3 },
];

const DASHES: { id: Dash; label: LabelKey }[] = [
  { id: "solid", label: "dashSolid" },
  { id: "dashed", label: "dashDashed" },
  { id: "dotted", label: "dashDotted" },
];

const FORMATS: { key: keyof EditorState["textFormat"]; label: string; title: LabelKey }[] = [
  { key: "bold", label: "B", title: "formatBold" },
  { key: "italic", label: "I", title: "formatItalic" },
  { key: "underline", label: "U", title: "formatUnderline" },
  { key: "strike", label: "S", title: "formatStrike" },
];

const NUMBER_STYLES: { id: NumberStyle; sample: string; title: string }[] = [
  { id: "arabic", sample: "1", title: "1 2 3" },
  { id: "alpha", sample: "a", title: "a b c" },
  { id: "roman", sample: "i", title: "i ii iii" },
];

type ToolbarProps = { editor: EditorState; capture: CaptureState };

export function ScreenshotToolbar({ editor, capture }: ToolbarProps) {
  const { screenshot: t } = useTranslation();
  const selected = editor.selectedItem;
  const optionTool = editor.editing ? "text" : selected
    ? (selected.kind === "rect" || selected.kind === "ellipse" ? "shape" : selected.kind) : editor.tool;
  const shape = selected?.kind === "rect" || selected?.kind === "ellipse" ? selected.kind : editor.shape;
  const dash = selected && "dash" in selected ? selected.dash ?? "solid" : editor.dash;
  const width = selected && "width" in selected ? selected.width : editor.strokeWidth;
  const filled = selected?.kind === "rect" || selected?.kind === "ellipse" ? !!selected.filled : editor.filled;
  const color = editor.editing?.color ?? (selected && "color" in selected ? selected.color : editor.color);
  const numberSize = selected?.kind === "number" ? selected.size : editor.numberSize;
  const numberStyle = selected?.kind === "number" ? selected.style : editor.numberStyle;
  const mosaicSize = selected?.kind === "mosaic" ? selected.size : editor.mosaicSize;
  const arrowHeads = selected?.kind === "arrow" ? selected.heads ?? "single" : editor.arrowHeads;
  const strokeable = optionTool === "shape" || optionTool === "arrow" || optionTool === "pen";

  /** 文字属性：编辑中改编辑态，选中改选中的文字，否则改下一段的默认样式。 */
  const patchFormat = (key: keyof EditorState["textFormat"]) => {
    if (editor.editing) editor.setEditing({ ...editor.editing, [key]: !editor.editing[key] });
    else if (editor.selectedText) editor.patchText({ [key]: !editor.selectedText[key] });
    else editor.setTextFormat({ ...editor.textFormat, [key]: !editor.textFormat[key] });
  };

  const pickColor = (value: string) => {
    if (editor.editing) {
      editor.setEditing({ ...editor.editing, color: value });
      return;
    }
    if (editor.selectedText) {
      editor.patchText({ color: value });
      return;
    }
    if (editor.selected !== null) {
      editor.setItems((list) => list.map((item, index) => (index === editor.selected && "color" in item ? { ...item, color: value } : item)));
      return;
    }
    editor.setColor(value);
  };

  return (
    <>
      {optionTool !== "move" ? (
        <div className="screenshot-row screenshot-row-options">
          {optionTool === "shape" ? (
            <>
              <button
                type="button"
                className={`screenshot-chip ${shape === "rect" ? "screenshot-chip-active" : ""}`}
                title={t.shapeRect}
                aria-label={t.shapeRect}
                onClick={() => { editor.setShape("rect"); editor.patchSelected({ shape: "rect" }); }}
              >
                <Square size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={`screenshot-chip ${shape === "ellipse" ? "screenshot-chip-active" : ""}`}
                title={t.shapeEllipse}
                aria-label={t.shapeEllipse}
                onClick={() => { editor.setShape("ellipse"); editor.patchSelected({ shape: "ellipse" }); }}
              >
                <Circle size={18} aria-hidden />
              </button>
              <label className="screenshot-option-label">
                <input type="checkbox" checked={filled} aria-label={t.fillShape}
                  onChange={(event) => { editor.setFilled(event.target.checked); editor.patchSelected({ filled: event.target.checked }); }} />
                {t.fillShape}
              </label>
            </>
          ) : null}

          {optionTool === "arrow" ? (
            <label className="screenshot-option-label">{t.arrowStyle}
              <select className="screenshot-select screenshot-select-arrow" value={arrowHeads} aria-label={t.arrowStyle}
                onChange={(event) => { const next = event.target.value as ArrowHeads; editor.setArrowHeads(next); editor.patchSelected({ arrowHeads: next }); }}>
                <option value="single">{t.arrowSingle}</option><option value="double">{t.arrowDouble}</option><option value="none">{t.arrowNone}</option>
              </select>
            </label>
          ) : null}
          {strokeable ? (
            <>
              {DASHES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`screenshot-chip screenshot-chip-dash ${dash === item.id ? "screenshot-chip-active" : ""}`}
                  title={t[item.label]}
                  aria-label={t[item.label]}
                  onClick={() => { editor.setDash(item.id); editor.patchSelected({ dash: item.id }); }}
                >
                  <span className={`screenshot-dash-line screenshot-dash-${item.id}`} />
                </button>
              ))}
              <input
                className="screenshot-range"
                type="range"
                min={1}
                max={24}
                value={width}
                title={t.lineWidth(width)}
                aria-label={t.lineWidthLabel}
                onChange={(event) => { editor.setStrokeWidth(Number(event.target.value)); editor.patchSelected({ width: Number(event.target.value) }); }}
              />
            </>
          ) : null}

          {optionTool === "number" ? (
            <>
              {NUMBER_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`screenshot-chip ${numberStyle === style.id ? "screenshot-chip-active" : ""}`}
                  title={style.title}
                  aria-label={style.title}
                  onClick={() => {
                    editor.counters.current[style.id] = 1;
                    editor.setNumberStyle(style.id);
                    editor.patchSelected({ numberStyle: style.id });
                  }}
                >
                  {style.sample}
                </button>
              ))}
              <input
                className="screenshot-range"
                type="range"
                min={12}
                max={120}
                value={numberSize}
                aria-label={t.numberSizeLabel}
                onChange={(event) => { editor.setNumberSize(Number(event.target.value)); editor.patchSelected({ size: Number(event.target.value) }); }}
              />
            </>
          ) : null}

          {optionTool === "mosaic" ? (
            <label className="screenshot-option-label">
              {t.grain}
              <input
                className="screenshot-range"
                type="range"
                min={4}
                max={40}
                value={mosaicSize}
                aria-label={t.grainLabel}
                onChange={(event) => { editor.setMosaicSize(Number(event.target.value)); editor.patchSelected({ size: Number(event.target.value) }); }}
              />
            </label>
          ) : null}

          {optionTool === "text" ? (
            <>
              <select
                className="screenshot-select"
                aria-label={t.fontFamilyLabel}
                value={editor.editing?.font ?? editor.selectedText?.font ?? editor.textFont}
                onChange={(event) => {
                  if (editor.editing) editor.setEditing({ ...editor.editing, font: event.target.value });
                  else if (editor.selectedText) editor.patchText({ font: event.target.value });
                  else editor.setTextFont(event.target.value);
                  if (editor.editing) editor.restoreTextSelection();
                }}
              >
                {(() => {
                  const current = editor.editing?.font ?? editor.selectedText?.font ?? editor.textFont;
                  return capture.fonts.includes(current) ? null : <option value={current}>{current}</option>;
                })()}
                {capture.fonts.map((font) => (
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
                value={editor.editing?.size ?? editor.selectedText?.size ?? editor.textSize}
                aria-label={t.fontSizeLabel}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && editor.editing) {
                    event.preventDefault();
                    editor.restoreTextSelection();
                  }
                }}
                onChange={(event) => {
                  const next = Math.max(8, Math.min(160, Number(event.target.value)));
                  if (editor.editing) editor.setEditing({ ...editor.editing, size: next });
                  else if (editor.selectedText) editor.patchText({ size: next });
                  else editor.setTextSize(next);
                }}
              />
              {FORMATS.map((format) => (
                <button
                  key={format.key}
                  type="button"
                  className={`screenshot-chip ${(editor.editing ?? editor.selectedText ?? editor.textFormat)[format.key] ? "screenshot-chip-active" : ""}`}
                  title={t[format.title]}
                  aria-label={t[format.title]}
                  onClick={() => patchFormat(format.key)}
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
                onClick={() => pickColor(value)}
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
            className={`screenshot-tool ${optionTool === item.id ? "screenshot-tool-active" : ""}`}
            title={t[item.label]}
            aria-label={t[item.label]}
            onClick={() => {
              if (editor.editing) editor.commitText(editor.editing);
              editor.setSelected(null); editor.setTool(item.id);
            }}
          >
            <item.Icon size={19} aria-hidden />
          </button>
        ))}
        <button type="button" className="screenshot-tool" title={t.recognize} aria-label={t.recognize} onClick={() => void capture.recognize()}>
          <ScanText size={19} aria-hidden />
        </button>
        <button
          type="button"
          className="screenshot-tool"
          title={t.translateHint}
          aria-label={t.translate}
          onClick={() => void capture.translateInline()}
          disabled={capture.ocrBusy}
        >
          <Languages size={19} aria-hidden />
        </button>
        <button
          type="button"
          className="screenshot-tool"
          title={t.undoHint}
          aria-label={t.undo}
          onClick={() => { editor.setSelected(null); editor.setItems((value) => value.slice(0, -1)); }}
        >
          <Undo2 size={19} aria-hidden />
        </button>
        {/* 贴图 / 保存图像 / 关闭 / 复制并关闭：跟在划词翻译后面同一排。 */}
        <button type="button" className="screenshot-tool" title={t.pin} aria-label={t.pin} onClick={() => capture.pin()}>
          <Pin size={19} aria-hidden />
        </button>
        <button type="button" className="screenshot-tool" title={t.save} aria-label={t.save} onClick={() => capture.save()}>
          <Download size={19} aria-hidden />
        </button>
        <button type="button" className="screenshot-tool" title={t.cancelHint} aria-label={t.cancel} onClick={capture.close}>
          <X size={19} aria-hidden />
        </button>
        <button
          type="button"
          className="screenshot-tool screenshot-tool-primary"
          title={t.copyHint}
          aria-label={t.copyAndClose}
          onClick={() => void capture.copy()}
        >
          <Copy size={19} aria-hidden />
        </button>
      </div>

      {capture.ocrText !== null ? (
        <div className="screenshot-row screenshot-row-ocr">
          <textarea
            className="screenshot-ocr-text"
            value={capture.ocrText}
            spellCheck={false}
            onChange={(event) => capture.setOcrText(event.target.value)}
          />
          <div className="screenshot-ocr-actions">
            <button
              type="button"
              className="screenshot-tool"
              title={t.copyOcr}
              aria-label={t.copyOcr}
              onClick={() => void copyScreenshotText(capture.ocrText ?? "").catch((error) => capture.setFailure(`${t.copyFailed}: ${String(error)}`))}
            >
              <Copy size={17} aria-hidden />
            </button>
            <button type="button" className="screenshot-tool" title={t.close} aria-label={t.close} onClick={() => capture.setOcrText(null)}>
              <X size={17} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
