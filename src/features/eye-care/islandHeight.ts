// Eye Care's island page (EyeCareIslandPanel.css): the island's padding, header and gap (86)
// around the panel's padding (26); one card holding the head (18, plus 18 for a note line),
// 58px per row 4px apart, and the 28px button row 6px under the rows. A row with a deadline
// fills those 58px itself (30 for the value, 2, 15 for its label, 11 for the bar). A page
// without rows keeps room for its status line. Keep in step with the stylesheet.
const ISLAND_CHROME = 86;
const PANEL_PADDING = 26;
const CARD_PADDING = 25;
const CARD_GAP = 6;
const HEAD = 18;
const NOTE = 18;
const ROW = 58;
const ROW_GAP = 4;
const ACTIONS = 28;
const EMPTY = 110;

/** The island's height around Eye Care's page showing `rows` entries and its buttons. */
export function getEyeCareIslandHeight(rows: number, actions: number, note: boolean) {
  const head = HEAD + (note ? NOTE : 0);
  // Without rows the page is its status line in a plain block: no card, no buttons.
  if (rows === 0) return ISLAND_CHROME + PANEL_PADDING + head + CARD_GAP + EMPTY;
  const list = rows * ROW + (rows - 1) * ROW_GAP;
  const actionRow = actions > 0 ? CARD_GAP + ACTIONS : 0;
  return ISLAND_CHROME + PANEL_PADDING + CARD_PADDING + head + CARD_GAP + list + actionRow;
}
