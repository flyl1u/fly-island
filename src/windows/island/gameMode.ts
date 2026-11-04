export type GameModeSettings = {
  /** While a full-screen app is in front: no hover opening, no taking the focus, no message pop-ups. */
  gameDoNotDisturb: boolean;
  /** While a full-screen app is in front: the island tucks to the top edge, and comes back after. */
  gameAutoTuck: boolean;
};

export type GameModeEffects = {
  /** Hold back hover opening, hover focus and message previews. */
  quiet: boolean;
  /** Keep the island tucked to the top edge. */
  tuck: boolean;
};

/** What game mode does now, given whether a full-screen app (game, video, slides) is in front. */
export function gameModeEffects(fullscreen: boolean, settings: GameModeSettings): GameModeEffects {
  return {
    quiet: fullscreen && settings.gameDoNotDisturb,
    tuck: fullscreen && settings.gameAutoTuck,
  };
}
