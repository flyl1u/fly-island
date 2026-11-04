import { ExternalLink } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { NODE_DOWNLOAD_URL, openPluginHomepage } from "./api";

/** Shown for plugins that need Node.js when it was not found, with a link to get it. */
export function NodeMissingHint() {
  const t = useTranslation();
  const { locale } = useLocale();

  return (
    <div className="plugin-node-hint">
      <p className="plugin-card__hint">{t.settings.plugins.nodeMissing}</p>
      <button className="plugin-card__button" type="button" onClick={() => void openPluginHomepage(NODE_DOWNLOAD_URL[locale])}>
        <ExternalLink size={12} strokeWidth={2.4} />
        <span>{t.settings.plugins.getNode}</span>
      </button>
    </div>
  );
}
