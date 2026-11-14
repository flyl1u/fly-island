import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { ReorderList } from "../../components/reorder/ReorderList";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
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
  const { musicSourcePriority, archivedMusicSources, setMusicSourceOrder, archiveMusicSource, restoreMusicSource } = useMusicSourcePriority(live);

  return (
    <>
    <SettingsGroup
      title={text.title}
      footer={(
        <>
          {musicSourcePriority.length > 1 && <p>{text.footer}</p>}
          <p className="music-sources__cover-hint">
            <Info size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>{text.coverHint}</span>
          </p>
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
          rowAction={(row) => (
            <SettingsLinkButton onClick={() => archiveMusicSource(row.id)}>{text.archive}</SettingsLinkButton>
          )}
        />
      )}
    </SettingsGroup>
    {archivedMusicSources.length > 0 && (
      <SettingsGroup title={text.archivedTitle} footer={<p>{text.archivedHint}</p>}>
        {archivedMusicSources.map((source) => (
          <SettingsRow
            key={source.id}
            title={source.label}
            control={<SettingsLinkButton onClick={() => restoreMusicSource(source.id)}>{text.restore}</SettingsLinkButton>}
          />
        ))}
      </SettingsGroup>
    )}
    </>
  );
}
