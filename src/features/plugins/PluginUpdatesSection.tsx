import { RefreshCcw, X } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";
import type { PluginsSnapshot } from "./api";

/** Plugins page > Updates: automatic updates (off by default), checking now, trusted publishers. */
export function PluginUpdatesSection({
  snapshot,
  busy,
  onAutoUpdateChange,
  onCheck,
  onUntrust,
}: {
  snapshot: PluginsSnapshot;
  busy: boolean;
  onAutoUpdateChange: (enabled: boolean) => void;
  onCheck: () => void;
  onUntrust: (publisher: string) => void;
}) {
  const t = useTranslation();
  const text = t.settings.plugins.updates;

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header">
        <span>{text.title}</span>
        <button className="plugin-card__button" type="button" disabled={busy || !snapshot.allowThirdParty} onClick={onCheck}>
          <RefreshCcw size={12} strokeWidth={2.4} />
          <span>{text.check}</span>
        </button>
      </div>
      <ToggleControl label={text.autoUpdate} checked={snapshot.autoUpdate} onChange={(next) => !busy && onAutoUpdateChange(next)} />
      <p className="settings-section__hint">{text.autoUpdateHint}</p>
      <div className="plugin-updates__trusted">
        <span>{text.trusted}</span>
        {snapshot.trustedPublishers.length === 0 ? (
          <p className="settings-section__hint">{text.noTrusted}</p>
        ) : (
          <ul>
            {snapshot.trustedPublishers.map((publisher) => (
              <li key={publisher}>
                <strong>{publisher}</strong>
                <button className="plugin-card__button plugin-card__button--quiet" type="button" disabled={busy} onClick={() => onUntrust(publisher)}>
                  <X size={12} strokeWidth={2.4} />
                  <span>{text.untrust}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
