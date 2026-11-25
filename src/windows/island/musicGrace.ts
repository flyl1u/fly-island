/** How long a pause or a gap between tracks still counts as music playing for "stay out". */
export const MUSIC_GRACE_MS = 5000;

/**
 * Whether music still holds the island: playing now, or stopped less than `graceMs` ago
 * (a pause, a track change, a session switch). `lastPlayingAt` is null before any playback.
 */
export function musicHolds(playing: boolean, lastPlayingAt: number | null, now: number, graceMs = MUSIC_GRACE_MS): boolean {
  if (playing) return true;
  return lastPlayingAt !== null && now - lastPlayingAt < graceMs;
}
