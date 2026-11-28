import { PluginPageGroups } from "./PluginSettingsGroup";
import { AppleMusicLyricsSection } from "../../features/media/lyrics/AppleMusicLyricsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { LyricsSettingsSection } from "../../features/media/lyrics/LyricsSettingsSection";
import { MusicSourcePrioritySection } from "../../features/media/MusicSourcePrioritySection";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import { MediaCompatibilitySection } from "../../features/media/MediaCompatibilitySection";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { MusicShortcutRows } from "../../features/media/MusicShortcutRows";
import { useMusicShortcuts } from "../../features/media/useMusicShortcuts";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import { useTranslationSettings } from "../../features/translation/useTranslationSettings";
import { useSettingsShortcutOwners } from "./useSettingsShortcutOwners";
import { findShortcutOwner } from "./shortcutConflicts";

/** Settings → Music: the module switch, which player the island follows, and where lyrics come from. */
export function MusicSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const [shortcuts, updateShortcuts] = useMusicShortcuts();
  const [clipboard] = useClipboardSettings();
  const [translation] = useTranslationSettings();
  const owners = useSettingsShortcutOwners(settings, clipboard, translation, shortcuts);

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.music}
        checked={settings.musicEnabled}
        onChange={(musicEnabled) => onSettingsChange({ ...settings, musicEnabled })}
      />
      {settings.musicEnabled && <MusicSourcePrioritySection />}
      {settings.musicEnabled && <SettingsGroup title={t.settings.categories.shortcuts} footer={t.settings.shortcuts.globalHint}>
        <MusicShortcutRows shortcuts={shortcuts} onChange={updateShortcuts} takenBy={(shortcut, action) => findShortcutOwner(shortcut, owners, `music-${action}`)} />
      </SettingsGroup>}
      {settings.musicEnabled && <LyricsSettingsSection settings={settings} onSettingsChange={onSettingsChange} />}
      {settings.musicEnabled && <MediaCompatibilitySection />}
      <PluginPageGroups page="music" renderNative={() => <AppleMusicLyricsSection settings={settings} onSettingsChange={onSettingsChange} />} />
    </>
  );
}
