import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "../../i18n";
import { deleteTranslationSecret, saveTranslationSecret, setTranslationShortcut } from "./api";
import { DEFAULT_PROVIDER_MODELS, TRANSLATION_PROVIDERS, type TranslationProvider } from "./providers";
import type { TranslationSettings } from "./storage";

function normalizeShortcut(event: KeyboardEvent<HTMLInputElement>) {
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  const modifiers = [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Win"].filter(Boolean);
  if (!modifiers.length) return null;
  const key = event.key === " " || event.key === "Spacebar" ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join("+");
}

/** Service, model, key and shortcut settings of the translation window. */
export function TranslationSettingsPanel({
  settings,
  hasSecret,
  error,
  shortcutError,
  onSettingsChange,
  onHasSecretChange,
  onShortcutErrorChange,
}: {
  settings: TranslationSettings;
  hasSecret: boolean;
  error: string;
  shortcutError: string;
  onSettingsChange: (update: (current: TranslationSettings) => TranslationSettings) => void;
  onHasSecretChange: (hasSecret: boolean) => void;
  onShortcutErrorChange: (error: string) => void;
}) {
  const t = useTranslation();
  const [secretDraft, setSecretDraft] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [actionError, setActionError] = useState("");
  const provider = settings.provider;
  const defaultModel = DEFAULT_PROVIDER_MODELS[provider];

  const selectProvider = (next: TranslationProvider) => {
    setSecretDraft("");
    setActionError("");
    onSettingsChange((current) => ({ ...current, provider: next }));
  };

  const saveSecret = async () => {
    if (!secretDraft.trim()) return;
    setSavingSecret(true);
    try {
      await saveTranslationSecret(secretDraft, provider);
      setSecretDraft("");
      onHasSecretChange(true);
      setActionError("");
    } catch (failure) { setActionError(String(failure)); }
    finally { setSavingSecret(false); }
  };

  const removeSecret = async () => {
    try {
      await deleteTranslationSecret(provider);
      onHasSecretChange(false);
      setSecretDraft("");
    } catch (failure) { setActionError(String(failure)); }
  };

  const message = shortcutError || actionError || error;

  return (
    <section className="translation-window__config">
      <div className="translation-window__section-heading"><h2>{t.translator.settings}</h2><p>{t.translator.credentialHint}</p></div>
      <label className="translation-window__field"><span>{t.translator.provider}</span>
        <select value={provider} onChange={(event) => selectProvider(event.target.value as TranslationProvider)}>
          {TRANSLATION_PROVIDERS.map((id) => <option key={id} value={id}>{t.translator.providers[id]}</option>)}
        </select>
      </label>
      {provider === "custom" && (
        <label className="translation-window__field"><span>{t.translator.baseUrl}</span>
          <input type="url" autoComplete="off" spellCheck={false} value={settings.customBaseUrl} placeholder="https://example.com/v1" onChange={(event) => { const customBaseUrl = event.target.value; onSettingsChange((current) => ({ ...current, customBaseUrl })); }} />
          <small>{t.translator.baseUrlHint}</small>
        </label>
      )}
      <label className="translation-window__field"><span>{t.translator.model}</span>
        <input autoComplete="off" spellCheck={false} value={settings.models[provider] ?? ""} placeholder={defaultModel ? t.translator.modelDefault(defaultModel) : t.translator.modelRequired} onChange={(event) => { const model = event.target.value; onSettingsChange((current) => ({ ...current, models: { ...current.models, [provider]: model } })); }} />
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
          void setTranslationShortcut(shortcut)
            .then((registered) => { onSettingsChange((current) => ({ ...current, shortcut: registered })); onShortcutErrorChange(""); setRecordingShortcut(false); field.blur(); })
            .catch((failure) => onShortcutErrorChange(String(failure)));
        }} />
        <small>{t.translator.shortcutHint}</small>
      </label>
      {message && <p className="translation-window__error" role="alert">{message}</p>}
    </section>
  );
}
