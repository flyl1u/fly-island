import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Languages, Pin, X } from "lucide-react";
import { copyScreenshotText, destroyPinnedImage, pinnedImageSrc, revealPinnedImage } from "../../features/screenshot/api";
import type { Direction } from "../../features/translation";
import { useTranslation } from "../../i18n";
import { useDocumentTheme, useStoredTheme } from "../../features/appearance/useDocumentTheme";
import { ScreenshotTextLine } from "../screenshot/ScreenshotTextLine";
import { ScreenshotTooltips } from "../screenshot/ScreenshotTooltips";
import { useImageTranslation } from "./useImageTranslation";
import "./ScreenshotTranslationWindow.css";

export function ScreenshotTranslationWindow() {
  useDocumentTheme(useStoredTheme());
  const { screenshot: t, translator: tr } = useTranslation();
  const label = getCurrentWindow().label;
  const result = useImageTranslation(label);
  const [src, setSrc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState("both");
  const [zoom, setZoom] = useState(1);
  const [topmost, setTopmost] = useState(true);
  const [copied, setCopied] = useState<"translation" | "bilingual" | null>(null);
  const imageScroll = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => { void destroyPinnedImage(label).catch((cause) => setError(String(cause))); }, [label]);

  useEffect(() => {
    let alive = true;
    void pinnedImageSrc(label).then((path) => { if (alive) setSrc(convertFileSrc(path)); })
      .catch((cause) => { if (alive) setError(String(cause)); });
    void revealPinnedImage(label).catch((cause) => { if (alive) setError(String(cause)); });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [close, label]);
  useEffect(() => {
    const pane = imageScroll.current;
    if (!pane) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); setZoom((value) => Math.max(.25, Math.min(4, value * (event.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    pane.addEventListener("wheel", wheel, { passive: false });
    return () => pane.removeEventListener("wheel", wheel);
  }, [view]);

  const copy = async (bilingual = false) => {
    try {
      const text = bilingual
        ? result.lines.map((line) => [line.text, line.translated].filter(Boolean).join("\n")).join("\n\n")
        : result.lines.map((line) => line.translated).filter(Boolean).join("\n");
      await copyScreenshotText(text);
      setCopied(bilingual ? "bilingual" : "translation");
    } catch (cause) { setError(String(cause)); }
  };
  return <main className="shot-translation"><ScreenshotTooltips>
    <header className="shot-translation-title" data-tauri-drag-region>
      <Languages size={18} /><strong data-tauri-drag-region>{t.translationTitle}</strong>
      <button aria-label={t.pinMenuAlwaysOnTop} title={t.pinMenuAlwaysOnTop} aria-pressed={topmost} onClick={() => {
        void getCurrentWindow().setAlwaysOnTop(!topmost).then(() => setTopmost(!topmost)).catch((cause) => setError(String(cause)));
      }}><Pin size={16} /></button>
      <button aria-label={t.close} title={t.close} onClick={close}><X size={18} /></button>
    </header>
    <nav className="shot-translation-controls" aria-label={tr.direction}>
      <select aria-label={tr.direction} value={result.direction} disabled={result.busy}
        onChange={(event) => { result.setDirection(event.target.value as Direction); setCopied(null); }}>
        <option value="auto">{tr.auto}</option><option value="zh-en">{tr.zhEn}</option><option value="en-zh">{tr.enZh}</option>
      </select>
      <select aria-label={t.resultView} value={view} onChange={(event) => setView(event.target.value)}>
        <option value="both">{t.textAndImage}</option><option value="image">{t.imageOnly}</option><option value="text">{t.textOnly}</option>
      </select>
      <button disabled={result.busy || !result.lines.length} onClick={() => { setCopied(null); void result.run(); }}>
        {result.busy ? tr.loading : tr.translate}
      </button>
      <button disabled={!result.lines.some((line) => line.translated)} onClick={() => void copy()}><Copy size={14} />{copied === "translation" ? tr.copied : tr.copy}</button>
      <button disabled={result.busy || !result.lines.length} onClick={() => void copy(true)}><Copy size={14} />{copied === "bilingual" ? tr.copied : t.copyBilingual}</button>
    </nav>
    {result.error || error ? <p role="alert" className="shot-translation-error">{result.error || error}</p> : null}
    <div className={"shot-translation-content shot-translation-view-" + view} aria-busy={result.busy}>
      {view !== "text" ? <section className="shot-translation-image-panel" aria-label={t.originalImage}>
        <div className="shot-translation-image-tools"><span>{t.originalImage}</span>
          <button onClick={() => setZoom(1)} aria-label={t.resetSize} title={t.resetSize}>{Math.round(zoom * 100)}%</button>
        </div>
        <div className="shot-translation-image-scroll" ref={imageScroll}>
          <div className="shot-translation-picture" style={{ width: (zoom * 100) + "%" }}>
            {src ? <img src={src} alt={t.originalImage} /> : null}
          </div>
        </div>
      </section> : null}
      {view !== "image" ? <section className="shot-translation-text" aria-label={t.bilingualResult}>
        <h2>{t.bilingualResult}</h2>
        <div className="shot-translation-pairs">
          {result.lines.map((line, index) => <article key={index}>
            <label><span className="shot-translation-line-label">{tr.source}</span>
              <ScreenshotTextLine ariaLabel={tr.source + " " + (index + 1)} value={line.text} disabled={result.busy}
                onChange={(text) => { result.editSource(index, text); setCopied(null); }} />
            </label>
            <div><span className="shot-translation-line-label">{tr.result}</span>
              <p className={line.error !== null ? "shot-translation-error" : "shot-translation-output"} role={line.error !== null ? "alert" : undefined}>
                {line.error !== null ? t.translateFailed(line.error || t.translationEmpty) : line.translated || (result.busy ? tr.loading : "")}
              </p>
            </div>
          </article>)}
        </div>
      </section> : null}
    </div>
  </ScreenshotTooltips></main>;
}
