import { useEffect, useRef, useState } from "react";
import { getForegroundFullscreen, listenForegroundFullscreen } from "./api";
import { gameModeEffects, type GameModeEffects, type GameModeSettings } from "./gameMode";

function logError(error: unknown) {
  console.error("Failed to watch for full-screen apps", error);
}

/**
 * Game mode: watches for a full-screen app in the foreground while either game
 * setting is on. Returns what to hold back, and tucks the island when the app takes
 * the screen (bringing it back afterwards if it is still tucked). Revealing it by
 * hand during the game keeps it out until the next full-screen app.
 */
export function useGameMode(
  settings: GameModeSettings,
  isTucked: boolean,
  tuckIsland: () => void,
  revealIsland: () => void,
): GameModeEffects {
  const watching = settings.gameDoNotDisturb || settings.gameAutoTuck;
  const [fullscreen, setFullscreen] = useState(false);
  const effects = gameModeEffects(watching && fullscreen, settings);
  const tuckedByGameRef = useRef(false);
  const isTuckedRef = useRef(isTucked);
  useEffect(() => {
    isTuckedRef.current = isTucked;
    if (!isTucked) tuckedByGameRef.current = false;
  }, [isTucked]);

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
    if (effects.tuck) {
      if (!isTuckedRef.current) {
        tuckIsland();
        tuckedByGameRef.current = true;
      }
    } else if (tuckedByGameRef.current) {
      tuckedByGameRef.current = false;
      if (isTuckedRef.current) revealIsland();
    }
  }, [effects.tuck, revealIsland, tuckIsland]);

  return effects;
}
