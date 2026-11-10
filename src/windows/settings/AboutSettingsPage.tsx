import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { ProjectIdentitySection, ProjectLinksSection } from "../../features/updater/ProjectSettingsSection";
import { useTranslation } from "../../i18n";
import { quitIsland } from "./api";

/** About: the island, one group with updates and the links, and quitting. */
export function AboutSettingsPage() {
  const text = useTranslation().settings.project;

  return (
    <>
      <ProjectIdentitySection />
      <ProjectLinksSection />
      <SettingsGroup>
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
