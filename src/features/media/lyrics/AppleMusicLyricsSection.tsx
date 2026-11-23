import { useEffect, useState } from "react";
import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import { SettingsSecretRow } from "../../../components/settings/SettingsSecretRow";
import { SettingsLinkButton } from "../../../components/settings/SettingsLinkButton";
import type { IslandSettings } from "../../appearance/types";
import { useTranslation } from "../../../i18n";
import { clearAppleMusicToken, hasAppleMusicToken, setAppleMusicToken } from "./api";

/**
 * Settings → Music → Apple Music: the switch for Apple's own lyrics and the token they need.
 * Kept in a file of its own (with the lyrics source in src-tauri/src/lyrics/applemusic.rs) so the
 * whole feature can be hidden or dropped as one block when it ships as an optional install.
 */
export function AppleMusicLyricsSection({
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
          // An empty field means "forget the token", the same way the plugin settings do.
          const saving = token.trim() === "" ? clearAppleMusicToken() : setAppleMusicToken(token);
          saving
            .then(() => setTokenSaved(token.trim() !== ""))
            .catch((error: unknown) => {
              console.error("Failed to save the Apple Music token", error);
            });
        }}
      />
      <SettingsRow
        title={text.appleMusicClearTitle}
        control={
          <SettingsLinkButton
            disabled={!tokenSaved}
            onClick={() => {
              clearAppleMusicToken()
                .then(() => setTokenSaved(false))
                .catch((error: unknown) => {
                  console.error("Failed to clear the Apple Music token", error);
                });
            }}
          >
            {text.appleMusicClear}
          </SettingsLinkButton>
        }
      />
    </SettingsGroup>
  );
}
