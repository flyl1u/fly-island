export type TranslationTarget = "window" | "island";

export type AppearanceMode = "classic" | "liquidGlass";
export type IslandFont = "system" | "pixel";
/** How the collapsed island opens: a click, or resting the pointer on it. */
export type ExpandTrigger = "click" | "hover";
/** What the expanded island's minimize button does: hide to the tray, or tuck to the top edge. */
export type MinimizeAction = "tray" | "tuck";
/** What double-clicking a file shelf entry does. */
export type ShelfDoubleClick = "open" | "reveal";

export type IslandSettings = {
  topEdgeLayoutVersion: 1;
  appearanceMode: AppearanceMode;
  fontFamily: IslandFont;
  glassIntensity: number;
  opacity: number;
  collapsedScale: number;
  expandedScale: number;
  marginY: number;
  /** Radius (px) of the concave corners drawn while the island is flush with the screen top. */
  topFilletRadius: number;
  /** Bottom corner radius (px) of the expanded island; the collapsed, detached and inner panel radii follow it. */
  islandCornerRadius: number;
  /** Tallest expanded panel (px) before the todo list, clipboard and messages scroll. */
  maxPanelHeight: number;
  /** Clipboard history rows the expanded clipboard page shows before it scrolls. */
  clipboardVisibleRows: number;
  /** Agent sessions the expanded Agent page shows before it scrolls. */
  agentVisibleRows: number;
  taskTextColor: string;
  pulseColor: string;
  pulseBrightness: number;
  islandBackgroundColor: string;
  todoBackgroundColor: string;
  showTitle: boolean;
  showCollapsedText: boolean;
  showIdleTodoCount: boolean;
  carryOverIncompleteTodos: boolean;
  enableTodoReorder: boolean;
  rotateTodos: boolean;
  todoRotationSeconds: number;
  autoTuck: boolean;
  autoTuckSeconds: number;
  /** An island tucked after idling slides back once the cursor that brought it out leaves. */
  autoTuckRetract: boolean;
  /** How long (ms) it waits after the cursor leaves before sliding back. */
  autoTuckRetractDelayMs: number;
  /** A tucked island slides back into view to show a new message preview. */
  revealOnMessage: boolean;
  expandTrigger: ExpandTrigger;
  /** Pointer rest time (ms) before a hover opens the island. */
  hoverExpandDelayMs: number;
  /** Time (ms) a hover-opened panel stays open after the pointer leaves it. */
  hoverCollapseDelayMs: number;
  minimizeAction: MinimizeAction;
  /** Modifiers held with 1–9 to open that page, left to right. The digits themselves stay fixed. */
  pageDigitModifiers: string;
  /** Shortcut for the next visible page while the island is expanded and focused. */
  pageNextShortcut: string;
  /** Shortcut for the previous visible page while the island is expanded and focused. */
  pagePreviousShortcut: string;
  /**
   * Module switches. Off hides the module on the island and stops its background work;
   * its data is kept. QQ, WeChat and clipboard history use their existing switches.
   */
  todoEnabled: boolean;
  musicEnabled: boolean;
  agentStatusEnabled: boolean;
  shelfEnabled: boolean;
  /** Off hides the island's translate button and releases the global translation shortcut. */
  translationEnabled: boolean;
  /** Where translation opens: its own window, or a page of the expanded island. */
  translationTarget: TranslationTarget;
  /** Dragging files onto a collapsed or tucked island opens the shelf as a drop zone. */
  shelfExpandOnDrop: boolean;
  /** Days after which shelf entries leave the list (0 keeps them). */
  shelfAutoCleanupDays: number;
  /** Entries whose file was moved or deleted leave the list instead of showing as missing. */
  shelfRemoveMissing: boolean;
  /** An entry leaves the list once it has been dragged out somewhere. */
  shelfRemoveAfterDragOut: boolean;
  shelfMaxItems: number;
  shelfDoubleClick: ShelfDoubleClick;
  /** The collapsed island shows how many files are on the shelf. */
  shelfShowCount: boolean;
  mailEnabled: boolean;
  /** Show the running agent's icon and session title on the collapsed island. */
  agentTitleEnabled: boolean;
  /** While a full-screen app (game, video, slides) is in front: no hover opening or focus, no message pop-ups. */
  gameDoNotDisturb: boolean;
  /** While a full-screen app is in front, the island tucks to the top edge and comes back after. */
  gameAutoTuck: boolean;
};

export type IslandPreset = {
  id: string;
  name: string;
  settings: IslandSettings;
  createdAt: number;
  isDefault?: boolean;
};

export type LegacyIslandSettings = Partial<IslandSettings> & {
  margin?: number;
  sizeScale?: number;
  taskTitleColor?: string;
  pendingTodoColor?: string;
};
