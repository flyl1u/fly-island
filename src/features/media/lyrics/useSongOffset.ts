import { useCallback, useEffect, useState } from "react";
import { loadSongOffsets, saveSongOffsets, setSongOffset, subscribeSongOffsets } from "./songOffsets";

/** This song's own lyrics offset (ms, positive = later) and changing it; kept per song. */
export function useSongOffset(key: string | null): [number, (ms: number) => void] {
  const [, refresh] = useState(0);
  // The offset is read from the storage every time, so the collapsed lyric and the music page
  // never drift apart; saving tells the other one to look again.
  useEffect(() => subscribeSongOffsets(() => refresh((count) => count + 1)), []);
  const change = useCallback(
    (ms: number) => {
      if (!key) return;
      saveSongOffsets(setSongOffset(loadSongOffsets(), key, ms));
    },
    [key],
  );
  return [key ? loadSongOffsets()[key] ?? 0 : 0, change];
}
