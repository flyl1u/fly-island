import { useEffect, useState, type KeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "../../i18n";
import { deleteTranslationSecret, hasTranslationSecret, saveTranslationSecret, setTranslationShortcut } from "./api";
import { DEFAULT_PROVIDER_MODELS, TRANSLATION_PROVIDERS, isTranslationProvider } from "./providers";
import { useTranslationSettings } from "./useTranslationSettings";
import "./TranslationSettingsSection.css";

function shortcutFromEvent(event: KeyboardEvent<HTMLElement>) {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Win"].filter(Boolean);
  if (!modifiers.length) return null;
  const key = event.key === " " || event.key === "Spacebar" ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join("+");
}

/** Service, model, key and shortcut of the quick translation window, on its own settings page. */
export function TranslationSettingsSection() {
  const t = useTranslation();
  const [settings, setSettings] = useTranslationSettings();
  const [hasSecret, setHasSecret] = useState(false);
  const [secretDraft, setSecretDraft] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [serviceError, setServiceError] = useState("");
  const [shortcutError, setShortcutError] = useState("");
  const provider = settings.provider;
  const defaultModel = DEFAULT_PROVIDER_MODELS[provider];

  // Keys are stored per service, so the saved state follows the selected one.
  useEffect(() => {
    let didCancel = false;
    void hasTranslationSecret(provider)
      .then((saved) => { if (!didCancel) setHasSecret(saved); })
      .catch((failure) => { if (!didCancel) setServiceError(String(failure)); });
    return () => { didCancel = true; };
  }, [provider]);

  const saveSecret = async () => {
    if (!secretDraft.trim()) return;
    setSavingSecret(true);
    try {
      await saveTranslationSecret(secretDraft, provider);
      setSecretDraft("");
      setHasSecret(true);
      setServiceError("");
    } catch (failure) { setServiceError(String(failure)); }
    finally { setSavingSecret(false); }
  };

  const removeSecret = async () => {
    try {
      await deleteTranslationSecret(provider);
      setHasSecret(false);
      setSecretDraft("");
    } catch (failure) { setServiceError(String(failure)); }
  };

  const recordShortcut = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recordingShortcut) return;
    event.preventDefault();
    if (event.key === "Escape") { setRecordingShortcut(false); return; }
    const shortcut = shortcutFromEvent(event);
    if (!shortcut) return;
    void setTranslationShortcut(shortcut)
      .then((registered) => {
        setSettings((current) => ({ ...current, shortcut: registered }));
        setShortcutError("");
        setRecordingShortcut(false);
      })
      .catch((failure) => setShortcutError(String(failure)));
  };

  return (
    <>
      <section className="settings-section settings-section--translation">
        <div className="settings-section__header"><span>{t.settings.translation.serviceTitle}</span></div>
        <p className="settings-section__hint">{t.translator.credentialHint}</p>
        <label className="translation-settings__row">
          <span>{t.translator.provider}</span>
          <select value={provider} onChange={(event) => {
            const next = event.currentTarget.value;
            if (!isTranslationProvider(next)) return;
            setSecretDraft("");
            setServiceError("");
            setSettings((current) => ({ ...current, provider: next }));
          }}>
            {TRANSLATION_PROVIDERS.map((id) => <option key={id} value={id}>{t.translator.providers[id]}</option>)}
          </select>
        </label>
        {provider === "custom" && (
          <label className="translation-settings__row translation-settings__row--stacked">
            <span>{t.translator.baseUrl}</span>
            <input type="url" autoComplete="off" spellCheck={false} value={settings.customBaseUrl} placeholder="https://example.com/v1" onChange={(event) => { const customBaseUrl = event.currentTarget.value; setSettings((current) => ({ ...current, customBaseUrl })); }} />
            <small>{t.translator.baseUrlHint}</small>
          </label>
        )}
        <label className="translation-settings__row">
          <span>{t.translator.model}</span>
          <input autoComplete="off" spellCheck={false} value={settings.models[provider] ?? ""} placeholder={defaultModel ? t.translator.modelDefault(defaultModel) : t.translator.modelRequired} onChange={(event) => { const model = event.currentTarget.value; setSettings((current) => ({ ...current, models: { ...current.models, [provider]: model } })); }} />
        </label>
        <div className="translation-settings__row">
          <span>{t.translator.secret}{hasSecret && <em>{t.common.saved}</em>}</span>
          <div className="translation-settings__secret">
            <input type="password" autoComplete="off" aria-label={t.translator.secret} value={secretDraft} onChange={(event) => setSecretDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveSecret(); }} placeholder={hasSecret ? t.translator.replaceSecret : t.translator.enterSecret} />
            <button type="button" className="translation-settings__button translation-settings__button--primary" onClick={() => void saveSecret()} disabled={!secretDraft.trim() || savingSecret}>{t.translator.saveSecret}</button>
            {hasSecret && <button type="button" className="translation-settings__button" onClick={() => void removeSecret()}>{t.translator.deleteSecret}</button>}
          </div>
        </div>
        {serviceError && <p className="translation-settings__error" role="alert">{serviceError}</p>}
      </section>
      <section className="settings-section settings-section--translation-shortcut">
        <div className="settings-section__header"><span>{t.settings.translation.shortcutTitle}</span></div>
        <div className="translation-settings__row">
          <span>{t.translator.shortcut}</span>
          <button type="button" className={`translation-settings__shortcut${recordingShortcut ? " translation-settings__shortcut--recording" : ""}`} onClick={() => setRecordingShortcut(true)} onKeyDown={recordShortcut} onBlur={() => setRecordingShortcut(false)}>
            <Keyboard size={14} strokeWidth={2.3} />
            <span>{recordingShortcut ? t.translator.pressShortcut : settings.shortcut}</span>
          </button>
        </div>
        <p className="settings-section__hint">{t.settings.translation.shortcutHint}</p>
        {shortcutError && <p className="translation-settings__error" role="alert">{shortcutError}</p>}
      </section>
    </>
  );
}
