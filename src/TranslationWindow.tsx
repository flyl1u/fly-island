import { useTranslation } from "./i18n";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight, Check, Clipboard, Copy, Grip, Languages, LoaderCircle, Settings2, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TranslationWindow.css";

type Direction = "auto" | "zh-en" | "en-zh";
type TranslationSettings = { shortcut: string; direction: Direction; baseUrl: string; model: string };
const STORAGE_KEY = "focusd-island-translation-settings";
const DEFAULT_SETTINGS: TranslationSettings = { shortcut: "Alt+C", direction: "auto", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" };

function loadSettings(): TranslationSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<TranslationSettings> | null;
    const shortcut = typeof stored?.shortcut === "string" ? stored.shortcut : DEFAULT_SETTINGS.shortcut;
    return {
      shortcut: shortcut === "Alt+Space" ? DEFAULT_SETTINGS.shortcut : shortcut,
      direction: stored?.direction === "zh-en" || stored?.direction === "en-zh" ? stored.direction : "auto",
      baseUrl: typeof stored?.baseUrl === "string" && stored.baseUrl.trim() ? stored.baseUrl : DEFAULT_SETTINGS.baseUrl,
      model: typeof stored?.model === "string" && stored.model.trim() ? stored.model : DEFAULT_SETTINGS.model,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function normalizeShortcut(event: KeyboardEvent<HTMLInputElement>) {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Win"].filter(Boolean);
  if (!modifiers.length) return null;
  const key = event.key === " " || event.key === "Spacebar" ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join("+");
}

export default function TranslationWindow() {
  const t = useTranslation();
  const [settings, setSettings] = useState<TranslationSettings>(loadSettings);
  const [input, setInput] = useState("");
  const [clipboardPreview, setClipboardPreview] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [shortcutError, setShortcutError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [secretDraft, setSecretDraft] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const clipboardRequestId = useRef(0);
  const inputLength = Array.from(input).length;
  const targetLanguage = settings.direction === "zh-en"
    ? t.translator.english
    : settings.direction === "en-zh"
      ? t.translator.chinese
      : t.translator.bilingual;

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    void invoke<boolean>("has_translation_secret").then(setHasSecret).catch((failure) => setError(String(failure)));
  }, []);
  useEffect(() => {
    void invoke<string>("set_translation_shortcut", { shortcut: settings.shortcut })
      .then(() => setShortcutError(""))
      .catch((failure) => setShortcutError(String(failure)));
    // Shortcut edits register immediately in the recording handler.
  }, []);

  const refreshClipboard = useCallback(() => {
    const currentId = ++clipboardRequestId.current;
    void invoke<string | null>("read_translation_clipboard")
      .then((text) => { if (currentId === clipboardRequestId.current) setClipboardPreview(text ?? ""); })
      .catch(() => { if (currentId === clipboardRequestId.current) setClipboardPreview(""); });
  }, []);

  const pasteLatestClipboard = useCallback(async () => {
    const currentId = ++clipboardRequestId.current;
    try {
      const text = await invoke<string | null>("read_translation_clipboard");
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
    void listen("translation-window-opened", handleOpened).then((nextUnlisten) => {
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
      const translated = await invoke<string>("translate_text", { text, direction: settings.direction, baseUrl: settings.baseUrl, model: settings.model });
      if (currentId === requestId.current) setOutput(translated);
    } catch (failure) {
      if (currentId === requestId.current) setError(String(failure));
    } finally {
      if (currentId === requestId.current) setIsLoading(false);
    }
  }, [input, settings.direction, settings.baseUrl, settings.model, t]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const saveSecret = async () => {
    if (!secretDraft.trim()) return;
    setSavingSecret(true);
    try {
      await invoke("save_translation_secret", { secret: secretDraft });
      setSecretDraft("");
      setHasSecret(true);
      setError("");
    } catch (failure) { setError(String(failure)); }
    finally { setSavingSecret(false); }
  };

  const removeSecret = async () => {
    try {
      await invoke("delete_translation_secret");
      setHasSecret(false);
      setSecretDraft("");
    } catch (failure) { setError(String(failure)); }
  };

  const copyResult = async () => {
    if (!output) return;
    try {
      await invoke("copy_translation_result", { text: output });
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

  const close = () => { requestId.current += 1; clipboardRequestId.current += 1; void invoke("hide_translation_window"); };
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
          <section className="translation-window__config">
            <div className="translation-window__section-heading"><h2>{t.translator.settings}</h2><p>{t.translator.credentialHint}</p></div>
            <label className="translation-window__field"><span>{t.translator.baseUrl}</span>
              <input type="url" autoComplete="off" spellCheck={false} value={settings.baseUrl} onChange={(event) => setSettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder={DEFAULT_SETTINGS.baseUrl} />
              <small>{t.translator.baseUrlHint}</small>
            </label>
            <label className="translation-window__field"><span>{t.translator.model}</span>
              <input autoComplete="off" spellCheck={false} value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} placeholder={DEFAULT_SETTINGS.model} />
            </label>
            <label className="translation-window__field"><span>{t.translator.secret} {hasSecret && <em>{t.common.saved}</em>}</span>
              <input type="password" autoComplete="off" value={secretDraft} onChange={(event) => setSecretDraft(event.target.value)} placeholder={hasSecret ? t.translator.replaceSecret : t.translator.enterSecret} />
            </label>
            <div className="translation-window__config-actions">
              <button type="button" className="translation-window__primary" onClick={() => void saveSecret()} disabled={!secretDraft.trim() || savingSecret}>{t.translator.saveSecret}</button>
              {hasSecret && <button type="button" className="translation-window__secondary" onClick={() => void removeSecret()}>{t.translator.deleteSecret}</button>}
            </div>
            <label className="translation-window__field"><span>{t.translator.shortcut}</span>
              <input readOnly value={recordingShortcut ? t.translator.pressShortcut : settings.shortcut} onFocus={() => setRecordingShortcut(true)} onBlur={() => setRecordingShortcut(false)} onKeyDown={(event) => {
                event.preventDefault();
                if (event.key === "Escape") { setRecordingShortcut(false); event.currentTarget.blur(); return; }
                const shortcut = normalizeShortcut(event);
                if (!shortcut) return;
                const field = event.currentTarget;
                void invoke<string>("set_translation_shortcut", { shortcut })
                  .then((registered) => { setSettings((current) => ({ ...current, shortcut: registered })); setShortcutError(""); setRecordingShortcut(false); field.blur(); })
                  .catch((failure) => setShortcutError(String(failure)));
              }} />
              <small>{t.translator.shortcutHint}</small>
            </label>
            {(shortcutError || error) && <p className="translation-window__error" role="alert">{shortcutError || error}</p>}
          </section>
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
              <span className="translation-window__provider" title={settings.baseUrl}>{settings.model.trim() || DEFAULT_SETTINGS.model}</span>
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
