import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";

const SPEC_URL = "https://github.com/flyl1u/fly-island/blob/main/docs/plugins/README.md";

/** The public development guide is available before plugin execution ships. */
export function PluginDevelopmentPage() {
  const t = useTranslation().settings.plugins;
  const [failed, setFailed] = useState(false);
  const openSpec = async () => {
    setFailed(false);
    try { await openUrl(SPEC_URL); }
    catch { setFailed(true); }
  };

  return <section className="settings-section settings-section--list plugin-development">
    <SettingsGroup title={t.plan} footer={failed ? <p role="alert">{t.openGuideFailed}</p> : undefined}>
      <SettingsRow title={t.comingSoon} description={t.invitation} />
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
