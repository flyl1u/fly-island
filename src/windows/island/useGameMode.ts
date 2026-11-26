import { useEffect, useRef, useState } from "react";
import { getForegroundFullscreen, listenForegroundFullscreen, setIslandGameQuiet } from "./api";
import { gameModeEffects, type FullscreenState, type GameModeEffects, type GameModeSettings } from "./gameMode";
import type { IslandMode } from "./types";
import type { IslandModeReason } from "./diagnosticMode";
import type { TuckSource } from "./browserTuck";

const NOT_FULLSCREEN: FullscreenState = { active: false, onIslandMonitor: false, browserOnIslandMonitor: false };

function logError(error: unknown) {
  console.error("Failed to watch for full-screen apps", error);
}

type GameModeActions = {
  mode: IslandMode;
  isTucked: boolean;
  tuckSource: TuckSource | null;
  collapseIsland: (reason: IslandModeReason) => void;
  tuckForGame: () => void;
  revealIsland: (reason: IslandModeReason) => void;
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
  { mode, isTucked, tuckSource, collapseIsland, tuckForGame, revealIsland }: GameModeActions,
): GameModeEffects {
  const watching = settings.gameDoNotDisturb || settings.gameAutoTuck || (settings.browserAutoTuck && !settings.neverAutoTuck);
  const [fullscreen, setFullscreen] = useState<FullscreenState>(NOT_FULLSCREEN);
  const effects = gameModeEffects(watching ? fullscreen : NOT_FULLSCREEN, settings);
  const stateRef = useRef({ mode, isTucked, tuckSource });
  useEffect(() => {
    stateRef.current = { mode, isTucked, tuckSource };
  }, [isTucked, mode, tuckSource]);

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
    if (effects.quiet && stateRef.current.mode === "expanded") collapseIsland("game_mode");
  }, [collapseIsland, effects.quiet]);

  // The native cursor loop reads this: a tucked island over a game is not hit at all.
  useEffect(() => {
    void setIslandGameQuiet(effects.quiet).catch(logError);
  }, [effects.quiet]);

  useEffect(() => {
    if (effects.tuck) {
      if (!stateRef.current.isTucked) tuckForGame();
    } else if (stateRef.current.isTucked && stateRef.current.tuckSource === "game") {
      revealIsland("game_mode");
    }
  }, [effects.tuck, revealIsland, tuckForGame]);

  return effects;
}
