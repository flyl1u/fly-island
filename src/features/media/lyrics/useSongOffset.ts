import { useCallback, useState } from "react";
import { loadSongOffsets, saveSongOffsets, setSongOffset } from "./songOffsets";

/** This song's own lyrics offset (ms, positive = later) and changing it; kept per song. */
export function useSongOffset(key: string | null): [number, (ms: number) => void] {
  const [offsets, setOffsets] = useState(loadSongOffsets);
  const change = useCallback(
    (ms: number) => {
      if (!key) return;
      setOffsets((current) => {
        const next = setSongOffset(current, key, ms);
        saveSongOffsets(next);
        return next;
      });
    },
    [key],
  );
  return [key ? offsets[key] ?? 0 : 0, change];
}
