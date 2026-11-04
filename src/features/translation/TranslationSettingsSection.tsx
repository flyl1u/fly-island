import { useEffect, useState } from "react";
import { SelectControl } from "../../components/controls/SelectControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";
import { deleteTranslationSecret, hasTranslationSecret, saveTranslationSecret } from "./api";
import { DEFAULT_PROVIDER_MODELS, TRANSLATION_PROVIDERS } from "./providers";
import { useTranslationSettings } from "./useTranslationSettings";
import "./TranslationSettingsSection.css";

/** Service, model, key and behavior of quick translation; its shortcuts are on the Shortcuts page. */
export function TranslationSettingsSection() {
  const t = useTranslation();
  const [settings, setSettings] = useTranslationSettings();
  const [hasSecret, setHasSecret] = useState(false);
  const [secretDraft, setSecretDraft] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [serviceError, setServiceError] = useState("");
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

  return (
    <>
      <section className="settings-section settings-section--translation">
        <div className="settings-section__header"><span>{t.settings.translation.serviceTitle}</span></div>
        <p className="settings-section__hint">{t.translator.credentialHint}</p>
        <div className="translation-settings__row">
          <span>{t.translator.provider}</span>
          <SelectControl
            value={provider}
            options={TRANSLATION_PROVIDERS.map((id) => ({ value: id, label: t.translator.providers[id] }))}
            ariaLabel={t.translator.provider}
            onChange={(next) => {
              setSecretDraft("");
              setServiceError("");
              setSettings((current) => ({ ...current, provider: next }));
            }}
          />
        </div>
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
      <section className="settings-section settings-section--translation-behavior">
        <div className="settings-section__header"><span>{t.settings.translation.behaviorTitle}</span></div>
        <ToggleControl label={t.settings.translation.pasteOnOpen} checked={settings.pasteClipboardOnOpen} onChange={(pasteClipboardOnOpen) => setSettings((current) => ({ ...current, pasteClipboardOnOpen }))} />
        <p className="settings-section__hint">{t.settings.translation.pasteOnOpenHint}</p>
        <ToggleControl label={t.settings.translation.autoTranslate} checked={settings.autoTranslate} onChange={(autoTranslate) => setSettings((current) => ({ ...current, autoTranslate }))} />
        <p className="settings-section__hint">{t.settings.translation.autoTranslateHint}</p>
      </section>
    </>
  );
}
