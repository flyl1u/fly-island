import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SettingsDialog } from "../../components/settings/SettingsDialog";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { useTranslation } from "../../i18n";
import {
  clearZcodeApiKey, getZcodeApiKeySettings, notifyZcodeUsageChanged, saveZcodeApiKeySettings, type ZcodeApiPlatform, type ZcodeApiKeySettings,
} from "./api";
import { checkZcodeQuota, zcodeApiKeyError, type ZcodeApiKeyFeedback } from "./zcodeApiKeyStatus";
import "./ZcodeApiKeySettingsRow.css";

type Draft = { platform: ZcodeApiPlatform | null; apiKey: string; revealed: boolean };
const EMPTY_DRAFT: Draft = { platform: null, apiKey: "", revealed: false };

export function ZcodeApiKeySettingsRow({ polling }: { polling: boolean }) {
  const text = useTranslation().settings.agent.zcodeApiKey;
  const formId = useId();
  const inputId = useId();
  const [config, setConfig] = useState<ZcodeApiKeySettings | null>(null);
  const [feedback, setFeedback] = useState<ZcodeApiKeyFeedback | null>({ kind: "loading" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const saveRevision = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    if (saving.current) return;
    let active = true;
    const revision = saveRevision.current;
    const isCurrent = () => active && revision === saveRevision.current;
    void getZcodeApiKeySettings().then(async (next) => {
      if (!isCurrent()) return;
      setConfig(next);
      if (!next.hasKey || !polling) {
        setFeedback(null);
        return;
      }
      setFeedback({ kind: "checking" });
      const result = await checkZcodeQuota(true);
      if (isCurrent()) setFeedback(result.feedback);
    }).catch((error: unknown) => {
      if (isCurrent()) setFeedback(zcodeApiKeyError(error));
    });
    return () => { active = false; };
  }, [polling, reload]);

  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus();
    setDraft({ ...EMPTY_DRAFT });
    if (!config && feedback?.kind !== "loading") {
      setFeedback({ kind: "loading" });
      setReload((current) => current + 1);
    }
  };

  const apply = async (action: "save" | "clear") => {
    if (!draft || !config || saving.current) return;
    const apiKey = draft.apiKey.trim() || null;
    if (action === "save" && !apiKey && !config.hasKey) return;
    saving.current = true;
    saveRevision.current += 1;
    setBusy(true);
    setFeedback({ kind: "checking" });
    try {
      const next = action === "clear"
        ? await clearZcodeApiKey()
        : await saveZcodeApiKeySettings(draft.platform ?? config.platform, apiKey);
      setConfig(next);
      const clearedDraft = { ...EMPTY_DRAFT };
      setDraft((current) => current === draft ? clearedDraft : current);
      const result = await checkZcodeQuota(next.hasKey);
      setFeedback(result.feedback);
      void notifyZcodeUsageChanged(result.usage).catch((error) => console.error("Failed to refresh the Z Code quota ring", error));
      if (!result.feedback || !next.hasKey) setDraft((current) => current === clearedDraft ? null : current);
    } catch (error) {
      setFeedback(zcodeApiKeyError(error));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const maskedKey = config?.maskedKey ?? "····";
  const summary = config?.hasKey ? text.saved(maskedKey, text.platformNames[config.platform]) : config ? text.empty : "";
  const message = !feedback ? "" : feedback.kind === "http" ? text.status.http(feedback.detail) : text.status[feedback.kind];
  const isError = feedback !== null && feedback.kind !== "checking" && feedback.kind !== "loading";
  const disabled = busy || config === null;
  const close = () => setDraft(null);

  return (
    <SettingsRow
      indent
      title={text.title}
      description={<span className="zcode-api-key__summary" role="status">
        {summary}{summary && message && " · "}
        {message && <span className={isError ? "zcode-api-key__error" : undefined}>{message}</span>}
      </span>}
      control={<SettingsLinkButton onClick={open}>{text.settings}</SettingsLinkButton>}
    >
      {draft && (
        <SettingsDialog title={text.title} onClose={close} actions={<>
          {config?.hasKey && <SettingsLinkButton tone="danger" disabled={disabled} onClick={() => void apply("clear")}>{text.clear}</SettingsLinkButton>}
          <SettingsLinkButton onClick={close}>{text.cancel}</SettingsLinkButton>
          <button className="settings-dialog__primary" type="submit" form={formId}
            disabled={disabled || !(draft.apiKey.trim() || config?.hasKey)}>{text.save}</button>
        </>}>
          <form id={formId} className="zcode-api-key__form" onSubmit={(event) => {
            event.preventDefault();
            void apply("save");
          }}>
            <SettingsRow title={text.platform} control={<SettingsSelect
              value={draft.platform ?? config?.platform ?? "bigmodel"}
              ariaLabel={text.platform}
              disabled={disabled}
              options={[
                { value: "bigmodel", label: text.platformOptions.bigmodel },
                { value: "zai", label: text.platformOptions.zai },
              ]}
              onChange={(platform) => setDraft({ ...draft, platform })}
            />} />
            <SettingsRow title={text.apiKey} description={text.apiKeyHint} labelFor={inputId}>
              <div className="zcode-api-key__input">
                <SettingsInput
                  id={inputId}
                  type={draft.revealed ? "text" : "password"}
                  value={draft.apiKey}
                  placeholder={config?.hasKey ? text.savedPlaceholder(maskedKey) : text.placeholder}
                  disabled={disabled}
                  autoComplete="off"
                  onChange={(event) => setDraft({ ...draft, apiKey: event.currentTarget.value })}
                />
                <button
                  type="button"
                  className="zcode-api-key__visibility"
                  disabled={disabled}
                  aria-label={draft.revealed ? text.hide : text.show}
                  title={draft.revealed ? text.hide : text.show}
                  onClick={() => setDraft({ ...draft, revealed: !draft.revealed })}
                >
                  {draft.revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </div>
            </SettingsRow>
            {message && <p className={`zcode-api-key__feedback${isError ? " zcode-api-key__error" : ""}`} role={isError ? "alert" : "status"}>{message}</p>}
          </form>
        </SettingsDialog>
      )}
    </SettingsRow>
  );
}
