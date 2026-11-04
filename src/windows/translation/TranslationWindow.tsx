import { useTranslation } from "../../i18n";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight, Check, Clipboard, Copy, Grip, Languages, LoaderCircle, Settings2, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { copyTranslationResult, hasTranslationSecret, hideTranslationWindow, listenTranslationWindowOpened, readTranslationClipboard, setTranslationShortcut, translateText } from "./api";
import { loadSettings, saveTranslationSettings, type Direction, type TranslationSettings } from "./storage";
import { TranslationSettingsPanel } from "./TranslationSettingsPanel";
import "./TranslationWindow.css";

export function TranslationWindow() {
  const t = useTranslation();
  const [settings, setSettings] = useState<TranslationSettings>(loadSettings);
  const [input, setInput] = useState("");
  const [clipboardPreview, setClipboardPreview] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [shortcutError, setShortcutError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const clipboardRequestId = useRef(0);
  const inputLength = Array.from(input).length;
  const targetLanguage = settings.direction === "zh-en"
    ? t.translator.english
    : settings.direction === "en-zh"
      ? t.translator.chinese
      : t.translator.bilingual;

  useEffect(() => { saveTranslationSettings(settings); }, [settings]);
  // Keys are stored per service, so the saved state follows the selected one.
  useEffect(() => {
    let didCancel = false;
    void hasTranslationSecret(settings.provider)
      .then((saved) => { if (!didCancel) setHasSecret(saved); })
      .catch((failure) => { if (!didCancel) setError(String(failure)); });
    return () => { didCancel = true; };
  }, [settings.provider]);
  useEffect(() => {
    void setTranslationShortcut(settings.shortcut)
      .then(() => setShortcutError(""))
      .catch((failure) => setShortcutError(String(failure)));
    // Registers the saved shortcut once on mount; edits register immediately in the
    // recording handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshClipboard = useCallback(() => {
    const currentId = ++clipboardRequestId.current;
    void readTranslationClipboard()
      .then((text) => { if (currentId === clipboardRequestId.current) setClipboardPreview(text ?? ""); })
      .catch(() => { if (currentId === clipboardRequestId.current) setClipboardPreview(""); });
  }, []);

  const pasteLatestClipboard = useCallback(async () => {
    const currentId = ++clipboardRequestId.current;
    try {
      const text = await readTranslationClipboard();
      if (currentId !== clipboardRequestId.current) return;
      if (!text) { setError(t.translator.emptyClipboard); return; }
      setClipboardPreview(text);
      setInput(text);
      setError("");
      setDidCopy(false);
      inputRef.current?.focus();
    } catch (failure) {
      if (currentId === clipboardRequestId.current) setError(String(failure));
    }
  }, [t]);

  const handleOpened = useCallback(() => {
    requestId.current += 1;
    setInput("");
    setOutput("");
    setError("");
    setDidCopy(false);
    setIsLoading(false);
    setShowConfig(false);
    setClipboardPreview("");
    refreshClipboard();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [refreshClipboard]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let didCancel = false;
    void listenTranslationWindowOpened(handleOpened).then((nextUnlisten) => {
      if (didCancel) nextUnlisten();
      else unlisten = nextUnlisten;
    });
    void getCurrentWindow().isVisible().then((visible) => {
      if (!didCancel && visible) handleOpened();
    });
    return () => { didCancel = true; unlisten?.(); };
  }, [handleOpened]);

  useEffect(() => {
    if (showConfig) return;
    const handleTab = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab" || event.isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      void pasteLatestClipboard();
    };
    window.addEventListener("keydown", handleTab, true);
    return () => window.removeEventListener("keydown", handleTab, true);
  }, [pasteLatestClipboard, showConfig]);

  const submit = useCallback(async () => {
    const text = input.trim();
    if (!text) { setError(t.translator.emptySource); return; }
    if (Array.from(text).length > 5000) { setError(t.translator.tooLong); return; }
    const currentId = ++requestId.current;
    setError("");
    setOutput("");
    setIsLoading(true);
    try {
      const { provider } = settings;
      const translated = await translateText(text, settings.direction, {
        provider,
        baseUrl: provider === "custom" ? settings.customBaseUrl.trim() : null,
        model: settings.models[provider]?.trim() || null,
      });
      if (currentId === requestId.current) setOutput(translated);
    } catch (failure) {
      if (currentId === requestId.current) setError(String(failure));
    } finally {
      if (currentId === requestId.current) setIsLoading(false);
    }
  }, [input, settings, t]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const copyResult = async () => {
    if (!output) return;
    try {
      await copyTranslationResult(output);
      setDidCopy(true);
    } catch (failure) { setError(String(failure)); }
  };

  const clearSource = () => {
    requestId.current += 1;
    setInput("");
    setOutput("");
    setError("");
    setDidCopy(false);
    setIsLoading(false);
    inputRef.current?.focus();
  };

  const close = () => { requestId.current += 1; clipboardRequestId.current += 1; void hideTranslationWindow(); };
  const startWindowDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging().catch((failure) => console.error("Cannot drag translation window", failure));
  };
  const startResize = (event: PointerEvent<HTMLDivElement>, direction: "East" | "South" | "SouthEast") => {
    if (event.button !== 0) return;
    event.stopPropagation();
    void getCurrentWindow().startResizeDragging(direction)
      .catch((failure) => console.error("Cannot resize translation window", failure));
  };

  return (
    <main className="translation-stage">
      <section className="translation-window" aria-label={t.translator.label}>
        <header className="translation-window__header" onPointerDown={startWindowDrag}>
          <span className="translation-window__mark" aria-hidden="true"><Languages size={18} /></span>
          <div className="translation-window__heading"><h1>{t.translator.title}</h1></div>
          <kbd className="translation-window__shortcut">{settings.shortcut}</kbd>
          <div className="translation-window__actions">
            <button type="button" title={t.translator.settings} aria-label={t.translator.settings} aria-pressed={showConfig} onClick={() => setShowConfig((value) => !value)}><Settings2 size={18} /></button>
            <button type="button" title={t.common.close} aria-label={t.translator.closeLabel} onClick={close}><X size={18} /></button>
          </div>
        </header>

        {showConfig ? (
          <TranslationSettingsPanel
            settings={settings}
            hasSecret={hasSecret}
            error={error}
            shortcutError={shortcutError}
            onSettingsChange={setSettings}
            onHasSecretChange={(saved) => { setHasSecret(saved); if (saved) setError(""); }}
            onShortcutErrorChange={setShortcutError}
          />
        ) : (
          <>
            <div className="translation-window__toolbar">
              <div className="translation-window__languages">
                <select id="translation-direction" aria-label={t.translator.direction} value={settings.direction} disabled={isLoading} onChange={(event) => setSettings({ ...settings, direction: event.target.value as Direction })}>
                  <option value="auto">{t.translator.auto}</option><option value="zh-en">{t.translator.chinese}</option><option value="en-zh">{t.translator.english}</option>
                </select>
                <ArrowRight size={15} aria-hidden="true" />
                <span>{targetLanguage}</span>
              </div>
              <span className="translation-window__provider">{t.translator.providers[settings.provider]}</span>
            </div>
            <div className="translation-window__content">
              <section className="translation-window__panel translation-window__source">
                <div className="translation-window__panel-heading">
                  <h2 id="translation-source-label">{t.translator.source}</h2>
                  <div className="translation-window__source-actions">
                    <span className={inputLength > 5000 ? "translation-window__error" : ""} title={t.translator.limit}>{inputLength.toLocaleString()} / 5,000</span>
                    {input && <button type="button" className="translation-window__icon-button" onClick={clearSource} title={t.translator.clearSource} aria-label={t.translator.clearSource}><X size={14} /></button>}
                  </div>
                </div>
                <textarea id="translation-input" aria-labelledby="translation-source-label" ref={inputRef} value={input} onChange={(event) => { setInput(event.target.value); setError(""); setDidCopy(false); }} onKeyDown={handleInputKeyDown} placeholder={t.translator.placeholder} />
                {!input && clipboardPreview && <button type="button" className="translation-window__clipboard" onClick={() => void pasteLatestClipboard()} title={t.translator.paste}><Clipboard size={14} /><span>{t.translator.clipboard(clipboardPreview.slice(0, 120))}</span><kbd>Tab</kbd></button>}
              </section>
              <section className="translation-window__panel translation-window__target" aria-busy={isLoading} aria-labelledby="translation-result-label">
                <div className="translation-window__panel-heading"><h2 id="translation-result-label">{t.translator.result}</h2><button type="button" className="translation-window__copy" onClick={() => void copyResult()} disabled={!output} title={t.translator.copy} aria-label={t.translator.copy}>{didCopy ? <><Check size={14} /><span>{t.translator.copied}</span></> : <Copy size={15} />}</button></div>
                <div className={`translation-window__result ${output ? "translation-window__result--filled" : ""}`} aria-live="polite">{output || <span className="translation-window__empty-result">{isLoading && <LoaderCircle className="translation-window__spinner" size={16} aria-hidden="true" />}{isLoading ? t.translator.loading : t.translator.emptyResult}</span>}</div>
              </section>
            </div>
            <footer className="translation-window__footer">
              <div className="translation-window__footer-info">{error ? <span className="translation-window__error" role="alert">{error}</span> : !hasSecret ? <button type="button" className="translation-window__setup" onClick={() => setShowConfig(true)}>{t.translator.configureSecret}</button> : <span>{t.translator.enterHint}</span>}</div>
              <button type="button" className="translation-window__primary translation-window__translate" onClick={() => void submit()} disabled={isLoading}>{isLoading ? t.translator.loading : t.translator.translate} {!isLoading && <ArrowRight size={15} />}</button>
            </footer>
          </>
        )}
        <div className="translation-window__resize translation-window__resize--east" onPointerDown={(event) => startResize(event, "East")} aria-hidden="true" />
        <div className="translation-window__resize translation-window__resize--south" onPointerDown={(event) => startResize(event, "South")} aria-hidden="true" />
        <div className="translation-window__resize translation-window__resize--corner" onPointerDown={(event) => startResize(event, "SouthEast")} aria-hidden="true"><Grip size={12} /></div>
      </section>
    </main>
  );
}
