import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clipboard, Copy, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import { hasTranslationSecret, readTranslationClipboard } from "./api";
import { takeTranslationHandoff, type Direction } from "./storage";
import { useAutoTranslate } from "./useAutoTranslate";
import { useTranslationRequest } from "./useTranslationRequest";
import { useTranslationSettings } from "./useTranslationSettings";
import "./TranslationPanel.css";

/**
 * Translation as a page of the expanded island. It shares settings, key, clipboard fill and
 * auto-translate with the translation window, and keeps its text while the island collapses.
 */
export function TranslationPanel({ isOpen, onOpenSettings }: { isOpen: boolean; onOpenSettings: () => void }) {
  const t = useTranslation();
  const [settings, setSettings] = useTranslationSettings();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const skipAutoSource = useRef<string | null>(null);
  const latest = useRef({ input, pasteOnOpen: settings.pasteClipboardOnOpen });
  latest.current = { input, pasteOnOpen: settings.pasteClipboardOnOpen };
  const targetLanguage = settings.direction === "zh-en"
    ? t.translator.english
    : settings.direction === "en-zh" ? t.translator.chinese : t.translator.bilingual;

  // Checked each time the page opens, so a key saved in the settings window meanwhile is seen.
  useEffect(() => {
    if (!isOpen) return;
    let didCancel = false;
    void hasTranslationSecret(settings.provider)
      .then((saved) => { if (!didCancel) setHasSecret(saved); })
      .catch((failure) => { if (!didCancel) setError(String(failure)); });
    return () => { didCancel = true; };
  }, [isOpen, settings.provider]);

  const fillSource = useCallback((source: string, result: string) => {
    requestId.current += 1;
    setInput(source);
    setOutput(result);
    setError("");
    setDidCopy(false);
    setIsLoading(false);
    skipAutoSource.current = result ? source.trim() : null;
  }, []);

  // Opening shows a quick result the island asked for, or fills an empty source from the clipboard.
  useEffect(() => {
    if (!isOpen) return;
    let didCancel = false;
    const handoff = takeTranslationHandoff();
    if (handoff) fillSource(handoff.source, handoff.output);
    else if (latest.current.pasteOnOpen && !latest.current.input.trim()) {
      void readTranslationClipboard()
        .then((text) => { if (!didCancel && text && !latest.current.input.trim()) fillSource(text, ""); })
        .catch(() => {});
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => { didCancel = true; window.cancelAnimationFrame(frame); };
  }, [fillSource, isOpen]);

  const paste = async () => {
    try {
      const text = await readTranslationClipboard();
      if (text) fillSource(text, "");
      else setError(t.translator.emptyClipboard);
      inputRef.current?.focus();
    } catch (failure) { setError(String(failure)); }
  };

  const noteAutoSource = useCallback(() => { skipAutoSource.current = input.trim(); }, [input]);
  const { submit, handleInputKeyDown, copyResult, clearSource } = useTranslationRequest({
    input, settings, output, requestId, inputRef, setInput, setOutput, setError, setIsLoading, setDidCopy,
    onStart: noteAutoSource,
  });
  const autoTranslateKey = `${settings.direction}\0${settings.provider}\0${settings.customBaseUrl}\0${settings.models[settings.provider] ?? ""}`;
  useAutoTranslate(isOpen && settings.autoTranslate && hasSecret && !isLoading, input, autoTranslateKey, skipAutoSource, submit);

  return (
    <div className="translation-panel">
      <div className="translation-panel__toolbar">
        <select aria-label={t.translator.direction} value={settings.direction} disabled={isLoading} onChange={(event) => { const direction = event.target.value as Direction; setSettings((current) => ({ ...current, direction })); }}>
          <option value="auto">{t.translator.auto}</option><option value="zh-en">{t.translator.chinese}</option><option value="en-zh">{t.translator.english}</option>
        </select>
        <ArrowRight size={13} aria-hidden="true" />
        <span>{targetLanguage}</span>
        <span className="translation-panel__provider">{t.translator.providers[settings.provider]}</span>
      </div>
      <div className="translation-panel__source">
        <textarea ref={inputRef} aria-label={t.translator.source} value={input} placeholder={t.translator.panelPlaceholder} onKeyDown={handleInputKeyDown} onChange={(event) => { setInput(event.target.value); setError(""); setDidCopy(false); }} />
        {input && <button type="button" className="translation-panel__icon" onClick={clearSource} aria-label={t.translator.clearSource}><X size={13} /></button>}
      </div>
      <div className={`translation-panel__result${output ? " translation-panel__result--filled" : ""}`} aria-live="polite" aria-busy={isLoading} aria-label={t.translator.result}>
        {output || <span className="translation-panel__empty">{isLoading && <LoaderCircle className="translation-panel__spinner" size={14} aria-hidden="true" />}{isLoading ? t.translator.loading : t.translator.emptyResult}</span>}
      </div>
      <div className="translation-panel__footer">
        <div className="translation-panel__status">
          {error
            ? <span className="translation-panel__error" role="alert">{error}</span>
            : !hasSecret && <button type="button" className="translation-panel__setup" onClick={onOpenSettings}>{t.translator.configureSecret}</button>}
        </div>
        <button type="button" className="translation-panel__icon" onClick={() => void paste()} aria-label={t.translator.paste}><Clipboard size={14} /></button>
        <button type="button" className="translation-panel__icon" onClick={() => void copyResult()} disabled={!output} aria-label={didCopy ? t.translator.copied : t.translator.copy}>{didCopy ? <Check size={14} /> : <Copy size={14} />}</button>
        <button type="button" className="translation-panel__primary" onClick={() => void submit()} disabled={isLoading}>{isLoading ? t.translator.loading : t.translator.translate}</button>
      </div>
    </div>
  );
}
