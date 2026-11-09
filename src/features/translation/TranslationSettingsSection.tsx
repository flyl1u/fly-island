import { useEffect, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { useTranslation } from "../../i18n";
import { deleteTranslationSecret, hasTranslationSecret, saveTranslationSecret } from "./api";
import { DEFAULT_PROVIDER_MODELS, TRANSLATION_PROVIDERS } from "./providers";
import { useTranslationSettings } from "./useTranslationSettings";
import "./TranslationSettingsSection.css";

/** Service, model and key of quick translation; its shortcut is the next group on the page. */
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

  const footer = serviceError ? <span className="translation-settings__error" role="alert">{serviceError}</span> : t.translator.credentialHint;

  return (
    <>
      <SettingsGroup title={t.settings.translation.serviceTitle} footer={footer}>
        <SettingsRow
          title={t.translator.provider}
          control={
            <SettingsSelect
              value={provider}
              options={TRANSLATION_PROVIDERS.map((id) => ({ value: id, label: t.translator.providers[id] }))}
              ariaLabel={t.translator.provider}
              onChange={(next) => {
                setSecretDraft("");
                setServiceError("");
                setSettings((current) => ({ ...current, provider: next }));
              }}
            />
          }
        />
        {provider === "custom" && (
          <SettingsRow title={t.translator.baseUrl} description={t.translator.baseUrlHint}>
            <SettingsInput type="url" monospace autoComplete="off" aria-label={t.translator.baseUrl} value={settings.customBaseUrl} placeholder="https://example.com/v1" onChange={(event) => { const customBaseUrl = event.currentTarget.value; setSettings((current) => ({ ...current, customBaseUrl })); }} />
          </SettingsRow>
        )}
        <SettingsRow title={t.translator.model}>
          <SettingsInput monospace autoComplete="off" aria-label={t.translator.model} value={settings.models[provider] ?? ""} placeholder={defaultModel ? t.translator.modelDefault(defaultModel) : t.translator.modelRequired} onChange={(event) => { const model = event.currentTarget.value; setSettings((current) => ({ ...current, models: { ...current.models, [provider]: model } })); }} />
        </SettingsRow>
        <SettingsRow
          title={t.translator.secret}
          description={hasSecret ? t.common.saved : undefined}
          control={
            <>
              <SettingsLinkButton disabled={!secretDraft.trim() || savingSecret} onClick={() => void saveSecret()}>{t.translator.saveSecret}</SettingsLinkButton>
              {hasSecret && <SettingsLinkButton tone="danger" onClick={() => void removeSecret()}>{t.translator.deleteSecret}</SettingsLinkButton>}
            </>
          }
        >
          <SettingsInput type="password" autoComplete="off" aria-label={t.translator.secret} value={secretDraft} onChange={(event) => setSecretDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveSecret(); }} placeholder={hasSecret ? t.translator.replaceSecret : t.translator.enterSecret} />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
