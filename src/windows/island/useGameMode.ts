import { useEffect, useRef, useState } from "react";
import { getForegroundFullscreen, listenForegroundFullscreen } from "./api";
import { gameModeEffects, type FullscreenState, type GameModeEffects, type GameModeSettings } from "./gameMode";
import type { IslandMode } from "./types";

const NOT_FULLSCREEN: FullscreenState = { active: false, onIslandMonitor: false };

function logError(error: unknown) {
  console.error("Failed to watch for full-screen apps", error);
}

type GameModeActions = {
  mode: IslandMode;
  isTucked: boolean;
  collapseIsland: () => void;
  tuckIsland: () => void;
  revealIsland: () => void;
};

/**
 * Game mode: watches for a full-screen app in the foreground while either game
 * setting is on, and returns what to hold back. When quiet starts, an open panel
 * closes (hover closing is held back too, so it would stay over the game). When the
 * app takes the island's screen, the island tucks, and comes back afterwards if it is
 * still tucked; revealing it by hand during the game keeps it out.
 */
export function useGameMode(
  settings: GameModeSettings,
  { mode, isTucked, collapseIsland, tuckIsland, revealIsland }: GameModeActions,
): GameModeEffects {
  const watching = settings.gameDoNotDisturb || settings.gameAutoTuck;
  const [fullscreen, setFullscreen] = useState<FullscreenState>(NOT_FULLSCREEN);
  const effects = gameModeEffects(watching ? fullscreen : NOT_FULLSCREEN, settings);
  const tuckedByGameRef = useRef(false);
  const stateRef = useRef({ mode, isTucked });
  useEffect(() => {
    stateRef.current = { mode, isTucked };
    if (!isTucked) tuckedByGameRef.current = false;
  }, [isTucked, mode]);

  useEffect(() => {
    if (!watching) return;
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenForegroundFullscreen(setFullscreen)
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch(logError);
    void getForegroundFullscreen()
      .then((value) => { if (!didCancel) setFullscreen(value); })
      .catch(logError);
    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [watching]);

  useEffect(() => {
    if (effects.quiet && stateRef.current.mode === "expanded") collapseIsland();
  }, [collapseIsland, effects.quiet]);

  useEffect(() => {
    if (effects.tuck) {
      if (!stateRef.current.isTucked) {
        tuckIsland();
        tuckedByGameRef.current = true;
      }
    } else if (tuckedByGameRef.current) {
      tuckedByGameRef.current = false;
      if (stateRef.current.isTucked) revealIsland();
    }
  }, [effects.tuck, revealIsland, tuckIsland]);

  return effects;
}
