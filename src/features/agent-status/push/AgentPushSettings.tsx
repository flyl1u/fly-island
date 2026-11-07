import { useEffect, useState } from "react";
import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsInput } from "../../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { SettingsSelect } from "../../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../../i18n";
import { deleteBarkKey, hasBarkKey, saveBarkKey, sendBarkPush } from "./api";
import { AGENT_PUSH_AWAY_MINUTES, AGENT_PUSH_EVENTS } from "./storage";
import { PUSH_GROUP } from "./useAgentPush";
import { useAgentPushSettings } from "./useAgentPushSettings";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Settings → AI Agent → Alerts: pushing agent events to the phone with Bark (roadmap B6.5.5). */
export function AgentPushSettings() {
  const text = useTranslation().settings.agent.push;
  const [settings, setSettings] = useAgentPushSettings();
  const [keySaved, setKeySaved] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hasBarkKey().then(setKeySaved).catch(() => setKeySaved(false));
  }, []);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus(done);
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  };
  const saveKey = () =>
    run(async () => {
      await saveBarkKey(keyInput);
      setKeyInput("");
      setKeySaved(true);
    }, text.keySaved);
  const clearKey = () =>
    run(async () => {
      await deleteBarkKey();
      setKeySaved(false);
    }, text.keyCleared);
  const test = () => run(() => sendBarkPush(settings.server, text.testTitle, text.testBody, PUSH_GROUP), text.testSent);

  const awayOptions = AGENT_PUSH_AWAY_MINUTES.map((minutes) => ({ value: String(minutes), label: text.awayValue(minutes) }));

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <SettingsToggleRow title={text.enabled} description={text.enabledHint} checked={settings.enabled} onChange={(enabled) => setSettings({ ...settings, enabled })} />
      {settings.enabled && (
        <>
          <SettingsRow indent title={text.server} description={text.serverHint}>
            <SettingsInput
              monospace
              value={settings.server}
              placeholder="https://api.day.app"
              aria-label={text.server}
              onChange={(event) => setSettings({ ...settings, server: event.target.value })}
            />
          </SettingsRow>
          <SettingsRow
            indent
            title={text.key}
            description={keySaved ? text.keyIsSaved : text.keyHint}
            control={
              keySaved ? (
                <SettingsLinkButton tone="danger" disabled={busy} onClick={() => void clearKey()}>{text.clearKey}</SettingsLinkButton>
              ) : (
                <SettingsLinkButton disabled={busy || !keyInput.trim()} onClick={() => void saveKey()}>{text.saveKey}</SettingsLinkButton>
              )
            }
          >
            {!keySaved && (
              <SettingsInput
                monospace
                type="password"
                value={keyInput}
                placeholder={text.keyPlaceholder}
                aria-label={text.key}
                onChange={(event) => setKeyInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && keyInput.trim()) void saveKey();
                }}
              />
            )}
          </SettingsRow>
          {AGENT_PUSH_EVENTS.map((event) => (
            <SettingsToggleRow
              key={event}
              indent
              title={text.events[event]}
              checked={settings.events[event]}
              onChange={(on) => setSettings({ ...settings, events: { ...settings.events, [event]: on } })}
            />
          ))}
          <SettingsRow
            indent
            title={text.away}
            description={text.awayHint}
            control={
              <SettingsSelect
                value={String(settings.awayMinutes)}
                options={awayOptions}
                ariaLabel={text.away}
                onChange={(value) => setSettings({ ...settings, awayMinutes: Number(value) })}
              />
            }
          />
          <SettingsRow
            indent
            title={text.test}
            description={status ?? undefined}
            control={<SettingsLinkButton disabled={busy || !keySaved} onClick={() => void test()}>{text.testAction}</SettingsLinkButton>}
          />
        </>
      )}
    </SettingsGroup>
  );
}
