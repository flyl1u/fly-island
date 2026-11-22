export type GameModeSettings = {
  /** While a full-screen app is in front: no hover opening, no taking the focus, no message pop-ups. */
  gameDoNotDisturb: boolean;
  /** While a full-screen app fills the island's monitor: the island tucks to the top edge, and comes back after. */
  gameAutoTuck: boolean;
  /** Tuck while a recognized browser is foregrounded on the island's monitor. */
  browserAutoTuck: boolean;
};

/** Same shape as ForegroundFullscreen in api.ts, kept here so tests can import this file alone. */
export type FullscreenState = { active: boolean; onIslandMonitor: boolean; browserOnIslandMonitor: boolean };

export type GameModeEffects = {
  /** Hold back hover opening, hover focus and message previews. */
  quiet: boolean;
  /** Keep the island tucked to the top edge. */
  tuck: boolean;
  /** Whether a recognized browser is foregrounded on the island's monitor. */
  browserOnIslandMonitor: boolean;
};

/**
 * What game mode does now. Quiet applies to a full-screen app on any monitor (taking
 * its focus would minimize a game wherever it is); tucking only when it shares the
 * island's monitor, since elsewhere the island is not in its way.
 */
export function gameModeEffects(fullscreen: FullscreenState, settings: GameModeSettings): GameModeEffects {
  return {
    quiet: fullscreen.active && settings.gameDoNotDisturb,
    tuck: fullscreen.active && fullscreen.onIslandMonitor && settings.gameAutoTuck,
    browserOnIslandMonitor: fullscreen.browserOnIslandMonitor && settings.browserAutoTuck,
  };
}
