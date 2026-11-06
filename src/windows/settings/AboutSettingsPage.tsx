import { useEffect, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { DEFAULT_SETTINGS } from "../../features/appearance/settings";
import type { IslandSettings } from "../../features/appearance/types";
import { ProjectIdentitySection, ProjectLinksSection } from "../../features/updater/ProjectSettingsSection";
import { UpdateSettingsSection } from "../../features/updater/UpdateSettingsSection";
import { useTranslation } from "../../i18n";
import { quitIsland } from "./api";

// An unanswered confirmation falls back, so a stray click later cannot reset.
const CONFIRM_TIMEOUT_MS = 4_000;

/**
 * About: the island, its version and updates (the former Updates page), links, and last the two
 * actions that end something: resetting every setting (after a confirmation) and quitting.
 */
export function AboutSettingsPage({ onSettingsChange }: { onSettingsChange: (settings: IslandSettings) => void }) {
  const t = useTranslation();
  const text = t.settings.project;
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timeout = window.setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [confirming]);

  return (
    <>
      <ProjectIdentitySection />
      <UpdateSettingsSection />
      <ProjectLinksSection />
      <SettingsGroup>
        <SettingsRow
          title={text.resetAll}
          description={text.resetAllHint}
          control={
            confirming ? (
              <>
                <SettingsLinkButton onClick={() => setConfirming(false)}>{text.resetAllCancel}</SettingsLinkButton>
                <SettingsLinkButton
                  tone="danger"
                  onClick={() => {
                    setConfirming(false);
                    onSettingsChange(DEFAULT_SETTINGS);
                  }}
                >
                  {text.resetAllConfirm}
                </SettingsLinkButton>
              </>
            ) : (
              <SettingsLinkButton tone="danger" onClick={() => setConfirming(true)}>{text.resetAllAction}</SettingsLinkButton>
            )
          }
        />
        <SettingsRow
          title={text.quit}
          description={text.quitHint}
          control={
            <SettingsLinkButton tone="danger" onClick={() => void quitIsland().catch((error) => console.error("Failed to quit the island", error))}>
              {text.quitAction}
            </SettingsLinkButton>
          }
        />
      </SettingsGroup>
    </>
  );
}
