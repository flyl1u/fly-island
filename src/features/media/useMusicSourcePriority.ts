import { useCallback, useEffect, useState } from "react";
import type { MediaState } from "./api";
import { loadMusicSourcePriority, saveMusicSourcePriority, type KnownMediaSource } from "./storage";

/** The user's preferred media source order; newly seen sessions are appended and the order is persisted. */
export function useMusicSourcePriority(sessions: MediaState["sessions"]) {
  const [musicSourcePriority, setMusicSourcePriority] = useState<
    KnownMediaSource[]
  >(loadMusicSourcePriority);

  const reorderMusicSource = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) {
        return;
      }

      setMusicSourcePriority((current) => {
        const sourceIndex = current.findIndex(
          (source) => source.id === sourceId,
        );
        const targetIndex = current.findIndex(
          (source) => source.id === targetId,
        );

        if (
          sourceIndex < 0 ||
          targetIndex < 0 ||
          sourceIndex === targetIndex
        ) {
          return current;
        }

        const next = [...current];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    },
    [],
  );

  const removeMusicSource = useCallback((sourceId: string) => {
    setMusicSourcePriority((current) =>
      current.filter((source) => source.id !== sourceId),
    );
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      return;
    }

    setMusicSourcePriority((current) => {
      const known = new Set(current.map((source) => source.id));
      const additions = sessions
        .filter((session) => !known.has(session.id))
        .map((session) => ({ id: session.id, label: session.label }));

      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [sessions]);

  useEffect(() => {
    saveMusicSourcePriority(musicSourcePriority);
  }, [musicSourcePriority]);

  return { musicSourcePriority, reorderMusicSource, removeMusicSource };
}
