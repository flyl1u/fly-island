import { useEffect, useState } from "react";
import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import { SettingsSecretRow } from "../../../components/settings/SettingsSecretRow";
import type { IslandSettings } from "../../appearance/types";
import { useTranslation } from "../../../i18n";
import { hasAppleMusicToken, setAppleMusicToken } from "./api";

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
  const [tokenSaved, setTokenSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasAppleMusicToken()
      .then((saved) => {
        if (!cancelled) setTokenSaved(saved);
      })
      .catch((error: unknown) => {
        console.error("Failed to read the Apple Music token state", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
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
        <SettingsToggleRow
          title={text.wordFill}
          checked={settings.lyricWordFill}
          onChange={(lyricWordFill) => onSettingsChange({ ...settings, lyricWordFill })}
        />
      </SettingsGroup>
      <SettingsGroup title={text.appleMusic} footer={tokenSaved ? text.appleMusicTokenSaved : text.appleMusicTokenMissing}>
        <SettingsToggleRow
          title={text.appleMusicEnable}
          description={text.appleMusicHint}
          checked={settings.lyricsAppleMusic}
          onChange={(lyricsAppleMusic) => onSettingsChange({ ...settings, lyricsAppleMusic })}
        />
        <SettingsSecretRow
          title={text.appleMusicToken}
          description={text.appleMusicTokenHint}
          saveLabel={text.appleMusicSave}
          placeholder={text.appleMusicTokenPlaceholder}
          onSave={(token) => {
            setAppleMusicToken(token)
              .then(() => setTokenSaved(true))
              .catch((error: unknown) => {
                console.error("Failed to save the Apple Music token", error);
              });
          }}
        />
      </SettingsGroup>
    </>
  );
}
