import { useEffect, useState } from "react";
import { useTranslation } from "../../../i18n";
import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../../components/settings/SettingsSliderRow";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../../appearance/types";
import "./LyricsSettingsSection.css";

/** Settings → Music: where lyrics come from and how far they are moved. */
export function LyricsSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.lyrics;
  // Saved when the field is left, so each keystroke does not start a lookup.
  const [folder, setFolder] = useState(settings.lyricsFolder);
  useEffect(() => setFolder(settings.lyricsFolder), [settings.lyricsFolder]);
  const saveFolder = () => {
    if (folder.trim() !== settings.lyricsFolder) onSettingsChange({ ...settings, lyricsFolder: folder.trim() });
  };

  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <SettingsRow title={text.folder} description={text.folderHint}>
        <input
          className="lyrics-folder-input"
          value={folder}
          placeholder={text.folderPlaceholder}
          aria-label={text.folder}
          spellCheck={false}
          onChange={(event) => setFolder(event.currentTarget.value)}
          onBlur={saveFolder}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveFolder();
          }}
        />
      </SettingsRow>
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
      <SettingsSliderRow
        title={text.offset}
        description={text.offsetHint}
        value={settings.lyricsOffsetMs}
        min={-3000}
        max={3000}
        step={100}
        format={text.offsetValue}
        defaultValue={0}
        resetLabel={text.offsetReset}
        onChange={(lyricsOffsetMs) => onSettingsChange({ ...settings, lyricsOffsetMs })}
      />
    </SettingsGroup>
  );
}
