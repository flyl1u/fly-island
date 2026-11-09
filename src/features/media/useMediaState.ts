import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMediaState, sendMediaCommand, type MediaCommand, type MediaPlaybackStatus, type MediaState } from "./api";
import { AUDIO_ACTIVE_THRESHOLD, DEFAULT_MEDIA_STATE, isSameMediaState } from "./mediaState";
import { advanceClock, clockPosition, hasTimeline, NO_CLOCK, type TrackClock } from "./trackClock";
import { useAudioLevel } from "./useAudioLevel";
import { useMusicSourcePriority } from "./useMusicSourcePriority";

/**
 * Media session state, playback commands and the source the island currently controls.
 * With `enabled` false (music switched off) nothing is polled and the state stays empty.
 */
export function useMediaState(enabled = true) {
  const [mediaState, setMediaState] =
    useState<MediaState>(DEFAULT_MEDIA_STATE);
  const [isMediaTrackChanging, setIsMediaTrackChanging] = useState(false);
  const [mediaCommandError, setMediaCommandError] = useState<string | null>(
    null,
  );
  const mediaTargetRef = useRef<string | null>(null);
  const isRefreshingMediaState = useRef(false);
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
      return;
    }

    isRefreshingMediaState.current = true;

    try {
      const nextMediaState = await getMediaState(
        mediaTargetRef.current ?? undefined,
      );

      const now = Date.now();
      const intent = mediaPlaybackIntent.current;
      const playbackStatus =
        intent && now < intent.expiresAt
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
        const audioPeak = audioActive ? nextPeak : 0;

        const merged: MediaState = {
          ...nextMediaState,
          ...timeline,
          audioActive,
          audioPeak,
          playbackStatus,
        };

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
    }
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
          if (intendedStatus === "paused") {
            return {
              ...nextMediaState,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: intendedStatus,
            };
          }

          return {
            ...nextMediaState,
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
    enabled && (mediaState.playbackStatus === "playing" || mediaState.audioActive),
  );

  useEffect(() => {
    if (!enabled) {
      setMediaState(DEFAULT_MEDIA_STATE);
      return;
    }

    void refreshMediaState();

    const interval = window.setInterval(() => {
      void refreshMediaState();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [enabled, refreshMediaState]);

  const effectiveMediaTarget = useMemo(() => {
    if (mediaState.sessions.length === 0) {
      return null;
    }

    const present = new Map(
      mediaState.sessions.map((session) => [session.id, session]),
    );

    for (const source of musicSourcePriority) {
      if (present.get(source.id)?.playing) {
        return source.id;
      }
    }
    for (const source of musicSourcePriority) {
      if (present.has(source.id)) {
        return source.id;
      }
    }
    return null;
  }, [musicSourcePriority, mediaState.sessions]);

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
    reorderMusicSource,
    removeMusicSource,
  };
}
