import { RotateCcw } from "lucide-react";
import { useTranslation } from "../../i18n";
import { isSensitivePermission, type PluginInfo, type SensitivePermission } from "./api";

/** The plugin's sensitive permissions, what the user answered, and revoking the answer. */
export function PluginSensitiveSection({
  plugin,
  busy,
  onRevoke,
}: {
  plugin: PluginInfo;
  busy: boolean;
  onRevoke: (permission: SensitivePermission) => void;
}) {
  const t = useTranslation();
  const labels = t.settings.plugins.sensitive;
  const permissions = plugin.permissions.filter(isSensitivePermission);
  if (permissions.length === 0) return null;

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header">
        <span>{labels.title}</span>
      </div>
      <p className="settings-section__hint">{labels.hint}</p>
      <ul className="plugin-detail__sensitive">
        {permissions.map((permission) => {
          const choice = plugin.sensitive[permission];
          return (
            <li key={permission}>
              <span>{labels.action[permission]}</span>
              <em>{choice === "allowed" ? labels.allowed : choice === "denied" ? labels.denied : labels.none}</em>
              {choice ? (
                <button className="plugin-card__button" type="button" disabled={busy} onClick={() => onRevoke(permission)}>
                  <RotateCcw size={12} strokeWidth={2.4} />
                  <span>{labels.revoke}</span>
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
