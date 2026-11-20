import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";

const SPEC_URL = "https://github.com/flyl1u/fly-island/blob/main/docs/plugins/README.md";

/** The public plugin development guide, below the market. */
export function PluginDevelopmentPage() {
  const t = useTranslation().settings.plugins;
  const [failed, setFailed] = useState(false);
  const openSpec = async () => {
    setFailed(false);
    try { await openUrl(SPEC_URL); }
    catch { setFailed(true); }
  };

  return <section className="settings-section settings-section--list plugin-development">
    <SettingsGroup footer={failed ? <p role="alert">{t.openGuideFailed}</p> : undefined}>
      <SettingsRow title={t.guide} description={t.guideHint}>
        <div>
          <SettingsLinkButton onClick={() => { void openSpec(); }}>
            {t.readGuide}<ArrowUpRight size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </SettingsLinkButton>
        </div>
      </SettingsRow>
    </SettingsGroup>
  </section>;
}
