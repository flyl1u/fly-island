import { useEffect, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import { getMediaState, type MediaState } from "./api";
import { MusicSourceList } from "./MusicSourceList";
import "./MusicSourceSettingsSection.css";
import { useMusicSourcePriority } from "./useMusicSourcePriority";

// Often enough for the playing dots to follow a source that starts or stops.
const LIVE_SESSION_POLL_MS = 3_000;

/** Which media sessions exist now, read while the settings page is open. */
function useLiveMediaSessions() {
  const [sessions, setSessions] = useState<MediaState["sessions"]>([]);

  useEffect(() => {
    let didCancel = false;
    const read = () => {
      void getMediaState(undefined)
        .then((state) => {
          if (!didCancel) setSessions(state.sessions);
        })
        .catch((error) => {
          console.error("Failed to read media sessions", error);
        });
    };
    read();
    const timer = window.setInterval(read, LIVE_SESSION_POLL_MS);
    return () => {
      didCancel = true;
      window.clearInterval(timer);
    };
  }, []);

  return sessions;
}

/** Settings > Music: the order in which the island prefers media sources. */
export function MusicSourceSettingsSection() {
  const t = useTranslation();
  const liveSessions = useLiveMediaSessions();
  const { musicSourcePriority, reorderMusicSource, removeMusicSource } = useMusicSourcePriority(liveSessions);

  return (
    <SettingsGroup title={t.music.settingsTitle} footer={t.music.settingsHint}>
      <div className="music-source-settings">
        <MusicSourceList
          sourcePriority={musicSourcePriority}
          liveSessions={liveSessions}
          onReorderSource={reorderMusicSource}
          onRemoveSource={removeMusicSource}
        />
      </div>
    </SettingsGroup>
  );
}
