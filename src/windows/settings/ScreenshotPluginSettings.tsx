import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { ShortcutRecordButton } from "../../components/controls/ShortcutRecordButton";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { useNativePluginStates, setNativePluginEnabled } from "../../features/plugins/native";
import { configureScreenshotPlugin, screenshotCapabilities, startCaptureTask } from "../../features/screenshot/api";
import { DEFAULT_SCREENSHOT_SETTINGS, type ScreenshotSettings } from "../../features/screenshot/storage";
import { useScreenshotSettings, updateScreenshotSettings } from "../../features/screenshot/useScreenshotSettings";
import { buildShortcutFromEvent } from "../../features/clipboard/shortcut";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import { useTranslationSettings } from "../../features/translation/useTranslationSettings";
import { useMusicShortcuts } from "../../features/media/useMusicShortcuts";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { useSettingsShortcutOwners } from "./useSettingsShortcutOwners";
import { findShortcutOwner } from "./shortcutConflicts";
import "../../features/clipboard/ClipboardSettingsSection.css";
import "./ScreenshotPluginSettings.css";
import { ScreenshotOcrResourcesRow } from "../../features/screenshot/ScreenshotOcrResourcesRow";

export type ScreenshotShortcutIssue = { shortcut: string; reason: string };
export function ScreenshotPluginSettings({ settings, onBack, issue: suppliedIssue, onIssueResolved = () => {} }: {
  settings: IslandSettings; onBack?: () => void; issue?: ScreenshotShortcutIssue | null; onIssueResolved?: () => void;
}) {
  const all = useTranslation(), t = all.screenshot.plugin;
  const { installed, enabled } = useNativePluginStates();
  const config = useScreenshotSettings();
  const issue = suppliedIssue ?? config.shortcutIssue;
  const resolveIssue = () => { updateScreenshotSettings({ shortcutIssue: null }); onIssueResolved(); };
  const [clipboard] = useClipboardSettings(), [translation] = useTranslationSettings(), [music] = useMusicShortcuts();
  const owners = useSettingsShortcutOwners(settings, clipboard, translation, music);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(false);
  const recordArea = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let alive = true;
    void screenshotCapabilities().then((caps) => { if (alive) setAvailable(caps.screenshot); }).catch((cause) => { if (alive) setError(String(cause)); });
    // Recheck saved keys when settings opens, so conflicts from another application are visible.
    void configureScreenshotPlugin(enabled.screenshot, config.shortcutEnabled ? config.shortcut : "").catch((cause) => { if (alive) setError(String(cause)); });
    return () => { alive = false; };
    // Settings edits below report their own registration result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  const save = (patch: Partial<ScreenshotSettings>) => { if (!updateScreenshotSettings(patch)) throw new Error(t.saveFailed); };
  const apply = (patch: Partial<ScreenshotSettings>) => void perform(async () => {
    const next = { ...config, ...patch };
    const taken = next.shortcutEnabled ? findShortcutOwner(next.shortcut, owners, "screenshot") : null;
    if (taken) throw new Error(all.settings.shortcuts.taken(next.shortcut, taken));
    await configureScreenshotPlugin(enabled.screenshot || Boolean(issue), next.shortcutEnabled ? next.shortcut : "");
    try { save(patch); } catch (cause) {
      await configureScreenshotPlugin(enabled.screenshot, config.shortcutEnabled ? config.shortcut : "");
      throw cause;
    }
    if (issue) { setNativePluginEnabled("screenshot", true); resolveIssue(); }
  });
  if (!installed.screenshot) return null;
  return <section className="settings-section settings-section--list screenshot-plugin-settings">
    {onBack && <SettingsLinkButton onClick={onBack}><ArrowLeft size={14} />{t.back}</SettingsLinkButton>}
    {issue || error ? <div className="screenshot-plugin-alert" role="alert">
      <strong>{issue ? t.installedNeedsShortcut : t.actionFailed}</strong>
      {issue ? <p>{t.shortcutIssueHint(issue.shortcut)}</p> : null}
      <p>{error || issue?.reason}</p>
      {issue ? <div className="screenshot-plugin-alert__actions">
        <button type="button" disabled={busy} onClick={() => {
          const button = recordArea.current?.querySelector<HTMLButtonElement>(".shortcut-record-button");
          button?.scrollIntoView({ block: "center" }); button?.focus(); button?.click();
        }}>{t.changeShortcut}</button>
        <button type="button" disabled={busy} onClick={() => void perform(async () => {
          await configureScreenshotPlugin(true, "");
          try { save({ shortcutEnabled: false }); } catch (cause) { await configureScreenshotPlugin(false, ""); throw cause; }
          setNativePluginEnabled("screenshot", true); resolveIssue();
        })}>{t.useWithoutShortcut}</button>
      </div> : null}
    </div> : null}
    <SettingsGroup title={t.title} footer={t.performance}>
      <SettingsToggleRow title={t.enabled} description={t.disabledHint} checked={enabled.screenshot} disabled={busy}
        onChange={(on) => void perform(async () => {
          if (on && config.shortcutEnabled) {
            const taken = findShortcutOwner(config.shortcut, owners, "screenshot");
            if (taken) throw new Error(all.settings.shortcuts.taken(config.shortcut, taken));
          }
          await configureScreenshotPlugin(on, config.shortcutEnabled ? config.shortcut : "");
          setNativePluginEnabled("screenshot", on);
          if (on) resolveIssue();
        })} />
      <SettingsRow title={t.captureNow} description={t.captureHint} control={<SettingsLinkButton disabled={busy || !enabled.screenshot || !available}
        onClick={() => void perform(() => startCaptureTask("screenshot"))}>{t.captureNow}</SettingsLinkButton>} />
    </SettingsGroup>
    <SettingsGroup title={t.shortcut}>
      <SettingsToggleRow title={t.shortcutEnabled} checked={config.shortcutEnabled} disabled={busy} onChange={(shortcutEnabled) => apply({ shortcutEnabled })} />
      <div className="shortcut-row" ref={recordArea}><div className="shortcut-control"><div className="shortcut-control__meta"><span>{t.shortcut}</span><strong>{config.shortcut}</strong></div>
        <div className="shortcut-control__actions">
          <ShortcutResetButton label={all.settings.shortcuts.reset(DEFAULT_SCREENSHOT_SETTINGS.shortcut)} isDefault={config.shortcut === DEFAULT_SCREENSHOT_SETTINGS.shortcut}
            disabled={busy || !config.shortcutEnabled} onReset={() => apply({ shortcut: DEFAULT_SCREENSHOT_SETTINGS.shortcut })} />
          <ShortcutRecordButton shortcut={config.shortcut} pressKeysLabel={all.translator.pressShortcut} disabled={busy || !config.shortcutEnabled}
            toShortcut={buildShortcutFromEvent} onRecord={(shortcut) => apply({ shortcut })} onInterrupted={() => setError(all.settings.shortcuts.takenElsewhere)} />
        </div>
      </div></div>
    </SettingsGroup>
    <SettingsGroup title={t.tools}>
      <ScreenshotOcrResourcesRow />
      {(["showMagnifier", "windowSnapping", "showHints"] as const).map((key, index) => <SettingsToggleRow key={key}
        title={[t.magnifier, t.snapping, t.hints][index]} checked={config[key]} onChange={(value) => { try { save({ [key]: value }); setError(""); } catch (cause) { setError(String(cause)); } }} />)}
    </SettingsGroup>
    <SettingsGroup title={t.extensions}>
      <SettingsToggleRow title={t.longCapture} description={t.developing} checked={false} disabled onChange={() => {}} />
      <SettingsToggleRow title={t.recording} description={t.developing} checked={false} disabled onChange={() => {}} />
    </SettingsGroup>
  </section>;
}
