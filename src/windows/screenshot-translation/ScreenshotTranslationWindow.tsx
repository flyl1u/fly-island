import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Languages, Pin, X } from "lucide-react";
import { copyScreenshotText, destroyPinnedImage, pinnedImageSrc, revealPinnedImage } from "../../features/screenshot/api";
import type { Direction } from "../../features/translation";
import { useTranslation } from "../../i18n";
import { useDocumentTheme, useStoredTheme } from "../../features/appearance/useDocumentTheme";
import { useImageTranslation } from "./useImageTranslation";
import "./ScreenshotTranslationWindow.css";

export function ScreenshotTranslationWindow() {
  useDocumentTheme(useStoredTheme());
  const { screenshot: t, translator: tr } = useTranslation();
  const label = getCurrentWindow().label;
  const result = useImageTranslation(label);
  const [src, setSrc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [view, setView] = useState("both");
  const [original, setOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [topmost, setTopmost] = useState(true);
  const [copied, setCopied] = useState(false);
  const close = useCallback(() => { void destroyPinnedImage(label).catch((cause) => setError(String(cause))); }, [label]);

  useEffect(() => {
    let alive = true;
    void pinnedImageSrc(label).then((path) => { if (alive) setSrc(convertFileSrc(path)); })
      .catch((cause) => { if (alive) setError(String(cause)); });
    void revealPinnedImage(label).catch((cause) => { if (alive) setError(String(cause)); });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [close, label]);

  const copy = async () => {
    try {
      await copyScreenshotText(result.lines.map((line) => line.translated).filter(Boolean).join("\n"));
      setCopied(true);
    } catch (cause) { setError(String(cause)); }
  };
  return (
    <main className="shot-translation">
      <header className="shot-translation-title" data-tauri-drag-region>
        <Languages size={18} /><strong data-tauri-drag-region>{t.translationTitle}</strong>
        <button aria-label={t.pinMenuAlwaysOnTop} aria-pressed={topmost} onClick={() => {
          void getCurrentWindow().setAlwaysOnTop(!topmost).then(() => setTopmost(!topmost)).catch((cause) => setError(String(cause)));
        }}><Pin size={16} /></button>
        <button aria-label={t.close} onClick={close}><X size={18} /></button>
      </header>
      <nav className="shot-translation-controls" aria-label={tr.direction}>
        <select aria-label={tr.direction} value={result.direction} disabled={result.busy}
          onChange={(event) => { result.setDirection(event.target.value as Direction); setCopied(false); }}>
          <option value="auto">{tr.auto}</option><option value="zh-en">{tr.zhEn}</option><option value="en-zh">{tr.enZh}</option>
        </select>
        <select aria-label={t.resultView} value={view} onChange={(event) => setView(event.target.value)}>
          <option value="both">{t.textAndImage}</option><option value="image">{t.imageOnly}</option><option value="text">{t.textOnly}</option>
        </select>
        <button disabled={result.busy || !result.lines.length} onClick={() => { setCopied(false); void result.run(); }}>
          {result.busy ? tr.loading : tr.translate}
        </button>
        <button disabled={!result.lines.some((line) => line.translated)} onClick={() => void copy()}><Copy size={14} />{copied ? tr.copied : tr.copy}</button>
      </nav>
      {result.error || error ? <p role="alert" className="shot-translation-error">{result.error || error}</p> : null}
      <div className={`shot-translation-content shot-translation-${view}`} aria-busy={result.busy}>
        {view !== "image" ? <section className="shot-translation-text" aria-label={tr.result}>
          {result.lines.map((line, index) => <article key={index}>
            <textarea aria-label={`${tr.source} ${index + 1}`} value={line.text} disabled={result.busy}
              onChange={(event) => { result.editSource(index, event.target.value); setCopied(false); }} />
            <p className={line.error !== null ? "shot-translation-error" : ""}>
              {line.error !== null ? t.translateFailed(line.error || t.translationEmpty) : line.translated || (result.busy ? tr.loading : "")}
            </p>
          </article>)}
        </section> : null}
        {view !== "text" ? <section className="shot-translation-image-panel" aria-label={t.imageOnly}>
          <div className="shot-translation-image-tools">
            <button aria-pressed={!original} onClick={() => setOriginal(false)}>{t.translatedImage}</button>
            <button aria-pressed={original} onClick={() => setOriginal(true)}>{t.originalImage}</button>
            <button onClick={() => setZoom(1)} aria-label={t.resetSize}>{Math.round(zoom * 100)}%</button>
          </div>
          <div className="shot-translation-image-scroll" onWheel={(event) => {
            if (!event.ctrlKey) return;
            event.preventDefault(); setZoom((value) => Math.max(0.25, Math.min(4, value + (event.deltaY < 0 ? 0.1 : -0.1))));
          }}>
            <div className="shot-translation-picture" style={{ width: `${zoom * 100}%` }}>
              {src ? <img src={src} alt={t.originalImage} onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} /> : null}
              {!original ? result.lines.filter((line) => line.translated).map((line, index) => <span key={index}
                className="shot-translation-image-line" style={{ left: `${line.x / natural.width * 100}%`, top: `${line.y / natural.height * 100}%`,
                  width: `${line.width / natural.width * 100}%`, minHeight: `${line.height / natural.height * 100}%`,
                  fontSize: `clamp(9px, ${line.height / natural.width * 85}cqw, 32px)` }}>{line.translated}</span>) : null}
            </div>
          </div>
        </section> : null}
      </div>
    </main>
  );
}
