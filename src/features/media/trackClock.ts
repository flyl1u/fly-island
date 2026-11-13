/**
 * A stand-in for the playback position when the player reports none. NetEase Cloud Music, for
 * one, gives Windows' media session a title and artist but leaves the position and length at 0,
 * so the island times the track itself: from when it first saw the track, counting only while it
 * plays. It cannot know about seeking in the player, or how far a track had played before the
 * island first saw it.
 */
export type TrackClock = {
  /** The track being timed, or null when nothing is. */
  key: string | null;
  /** Playing time counted up to `runningSince` (or up to the last pause). */
  elapsedMs: number;
  /** When the current stretch of playing began; null while paused. */
  runningSince: number | null;
};

export const NO_CLOCK: TrackClock = { key: null, elapsedMs: 0, runningSince: null };

/** Whether the player reports a position at all. */
export function hasTimeline(state: { positionMs: number; durationMs: number; hasTimeline?: boolean }) {
  return state.hasTimeline ?? (state.durationMs > 0 || state.positionMs > 0);
}

/** 校准只改变本地位置，保留当前播放或暂停状态。 */
export function setClockPosition(clock: TrackClock, positionMs: number, now: number): TrackClock {
  if (clock.key === null || !Number.isFinite(positionMs)) return clock;
  return { ...clock, elapsedMs: Math.max(0, positionMs), runningSince: clock.runningSince === null ? null : now };
}

/** The clock after a reading at `now`: restarted for another track, running or stopped with playback. */
export function advanceClock(clock: TrackClock, key: string, playing: boolean, now: number): TrackClock {
  if (clock.key !== key) return { key, elapsedMs: 0, runningSince: playing ? now : null };
  if (playing && clock.runningSince === null) return { ...clock, runningSince: now };
  if (!playing && clock.runningSince !== null) {
    return { ...clock, elapsedMs: clock.elapsedMs + Math.max(0, now - clock.runningSince), runningSince: null };
  }
  return clock;
}

/** The estimated position at `now`. */
export function clockPosition(clock: TrackClock, now: number) {
  return clock.elapsedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince));
}
