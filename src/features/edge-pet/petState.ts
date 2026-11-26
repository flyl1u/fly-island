export type EdgePetMood = "hidden" | "patrol" | "working" | "alert" | "music";

export type EdgePetStateInput = {
  activeAgentCount: number;
  hasMessagePreview: boolean;
  songPlaying: boolean;
  quiet: boolean;
};

/**
 * Picks the pet's current behavior from existing island state without extra polling.
 */
export function resolveEdgePetMood(input: EdgePetStateInput): EdgePetMood {
  if (input.quiet) return "hidden";
  if (input.hasMessagePreview) return "alert";
  if (input.activeAgentCount > 0) return "working";
  if (input.songPlaying) return "music";
  return "patrol";
}
