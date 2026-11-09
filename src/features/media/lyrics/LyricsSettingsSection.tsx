import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../../appearance/types";
import { useTranslation } from "../../../i18n";

/**
 * Settings → Music → Lyrics: looking lyrics up online, and the Chinese sources with them. Timing
 * is fixed per song on the music page itself (LyricsOffsetControl).
 */
export function LyricsSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.lyrics;

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <SettingsToggleRow
        title={text.online}
        description={text.onlineHint}
        checked={settings.lyricsOnline}
        onChange={(lyricsOnline) => onSettingsChange({ ...settings, lyricsOnline })}
      />
      {settings.lyricsOnline && (
        <SettingsToggleRow
          indent
          title={text.chinese}
          description={text.chineseHint}
          checked={settings.lyricsChinese}
          onChange={(lyricsChinese) => onSettingsChange({ ...settings, lyricsChinese })}
        />
      )}
    </SettingsGroup>
  );
}
