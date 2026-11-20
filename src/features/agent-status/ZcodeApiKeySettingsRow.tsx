import { useEffect, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { useTranslation } from "../../i18n";
import { clearZcodeApiKey, getZcodeApiKeySettings, getZcodeUsage, saveZcodeApiKeySettings, type ZcodeApiPlatform, type ZcodeApiKeySettings } from "./api";
import "./ZcodeApiKeySettingsRow.css";

type FeedbackKind = "checking" | "saved" | "noQuota" | "invalidKey" | "network" | "http" | "response" | "storage" | "required" | "invalidInput" | "cleared" | "desktopReady" | "platformSaved" | "desktopError";
type Feedback = { kind: FeedbackKind; detail?: string };

function errorFeedback(error: unknown): Feedback {
  if (error === "zcode_usage:auth" || error === "zcode_usage:rejected") return { kind: "invalidKey" };
  if (error === "zcode_usage:network") return { kind: "network" };
  if (typeof error === "string" && error.startsWith("zcode_usage:http:")) return { kind: "http", detail: error.slice("zcode_usage:http:".length) };
  if (error === "zcode_usage:response" || error === "zcode_usage:request") return { kind: "response" };
  if (error === "zcode_api_key:invalid" || error === "zcode_api_key:platform") return { kind: "invalidInput" };
  if (typeof error === "string" && error.startsWith("zcode_usage:")) return { kind: "response" };
  return { kind: "storage" };
}

function statusText(feedback: Feedback, text: ReturnType<typeof useTranslation>["settings"]["agent"]["zcodeApiKey"]) {
  return feedback.kind === "http" ? text.status.http(feedback.detail ?? "") : text.status[feedback.kind];
}

export function ZcodeApiKeySettingsRow({ polling }: { polling: boolean }) {
  const text = useTranslation().settings.agent.zcodeApiKey;
  const inputId = useId();
  const [config, setConfig] = useState<ZcodeApiKeySettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const disabled = loading || busy || config === null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFeedback(null);
    void getZcodeApiKeySettings().then(async (next) => {
      if (!active) return;
      setConfig(next);
      if (next.hasKey && polling) {
        setFeedback({ kind: "checking" });
        try {
          const usage = await getZcodeUsage();
          if (active) setFeedback({ kind: usage ? "saved" : "noQuota" });
        } catch (error) {
          if (active) setFeedback(errorFeedback(error));
        }
      }
    }).catch((error: unknown) => {
      if (active) setFeedback(errorFeedback(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [polling]);

  const save = async () => {
    if (!apiKey.trim()) {
      setFeedback({ kind: "required" });
      return;
    }
    if (!config) return;
    setBusy(true);
    setFeedback({ kind: "checking" });
    try {
      const next = await saveZcodeApiKeySettings(config.platform, apiKey);
      setConfig(next);
      setApiKey("");
      const usage = await getZcodeUsage();
      setFeedback({ kind: usage ? "saved" : "noQuota" });
    } catch (error) {
      setFeedback(errorFeedback(error));
    } finally {
      setBusy(false);
    }
  };

  const checkUsage = async () => {
    setBusy(true);
    setFeedback({ kind: "checking" });
    try {
      const usage = await getZcodeUsage();
      setFeedback({ kind: usage ? "saved" : "noQuota" });
    } catch (error) {
      setFeedback(errorFeedback(error));
    } finally {
      setBusy(false);
    }
  };

  const changePlatform = async (platform: ZcodeApiPlatform) => {
    if (!config) return;
    setBusy(true);
    setFeedback({ kind: "checking" });
    try {
      const next = await saveZcodeApiKeySettings(platform, null);
      setConfig(next);
      if (next.hasKey) {
        const usage = await getZcodeUsage();
        setFeedback({ kind: usage ? "saved" : "noQuota" });
      } else {
        setFeedback({ kind: "platformSaved" });
      }
    } catch (error) {
      setFeedback(errorFeedback(error));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setFeedback({ kind: "checking" });
    try {
      const next = await clearZcodeApiKey();
      setConfig(next);
      setApiKey("");
      try {
        const usage = await getZcodeUsage();
        setFeedback({ kind: usage ? "desktopReady" : "cleared" });
      } catch {
        setFeedback({ kind: "desktopError" });
      }
    } catch (error) {
      setFeedback(errorFeedback(error));
    } finally {
      setBusy(false);
    }
  };

  const error = feedback !== null && !["checking", "saved", "cleared", "desktopReady", "platformSaved"].includes(feedback.kind);
  const message = feedback ? statusText(feedback, text) : "";

  return (
    <>
      <SettingsRow indent title={text.title} description={text.description} />
      <SettingsRow
        indent
        title={text.platform}
        control={<SettingsSelect
          value={config?.platform ?? "bigmodel"}
          ariaLabel={text.platform}
          disabled={disabled}
          options={[
            { value: "bigmodel", label: text.platformOptions.bigmodel },
            { value: "zai", label: text.platformOptions.zai },
          ]}
          onChange={(value) => void changePlatform(value)}
        />}
      />
      <SettingsRow indent title={text.apiKey} description={text.apiKeyHint} labelFor={inputId}>
        <div className="zcode-api-key__form">
          <div className="zcode-api-key__input">
            <SettingsInput
              id={inputId}
              type={revealed ? "text" : "password"}
              value={apiKey}
              placeholder={config?.maskedKey ?? text.placeholder}
              disabled={disabled}
              autoComplete="off"
              aria-label={text.apiKey}
              onChange={(event) => {
                setApiKey(event.currentTarget.value);
                setFeedback(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
            />
            <button
              type="button"
              className="zcode-api-key__visibility"
              disabled={disabled}
              aria-label={revealed ? text.hide : text.show}
              title={revealed ? text.hide : text.show}
              onClick={() => setRevealed((value) => !value)}
            >
              {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
          <div className="zcode-api-key__actions">
            {feedback && <span className={`zcode-api-key__feedback${error ? " zcode-api-key__feedback--error" : ""}`} role={error ? "alert" : "status"}>{message}</span>}
            {config?.hasKey && !apiKey.trim() && <SettingsLinkButton disabled={disabled} onClick={() => void checkUsage()}>{text.check}</SettingsLinkButton>}
            <SettingsLinkButton disabled={disabled || !apiKey.trim()} onClick={() => void save()}>{text.save}</SettingsLinkButton>
            {config?.hasKey && <SettingsLinkButton tone="danger" disabled={disabled} onClick={() => void clear()}>{text.clear}</SettingsLinkButton>}
          </div>
        </div>
      </SettingsRow>
    </>
  );
}
