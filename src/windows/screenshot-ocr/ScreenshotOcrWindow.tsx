import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, FileText, Image, Maximize2, Minus, Pin, ScanText, X, ZoomIn, ZoomOut } from "lucide-react";
import { useDocumentTheme, useStoredTheme } from "../../features/appearance/useDocumentTheme";
import { useTranslation } from "../../i18n";
import { useOcrDocument } from "./useOcrDocument";
import { ScreenshotTooltips } from "../screenshot/ScreenshotTooltips";
import { ScreenshotTextLine } from "../screenshot/ScreenshotTextLine";
import "./ScreenshotOcrWindow.css";

export function ScreenshotOcrWindow() {
  useDocumentTheme(useStoredTheme());
  const { screenshot: t } = useTranslation();
  const doc = useOcrDocument();
  const [zoom, setZoom] = useState(1);
  const [readingSize, setReadingSize] = useState(16);
  const [showImage, setShowImage] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const [topmost, setTopmost] = useState(true);
  const original = useRef<HTMLDivElement | null>(null);
  const fit = () => setZoom(Math.max(.1, Math.min(1, ((original.current?.clientWidth ?? 450) - 32) / doc.natural.width)));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") doc.close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc]);
  useEffect(() => {
    if (doc.natural.width > 1) setZoom(Math.max(.1, Math.min(1, ((original.current?.clientWidth ?? 450) - 32) / doc.natural.width)));
  }, [doc.natural.width]);
  useEffect(() => {
    const pane = original.current;
    if (!pane) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); setZoom((value) => Math.max(.1, Math.min(3, value * (event.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    pane.addEventListener("wheel", wheel, { passive: false });
    return () => pane.removeEventListener("wheel", wheel);
  }, [showImage]);
  const windowAction = (action: () => Promise<void>) => void action().catch((cause) => doc.setError(String(cause)));
  return <main className="shot-ocr"><ScreenshotTooltips>
    <header className="shot-ocr-title" data-tauri-drag-region>
      <ScanText size={18} /><strong data-tauri-drag-region>{t.ocrTitle}</strong>
      <button aria-label={t.pinMenuAlwaysOnTop} title={t.pinMenuAlwaysOnTop} aria-pressed={topmost} onClick={() => windowAction(async () => {
        await getCurrentWindow().setAlwaysOnTop(!topmost); setTopmost(!topmost);
      })}><Pin size={16} /></button>
      <button aria-label={t.minimizeWindow} title={t.minimizeWindow} onClick={() => windowAction(() => getCurrentWindow().minimize())}><Minus size={16} /></button>
      <button aria-label={t.maximizeWindow} title={t.maximizeWindow} onClick={() => windowAction(() => getCurrentWindow().toggleMaximize())}><Maximize2 size={16} /></button>
      <button aria-label={t.close} title={t.close} onClick={doc.close}><X size={18} /></button>
    </header>
    <nav className="shot-ocr-controls">
      <label><input type="checkbox" checked={showImage} onChange={(event) => setShowImage(event.target.checked)} />{t.showOriginal}</label>
      <label className="shot-ocr-font-size">{t.fontSizeLabel}<input type="number" min={12} max={32} value={readingSize}
        aria-label={t.readingFontSize} onChange={(event) => setReadingSize(Math.max(12, Math.min(32, Number(event.target.value))))} /></label>
      <button disabled={!doc.lines.length} onClick={() => void doc.copy()}><Copy size={14} />{t.copyOcr}</button>
    </nav>
    {doc.error ? <p role="alert" className="shot-ocr-error">{doc.error}</p> : null}
    <div className={"shot-ocr-content" + (showImage ? "" : " shot-ocr-text-only")}>
      {showImage ? <section className="shot-ocr-panel" aria-label={t.originalImage}>
        <h2><Image size={15} />{t.originalImage}</h2>
        <div className="shot-ocr-scroll" ref={original}>
          <div className="shot-ocr-stage" style={{ width: doc.natural.width * zoom, height: doc.natural.height * zoom }}>
            <div className="shot-ocr-paper" style={{ width: doc.natural.width, height: doc.natural.height, transform: "scale(" + zoom + ")" }}>
              {doc.src ? <img src={doc.src} alt={t.originalImage} onLoad={(event) => {
                doc.setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); doc.reveal();
              }} onError={() => { doc.setError(t.imageLoadFailed); doc.reveal(); }} /> : null}
              {doc.lines.map((line) => <button key={line.id} data-source-line={line.id} className={"shot-ocr-source-line" + (active === line.id ? " active" : "")}
                style={{ left: line.x, top: line.y, width: line.width, height: line.height }} aria-label={t.ocrLine + " " + (line.id + 1)}
                onClick={() => { setActive(line.id); document.querySelector<HTMLTextAreaElement>('[data-ocr-line="' + line.id + '"]')?.focus(); }} />)}
            </div>
          </div>
        </div>
      </section> : null}
      <section className="shot-ocr-panel" aria-label={t.ocrResult}>
        <h2><FileText size={15} />{t.ocrResult}<small>{t.plainLinesHint}</small></h2>
        <div className="shot-ocr-scroll">
          {doc.busy ? <p className="shot-ocr-status" role="status">{t.ocrLoading}</p> : !doc.lines.length ? <p className="shot-ocr-status">{t.nothingFound}</p> :
            <div className="shot-ocr-lines">
              {doc.lines.map((line) => <ScreenshotTextLine key={line.id} lineId={line.id} ariaLabel={t.ocrLine + " " + (line.id + 1)}
                value={line.text} fontSize={readingSize} className={"shot-ocr-edit-line" + (active === line.id ? " active" : "")}
                onFocus={() => { setActive(line.id); document.querySelector('[data-source-line="' + line.id + '"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }}
                onChange={(text) => doc.edit(line.id, text)} />)}
            </div>}
        </div>
      </section>
    </div>
    <footer className="shot-ocr-footer"><span role="status">{doc.copied ? t.copied : doc.busy ? t.ocrLoading : t.ocrReady}</span>
      <button aria-label={t.zoomOut} title={t.zoomOut} onClick={() => setZoom((value) => Math.max(.1, value / 1.1))}><ZoomOut size={15} /></button>
      <button onClick={fit} title={t.fitImage}>{t.originalImage} {Math.round(zoom * 100)}%</button>
      <button aria-label={t.zoomIn} title={t.zoomIn} onClick={() => setZoom((value) => Math.min(3, value * 1.1))}><ZoomIn size={15} /></button>
      <small>{t.plainLinesHint}</small>
    </footer>
  </ScreenshotTooltips></main>;
}
