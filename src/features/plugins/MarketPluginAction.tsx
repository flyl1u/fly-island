import { useState } from "react";
import { Check, Download, Settings2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MarketPlugin } from "./api";
import { hasUpdate } from "./marketGroups";

/**
 * The right-hand side of a market card: Install; a grey "Installed" mark and
 * Manage; or an accent "Update to vX". An update signed by another author key
 * takes two clicks ("Update anyway", then "Confirm").
 */
export function MarketPluginAction({
  plugin,
  trusted,
  publisher,
  installingId,
  onInstall,
  onManage,
}: {
  plugin: MarketPlugin;
  trusted: boolean;
  publisher: string;
  installingId: string | null;
  onInstall: (id: string, trust: boolean, acceptKeyChange: boolean) => void;
  /** Opens the installed plugin on the plugins page; without it there is no Manage button. */
  onManage?: (id: string) => void;
}) {
  const text = useTranslation().settings.plugins.market;
  const [confirmingKeyChange, setConfirmingKeyChange] = useState(false);

  if (plugin.revoked) return <span className="plugin-market__state plugin-market__state--revoked">{text.revoked}</span>;
  if (plugin.incompatible) return <span className="plugin-market__state" title={plugin.incompatible}>{text.incompatible}</span>;
  const isUpdate = hasUpdate(plugin);
  if (plugin.installedVersion !== null && !isUpdate) {
    return (
      <>
        <span className="plugin-market__installed">
          <Check size={12} strokeWidth={2.6} aria-hidden="true" />
          {text.installed}
        </span>
        {onManage ? (
          <button className="plugin-card__button plugin-card__button--quiet" type="button" title={text.manageHint} onClick={() => onManage(plugin.id)}>
            <Settings2 size={12} strokeWidth={2.4} />
            <span>{text.manage}</span>
          </button>
        ) : null}
      </>
    );
  }
  const keyChanged = isUpdate && plugin.signingKeyChanged;
  if (keyChanged && confirmingKeyChange) {
    return (
      <>
        <button
          className="plugin-card__button plugin-card__button--danger"
          type="button"
          disabled={installingId !== null}
          onClick={() => {
            setConfirmingKeyChange(false);
            onInstall(plugin.id, !trusted, true);
          }}
        >
          <span>{text.confirmKeyChange}</span>
        </button>
        <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => setConfirmingKeyChange(false)}>
          <span>{text.cancel}</span>
        </button>
      </>
    );
  }
  const label = installingId === plugin.id ? text.installing : keyChanged ? text.updateAnyway : !trusted ? text.trustAndInstall : isUpdate ? text.update(plugin.version) : text.install;
  return (
    <button
      className={`plugin-card__button${isUpdate && !keyChanged ? " plugin-market__update" : ""}`}
      type="button"
      title={trusted ? undefined : text.trustHint(publisher)}
      disabled={installingId !== null}
      onClick={() => (keyChanged ? setConfirmingKeyChange(true) : onInstall(plugin.id, !trusted, false))}
    >
      <Download size={12} strokeWidth={2.4} />
      <span>{label}</span>
    </button>
  );
}
