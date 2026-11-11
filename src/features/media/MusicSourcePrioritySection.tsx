import { useEffect, useState } from "react";
import { ReorderList } from "../../components/reorder/ReorderList";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import { getMediaState, type MediaState } from "./api";
import { useMusicSourcePriority } from "./useMusicSourcePriority";
import "./MusicSourcePrioritySection.css";

// Often enough for "playing" to follow a player that starts or stops.
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
        .catch((error) => console.error("Failed to read media sessions", error));
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

/**
 * Settings → Music → Player order: which player the island follows when several have a media
 * session. A playing one comes before a paused one, and among each the list's order decides
 * (useMediaState). Players join the list the first time they are seen; the order is kept in
 * `focusd-island-music-sources`, as before Settings were slimmed down.
 */
export function MusicSourcePrioritySection() {
  const text = useTranslation().settings.musicSources;
  const live = useLiveMediaSessions();
  const { musicSourcePriority, setMusicSourceOrder } = useMusicSourcePriority(live);

  return (
    <SettingsGroup
      title={text.title}
      footer={(
        <>
          {musicSourcePriority.length > 1 && <p>{text.footer}</p>}
          <p>{text.coverHint}</p>
        </>
      )}
    >
      {musicSourcePriority.length === 0 ? (
        <p className="music-sources__empty">{text.empty}</p>
      ) : (
        <ReorderList
          rows={musicSourcePriority.map((source) => {
            const session = live.find((candidate) => candidate.id === source.id);
            const state = session?.playing ? "playing" : session ? "open" : "notOpen";
            return {
              id: source.id,
              name: source.label,
              hint: text[state],
              icon: <span className={`music-sources__dot music-sources__dot--${state}`} aria-hidden="true" />,
            };
          })}
          onReorder={setMusicSourceOrder}
          moveLabel={text.moveLabel}
        />
      )}
    </SettingsGroup>
  );
}
