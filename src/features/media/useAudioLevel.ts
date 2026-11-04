import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { getAudioLevel, type MediaPlaybackStatus, type MediaState } from "./api";
import { AUDIO_ACTIVE_THRESHOLD } from "./mediaState";

export type MediaPlaybackIntent = { status: MediaPlaybackStatus; expiresAt: number };

/** Polls the output audio level every 500ms and folds it into the media state for the waveform. */
export function useAudioLevel(
  setMediaState: Dispatch<SetStateAction<MediaState>>,
  mediaPlaybackIntent: RefObject<MediaPlaybackIntent | null>,
  enabled = true,
) {
  const isRefreshingAudioLevel = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let didCancel = false;

    const refreshAudioLevel = async () => {
      if (didCancel || isRefreshingAudioLevel.current) {
        return;
      }

      isRefreshingAudioLevel.current = true;

      try {
        const audioLevel = await getAudioLevel();

        if (didCancel) {
          return;
        }

        setMediaState((currentState) => {
          const intent = mediaPlaybackIntent.current;
          const isPauseIntent =
            intent &&
            Date.now() < intent.expiresAt &&
            intent.status === "paused";

          if (currentState.playbackStatus === "paused" || isPauseIntent) {
            if (
              currentState.playbackStatus === "paused" &&
              !currentState.audioActive &&
              currentState.audioPeak === 0
            ) {
              return currentState;
            }
            return {
              ...currentState,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: "paused",
            };
          }

          const decayedPeak = currentState.audioPeak * 0.82;
          const nextPeak = audioLevel.active
            ? Math.max(decayedPeak, audioLevel.peak)
            : decayedPeak;
          const audioActive =
            (audioLevel.active || nextPeak > AUDIO_ACTIVE_THRESHOLD * 1.5);
          const audioPeak = audioActive ? nextPeak : 0;

          if (
            currentState.audioActive === audioActive &&
            currentState.audioPeak === audioPeak
          ) {
            return currentState;
          }

          return {
            ...currentState,
            audioActive,
            audioPeak,
          };
        });
      } catch (error) {
        console.error("Failed to read audio level", error);
      } finally {
        isRefreshingAudioLevel.current = false;
      }
    };

    void refreshAudioLevel();

    const interval = window.setInterval(() => {
      void refreshAudioLevel();
    }, 500);

    return () => {
      didCancel = true;
      window.clearInterval(interval);
    };
  }, [enabled, mediaPlaybackIntent, setMediaState]);
}
