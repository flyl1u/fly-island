import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMediaState, listenMediaSessionChanged, seekMedia, sendMediaCommand, type MediaCommand, type MediaPlaybackStatus, type MediaState } from "./api";
import { isIslandMoving } from "../../lib/islandMotion";
import { AUDIO_ACTIVE_THRESHOLD, DEFAULT_MEDIA_STATE, isSameMediaState } from "./mediaState";
import { isSameTrack, keptAnchor, steadyAnchor } from "./positionAnchor";
import { playbackPosition } from "./lyrics/lrc";
import { advanceClock, clockPosition, hasTimeline, setClockPosition, NO_CLOCK, type TrackClock } from "./trackClock";
import { useAudioLevel } from "./useAudioLevel";
import { pickMediaSource } from "./pickMediaSource";
import { useMusicSourcePriority } from "./useMusicSourcePriority";

/**
 * Media session state, playback commands and the source the island currently controls.
 * With `enabled` false (music switched off) nothing is polled and the state stays empty.
 * `showsLevel` says whether the output level is on screen (the collapsed island's waveform);
 * while it is not, the level is neither polled nor folded in, so it re-renders nothing.
 */
export function useMediaState(enabled = true, showsLevel = true) {
  const [mediaState, setMediaState] =
    useState<MediaState>(DEFAULT_MEDIA_STATE);
  const [isMediaTrackChanging, setIsMediaTrackChanging] = useState(false);
  const [mediaCommandError, setMediaCommandError] = useState<string | null>(
    null,
  );
  const mediaTargetRef = useRef<string | null>(null);
  const showsLevelRef = useRef(showsLevel);
  useEffect(() => {
    showsLevelRef.current = showsLevel;
  }, [showsLevel]);
  const isRefreshingMediaState = useRef(false);
  // A change event that came while a read was under way: read again once it is done.
  const refreshAgain = useRef(false);
  // Bumped when a seek starts and ends: a reading begun before then has the old position.
  const seekGeneration = useRef(0);
  const isSeeking = useRef(false);
  const isRunningMediaCommand = useRef(false);
  const trackClock = useRef<TrackClock>(NO_CLOCK);
  const mediaPlaybackIntent = useRef<{
    status: MediaPlaybackStatus;
    expiresAt: number;
  } | null>(null);
  const { musicSourcePriority, reorderMusicSource, removeMusicSource } =
    useMusicSourcePriority(mediaState.sessions);

  const refreshMediaState = useCallback(async () => {
    if (isRefreshingMediaState.current) {
      refreshAgain.current = true;
      return;
    }

    isRefreshingMediaState.current = true;
    const generation = seekGeneration.current;

    try {
      const nextMediaState = await getMediaState(
        mediaTargetRef.current ?? undefined,
      );

      const now = Date.now();
      const intent = mediaPlaybackIntent.current;
      const intentActive = Boolean(intent && now < intent.expiresAt);
      const playbackStatus =
        intent && intentActive
          ? intent.status
          : nextMediaState.playbackStatus;

      if (intent && now >= intent.expiresAt) {
        mediaPlaybackIntent.current = null;
      }

      // A player that reports no position (NetEase Cloud Music) is timed by the island.
      const untimed = nextMediaState.title && !hasTimeline(nextMediaState)
        ? `${nextMediaState.sourceApp ?? ""}\u001f${nextMediaState.title}\u001f${nextMediaState.artist ?? ""}`
        : null;
      trackClock.current = untimed ? advanceClock(trackClock.current, untimed, playbackStatus === "playing", now) : NO_CLOCK;
      const timeline = untimed ? { positionMs: clockPosition(trackClock.current, now), updatedAt: now } : {};

      setMediaState((currentState) => {
        const nextPeak = Math.max(
          currentState.audioPeak * 0.82,
          nextMediaState.audioPeak,
        );
        const audioActive = playbackStatus !== "paused" &&
          (nextMediaState.audioActive || nextPeak > AUDIO_ACTIVE_THRESHOLD);
        // Off screen, the peak stays as it was: a new one each poll re-rendered the open island.
        const audioPeak = !audioActive ? 0 : showsLevelRef.current ? nextPeak : currentState.audioPeak;

        const reading: MediaState = {
          ...nextMediaState,
          ...timeline,
          hasTimeline: hasTimeline(nextMediaState),
          audioActive,
          audioPeak,
          playbackStatus,
        };
        // Until the player catches up with a seek or a play / pause from here, its readings are behind.
        const behind = intentActive || isSeeking.current || generation !== seekGeneration.current;
        const anchor = behind && isSameTrack(currentState, reading)
          ? keptAnchor(currentState)
          : steadyAnchor(currentState, reading);
        const merged: MediaState = { ...reading, ...anchor };

        if (isSameMediaState(currentState, merged)) {
          return currentState;
        }

        return merged;
      });
    } catch (error) {
      console.error("Failed to read media state", error);
      setMediaState(DEFAULT_MEDIA_STATE);
    } finally {
      isRefreshingMediaState.current = false;
      if (refreshAgain.current) {
        refreshAgain.current = false;
        void refreshMediaState();
      }
    }
  }, []);

  /** Moves playback to `positionMs`, shown at once; the player's reading follows. */
  const seekTo = useCallback(async (positionMs: number) => {
    isSeeking.current = true;
    seekGeneration.current += 1;
    setMediaState((currentState) => ({ ...currentState, positionMs, updatedAt: Date.now() }));
    setMediaCommandError(null);
    try {
      const nextMediaState = await seekMedia(positionMs, mediaTargetRef.current ?? undefined);
      setMediaState((currentState) => ({
        ...nextMediaState,
        audioActive: currentState.audioActive,
        audioPeak: currentState.audioPeak,
        playbackStatus: currentState.playbackStatus,
      }));
    } catch (error) {
      console.error("Failed to seek", error);
      setMediaCommandError(String(error));
    } finally {
      isSeeking.current = false;
      seekGeneration.current += 1;
    }
  }, []);

  const calibrate = useCallback((positionMs: number) => {
    const now = Date.now();
    const clock = setClockPosition(trackClock.current, positionMs, now);
    trackClock.current = clock;
    if (clock.key !== null) setMediaState((current) => hasTimeline(current) ? current : {
      ...current, positionMs: clockPosition(clock, now), updatedAt: now,
    });
  }, []);

  const runMediaCommand = useCallback(
    async (command: MediaCommand) => {
      if (isRunningMediaCommand.current) {
        return;
      }

      const target = mediaTargetRef.current ?? undefined;
      const isPlayPause = command === "media_play_pause";
      const isTrackChange =
        command === "media_next" || command === "media_previous";
      const isTransport = isPlayPause || isTrackChange;

      const intendedStatus: MediaPlaybackStatus = isPlayPause
        ? mediaState.playbackStatus === "playing"
          ? "paused"
          : "playing"
        : mediaState.playbackStatus;

      if (isTransport) {
        mediaPlaybackIntent.current = {
          status: intendedStatus,
          expiresAt: Date.now() + (isPlayPause ? 1200 : 1800),
        };

        if (isPlayPause) {
          setMediaState((currentState) => ({
            ...currentState,
            available: intendedStatus === "playing" || currentState.available,
            audioActive:
              intendedStatus === "playing" && currentState.audioActive,
            audioPeak:
              intendedStatus === "paused" ? 0 : currentState.audioPeak,
            playbackStatus: intendedStatus,
            // Paused where playback is now, not where the last reading had it.
            positionMs: playbackPosition(currentState, Date.now()),
            updatedAt: Date.now(),
          }));
        }
      }

      isRunningMediaCommand.current = true;
      setIsMediaTrackChanging(isTrackChange);
      setMediaCommandError(null);
      try {
        const nextMediaState = await sendMediaCommand(command, target);

        if (!isTransport) {
          setMediaState((currentState) =>
            isSameMediaState(currentState, nextMediaState)
              ? currentState
              : nextMediaState,
          );
          return;
        }

        setMediaState((currentState) => {
          // A play / pause keeps the position it was shown at until the player's readings catch up.
          const anchor = isPlayPause && isSameTrack(currentState, nextMediaState) ? keptAnchor(currentState) : {};
          if (intendedStatus === "paused") {
            return {
              ...nextMediaState,
              ...anchor,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: intendedStatus,
            };
          }

          return {
            ...nextMediaState,
            ...anchor,
            audioActive:
              nextMediaState.audioActive || currentState.audioActive,
            audioPeak: Math.max(
              nextMediaState.audioPeak,
              currentState.audioPeak * 0.82,
            ),
            playbackStatus: intendedStatus,
          };
        });
      } catch (error) {
        console.error(`Failed to run media command: ${command}`, error);
        setMediaCommandError(String(error));
        mediaPlaybackIntent.current = null;
        await refreshMediaState();
      } finally {
        isRunningMediaCommand.current = false;
        setIsMediaTrackChanging(false);
      }
    },
    [mediaState.playbackStatus, refreshMediaState],
  );

  // The fast meter only runs while something plays: each read starts a COM thread natively. The
  // 1.5s state poll below also reads the peak, so sound from a player without a media session
  // still switches it on.
  useAudioLevel(
    setMediaState,
    mediaPlaybackIntent,
    enabled && showsLevel && (mediaState.playbackStatus === "playing" || mediaState.audioActive),
  );

  useEffect(() => {
    if (!enabled) {
      setMediaState(DEFAULT_MEDIA_STATE);
      return;
    }

    void refreshMediaState();

    const interval = window.setInterval(() => {
      if (!isIslandMoving()) void refreshMediaState();
    }, 1500);

    // A seek, pause or new track in the player is read at once rather than at the next poll.
    let stopListening: (() => void) | null = null;
    let disposed = false;
    listenMediaSessionChanged(() => void refreshMediaState())
      .then((unlisten) => (disposed ? unlisten() : (stopListening = unlisten)))
      .catch((error) => console.error("Cannot listen for media session changes", error));

    return () => {
      disposed = true;
      stopListening?.();
      window.clearInterval(interval);
    };
  }, [enabled, refreshMediaState]);

  const effectiveMediaTarget = useMemo(
    () => pickMediaSource(mediaState.sessions, musicSourcePriority),
    [musicSourcePriority, mediaState.sessions],
  );

  useEffect(() => {
    if (!enabled || mediaTargetRef.current === effectiveMediaTarget) {
      return;
    }
    mediaTargetRef.current = effectiveMediaTarget;
    mediaPlaybackIntent.current = null;
    void refreshMediaState();
  }, [effectiveMediaTarget, enabled, refreshMediaState]);

  return {
    mediaState,
    isMediaTrackChanging,
    mediaCommandError,
    musicSourcePriority,
    runMediaCommand,
    seekTo,
    calibrate,
    reorderMusicSource,
    removeMusicSource,
  };
}
