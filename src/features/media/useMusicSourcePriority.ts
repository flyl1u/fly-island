import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaState } from "./api";
import { MUSIC_SOURCE_PRIORITY_SAVED_EVENT, MUSIC_SOURCE_PRIORITY_STORAGE_KEY, loadMusicSourcePriority, saveMusicSourcePriority, type KnownMediaSource } from "./storage";

/**
 * The user's preferred media source order, with archived players kept apart: they leave the order
 * and are not listed again when seen. Newly seen sessions
 * are appended and the whole list is persisted.
 */
export function useMusicSourcePriority(sessions: MediaState["sessions"]) {
  const [sources, setSources] = useState<KnownMediaSource[]>(loadMusicSourcePriority);
  const musicSourcePriority = useMemo(() => sources.filter((source) => !source.archived), [sources]);
  const archivedMusicSources = useMemo(() => sources.filter((source) => source.archived), [sources]);

  const reorderMusicSource = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) {
        return;
      }

      setSources((current) => {
        const active = current.filter((source) => !source.archived);
        const sourceIndex = active.findIndex((source) => source.id === sourceId);
        const targetIndex = active.findIndex((source) => source.id === targetId);

        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
          return current;
        }

        const next = [...active];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved);
        return [...next, ...current.filter((source) => source.archived)];
      });
    },
    [],
  );

  /** Puts the known sources in the order of `ids` (Settings → Music); ids it does not know are ignored. */
  const setMusicSourceOrder = useCallback((ids: string[]) => {
    setSources((current) => {
      const active = current.filter((source) => !source.archived);
      const byId = new Map(active.map((source) => [source.id, source]));
      const next = ids.flatMap((id) => byId.get(id) ?? []);
      if (next.length !== active.length) return current;
      return [...next, ...current.filter((source) => source.archived)];
    });
  }, []);

  const removeMusicSource = useCallback((sourceId: string) => {
    setSources((current) =>
      current.filter((source) => source.id !== sourceId),
    );
  }, []);

  /** Takes a player out of the order; it is not added back when seen. */
  const archiveMusicSource = useCallback((sourceId: string) => {
    setSources((current) =>
      current.map((source) => (source.id === sourceId && !source.archived ? { ...source, archived: true } : source)),
    );
  }, []);

  /** Puts an archived player back at the end of the order. */
  const restoreMusicSource = useCallback((sourceId: string) => {
    setSources((current) => {
      const target = current.find((source) => source.id === sourceId);
      if (!target?.archived) return current;
      const active = current.filter((source) => !source.archived);
      const archived = current.filter((source) => source.archived && source.id !== sourceId);
      return [...active, { id: target.id, label: target.label }, ...archived];
    });
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      return;
    }

    setSources((current) => {
      const known = new Set(current.map((source) => source.id));
      const additions = sessions
        .filter((session) => !known.has(session.id))
        .map((session) => ({ id: session.id, label: session.label }));

      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [sessions]);

  useEffect(() => {
    saveMusicSourcePriority(sources);
  }, [sources]);

  // The island and Settings > Music both edit the order, in two windows or (Settings inside the
  // island) in one. A saved order that matches this copy changes nothing, so the two copies do
  // not keep saving to each other.
  useEffect(() => {
    const sync = () => {
      const stored = loadMusicSourcePriority();
      setSources((current) => (JSON.stringify(current) === JSON.stringify(stored) ? current : stored));
    };
    const syncFromOtherWindow = (event: StorageEvent) => {
      if (event.key === MUSIC_SOURCE_PRIORITY_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", syncFromOtherWindow);
    window.addEventListener(MUSIC_SOURCE_PRIORITY_SAVED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", syncFromOtherWindow);
      window.removeEventListener(MUSIC_SOURCE_PRIORITY_SAVED_EVENT, sync);
    };
  }, []);

  return {
    musicSourcePriority,
    archivedMusicSources,
    reorderMusicSource,
    removeMusicSource,
    setMusicSourceOrder,
    archiveMusicSource,
    restoreMusicSource,
  };
}
