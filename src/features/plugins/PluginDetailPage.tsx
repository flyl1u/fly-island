import { useState } from "react";
import { ArrowLeft, Eraser, Play } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useLocale, useTranslation } from "../../i18n";
import type { PluginInfo, SensitivePermission } from "./api";
import { PluginInfoList } from "./PluginInfoList";
import { PluginSensitiveSection } from "./PluginSensitiveSection";
import { PluginSettingField } from "./PluginSettingField";
import "./PluginDetailPage.css";

/** A plugin's own page: what it shares while running, its settings, its actions and its log. */
export function PluginDetailPage({
  plugin,
  busy,
  onBack,
  onSettingChange,
  onRunCommand,
  onNotificationsMutedChange,
  onPreReleaseChange,
  onClearData,
  onRevokeSensitive,
}: {
  plugin: PluginInfo;
  busy: boolean;
  onBack: () => void;
  onSettingChange: (key: string, value: unknown) => void;
  onRunCommand: (command: string) => void;
  onNotificationsMutedChange: (muted: boolean) => void;
  onPreReleaseChange: (enabled: boolean) => void;
  onClearData: () => void;
  onRevokeSensitive: (permission: SensitivePermission) => void;
}) {
  const t = useTranslation();
  const { locale } = useLocale();
  const running = plugin.status === "running";
  // Clearing takes a second click, like uninstalling.
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <>
      <section className="settings-section plugins-panel">
        <div className="plugin-detail__header">
          <button className="plugin-card__button" type="button" onClick={onBack}>
            <ArrowLeft size={12} strokeWidth={2.4} />
            <span>{t.settings.plugins.detail.back}</span>
          </button>
          {plugin.hasProcess && plugin.enabled ? (
            <span className={`plugin-card__status plugin-card__status--${plugin.status}`}>
              {t.settings.plugins.status[plugin.status]}
            </span>
          ) : null}
        </div>
        <div className="plugin-card__title">
          <strong title={plugin.id}>{plugin.name?.[locale] ?? plugin.id}</strong>
          {plugin.version ? <span>v{plugin.version}</span> : null}
        </div>
        {plugin.error ? <p className="plugin-card__error">{plugin.error}</p> : null}
      </section>

      {plugin.hasProcess ? (
        <section className="settings-section plugins-panel">
          <div className="settings-section__header">
            <span>{t.settings.plugins.detail.info}</span>
          </div>
          {plugin.info.length > 0 ? (
            <PluginInfoList items={plugin.info} />
          ) : (
            <p className="settings-section__hint">{t.settings.plugins.detail.infoWhenRunning}</p>
          )}
        </section>
      ) : null}

      <section className="settings-section plugins-panel">
        <div className="settings-section__header">
          <span>{t.settings.plugins.detail.settings}</span>
        </div>
        {plugin.settingsSchema.length === 0 ? (
          <p className="settings-section__hint">{t.settings.plugins.detail.noSettings}</p>
        ) : (
          plugin.settingsSchema.map((spec) => (
            <PluginSettingField
              key={spec.key}
              spec={spec}
              value={plugin.settings[spec.key]}
              disabled={busy}
              onChange={(value) => onSettingChange(spec.key, value)}
            />
          ))
        )}
      </section>

      {plugin.permissions.includes("island:notify") ? (
        <section className="settings-section plugins-panel">
          <div className="settings-section__header">
            <span>{t.settings.plugins.detail.notifications}</span>
          </div>
          <ToggleControl
            label={t.settings.plugins.detail.showNotifications}
            checked={!plugin.notificationsMuted}
            onChange={(show) => !busy && onNotificationsMutedChange(!show)}
          />
        </section>
      ) : null}

      {plugin.preRelease || plugin.preReleaseAvailable ? (
        <section className="settings-section plugins-panel">
          <div className="settings-section__header">
            <span>{t.settings.plugins.updates.preReleaseTitle}</span>
          </div>
          <ToggleControl
            label={t.settings.plugins.updates.preRelease}
            checked={plugin.preRelease}
            onChange={(enabled) => !busy && onPreReleaseChange(enabled)}
          />
          <p className="settings-section__hint">
            {plugin.preReleaseAvailable ? t.settings.plugins.updates.preReleaseAvailable(plugin.preReleaseAvailable) : null}
            {t.settings.plugins.updates.preReleaseHint}
          </p>
        </section>
      ) : null}

      <PluginSensitiveSection plugin={plugin} busy={busy} onRevoke={onRevokeSensitive} />

      {plugin.commands.length > 0 || plugin.hasProcess ? (
        <section className="settings-section plugins-panel">
          {plugin.commands.length > 0 ? (
            <>
              <div className="settings-section__header">
                <span>{t.settings.plugins.detail.actions}</span>
              </div>
              <div className="plugin-card__actions">
                {plugin.commands.map((command) => (
                  <button
                    className="plugin-card__button"
                    type="button"
                    key={command.id}
                    disabled={!running}
                    onClick={() => onRunCommand(command.id)}
                  >
                    <Play size={12} strokeWidth={2.4} />
                    <span>{command.title[locale]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {plugin.hasProcess && !plugin.builtin ? (
            <>
              <div className="settings-section__header">
                <span>{t.settings.plugins.detail.data}</span>
              </div>
              <p className="settings-section__hint">{t.settings.plugins.detail.dataHint}</p>
              <div className="plugin-card__actions">
                <button
                  className={`plugin-card__button${confirmingClear ? " plugin-card__button--danger" : ""}`}
                  type="button"
                  disabled={busy}
                  onBlur={() => setConfirmingClear(false)}
                  onClick={() => {
                    if (!confirmingClear) return setConfirmingClear(true);
                    setConfirmingClear(false);
                    onClearData();
                  }}
                >
                  <Eraser size={12} strokeWidth={2.4} />
                  <span>{confirmingClear ? t.settings.plugins.detail.confirmClearData : t.settings.plugins.detail.clearData}</span>
                </button>
              </div>
            </>
          ) : null}
          {plugin.hasProcess ? (
            <details className="plugin-card__log">
              <summary>{t.settings.plugins.log}</summary>
              <pre>{plugin.log.length > 0 ? plugin.log.join("\n") : t.settings.plugins.noLog}</pre>
            </details>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
