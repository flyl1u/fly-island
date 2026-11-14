/**
 * When the island comes out of, or goes back to, the top edge by itself. Pure, so the
 * rules can be tested apart from the hooks that apply them (useIslandTucking).
 *
 * "Stay visible while…" (keepVisible) is about automatic tucking only: it never undoes a
 * tuck the user asked for (minimize, drag to the edge) or one game mode made.
 */
export type TuckState = {
  isTucked: boolean;
  /** Out on a peek (hover or a message) and due to slide back once it ends. */
  isPeeking: boolean;
  /** The current tuck came from the idle timer, not from the user or game mode. */
  tuckedAutomatically: boolean;
  keepVisible: boolean;
  hasMessagePreview: boolean;
  /** A settings preview drives the island; nothing else moves it meanwhile. */
  isPreviewing: boolean;
  /** Game mode is holding the island back (quiet) or tucked (tuck). */
  gameHolds: boolean;
};

/**
 * Brings an island that tucked itself back out once something it should stay visible for
 * starts (a song with lyrics, an agent, a todo timer). Without this a switch like "Lyrics are
 * showing" only stopped the next tuck, and an island that had already tucked while nothing
 * played stayed a line through the whole song.
 */
export function revealsForKeepVisible(state: TuckState): boolean {
  return state.isTucked && state.tuckedAutomatically && state.keepVisible && !state.isPreviewing && !state.gameHolds;
}

/**
 * Whether a peeking island slides back now that the peek is over. A message preview holds
 * it; and an island that tucked itself does not tuck again while it should stay visible.
 */
export function retractsPeek(state: TuckState): boolean {
  if (!state.isPeeking || state.hasMessagePreview || state.isPreviewing) return false;
  return !(state.keepVisible && state.tuckedAutomatically);
}
