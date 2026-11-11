import type { MediaState } from "./api";
import { playbackPosition } from "./lyrics/lrc.ts";

/**
 * Readings this close to where the island already reckons playback is keep the island's anchor:
 * a new one each poll re-rendered the page and restarted the sung line's word fill for a few ms
 * of difference. Anything further is the player's word (a seek, a pause, a correction) and snaps.
 */
export const POSITION_JITTER_MS = 300;

/** A change of position beyond what the time passed explains, past this, is a jump (a seek). */
export const POSITION_JUMP_MS = 1500;

type Timed = Pick<MediaState, "positionMs" | "durationMs" | "updatedAt" | "playbackStatus">;
type Reading = Timed & Pick<MediaState, "title" | "artist" | "sourceApp" | "activeSessionId">;

/**
 * The position and its time to keep after `next` is read: `current`'s when `next` agrees with it
 * (same track, same play state, within `POSITION_JITTER_MS`), else `next`'s.
 */
export function steadyAnchor(current: Reading, next: Reading): Pick<MediaState, "positionMs" | "updatedAt"> {
  const agrees = isSameTrack(current, next) && current.updatedAt > 0 && current.playbackStatus === next.playbackStatus &&
    Math.abs(next.positionMs - playbackPosition(current, next.updatedAt)) <= POSITION_JITTER_MS;
  return agrees ? keptAnchor(current) : keptAnchor(next);
}

/** Whether two readings are of the same track from the same player. */
export function isSameTrack(a: Reading, b: Reading) {
  return a.title === b.title && a.artist === b.artist && a.sourceApp === b.sourceApp &&
    a.activeSessionId === b.activeSessionId && a.durationMs === b.durationMs;
}

/** Just the anchor of a reading. */
export function keptAnchor(state: Pick<MediaState, "positionMs" | "updatedAt">) {
  return { positionMs: state.positionMs, updatedAt: state.updatedAt };
}

/** Whether going from `before` to `after` moved the position further than the time between them explains. */
export function isPositionJump(before: Timed, after: Timed) {
  return Math.abs(after.positionMs - playbackPosition(before, after.updatedAt)) > POSITION_JUMP_MS;
}

/** The position under a pointer at `clientX` on a bar spanning `left`..`left + width`, whole seconds apart. */
export function positionAtPointer(clientX: number, left: number, width: number, durationMs: number) {
  if (width <= 0 || durationMs <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
  return Math.round(ratio * durationMs);
}
