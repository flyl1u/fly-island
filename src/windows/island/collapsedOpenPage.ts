import type { CollapsedItem } from "../../features/appearance/types";
import type { IslandPage } from "./types";

/**
 * The page a click on the collapsed island opens. A running agent it names opens the Agent
 * page; anything else (a lyric line, a todo) reopens the page that was open last. The music
 * page has its own hot zone, the waveform button, so a lyric line does not claim the click.
 */
export function collapsedOpenPage(
  item: CollapsedItem | null,
  namesAgent: boolean,
  lastPage: IslandPage,
): IslandPage {
  return item === "agent" && namesAgent ? "agents" : lastPage;
}
