import { useEffect, useState } from "react";
import { SettingsGroup } from "../../../components/settings/SettingsGroup";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import { SettingsSecretRow } from "../../../components/settings/SettingsSecretRow";
import { SettingsLinkButton } from "../../../components/settings/SettingsLinkButton";
import type { IslandSettings } from "../../appearance/types";
import { useTranslation } from "../../../i18n";
import { useNativePlugins } from "../../plugins";
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
  const installed = useNativePlugins().appleMusicLyrics;
  const text = useTranslation().settings.lyrics;
  const [tokenSaved, setTokenSaved] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (token: string): Promise<boolean> => {
    setBusy(true); setError(false);
    try {
      if (token.trim()) await setAppleMusicToken(token); else await clearAppleMusicToken();
      setTokenSaved(Boolean(token.trim()));
      return true;
    } catch { setError(true); return false; }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!installed) return;
    let cancelled = false;
    hasAppleMusicToken()
      .then((saved) => {
        if (!cancelled) setTokenSaved(saved);
      })
      .catch((error: unknown) => {
        console.error("Failed to read the Apple Music token state", error);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [installed]);

  if (!installed) return null;
  return (
    <SettingsGroup title={text.appleMusic} footer={error ? <span role="alert">{text.appleMusicTokenFailed}</span>
      : tokenSaved ? text.appleMusicTokenSaved : text.appleMusicTokenMissing}>
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
        disabled={busy}
        onSave={save}
      />
      <SettingsRow
        title={text.appleMusicClearTitle}
        control={
          <SettingsLinkButton
            disabled={busy || !tokenSaved}
            onClick={() => { void save(""); }}
          >
            {text.appleMusicClear}
          </SettingsLinkButton>
        }
      />
    </SettingsGroup>
  );
}
