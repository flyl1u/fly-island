import { CenterPattern } from "./CenterPattern";
import type { CenterPatternChoice } from "./centerSettings";
import type { PetMood } from "./patterns";
import { PetSprite } from "./PetSprite";

// The collapsed island is 38 px tall: drawings stay at 22 px, clear of its edges; a pet,
// detailed and mostly empty margin in its cell, reads better a little larger.
const PATTERN_HEIGHT = 22;
export const CENTER_PET_HEIGHT = 28;
/** Px the center needs: a drawing is at most about 44 px wide, a 28 px pet about 26. */
export const CENTER_PATTERN_WIDTH = 44;
export const CENTER_PET_WIDTH = 30;
/**
 * The pet in place of the 16 px agent icon: 18 px tall is about 16.6 px wide (192:208), so the
 * "MM" the collapsed width reserves for the icon still fits it.
 */
export const AGENT_ICON_PET_HEIGHT = 18;

/**
 * The collapsed island's center: the chosen drawing, or the pet from `sheet` (`usePetSheet`),
 * nothing while it loads and the eyes when it cannot be read.
 */
export function CollapsedCenter({
  choice,
  sheet,
  mood,
  paused,
}: {
  choice: CenterPatternChoice;
  sheet: string | null | undefined;
  mood: PetMood;
  paused: boolean;
}) {
  if (choice.pattern !== "pet") return <CenterPattern pattern={choice.pattern} paused={paused} height={PATTERN_HEIGHT} />;
  if (sheet === undefined) return null;
  if (sheet === null) return <CenterPattern pattern="eyes" paused={paused} height={PATTERN_HEIGHT} />;
  return <PetSprite src={sheet} mood={mood} paused={paused} height={CENTER_PET_HEIGHT} />;
}
